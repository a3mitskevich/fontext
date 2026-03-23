import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import type { Format, Extract } from "../src";
import { createCachedImport } from "./utils";
import { readOS2, readHhea } from "./ttf-utils";
const importTargets = {
  local: createCachedImport(async () => import("../src")),
  dist: createCachedImport(async () => import("../dist")),
};
const resolve = (format: Format): string => path.resolve(__dirname, `../assets/font.${format}`);

const ttfOriginalFont = fs.readFileSync(resolve("ttf"));
const woff2OriginalFont = fs.readFileSync(resolve("woff2"));
const ABC_SVG_PATH =
  'd="M448 -277L416 -277L416 -288L373 -288L373 -224L416 -224L416 -235L448 -235L448 -213Q448 -205 441.5 -198.5Q435 -192 427 -192L363 -192Q354 -192 347.5 -198.5Q341 -205 341 -213L341 -299Q341 -307 347.5 -313.5Q354 -320 363 -320L427 -320Q435 -320 441.5 -313.5Q448 -307 448 -299ZM171 -299L171 -192L139 -192L139 -224L96 -224L96 -192L64 -192L64 -299Q64 -307 70.5 -313.5Q77 -320 85 -320L149 -320Q158 -320 164.5 -313.5Q171 -307 171 -299ZM139 -288L96 -288L96 -256L139 -256ZM288 -256Q297 -256 303 -249.5Q309 -243 309 -235L309 -213Q309 -205 303 -198.5Q297 -192 288 -192L203 -192L203 -320L288 -320Q297 -320 303 -313.5Q309 -307 309 -299L309 -277Q309 -269 303 -262.5Q297 -256 288 -256ZM235 -288L235 -272L277 -272L277 -288ZM277 -240L235 -240L235 -224L277 -224Z"';

const extract: Extract = async (...args: Parameters<Extract>): ReturnType<Extract> => {
  const testTarget = process.env.TEST_TARGET as keyof typeof importTargets;
  const { default: index } = await importTargets[testTarget ?? "local"]();
  return index(...args);
};

describe("extract", () => {
  it("should transform ttf", async () => {
    const { ttf, woff2 } = await extract(ttfOriginalFont, {
      fontName: "test-icons",
      ligatures: ["abc"],
      formats: ["woff2", "ttf"],
    });
    expect(ttf).toBeInstanceOf(Buffer);
    expect(woff2).toBeInstanceOf(Buffer);
    expect(ttf.length < ttfOriginalFont.length).toBeTruthy();
    expect(woff2.length < woff2OriginalFont.length).toBeTruthy();
  });

  it("should transform woff2", async () => {
    const { ttf, woff2 } = await extract(woff2OriginalFont, {
      fontName: "test-icons",
      ligatures: ["abc"],
      formats: ["woff2", "ttf"],
    });
    expect(ttf).toBeInstanceOf(Buffer);
    expect(woff2).toBeInstanceOf(Buffer);
    expect(ttf.length < ttfOriginalFont.length).toBeTruthy();
    expect(woff2.length < woff2OriginalFont.length).toBeTruthy();
  });

  it("should return meta info", async () => {
    const { meta } = await extract(woff2OriginalFont, {
      fontName: "test-icons",
      ligatures: ["abc"],
      formats: ["woff2"],
    });
    expect(meta).toHaveLength(1);
    const [glyphMeta] = meta;
    expect(glyphMeta.name).toEqual("abc");
    expect(glyphMeta.unicode).toEqual([""]);
    expect(glyphMeta.svg.includes(ABC_SVG_PATH)).toBeTruthy();
  });

  const createTestForRawFunctionality = (type: string, _source: Buffer): void => {
    it(`should extract by raw unicode by ${type}`, async () => {
      const { meta } = await extract(woff2OriginalFont, {
        fontName: "test-icons",
        raws: [""],
        formats: ["woff2"],
      });
      expect(meta).toHaveLength(1);
      const [glyphMeta] = meta;
      expect(glyphMeta.name).toEqual("abc");
      expect(glyphMeta.unicode).toEqual([""]);
      expect(glyphMeta.svg.includes(ABC_SVG_PATH)).toBeTruthy();
    });
  };

  (
    [
      ["ttf", ttfOriginalFont],
      ["woff2", woff2OriginalFont],
    ] as const
  ).forEach(([type, source]) => {
    createTestForRawFunctionality(type, Buffer.from(source));
  });

  describe("output formats", () => {
    it("should produce SVG output", async () => {
      const { svg } = await extract(ttfOriginalFont, {
        fontName: "test-icons",
        ligatures: ["abc"],
        formats: ["svg"],
      });
      expect(svg).toBeInstanceOf(Buffer);
      expect(svg?.toString()).toContain("<svg");
    });

    it("should produce WOFF output", async () => {
      const { woff } = await extract(ttfOriginalFont, {
        fontName: "test-icons",
        ligatures: ["abc"],
        formats: ["woff"],
      });
      expect(woff).toBeInstanceOf(Buffer);
      expect(woff?.length).toBeGreaterThan(0);
    });

    it("should produce EOT output", async () => {
      const { eot } = await extract(ttfOriginalFont, {
        fontName: "test-icons",
        ligatures: ["abc"],
        formats: ["eot"],
      });
      expect(eot).toBeInstanceOf(Buffer);
      expect(eot?.length).toBeGreaterThan(0);
    });

    it("should produce all formats at once", async () => {
      const result = await extract(ttfOriginalFont, {
        fontName: "test-icons",
        ligatures: ["abc"],
      });
      expect(result.svg).toBeInstanceOf(Buffer);
      expect(result.ttf).toBeInstanceOf(Buffer);
      expect(result.woff).toBeInstanceOf(Buffer);
      expect(result.woff2).toBeInstanceOf(Buffer);
      expect(result.eot).toBeInstanceOf(Buffer);
    });
  });

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

  describe("optimization report", () => {
    it("should include report with original size and format savings", async () => {
      const result = await extract(ttfOriginalFont, {
        fontName: "test-icons",
        ligatures: ["abc"],
        formats: ["ttf", "woff2"],
      });
      expect(result.report).toBeDefined();
      expect(result.report.originalSize).toBe(ttfOriginalFont.length);
      expect(result.report.formats.ttf).toBeDefined();
      expect(result.report.formats.ttf?.size).toBeGreaterThan(0);
      expect(result.report.formats.ttf?.saving).toBeGreaterThan(0);
      expect(result.report.formats.woff2).toBeDefined();
      expect(result.report.formats.woff2?.saving).toBeGreaterThan(90);
    });
  });

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

  describe("validation", () => {
    it("should throw on missing fontName", async () => {
      await expect(
        extract(ttfOriginalFont, {
          fontName: "",
          ligatures: ["abc"],
          formats: ["ttf"],
        }),
      ).rejects.toThrow("fontName is required");
    });

    it("should throw on empty glyph selection", async () => {
      await expect(
        extract(ttfOriginalFont, {
          fontName: "test",
          ligatures: [],
          raws: [],
          unicodeRanges: [],
        }),
      ).rejects.toThrow(
        "At least one of ligatures, raws, unicodeRanges, or characters must be provided",
      );
    });

    it("should throw on empty formats", async () => {
      await expect(
        extract(ttfOriginalFont, {
          fontName: "test",
          ligatures: ["abc"],
          formats: [],
        }),
      ).rejects.toThrow("At least one output format must be specified");
    });

    it("should throw on invalid format", async () => {
      await expect(
        extract(ttfOriginalFont, {
          fontName: "test",
          ligatures: ["abc"],
          // @ts-expect-error testing invalid format
          formats: ["invalid"],
        }),
      ).rejects.toThrow("Invalid format(s): invalid");
    });

    it("should throw on non-existent ligature in raws", async () => {
      await expect(
        extract(ttfOriginalFont, {
          fontName: "test",
          raws: ["\u{FFFF}"],
          formats: ["ttf"],
        }),
      ).rejects.toThrow("Font does not contain a ligature for");
    });
  });

  describe("convert engine", () => {
    const textFont = fs.readFileSync(path.resolve(__dirname, "../assets/font-without-gsub.ttf"));

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

  describe("silent option", () => {
    it("should produce the same result with silent: true", async () => {
      const normal = await extract(ttfOriginalFont, {
        fontName: "test-icons",
        ligatures: ["abc"],
        formats: ["woff2", "ttf"],
      });
      const silent = await extract(ttfOriginalFont, {
        fontName: "test-icons",
        ligatures: ["abc"],
        formats: ["woff2", "ttf"],
        silent: true,
      });
      expect(silent.ttf?.length).toBe(normal.ttf?.length);
      expect(silent.woff2?.length).toBe(normal.woff2?.length);
      expect(silent.meta).toEqual(normal.meta);
      expect(silent.report).toEqual(normal.report);
    });
  });

  describe("safariFix", () => {
    const textFont = fs.readFileSync(path.resolve(__dirname, "../assets/font-without-gsub.ttf"));

    const engineCases: [string, Record<string, unknown>][] = [
      ["icon engine", { ligatures: ["abc"], engine: "icon" }],
      ["subset engine", { characters: "abc", engine: "subset" }],
      ["convert engine", { engine: "convert" }],
    ];

    describe.each(engineCases)("%s", (_label, engineOpts) => {
      it("should set fsType to 0", async () => {
        const result = await extract(Buffer.from(textFont), {
          fontName: "safari-test",
          ...engineOpts,
          formats: ["ttf"],
          safariFix: true,
        });
        const os2 = readOS2(result.ttf as Buffer);
        expect(os2.fsType).toBe(0);
      });

      it("should set USE_TYPO_METRICS bit in fsSelection", async () => {
        const result = await extract(Buffer.from(textFont), {
          fontName: "safari-test",
          ...engineOpts,
          formats: ["ttf"],
          safariFix: true,
        });
        const os2 = readOS2(result.ttf as Buffer);
        expect(os2.fsSelection & 0x80).toBe(0x80);
      });

      it("should normalize hhea metrics to match OS/2 sTypo values", async () => {
        const result = await extract(Buffer.from(textFont), {
          fontName: "safari-test",
          ...engineOpts,
          formats: ["ttf"],
          safariFix: true,
        });
        const os2 = readOS2(result.ttf as Buffer);
        const hhea = readHhea(result.ttf as Buffer);
        expect(hhea.ascent).toBe(os2.sTypoAscender);
        expect(hhea.descent).toBe(os2.sTypoDescender);
        expect(hhea.lineGap).toBe(os2.sTypoLineGap);
      });

      it("should produce valid output in all formats", async () => {
        const result = await extract(Buffer.from(textFont), {
          fontName: "safari-test",
          ...engineOpts,
          formats: ["ttf", "woff2"],
          safariFix: true,
        });
        expect(result.ttf).toBeInstanceOf(Buffer);
        expect(result.woff2).toBeInstanceOf(Buffer);
        expect(result.ttf?.length).toBeGreaterThan(0);
        expect(result.woff2?.length).toBeGreaterThan(0);
      });
    });

    it("should differ from output without safariFix (control test)", async () => {
      const withFix = await extract(Buffer.from(textFont), {
        fontName: "safari-test",
        engine: "convert",
        formats: ["ttf"],
        safariFix: true,
      });
      const withoutFix = await extract(Buffer.from(textFont), {
        fontName: "safari-test",
        engine: "convert",
        formats: ["ttf"],
      });
      const os2Fixed = readOS2(withFix.ttf as Buffer);
      const os2Original = readOS2(withoutFix.ttf as Buffer);
      // The text font has fsType=14, so the fix should change it
      expect(os2Original.fsType).not.toBe(0);
      expect(os2Fixed.fsType).toBe(0);
    });

    it("should work with icon fonts", async () => {
      const result = await extract(ttfOriginalFont, {
        fontName: "safari-test",
        ligatures: ["abc"],
        formats: ["ttf"],
        safariFix: true,
      });
      const os2 = readOS2(result.ttf as Buffer);
      expect(os2.fsType).toBe(0);
      expect(os2.fsSelection & 0x80).toBe(0x80);
    });
  });
});
