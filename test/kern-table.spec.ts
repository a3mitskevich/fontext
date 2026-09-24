import { describe, it, expect } from "vitest";
import { matchGlyphs } from "../src/engines/kerning";
import { type GlyphMatch, hasGposKern, readKerning, subsetKern } from "../src/font/kern";
import { readSfnt, type SfntTable, tableChecksum, tagNumber, withTable } from "../src/font/sfnt";
import { extract, textFont } from "./setup";
import { kernTable, type KernTuple, readKernPairs } from "./ttf-utils";

const HORIZONTAL = 0x1;
const MINIMUM = 0x2;
const CROSS_STREAM = 0x4;
const OVERRIDE = 0x8;
const FORMAT2 = 0x2_00;
const CHECKSUM_MAGIC = 0xb1_b0_af_ba;

const u16 = (value: number): number[] => [(value >> 8) & 0xff, value & 0xff];

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

const matched = (map: ReadonlyMap<number, number>): GlyphMatch => ({ map, unmatched: new Set() });
const identity = (count: number) =>
  matched(new Map(Array.from({ length: count }, (_, glyph) => [glyph, glyph])));

/** The pairs of the subset kern table, read back from a font. */
function subsetPairs(kern: Uint8Array, glyphs: GlyphMatch): KernTuple[] {
  const { table } = subsetKern(kern, glyphs);
  return table ? readKernPairs(withTable(EMPTY_FONT, "kern", table)) : [];
}

/** [nPairs, searchRange, entrySelector, rangeShift, length] of each format 0 subtable. */
function subtableHeaders(kern: Uint8Array): number[][] {
  const view = new DataView(kern.buffer, kern.byteOffset, kern.byteLength);
  const offsets = Array.from({ length: view.getUint16(2) }).reduce<number[]>(
    (acc, _, index) => [...acc, acc[index] + 14 + view.getUint16(acc[index] + 6) * 6],
    [4],
  );
  return offsets
    .slice(0, -1)
    .map((offset) => [6, 8, 10, 12, 2].map((field) => view.getUint16(offset + field)));
}

const HEAD_TAG = tagNumber("head");

/** A table checksum as the directory stores it: head counts with checkSumAdjustment zeroed. */
const directoryChecksum = ({ tag, data }: SfntTable): number =>
  tableChecksum(tag === HEAD_TAG ? Uint8Array.from(data).fill(0, 8, 12) : data);

describe("kern table subsetting", () => {
  it("should add up every horizontal subtable as HarfBuzz does, minimum and override too", () => {
    const kern = kernTable([
      {
        coverage: HORIZONTAL,
        pairs: [
          [1, 2, -50],
          [2, 3, -10],
        ],
      },
      { coverage: HORIZONTAL | MINIMUM, pairs: [[1, 2, -20]] },
      { coverage: HORIZONTAL | OVERRIDE, pairs: [[2, 3, -70]] },
    ]);

    expect(subsetPairs(kern, identity(4))).toStrictEqual([
      [1, 2, -70],
      [2, 3, -80],
    ]);
    expect(subsetKern(kern, identity(4)).loss.skippedSubtables).toBe(0);
  });

  it("should skip and count cross-stream, vertical and format 2 subtables", () => {
    const kern = kernTable([
      { coverage: HORIZONTAL | CROSS_STREAM, pairs: [[1, 2, -50]] },
      { coverage: 0, pairs: [[1, 2, -50]] },
      { coverage: HORIZONTAL | FORMAT2, pairs: [] },
      { coverage: HORIZONTAL, pairs: [[3, 1, 40]] },
    ]);

    expect(subsetPairs(kern, identity(4))).toStrictEqual([[3, 1, 40]]);
    expect(subsetKern(kern, identity(4)).loss).toStrictEqual({
      isApple: false,
      skippedSubtables: 3,
      unmatchedPairs: 0,
    });
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
    const glyphs = matched(
      new Map([
        [9, 1],
        [5, 2],
      ]),
    );

    expect(subsetPairs(kern, glyphs)).toStrictEqual([
      [1, 2, -40],
      [2, 1, -30],
    ]);
    expect(subsetKern(kern, glyphs).loss.unmatchedPairs).toBe(0);
  });

  it("should count the pairs of unmatched glyphs the subset may keep", () => {
    const kern = kernTable([
      {
        coverage: HORIZONTAL,
        pairs: [
          [1, 2, -10],
          [1, 3, -20],
          [3, 3, -25],
          [3, 4, -30],
        ],
      },
    ]);
    // 1 and 2 are matched, 3 may be kept under an unknown id, 4 was dropped
    const glyphs: GlyphMatch = {
      map: new Map([
        [1, 1],
        [2, 2],
      ]),
      unmatched: new Set([3]),
    };

    expect(subsetPairs(kern, glyphs)).toStrictEqual([[1, 2, -10]]);
    expect(subsetKern(kern, glyphs).loss.unmatchedPairs).toBe(2);
  });

  it("should split many pairs into subtables of at most 10 920, which OTS and HarfBuzz accept", () => {
    const pairs = Array.from({ length: 11_000 }, (_, index): KernTuple => [
      Math.floor(index / 100) + 1,
      (index % 100) + 1,
      -1 - (index % 50),
    ]);
    // The source splits them too, as fonts with this many pairs do
    const kern = kernTable([
      { coverage: HORIZONTAL, pairs: pairs.slice(0, 5500) },
      { coverage: HORIZONTAL, pairs: pairs.slice(5500) },
    ]);
    const { table } = subsetKern(kern, identity(200));
    const written = table as Uint8Array;

    expect(table).toBeInstanceOf(Uint8Array);
    expect(subtableHeaders(written)).toStrictEqual([
      [10_920, 49_152, 13, 16_368, 65_534],
      [80, 384, 6, 96, 494],
    ]);
    expect(readKernPairs(withTable(EMPTY_FONT, "kern", written))).toStrictEqual(pairs);
  });

  it("should give no table when no pair is left", () => {
    const kern = kernTable([{ coverage: HORIZONTAL, pairs: [[1, 2, -50]] }]);

    const glyphs = matched(new Map([[1, 1]]));

    expect(subsetKern(kern, glyphs).table).toBeUndefined();
  });

  it("should read no pairs from an Apple kern table and report it", () => {
    const apple = new Uint8Array([0, 1, 0, 0, 0, 0, 0, 0]);

    expect(readKerning(apple).values.size).toBe(0);
    expect(subsetKern(apple, identity(4))).toStrictEqual({
      table: undefined,
      loss: { isApple: true, skippedSubtables: 0, unmatchedPairs: 0 },
    });
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

describe("glyph matching", () => {
  it("should renumber gaps kept whole, drop empty ones and leave partial ones unmatched", () => {
    // Old 1 was dropped, one of old 3-5 was kept, old 7 was kept
    const { map, unmatched } = matchGlyphs(
      new Map([
        [2, 1],
        [6, 3],
      ]),
      8,
      5,
    );

    expect([...map].toSorted(([a], [b]) => a - b)).toStrictEqual([
      [0, 0],
      [2, 1],
      [6, 3],
      [7, 4],
    ]);
    expect([...unmatched]).toStrictEqual([3, 4, 5]);
  });

  it("should trust only the cmap when its glyphs are out of order", () => {
    const coded = new Map([
      [2, 3],
      [5, 1],
    ]);
    const { map, unmatched } = matchGlyphs(coded, 6, 4);

    expect(map).toStrictEqual(coded);
    expect([...unmatched]).toStrictEqual([1, 3, 4]);
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
