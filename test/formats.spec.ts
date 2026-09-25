import { describe, it, expect } from "vitest";
import type { MinifyOption } from "../src";
import { cffFont, extract, textFont, ttfOriginalFont } from "./setup";

const OTTO = 0x4f_54_54_4f;
const TRUE_TYPE = 0x1_00_00;
// The WOFF header starts with the "wOFF" signature, followed by the flavor
const WOFF_FLAVOR_OFFSET = 4;
const READ_BACK: MinifyOption = { fontName: "read-back", engine: "convert", formats: ["ttf"] };

const flavorCases: [string, Buffer, MinifyOption, number][] = [
  [
    "a CFF font in the subset engine",
    cffFont,
    { fontName: "cff", engine: "subset", characters: "fixz", formats: ["ttf", "woff"] },
    OTTO,
  ],
  [
    "a CFF font in the convert engine",
    cffFont,
    { fontName: "cff", engine: "convert", formats: ["ttf", "woff"] },
    OTTO,
  ],
  [
    "a TrueType font in the subset engine",
    textFont,
    { fontName: "text", engine: "subset", characters: "abc", formats: ["ttf", "woff"] },
    TRUE_TYPE,
  ],
  [
    "a TrueType font in the icon engine",
    ttfOriginalFont,
    { fontName: "icons", ligatures: ["abc"], formats: ["ttf", "woff"] },
    TRUE_TYPE,
  ],
];

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

  describe("WOFF flavor", () => {
    it.each(flavorCases)(
      "should equal the sfnt version for %s",
      async (_label, font, option, sfntVersion) => {
        const { ttf, woff } = await extract(font, option);
        expect(ttf?.readUInt32BE(0)).toBe(sfntVersion);
        expect(woff?.readUInt32BE(WOFF_FLAVOR_OFFSET)).toBe(sfntVersion);
      },
    );

    it.each(flavorCases)("should read back the WOFF of %s", async (_label, font, option) => {
      const { ttf, woff } = await extract(font, option);
      const fromWoff = await extract(woff as Buffer, READ_BACK);
      const fromTtf = await extract(ttf as Buffer, READ_BACK);
      expect(fromWoff.ttf).toStrictEqual(fromTtf.ttf);
      expect(fromWoff.meta).toStrictEqual(fromTtf.meta);
    });
  });
});
