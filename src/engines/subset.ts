import { type ExtractedResult, type Formats, type SubsetOption } from "../types";
import { createFont, findMetaByCodePoints, parseUnicodeRanges } from "../glyphs";
import { buildReport, encodeFromTtf, subsetToTtf } from "./shared";

const DEFAULT_FORMATS: Formats[] = ["ttf", "woff", "woff2"];

/** Code points of the characters and unicode ranges; ligatures are kept apart from them. */
function collectCodePoints(option: SubsetOption): number[] {
  const characters = [...(option.characters ?? "")].map((char) => char.codePointAt(0) ?? 0);
  const ranges = option.unicodeRanges?.length ? parseUnicodeRanges(option.unicodeRanges) : [];
  return [...new Set([...characters, ...ranges])];
}

export async function extractSubset(
  content: Buffer,
  option: SubsetOption,
): Promise<ExtractedResult> {
  const { formats = DEFAULT_FORMATS, ligatures = [] } = option;

  const codePoints = collectCodePoints(option);
  if (codePoints.length === 0 && ligatures.every((ligature) => ligature.length === 0)) {
    throw new Error("No characters to subset. Provide characters, unicodeRanges, or ligatures.");
  }

  if (formats.every((f) => f === "svg")) {
    throw new Error("Subset engine does not support SVG format. Use icon engine for SVG output.");
  }

  const { ttf, warnings } = await subsetToTtf(content, { codePoints, ligatures }, option.safariFix);
  const fonts = await encodeFromTtf(ttf, formats);
  const subsetted = await createFont(ttf);

  return {
    ...fonts,
    meta: findMetaByCodePoints(subsetted, subsetted.codePoints),
    report: buildReport(content.length, fonts, formats),
    warnings,
  };
}
