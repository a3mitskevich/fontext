import type { PathCommand } from "../font/outline";
import type { GlyphMeta } from "../types";

/** Units per em of the SVG font; each glyph is scaled so that its vertical advance fills it. */
const EM = 1000;
/** Scaled coordinates are rounded to 1e-13, which drops the float noise of the scaling. */
const PRECISION = 1e13;
/** Numbers each command of the glyph SVGs takes; `src/font/outline.ts` writes only these. */
const ARGUMENT_COUNT: Readonly<Record<string, number>> = { M: 2, L: 2, Q: 4, C: 6, Z: 0 };
const PATH_DATA = /^(?:[MLQCZ][^MLQCZ]*)*$/u;
const COMMAND = /(?<type>[MLQCZ])(?<values>[^MLQCZ]*)/gu;
/** Characters an attribute value can't hold as they are: markup, and whitespace XML normalizes. */
const ATTRIBUTE_RESERVED = /[&<>"\t\n\r]/gu;

interface ScaledGlyph {
  name: string;
  /** Characters and ligature texts mapped to the glyph; each gets its own `<glyph>` element. */
  texts: string[];
  advance: number;
  d: string;
}

const reference = (char: string): string =>
  `&#x${(char.codePointAt(0) as number).toString(16).toUpperCase()};`;

const escapeAttribute = (value: string): string =>
  value.replaceAll(ATTRIBUTE_RESERVED, (char) => reference(char));

/** Every code point as a character reference, so any text survives, whitespace included. */
const toReferences = (text: string): string => [...text].map((char) => reference(char)).join("");

const roundCoordinate = (value: number): number => Math.round(value * PRECISION) / PRECISION;

function attributeOf(svg: string, name: string, glyph: string): string {
  const value = new RegExp(`\\s${name}="(?<value>[^"]*)"`, "u").exec(svg)?.groups?.value;
  if (value === undefined) {
    throw new Error(`The SVG of glyph "${glyph}" has no ${name} attribute`);
  }
  return value;
}

function parseViewBox(svg: string, glyph: string): number[] {
  const box = attributeOf(svg, "viewBox", glyph)
    .trim()
    .split(/[\s,]+/u)
    .map(Number);
  if (box.length !== 4 || !box.every((value) => Number.isFinite(value))) {
    throw new Error(`The SVG of glyph "${glyph}" has an invalid viewBox`);
  }
  return box;
}

/** Absolute M, L, Q, C and Z commands, as `toSvgPath()` writes them. */
function parsePath(d: string, glyph: string): PathCommand[] {
  const invalid = new Error(`The SVG of glyph "${glyph}" has unsupported path data`);
  if (!PATH_DATA.test(d)) {
    throw invalid;
  }
  return [...d.matchAll(COMMAND)].map(({ groups }) => {
    const type = groups?.type ?? "";
    const text = groups?.values.trim() ?? "";
    const values = text === "" ? [] : text.split(/[\s,]+/u).map(Number);
    if (values.length !== ARGUMENT_COUNT[type] || !values.every((v) => Number.isFinite(v))) {
      throw invalid;
    }
    return { type, values };
  });
}

/**
 * Scales a glyph SVG so that its box fills the em and flips it to the font y axis, which points
 * up. The operations and their order are those of svgicons2svgfont with `normalize`, so the
 * coordinates come out as the same floats (`top` is not always exactly the em). A box without
 * height can't be scaled: the glyph is left empty with no advance, as svgicons2svgfont did. A
 * glyph without advance width keeps its outline, which svgicons2svgfont dropped.
 */
function scaleGlyph(meta: GlyphMeta): ScaledGlyph {
  const texts = [...new Set([...meta.unicode, meta.name])];
  const [minX, minY, width, height] = parseViewBox(meta.svg, meta.name);
  if (height === 0) {
    return { name: meta.name, texts, advance: 0, d: "" };
  }

  const scale = EM / height;
  const top = height * scale;
  const d = parsePath(attributeOf(meta.svg, "d", meta.name), meta.name)
    .map(({ type, values }) => {
      const scaled = values.map((value, index) =>
        roundCoordinate(index % 2 === 0 ? (value - minX) * scale : top - (value - minY) * scale),
      );
      return type + scaled.join(" ");
    })
    .join("");
  return { name: meta.name, texts, advance: width * scale, d };
}

function glyphElements({ name, texts, advance, d }: ScaledGlyph): string[] {
  return texts.map((text, index) => {
    const glyphName = escapeAttribute(index === 0 ? name : `${name}-${index}`);
    return `<glyph glyph-name="${glyphName}" unicode="${toReferences(text)}" horiz-adv-x="${advance}" d="${d}"/>`;
  });
}

/**
 * An SVG font of the glyphs, which svg2ttf turns into a TTF. A glyph gets a `<glyph>` element
 * for each of its characters and one for its name; svg2ttf merges elements of the same outline
 * and advance into one glyph and makes a ligature of each text of more than one code point.
 */
export function buildSvgFont(fontName: string, glyphs: readonly GlyphMeta[]): Buffer {
  const scaled = glyphs.map((glyph) => scaleGlyph(glyph));
  const family = escapeAttribute(fontName);
  const fontAdvance = scaled.reduce((widest, { advance }) => Math.max(widest, advance), 0);
  const lines = [
    '<svg xmlns="http://www.w3.org/2000/svg"><defs>',
    `<font id="${family}" horiz-adv-x="${fontAdvance}">`,
    `<font-face font-family="${family}" units-per-em="${EM}" ascent="${EM}" descent="0"/>`,
    '<missing-glyph horiz-adv-x="0"/>',
    ...scaled.flatMap((glyph) => glyphElements(glyph)),
    "</font></defs></svg>",
  ];
  return Buffer.from(`${lines.join("\n")}\n`);
}
