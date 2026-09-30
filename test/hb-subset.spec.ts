import { describe, it, expect } from "vitest";
import * as hb from "harfbuzzjs";
import { hbSubset, SubsetFlag } from "../src/engines/hb-subset";
import { sfntTable } from "../src/font/sfnt";
import { glyphCount } from "../src/font/tables";
import { multiLookupFont } from "./setup";

// Fixture glyph order: .notdef, space, a-l, then the ligatures abc, def, ghi and jkl
const GLYPH_C = 4;
const GLYPH_ABC = 14;
const ALL_CODE_POINTS = [..." abcdefghijkl"].map((char) => char.codePointAt(0) ?? 0);

const glyphsOf = (font: Uint8Array): number =>
  glyphCount(sfntTable(font, "maxp") ?? new Uint8Array());
const faceOf = (font: Uint8Array) => new hb.Face(new hb.Blob(font), 0);

const featuresOf = async (layoutFeatures?: "*" | readonly string[]): Promise<string[]> =>
  faceOf(
    await hbSubset(multiLookupFont, { unicodes: ALL_CODE_POINTS, layoutFeatures }),
  ).getTableFeatureTags("GSUB");

const nameIdsOf = async (nameIds?: readonly number[]): Promise<number[]> =>
  faceOf(await hbSubset(multiLookupFont, { unicodes: [0x61], nameIds }))
    .listNames()
    .map(({ nameId }) => nameId);

const languagesOf = async (nameLanguages?: readonly number[]): Promise<string[]> =>
  faceOf(await hbSubset(multiLookupFont, { unicodes: [0x61], nameLanguages }))
    .listNames()
    .map(({ language }) => language);

describe("hb-subset wrapper", () => {
  it("should keep the glyphs of the code points and .notdef", async () => {
    const subset = await hbSubset(multiLookupFont, { unicodes: [0x63] });
    expect(glyphsOf(subset)).toBe(2);
    expect(faceOf(subset).collectUnicodes()).toStrictEqual(new Uint32Array([0x63]));
  });

  it("should keep glyphs by id", async () => {
    const subset = await hbSubset(multiLookupFont, { glyphs: [GLYPH_ABC] });
    expect(glyphsOf(subset)).toBe(2);
  });

  it("should keep glyph ids with RETAIN_GIDS", async () => {
    const subset = await hbSubset(multiLookupFont, {
      unicodes: [0x63],
      flags: SubsetFlag.RETAIN_GIDS,
    });
    expect(glyphsOf(subset)).toBe(GLYPH_C + 1);
    expect(new hb.Font(faceOf(subset)).nominalGlyph(0x63)).toBe(GLYPH_C);
  });

  it("should keep the layout closure of the code points unless NO_LAYOUT_CLOSURE is set", async () => {
    const abc = [0x61, 0x62, 0x63];
    const closed = await hbSubset(multiLookupFont, { unicodes: abc, layoutFeatures: "*" });
    const open = await hbSubset(multiLookupFont, {
      unicodes: abc,
      layoutFeatures: "*",
      flags: SubsetFlag.NO_LAYOUT_CLOSURE,
    });
    expect(glyphsOf(closed)).toBe(5);
    expect(glyphsOf(open)).toBe(4);
  });

  it("should keep the HarfBuzz default layout features, all of them or a list", async () => {
    // HarfBuzz drops dlig, which is off by default, unless asked to keep it
    await expect(featuresOf()).resolves.toStrictEqual(["liga"]);
    await expect(featuresOf("*")).resolves.toStrictEqual(["dlig", "liga"]);
    await expect(featuresOf(["dlig"])).resolves.toStrictEqual(["dlig"]);
  });

  it("should drop the given tables on top of the defaults", async () => {
    const subset = await hbSubset(multiLookupFont, {
      unicodes: ALL_CODE_POINTS,
      dropTables: ["GSUB", "post"],
    });
    expect(sfntTable(subset, "GSUB")).toBeUndefined();
    expect(sfntTable(subset, "post")).toBeUndefined();
    expect(sfntTable(subset, "cmap")).toBeDefined();
  });

  it("should keep only the given name ids", async () => {
    await expect(nameIdsOf()).resolves.toStrictEqual([1, 2, 4, 6]);
    await expect(nameIdsOf([1])).resolves.toStrictEqual([1]);
  });

  it("should keep every code point and glyph for *", async () => {
    const subset = await hbSubset(multiLookupFont, { unicodes: "*", glyphs: "*" });
    expect(glyphsOf(subset)).toBe(glyphsOf(multiLookupFont));
    expect(faceOf(subset).collectUnicodes()).toStrictEqual(
      faceOf(multiLookupFont).collectUnicodes(),
    );
  });

  it("should keep the name records of the given languages only", async () => {
    await expect(languagesOf()).resolves.toStrictEqual(["en", "en", "en", "en"]);
    await expect(languagesOf([0x4_09])).resolves.toStrictEqual(["en", "en", "en", "en"]);
    // German: the fixture has no name record in it
    await expect(languagesOf([0x4_07])).resolves.toStrictEqual([]);
  });

  it("should run concurrent calls one after another on the same memory", async () => {
    const subsets = await Promise.all(
      ALL_CODE_POINTS.map((codePoint) => hbSubset(multiLookupFont, { unicodes: [codePoint] })),
    );
    const again = await hbSubset(multiLookupFont, { unicodes: [ALL_CODE_POINTS[3]] });
    expect(subsets.map((subset) => glyphsOf(subset))).toStrictEqual(ALL_CODE_POINTS.map(() => 2));
    expect(Buffer.compare(subsets[3], again)).toBe(0);
  });

  it("should reject data HarfBuzz cannot subset", async () => {
    await expect(hbSubset(new Uint8Array(64), { unicodes: [0x61] })).rejects.toThrow(
      "HarfBuzz could not subset the font",
    );
  });
});
