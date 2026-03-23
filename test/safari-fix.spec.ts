import { describe, it, expect } from "vitest";
import { extract, ttfOriginalFont, textFont } from "./setup";
import { readOS2, readHhea } from "./ttf-utils";

describe("safariFix", () => {
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
