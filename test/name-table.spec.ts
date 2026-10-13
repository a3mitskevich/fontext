import { describe, it, expect } from "vitest";
import * as hb from "harfbuzzjs";
import {
  decodeName,
  encodeName,
  isUtf16,
  type NameRecord,
  readNameTable,
  writeNameTable,
} from "../src/font/name";
import { MalformedFontError } from "../src/font/reader";
import { requiredSfntTable, withTable } from "../src/font/sfnt";
import { textFont, variableFont } from "./setup";

const ENGLISH = 0x4_09;
const RUSSIAN = 0x4_19;

const windowsRecord = (nameId: number, text: string, languageId = ENGLISH): NameRecord => ({
  platformId: 3,
  encodingId: 1,
  languageId,
  nameId,
  data: encodeName(text),
});

function namesOf(font: Uint8Array) {
  const face = new hb.Face(new hb.Blob(font), 0);
  return face.listNames().map(({ nameId, language }) => ({
    nameId,
    language,
    name: face.getName(nameId, language),
  }));
}

describe("name table", () => {
  it("should read the records and their strings", () => {
    const { records, languageTags } = readNameTable(requiredSfntTable(variableFont, "name"));
    const strings = records
      .filter((record) => isUtf16(record))
      .map((record) => ({
        languageId: record.languageId,
        nameId: record.nameId,
        text: decodeName(record),
      }));
    expect(languageTags).toStrictEqual([]);
    expect(strings).toContainEqual({ languageId: ENGLISH, nameId: 1, text: "Fontext Variable" });
    expect(strings).toContainEqual({ languageId: ENGLISH, nameId: 256, text: "Weight" });
    expect(strings.filter(({ languageId }) => languageId === RUSSIAN)).toHaveLength(2);
  });

  it.each([
    ["the variable fixture", variableFont],
    ["the text font", textFont],
  ])("should write back the records of %s", (_, font) => {
    const table = readNameTable(requiredSfntTable(font, "name"));
    const written = writeNameTable(table);
    expect(readNameTable(written)).toStrictEqual(table);
    expect(namesOf(withTable(font, "name", written))).toStrictEqual(namesOf(font));
  });

  it("should sort the records and store equal strings once", () => {
    const records = [
      windowsRecord(4, "Same"),
      windowsRecord(1, "Same"),
      windowsRecord(1, "Другое", RUSSIAN),
    ];
    const written = writeNameTable({ records, languageTags: [] });
    const read = readNameTable(written);
    expect(read.records.map(({ nameId, languageId }) => [nameId, languageId])).toStrictEqual([
      [1, ENGLISH],
      [4, ENGLISH],
      [1, RUSSIAN],
    ]);
    expect(read.records.map((record) => decodeName(record))).toStrictEqual([
      "Same",
      "Same",
      "Другое",
    ]);
    // Header, three records, then "Same" and "Другое" once each
    expect(written.length).toBe(6 + 3 * 12 + 2 * 4 + 2 * 6);
  });

  it("should keep the language tags of format 1", () => {
    const table = {
      records: [{ ...windowsRecord(1, "Tagged"), languageId: 0x80_00 }],
      languageTags: [encodeName("en-x-test")],
    };
    const written = writeNameTable(table);
    expect(new DataView(written.buffer).getUint16(0)).toBe(1);
    expect(readNameTable(written)).toStrictEqual(table);
  });

  it("should encode characters outside the BMP as surrogate pairs", () => {
    const record = windowsRecord(1, "Emoji 😀");
    expect(record.data.length).toBe(16);
    expect(decodeName(record)).toBe("Emoji 😀");
  });

  it("should refuse a table whose strings don't fit 16-bit offsets", () => {
    // Two different strings of 40 000 bytes each
    const records = [windowsRecord(1, "1".repeat(20_000)), windowsRecord(2, "2".repeat(20_000))];
    expect(() => writeNameTable({ records, languageTags: [] })).toThrow(
      "The name table is too large",
    );
  });

  it("should reject a string past the end of the table", () => {
    const table = writeNameTable({ records: [windowsRecord(1, "Cut")], languageTags: [] });
    const cut = table.subarray(0, -2);
    expect(() => readNameTable(cut)).toThrow(MalformedFontError);
    expect(() => readNameTable(cut)).toThrow("Malformed name table");
  });
});
