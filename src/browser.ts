/**
 * Browser-compatible entry point for fontext.
 *
 * Provides glyph discovery and SVG extraction without Node.js dependencies
 * (no fs, stream, or format converters). Use this in browser environments
 * to inspect fonts, extract glyph metadata, and get SVG paths.
 */

import { create, type Font, type Glyph, type Lookup, type Ligature } from "fontkit";
import type { GlyphMeta } from "./types";

export { type GlyphMeta, type Formats, Format } from "./types";

const DEFAULT_FONT_SIZE = 1000;
const WHITESPACE = " ";

function renderSvg(svgPath: string, width: number, height: number): string {
  return `<svg viewBox="0 -${height} ${width} ${height}" xmlns="http://www.w3.org/2000/svg">\n  <path d="${svgPath}" />\n</svg>`;
}

function codePointsToName(symbols: number[]): string {
  return symbols.map((symbol) => String.fromCodePoint(symbol)).join("");
}

function toSvg(glyph: Glyph): string {
  const svgPath = glyph.path.scale(-1, 1).rotate(Math.PI).toSVG();
  const width = glyph.advanceWidth ?? DEFAULT_FONT_SIZE;
  const height = glyph.advanceHeight ?? DEFAULT_FONT_SIZE;
  return renderSvg(svgPath, width, height);
}

function glyphToMeta(font: Font, glyph: Glyph): GlyphMeta {
  return {
    name: codePointsToName(glyph.codePoints),
    unicode: font.stringsForGlyph(glyph.id),
    svg: toSvg(glyph),
  };
}

export function createFont(data: Uint8Array | ArrayBuffer): Font {
  const buf = data instanceof Uint8Array ? data : new Uint8Array(data);
  const font = create(buf as unknown as Buffer);
  if ("fonts" in font) {
    throw new Error("Font collections (TTC/DFONT) are not supported. Provide a single font file.");
  }
  return font;
}

export function parseUnicodeRanges(ranges: string[]): number[] {
  const codePoints: number[] = [];
  for (const range of ranges) {
    const match = range.match(/^U\+([0-9A-Fa-f]+)(?:-U?\+?([0-9A-Fa-f]+))?$/);
    if (!match) {
      throw new Error(
        `Invalid unicode range: "${range}". Expected format: U+XXXX or U+XXXX-U+XXXX`,
      );
    }
    const start = parseInt(match[1], 16);
    const end = match[2] ? parseInt(match[2], 16) : start;
    if (end < start) {
      throw new Error(`Invalid unicode range: "${range}". End must be >= start`);
    }
    for (let cp = start; cp <= end; cp++) {
      codePoints.push(cp);
    }
  }
  return codePoints;
}

export function findMetaByLigatures(
  font: Font,
  ligatures: string[],
  withWhitespace = false,
): GlyphMeta[] {
  if (ligatures.length === 0) {
    return [];
  }

  const [whitespaceGlyph] = font.glyphsForString(WHITESPACE);
  const layout = font.layout(ligatures.join(WHITESPACE));
  const glyphs = Array.from<Glyph>(new Set(layout.glyphs)).filter(
    (glyph) => withWhitespace || glyph.id !== whitespaceGlyph?.id,
  );
  return glyphs.map((glyph) => glyphToMeta(font, glyph));
}

export function findMetaByCodePoints(font: Font, codePoints: number[]): GlyphMeta[] {
  const glyphs: Glyph[] = [];
  for (const cp of codePoints) {
    const glyph = font.glyphForCodePoint(cp);
    if (glyph && glyph.id !== 0) {
      glyphs.push(glyph);
    }
  }
  const unique = Array.from(new Map(glyphs.map((g) => [g.id, g])).values());
  return unique.map((glyph) => glyphToMeta(font, glyph));
}

export function findLigaturesByRaws(data: Uint8Array | ArrayBuffer, raws: string[]): string[] {
  if (raws.length === 0) {
    return [];
  }

  const font = createFont(data);

  const lookupList = font.GSUB?.lookupList.toArray().find((list: Lookup) => list.lookupType === 4);
  if (!lookupList) {
    throw new Error("Font does not contain a GSUB ligature lookup table");
  }

  const {
    coverage: { glyphs, rangeRecords },
    ligatureSets,
  } = lookupList.subTables[0];

  const leadingChars: string[] = rangeRecords
    ? rangeRecords.flatMap(({ start, end }) =>
        Array.from({ length: end - start + 1 }, (_, position) => position + start).map(
          (item) => font.stringsForGlyph(item)[0],
        ),
      )
    : glyphs.map((id) => {
        const result = font.stringsForGlyph(id);
        return result.join("");
      });

  const map = new Map<number, { ligature: Ligature; leading: string }[]>();

  const ligaturesLists = ligatureSets.toArray();

  for (let index = 0; index < ligaturesLists.length; index++) {
    const currentList = ligaturesLists[index];
    const leading = leadingChars[index];
    for (const ligature of currentList) {
      const id = ligature.glyph;
      if (!map.has(id)) {
        map.set(id, []);
      }
      map.get(id)?.push({ ligature, leading });
    }
  }

  return raws.flatMap((raw) => {
    const glyph = font.glyphsForString(raw)[0];
    const ligaturesMetas = map.get(glyph.id);
    if (!ligaturesMetas) {
      throw new Error(`Font does not contain a ligature for "${raw}"`);
    }
    return ligaturesMetas.map((meta) => {
      const ligatureBody = meta.ligature.components
        .map((code) => font.stringsForGlyph(code)[0])
        .join("");
      return meta.leading + ligatureBody;
    });
  });
}
