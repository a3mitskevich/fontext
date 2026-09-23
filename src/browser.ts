/**
 * Browser-compatible entry point for fontext.
 *
 * Provides glyph discovery and SVG extraction without Node.js dependencies
 * (no fs, stream, or format converters). Use this in browser environments
 * to inspect fonts, extract glyph metadata, and get SVG paths.
 */

import { toSfnt } from "./font/container";
import { openFont, type Font } from "./font/font";
import { resolveLigatures } from "./core";

export { type GlyphMeta, type Formats, Format } from "./types";
export { type Font, type ShapedGlyph, type LigatureRecord } from "./font/font";
export { parseUnicodeRanges, findMetaByCodePoints, findMetaByLigatures } from "./core";

function rejectWoff2(): Promise<never> {
  return Promise.reject(
    new Error(
      "WOFF2 input is not supported in fontext/browser. Provide a TTF, OTF or WOFF font, or use the Node entry, which reads WOFF2.",
    ),
  );
}

/** Opens a TrueType, OpenType or WOFF font; font collections are rejected. */
export async function createFont(data: Uint8Array | ArrayBuffer): Promise<Font> {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  return openFont(await toSfnt(bytes, rejectWoff2));
}

export async function findLigaturesByRaws(
  data: Uint8Array | ArrayBuffer,
  raws: string[],
): Promise<string[]> {
  return resolveLigatures(await createFont(data), raws);
}
