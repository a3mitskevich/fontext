import { type ExtractedResult, type Formats, type SubsetOption } from "../types";
import {
  codePointsToString,
  createFont,
  findMetaByCodePoints,
  parseUnicodeRanges,
} from "../glyphs";
import { buildReport, encodeFromTtf, subsetToTtf } from "./shared";

const DEFAULT_FORMATS: Formats[] = ["ttf", "woff", "woff2"];

function collectCodePoints(option: SubsetOption): number[] {
  const codePoints = new Set<number>();

  if (option.characters) {
    for (const char of option.characters) {
      const cp = char.codePointAt(0);
      if (cp !== undefined) {
        codePoints.add(cp);
      }
    }
  }

  if (option.unicodeRanges?.length) {
    for (const cp of parseUnicodeRanges(option.unicodeRanges)) {
      codePoints.add(cp);
    }
  }

  if (option.ligatures?.length) {
    for (const lig of option.ligatures) {
      for (const char of lig) {
        const cp = char.codePointAt(0);
        if (cp !== undefined) {
          codePoints.add(cp);
        }
      }
    }
  }

  if (option.withWhitespace) {
    codePoints.add(0x20);
  }

  return [...codePoints];
}

export async function extractSubset(
  content: Buffer,
  option: SubsetOption,
): Promise<ExtractedResult> {
  const { formats = DEFAULT_FORMATS } = option;

  const codePoints = collectCodePoints(option);
  if (codePoints.length === 0) {
    throw new Error("No characters to subset. Provide characters, unicodeRanges, or ligatures.");
  }

  if (formats.every((f) => f === "svg")) {
    throw new Error("Subset engine does not support SVG format. Use icon engine for SVG output.");
  }

  const ttf = await subsetToTtf(content, codePointsToString(codePoints), option.safariFix);
  const fonts = await encodeFromTtf(ttf, formats);
  const subsetted = createFont(ttf);

  return {
    ...fonts,
    meta: findMetaByCodePoints(subsetted, subsetted.characterSet),
    report: buildReport(content.length, fonts, formats),
  };
}
