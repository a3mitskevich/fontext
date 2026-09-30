import { afterEach, describe, it, expect, vi } from "vitest";
import { groupByScript, scriptsOf, toUnicodeRange } from "../src/scripts";

const LAST_CODE_POINT = 0x10_ff_ff;
const range = (first: number, last: number): number[] =>
  Array.from({ length: last - first + 1 }, (_, index) => first + index);
const codePointsOf = (text: string): number[] => [...text].map((char) => char.codePointAt(0) ?? 0);
const scriptOf = (char: string): string => scriptsOf(codePointsOf(char))[0];

describe("scriptsOf", () => {
  it.each([
    ["A", "latin"],
    ["ÿ", "latin"],
    ["Ж", "cyrillic"],
    ["Ω", "greek"],
    ["中", "han"],
    ["ア", "katakana"],
    ["א", "hebrew"],
    ["\u{10300}", "old_italic"],
    ["\u{1D800}", "signwriting"],
  ])("should name the script of %j in lowercase (%s)", (char, script) => {
    expect(scriptOf(char)).toBe(script);
  });

  it.each([
    ["space", " "],
    ["digit", "7"],
    ["punctuation", ","],
    ["no-break space", "\u00A0"],
    ["emoji", "😀"],
    ["combining acute accent (Inherited)", "\u0301"],
    ["zero width joiner (Inherited)", "\u200D"],
  ])("should put the %s in common", (_, char) => {
    expect(scriptOf(char)).toBe("common");
  });

  it.each([
    ["private use", "\uE000"],
    ["supplementary private use", "\u{F0000}"],
    ["unassigned", "\u0378"],
    ["noncharacter", "\uFFFF"],
  ])("should put %s code points in unknown", (_, char) => {
    expect(scriptOf(char)).toBe("unknown");
  });

  it("should give unknown exactly to the code points of Script=Unknown in this runtime", () => {
    // Fails when the runtime knows a script the list in src/scripts.ts doesn't have yet
    const unknown = /^\p{Script=Unknown}$/u;
    const all = range(0, LAST_CODE_POINT);
    const scripts = scriptsOf(all);
    const mismatched = all.filter(
      (codePoint, index) =>
        unknown.test(String.fromCodePoint(codePoint)) !== (scripts[index] === "unknown"),
    );
    expect(mismatched).toStrictEqual([]);
  });

  it("should not depend on the order of the code points", () => {
    const codePoints = [0x4_10, 0x41, 0x30, 0x3_91, 0xe0_00, 0x3_01];
    const ordered = scriptsOf(codePoints);
    const scripts = new Map(codePoints.map((cp, index) => [cp, ordered[index]]));
    const reversed = codePoints.toReversed();
    expect(scriptsOf(reversed)).toStrictEqual(reversed.map((cp) => scripts.get(cp)));
  });
});

describe("script classification cost", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // Han of the BMP and of Extension B, as many code points as a CJK font maps
  const HAN = [...range(0x4e_00, 0x9f_ff), ...range(0x2_00_00, 0x2_a6_df)];

  it("should test a run of one script about once per code point", () => {
    const test = vi.spyOn(RegExp.prototype, "test");
    const groups = groupByScript(HAN);
    expect([...groups.keys()]).toStrictEqual(["han"]);
    expect(groups.get("han")).toHaveLength(HAN.length);
    // The first code point tries every script before Han; each one after it tries Han once
    expect(test.mock.calls.length).toBeLessThan(HAN.length + 200);
  });

  it("should classify every code point in well under the test timeout", () => {
    const start = performance.now();
    scriptsOf(range(0, LAST_CODE_POINT));
    // About 60 ms locally; the bound only catches a return to one test per script and code point
    expect(performance.now() - start).toBeLessThan(5000);
  });
});

describe("groupByScript", () => {
  it("should group unique code points ascending, ordered by the first of each script", () => {
    const text = "ЖAж 1ΩA\u0301\uE000a";
    const groups = groupByScript(codePointsOf(text));
    expect([...groups]).toStrictEqual([
      ["common", [0x20, 0x31, 0x3_01]],
      ["latin", [0x41, 0x61]],
      ["greek", [0x3_a9]],
      ["cyrillic", [0x4_16, 0x4_36]],
      ["unknown", [0xe0_00]],
    ]);
  });

  it("should give no groups for no code points", () => {
    expect(groupByScript([]).size).toBe(0);
  });
});

describe("toUnicodeRange", () => {
  it.each([
    [[], ""],
    [[0x20], "U+0020"],
    [[0x41, 0x42, 0x43], "U+0041-0043"],
    [[0x4_5f, 0x20, 0x4_00, 0x7e, 0x21, 0x4_00], "U+0020-0021,U+007E,U+0400,U+045F"],
    [[0x1_f6_00, 0x1_f6_01, 0x10_ff_ff], "U+1F600-1F601,U+10FFFF"],
    [range(0, 0x7f), "U+0000-007F"],
  ])("should write %j as %j", (codePoints, expected) => {
    expect(toUnicodeRange(codePoints)).toBe(expected);
  });
});
