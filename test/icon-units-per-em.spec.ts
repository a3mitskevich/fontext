import { describe, it, expect } from "vitest";
import type { IconOption } from "../src";
import { createFont } from "../src/glyphs";
import type { GlyphMeta } from "../src/types";
import { cffFont, extract, multiLookupFont, ttfOriginalFont } from "./setup";
import { findTable } from "./ttf-utils";

/* The icon engine builds its font at the units per em of the source font, so each glyph keeps
   its proportions: its advance takes the same part of the em as it takes of its vertical advance
   in the source */

const HEAD_UNITS_PER_EM = 18;

interface Case {
  font: Buffer;
  option: IconOption;
  unitsPerEm: number;
}

const CASES: [string, Case][] = [
  [
    "Material Icons",
    {
      font: ttfOriginalFont,
      option: { fontName: "icons", ligatures: ["home", "search", "arrow_back"] },
      unitsPerEm: 512,
    },
  ],
  [
    "the CFF font",
    {
      font: cffFont,
      option: { fontName: "icons", ligatures: ["fi", "xy", "x"], unicodeRanges: ["U+0066"] },
      unitsPerEm: 1000,
    },
  ],
  [
    "the multi-lookup font",
    {
      font: multiLookupFont,
      option: { fontName: "icons", ligatures: ["abc", "def", "ghi", "jkl"] },
      unitsPerEm: 1000,
    },
  ],
];

/** A copy of the font with another head.unitsPerEm; glyphs and metrics keep their numbers. */
function withUnitsPerEm(font: Buffer, unitsPerEm: number): Buffer {
  const copy = Buffer.from(font);
  const head = findTable(copy, "head");
  if (!head) {
    throw new Error("The font has no head table");
  }
  copy.writeUInt16BE(unitsPerEm, head.offset + HEAD_UNITS_PER_EM);
  return copy;
}

const unitsPerEmOf = (ttf: Buffer): number =>
  ttf.readUInt16BE((findTable(ttf, "head")?.offset ?? 0) + HEAD_UNITS_PER_EM);

/** Advance width and vertical advance of a glyph SVG, from its viewBox. */
function boxOf(meta: GlyphMeta): { width: number; height: number } {
  const box = (/viewBox="(?<box>[^"]+)"/u.exec(meta.svg)?.groups?.box ?? "").split(" ");
  return { width: Number(box[2]), height: Number(box[3]) };
}

/**
 * How many units each glyph advance of the TTF falls short of the part of the em its SVG takes of
 * its vertical advance. svg2ttf truncates advances to whole units, so it is at least 0, below 1.
 */
async function advanceShortfalls(ttf: Buffer, meta: GlyphMeta[]): Promise<number[]> {
  const output = await createFont(ttf);
  const em = unitsPerEmOf(ttf);
  return meta.map((glyph) => {
    const { width, height } = boxOf(glyph);
    const [shaped] = output.shape(glyph.name);
    return (width / height) * em - output.advanceWidth(shaped.id);
  });
}

describe("icon engine units per em", () => {
  it.each(CASES)("should keep the units per em of %s", async (_, { font, option, unitsPerEm }) => {
    const source = await createFont(font);
    const { ttf, woff2 } = await extract(font, { ...option, formats: ["ttf", "woff2"] });
    const decoded = await createFont(woff2 as Buffer);

    expect(source.unitsPerEm).toBe(unitsPerEm);
    expect(unitsPerEmOf(ttf as Buffer)).toBe(unitsPerEm);
    expect(decoded.unitsPerEm).toBe(unitsPerEm);
  });

  it.each(CASES)("should keep the glyph proportions of %s", async (_, { font, option }) => {
    const { ttf, meta } = await extract(font, { ...option, formats: ["ttf"] });

    const shortfalls = await advanceShortfalls(ttf as Buffer, meta);
    expect(Math.min(...shortfalls)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...shortfalls)).toBeLessThan(1);
  });

  it("should give a font of 16 units per em an em of 512", async () => {
    const small = withUnitsPerEm(multiLookupFont, 16);
    const { ttf, meta } = await extract(small, {
      fontName: "icons",
      ligatures: ["abc", "jkl"],
      formats: ["ttf"],
    });
    const output = await createFont(ttf as Buffer);

    const source = await createFont(small);

    expect(source.unitsPerEm).toBe(16);
    expect(unitsPerEmOf(ttf as Buffer)).toBe(512);
    expect(output.shape("abc")).toHaveLength(1);
    const shortfalls = await advanceShortfalls(ttf as Buffer, meta);
    expect(Math.min(...shortfalls)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...shortfalls)).toBeLessThan(1);
  });

  it("should keep 16384 units per em", async () => {
    const large = withUnitsPerEm(ttfOriginalFont, 16_384);
    const { ttf, meta } = await extract(large, {
      fontName: "icons",
      ligatures: ["home", "arrow_back"],
      formats: ["ttf"],
    });
    const output = await createFont(ttf as Buffer);
    const source = await createFont(ttfOriginalFont);

    expect(unitsPerEmOf(ttf as Buffer)).toBe(16_384);
    const shortfalls = await advanceShortfalls(ttf as Buffer, meta);
    expect(Math.min(...shortfalls)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...shortfalls)).toBeLessThan(1);
    // The glyphs of Material Icons fill 512 units, so they come out 32 times as large
    const [home] = output.shape("home");
    const [sourceHome] = source.shape("home");
    expect(output.advanceWidth(home.id)).toBe(source.advanceWidth(sourceHome.id) * 32);
  });
});
