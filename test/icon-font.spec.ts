import { describe, it, expect } from "vitest";
import type { IconOption } from "../src";
import { createFont } from "../src/glyphs";
import type { GlyphMeta } from "../src/types";
import { cffFont, extract, textFont, ttfOriginalFont } from "./setup";

// The SVG font scales every glyph so that its vertical advance fills an em of 1000 units
const EM = 1000;
const DIGITS = 9;

const MATERIAL: IconOption = {
  fontName: "icon-font",
  ligatures: ["home", "search", "fiber_manual_record", "arrow_back"],
  raws: [""],
  unicodeRanges: ["U+E000-U+E004", "U+10FFFD"],
  formats: ["svg", "ttf"],
};

// Vmtx gives the CFF ligatures a vertical advance of 1100 and its letters 900
const CFF: IconOption = {
  fontName: "icon-font",
  ligatures: ["fi", "xy", "x"],
  unicodeRanges: ["U+0066"],
  formats: ["svg", "ttf"],
};

const CASES = [
  ["Material Icons", ttfOriginalFont, MATERIAL],
  ["the CFF font", cffFont, CFF],
] as const;

/* TTF outlines recorded from the SVG font svgicons2svgfont assembled: svg2ttf rounds the points
   to integers and turns the cubic curves of the CFF font into quadratic ones */
const TTF_OUTLINES = [
  [
    "home",
    ttfOriginalFont,
    MATERIAL,
    "M416 -166L209 -166L209 -500L84 -500L500 -875L916 -500L791 -500L791 -166L584 -166L584 -416L416 -416Z",
  ],
  [
    "fiber_manual_record",
    ttfOriginalFont,
    MATERIAL,
    "M265 -265Q166 -363 166 -500Q166 -637 264.5 -735.5Q363 -834 500 -834Q637 -834 735.5 -735.5Q834 -637 834 -500Q834 -363 735.5 -264.5Q637 -166 500 -166Q363 -166 265 -265Z",
  ],
  [
    "fi",
    cffFont,
    CFF,
    "M18 -18L18 -618L273 -618Q345 -618 395 -556Q440 -500 456 -407Q472 -318 456 -229Q440 -137 395 -81Q345 -18 273 -18Z",
  ],
  ["x", cffFont, CFF, "M133 -133L133 -644L533 -644L533 -133Z"],
] as const;

type Attributes = Record<string, string>;

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"' };

const decode = (value: string): string =>
  value.replaceAll(/&#x(?<hex>[0-9a-f]+);|&(?<named>amp|lt|gt|quot);/giu, (_, hex, named) =>
    hex ? String.fromCodePoint(parseInt(hex, 16)) : ENTITIES[named],
  );

/** Attributes of every `tag` element of an SVG font, decoded. */
function elements(svg: string, tag: string): Attributes[] {
  return [...svg.matchAll(new RegExp(`<${tag}\\s(?<attributes>[^>]*?)\\s*/?>`, "gu"))].map(
    (element) =>
      Object.fromEntries(
        [...(element.groups?.attributes ?? "").matchAll(/(?<key>[\w-]+)="(?<value>[^"]*)"/gu)].map(
          (attribute) => [attribute.groups?.key, decode(attribute.groups?.value ?? "")],
        ),
      ),
  );
}

/** Advance width, advance height and path data of the glyph SVG of a meta. */
function outlineOf(meta: GlyphMeta) {
  const box = (meta.svg.match(/viewBox="(?<box>[^"]+)"/u)?.groups?.box ?? "").split(" ");
  return {
    width: Number(box[2]),
    height: Number(box[3]),
    d: meta.svg.match(/\sd="(?<d>[^"]*)"/u)?.groups?.d ?? "",
  };
}

const scaledWidth = (meta: GlyphMeta): number => {
  const { width, height } = outlineOf(meta);
  return (width * EM) / height;
};

/** Commands of path data as their letter and numbers. */
const commandsOf = (d: string) =>
  [...d.matchAll(/(?<command>[a-z])(?<values>[^a-z]*)/giu)].map(({ groups }) => ({
    command: (groups?.command ?? "").toUpperCase(),
    values: (groups?.values ?? "").trim().split(/\s+/u).filter(Boolean).map(Number),
  }));

/** The glyph SVG path scaled to the em and flipped to the font y axis, which points up. */
function scaledCommandsOf(meta: GlyphMeta) {
  const { height, d } = outlineOf(meta);
  const scale = EM / height;
  return commandsOf(d).map(({ command, values }) => ({
    command,
    values: values.map((value, index) => value * scale * (index % 2 === 1 ? -1 : 1)),
  }));
}

/** Texts the SVG font maps to the glyph of the meta: its characters, then its name. */
const textsOf = (meta: GlyphMeta): string[] => [...new Set([...meta.unicode, meta.name])];

/** Glyph names of the elements of a meta: its name, then the name with a counter. */
const namesOf = (meta: GlyphMeta): string[] =>
  textsOf(meta).map((_, index) => (index === 0 ? meta.name : `${meta.name}-${index}`));

async function extractSvgFont(font: Buffer, option: IconOption) {
  const result = await extract(font, option);
  return { ...result, svgFont: result.svg?.toString() ?? "" };
}

describe("icon engine font", () => {
  it.each(CASES)("should describe the SVG font of %s", async (_, font, option) => {
    const { meta, svgFont } = await extractSvgFont(font, option);

    const [fontElement] = elements(svgFont, "font");
    expect(fontElement.id).toBe("icon-font");
    expect(Number(fontElement["horiz-adv-x"])).toBeCloseTo(
      Math.max(...meta.map((glyph) => scaledWidth(glyph))),
      DIGITS,
    );
    expect(elements(svgFont, "font-face")).toStrictEqual([
      { "font-family": "icon-font", "units-per-em": "1000", ascent: "1000", descent: "0" },
    ]);
    expect(elements(svgFont, "missing-glyph")).toStrictEqual([{ "horiz-adv-x": "0" }]);
  });

  it.each(CASES)(
    "should write a glyph element for each character and ligature of %s",
    async (_, font, option) => {
      const { meta, svgFont } = await extractSvgFont(font, option);

      const expected = meta.flatMap((glyph) =>
        textsOf(glyph).map((text, index) => [namesOf(glyph)[index], text]),
      );
      const glyphs = elements(svgFont, "glyph");
      expect(glyphs.map((glyph) => [glyph["glyph-name"], glyph.unicode])).toStrictEqual(expected);
      expect(meta.some((glyph) => textsOf(glyph).length > 1)).toBe(true);
    },
  );

  it.each(CASES)(
    "should scale each outline of %s so its vertical advance fills the em",
    async (_, font, option) => {
      const { meta, svgFont } = await extractSvgFont(font, option);
      const glyphs = new Map(elements(svgFont, "glyph").map((glyph) => [glyph.unicode, glyph]));

      for (const glyph of meta) {
        const expected = scaledCommandsOf(glyph);
        for (const text of textsOf(glyph)) {
          const element = glyphs.get(text) as Attributes;
          const actual = commandsOf(element.d);
          expect(Number(element["horiz-adv-x"])).toBeCloseTo(scaledWidth(glyph), DIGITS);
          expect(actual.map(({ command }) => command)).toStrictEqual(
            expected.map(({ command }) => command),
          );
          actual.forEach(({ values }, index) => {
            expect(values).toHaveLength(expected[index].values.length);
            values.forEach((value, at) => {
              expect(value).toBeCloseTo(expected[index].values[at], DIGITS);
            });
          });
        }
      }
    },
  );

  it.each(CASES)(
    "should map the characters and ligatures of %s in the TTF",
    async (_, font, option) => {
      const { meta, ttf } = await extractSvgFont(font, option);
      const output = await createFont(ttf as Buffer);

      for (const glyph of meta) {
        const shaped = output.shape(glyph.name);
        expect(shaped).toHaveLength(1);
        expect(shaped[0].id).not.toBe(0);
        for (const char of glyph.unicode) {
          expect(output.glyphForCodePoint(char.codePointAt(0) as number)).toBe(shaped[0].id);
        }
        // The TTF advance is the integer part: svg2ttf reads horiz-adv-x with parseInt
        expect(output.advanceWidth(shaped[0].id)).toBe(Math.trunc(scaledWidth(glyph)));
      }
    },
  );

  it("should escape the characters XML reserves", async () => {
    const { meta, svgFont, ttf } = await extractSvgFont(textFont, {
      fontName: 'icon-font & "friends"',
      unicodeRanges: ["U+0022-U+0026", "U+003C-U+003E"],
      formats: ["svg", "ttf"],
    });
    const output = await createFont(ttf as Buffer);

    expect(elements(svgFont, "font-face")[0]["font-family"]).toBe('icon-font & "friends"');
    expect(elements(svgFont, "glyph").map((glyph) => glyph["glyph-name"])).toStrictEqual(
      meta.map((glyph) => glyph.name),
    );
    expect(
      meta.map((glyph) => output.glyphForCodePoint(glyph.name.codePointAt(0) as number)),
    ).not.toContain(undefined);
    expect(meta.map((glyph) => glyph.name)).toStrictEqual(['"', "#", "$", "%", "&", "<", "=", ">"]);
  });

  it("should keep a non-BMP code point", async () => {
    const { ttf } = await extractSvgFont(ttfOriginalFont, MATERIAL);
    const output = await createFont(ttf as Buffer);

    expect(output.codePoints).toContain(0x10_ff_fd);
  });

  it.each(TTF_OUTLINES)(
    "should keep the TTF outline of %s",
    async (text, font, option, expected) => {
      const { ttf } = await extractSvgFont(font, option);
      const output = await createFont(ttf as Buffer);

      expect(output.svgPath(output.shape(text)[0].id)).toBe(expected);
    },
  );
});
