import { describe, it, expect } from "vitest";
import * as hb from "harfbuzzjs";
import type { ExtractedResult, FontChunk, MinifyOption, SubsetOption } from "../src";
import { createFont } from "../src/glyphs";
import type { Font } from "../src/font/font";
import { parseUnicodeRanges } from "../src/core";
import { extract, scriptsFont } from "./setup";
import { readKernPairs } from "./ttf-utils";

// Every character of the fixture: Common, Inherited, Latin, Greek, Cyrillic and private use
const COMMON = " ,.01\u0301";
const LATIN = "AVafi";
const GREEK = "ΑΩα";
const CYRILLIC = "АДа";
const PRIVATE_USE = "\uE000";
const ALL = `${COMMON}${LATIN}${GREEK}${CYRILLIC}${PRIVATE_USE}`;

const UNSPLIT: SubsetOption = {
  fontName: "scripts",
  engine: "subset",
  characters: ALL,
  formats: ["ttf", "woff2"],
};
const SPLIT: SubsetOption = { ...UNSPLIT, split: "scripts" };

const codePointsOf = (text: string): number[] =>
  [...text].map((char) => char.codePointAt(0) ?? 0).toSorted((a, b) => a - b);

function chunksOf(result: ExtractedResult): FontChunk[] {
  if (!result.chunks) {
    throw new Error("The result has no chunks");
  }
  return result.chunks;
}

function ttfOf(font: FontChunk | ExtractedResult): Buffer {
  if (!font.ttf) {
    throw new Error("No TTF in the output");
  }
  return font.ttf;
}

const glyphOf = (font: Font, codePoint: number): number => font.glyphForCodePoint(codePoint) ?? 0;
const cmapOf = (font: Uint8Array): number[] =>
  [...new hb.Face(new hb.Blob(font), 0).collectUnicodes()].toSorted((a, b) => a - b);

/** Kern pairs of a font as "left right value" of the characters each glyph is mapped from. */
async function kernTextOf(font: Uint8Array): Promise<string[]> {
  const opened = await createFont(font);
  const charOf = (glyph: number) => opened.stringsForGlyph(glyph)[0];
  return readKernPairs(font)
    .map(([left, right, value]) => `${charOf(left)}${charOf(right)} ${value}`)
    .toSorted();
}

describe("split: scripts (subset engine)", () => {
  it("should give a chunk per script in order of its first code point", async () => {
    const chunks = chunksOf(await extract(scriptsFont, SPLIT));
    expect(chunks.map(({ script }) => script)).toStrictEqual([
      "latin",
      "greek",
      "cyrillic",
      "unknown",
    ]);
  });

  it("should map exactly the script's code points and the Common and Inherited ones", async () => {
    const chunks = chunksOf(await extract(scriptsFont, SPLIT));
    const own = [LATIN, GREEK, CYRILLIC, PRIVATE_USE];
    for (const [index, chunk] of chunks.entries()) {
      const expected = codePointsOf(`${COMMON}${own[index]}`);
      expect(cmapOf(ttfOf(chunk))).toStrictEqual(expected);
      expect(chunk.codePoints).toStrictEqual(expected);
      expect(chunk.meta.flatMap(({ unicode }) => unicode).toSorted()).toStrictEqual(
        [...`${COMMON}${own[index]}`].toSorted(),
      );
    }
  });

  it("should draw every code point with the source outline and advance", async () => {
    const source = await createFont(scriptsFont);
    const chunks = chunksOf(await extract(scriptsFont, SPLIT));
    for (const chunk of chunks) {
      const font = await createFont(ttfOf(chunk));
      for (const codePoint of chunk.codePoints) {
        const [glyph, sourceGlyph] = [font, source].map((f) => glyphOf(f, codePoint));
        expect(glyph, `U+${codePoint.toString(16)} in ${chunk.script}`).not.toBe(0);
        expect(font.svgPath(glyph)).toBe(source.svgPath(sourceGlyph));
        expect(font.advanceWidth(glyph)).toBe(source.advanceWidth(sourceGlyph));
      }
    }
  });

  it("should cover every selected code point by exactly one unicodeRange, Common in latin", async () => {
    const chunks = chunksOf(await extract(scriptsFont, SPLIT));
    const ranges = chunks.map(({ script, unicodeRange }) => [script, unicodeRange]);
    expect(ranges).toStrictEqual([
      ["latin", "U+0020,U+002C,U+002E,U+0030-0031,U+0041,U+0056,U+0061,U+0066,U+0069,U+0301"],
      ["greek", "U+0391,U+03A9,U+03B1"],
      ["cyrillic", "U+0410,U+0414,U+0430"],
      ["unknown", "U+E000"],
    ]);
    const covered = chunks.flatMap(({ unicodeRange }) =>
      parseUnicodeRanges(unicodeRange.split(",")),
    );
    expect(covered.toSorted((a, b) => a - b)).toStrictEqual(codePointsOf(ALL));
  });

  it("should give Common to the first chunk's unicodeRange without latin", async () => {
    const option = { ...SPLIT, characters: `${COMMON}${CYRILLIC}${GREEK}` };
    const chunks = chunksOf(await extract(scriptsFont, option));
    expect(chunks.map(({ script, unicodeRange }) => [script, unicodeRange])).toStrictEqual([
      ["greek", "U+0020,U+002C,U+002E,U+0030-0031,U+0301,U+0391,U+03A9,U+03B1"],
      ["cyrillic", "U+0410,U+0414,U+0430"],
    ]);
  });

  it("should give one common chunk for Common and Inherited code points alone", async () => {
    const result = await extract(scriptsFont, { ...SPLIT, characters: COMMON });
    const [chunk, ...rest] = chunksOf(result);
    expect(rest).toStrictEqual([]);
    expect(chunk.script).toBe("common");
    expect(chunk.unicodeRange).toBe("U+0020,U+002C,U+002E,U+0030-0031,U+0301");
    expect(chunk.ttf).toStrictEqual(result.ttf);
  });

  it("should keep the legacy kern pairs of each chunk's glyphs", async () => {
    const result = await extract(scriptsFont, SPLIT);
    const pairs = await Promise.all(chunksOf(result).map((chunk) => kernTextOf(ttfOf(chunk))));
    expect(pairs).toStrictEqual([["1A -30", "AV -80"], ["ΑΩ -20"], ["1Д -40"], []]);
    // The pair across scripts stays in the unsplit font only
    await expect(kernTextOf(ttfOf(result))).resolves.toContain("VА -60");
    expect(chunksOf(result).flatMap(({ warnings }) => warnings)).toStrictEqual([]);
  });

  it("should keep the top-level result as without split", async () => {
    const plain = await extract(scriptsFont, UNSPLIT);
    const { chunks, ...result } = await extract(scriptsFont, SPLIT);
    expect(chunks).toBeDefined();
    expect(result).toStrictEqual(plain);
  });

  it("should give the unsplit font as the chunk of a selection of one script", async () => {
    const option = { ...SPLIT, characters: `${COMMON}АД`, ligatures: [] };
    const result = await extract(scriptsFont, option);
    const [chunk, ...rest] = chunksOf(result);
    expect(rest).toStrictEqual([]);
    expect(chunk.script).toBe("cyrillic");
    expect(chunk.ttf).toStrictEqual(result.ttf);
    expect(chunk.woff2).toStrictEqual(result.woff2);
    expect(chunk.meta).toStrictEqual(result.meta);
  });

  it("should split only the code points the font maps", async () => {
    // Coptic, Armenian and Hebrew are in the range, the font has none of them
    const option = { ...SPLIT, characters: undefined, unicodeRanges: ["U+0000-05FF"] };
    const chunks = chunksOf(await extract(scriptsFont, option));
    expect(chunks.map(({ script }) => script)).toStrictEqual(["latin", "greek", "cyrillic"]);
  });

  it("should give the same chunks and bytes on every run", async () => {
    const [first, second] = await Promise.all([
      extract(scriptsFont, SPLIT),
      extract(scriptsFont, SPLIT),
    ]);
    expect(second.chunks).toStrictEqual(first.chunks);
  });

  it("should report each chunk's sizes against the source", async () => {
    const chunks = chunksOf(await extract(scriptsFont, SPLIT));
    for (const chunk of chunks) {
      expect(chunk.report.originalSize).toBe(scriptsFont.length);
      expect(chunk.report.formats.ttf?.size).toBe(chunk.ttf?.length);
      expect(chunk.report.formats.woff2?.size).toBe(chunk.woff2?.length);
      expect(["eot", "woff", "svg"].filter((format) => format in chunk)).toStrictEqual([]);
    }
  });
});

describe("split: scripts with ligatures", () => {
  const LIGATURES: MinifyOption = {
    fontName: "scripts",
    engine: "subset",
    characters: "АД 0",
    ligatures: ["fi"],
    formats: ["ttf"],
    split: "scripts",
  };

  it("should put the ligature in the chunk of its script and form it there", async () => {
    const chunks = chunksOf(await extract(scriptsFont, LIGATURES));
    expect(
      chunks.map(({ script, codePoints }) => [script, String.fromCodePoint(...codePoints)]),
    ).toStrictEqual([
      ["latin", " 0fi"],
      ["cyrillic", " 0АД"],
    ]);
    const [latin, cyrillic] = await Promise.all(chunks.map((chunk) => createFont(ttfOf(chunk))));
    expect(latin.shape("fi")).toHaveLength(1);
    expect(latin.shape("fi")[0].id).not.toBe(0);
    expect(cyrillic.shape("fi").map(({ id }) => id)).toStrictEqual([0, 0]);
  });
});
