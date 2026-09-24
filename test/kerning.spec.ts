import { describe, it, expect } from "vitest";
import * as hb from "harfbuzzjs";
import { decompress } from "wawoff2";
import type { MinifyOption } from "../src";
import { withTable } from "../src/font/sfnt";
import { extract, textFont } from "./setup";
import { findTable, kernTable, readKernPairs } from "./ttf-utils";

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

const HORIZONTAL = 0x1;
const FORMAT2 = 0x2_00;

const withKern = (kern: Uint8Array): Buffer => Buffer.from(withTable(textFont, "kern", kern));

describe("legacy kern warnings", () => {
  const glyph = glyphOf(textFont);

  it("should not warn when all the kerning is kept", async () => {
    const subset = await extract(textFont, subsetOption(KERNED_TEXT));
    const converted = await extract(textFont, {
      fontName: "kerning",
      engine: "convert",
      formats: ["ttf"],
    });

    expect(subset.warnings).toStrictEqual([]);
    expect(converted.warnings).toStrictEqual([]);
  });

  it("should keep the pairs it can and warn about a subtable it can't carry over", async () => {
    const font = withKern(
      kernTable([
        { coverage: HORIZONTAL, pairs: [[glyph("A"), glyph("V"), -80]] },
        { coverage: HORIZONTAL | FORMAT2, pairs: [] },
      ]),
    );
    const { ttf, warnings } = await extract(font, subsetOption("AV"));
    const output = glyphOf(ttf as Buffer);

    expect(readKernPairs(ttf as Buffer)).toStrictEqual([[output("A"), output("V"), -80]]);
    expect(warnings).toStrictEqual([
      {
        code: "legacy-kern",
        message:
          "The font kerns in the legacy kern table, and part of it was left out: 1 subtable of " +
          "format 2 or 3, cross-stream or vertical kerning. A version of the font with kerning in " +
          "GPOS avoids this.",
      },
    ]);
  });

  it("should subset a font with a malformed kern table and warn", async () => {
    const kern = kernTable([{ coverage: HORIZONTAL, pairs: [[glyph("A"), glyph("V"), -80]] }]);
    const { ttf, warnings } = await extract(withKern(kern.subarray(0, -2)), subsetOption("AV"));

    expect(findTable(ttf as Buffer, "kern")).toBeNull();
    expect(warnings.map(({ code }) => code)).toStrictEqual(["legacy-kern"]);
    expect(warnings[0].message).toContain("the table is malformed, so it was left out");
  });

  it("should warn about an Apple kern table", async () => {
    const apple = new Uint8Array([0, 1, 0, 0, 0, 0, 0, 0]);
    const { warnings } = await extract(withKern(apple), subsetOption("AV"));

    expect(warnings.map(({ message }) => message)).toStrictEqual([
      expect.stringContaining("it is an Apple kern table (version 1), which is not read"),
    ]);
  });
});
