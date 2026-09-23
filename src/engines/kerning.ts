import { openFont } from "../font/font";
import { hasGposKern, subsetKern } from "../font/kern";
import { sfntTable, withTable } from "../font/sfnt";

/** Old glyph id → new glyph id of the glyphs both fonts map a code point to. */
async function glyphMapThroughCmap(
  source: Uint8Array,
  subset: Uint8Array,
): Promise<Map<number, number>> {
  const [from, to] = await Promise.all([openFont(source), openFont(subset)]);
  return new Map(
    to.codePoints.flatMap((codePoint): [number, number][] => {
      const oldGlyph = from.glyphForCodePoint(codePoint);
      const newGlyph = to.glyphForCodePoint(codePoint);
      return oldGlyph === undefined || newGlyph === undefined ? [] : [[oldGlyph, newGlyph]];
    }),
  );
}

/**
 * HarfBuzz drops the legacy kern table when it subsets, because it can't renumber its glyphs.
 * This puts back the pairs of the glyphs the subset kept and nothing else. Glyphs are matched
 * through the cmap, so pairs of glyphs only GSUB reaches are not kept. Fonts whose GPOS has a
 * kern feature don't get the table back: shapers ignore it there. A kern table that can't be read
 * is left out, as HarfBuzz leaves it.
 */
export async function restoreKerning(source: Uint8Array, subset: Uint8Array): Promise<Uint8Array> {
  const kern = sfntTable(source, "kern");
  if (!kern || hasGposKern(sfntTable(source, "GPOS"))) {
    return subset;
  }
  const glyphMap = await glyphMapThroughCmap(source, subset);
  let table: Uint8Array | undefined;
  try {
    table = subsetKern(kern, glyphMap);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Malformed kern table")) {
      return subset;
    }
    throw error;
  }
  return table ? withTable(subset, "kern", table) : subset;
}
