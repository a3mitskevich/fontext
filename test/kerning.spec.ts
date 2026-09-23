import { describe, it, expect } from "vitest";
import * as hb from "harfbuzzjs";
import { decompress } from "wawoff2";
import type { MinifyOption } from "../src";
import { extract, textFont } from "./setup";
import { findTable, readKernPairs } from "./ttf-utils";

// The text font kerns Ye, Fa, P., W, and V. in a legacy kern table and has no GPOS.
// The harfbuzzjs build ignores legacy kern tables, so pairs are compared instead of shaped advances
const KERNED_TEXT = "Yes Fa P. W, V.";
const UNKERNED_TEXT = "0123456789";

type KernPair = [left: number, right: number, value: number];

const glyphOf = (font: Uint8Array) => {
  const hbFont = new hb.Font(new hb.Face(new hb.Blob(font), 0));
  return (char: string): number => hbFont.nominalGlyph(char.codePointAt(0) ?? 0) ?? 0;
};

const charactersOf = (font: Uint8Array): string =>
  String.fromCodePoint(...new hb.Face(new hb.Blob(font), 0).collectUnicodes());

/** The kern pairs `output` should hold: every non-zero pair of the source between two of `chars`. */
function expectedPairs(output: Uint8Array, chars: string): KernPair[] {
  const source = new Map(
    readKernPairs(textFont).map(([left, right, value]) => [`${left}:${right}`, value]),
  );
  const oldGlyph = glyphOf(textFont);
  const newGlyph = glyphOf(output);
  const unique = [...new Set(chars)];
  // Characters that share a glyph give the same pair once
  const pairs = new Map(
    unique.flatMap((left) =>
      unique.map((right): [string, KernPair] => [
        `${newGlyph(left)}:${newGlyph(right)}`,
        [newGlyph(left), newGlyph(right), source.get(`${oldGlyph(left)}:${oldGlyph(right)}`) ?? 0],
      ]),
    ),
  );
  return [...pairs.values()]
    .filter((pair) => pair[2] !== 0)
    .toSorted(([l1, r1], [l2, r2]) => l1 - l2 || r1 - r2);
}

const subsetOption = (characters: string): MinifyOption => ({
  fontName: "kerning",
  engine: "subset",
  characters,
  formats: ["ttf", "woff2"],
});

describe("legacy kern table", () => {
  it("should find kerned pairs in the source text, so the tests below can fail", () => {
    expect(expectedPairs(textFont, KERNED_TEXT).length).toBeGreaterThan(10);
  });

  it("should keep exactly the pairs whose glyphs the subset kept", async () => {
    const { ttf, woff2 } = await extract(textFont, subsetOption(KERNED_TEXT));
    const output = ttf as Buffer;
    const expected = expectedPairs(output, KERNED_TEXT);

    expect(readKernPairs(output)).toStrictEqual(expected);
    expect(readKernPairs(await decompress(woff2 as Buffer))).toStrictEqual(expected);
  });

  it("should not add a kern table when no kept pair is kerned", async () => {
    const { ttf } = await extract(textFont, subsetOption(UNKERNED_TEXT));

    expect(expectedPairs(ttf as Buffer, UNKERNED_TEXT)).toStrictEqual([]);
    expect(findTable(ttf as Buffer, "kern")).toBeNull();
  });

  it("should keep every pair in the convert engine", async () => {
    const { ttf } = await extract(textFont, {
      fontName: "kerning",
      engine: "convert",
      formats: ["ttf"],
    });
    const output = ttf as Buffer;

    expect(readKernPairs(output)).toStrictEqual(expectedPairs(output, charactersOf(textFont)));
    expect(readKernPairs(output)).toHaveLength(readKernPairs(textFont).length);
  });

  it("should keep the pairs of a Safari-patched subset", async () => {
    const { ttf } = await extract(textFont, { ...subsetOption(KERNED_TEXT), safariFix: true });
    const output = ttf as Buffer;

    expect(readKernPairs(output)).toStrictEqual(expectedPairs(output, KERNED_TEXT));
  });
});
