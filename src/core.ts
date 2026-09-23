import { type Font, type Glyph, type Ligature, type Lookup, type SubTable } from "fontkit";
import type { GlyphMeta } from "./types";

const DEFAULT_FONT_SIZE = 1000;
const WHITESPACE = " ";
// GSUB lookup types: https://learn.microsoft.com/typography/opentype/spec/gsub
const LIGATURE_LOOKUP = 4;
const EXTENSION_LOOKUP = 7;

function renderSvg(svgPath: string, width: number, height: number): string {
  return `<svg viewBox="0 -${height} ${width} ${height}" xmlns="http://www.w3.org/2000/svg">\n  <path d="${svgPath}" />\n</svg>`;
}

export function codePointsToString(symbols: number[]): string {
  return symbols.map((symbol) => String.fromCodePoint(symbol)).join("");
}

function toSvg(glyph: Glyph): string {
  const svgPath = glyph.path.scale(-1, 1).rotate(Math.PI).toSVG();
  const width = glyph.advanceWidth ?? DEFAULT_FONT_SIZE;
  const height = glyph.advanceHeight ?? DEFAULT_FONT_SIZE;
  return renderSvg(svgPath, width, height);
}

function glyphToMeta(font: Font, glyph: Glyph): GlyphMeta {
  return {
    name: codePointsToString(glyph.codePoints),
    unicode: font.stringsForGlyph(glyph.id),
    svg: toSvg(glyph),
  };
}

export function parseUnicodeRanges(ranges: string[]): number[] {
  const codePoints: number[] = [];
  for (const range of ranges) {
    const match = range.match(/^U\+(?<start>[0-9A-Fa-f]+)(?:-U?\+?(?<end>[0-9A-Fa-f]+))?$/u);
    if (!match?.groups) {
      throw new Error(
        `Invalid unicode range: "${range}". Expected format: U+XXXX or U+XXXX-U+XXXX`,
      );
    }
    const start = parseInt(match.groups.start, 16);
    const end = match.groups.end ? parseInt(match.groups.end, 16) : start;
    if (start > 0x10_ff_ff || end > 0x10_ff_ff) {
      throw new Error(`Invalid unicode range: "${range}". Codepoint exceeds U+10FFFF`);
    }
    if (end < start) {
      throw new Error(`Invalid unicode range: "${range}". End must be >= start`);
    }
    for (let cp = start; cp <= end; cp++) {
      codePoints.push(cp);
    }
  }
  return codePoints;
}

export function findMetaByCodePoints(font: Font, codePoints: number[]): GlyphMeta[] {
  const glyphs: Glyph[] = [];
  for (const cp of codePoints) {
    const glyph = font.glyphForCodePoint(cp);
    if (glyph && glyph.id !== 0) {
      glyphs.push(glyph);
    }
  }
  const unique = Array.from(new Map(glyphs.map((g) => [g.id, g])).values());
  return unique.map((glyph) => glyphToMeta(font, glyph));
}

export function findMetaByLigatures(
  font: Font,
  ligatures: string[],
  withWhitespace = false,
): GlyphMeta[] {
  if (ligatures.length === 0) {
    return [];
  }

  const [whitespaceGlyph] = font.glyphsForString(WHITESPACE);
  const layout = font.layout(ligatures.join(WHITESPACE));
  const glyphs = Array.from<Glyph>(new Set(layout.glyphs)).filter(
    (glyph) => withWhitespace || glyph.id !== whitespaceGlyph?.id,
  );
  return glyphs.map((glyph) => glyphToMeta(font, glyph));
}

interface LigatureMeta {
  ligature: Ligature;
  leading: string;
}

/** Ligature subtables of every GSUB lookup, including ones wrapped in extension lookups. */
function ligatureSubTables(font: Font): SubTable[] {
  const lookups = font.GSUB?.lookupList.toArray() ?? [];
  return lookups.flatMap((lookup: Lookup) => {
    if (lookup.lookupType === LIGATURE_LOOKUP) {
      return lookup.subTables;
    }
    if (lookup.lookupType === EXTENSION_LOOKUP) {
      return lookup.subTables.flatMap((subTable) =>
        subTable.lookupType === LIGATURE_LOOKUP && subTable.extension ? [subTable.extension] : [],
      );
    }
    return [];
  });
}

function leadingCharsOf(font: Font, { coverage: { glyphs, rangeRecords } }: SubTable): string[] {
  return rangeRecords
    ? rangeRecords.flatMap(({ start, end }) =>
        Array.from({ length: end - start + 1 }, (_, position) => position + start).map(
          (item) => font.stringsForGlyph(item)?.[0] ?? "",
        ),
      )
    : glyphs.map((id) => font.stringsForGlyph(id).join(""));
}

function ligatureEntries(font: Font, subTable: SubTable): [number, LigatureMeta][] {
  const leadingChars = leadingCharsOf(font, subTable);
  return subTable.ligatureSets
    .toArray()
    .flatMap((ligatures, index) =>
      ligatures.map((ligature): [number, LigatureMeta] => [
        ligature.glyph,
        { ligature, leading: leadingChars[index] },
      ]),
    );
}

export function resolveLigatures(font: Font, raws: string[]): string[] {
  if (raws.length === 0) {
    return [];
  }

  const subTables = ligatureSubTables(font);
  if (subTables.length === 0) {
    throw new Error("Font does not contain a GSUB ligature lookup table");
  }

  const map = new Map<number, LigatureMeta[]>();
  for (const [id, meta] of subTables.flatMap((subTable) => ligatureEntries(font, subTable))) {
    map.set(id, [...(map.get(id) ?? []), meta]);
  }

  return raws.flatMap((raw) => {
    const glyphResult = font.glyphsForString(raw);
    if (glyphResult.length === 0) {
      throw new Error(`Font does not contain a glyph for "${raw}"`);
    }
    const glyph = glyphResult[0];
    const texts = (map.get(glyph.id) ?? []).map(({ ligature, leading }) =>
      [leading, ...ligature.components.map((code) => font.stringsForGlyph(code)?.[0] ?? "")].join(
        "",
      ),
    );
    const forming = [...new Set(texts)].filter((text) => formsGlyph(font, text, glyph.id));
    if (forming.length === 0) {
      throw new Error(`Font does not contain a ligature for "${raw}"`);
    }
    return forming;
  });
}

/**
 * Whether the default layout turns `text` into `glyphId`. Lookups of features that are off by
 * default (`dlig`, `hlig`) or reached only from contextual lookups don't form the ligature, and
 * the icon engine would ship their component glyphs instead.
 */
function formsGlyph(font: Font, text: string, glyphId: number): boolean {
  const { glyphs } = font.layout(text);
  return glyphs.length === 1 && glyphs[0].id === glyphId;
}
