import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import {
  createFont,
  findLigaturesByRaws,
  parseUnicodeRanges,
  findMetaByCodePoints,
  findMetaByLigatures,
} from "../src/browser";

const fontPath = path.resolve(import.meta.dirname, "../assets/font.ttf");
const fontBuffer = fs.readFileSync(fontPath);
const fontUint8 = new Uint8Array(fontBuffer);

describe("browser entry point", () => {
  describe("createFont", () => {
    it("should create a font from Uint8Array", async () => {
      const font = await createFont(fontUint8);
      expect(font).toBeDefined();
      expect(font.codePoints.length).toBeGreaterThan(0);
    });

    it("should create a font from ArrayBuffer", async () => {
      const font = await createFont(fontUint8.buffer);
      expect(font).toBeDefined();
      expect(font.codePoints.length).toBeGreaterThan(0);
    });
  });

  describe("findLigaturesByRaws", () => {
    it("should resolve raw unicode to ligature strings", async () => {
      const ligatures = await findLigaturesByRaws(fontUint8, ["\uE000"]);
      expect(ligatures.length).toBeGreaterThan(0);
    });

    it("should return empty array for empty raws", async () => {
      await expect(findLigaturesByRaws(fontUint8, [])).resolves.toEqual([]);
    });
  });

  describe("parseUnicodeRanges", () => {
    it("should parse single codepoint", () => {
      const cps = parseUnicodeRanges(["U+0061"]);
      expect(cps).toEqual([0x61]);
    });

    it("should parse range", () => {
      const cps = parseUnicodeRanges(["U+0061-U+0063"]);
      expect(cps).toEqual([0x61, 0x62, 0x63]);
    });

    it("should throw on invalid range", () => {
      expect(() => parseUnicodeRanges(["invalid"])).toThrow("Invalid unicode range");
    });

    it("should throw on codepoint exceeding U+10FFFF", () => {
      expect(() => parseUnicodeRanges(["U+110000"])).toThrow("Codepoint exceeds U+10FFFF");
    });
  });

  describe("findMetaByCodePoints", () => {
    it("should return glyph metadata for valid codepoints", async () => {
      const font = await createFont(fontUint8);
      const meta = findMetaByCodePoints(font, [0x61]);
      expect(meta.length).toBe(1);
      expect(meta[0].svg).toContain("<svg");
    });

    it("should skip missing codepoints", async () => {
      const font = await createFont(fontUint8);
      const meta = findMetaByCodePoints(font, [0x00]);
      expect(meta).toEqual([]);
    });
  });

  describe("findMetaByLigatures", () => {
    it("should extract glyph metadata from ligature strings", async () => {
      const font = await createFont(fontUint8);
      const meta = findMetaByLigatures(font, ["abc"]);
      expect(meta.length).toBe(1);
      expect(meta[0].svg).toContain("<svg");
    });

    it("should return empty for empty ligatures", async () => {
      const font = await createFont(fontUint8);
      const meta = findMetaByLigatures(font, []);
      expect(meta).toEqual([]);
    });
  });
});
