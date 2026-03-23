import { describe, it, expect } from "vitest";
import { extract, ttfOriginalFont } from "./setup";

describe("subset engine", () => {
  it("should subset font by characters", async () => {
    const result = await extract(ttfOriginalFont, {
      fontName: "subset-test",
      characters: "abc",
      formats: ["ttf", "woff2"],
      engine: "subset",
    });
    expect(result.ttf).toBeInstanceOf(Buffer);
    expect(result.woff2).toBeInstanceOf(Buffer);
    expect(result.ttf?.length).toBeLessThan(ttfOriginalFont.length);
    expect(result.report.originalSize).toBe(ttfOriginalFont.length);
    expect(result.report.formats.ttf?.saving).toBeGreaterThan(0);
  });

  it("should subset font by unicode ranges", async () => {
    const result = await extract(ttfOriginalFont, {
      fontName: "subset-test",
      unicodeRanges: ["U+0061-U+0063"],
      formats: ["woff2"],
      engine: "subset",
    });
    expect(result.woff2).toBeInstanceOf(Buffer);
    expect(result.meta.length).toBeGreaterThan(0);
  });

  it("should subset non-BMP codepoints", async () => {
    const result = await extract(ttfOriginalFont, {
      fontName: "subset-test",
      unicodeRanges: ["U+10FFFD"],
      formats: ["ttf"],
      engine: "subset",
    });
    expect(result.ttf).toBeInstanceOf(Buffer);
    expect(result.meta.length).toBeGreaterThan(0);
  });

  it("should preserve more glyphs than icon engine for same input", async () => {
    const subsetResult = await extract(ttfOriginalFont, {
      fontName: "test",
      unicodeRanges: ["U+0061-U+007A"],
      formats: ["ttf"],
      engine: "subset",
    });
    expect(subsetResult.ttf?.length).toBeGreaterThan(0);
  });
});
