/**
 * A minimal big-endian writer for OpenType tables and the sfnt container, used to build test
 * fixtures that font libraries can't write.
 *
 * A struct is a list of fields written in order. Offset fields point to blobs that are appended
 * after the fields, and the offset is relative to the start of the struct, as in OpenType.
 */

const TRUETYPE_VERSION = 0x1_00_00;
const SFNT_HEADER_SIZE = 12;
const TABLE_RECORD_SIZE = 16;
const HEAD_CHECKSUM_ADJUSTMENT = 8;
const CHECKSUM_MAGIC = 0xb1_b0_af_ba;
const UINT32_RANGE = 2 ** 32;

export const u8 = (value) => ({ size: 1, write: (view, at) => view.setUint8(at, value) });
export const u16 = (value) => ({ size: 2, write: (view, at) => view.setUint16(at, value) });
export const i16 = (value) => ({ size: 2, write: (view, at) => view.setInt16(at, value) });
export const u32 = (value) => ({ size: 4, write: (view, at) => view.setUint32(at, value) });
export const i64 = (value) => [u32(Math.floor(value / UINT32_RANGE)), u32(value % UINT32_RANGE)];

export const u16s = (values) => values.map((value) => u16(value));
export const i16s = (values) => values.map((value) => i16(value));
export const u32s = (values) => values.map((value) => u32(value));
export const zeros = (field, count) => Array.from({ length: count }, () => field(0));

export const tag = (text) => [...text].map((char) => u8(char.codePointAt(0)));
export const bytes = (data) => ({
  size: data.length,
  write: (view, at) => new Uint8Array(view.buffer).set(data, at),
});
export const off16 = (blob) => ({
  size: 2,
  blob,
  write: (view, at, offset) => view.setUint16(at, offset),
});
export const off32 = (blob) => ({
  size: 4,
  blob,
  write: (view, at, offset) => view.setUint32(at, offset),
});

export const sizeOf = (fields) => fields.flat(Infinity).reduce((sum, field) => sum + field.size, 0);

/** Running totals: `start`, then `start` plus each length in turn. */
export function offsetsOf(lengths, start = 0) {
  const offsets = [start];
  for (const length of lengths) {
    offsets.push(offsets.at(-1) + length);
  }
  return offsets;
}

export function struct(...fields) {
  const flat = fields.flat(Infinity);
  const headerSize = sizeOf(flat);
  const blobs = flat.filter((field) => field.blob).map((field) => field.blob);
  const out = new Uint8Array(headerSize + sizeOf(blobs.map((blob) => bytes(blob))));
  const view = new DataView(out.buffer);
  let at = 0;
  let blobAt = headerSize;
  for (const field of flat) {
    field.write(view, at, blobAt);
    if (field.blob) {
      out.set(field.blob, blobAt);
      blobAt += field.blob.length;
    }
    at += field.size;
  }
  return out;
}

function pad4(data) {
  const padded = new Uint8Array(Math.ceil(data.length / 4) * 4);
  padded.set(data);
  return padded;
}

function checksum(data) {
  const view = new DataView(pad4(data).buffer);
  let sum = 0;
  for (let at = 0; at < view.byteLength; at += 4) {
    sum = (sum + view.getUint32(at)) >>> 0;
  }
  return sum;
}

/** Packs tables into a TrueType font and sets head.checkSumAdjustment. */
export function sfnt(tables) {
  const tags = Object.keys(tables).toSorted();
  const padded = tags.map((tableTag) => pad4(tables[tableTag]));
  const entrySelector = Math.floor(Math.log2(tags.length));
  const searchRange = 2 ** entrySelector * TABLE_RECORD_SIZE;
  const offsets = offsetsOf(
    padded.map((data) => data.length),
    SFNT_HEADER_SIZE + tags.length * TABLE_RECORD_SIZE,
  );
  const records = tags.map((tableTag, index) => [
    tag(tableTag),
    u32s([checksum(tables[tableTag]), offsets[index], tables[tableTag].length]),
  ]);
  const font = struct(
    u32(TRUETYPE_VERSION),
    u16s([tags.length, searchRange, entrySelector, tags.length * TABLE_RECORD_SIZE - searchRange]),
    records,
    padded.map((data) => bytes(data)),
  );
  const adjustmentAt = offsets[tags.indexOf("head")] + HEAD_CHECKSUM_ADJUSTMENT;
  new DataView(font.buffer).setUint32(adjustmentAt, (CHECKSUM_MAGIC - checksum(font)) >>> 0);
  return font;
}
