import { decompress } from "wawoff2";
import { toSfnt } from "./font/container";
import { openFont, type Font } from "./font/font";

export {
  codePointsToString,
  parseUnicodeRanges,
  findMetaByCodePoints,
  findMetaByLigatures,
  resolveLigatures,
} from "./core";

/** Opens a TrueType, OpenType, WOFF or WOFF2 font; font collections are rejected. */
export async function createFont(content: Uint8Array): Promise<Font> {
  return openFont(await toSfnt(content, decompress));
}
