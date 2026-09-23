import { describe, it, expect } from "vitest";
import { hasGposKern, readKerning, subsetKern } from "../src/font/kern";
import { readSfnt, type SfntTable, tableChecksum, tagNumber, withTable } from "../src/font/sfnt";
import { extract, textFont } from "./setup";
import { readKernPairs } from "./ttf-utils";

const HORIZONTAL = 0x1;
const MINIMUM = 0x2;
const CROSS_STREAM = 0x4;
const OVERRIDE = 0x8;
const FORMAT2 = 0x2_00;
const CHECKSUM_MAGIC = 0xb1_b0_af_ba;

type Pair = [left: number, right: number, value: number];

const u16 = (value: number): number[] => [(value >> 8) & 0xff, value & 0xff];

/** A version 0 kern table; the pairs of every subtable are written as format 0. */
function kernTable(subtables: { coverage: number; pairs: Pair[] }[]): Uint8Array {
  const body = subtables.flatMap(({ coverage, pairs }) => [
    ...u16(0),
    ...u16(14 + pairs.length * 6),
    ...u16(coverage),
    ...u16(pairs.length),
    ...u16(0),
    ...u16(0),
    ...u16(0),
    ...pairs.flatMap(([left, right, value]) => [...u16(left), ...u16(right), ...u16(value)]),
  ]);
  return new Uint8Array([...u16(0), ...u16(subtables.length), ...body]);
}

/** A GPOS table whose feature list holds the given feature tags. */
function gposWithFeatures(tags: string[]): Uint8Array {
  const records = tags.flatMap((tag) => [
    ...[...tag].map((char) => char.codePointAt(0) ?? 0),
    0,
    0,
  ]);
  return new Uint8Array([
    ...u16(1),
    ...u16(0),
    ...u16(0),
    ...u16(10),
    ...u16(0),
    ...u16(tags.length),
    ...records,
  ]);
}

/** An sfnt with an empty head table, enough to carry a kern table for reading back. */
const EMPTY_FONT = withTable(
  new Uint8Array([0, 1, 0, 0, ...u16(0), ...u16(0), ...u16(0), ...u16(0)]),
  "head",
  new Uint8Array(54),
);

const identity = (count: number) =>
  new Map(Array.from({ length: count }, (_, glyph) => [glyph, glyph]));
/** The pairs of the subset kern table, read back from a font. */
function subsetPairs(kern: Uint8Array, glyphMap: ReadonlyMap<number, number>): Pair[] {
  const table = subsetKern(kern, glyphMap);
  return table ? readKernPairs(withTable(EMPTY_FONT, "kern", table)) : [];
}

const HEAD_TAG = tagNumber("head");

/** A table checksum as the directory stores it: head counts with checkSumAdjustment zeroed. */
const directoryChecksum = ({ tag, data }: SfntTable): number =>
  tableChecksum(tag === HEAD_TAG ? Uint8Array.from(data).fill(0, 8, 12) : data);

describe("kern table subsetting", () => {
  it("should add horizontal subtables in order and let the override bit replace the sum", () => {
    const kern = kernTable([
      {
        coverage: HORIZONTAL,
        pairs: [
          [1, 2, -50],
          [2, 3, -10],
        ],
      },
      { coverage: HORIZONTAL, pairs: [[1, 2, -20]] },
      { coverage: HORIZONTAL | OVERRIDE, pairs: [[2, 3, -70]] },
    ]);

    expect(subsetPairs(kern, identity(4))).toStrictEqual([
      [1, 2, -70],
      [2, 3, -70],
    ]);
  });

  it("should leave out minimum, cross-stream, vertical and format 2 subtables", () => {
    const kern = kernTable([
      { coverage: HORIZONTAL | MINIMUM, pairs: [[1, 2, -50]] },
      { coverage: HORIZONTAL | CROSS_STREAM, pairs: [[1, 2, -50]] },
      { coverage: 0, pairs: [[1, 2, -50]] },
      { coverage: HORIZONTAL | FORMAT2, pairs: [] },
      { coverage: HORIZONTAL, pairs: [[3, 1, 40]] },
    ]);

    expect(subsetPairs(kern, identity(4))).toStrictEqual([[3, 1, 40]]);
  });

  it("should renumber kept glyphs, drop the rest and zero values, and sort the pairs", () => {
    const kern = kernTable([
      {
        coverage: HORIZONTAL,
        pairs: [
          [5, 9, -30],
          [9, 5, -40],
          [5, 7, -50],
          [9, 9, 0],
        ],
      },
    ]);
    // Glyph 7 is not kept; 9 becomes 1 and 5 becomes 2
    const glyphMap = new Map([
      [9, 1],
      [5, 2],
    ]);

    expect(subsetPairs(kern, glyphMap)).toStrictEqual([
      [1, 2, -40],
      [2, 1, -30],
    ]);
  });

  it("should give no table when no pair is left", () => {
    const kern = kernTable([{ coverage: HORIZONTAL, pairs: [[1, 2, -50]] }]);

    expect(subsetKern(kern, new Map([[1, 1]]))).toBeUndefined();
  });

  it("should read no pairs from an Apple kern table", () => {
    const apple = new Uint8Array([0, 1, 0, 0, 0, 0, 0, 0]);

    expect(readKerning(apple).size).toBe(0);
  });

  it("should fail with a clear error on a truncated table", () => {
    const kern = kernTable([{ coverage: HORIZONTAL, pairs: [[1, 2, -50]] }]);

    expect(() => readKerning(kern.subarray(0, -2))).toThrow(/^Malformed kern table/u);
  });

  it("should detect a kern feature in GPOS", () => {
    expect(hasGposKern(gposWithFeatures(["mark", "kern"]))).toBe(true);
    expect(hasGposKern(gposWithFeatures(["mark"]))).toBe(false);
    expect(hasGposKern()).toBe(false);
  });
});

describe("font with a restored kern table", () => {
  it("should leave the source font unchanged when it is a view on a larger Buffer", () => {
    // Buffer#slice() is a view, so a copy made with it would write through to the source
    const source = Buffer.concat([Buffer.alloc(8), Buffer.from(EMPTY_FONT)]).subarray(8);
    const before = Buffer.from(source);

    withTable(source, "kern", new Uint8Array(4));

    expect(source).toStrictEqual(before);
  });

  it("should keep sorted tables, valid table checksums and head.checkSumAdjustment", async () => {
    const { ttf } = await extract(textFont, {
      fontName: "kerning",
      engine: "subset",
      characters: "Yes Fa P. W, V.",
      formats: ["ttf"],
    });
    const font = new Uint8Array(ttf as Buffer);
    const { tables } = readSfnt(font);
    const tags = tables.map((table) => table.tag);

    expect(tags).toContain(tagNumber("kern"));
    expect(tags).toStrictEqual(tags.toSorted((a, b) => a - b));
    expect(tables.map((table) => directoryChecksum(table))).toStrictEqual(
      tables.map((table) => table.checksum),
    );
    expect(tableChecksum(font)).toBe(CHECKSUM_MAGIC);
  });
});
