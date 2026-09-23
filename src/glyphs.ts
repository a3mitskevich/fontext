import { create, type Font } from "fontkit";

export {
  codePointsToString,
  parseUnicodeRanges,
  findMetaByCodePoints,
  findMetaByLigatures,
  resolveLigatures,
} from "./core";

export function createFont(content: Buffer): Font {
  const font = create(content);
  if ("fonts" in font) {
    throw new Error("Font collections (TTC/DFONT) are not supported. Provide a single font file.");
  }
  return font;
}
