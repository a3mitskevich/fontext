import { describe, it, expect } from "vitest";
import { buildSvgFont } from "../src/engines/svg-font";
import type { GlyphMeta } from "../src/types";

const glyphSvg = (viewBox: string, d: string): string =>
  `<svg viewBox="${viewBox}" xmlns="http://www.w3.org/2000/svg">\n  <path d="${d}" />\n</svg>`;

const glyphLines = (glyphs: GlyphMeta[]): string[] =>
  buildSvgFont("unit", glyphs)
    .toString()
    .split("\n")
    .filter((line) => line.startsWith("<glyph"));

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
    const svgFont = buildSvgFont('Tom & "Jerry" <icons>', [
      { name: "<\t>", unicode: [], svg: glyphSvg("0 -1000 500 1000", "") },
    ]).toString();

    expect(svgFont).toContain('font-family="Tom &#x26; &#x22;Jerry&#x22; &#x3C;icons&#x3E;"');
    expect(svgFont).toContain('glyph-name="&#x3C;&#x9;&#x3E;" unicode="&#x3C;&#x9;&#x3E;"');
  });

  it.each([
    ["without a viewBox", '<svg><path d="M0 0Z" /></svg>', "has no viewBox attribute"],
    ["with a short viewBox", glyphSvg("0 -1000 500", "M0 0Z"), "has an invalid viewBox"],
    ["with relative commands", glyphSvg("0 -1000 500 1000", "m0 0l1 1z"), "unsupported path"],
    ["with a missing number", glyphSvg("0 -1000 500 1000", "M0 0L1Z"), "unsupported path data"],
    ["with arcs", glyphSvg("0 -1000 500 1000", "M0 0A1 1 0 0 0 1 1Z"), "unsupported path data"],
  ])("should reject a glyph SVG %s", (_, svg, message) => {
    expect(() => buildSvgFont("unit", [{ name: "bad", unicode: [], svg }])).toThrow(message);
  });
});
