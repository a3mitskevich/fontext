import { describe, it, expect } from "vitest";
import { buildSvgFont } from "../src/engines/svg-font";
import type { GlyphMeta } from "../src/types";

const glyphSvg = (viewBox: string, d: string): string =>
  `<svg viewBox="${viewBox}" xmlns="http://www.w3.org/2000/svg">\n  <path d="${d}" />\n</svg>`;

// Most cases scale to an em of 1000 units, the units per em of many fonts
const UNITS_PER_EM = 1000;

const glyphLines = (glyphs: GlyphMeta[]): string[] =>
  buildSvgFont("unit", glyphs, UNITS_PER_EM)
    .toString()
    .split("\n")
    .filter((line) => line.startsWith("<glyph"));

/** The advance and the coordinates of the glyph elements of an SVG font. */
const glyphNumbers = (svgFont: string): number[] =>
  [...svgFont.matchAll(/<glyph [^>]*horiz-adv-x="(?<advance>[^"]+)" d="(?<d>[^"]*)"/gu)]
    .flatMap(({ groups }) => `${groups?.advance} ${groups?.d}`.split(/[A-Z\s]+/u))
    .filter((value) => value !== "")
    .map(Number);

describe("SVG font writer", () => {
  it("should scale a glyph by its vertical advance and flip it", () => {
    const glyph = { name: "a", unicode: ["a"], svg: glyphSvg("0 -500 250 500", "M0 0L100 -500Z") };

    expect(glyphLines([glyph])).toStrictEqual([
      '<glyph glyph-name="a" unicode="&#x61;" horiz-adv-x="500" d="M0 0L200 1000Z"/>',
    ]);
  });

  it("should keep the outline of a glyph without advance width", () => {
    const acute = String.fromCodePoint(0x3_01);
    const mark = {
      name: acute,
      unicode: [acute],
      svg: glyphSvg("0 -1000 0 1000", "M-50 -700L0 -800L0 -700Z"),
    };

    expect(glyphLines([mark])).toStrictEqual([
      `<glyph glyph-name="${acute}" unicode="&#x301;" horiz-adv-x="0" d="M-50 700L0 800L0 700Z"/>`,
    ]);
  });

  it("should leave a glyph without vertical advance empty", () => {
    const flat = { name: "flat", unicode: [], svg: glyphSvg("0 0 600 0", "M0 0L600 0L600 -10Z") };

    expect(glyphLines([flat])).toStrictEqual([
      '<glyph glyph-name="flat" unicode="&#x66;&#x6C;&#x61;&#x74;" horiz-adv-x="0" d=""/>',
    ]);
  });

  it("should escape the font name and glyph names", () => {
    const svgFont = buildSvgFont(
      'Tom & "Jerry" <icons>',
      [{ name: "<\t>", unicode: [], svg: glyphSvg("0 -1000 500 1000", "") }],
      UNITS_PER_EM,
    ).toString();

    expect(svgFont).toContain('font-family="Tom &#x26; &#x22;Jerry&#x22; &#x3C;icons&#x3E;"');
    expect(svgFont).toContain('glyph-name="&#x3C;&#x9;&#x3E;" unicode="&#x3C;&#x9;&#x3E;"');
  });

  it("should use the units per em of the source font as the em", () => {
    const glyph = { name: "a", unicode: ["a"], svg: glyphSvg("0 -500 250 500", "M0 0L100 -500Z") };
    const svgFont = buildSvgFont("unit", [glyph], 512).toString();

    expect(svgFont).toContain('units-per-em="512" ascent="512" descent="0"');
    expect(svgFont).toContain('horiz-adv-x="256" d="M0 0L102.4 512Z"');
  });

  it.each([
    [16, 512],
    [300, 600],
    [511, 1022],
    [512, 512],
    [2048, 2048],
    [16_384, 16_384],
  ])("should keep a multiple of %i units per em of at least 512: %i", (unitsPerEm, em) => {
    const square = glyphSvg(`0 -${unitsPerEm} ${unitsPerEm} ${unitsPerEm}`, "M0 0L1 -1Z");
    const svgFont = buildSvgFont("unit", [{ name: "a", unicode: [], svg: square }], unitsPerEm);

    expect(svgFont.toString()).toContain(`units-per-em="${em}" ascent="${em}"`);
  });

  it.each([
    // 40 000 wide: the em goes down to 32 767 * 16 384 / 40 000 = 13 421.4
    ["wider", "0 -16384 40000 16384", "M0 0L40000 0L40000 -16384L0 -16384Z", 13_421],
    // From the top to 40 000 below the baseline, 56 384 units apart: 32 767 * 16 384 / 56 384
    ["taller", "0 -16384 16384 16384", "M0 -16384L0 40000L10 40000Z", 9521],
  ])(
    "should lower the em until a glyph %s than TrueType coordinates allow fits",
    (_, viewBox, d, em) => {
      const svgFont = buildSvgFont(
        "unit",
        [{ name: "a", unicode: ["a"], svg: glyphSvg(viewBox, d) }],
        16_384,
      ).toString();
      expect(svgFont).toContain(`units-per-em="${em}"`);
      for (const value of glyphNumbers(svgFont)) {
        expect(Math.abs(Math.round(value))).toBeLessThanOrEqual(32_767);
      }
    },
  );

  it.each([
    ["without a viewBox", '<svg><path d="M0 0Z" /></svg>', "has no viewBox attribute"],
    ["with a short viewBox", glyphSvg("0 -1000 500", "M0 0Z"), "has an invalid viewBox"],
    ["with relative commands", glyphSvg("0 -1000 500 1000", "m0 0l1 1z"), "unsupported path"],
    ["with a missing number", glyphSvg("0 -1000 500 1000", "M0 0L1Z"), "unsupported path data"],
    ["with arcs", glyphSvg("0 -1000 500 1000", "M0 0A1 1 0 0 0 1 1Z"), "unsupported path data"],
  ])("should reject a glyph SVG %s", (_, svg, message) => {
    expect(() => buildSvgFont("unit", [{ name: "bad", unicode: [], svg }], UNITS_PER_EM)).toThrow(
      message,
    );
  });
});
