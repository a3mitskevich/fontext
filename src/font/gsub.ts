import { createReader, type BinaryReader } from "./reader";

/** A GSUB ligature: the glyph sequence `components` (first glyph included) becomes `glyph`. */
export interface LigatureRecord {
  readonly glyph: number;
  readonly components: readonly number[];
}

// GSUB lookup types: https://learn.microsoft.com/typography/opentype/spec/gsub
const LIGATURE_LOOKUP = 4;
const EXTENSION_LOOKUP = 7;
const LOOKUP_LIST_OFFSET = 8;

function coverageGlyphs(reader: BinaryReader, offset: number): number[] {
  const format = reader.uint16(offset);
  const count = reader.uint16(offset + 2);
  if (format === 1) {
    return Array.from({ length: count }, (_, index) => reader.uint16(offset + 4 + index * 2));
  }
  if (format === 2) {
    return Array.from({ length: count }, (_, index) => {
      const start = reader.uint16(offset + 4 + index * 6);
      const end = reader.uint16(offset + 6 + index * 6);
      if (end < start) {
        throw new Error(`Malformed GSUB table: coverage range ${start}-${end} at offset ${offset}`);
      }
      return Array.from({ length: end - start + 1 }, (_unused, position) => start + position);
    }).flat();
  }
  throw new Error(`Malformed GSUB table: unknown coverage format ${format} at offset ${offset}`);
}

function ligature(reader: BinaryReader, offset: number, first: number): LigatureRecord {
  const componentCount = reader.uint16(offset + 2);
  const rest = Array.from({ length: Math.max(componentCount - 1, 0) }, (_, index) =>
    reader.uint16(offset + 4 + index * 2),
  );
  return { glyph: reader.uint16(offset), components: [first, ...rest] };
}

/** LigatureSubstFormat1: ligature set N holds the ligatures starting with coverage glyph N. */
function ligatureSubst(reader: BinaryReader, offset: number): LigatureRecord[] {
  const format = reader.uint16(offset);
  if (format !== 1) {
    throw new Error(
      `Malformed GSUB table: unknown ligature substitution format ${format} at offset ${offset}`,
    );
  }
  const coverage = coverageGlyphs(reader, offset + reader.uint16(offset + 2));
  const setCount = reader.uint16(offset + 4);
  if (setCount > coverage.length) {
    throw new Error(
      `Malformed GSUB table: ${setCount} ligature sets for ${coverage.length} coverage glyphs at offset ${offset}`,
    );
  }
  return Array.from({ length: setCount }, (_, setIndex) => {
    const set = offset + reader.uint16(offset + 6 + setIndex * 2);
    return Array.from({ length: reader.uint16(set) }, (_unused, index) =>
      ligature(reader, set + reader.uint16(set + 2 + index * 2), coverage[setIndex]),
    );
  }).flat();
}

/** Offsets of the ligature subtables of a lookup, unwrapping extension subtables. */
function ligatureSubtables(reader: BinaryReader, lookup: number): number[] {
  const type = reader.uint16(lookup);
  const subtables = Array.from(
    { length: reader.uint16(lookup + 4) },
    (_, index) => lookup + reader.uint16(lookup + 6 + index * 2),
  );
  if (type === LIGATURE_LOOKUP) {
    return subtables;
  }
  if (type !== EXTENSION_LOOKUP) {
    return [];
  }
  return subtables.flatMap((subtable) =>
    reader.uint16(subtable + 2) === LIGATURE_LOOKUP ? [subtable + reader.uint32(subtable + 4)] : [],
  );
}

/**
 * Every ligature of every GSUB ligature lookup (type 4, or type 7 wrapping type 4), in lookup
 * order. Whether a feature of the default layout reaches a ligature is up to the caller.
 */
export function readLigatures(gsub: Uint8Array | undefined): LigatureRecord[] {
  if (!gsub) {
    return [];
  }
  const reader = createReader(gsub, "GSUB table");
  const lookupList = reader.uint16(LOOKUP_LIST_OFFSET);
  // A zero offset is a NULL offset: the table has no lookups
  if (lookupList === 0) {
    return [];
  }
  const lookups = Array.from(
    { length: reader.uint16(lookupList) },
    (_, index) => lookupList + reader.uint16(lookupList + 2 + index * 2),
  );
  return lookups
    .flatMap((lookup) => ligatureSubtables(reader, lookup))
    .flatMap((subtable) => ligatureSubst(reader, subtable));
}
