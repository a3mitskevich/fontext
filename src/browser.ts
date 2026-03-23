/**
 * Browser-compatible entry point for fontext.
 *
 * Provides glyph discovery and SVG extraction without Node.js dependencies
 * (no fs, stream, or format converters). Use this in browser environments
 * to inspect fonts, extract glyph metadata, and get SVG paths.
 */

import { create, type Font } from "fontkit";
import { resolveLigatures } from "./core";

export { type GlyphMeta, type Formats, Format } from "./types";
export { parseUnicodeRanges, findMetaByCodePoints, findMetaByLigatures } from "./core";

export function createFont(data: Uint8Array | ArrayBuffer): Font {
  const buf = data instanceof Uint8Array ? data : new Uint8Array(data);
  const font = create(buf as unknown as Buffer);
  if ("fonts" in font) {
    throw new Error("Font collections (TTC/DFONT) are not supported. Provide a single font file.");
  }
  return font;
}

export function findLigaturesByRaws(data: Uint8Array | ArrayBuffer, raws: string[]): string[] {
  const font = createFont(data);
  return resolveLigatures(font, raws);
}
