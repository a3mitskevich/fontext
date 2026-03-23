import { create, type Font } from "fontkit";
import { resolveLigatures } from "./core";

export { parseUnicodeRanges, findMetaByCodePoints, findMetaByLigatures } from "./core";

export function createFont(content: Buffer): Font {
  const font = create(content);
  if ("fonts" in font) {
    throw new Error("Font collections (TTC/DFONT) are not supported. Provide a single font file.");
  }
  return font;
}

export function findLigaturesByRaws(content: Buffer, raws: string[]): string[] {
  const font = createFont(content);
  return resolveLigatures(font, raws);
}
