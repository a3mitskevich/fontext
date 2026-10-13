import { decodeWoff2 } from "./woff2";
import { toSfnt } from "./font/container";
import { openFont, type Font } from "./font/font";
import { missingCodePoints } from "./core";
import { toBuffer } from "./input";
import type { FontInput } from "./types";

export {
  parseUnicodeRanges,
  findMetaByCodePoints,
  findMetaByLigatures,
  resolveLigatures,
} from "./core";

/** Opens a TrueType, OpenType, WOFF or WOFF2 font; font collections are rejected. */
export async function createFont(content: Uint8Array): Promise<Font> {
  return openFont(await toSfnt(content, decodeWoff2));
}

/**
 * Code points of the text the font has no glyph for, each once, in the order they occur: what a
 * subset of the text would lack. Control characters such as a line feed are listed too.
 */
export async function findMissingCodePoints(data: FontInput, text: string): Promise<number[]> {
  if (typeof text !== "string") {
    throw new TypeError("text must be a string");
  }
  return missingCodePoints(await createFont(toBuffer(data)), text);
}
