import type { FontWarning } from "../types";
import { openFont } from "../font/font";
import { type GlyphMatch, hasGposKern, type KernLoss, subsetKern } from "../font/kern";
import { MalformedFontError } from "../font/reader";
import { sfntTable, withTable } from "../font/sfnt";
import { glyphCount } from "../font/tables";

/** A subset font with the legacy kerning it could keep, and warnings about what it could not. */
export interface KernedFont {
  readonly font: Uint8Array;
  readonly warnings: FontWarning[];
}

type Anchor = readonly [oldGlyph: number, newGlyph: number];

const range = (from: number, to: number): number[] =>
  Array.from({ length: Math.max(to - from, 0) }, (_, index) => from + index);

/**
 * Old glyph id → new glyph id. hb-subset numbers the glyphs it keeps in their old order, so
 * between two glyphs matched through the cmap the rest are known when the subset kept all of them
 * or none. When it kept some of them, they are unmatched. When the cmap matches break the order,
 * they are all that is trusted.
 */
export function matchGlyphs(
  coded: ReadonlyMap<number, number>,
  oldCount: number,
  newCount: number,
): GlyphMatch {
  const anchors: Anchor[] = [
    [0, 0],
    ...[...coded].filter(([oldGlyph]) => oldGlyph !== 0).toSorted(([a], [b]) => a - b),
    [oldCount, newCount],
  ];
  const isOrdered = anchors.every(
    ([oldGlyph, newGlyph], index) =>
      index === 0 || (oldGlyph > anchors[index - 1][0] && newGlyph > anchors[index - 1][1]),
  );
  if (!isOrdered) {
    return { map: coded, unmatched: new Set(range(1, oldCount).filter((g) => !coded.has(g))) };
  }
  const gaps = anchors.slice(1).map((end, index) => ({
    start: anchors[index],
    oldGlyphs: range(anchors[index][0] + 1, end[0]),
    newSize: end[1] - anchors[index][1] - 1,
  }));
  const renumbered = gaps
    .filter(({ oldGlyphs, newSize }) => newSize === oldGlyphs.length)
    .flatMap(({ start: [oldStart, newStart], oldGlyphs }) =>
      oldGlyphs.map((glyph): Anchor => [glyph, glyph - oldStart + newStart]),
    );
  const unmatched = gaps
    .filter(({ oldGlyphs, newSize }) => newSize > 0 && newSize !== oldGlyphs.length)
    .flatMap(({ oldGlyphs }) => oldGlyphs);
  return { map: new Map([[0, 0], ...coded, ...renumbered]), unmatched: new Set(unmatched) };
}

function requiredTable(sfnt: Uint8Array, tag: string): Uint8Array {
  const table = sfntTable(sfnt, tag);
  if (!table) {
    throw new MalformedFontError(`Malformed font: it has no ${tag} table`);
  }
  return table;
}

async function matchSubsetGlyphs(source: Uint8Array, subset: Uint8Array): Promise<GlyphMatch> {
  const [from, to] = await Promise.all([openFont(source), openFont(subset)]);
  const coded = new Map(
    to.codePoints.flatMap((codePoint): Anchor[] => {
      const oldGlyph = from.glyphForCodePoint(codePoint);
      const newGlyph = to.glyphForCodePoint(codePoint);
      return oldGlyph === undefined || newGlyph === undefined ? [] : [[oldGlyph, newGlyph]];
    }),
  );
  return matchGlyphs(
    coded,
    glyphCount(requiredTable(source, "maxp")),
    glyphCount(requiredTable(subset, "maxp")),
  );
}

const count = (value: number, noun: string): string => `${value} ${noun}${value === 1 ? "" : "s"}`;

/** What was left out, or an empty string when nothing was. */
function lossDescription({ isApple, skippedSubtables, unmatchedPairs }: KernLoss): string {
  if (isApple) {
    return "it is an Apple kern table (version 1), which is not read, so it was left out";
  }
  const parts = [
    ...(skippedSubtables > 0
      ? [
          `${count(skippedSubtables, "subtable")} of format 2 or 3, cross-stream or vertical kerning`,
        ]
      : []),
    ...(unmatchedPairs > 0
      ? [
          `${count(unmatchedPairs, "pair")} of glyphs without a code point that could not be matched`,
        ]
      : []),
  ];
  return parts.length === 0 ? "" : `part of it was left out: ${parts.join("; ")}`;
}

const legacyKernWarning = (description: string): FontWarning => ({
  code: "legacy-kern",
  message:
    `The font kerns in the legacy kern table, and ${description}. ` +
    "A version of the font with kerning in GPOS avoids this.",
});

async function keepKerning(source: Uint8Array, subset: Uint8Array): Promise<KernedFont> {
  const kern = sfntTable(source, "kern");
  if (!kern || hasGposKern(sfntTable(source, "GPOS"))) {
    return { font: subset, warnings: [] };
  }
  const kept = subsetKern(kern, await matchSubsetGlyphs(source, subset));
  const description = lossDescription(kept.loss);
  return {
    font: kept.table ? withTable(subset, "kern", kept.table) : subset,
    warnings: description ? [legacyKernWarning(description)] : [],
  };
}

/**
 * HarfBuzz drops the legacy kern table when it subsets, because it can't renumber its glyphs.
 * This puts back the pairs of the glyphs the subset kept and warns about the kerning it can't
 * carry over. Fonts whose GPOS has a kern feature don't get the table back: shapers ignore it
 * there. When the source can't be read for it, the subset stays as HarfBuzz made it.
 */
export async function restoreKerning(source: Uint8Array, subset: Uint8Array): Promise<KernedFont> {
  try {
    return await keepKerning(source, subset);
  } catch (error) {
    if (error instanceof MalformedFontError) {
      return { font: subset, warnings: [legacyKernWarning(`it was left out: ${error.message}`)] };
    }
    throw error;
  }
}
