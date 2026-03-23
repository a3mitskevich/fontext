import { describe, it, expect } from "vitest";
import { extract, ttfOriginalFont } from "./setup";

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

  it("should throw on SVG-only with subset engine", async () => {
    await expect(
      extract(ttfOriginalFont, {
        fontName: "test",
        characters: "abc",
        formats: ["svg"],
        engine: "subset",
      }),
    ).rejects.toThrow("Subset engine does not support SVG format");
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
