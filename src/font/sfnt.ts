import { createReader, type BinaryReader } from "./reader";

export interface SfntTable {
  tag: number;
  checksum: number;
  data: Uint8Array;
}

const SFNT_HEADER_SIZE = 12;
const SFNT_TABLE_RECORD_SIZE = 16;
const HEAD_CHECKSUM_ADJUSTMENT = 8;
const CHECKSUM_MAGIC = 0xb1_b0_af_ba;
const UINT32_RANGE = 2 ** 32;
const HEAD = "head";

const padded = (length: number): number => Math.ceil(length / 4) * 4;

/** A four-character table tag as the uint32 the table directory stores. */
export const tagNumber = (tag: string): number =>
  [...tag].reduce((value, char) => value * 256 + (char.codePointAt(0) ?? 0), 0);

/** The uint32 sum of the data as big-endian words, zero-padded to a multiple of four bytes. */
export function tableChecksum(data: Uint8Array): number {
  const words = new Uint8Array(padded(data.length));
  words.set(data);
  const view = new DataView(words.buffer);
  let sum = 0;
  for (let offset = 0; offset < words.length; offset += 4) {
    sum = (sum + view.getUint32(offset)) % UINT32_RANGE;
  }
  return sum;
}

/** Offsets of the table records of an uncompressed font. */
const tableRecords = (reader: BinaryReader): number[] =>
  Array.from(
    { length: reader.uint16(4) },
    (_, index) => SFNT_HEADER_SIZE + index * SFNT_TABLE_RECORD_SIZE,
  );

const recordData = (reader: BinaryReader, record: number): Uint8Array =>
  reader.bytes(reader.uint32(record + 8), reader.uint32(record + 12));

/** The sfnt version and the tables of an uncompressed font, in directory order. */
export function readSfnt(sfnt: Uint8Array): { flavor: number; tables: SfntTable[] } {
  const reader = createReader(sfnt, "font");
  const tables = tableRecords(reader).map((record) => ({
    tag: reader.uint32(record),
    checksum: reader.uint32(record + 4),
    data: recordData(reader, record),
  }));
  return { flavor: reader.uint32(0), tables };
}

/**
 * The data of a table of an uncompressed font, or undefined when the font has none. Only its own
 * record is read, so a broken record of another table, which HarfBuzz tolerates, does not fail it.
 */
export function sfntTable(sfnt: Uint8Array, tag: string): Uint8Array | undefined {
  const reader = createReader(sfnt, "font");
  const tagValue = tagNumber(tag);
  const record = tableRecords(reader).find((offset) => reader.uint32(offset) === tagValue);
  return record === undefined ? undefined : recordData(reader, record);
}

/** Packs tables into an sfnt with the given version; tables keep their order and checksums. */
export function packSfnt(flavor: number, tables: SfntTable[]): Uint8Array {
  const directorySize = SFNT_HEADER_SIZE + tables.length * SFNT_TABLE_RECORD_SIZE;
  const offsets = tables.reduce<number[]>(
    (acc, table, index) => [...acc, acc[index] + padded(table.data.length)],
    [directorySize],
  );
  const out = new Uint8Array(offsets[tables.length]);
  const view = new DataView(out.buffer);
  const entrySelector = Math.floor(Math.log2(Math.max(tables.length, 1)));
  const searchRange = 2 ** entrySelector * SFNT_TABLE_RECORD_SIZE;

  view.setUint32(0, flavor);
  view.setUint16(4, tables.length);
  view.setUint16(6, searchRange);
  view.setUint16(8, entrySelector);
  view.setUint16(10, tables.length * SFNT_TABLE_RECORD_SIZE - searchRange);
  tables.forEach(({ tag, checksum, data }, index) => {
    const record = SFNT_HEADER_SIZE + index * SFNT_TABLE_RECORD_SIZE;
    view.setUint32(record, tag);
    view.setUint32(record + 4, checksum);
    view.setUint32(record + 8, offsets[index]);
    view.setUint32(record + 12, data.length);
    out.set(data, offsets[index]);
  });
  return out;
}

/** A copy of the head table with checkSumAdjustment zeroed, as its checksum is defined. */
function withoutChecksumAdjustment(head: Uint8Array): Uint8Array {
  // The constructor copies; slice() of a Node Buffer is a view on the same memory
  const copy = new Uint8Array(head);
  new DataView(copy.buffer).setUint32(HEAD_CHECKSUM_ADJUSTMENT, 0);
  return copy;
}

/**
 * A copy of the font with the table added, or replaced when the font has one. Tables stay sorted
 * by tag as the spec requires, and head.checkSumAdjustment is recomputed for the new font.
 */
export function withTable(sfnt: Uint8Array, tag: string, data: Uint8Array): Uint8Array {
  const { flavor, tables } = readSfnt(sfnt);
  const tagValue = tagNumber(tag);
  const headTag = tagNumber(HEAD);
  const next = [
    ...tables.filter((table) => table.tag !== tagValue),
    { tag: tagValue, checksum: tableChecksum(data), data },
  ]
    .map(({ tag: tableTag, checksum, data: tableData }) => ({
      tag: tableTag,
      checksum,
      data: tableTag === headTag ? withoutChecksumAdjustment(tableData) : tableData,
    }))
    .toSorted((a, b) => a.tag - b.tag);
  const font = packSfnt(flavor, next);
  const headIndex = next.findIndex((table) => table.tag === headTag);
  if (headIndex !== -1) {
    const view = new DataView(font.buffer);
    const headOffset = view.getUint32(SFNT_HEADER_SIZE + headIndex * SFNT_TABLE_RECORD_SIZE + 8);
    const adjustment = (CHECKSUM_MAGIC - tableChecksum(font) + UINT32_RANGE) % UINT32_RANGE;
    view.setUint32(headOffset + HEAD_CHECKSUM_ADJUSTMENT, adjustment);
  }
  return font;
}
