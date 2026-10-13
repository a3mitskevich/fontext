import { createReader, type BinaryReader } from "./reader";

/** A record of the name table; its string stays the bytes of its platform's encoding. */
export interface NameRecord {
  readonly platformId: number;
  readonly encodingId: number;
  readonly languageId: number;
  readonly nameId: number;
  readonly data: Uint8Array;
}

/** The records of a name table and, in format 1, its language tags (bytes of UTF-16BE). */
export interface NameTable {
  readonly records: readonly NameRecord[];
  readonly languageTags: readonly Uint8Array[];
}

const HEADER_SIZE = 6;
const RECORD_SIZE = 12;
const LANG_TAG_RECORD_SIZE = 4;
const FORMAT_WITH_LANGUAGE_TAGS = 1;
const UNICODE_PLATFORM = 0;
const WINDOWS_PLATFORM = 3;
const UINT16_BYTES = 2;
const UINT16_MAX = 0xff_ff;

function readRecord(reader: BinaryReader, at: number, storage: number): NameRecord {
  return {
    platformId: reader.uint16(at),
    encodingId: reader.uint16(at + 2),
    languageId: reader.uint16(at + 4),
    nameId: reader.uint16(at + 6),
    // A copy, a Uint8Array also when the table is a view of a Buffer
    data: new Uint8Array(reader.bytes(storage + reader.uint16(at + 10), reader.uint16(at + 8))),
  };
}

/** Reads a name table of format 0 or 1; a string past the end is a MalformedFontError. */
export function readNameTable(table: Uint8Array): NameTable {
  const reader = createReader(table, "name table");
  const format = reader.uint16(0);
  const count = reader.uint16(2);
  const storage = reader.uint16(4);
  const records = Array.from({ length: count }, (_, index) =>
    readRecord(reader, HEADER_SIZE + index * RECORD_SIZE, storage),
  );
  if (format !== FORMAT_WITH_LANGUAGE_TAGS) {
    return { records, languageTags: [] };
  }
  const tagsAt = HEADER_SIZE + count * RECORD_SIZE;
  const languageTags = Array.from({ length: reader.uint16(tagsAt) }, (_, index) => {
    const at = tagsAt + UINT16_BYTES + index * LANG_TAG_RECORD_SIZE;
    return new Uint8Array(reader.bytes(storage + reader.uint16(at + 2), reader.uint16(at)));
  });
  return { records, languageTags };
}

/** Whether the record's string is UTF-16BE: Unicode and Windows platforms. */
export const isUtf16 = ({ platformId }: NameRecord): boolean =>
  platformId === UNICODE_PLATFORM || platformId === WINDOWS_PLATFORM;

/** The string of a Unicode or Windows record. */
export function decodeName({ data }: NameRecord): string {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const units = Array.from({ length: Math.floor(data.length / UINT16_BYTES) }, (_, index) =>
    view.getUint16(index * UINT16_BYTES),
  );
  // Each code unit on its own: a surrogate pair joins back into its character
  return units.map((unit) => String.fromCodePoint(unit)).join("");
}

const BMP_END = 0x1_00_00;
const HIGH_SURROGATE = 0xd8_00;
const LOW_SURROGATE = 0xdc_00;
const SURROGATE_BITS = 10;
const LOW_BITS_MASK = 0x3_ff;

/** The UTF-16 code units of a character: itself, or the surrogate pair beyond the BMP. */
function codeUnitsOf(char: string): number[] {
  const codePoint = char.codePointAt(0) ?? 0;
  if (codePoint < BMP_END) {
    return [codePoint];
  }
  const offset = codePoint - BMP_END;
  return [HIGH_SURROGATE + (offset >> SURROGATE_BITS), LOW_SURROGATE + (offset & LOW_BITS_MASK)];
}

/** The UTF-16BE bytes of a string, the encoding of Unicode and Windows records. */
export function encodeName(text: string): Uint8Array {
  const units = [...text].flatMap((char) => codeUnitsOf(char));
  const bytes = new Uint8Array(units.length * UINT16_BYTES);
  const view = new DataView(bytes.buffer);
  units.forEach((unit, index) => view.setUint16(index * UINT16_BYTES, unit));
  return bytes;
}

/** Records in the order the spec requires: platform, encoding, language, name id. */
const compareRecords = (a: NameRecord, b: NameRecord): number =>
  a.platformId - b.platformId ||
  a.encodingId - b.encodingId ||
  a.languageId - b.languageId ||
  a.nameId - b.nameId;

/** Each distinct string once, with its offset in the storage area. */
function storageOf(strings: readonly Uint8Array[]): { data: Uint8Array; offsets: number[] } {
  const known = new Map<string, number>();
  const unique: Uint8Array[] = [];
  const offsets = strings.map((data) => {
    const key = data.join(",");
    const offset = known.get(key);
    if (offset !== undefined) {
      return offset;
    }
    const next = unique.reduce((length, item) => length + item.length, 0);
    known.set(key, next);
    unique.push(data);
    return next;
  });
  const data = new Uint8Array(unique.reduce((length, item) => length + item.length, 0));
  unique.reduce((at, item) => {
    data.set(item, at);
    return at + item.length;
  }, 0);
  return { data, offsets };
}

/**
 * Writes a name table: format 0, or format 1 when it has language tags. Records are sorted as
 * the spec requires; equal strings are stored once.
 */
export function writeNameTable({ records, languageTags }: NameTable): Uint8Array {
  const sorted = records.toSorted(compareRecords);
  const storage = storageOf([...sorted.map(({ data }) => data), ...languageTags]);
  const hasTags = languageTags.length > 0;
  const tagsAt = HEADER_SIZE + sorted.length * RECORD_SIZE;
  const headerLength =
    tagsAt + (hasTags ? UINT16_BYTES + languageTags.length * LANG_TAG_RECORD_SIZE : 0);
  // Counts, lengths and offsets are uint16: a larger table can't be written
  if (sorted.length > UINT16_MAX || headerLength > UINT16_MAX || storage.data.length > UINT16_MAX) {
    throw new Error("The name table is too large: its strings and records must fit in 64 KB");
  }
  const table = new Uint8Array(headerLength + storage.data.length);
  const view = new DataView(table.buffer);
  view.setUint16(0, hasTags ? FORMAT_WITH_LANGUAGE_TAGS : 0);
  view.setUint16(2, sorted.length);
  view.setUint16(4, headerLength);
  sorted.forEach(({ platformId, encodingId, languageId, nameId, data }, index) => {
    const at = HEADER_SIZE + index * RECORD_SIZE;
    [platformId, encodingId, languageId, nameId, data.length, storage.offsets[index]].forEach(
      (value, field) => view.setUint16(at + field * UINT16_BYTES, value),
    );
  });
  if (hasTags) {
    view.setUint16(tagsAt, languageTags.length);
    languageTags.forEach((tag, index) => {
      const at = tagsAt + UINT16_BYTES + index * LANG_TAG_RECORD_SIZE;
      view.setUint16(at, tag.length);
      view.setUint16(at + 2, storage.offsets[sorted.length + index]);
    });
  }
  table.set(storage.data, headerLength);
  return table;
}
