import { describe, it, expect } from "vitest";
import * as hb from "harfbuzzjs";
import type { MinifyOption } from "../src";
import { assertRenameOption } from "../src/engines/rename-option";
import { encodeName, readNameTable, writeNameTable } from "../src/font/name";
import { requiredSfntTable, withTable } from "../src/font/sfnt";
import { cffFont, extract, textFont, ttfOriginalFont, variableFont } from "./setup";

const OS2_WEIGHT_CLASS = 4;
const OS2_FS_SELECTION = 62;
const HEAD_MAC_STYLE = 44;
const FS_ITALIC = 1;
const FS_BOLD = 0x20;
const FS_REGULAR = 0x40;
const FS_STYLE_BITS = FS_ITALIC | FS_BOLD | FS_REGULAR;

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

const pinned = (wght: number, rename?: MinifyOption["rename"]) =>
  ttfOf(variableFont, { engine: "subset", characters: "AVfi", axes: { wght }, rename });

/** The English string of each name id, and the languages of all records. */
function namesOf(font: Uint8Array): { names: Record<number, string>; languages: string[] } {
  const face = new hb.Face(new hb.Blob(font), 0);
  const records = face.listNames();
  const english = records.filter(({ language }) => language === "en");
  return {
    names: Object.fromEntries(english.map(({ nameId }) => [nameId, face.getName(nameId, "en")])),
    languages: [...new Set(records.map(({ language }) => language))],
  };
}

function uint16(font: Uint8Array, tag: string, offset: number): number {
  const table = requiredSfntTable(font, tag);
  return new DataView(table.buffer, table.byteOffset, table.byteLength).getUint16(offset);
}

const styleBitsOf = (font: Uint8Array) => ({
  fsSelection: uint16(font, "OS/2", OS2_FS_SELECTION) & FS_STYLE_BITS,
  macStyle: uint16(font, "head", HEAD_MAC_STYLE),
});

const nameIdsOf = (font: Uint8Array): number[] =>
  Object.keys(namesOf(font).names)
    .map(Number)
    .toSorted((a, b) => a - b);

describe("rename option", () => {
  it("should leave the names of the default instance without it", async () => {
    const { names } = namesOf(await pinned(700));
    expect(names).toMatchObject({ 1: "Fontext Variable", 2: "Regular" });
  });

  it("should name the Bold instance as one of the four styles of the family", async () => {
    const ttf = await pinned(700, true);
    expect(namesOf(ttf).names).toStrictEqual({
      1: "Fontext Variable",
      2: "Bold",
      4: "Fontext Variable Bold",
      6: "FontextVariable-Bold",
      // HarfBuzz drops the name of the pinned axis with the axis
      257: "Width",
    });
    expect(styleBitsOf(ttf)).toStrictEqual({ fsSelection: FS_BOLD, macStyle: 1 });
    expect(uint16(ttf, "OS/2", OS2_WEIGHT_CLASS)).toBe(700);
  });

  it("should give another weight a family of its own and the typographic names", async () => {
    const ttf = await pinned(600, true);
    expect(namesOf(ttf).names).toMatchObject({
      1: "Fontext Variable SemiBold",
      2: "Regular",
      4: "Fontext Variable SemiBold",
      6: "FontextVariable-SemiBold",
      16: "Fontext Variable",
      17: "SemiBold",
    });
    expect(styleBitsOf(ttf)).toStrictEqual({ fsSelection: FS_REGULAR, macStyle: 0 });
  });

  it("should take a family and keep the style of the pinned weight", async () => {
    const { names } = namesOf(await pinned(300, { family: "Brand" }));
    expect(names).toMatchObject({ 1: "Brand Light", 2: "Regular", 16: "Brand", 17: "Light" });
  });

  it("should take the style given for a weight without a name", async () => {
    const { names } = namesOf(await pinned(650, { style: "SemiBold Plus" }));
    expect(names).toMatchObject({ 6: "FontextVariable-SemiBoldPlus", 17: "SemiBold Plus" });
  });

  it("should rename a static font", async () => {
    const ttf = await ttfOf(textFont, {
      engine: "subset",
      characters: "abc",
      rename: { family: "My Text", style: "Bold Italic" },
    });
    expect(namesOf(ttf).names).toMatchObject({
      1: "My Text",
      2: "Bold Italic",
      3: "MyText-BoldItalic",
      4: "My Text Bold Italic",
      6: "MyText-BoldItalic",
    });
    expect(styleBitsOf(ttf)).toStrictEqual({ fsSelection: FS_ITALIC | FS_BOLD, macStyle: 3 });
  });

  it("should keep only the characters PostScript names allow, at most 63", async () => {
    const option = { engine: "subset", characters: "abc" } as const;
    const symbols = await ttfOf(textFont, {
      ...option,
      rename: { family: "Ünï (Test) [Font]", style: "Light" },
    });
    expect(namesOf(symbols).names[6]).toBe("nTestFont-Light");
    const long = await ttfOf(textFont, {
      ...option,
      rename: { family: "F".repeat(80), style: "Bold" },
    });
    expect(namesOf(long).names[6]).toBe("F".repeat(63));
  });

  it("should replace the renamed records of every language", async () => {
    const ttf = await ttfOf(variableFont, {
      engine: "subset",
      characters: "A",
      nameLanguages: "all",
      axes: { wght: 700 },
      rename: true,
    });
    const { names, languages } = namesOf(ttf);
    // The source has Russian records of the family and subfamily only
    expect(languages).toStrictEqual(["en"]);
    expect(names).toMatchObject({ 1: "Fontext Variable", 2: "Bold", 257: "Width" });
  });

  it("should write the typographic names even when nameIds leaves them out", async () => {
    const ttf = await ttfOf(variableFont, {
      engine: "subset",
      characters: "A",
      nameIds: [1, 2],
      axes: { wght: 900 },
      rename: true,
    });
    expect(nameIdsOf(ttf)).toStrictEqual([1, 2, 4, 6, 16, 17, 257]);
  });

  it("should rename the icon engine's font, named after fontName", async () => {
    const { ttf = Buffer.alloc(0) } = await extract(variableFont, {
      fontName: "icons",
      ligatures: ["fi"],
      formats: ["ttf"],
      axes: { wght: 700 },
      rename: true,
    });
    expect(namesOf(ttf).names).toMatchObject({ 1: "icons", 2: "Bold", 6: "icons-Bold" });
  });

  it("should rename the convert engine's font and leave CFF outlines as they are", async () => {
    const option = { engine: "convert" } as const;
    const plain = await ttfOf(cffFont, option);
    const renamed = await ttfOf(cffFont, {
      ...option,
      rename: { family: "Renamed", style: "Bold" },
    });
    expect(namesOf(renamed).names).toMatchObject({ 1: "Renamed", 2: "Bold" });
    expect(requiredSfntTable(renamed, "CFF ")).toStrictEqual(requiredSfntTable(plain, "CFF "));
  });

  it("should rename the icon engine's font whose nameIds leave out the family", async () => {
    const ttf = await ttfOf(ttfOriginalFont, {
      fontName: "icons",
      ligatures: ["home"],
      nameIds: [2],
      rename: { style: "Bold" },
    });
    expect(namesOf(ttf).names).toMatchObject({ 1: "icons", 2: "Bold", 6: "icons-Bold" });
  });

  it("should drop the WWS names and the PostScript prefix of the old family", async () => {
    const extra = [21, 22, 25].map((nameId) => ({
      platformId: 3,
      encodingId: 1,
      languageId: 0x4_09,
      nameId,
      data: encodeName("Old"),
    }));
    const table = readNameTable(requiredSfntTable(textFont, "name"));
    const font = Buffer.from(
      withTable(
        textFont,
        "name",
        writeNameTable({ ...table, records: [...table.records, ...extra] }),
      ),
    );
    const option: Partial<MinifyOption> = {
      engine: "subset",
      characters: "abc",
      nameIds: [1, 2, 4, 6, 21, 22, 25],
    };
    expect(nameIdsOf(await ttfOf(font, option))).toStrictEqual([1, 2, 4, 6, 21, 22, 25]);
    const renamed = await ttfOf(font, { ...option, rename: { family: "New", style: "Bold" } });
    expect(nameIdsOf(renamed)).toStrictEqual([1, 2, 4, 6]);
  });

  it("should rename the icon engine's font without axes", async () => {
    const ttf = await ttfOf(ttfOriginalFont, {
      ligatures: ["home"],
      rename: { family: "Brand Icons", style: "Regular" },
    });
    expect(namesOf(ttf).names).toMatchObject({ 1: "Brand Icons", 2: "Regular" });
    expect(styleBitsOf(ttf)).toStrictEqual({ fsSelection: FS_REGULAR, macStyle: 0 });
  });

  it("should give the same bytes for the same names", async () => {
    await expect(pinned(700, true)).resolves.toStrictEqual(await pinned(700, true));
  });
});

describe("rename option validation", () => {
  it.each([
    ["a string", "Bold", undefined, "rename must be true or an object with family and/or style"],
    ["false", false, undefined, "rename must be true or an object"],
    ["an object without names", {}, undefined, "rename must be true or an object"],
    ["an empty family", { family: " " }, undefined, "rename.family must be a non-empty string"],
    ["a style with a line feed", { style: "Bold\n" }, undefined, "rename.style must be"],
    [
      "true without a pinned weight",
      true,
      { wdth: 75 },
      "rename: true takes the style from a pinned wght axis",
    ],
    ["a weight without a name", true, { wght: 650 }, "Cannot name weight 650: set rename.style"],
    [
      "a family for a narrowed weight",
      { family: "Brand" },
      { wght: { min: 700, max: 900 } },
      "rename takes the style from a pinned wght axis, and wght is a range: set rename.style",
    ],
    [
      "a family for a weight without a name",
      { family: "Brand" },
      { wght: 650 },
      "Cannot name weight 650",
    ],
  ])("should reject %s", (_, rename, axes, message) => {
    expect(() => assertRenameOption(rename, axes)).toThrow(message);
  });

  it("should accept names and nameable weights", () => {
    expect(() => assertRenameOption(true, { wght: 900 })).not.toThrow();
    expect(() => assertRenameOption({ style: "Book" }, { wght: 450 })).not.toThrow();
    expect(() => assertRenameOption({ family: "Brand" })).not.toThrow();
    expect(() =>
      assertRenameOption({ style: "Bold" }, { wght: { min: 700, max: 900 } }),
    ).not.toThrow();
  });

  it("should reject a family without a PostScript character", async () => {
    await expect(
      ttfOf(textFont, {
        engine: "subset",
        characters: "a",
        rename: { family: "Шрифт", style: "Bold" },
      }),
    ).rejects.toThrow("rename gives an empty PostScript name");
  });
});
