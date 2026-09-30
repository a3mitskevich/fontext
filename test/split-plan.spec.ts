import { describe, it, expect } from "vitest";
import type { MinifyOption } from "../src";
import { planChunks } from "../src/engines/split";
import { extract, scriptsFont, ttfOriginalFont } from "./setup";

const codePointsOf = (text: string): number[] => [...text].map((char) => char.codePointAt(0) ?? 0);
const textOf = (codePoints: readonly number[]): string =>
  String.fromCodePoint(...codePoints.toSorted((a, b) => a - b));

/** Each chunk as script, its code points as sorted text and its ligatures. */
const plansOf = (characters: string, ligatures?: string[]) =>
  planChunks({ codePoints: codePointsOf(characters), ligatures }).map(({ script, selection }) => [
    script,
    textOf(selection.codePoints),
    selection.ligatures,
  ]);

describe("planChunks", () => {
  it("should give every chunk the Common and Inherited code points, in order of each script's first code point", () => {
    expect(plansOf("Жa, 1Ωb\u0301\uE000")).toStrictEqual([
      ["latin", " ,1ab\u0301", []],
      ["greek", " ,1\u0301Ω", []],
      ["cyrillic", " ,1\u0301Ж", []],
      ["unknown", " ,1\u0301\uE000", []],
    ]);
  });

  it("should give one common chunk when every code point is Common or Inherited", () => {
    expect(plansOf("0123 .,\u0301")).toStrictEqual([["common", " ,.0123\u0301", []]]);
  });

  it("should keep the selection of one script as it is", () => {
    const selection = { codePoints: codePointsOf("AB 1"), ligatures: ["fi", "3d_rotation"] };
    const [chunk, ...rest] = planChunks(selection);
    expect(rest).toStrictEqual([]);
    expect(chunk.script).toBe("latin");
    expect(chunk.selection.ligatures).toStrictEqual(selection.ligatures);
    expect(textOf(chunk.selection.codePoints)).toBe(textOf(selection.codePoints));
  });

  it("should put a ligature in the chunk of its letters' script, not deciding by Common letters", () => {
    expect(plansOf("Ж", ["3d_rotation", "фы"])).toStrictEqual([
      // Here "3" and "_" stay letters of the ligature, without layout closure
      ["latin", "", ["3d_rotation"]],
      // Every other chunk keeps them as code points
      ["cyrillic", "3_Ж", ["фы"]],
    ]);
  });

  it("should order a script by its first code point among code points and ligature letters", () => {
    expect(plansOf("Ω", ["ab"]).map(([script]) => script)).toStrictEqual(["latin", "greek"]);
  });

  it("should put a ligature of Common letters in every chunk", () => {
    expect(plansOf("aЖ", ["->", ""])).toStrictEqual([
      ["latin", "a", ["->"]],
      ["cyrillic", "Ж", ["->"]],
    ]);
    expect(plansOf("", ["->"])).toStrictEqual([["common", "", ["->"]]]);
  });

  it("should reject a ligature of two scripts", () => {
    expect(() => planChunks({ codePoints: [], ligatures: ["_Aα1"] })).toThrow(
      'Ligature "_Aα1" mixes the scripts latin and greek, so split: "scripts" puts its letters in different fonts, where it can\'t form',
    );
  });
});

describe("split validation", () => {
  it.each([
    ["an unknown value", "words"],
    ["a wrong type", true],
    ["an empty string", ""],
  ])("should reject %s", async (_, split) => {
    const option = { fontName: "s", engine: "subset", characters: "A", split };
    await expect(extract(scriptsFont, option as unknown as MinifyOption)).rejects.toThrow(
      `Invalid split: ${JSON.stringify(split)}. Valid values: scripts`,
    );
  });

  it("should reject split with the icon engine", async () => {
    const option = { fontName: "icons", ligatures: ["home"], split: "scripts" };
    await expect(extract(ttfOriginalFont, option as unknown as MinifyOption)).rejects.toThrow(
      "split is not supported by the icon engine: its glyphs are icons, not letters of a script. Use the subset or convert engine",
    );
  });

  it("should reject a ligature of two scripts before subsetting", async () => {
    const option: MinifyOption = {
      fontName: "s",
      engine: "subset",
      ligatures: ["fi", "Aα"],
      split: "scripts",
    };
    await expect(extract(scriptsFont, option)).rejects.toThrow(
      'Ligature "Aα" mixes the scripts latin and greek',
    );
  });

  it("should leave out chunks when split is not set", async () => {
    const option: MinifyOption = { fontName: "s", engine: "subset", characters: "AΩЖ" };
    const result = await extract(scriptsFont, option);
    expect(result).not.toHaveProperty("chunks");
  });
});
