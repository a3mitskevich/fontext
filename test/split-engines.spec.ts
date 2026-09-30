import { describe, it, expect, vi } from "vitest";
import * as hb from "harfbuzzjs";
import type { ExtractedResult, FontChunk, FontTransform, MinifyOption } from "../src";
import { createFont } from "../src/glyphs";
import type { Font } from "../src/font/font";
import { sfntTable, withTable } from "../src/font/sfnt";
import { extract, scriptsFont, ttfOriginalFont } from "./setup";
import { readHhea, readOS2 } from "./ttf-utils";

const SCRIPTS = ["latin", "greek", "cyrillic", "unknown"];
// The private use code point of the "home" icon of Material Icons
const HOME = 0xe8_8a;
const FORMATS = ["ttf", "eot", "woff", "woff2", "svg"];
const SUBSET: MinifyOption = {
  fontName: "scripts",
  engine: "subset",
  characters: " ,.01\u0301AVafiΑΩαАДа\uE000",
  formats: ["ttf"],
  split: "scripts",
};

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

const faceOf = (font: Uint8Array) => new hb.Face(new hb.Blob(font), 0);
const glyphOf = (font: Font, codePoint: number): number => font.glyphForCodePoint(codePoint) ?? 0;
const svgOf = (chunk: FontChunk): string => chunk.svg?.toString() ?? "";

/** Adds a table holding the chunk's script; the unsplit font stays as it is. */
const markScript: FontTransform = (ttf, context) =>
  context ? withTable(ttf, "TEST", new TextEncoder().encode(context.script)) : ttf;
const nameIdsOf = (font: Uint8Array): number[] => [
  ...new Set(
    faceOf(font)
      .listNames()
      .map(({ nameId }) => nameId),
  ),
];

describe("split: scripts with optimization options", () => {
  it("should apply the target and the explicit options to every chunk", async () => {
    const result = await extract(scriptsFont, {
      ...SUBSET,
      formats: undefined,
      target: "runtime",
      nameIds: [1, 6],
      dropTables: ["kern"],
      layoutFeatures: ["kern"],
    } as MinifyOption);
    for (const chunk of [result, ...chunksOf(result)]) {
      expect(FORMATS.filter((format) => format in chunk)).toStrictEqual(["ttf"]);
      const ttf = ttfOf(chunk);
      expect(nameIdsOf(ttf)).toStrictEqual([1, 6]);
      expect(sfntTable(ttf, "kern")).toBeUndefined();
    }
    // Only the kern feature kept: the latin chunk no longer forms "fi"
    const latin = await createFont(ttfOf(chunksOf(result)[0]));
    expect(latin.shape("fi")).toHaveLength(2);
  });

  it("should apply the Safari fix to every chunk", async () => {
    const chunks = chunksOf(await extract(scriptsFont, { ...SUBSET, safariFix: true }));
    for (const chunk of chunks) {
      const os2 = readOS2(ttfOf(chunk));
      expect(os2.fsSelection & 0x80).toBe(0x80);
      expect(readHhea(ttfOf(chunk)).ascent).toBe(os2.sTypoAscender);
    }
  });

  it("should call the transform for the whole font, then once per chunk with its script", async () => {
    const transform = vi.fn<FontTransform>(markScript);
    const result = await extract(scriptsFont, { ...SUBSET, transform });
    expect(transform.mock.calls.map((args) => args.slice(1))).toStrictEqual([
      [],
      ...SCRIPTS.map((script) => [{ script }]),
    ]);
    expect(sfntTable(ttfOf(result), "TEST")).toBeUndefined();
    for (const chunk of chunksOf(result)) {
      const table = sfntTable(ttfOf(chunk), "TEST");
      expect(new TextDecoder().decode(table)).toBe(chunk.script);
    }
  });
});

describe("split: scripts (convert engine)", () => {
  it("should split every code point of the font", async () => {
    const source = await createFont(scriptsFont);
    const result = await extract(scriptsFont, {
      fontName: "scripts",
      engine: "convert",
      formats: ["ttf", "svg"],
      split: "scripts",
    });
    const chunks = chunksOf(result);
    expect(chunks.map(({ script }) => script)).toStrictEqual(SCRIPTS);
    const covered = chunks.flatMap(({ codePoints }) => codePoints);
    expect([...new Set(covered)].toSorted((a, b) => a - b)).toStrictEqual(source.codePoints);
    for (const chunk of chunks) {
      expect(svgOf(chunk)).toContain("<font ");
      expect([...svgOf(chunk).matchAll(/<glyph /gu)]).toHaveLength(chunk.meta.length);
    }
  });

  it("should split the SVG font alone by the source's code points", async () => {
    const option = { fontName: "s", engine: "convert", formats: ["svg"], split: "scripts" };
    const chunks = chunksOf(await extract(scriptsFont, option as MinifyOption));
    expect(chunks.map(({ script, codePoints }) => [script, codePoints.length])).toStrictEqual([
      ["latin", 11],
      ["greek", 9],
      ["cyrillic", 9],
      ["unknown", 7],
    ]);
    expect(chunks.filter((chunk) => "ttf" in chunk)).toStrictEqual([]);
    expect(chunks.map((chunk) => svgOf(chunk))).not.toContain("");
  });
});

describe("split: scripts with an icon font", () => {
  // Material Icons: ligature letters are Latin, icons have private use code points (Unknown)
  const ICONS: MinifyOption = {
    fontName: "icons",
    engine: "subset",
    ligatures: ["home", "search"],
    formats: ["ttf", "woff2"],
    split: "scripts",
  };

  it("should give the ligatures one latin chunk, the unsplit font", async () => {
    const result = await extract(ttfOriginalFont, ICONS);
    const [chunk, ...rest] = chunksOf(result);
    expect(rest).toStrictEqual([]);
    expect(chunk.script).toBe("latin");
    expect(chunk.ttf).toStrictEqual(result.ttf);
    expect(chunk.woff2).toStrictEqual(result.woff2);
    expect(chunk.unicodeRange).toBe("U+0061,U+0063,U+0065,U+0068,U+006D,U+006F,U+0072-0073");
  });

  it("should give private use code points an unknown chunk that draws the icon", async () => {
    const source = await createFont(ttfOriginalFont);
    const result = await extract(ttfOriginalFont, {
      ...ICONS,
      ligatures: ["home"],
      unicodeRanges: ["U+E88A"],
    } as MinifyOption);
    const chunks = chunksOf(result);
    expect(chunks.map(({ script, unicodeRange }) => [script, unicodeRange])).toStrictEqual([
      ["latin", "U+0065,U+0068,U+006D,U+006F"],
      ["unknown", "U+E88A"],
    ]);
    const unknown = await createFont(ttfOf(chunks[1]));
    const glyph = glyphOf(unknown, HOME);
    expect(glyph).not.toBe(0);
    expect(unknown.svgPath(glyph)).toBe(source.svgPath(glyphOf(source, HOME)));
    // The ligature stays in the latin chunk
    const latin = await createFont(ttfOf(chunks[0]));
    expect(latin.shape("home")).toHaveLength(1);
    expect(unknown.shape("home").every(({ id }) => id === 0)).toBe(true);
  });
});
