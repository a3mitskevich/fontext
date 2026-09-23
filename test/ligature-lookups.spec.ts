import { describe, it, expect } from "vitest";
import { findLigaturesByRaws } from "../src/browser";
import { extract, multiLookupFont } from "./setup";

// Lookup 1 holds abc and def in separate subtables, lookup 2 holds ghi, lookup 3 wraps jkl
// In an extension lookup (type 7), see scripts/make-ligature-fixture.mjs
const cases = [
  ["first subtable of the first lookup", "\uE001", "abc"],
  ["second subtable of the first lookup", "\uE002", "def"],
  ["second ligature lookup", "\uE003", "ghi"],
  ["extension lookup", "\uE004", "jkl"],
] as const;

describe("ligatures split across GSUB subtables and lookups", () => {
  it.each(cases)("should extract a raw from the %s", async (_label, raw, ligature) => {
    const { meta } = await extract(multiLookupFont, {
      fontName: "multi-lookup",
      raws: [raw],
      formats: ["svg"],
    });
    expect(meta.map((glyph) => glyph.name)).toStrictEqual([ligature]);
  });

  it("should skip ligatures of features that are off by default", () => {
    // A dlig-only lookup maps "kja" to the same glyph as "abc"
    expect(findLigaturesByRaws(new Uint8Array(multiLookupFont), [""])).toStrictEqual(["abc"]);
  });

  it("should resolve raws from every lookup in the browser entry", () => {
    const ligatures = findLigaturesByRaws(new Uint8Array(multiLookupFont), [
      "\uE002",
      "\uE003",
      "\uE004",
    ]);
    expect(ligatures).toStrictEqual(["def", "ghi", "jkl"]);
  });
});
