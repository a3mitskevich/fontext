import { describe, it, expect } from "vitest";
import { extract, ttfOriginalFont, woff2OriginalFont, textFont } from "./setup";

describe("convert engine", () => {
  const fontCases = [
    ["icon font (TTF)", ttfOriginalFont],
    ["text font (TTF)", textFont],
  ] as const;

  describe.each(fontCases)("%s", (_label, font) => {
    it("should convert to multiple formats", async () => {
      const result = await extract(Buffer.from(font), {
        fontName: "converted",
        engine: "convert",
        formats: ["ttf", "woff2", "woff"],
      });
      expect(result.ttf).toBeInstanceOf(Buffer);
      expect(result.woff2).toBeInstanceOf(Buffer);
      expect(result.woff).toBeInstanceOf(Buffer);
      expect(result.ttf?.length).toBeGreaterThan(0);
      expect(result.woff2?.length).toBeGreaterThan(0);
      expect(result.woff?.length).toBeGreaterThan(0);
    });

    it("should convert to all formats at once", async () => {
      const result = await extract(Buffer.from(font), {
        fontName: "converted",
        engine: "convert",
      });
      expect(result.svg).toBeInstanceOf(Buffer);
      expect(result.ttf).toBeInstanceOf(Buffer);
      expect(result.woff).toBeInstanceOf(Buffer);
      expect(result.woff2).toBeInstanceOf(Buffer);
      expect(result.eot).toBeInstanceOf(Buffer);
    });

    it("should produce valid SVG output", async () => {
      const result = await extract(Buffer.from(font), {
        fontName: "converted",
        engine: "convert",
        formats: ["svg"],
      });
      expect(result.svg).toBeInstanceOf(Buffer);
      expect(result.svg?.toString()).toContain("<svg");
    });

    it("should produce valid EOT output", async () => {
      const result = await extract(Buffer.from(font), {
        fontName: "converted",
        engine: "convert",
        formats: ["eot"],
      });
      expect(result.eot).toBeInstanceOf(Buffer);
      expect(result.eot?.length).toBeGreaterThan(0);
    });

    it("should include all font glyphs in meta", async () => {
      const result = await extract(Buffer.from(font), {
        fontName: "converted",
        engine: "convert",
        formats: ["ttf"],
      });
      expect(result.meta.length).toBeGreaterThan(0);
    });

    it("should include optimization report", async () => {
      const result = await extract(Buffer.from(font), {
        fontName: "converted",
        engine: "convert",
        formats: ["ttf", "woff2"],
      });
      expect(result.report.originalSize).toBe(font.length);
      expect(result.report.formats.ttf).toBeDefined();
      expect(result.report.formats.ttf?.size).toBeGreaterThan(0);
      expect(result.report.formats.woff2).toBeDefined();
      expect(result.report.formats.woff2?.size).toBeGreaterThan(0);
    });

    it("should not require glyph selectors", async () => {
      await expect(
        extract(Buffer.from(font), {
          fontName: "converted",
          engine: "convert",
          formats: ["ttf"],
        }),
      ).resolves.toBeDefined();
    });
  });

  it("should include non-BMP glyphs in convert output", async () => {
    const result = await extract(ttfOriginalFont, {
      fontName: "converted",
      engine: "convert",
      formats: ["ttf"],
    });
    const nonBmpGlyphs = result.meta.filter((m) =>
      m.unicode.some((u) => [...u].some((ch) => (ch.codePointAt(0) as number) > 0xff_ff)),
    );
    expect(nonBmpGlyphs.length).toBeGreaterThan(0);
  });

  it("should convert from WOFF2 input", async () => {
    const result = await extract(woff2OriginalFont, {
      fontName: "converted",
      engine: "convert",
      formats: ["ttf", "woff2"],
    });
    expect(result.ttf).toBeInstanceOf(Buffer);
    expect(result.woff2).toBeInstanceOf(Buffer);
    expect(result.ttf?.length).toBeGreaterThan(0);
    expect(result.woff2?.length).toBeGreaterThan(0);
  });
});
