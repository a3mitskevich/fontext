import { describe, it, expect } from "vitest";
import * as hb from "harfbuzzjs";
import type { MinifyOption } from "../src";
import { hbSubset, SubsetFlag } from "../src/engines/hb-subset";
import { restoreKerning } from "../src/engines/kerning";
import { openFont } from "../src/font/font";
import { readSfnt, requiredSfntTable } from "../src/font/sfnt";
import { glyphCount } from "../src/font/tables";
import { extract, multiLookupFont, textFont, ttfOriginalFont } from "./setup";
import { readKernPairs } from "./ttf-utils";

const HINTING_TABLES = ["fpgm", "prep", "cvt ", "hdmx", "VDMX", "LTSH"];
const LATIN = " ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789.,";
const MULTI_LETTERS = "abcdefghijkl";

const codePointsOf = (text: string): number[] => [...text].map((char) => char.codePointAt(0) ?? 0);
const tagName = (tag: number): string =>
  String.fromCodePoint(...[24, 16, 8, 0].map((s) => (tag >>> s) & 0xff));
const tablesOf = (font: Uint8Array): string[] =>
  readSfnt(font).tables.map(({ tag }) => tagName(tag));
const faceOf = (font: Uint8Array) => new hb.Face(new hb.Blob(font), 0);
const glyphsOf = (font: Uint8Array): number => glyphCount(requiredSfntTable(font, "maxp"));
const glyfSize = (font: Uint8Array): number => requiredSfntTable(font, "glyf").length;
const nameIdsOf = (font: Uint8Array): number[] => [
  ...new Set(
    faceOf(font)
      .listNames()
      .map(({ nameId }) => nameId),
  ),
];

async function ttfOf(font: Buffer, option: Partial<MinifyOption>): Promise<Buffer> {
  const { ttf } = await extract(font, {
    fontName: "test",
    formats: ["ttf"],
    ...option,
  } as MinifyOption);
  if (!ttf) {
    throw new Error("No TTF in the result");
  }
  return ttf;
}

const subsetTtf = (font: Buffer, option: Partial<MinifyOption>) =>
  ttfOf(font, { engine: "subset", ...option } as Partial<MinifyOption>);

/** Every glyph outline as SVG path data, in glyph order. */
function pathsOf(font: Uint8Array): string[] {
  const hbFont = new hb.Font(faceOf(font));
  return Array.from({ length: glyphsOf(font) }, (_, glyph) => hbFont.glyphToPath(glyph));
}

/** The GSUB lookups the features of the font point to. */
function gsubLookups(font: Uint8Array): Set<number> {
  const face = faceOf(font);
  const features = face.getTableFeatureTags("GSUB");
  return new Set(features.flatMap((_, index) => face.getFeatureLookups("GSUB", index)));
}

/** Glyph ids of shaping the text with the default features. */
async function shaped(font: Uint8Array, text: string): Promise<number[]> {
  const opened = await openFont(font);
  return opened.shape(text).map(({ id }) => id);
}

/* The subset of the text font with the parameters the engines used before these options,
   kerning restored the same way */
async function previousSubset(input: Parameters<typeof hbSubset>[1]): Promise<Buffer> {
  const { font } = await restoreKerning(textFont, await hbSubset(textFont, input));
  return Buffer.from(font);
}

type EngineCase = [engine: string, option: Partial<MinifyOption>, font: Buffer];

describe("hinting option (subset engine)", () => {
  it("should drop the hinting tables and instructions and keep outlines and kerning", async () => {
    const hinted = await subsetTtf(textFont, { characters: LATIN });
    const unhinted = await subsetTtf(textFont, { characters: LATIN, hinting: false });

    const sourceTables = tablesOf(textFont);
    const present = HINTING_TABLES.filter((tag) => sourceTables.includes(tag));
    expect(present).toStrictEqual(["fpgm", "prep", "cvt ", "hdmx", "VDMX", "LTSH"]);
    expect(tablesOf(hinted)).toEqual(
      expect.arrayContaining(["fpgm", "prep", "cvt ", "hdmx", "VDMX"]),
    );
    expect(tablesOf(unhinted).filter((tag) => HINTING_TABLES.includes(tag))).toStrictEqual([]);

    expect(glyfSize(unhinted)).toBeLessThan(glyfSize(hinted) / 2);
    expect(pathsOf(unhinted)).toStrictEqual(pathsOf(hinted));

    const pairs = readKernPairs(unhinted);
    expect(pairs.length).toBeGreaterThan(0);
    expect(pairs).toStrictEqual(readKernPairs(hinted));
  });

  it("should keep hinting by default", async () => {
    const ttf = await subsetTtf(textFont, { characters: "abc", hinting: true });
    expect(tablesOf(ttf)).toContain("fpgm");
  });
});

describe("layoutFeatures option (subset engine)", () => {
  it("should keep every feature by default, the dlig-only ligature included", async () => {
    const ttf = await subsetTtf(multiLookupFont, { characters: MULTI_LETTERS });
    expect(faceOf(ttf).getTableFeatureTags("GSUB")).toStrictEqual(["dlig", "liga"]);
    expect(gsubLookups(ttf).size).toBe(4);
  });

  it("should drop the dlig lookup with HarfBuzz's default features and keep default ligatures", async () => {
    const ttf = await subsetTtf(multiLookupFont, {
      characters: MULTI_LETTERS,
      layoutFeatures: "default",
    });
    expect(faceOf(ttf).getTableFeatureTags("GSUB")).toStrictEqual(["liga"]);
    expect(gsubLookups(ttf).size).toBe(3);
    for (const text of ["abc", "def", "ghi", "jkl"]) {
      await expect(shaped(ttf, text)).resolves.toHaveLength(1);
    }
  });

  it("should keep exactly the listed features", async () => {
    const dlig = await subsetTtf(multiLookupFont, {
      characters: MULTI_LETTERS,
      layoutFeatures: ["dlig"],
    });
    expect(faceOf(dlig).getTableFeatureTags("GSUB")).toStrictEqual(["dlig"]);
    await expect(shaped(dlig, "abc")).resolves.toHaveLength(3);

    const none = await subsetTtf(multiLookupFont, {
      characters: MULTI_LETTERS,
      layoutFeatures: [],
    });
    expect(faceOf(none).getTableFeatureTags("GSUB")).toStrictEqual([]);
    await expect(shaped(none, "abc")).resolves.toHaveLength(3);
  });

  it("should find the layout closure of characters with the same features", async () => {
    // "kja" reaches the abc ligature only through dlig
    const all = await subsetTtf(multiLookupFont, { characters: "kja" });
    const defaults = await subsetTtf(multiLookupFont, {
      characters: "kja",
      layoutFeatures: "default",
    });
    expect(glyphsOf(all)).toBe(5);
    expect(glyphsOf(defaults)).toBe(4);
  });

  it("should keep Material Icons ligatures formed by rlig with the default features", async () => {
    const ligatures = ["home", "search"];
    const ttf = await subsetTtf(ttfOriginalFont, { ligatures, layoutFeatures: "default" });
    expect(faceOf(ttf).getTableFeatureTags("GSUB")).toContain("rlig");
    for (const text of ligatures) {
      await expect(shaped(ttf, text)).resolves.toHaveLength(1);
    }
  });
});

describe("ligatures with fewer layout features (subset engine)", () => {
  it("should reject ligatures the kept features no longer form and name the missing feature", async () => {
    await expect(
      subsetTtf(ttfOriginalFont, { ligatures: ["home", "search"], layoutFeatures: ["liga"] }),
    ).rejects.toThrow(
      'Ligatures do not form with these layoutFeatures: "home", "search"; they need the GSUB feature(s) rlig, which the subset left out. Add them to layoutFeatures, or use "default" or "all"',
    );
  });

  it("should name only the ligatures that no longer form", async () => {
    await expect(
      subsetTtf(multiLookupFont, { ligatures: ["abc", "a"], layoutFeatures: ["dlig"] }),
    ).rejects.toThrow(
      'Ligatures do not form with these layoutFeatures: "abc"; they need the GSUB feature(s) liga, which',
    );
  });

  it("should keep ligatures the listed features form", async () => {
    const ttf = await subsetTtf(ttfOriginalFont, { ligatures: ["home"], layoutFeatures: ["rlig"] });
    await expect(shaped(ttf, "home")).resolves.toHaveLength(1);
  });

  it("should shape with features turned off, and reject a feature HarfBuzz can't parse", async () => {
    const font = await openFont(multiLookupFont);
    expect(font.shape("abc")).toHaveLength(1);
    expect(font.shape("abc", ["-liga"])).toHaveLength(3);
    expect(font.shape("abc", ["-dlig"])).toHaveLength(1);
    expect(() => font.shape("abc", ["-"])).toThrow('Invalid feature: "-"');
  });

  it("should keep the letters of a text the source forms no ligature for", async () => {
    const ttf = await subsetTtf(ttfOriginalFont, { ligatures: ["hme"], layoutFeatures: ["liga"] });
    await expect(shaped(ttf, "hme")).resolves.toHaveLength(3);
  });
});

describe("nameIds and dropTables options", () => {
  it.each<EngineCase>([
    ["subset", { engine: "subset", characters: "abc" }, textFont],
    ["convert", { engine: "convert" }, textFont],
    ["icon", { ligatures: ["home"] }, ttfOriginalFont],
  ])("should keep only the given name ids (%s engine)", async (_, option, font) => {
    const ttf = await ttfOf(font, { ...option, nameIds: [1, 4] });
    expect(nameIdsOf(ttf)).toStrictEqual([1, 4]);
  });

  it("should keep HarfBuzz's name ids 0-6 without the option (subset engine)", async () => {
    const ttf = await subsetTtf(textFont, { characters: "abc" });
    expect(nameIdsOf(ttf)).toStrictEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it.each<[...EngineCase, dropTables: string[]]>([
    ["subset", { engine: "subset", characters: "abc" }, textFont, ["gasp", "cvt"]],
    ["convert", { engine: "convert" }, textFont, ["gasp", "cvt"]],
    ["icon", { ligatures: ["home"] }, ttfOriginalFont, ["GSUB"]],
  ])("should drop the given tables (%s engine)", async (_, option, font, dropTables) => {
    const before = tablesOf(await ttfOf(font, option));
    const after = tablesOf(await ttfOf(font, { ...option, dropTables }));
    const padded = dropTables.map((tag) => tag.padEnd(4, " "));
    expect(before).toEqual(expect.arrayContaining(padded));
    expect(after).toStrictEqual(before.filter((tag) => !padded.includes(tag)));
  });
});

describe("dropping the kern table", () => {
  it("should not restore the legacy kern pairs", async () => {
    const kerned = await subsetTtf(textFont, { characters: LATIN });
    const unkerned = await subsetTtf(textFont, { characters: LATIN, dropTables: ["kern"] });
    expect(readKernPairs(kerned).length).toBeGreaterThan(0);
    expect(tablesOf(unkerned)).not.toContain("kern");
  });
});

describe("without optimization options", () => {
  it("should subset characters as before", async () => {
    const expected = await previousSubset({ unicodes: codePointsOf(LATIN), layoutFeatures: "*" });
    await expect(subsetTtf(textFont, { characters: LATIN })).resolves.toStrictEqual(expected);
  });

  it("should subset ligatures as before", async () => {
    const font = await openFont(ttfOriginalFont);
    const subset = await hbSubset(ttfOriginalFont, {
      unicodes: codePointsOf("home"),
      glyphs: font.layoutGlyphs("home"),
      flags: SubsetFlag.NO_LAYOUT_CLOSURE,
      layoutFeatures: "*",
    });
    const { font: expected } = await restoreKerning(ttfOriginalFont, subset);
    await expect(subsetTtf(ttfOriginalFont, { ligatures: ["home"] })).resolves.toStrictEqual(
      Buffer.from(expected),
    );
  });

  it("should convert as before", async () => {
    const face = faceOf(textFont);
    const expected = await previousSubset({
      unicodes: face.collectUnicodes(),
      layoutFeatures: "*",
    });
    await expect(ttfOf(textFont, { engine: "convert" })).resolves.toStrictEqual(expected);
  });
});
