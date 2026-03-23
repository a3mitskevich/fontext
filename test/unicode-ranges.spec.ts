import { describe, it, expect } from "vitest";
import { extract, ttfOriginalFont } from "./setup";

describe("unicode ranges", () => {
  it("should extract glyphs by unicode range", async () => {
    const { meta } = await extract(ttfOriginalFont, {
      fontName: "test-icons",
      unicodeRanges: ["U+0061-U+0063"],
      formats: ["ttf"],
    });
    expect(meta.length).toBe(3);
  });

  it("should extract glyphs by single unicode point", async () => {
    const { meta } = await extract(ttfOriginalFont, {
      fontName: "test-icons",
      unicodeRanges: ["U+0061"],
      formats: ["ttf"],
    });
    expect(meta.length).toBe(1);
  });

  it("should extract non-BMP glyph by unicode range", async () => {
    const { meta } = await extract(ttfOriginalFont, {
      fontName: "test-icons",
      unicodeRanges: ["U+10FFFD"],
      formats: ["ttf"],
    });
    expect(meta.length).toBe(1);
  });

  it("should extract non-BMP range spanning multiple codepoints", async () => {
    const { meta } = await extract(ttfOriginalFont, {
      fontName: "test-icons",
      unicodeRanges: ["U+10FFFC-U+10FFFD"],
      formats: ["ttf"],
    });
    expect(meta.length).toBeGreaterThanOrEqual(1);
  });

  it("should throw on codepoint exceeding U+10FFFF", async () => {
    await expect(
      extract(ttfOriginalFont, {
        fontName: "test-icons",
        unicodeRanges: ["U+110000"],
        formats: ["ttf"],
      }),
    ).rejects.toThrow("Codepoint exceeds U+10FFFF");
  });

  it("should throw on invalid unicode range format", async () => {
    await expect(
      extract(ttfOriginalFont, {
        fontName: "test-icons",
        unicodeRanges: ["invalid"],
        formats: ["ttf"],
      }),
    ).rejects.toThrow("Invalid unicode range");
  });
});
