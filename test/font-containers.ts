const SFNT_HEADER_SIZE = 12;
const TABLE_RECORD_SIZE = 16;
const TTC_HEADER_SIZE = 16;
const RESOURCE_DATA_OFFSET = 256;
const RESOURCE_TYPE_LIST_OFFSET = 28;
const RESOURCE_MAP_SIZE = RESOURCE_TYPE_LIST_OFFSET + 2 + 8 + 12;
const SFNT_RESOURCE_ID = 128;

const recordAt = (index: number): number => SFNT_HEADER_SIZE + index * TABLE_RECORD_SIZE;

/** Moves every table offset of an sfnt font by `delta`, for fonts embedded at that offset. */
function shiftTableOffsets(font: Buffer, delta: number): Buffer {
  const shifted = Buffer.from(font);
  for (let index = 0; index < font.readUInt16BE(4); index++) {
    const offsetAt = recordAt(index) + 8;
    shifted.writeUInt32BE(font.readUInt32BE(offsetAt) + delta, offsetAt);
  }
  return shifted;
}

/** A TrueType collection (TTC 1.0) holding one font. */
export function toCollection(font: Buffer): Buffer {
  const header = Buffer.alloc(TTC_HEADER_SIZE);
  header.write("ttcf", 0, "latin1");
  header.writeUInt16BE(1, 4);
  header.writeUInt32BE(1, 8);
  header.writeUInt32BE(TTC_HEADER_SIZE, 12);
  return Buffer.concat([header, shiftTableOffsets(font, TTC_HEADER_SIZE)]);
}

/** A Mac resource fork (DFONT) with the font as its only `sfnt` resource. */
export function toResourceFork(font: Buffer): Buffer {
  const data = Buffer.alloc(4 + font.length);
  data.writeUInt32BE(font.length, 0);
  font.copy(data, 4);

  const header = Buffer.alloc(RESOURCE_DATA_OFFSET);
  header.writeUInt32BE(RESOURCE_DATA_OFFSET, 0);
  header.writeUInt32BE(RESOURCE_DATA_OFFSET + data.length, 4);
  header.writeUInt32BE(data.length, 8);
  header.writeUInt32BE(RESOURCE_MAP_SIZE, 12);

  // The map repeats the header, then points to its type list and to an empty name list
  const map = Buffer.alloc(RESOURCE_MAP_SIZE);
  header.copy(map, 0, 0, 16);
  map.writeUInt16BE(RESOURCE_TYPE_LIST_OFFSET, 24);
  map.writeUInt16BE(RESOURCE_MAP_SIZE, 26);
  // One type with one resource; its reference list follows the type entry
  map.writeUInt16BE(0, 28);
  map.write("sfnt", 30, "latin1");
  map.writeUInt16BE(0, 34);
  map.writeUInt16BE(2 + 8, 36);
  map.writeUInt16BE(SFNT_RESOURCE_ID, 38);
  map.writeUInt16BE(0xff_ff, 40);
  return Buffer.concat([header, data, map]);
}

/** Copies the font with the table directory cutting `bytes` off the end of the `tag` table. */
export function withTruncatedTable(font: Buffer, tag: string, bytes: number): Buffer {
  const index = Array.from({ length: font.readUInt16BE(4) }, (_, position) => position).find(
    (position) => font.toString("latin1", recordAt(position), recordAt(position) + 4) === tag,
  );
  if (index === undefined) {
    throw new Error(`Font has no ${tag} table`);
  }
  const lengthAt = recordAt(index) + 12;
  const copy = Buffer.from(font);
  copy.writeUInt32BE(font.readUInt32BE(lengthAt) - bytes, lengthAt);
  return copy;
}
