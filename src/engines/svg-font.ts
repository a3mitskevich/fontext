import type { PathCommand } from "../font/outline";
import type { GlyphMeta } from "../types";

/**
 * The smallest em of the SVG font. svg2ttf rounds every point to whole units, so a smaller em
 * would move points by a visible part of it; half a unit of 512 stays under 0.1% of the em.
 */
const MIN_EM = 512;
/** TrueType stores coordinates, bounding boxes and the deltas between points as int16. */
const MAX_COORDINATE = 32_767;
/** Scaled coordinates are rounded to 1e-13, which drops the float noise of the scaling. */
const PRECISION = 1e13;
/** Numbers each command of the glyph SVGs takes; `src/font/outline.ts` writes only these. */
const ARGUMENT_COUNT: Readonly<Record<string, number>> = { M: 2, L: 2, Q: 4, C: 6, Z: 0 };
const PATH_DATA = /^(?:[MLQCZ][^MLQCZ]*)*$/u;
const COMMAND = /(?<type>[MLQCZ])(?<values>[^MLQCZ]*)/gu;
/** Characters an attribute value can't hold as they are: markup, and whitespace XML normalizes. */
const ATTRIBUTE_RESERVED = /[&<>"\t\n\r]/gu;

interface ParsedGlyph {
  name: string;
  /** Characters and ligature texts mapped to the glyph; each gets its own `<glyph>` element. */
  texts: string[];
  /** The viewBox: minimum x, minimum y, advance width and vertical advance. */
  box: number[];
  commands: PathCommand[];
}

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

function parseGlyph(meta: GlyphMeta): ParsedGlyph {
  return {
    name: meta.name,
    texts: [...new Set([...meta.unicode, meta.name])],
    box: parseViewBox(meta.svg, meta.name),
    commands: parsePath(attributeOf(meta.svg, "d", meta.name), meta.name),
  };
}

/**
 * The largest number a glyph puts into the TrueType font per unit of em: its advance, its
 * coordinates and the distance between its outermost points, relative to its vertical advance.
 */
function extentPerEm({ box, commands }: ParsedGlyph): number {
  const [minX, minY, width, height] = box;
  if (height === 0) {
    return 0;
  }
  let [left, right, bottom, top] = [0, 0, 0, 0];
  for (const { values } of commands) {
    for (let index = 0; index < values.length; index += 2) {
      const x = values[index] - minX;
      const y = height - (values[index + 1] - minY);
      left = Math.min(left, x);
      right = Math.max(right, x);
      bottom = Math.min(bottom, y);
      top = Math.max(top, y);
    }
  }
  return Math.max(Math.abs(width), right - left, top - bottom) / height;
}

/**
 * The em of the SVG font: the units per em of the source font, so that glyphs keep its grid.
 * A smaller em than `MIN_EM` is multiplied up to it. An em at which a glyph would overflow
 * TrueType coordinates is lowered until every glyph fits: a glyph much wider than its vertical
 * advance can overflow them, from about twice as wide at the largest em of 16 384 units.
 */
function emOf(unitsPerEm: number, glyphs: readonly ParsedGlyph[]): number {
  const em = unitsPerEm * Math.ceil(MIN_EM / unitsPerEm);
  const extent = glyphs.reduce((largest, glyph) => Math.max(largest, extentPerEm(glyph)), 0);
  return extent > 0 ? Math.min(em, Math.floor(MAX_COORDINATE / extent)) : em;
}

/**
 * Scales a glyph SVG so that its box fills the em and flips it to the font y axis, which points
 * up. The operations and their order are those of svgicons2svgfont with `normalize`, so the
 * coordinates come out as the same floats (`top` is not always exactly the em). A box without
 * height can't be scaled: the glyph is left empty with no advance, as svgicons2svgfont did. A
 * glyph without advance width keeps its outline, which svgicons2svgfont dropped.
 */
function scaleGlyph({ name, texts, box, commands }: ParsedGlyph, em: number): ScaledGlyph {
  const [minX, minY, width, height] = box;
  if (height === 0) {
    return { name, texts, advance: 0, d: "" };
  }

  const scale = em / height;
  const top = height * scale;
  const d = commands
    .map(({ type, values }) => {
      const scaled = values.map((value, index) =>
        roundCoordinate(index % 2 === 0 ? (value - minX) * scale : top - (value - minY) * scale),
      );
      return type + scaled.join(" ");
    })
    .join("");
  return { name, texts, advance: width * scale, d };
}

function glyphElements({ name, texts, advance, d }: ScaledGlyph): string[] {
  return texts.map((text, index) => {
    const glyphName = escapeAttribute(index === 0 ? name : `${name}-${index}`);
    return `<glyph glyph-name="${glyphName}" unicode="${toReferences(text)}" horiz-adv-x="${advance}" d="${d}"/>`;
  });
}

/**
 * An SVG font of the glyphs, which svg2ttf turns into a TTF, on an em of the source font's units
 * per em (see `emOf()`). A glyph gets a `<glyph>` element for each of its characters and one for
 * its name; svg2ttf merges elements of the same outline and advance into one glyph and makes a
 * ligature of each text of more than one code point.
 */
export function buildSvgFont(
  fontName: string,
  glyphs: readonly GlyphMeta[],
  unitsPerEm: number,
): Buffer {
  const parsed = glyphs.map((glyph) => parseGlyph(glyph));
  const em = emOf(unitsPerEm, parsed);
  const scaled = parsed.map((glyph) => scaleGlyph(glyph, em));
  const family = escapeAttribute(fontName);
  const fontAdvance = scaled.reduce((widest, { advance }) => Math.max(widest, advance), 0);
  const lines = [
    '<svg xmlns="http://www.w3.org/2000/svg"><defs>',
    `<font id="${family}" horiz-adv-x="${fontAdvance}">`,
    `<font-face font-family="${family}" units-per-em="${em}" ascent="${em}" descent="0"/>`,
    '<missing-glyph horiz-adv-x="0"/>',
    ...scaled.flatMap((glyph) => glyphElements(glyph)),
    "</font></defs></svg>",
  ];
  return Buffer.from(`${lines.join("\n")}\n`);
}
