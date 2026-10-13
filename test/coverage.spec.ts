import { describe, it, expect } from "vitest";
import ttf2woff from "ttf2woff";
import type { FontInput, SubsetOption } from "../src";
import { encodeWoff2 } from "../src/woff2";
import { extract, importFontext, textFont, variableFont } from "./setup";

async function findMissingCodePoints(data: FontInput, text: string): Promise<number[]> {
  const fontext = await importFontext();
  return fontext.findMissingCodePoints(data, text);
}

const codePointsOf = (text: string): number[] => [...text].map((char) => char.codePointAt(0) ?? 0);

describe("findMissingCodePoints", () => {
  it("should list nothing when the font maps every character", async () => {
    await expect(findMissingCodePoints(variableFont, "AVafi")).resolves.toStrictEqual([]);
    await expect(findMissingCodePoints(variableFont, "")).resolves.toStrictEqual([]);
  });

  it("should list each missing code point once, in the order it occurs", async () => {
    await expect(findMissingCodePoints(variableFont, "ЖAbЖzb")).resolves.toStrictEqual(
      codePointsOf("Жbz"),
    );
  });

  it("should list code points outside the Basic Multilingual Plane whole", async () => {
    await expect(findMissingCodePoints(variableFont, "A😀")).resolves.toStrictEqual([0x1_f6_00]);
  });

  it("should list control characters the font does not map", async () => {
    await expect(findMissingCodePoints(variableFont, "A V\nA\t")).resolves.toStrictEqual([
      0x0a, 0x09,
    ]);
  });

  it("should read TTF, WOFF, WOFF2 and an ArrayBuffer the same way", async () => {
    const text = "Привет, world!";
    const expected = codePointsOf("Привет");
    const woff = Buffer.from(ttf2woff(new Uint8Array(textFont)));
    const woff2 = await encodeWoff2(textFont);
    const arrayBuffer = new Uint8Array(textFont).buffer;
    for (const input of [textFont, woff, woff2, arrayBuffer]) {
      await expect(findMissingCodePoints(input, text)).resolves.toStrictEqual(expected);
    }
  });

  it("should reject text that is not a string and input that is not a font", async () => {
    await expect(findMissingCodePoints(textFont, 5 as unknown as string)).rejects.toThrow(
      "text must be a string",
    );
    await expect(findMissingCodePoints("font.ttf" as unknown as Buffer, "a")).rejects.toThrow(
      "Font input must be a Buffer, Uint8Array or ArrayBuffer",
    );
  });
});

const subset = (characters: string, option: Partial<SubsetOption> = {}) =>
  extract(variableFont, {
    fontName: "test",
    engine: "subset",
    characters,
    formats: ["ttf"],
    ...option,
  });

describe("missing-characters warning (subset engine)", () => {
  it("should warn about the characters the font does not map", async () => {
    const { warnings } = await subset("AЖ\n😀Ж");
    expect(warnings).toStrictEqual([
      {
        code: "missing-characters",
        message:
          'The font does not map 3 characters of the selection: U+0416 "Ж", U+000A, U+1F600 "😀"',
      },
    ]);
  });

  it("should not warn about joiners and variation selectors, which shaping hides", async () => {
    const { warnings } = await subset("A\u200D\uFE0F\u200B");
    expect(warnings).toStrictEqual([]);
  });

  it("should not warn without characters", async () => {
    const { warnings } = await subset("", { ligatures: ["fi"] });
    expect(warnings).toStrictEqual([]);
  });

  it("should not warn when the font maps every character", async () => {
    await expect(subset("AVfi")).resolves.toMatchObject({ warnings: [] });
  });

  it("should not warn about unicode ranges, which cover what the font has", async () => {
    const { warnings } = await subset("", { unicodeRanges: ["U+0041-U+005A"] });
    expect(warnings).toStrictEqual([]);
  });

  it("should name 20 characters and count the rest", async () => {
    const { warnings } = await subset("АБВГДЕЖЗИЙКЛМНОПРСТУФХЦЧ");
    const [{ message }] = warnings;
    expect(message).toMatch(/^The font does not map 24 characters of the selection: U\+0410 "А",/u);
    expect(message).toMatch(/U\+0423 "У" and 4 more$/u);
  });

  it("should warn once with a split, not in every chunk", async () => {
    const { warnings, chunks = [] } = await subset("AЖ", { split: "scripts" });
    expect(warnings.map(({ code }) => code)).toStrictEqual(["missing-characters"]);
    expect(chunks.flatMap((chunk) => chunk.warnings)).toStrictEqual([]);
  });
});
