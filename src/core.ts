import type { Font } from "./font/font";
import type { GlyphMeta } from "./types";

const WHITESPACE = " ";
const NOTDEF = 0;

function renderSvg(svgPath: string, width: number, height: number): string {
  return `<svg viewBox="0 -${height} ${width} ${height}" xmlns="http://www.w3.org/2000/svg">\n  <path d="${svgPath}" />\n</svg>`;
}

export function codePointsToString(symbols: readonly number[]): string {
  return symbols.map((symbol) => String.fromCodePoint(symbol)).join("");
}

function toSvg(font: Font, glyph: number): string {
  return renderSvg(font.svgPath(glyph), font.advanceWidth(glyph), font.advanceHeight(glyph));
}

function glyphToMeta(font: Font, glyph: number, name: string): GlyphMeta {
  return {
    name,
    unicode: [...font.stringsForGlyph(glyph)],
    svg: toSvg(font, glyph),
  };
}

export function parseUnicodeRanges(ranges: string[]): number[] {
  const codePoints: number[] = [];
  for (const range of ranges) {
    const match = range.match(/^U\+(?<start>[0-9A-Fa-f]+)(?:-U?\+?(?<end>[0-9A-Fa-f]+))?$/u);
    if (!match?.groups) {
      throw new Error(
        `Invalid unicode range: "${range}". Expected format: U+XXXX or U+XXXX-U+XXXX`,
      );
    }
    const start = parseInt(match.groups.start, 16);
    const end = match.groups.end ? parseInt(match.groups.end, 16) : start;
    if (start > 0x10_ff_ff || end > 0x10_ff_ff) {
      throw new Error(`Invalid unicode range: "${range}". Codepoint exceeds U+10FFFF`);
    }
    if (end < start) {
      throw new Error(`Invalid unicode range: "${range}". End must be >= start`);
    }
    for (let cp = start; cp <= end; cp++) {
      codePoints.push(cp);
    }
  }
  return codePoints;
}

/** Glyphs the cmap maps the code points to, each named after the first code point that reaches it. */
export function findMetaByCodePoints(font: Font, codePoints: readonly number[]): GlyphMeta[] {
  const names = new Map<number, string>();
  for (const codePoint of codePoints) {
    const glyph = font.glyphForCodePoint(codePoint);
    if (glyph !== undefined && glyph !== NOTDEF && !names.has(glyph)) {
      names.set(glyph, String.fromCodePoint(codePoint));
    }
  }
  return [...names].map(([glyph, name]) => glyphToMeta(font, glyph, name));
}

/**
 * Glyphs the default layout gives the ligatures, each named after the text it was shaped from.
 * The ligatures are shaped joined by spaces; the glyph of that separator is never extracted.
 */
export function findMetaByLigatures(font: Font, ligatures: readonly string[]): GlyphMeta[] {
  if (ligatures.length === 0) {
    return [];
  }

  // A font without a space glyph shapes the separator to .notdef, which is skipped the same way
  const whitespaceGlyph = font.glyphForCodePoint(WHITESPACE.codePointAt(0) as number) ?? NOTDEF;
  const names = new Map<number, string>();
  for (const { id, text } of font.shape(ligatures.join(WHITESPACE))) {
    if (id !== whitespaceGlyph && !names.has(id)) {
      names.set(id, text);
    }
  }
  return [...names].map(([glyph, name]) => glyphToMeta(font, glyph, name));
}

/**
 * Rejects the first text the default layout doesn't turn into one glyph other than .notdef, which
 * `findMetaByLigatures()` would extract as the glyphs of its letters. Each text is shaped on its
 * own like in `formsGlyph()`; it gives the glyphs of the joined shaping as long as no lookup
 * reaches across the space between the texts.
 */
export function assertLigaturesForm(font: Font, ligatures: readonly string[]): void {
  const unformed = ligatures.find((text) => {
    const glyphs = font.shape(text);
    return glyphs.length !== 1 || glyphs[0].id === NOTDEF;
  });
  if (unformed !== undefined) {
    throw new Error(`Font does not contain a ligature for "${unformed}"`);
  }
}

/**
 * Rejects an empty icon font. Ligatures and raws that pass their checks give a glyph each, so only
 * unicode ranges the cmap doesn't map leave the selection empty.
 */
export function assertGlyphsSelected(
  glyphs: readonly GlyphMeta[],
  unicodeRanges: readonly string[],
): void {
  if (glyphs.length === 0) {
    throw new Error(
      `No glyphs match the selection: the font maps none of unicodeRanges ${unicodeRanges.join(", ")}`,
    );
  }
}

/** Text of the first character mapped to each glyph; "" for glyphs outside the cmap. */
const firstString = (font: Font, glyph: number): string => font.stringsForGlyph(glyph)[0] ?? "";

export function resolveLigatures(font: Font, raws: readonly string[]): string[] {
  if (raws.length === 0) {
    return [];
  }

  const ligatures = font.ligatures();
  if (ligatures.length === 0) {
    throw new Error("Font does not contain a GSUB ligature lookup table");
  }

  const texts = new Map<number, string[]>();
  for (const { glyph, components } of ligatures) {
    const text = components.map((component) => firstString(font, component)).join("");
    texts.set(glyph, [...(texts.get(glyph) ?? []), text]);
  }

  return raws.flatMap((raw) => {
    const codePoint = raw.codePointAt(0);
    if (codePoint === undefined) {
      throw new Error(`Font does not contain a glyph for "${raw}"`);
    }
    const glyph = font.glyphForCodePoint(codePoint) ?? NOTDEF;
    const forming = [...new Set(texts.get(glyph))].filter((text) => formsGlyph(font, text, glyph));
    if (forming.length === 0) {
      throw new Error(`Font does not contain a ligature for "${raw}"`);
    }
    return forming;
  });
}

/**
 * Whether the default layout turns `text` into `glyph`. Lookups of features that are off by
 * default (`dlig`, `hlig`) or reached only from contextual lookups don't form the ligature, and
 * the icon engine would ship their component glyphs instead.
 */
function formsGlyph(font: Font, text: string, glyph: number): boolean {
  const glyphs = font.shape(text);
  return glyphs.length === 1 && glyphs[0].id === glyph;
}
