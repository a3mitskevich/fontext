import { describe, it, expect } from "vitest";
import * as hb from "harfbuzzjs";
import type { MinifyOption } from "../src";
import { createFont } from "../src/glyphs";
import { sfntTable } from "../src/font/sfnt";
import { glyphCount } from "../src/font/tables";
import {
  cffFont,
  extract,
  multiLookupFont,
  textFont,
  ttfOriginalFont,
  woff2OriginalFont,
} from "./setup";

// Material Icons forms its 2 000+ icons from a-z and _ in rlig: any letters reach most of them
const ICONS = [
  "home",
  "search",
  "menu",
  "close",
  "settings",
  "favorite",
  "delete",
  "add",
  "check",
  "star",
  "person",
  "info",
  "warning",
  "edit",
  "lock",
  "share",
  "download",
  "upload",
  "refresh",
  "visibility",
];
// Real Material Icons ligatures made only of letters of ICONS
const UNREQUESTED_ICONS = ["work", "face", "more"];
const MAX_WOFF2_SIZE = 2048;
const MAX_TTF_SIZE = 4096;

const glyphsOf = (font: Uint8Array): number =>
  glyphCount(sfntTable(font, "maxp") ?? new Uint8Array());

/** Glyph ids the default layout of the font gives the text. */
const shaperOf = (font: Uint8Array) => {
  const hbFont = new hb.Font(new hb.Face(new hb.Blob(font), 0));
  return (text: string): number[] => {
    const buffer = new hb.Buffer();
    buffer.addText(text);
    buffer.guessSegmentProperties();
    hb.shape(hbFont, buffer);
    return buffer.getGlyphInfos().map(({ codepoint }) => codepoint);
  };
};

const codePointsOf = (font: Uint8Array): number[] => [
  ...new hb.Face(new hb.Blob(font), 0).collectUnicodes(),
];

const formsLigature = (glyphs: number[]): boolean => glyphs.length === 1 && glyphs[0] !== 0;

const subsetOf = async (font: Buffer, option: Partial<MinifyOption>): Promise<Buffer> => {
  const { ttf } = await extract(font, {
    fontName: "subset-ligatures",
    engine: "subset",
    formats: ["ttf"],
    ...option,
  } as MinifyOption);
  return ttf as Buffer;
};

describe("subset engine ligatures", () => {
  it("should form every ligature of the tests in the source font", () => {
    const shape = shaperOf(ttfOriginalFont);
    expect([...ICONS, ...UNREQUESTED_ICONS].filter((text) => !formsLigature(shape(text)))).toEqual(
      [],
    );
    expect(
      UNREQUESTED_ICONS.flatMap((text) => [...text]).every((letter) =>
        ICONS.some((icon) => icon.includes(letter)),
      ),
    ).toBe(true);
  });

  it("should keep .notdef, the letters and one glyph per ligature", async () => {
    const ttf = await subsetOf(ttfOriginalFont, { ligatures: ICONS });
    const letters = new Set(ICONS.join(""));
    expect(glyphsOf(ttf)).toBe(1 + letters.size + ICONS.length);
  });

  it("should form each requested ligature and none of the others", async () => {
    const shape = shaperOf(await subsetOf(ttfOriginalFont, { ligatures: ICONS }));
    expect(ICONS.filter((text) => !formsLigature(shape(text)))).toEqual([]);
    expect(UNREQUESTED_ICONS.map((text) => shape(text).length)).toStrictEqual(
      UNREQUESTED_ICONS.map((text) => text.length),
    );
    // Home forms in "homework", work stays letters
    expect(shape("homework")).toHaveLength(5);
  });

  it("should stay a few kilobytes", async () => {
    const { ttf, woff2 } = await extract(woff2OriginalFont, {
      fontName: "subset-ligatures",
      engine: "subset",
      ligatures: ICONS,
      formats: ["ttf", "woff2"],
    });
    expect(ttf?.length).toBeLessThan(MAX_TTF_SIZE);
    expect(woff2?.length).toBeLessThan(MAX_WOFF2_SIZE);
  });

  it("should keep the layout closure of characters combined with ligatures", async () => {
    const shape = shaperOf(
      await subsetOf(ttfOriginalFont, { ligatures: ["home"], characters: "work" }),
    );
    // Work forms from the characters alone and home is requested; more needs letters of both
    expect(formsLigature(shape("work"))).toBe(true);
    expect(formsLigature(shape("home"))).toBe(true);
    expect(shape("more")).toHaveLength(4);
  });

  it("should keep the ligatures GSUB forms from the characters in every lookup", async () => {
    // Lookup 0 forms abc, the extension lookup 2 forms jkl, lookup 1 forms ghi
    const ttf = await subsetOf(multiLookupFont, { characters: "abcjkl" });
    const shape = shaperOf(ttf);
    expect(formsLigature(shape("abc"))).toBe(true);
    expect(formsLigature(shape("jkl"))).toBe(true);
    expect(glyphsOf(ttf)).toBe(1 + 6 + 2);
  });

  it("should keep the ligatures of characters and requested ones across lookups", async () => {
    const ttf = await subsetOf(multiLookupFont, { ligatures: ["ghi"], characters: "abcjkl" });
    const shape = shaperOf(ttf);
    expect(["abc", "ghi", "jkl"].filter((text) => !formsLigature(shape(text)))).toEqual([]);
    expect(glyphsOf(ttf)).toBe(1 + 9 + 3);
  });

  it("should keep ligatures a contextual lookup forms, but not those that need context", async () => {
    // Calt forms x y through a chained context lookup and y z only before x
    const ttf = await subsetOf(cffFont, { ligatures: ["xy", "fi", "yz"] });
    const shape = shaperOf(ttf);
    expect(formsLigature(shape("xy"))).toBe(true);
    expect(formsLigature(shape("fi"))).toBe(true);
    expect(shape("yzx")).toHaveLength(3);
    expect(glyphsOf(ttf)).toBe(1 + 5 + 2);
  });

  it("should keep the same glyphs for ligatures as for characters in a font without GSUB", async () => {
    // Composite accented letters keep their components either way
    const withLigatures = await subsetOf(textFont, { characters: "Déjà vu", ligatures: ["Fa"] });
    const asCharacters = await subsetOf(textFont, { characters: "Déjà vuFa" });
    for (const tag of ["glyf", "loca", "hmtx"]) {
      expect(sfntTable(withLigatures, tag)).toStrictEqual(sfntTable(asCharacters, tag));
    }
    // Glyphs kept by id keep every code point the cmap maps to them, such as e, ` and ´
    expect(codePointsOf(withLigatures)).toEqual(expect.arrayContaining(codePointsOf(asCharacters)));
  });

  it("should keep the letters of a text that forms no ligature", async () => {
    const ttf = await subsetOf(ttfOriginalFont, { ligatures: ["hom"] });
    expect(glyphsOf(ttf)).toBe(1 + 3);
    expect(shaperOf(ttf)("hom").every((glyph) => glyph !== 0)).toBe(true);
  });
});

describe("Font.layoutGlyphs", () => {
  // Glyph ids of the CFF fixture, see scripts/make-cff-fixture.mjs
  const [F, I, X, Y, Z, F_I, X_Y, Y_Z] = [2, 3, 4, 5, 6, 7, 8, 9];

  it("should give the glyphs of every stage of shaping", async () => {
    const font = await createFont(cffFont);
    expect(font.layoutGlyphs("fi")).toStrictEqual([F, I, F_I]);
    expect(font.layoutGlyphs("xy")).toStrictEqual([X, Y, X_Y]);
    // The y z ligature forms only before x
    expect(font.layoutGlyphs("yz")).toStrictEqual([Y, Z]);
    expect(font.layoutGlyphs("yzx")).toStrictEqual([X, Y, Z, Y_Z]);
    expect(font.layoutGlyphs("")).toStrictEqual([]);
  });
});
