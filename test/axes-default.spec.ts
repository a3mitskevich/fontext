import { describe, it, expect } from "vitest";
import * as hb from "harfbuzzjs";
import type { Axes, MinifyOption } from "../src";
import { assertRenameOption } from "../src/engines/rename-option";
import { extract, textFont, variableFont } from "./setup";

// The fixture's axes: wght 100-400-900, wdth 75-100-100
const subsetOf = (axes: Axes, extra: Partial<MinifyOption> = {}): MinifyOption =>
  ({
    fontName: "test",
    engine: "subset",
    characters: "AVa fi",
    formats: ["ttf"],
    axes,
    ...extra,
  }) as MinifyOption;

async function ttfOf(font: Buffer, option: MinifyOption): Promise<Buffer> {
  const { ttf } = await extract(font, option);
  if (!ttf) {
    throw new Error("No TTF in the output");
  }
  return ttf;
}

const faceOf = (ttf: Buffer): hb.Face => new hb.Face(new hb.Blob(ttf), 0);

describe("axes pinned at their default", () => {
  it.each<[string, Axes, Axes]>([
    ["an axis at its default", { wght: "default" }, { wght: 400 }],
    ["every axis with *", { "*": "default" }, { wght: 400, wdth: 100 }],
    ["the axes * leaves", { wght: 700, "*": "default" }, { wght: 700, wdth: 100 }],
    ["named axes over *", { "*": "default", wdth: 75 }, { wght: 400, wdth: 75 }],
  ])("should pin %s like their values", async (_, axes, values) => {
    const expected = await ttfOf(variableFont, subsetOf(values));
    await expect(ttfOf(variableFont, subsetOf(axes))).resolves.toStrictEqual(expected);
  });

  it("should give a static font with * in every engine", async () => {
    const axes: Axes = { wght: 700, "*": "default" };
    const options: MinifyOption[] = [
      subsetOf(axes),
      { fontName: "test", engine: "convert", formats: ["ttf"], axes },
      { fontName: "test", unicodeRanges: ["U+0041"], formats: ["ttf"], axes },
    ];
    for (const option of options) {
      const { ttf = Buffer.alloc(0), report, warnings } = await extract(variableFont, option);
      expect(faceOf(ttf).getAxisInfos()).toStrictEqual({});
      expect(report.axes).toStrictEqual({ pinned: { wght: 700, wdth: 100 }, variable: [] });
      expect(warnings).toStrictEqual([]);
    }
  });

  it("should keep a range next to *", async () => {
    const { report, warnings } = await extract(
      variableFont,
      subsetOf({ wght: { min: 600, max: 700 }, "*": "default" }),
    );
    expect(report.axes).toStrictEqual({
      pinned: { wdth: 100 },
      variable: [{ tag: "wght", min: 600, default: 600, max: 700 }],
    });
    expect(warnings).toStrictEqual([]);
  });

  it.each<[string, Axes, string]>([
    ["* with a value", { "*": 700 } as unknown as Axes, 'Invalid value for axes["*"]: 700'],
    ["an unknown axis at its default", { opsz: "default" }, 'Unknown axis "opsz"'],
  ])("should reject %s", async (_, axes, message) => {
    await expect(extract(variableFont, subsetOf(axes))).rejects.toThrow(message);
  });

  it("should reject * on a static font", async () => {
    const option = subsetOf({ "*": "default" }, { characters: "abc" });
    await expect(extract(textFont, option)).rejects.toThrow(
      "axes is set, but the font has no variation axes",
    );
  });
});

describe("the unpinned-axes warning", () => {
  const UNPINNED = {
    code: "unpinned-axes",
    message:
      'The output stays variable along wdth 75-100, which axes leaves out: pin them, or add "*": "default" to pin them at their default',
  };

  it("should warn when the output stays variable along axes left out", async () => {
    const subset = await extract(variableFont, subsetOf({ wght: 700 }));
    expect(subset.warnings).toStrictEqual([UNPINNED]);
    const convert = await extract(variableFont, {
      fontName: "test",
      engine: "convert",
      formats: ["ttf"],
      axes: { wght: "default" },
    });
    expect(convert.warnings).toStrictEqual([UNPINNED]);
  });

  it("should warn the unsplit font only", async () => {
    const { warnings, chunks = [] } = await extract(
      variableFont,
      subsetOf({ wght: 700 }, { split: "scripts" }),
    );
    expect(warnings).toStrictEqual([UNPINNED]);
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks.flatMap((chunk) => chunk.warnings)).toStrictEqual([]);
  });

  it.each<[string, MinifyOption]>([
    ["without axes", subsetOf({})],
    ["with a range", subsetOf({ wght: { min: 600, max: 700 } })],
    ["with every axis pinned", subsetOf({ wght: 700, wdth: 75 })],
    ["in the icon engine", { fontName: "test", unicodeRanges: ["U+0041"], axes: { wght: 700 } }],
  ])("should not warn %s", async (_, option) => {
    const { warnings } = await extract(variableFont, option);
    expect(warnings).toStrictEqual([]);
  });
});

describe("rename at the default weight", () => {
  it.each<[string, Axes]>([
    ["wght at its default", { wght: "default", wdth: 75 }],
    ["wght pinned by *", { "*": "default" }],
  ])("should name the style after %s", async (_, axes) => {
    expect(() => assertRenameOption(true, axes)).not.toThrow();
    const ttf = await ttfOf(variableFont, subsetOf(axes, { rename: true }));
    expect(faceOf(ttf).getName(2, "en")).toBe("Regular");
  });

  it("should reject a default weight without a style name", async () => {
    // Narrowed to 650-700, the font's default becomes 650
    const narrowed = await ttfOf(variableFont, {
      fontName: "test",
      engine: "convert",
      formats: ["ttf"],
      axes: { wght: { min: 650, max: 700 } },
    });
    await expect(
      extract(narrowed, subsetOf({ wght: "default" }, { rename: true })),
    ).rejects.toThrow("Cannot name weight 650: set rename.style");
  });

  it("should reject rename: true when * pins no wght", async () => {
    const widthOnly = await ttfOf(variableFont, {
      fontName: "test",
      engine: "convert",
      formats: ["ttf"],
      axes: { wght: 700 },
    });
    await expect(
      extract(widthOnly, subsetOf({ "*": "default" }, { rename: true })),
    ).rejects.toThrow("rename: true takes the style from a pinned wght axis");
    const ttf = await ttfOf(widthOnly, subsetOf({ "*": "default" }, { rename: { family: "B" } }));
    expect(faceOf(ttf).getName(1, "en")).toBe("B");
  });
});
