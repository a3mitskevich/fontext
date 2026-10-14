import { describe, it, expect } from "vitest";
import * as hb from "harfbuzzjs";
import type { MinifyOption } from "../src";
import { requiredSfntTable } from "../src/font/sfnt";
import { glyphCount } from "../src/font/tables";
import { extract, textFont, ttfOriginalFont, variableFont } from "./setup";

const POST_WITH_NAMES = 0x2_00_00;
const POST_WITHOUT_NAMES = 0x3_00_00;

type EngineCase = [engine: string, option: Partial<MinifyOption>, font: Buffer];

const ENGINES: EngineCase[] = [
  ["subset", { engine: "subset", characters: "abc" }, textFont],
  ["convert", { engine: "convert" }, textFont],
  ["icon", { ligatures: ["home", "search"] }, ttfOriginalFont],
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

function postVersion(font: Uint8Array): number {
  const post = requiredSfntTable(font, "post");
  return new DataView(post.buffer, post.byteOffset, post.byteLength).getUint32(0);
}

const fontOf = (data: Uint8Array) => new hb.Font(new hb.Face(new hb.Blob(data), 0));

/** The name of every glyph, in glyph order; HarfBuzz makes up "gidN" for fonts without names. */
function glyphNamesOf(font: Uint8Array): string[] {
  const hbFont = fontOf(font);
  const count = glyphCount(requiredSfntTable(font, "maxp"));
  return Array.from({ length: count }, (_, glyph) => hbFont.glyphName(glyph));
}

const MADE_UP_NAME = /^gid\d+$/u;

/** The names of the glyphs the cmap maps the characters to. */
const charNamesOf = (hbFont: ReturnType<typeof fontOf>, text: string): string[] =>
  [...text].map((char) => hbFont.glyphName(hbFont.nominalGlyph(char.codePointAt(0) ?? 0) ?? 0));

describe("glyphNames option", () => {
  it.each(ENGINES)(
    "should write post without glyph names by default (%s engine)",
    async (_, option, font) => {
      const ttf = await ttfOf(font, option);
      expect(postVersion(ttf)).toBe(POST_WITHOUT_NAMES);
      expect(glyphNamesOf(ttf).every((glyphName) => MADE_UP_NAME.test(glyphName))).toBe(true);
    },
  );

  it.each(ENGINES)(
    "should keep the glyph names on request (%s engine)",
    async (_, option, font) => {
      const ttf = await ttfOf(font, { ...option, glyphNames: true });
      expect(postVersion(ttf)).toBe(POST_WITH_NAMES);
      // The TTF of svg2ttf has no name for .notdef
      const [, ...named] = glyphNamesOf(ttf);
      expect(named.some((glyphName) => MADE_UP_NAME.test(glyphName))).toBe(false);
    },
  );

  it("should keep the names of the source glyphs (subset engine)", async () => {
    const ttf = await ttfOf(textFont, { engine: "subset", characters: "abc", glyphNames: true });
    const font = fontOf(ttf);
    const source = fontOf(textFont);
    expect(charNamesOf(font, "abc")).toStrictEqual(charNamesOf(source, "abc"));
    expect(charNamesOf(font, "abc")).toStrictEqual(["a", "b", "c"]);
  });
});

/** The languages of the name records of each name id, as HarfBuzz lists them ("en", "ru"). */
function languagesByNameId(font: Uint8Array): Record<number, string[]> {
  const records = new hb.Face(new hb.Blob(font), 0).listNames();
  const nameIds = [...new Set(records.map(({ nameId }) => nameId))];
  return Object.fromEntries(
    nameIds.map((nameId) => [
      nameId,
      records
        .filter((record) => record.nameId === nameId)
        .map(({ language }) => language)
        .toSorted(),
    ]),
  );
}

const SOURCE_ENGINES: EngineCase[] = [
  ["subset", { engine: "subset", characters: "Afi" }, variableFont],
  ["convert", { engine: "convert" }, variableFont],
];

describe("nameLanguages option", () => {
  it("should find English and Russian names in the source", () => {
    expect(languagesByNameId(variableFont)).toMatchObject({ 1: ["en", "ru"], 2: ["en", "ru"] });
  });

  it.each(SOURCE_ENGINES)(
    "should keep only English names by default (%s engine)",
    async (_, option, font) => {
      const ttf = await ttfOf(font, option);
      expect(languagesByNameId(ttf)).toMatchObject({ 1: ["en"], 2: ["en"] });
    },
  );

  it.each(SOURCE_ENGINES)(
    "should keep the names of every language (%s engine)",
    async (_, option, font) => {
      const ttf = await ttfOf(font, { ...option, nameLanguages: "all" });
      expect(languagesByNameId(ttf)).toMatchObject({ 1: ["en", "ru"], 2: ["en", "ru"] });
    },
  );

  it("should keep the names of the listed languages", async () => {
    const ttf = await ttfOf(variableFont, {
      engine: "subset",
      characters: "Afi",
      nameLanguages: [0x4_19],
    });
    expect(languagesByNameId(ttf)).toStrictEqual({ 1: ["ru"], 2: ["ru"] });
  });
});
