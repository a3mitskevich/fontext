import { sfntTable, withTable } from "../font/sfnt";

/**
 * Copies the tables of the source the subset lacks into it: tables HarfBuzz drops although their
 * data refers to no glyph id (meta, PCLT), so the copy describes the subset as well. Tables the
 * source lacks or the subset has stay as they are.
 */
export function keepSourceTables(
  source: Uint8Array,
  subset: Uint8Array,
  tags: readonly string[],
): Uint8Array {
  return tags.reduce((font, tag) => {
    const table = sfntTable(source, tag);
    return table && !sfntTable(font, tag) ? withTable(font, tag, table) : font;
  }, subset);
}
