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

  it.each([
    ["icon", { ligatures: ["home"] }],
    ["subset", { characters: "abc" }],
  ] as const)(
    "should reject the removed withWhitespace option (%s engine)",
    async (engine, selection) => {
      // Typed callers can't pass it; JavaScript callers and spread options can
      const option = {
        fontName: "test",
        engine,
        ...selection,
        withWhitespace: true,
        formats: ["ttf"],
      };

      await expect(
        extract(ttfOriginalFont, option as Parameters<typeof extract>[1]),
      ).rejects.toThrow(
        'withWhitespace was removed: add " " to characters to keep the space (subset engine)',
      );
    },
  );

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

  it.each([
    ["an unknown ligature", "nonexistentligature"],
    ["a typo of a ligature", "hme"],
  ])("should throw on %s instead of extracting its letters", async (_label, ligature) => {
    await expect(
      extract(ttfOriginalFont, {
        fontName: "test",
        ligatures: [ligature],
        formats: ["ttf"],
      }),
    ).rejects.toThrow(`Font does not contain a ligature for "${ligature}"`);
  });

  it("should name the ligature the font cannot form among valid ones", async () => {
    await expect(
      extract(ttfOriginalFont, {
        fontName: "test",
        ligatures: ["abc", "hme", "home"],
        formats: ["ttf"],
      }),
    ).rejects.toThrow('Font does not contain a ligature for "hme"');
  });

  it("should accept a single character the cmap maps as a ligature", async () => {
    const { meta } = await extract(ttfOriginalFont, {
      fontName: "test",
      ligatures: ["abc", "a"],
      formats: ["svg"],
    });
    expect(meta.map((glyph) => glyph.name)).toStrictEqual(["abc", "a"]);
  });

  it("should throw when unicode ranges match no glyph", async () => {
    // Material Icons maps no capital letters
    await expect(
      extract(ttfOriginalFont, {
        fontName: "test",
        unicodeRanges: ["U+0041-U+0043"],
        formats: ["ttf"],
      }),
    ).rejects.toThrow(
      "No glyphs match the selection: the font maps none of unicodeRanges U+0041-U+0043",
    );
  });

  it("should keep a unicode range that partly overlaps the cmap", async () => {
    const { meta } = await extract(ttfOriginalFont, {
      fontName: "test",
      unicodeRanges: ["U+0041-U+0061"],
      formats: ["ttf"],
    });
    // Of the capitals, punctuation and "a" the font maps only "_" and "a"
    expect(meta.map((glyph) => glyph.name)).toStrictEqual(["_", "a"]);
  });
});
