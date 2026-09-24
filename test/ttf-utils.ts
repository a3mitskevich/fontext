export function findTable(ttf: Buffer, tag: string): { offset: number; length: number } | null {
  const numTables = ttf.readUInt16BE(4);
  for (let i = 0; i < numTables; i++) {
    const entryOffset = 12 + i * 16;
    const tableTag = ttf.toString("ascii", entryOffset, entryOffset + 4);
    if (tableTag === tag) {
      return {
        offset: ttf.readUInt32BE(entryOffset + 8),
        length: ttf.readUInt32BE(entryOffset + 12),
      };
    }
  }
  return null;
}

const KERN_HEADER_SIZE = 4;
const KERN_SUBTABLE_HEADER_SIZE = 14;
const KERN_PAIR_SIZE = 6;

export type KernTuple = [left: number, right: number, value: number];

const u16 = (value: number): number[] => [(value >> 8) & 0xff, value & 0xff];

/** A version 0 kern table; the pairs of every subtable are written as format 0. */
export function kernTable(subtables: { coverage: number; pairs: KernTuple[] }[]): Uint8Array {
  const body = subtables.flatMap(({ coverage, pairs }) => [
    ...u16(0),
    ...u16(KERN_SUBTABLE_HEADER_SIZE + pairs.length * KERN_PAIR_SIZE),
    ...u16(coverage),
    ...u16(pairs.length),
    ...u16(0),
    ...u16(0),
    ...u16(0),
    ...pairs.flatMap(([left, right, value]) => [...u16(left), ...u16(right), ...u16(value)]),
  ]);
  return new Uint8Array([...u16(0), ...u16(subtables.length), ...body]);
}

/** Pairs of every format 0 subtable of a version 0 kern table as [left, right, value]. */
export function readKernPairs(font: Uint8Array): KernTuple[] {
  const ttf = Buffer.from(font.buffer, font.byteOffset, font.byteLength);
  const table = findTable(ttf, "kern");
  if (!table) {
    return [];
  }
  const pairs: KernTuple[] = [];
  let subtable = table.offset + KERN_HEADER_SIZE;
  for (let index = 0; index < ttf.readUInt16BE(table.offset + 2); index++) {
    const count = ttf.readUInt16BE(subtable + 6);
    for (let pair = 0; pair < count; pair++) {
      const at = subtable + KERN_SUBTABLE_HEADER_SIZE + pair * KERN_PAIR_SIZE;
      pairs.push([ttf.readUInt16BE(at), ttf.readUInt16BE(at + 2), ttf.readInt16BE(at + 4)]);
    }
    subtable += KERN_SUBTABLE_HEADER_SIZE + count * KERN_PAIR_SIZE;
  }
  return pairs;
}

const SFNT_HEADER_SIZE = 12;
const SFNT_TABLE_RECORD_SIZE = 16;

/**
 * A copy of the font whose `tag` table record points past its end, as in a truncated file. A
 * record is appended when the font has none, so `tag` must sort after every other tag.
 */
export function withRecordPastEnd(font: Uint8Array, tag: string): Buffer {
  const ttf = Buffer.from(font);
  const count = ttf.readUInt16BE(4);
  const recordOf = (index: number) => SFNT_HEADER_SIZE + index * SFNT_TABLE_RECORD_SIZE;
  const existing = Array.from({ length: count }, (_, index) => recordOf(index)).find(
    (record) => ttf.toString("ascii", record, record + 4) === tag,
  );
  if (existing !== undefined) {
    ttf.writeUInt32BE(ttf.length + 4, existing + 8);
    return ttf;
  }
  const directoryEnd = recordOf(count);
  const out = Buffer.concat([
    ttf.subarray(0, directoryEnd),
    Buffer.alloc(SFNT_TABLE_RECORD_SIZE),
    ttf.subarray(directoryEnd),
  ]);
  out.writeUInt16BE(count + 1, 4);
  for (let index = 0; index < count; index++) {
    const offset = recordOf(index) + 8;
    out.writeUInt32BE(out.readUInt32BE(offset) + SFNT_TABLE_RECORD_SIZE, offset);
  }
  out.write(tag, directoryEnd, "ascii");
  out.writeUInt32BE(out.length + 4, directoryEnd + 8);
  out.writeUInt32BE(4, directoryEnd + 12);
  return out;
}

export function readOS2(ttf: Buffer) {
  const table = findTable(ttf, "OS/2");
  if (!table) {
    throw new Error("OS/2 table not found");
  }
  const t = table.offset;
  return {
    version: ttf.readUInt16BE(t),
    fsType: ttf.readInt16BE(t + 8),
    fsSelection: ttf.readUInt16BE(t + 62),
    sTypoAscender: ttf.readInt16BE(t + 68),
    sTypoDescender: ttf.readInt16BE(t + 70),
    sTypoLineGap: ttf.readInt16BE(t + 72),
  };
}

export function readHhea(ttf: Buffer) {
  const table = findTable(ttf, "hhea");
  if (!table) {
    throw new Error("hhea table not found");
  }
  const t = table.offset;
  return {
    ascent: ttf.readInt16BE(t + 4),
    descent: ttf.readInt16BE(t + 6),
    lineGap: ttf.readInt16BE(t + 8),
  };
}
