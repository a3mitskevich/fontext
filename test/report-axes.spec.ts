import { describe, it, expect } from "vitest";
import type { AxisReport } from "../src";
import { encodeWoff2 } from "../src/woff2";
import { extract, textFont, variableFont } from "./setup";

// The axes of assets/font-variable.ttf, see scripts/make-variable-fixture.mjs
const WGHT: AxisReport = { tag: "wght", min: 100, default: 400, max: 900 };
const WDTH: AxisReport = { tag: "wdth", min: 75, default: 100, max: 100 };

describe("axes in the report", () => {
  it("should leave the axes out for a static font", async () => {
    const { report } = await extract(textFont, {
      fontName: "text",
      engine: "subset",
      characters: "abc",
      formats: ["ttf"],
    });
    expect(report.axes).toBeUndefined();
  });

  it("should list every axis as variable when none is set", async () => {
    const { report } = await extract(variableFont, {
      fontName: "test",
      engine: "subset",
      characters: "AV",
      formats: ["ttf"],
    });
    expect(report.axes).toStrictEqual({ pinned: {}, variable: [WGHT, WDTH] });
  });

  it("should list pinned axes with their values and narrowed ones with their range", async () => {
    const { report } = await extract(variableFont, {
      fontName: "test",
      engine: "convert",
      formats: ["woff2"],
      axes: { wght: { min: 600, max: 700 }, wdth: 80 },
    });
    // A range keeps the default clamped into it
    expect(report.axes).toStrictEqual({
      pinned: { wdth: 80 },
      variable: [{ tag: "wght", min: 600, default: 600, max: 700 }],
    });
  });

  it("should list an axis left unset as variable after pinning another", async () => {
    const { report } = await extract(await encodeWoff2(variableFont), {
      fontName: "test",
      engine: "subset",
      characters: "AV",
      formats: ["ttf"],
      axes: { wght: 700 },
    });
    expect(report.axes).toStrictEqual({ pinned: { wght: 700 }, variable: [WDTH] });
  });

  it("should pin every axis of the icon engine, unset ones at their default", async () => {
    const { report } = await extract(variableFont, {
      fontName: "test",
      unicodeRanges: ["U+0041"],
      formats: ["ttf"],
      axes: { wght: 700 },
    });
    expect(report.axes).toStrictEqual({ pinned: { wght: 700, wdth: 100 }, variable: [] });
  });

  it("should leave the axes out when only SVG is built", async () => {
    const { report } = await extract(variableFont, {
      fontName: "test",
      engine: "convert",
      formats: ["svg"],
    });
    expect(report.axes).toBeUndefined();
  });

  it("should report the axes of every chunk", async () => {
    const { report, chunks = [] } = await extract(variableFont, {
      fontName: "test",
      engine: "convert",
      formats: ["ttf"],
      axes: { wght: 700 },
      split: "scripts",
    });
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks.map((chunk) => chunk.report.axes)).toStrictEqual(chunks.map(() => report.axes));
  });
});
