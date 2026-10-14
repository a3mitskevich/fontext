import type { ExtractedResult, FontWarning, SubsetOption } from "../types";
import type { Optimization } from "../optimization";
import { createFont, findMetaByCodePoints, parseUnicodeRanges } from "../glyphs";
import { missingCodePoints } from "../core";
import { missingCharactersWarning } from "./missing-characters";
import { buildReport } from "./report";
import { encodeFromTtf, type SubsetSelection, subsetToTtf } from "./shared";
import { loadSource, type SourceFont } from "./source";
import { type BuiltFont, buildChunks, type ChunkPlan, planChunks } from "./split";

/** Code points of the characters and unicode ranges; ligatures are kept apart from them. */
function collectCodePoints(option: SubsetOption): number[] {
  const characters = [...(option.characters ?? "")].map((char) => char.codePointAt(0) ?? 0);
  const ranges = option.unicodeRanges?.length ? parseUnicodeRanges(option.unicodeRanges) : [];
  return [...new Set([...characters, ...ranges])];
}

/** Subsets the source to the selection in every requested format. */
async function buildSubset(
  source: SourceFont,
  selection: SubsetSelection,
  option: SubsetOption,
  optimization: Optimization,
  script?: string,
): Promise<BuiltFont> {
  const { formats } = optimization;
  const { safariFix, transform } = option;
  const { ttf, warnings } = await subsetToTtf(source.content, selection, {
    optimization,
    safariFix,
    transform,
    script,
  });
  const fonts = await encodeFromTtf(ttf, formats);
  const subsetted = await createFont(ttf);
  return {
    result: {
      ...fonts,
      meta: findMetaByCodePoints(subsetted, subsetted.codePoints),
      report: buildReport(source, fonts, formats, { ttf, axes: subsetted.axes }),
      warnings,
    },
    codePoints: subsetted.codePoints,
  };
}

/**
 * The chunks of a split by script. Only code points the source maps are split, so a unicode range
 * over scripts the font lacks gives no chunks for them.
 */
async function planSplit(content: Buffer, selection: SubsetSelection): Promise<ChunkPlan[]> {
  const source = await createFont(content);
  const mapped = new Set(source.codePoints);
  const codePoints = selection.codePoints.filter((codePoint) => mapped.has(codePoint));
  return planChunks({ ...selection, codePoints });
}

/** The warning about characters the source has no glyph for; the font is read only for some. */
async function missingCharacters(
  source: SourceFont,
  characters: string | undefined,
): Promise<FontWarning | undefined> {
  if (!characters) {
    return undefined;
  }
  return missingCharactersWarning(missingCodePoints(await createFont(source.content), characters));
}

export async function extractSubset(
  content: Buffer,
  option: SubsetOption,
  optimization: Optimization,
): Promise<ExtractedResult> {
  const { ligatures = [] } = option;
  const { formats } = optimization;

  const codePoints = collectCodePoints(option);
  if (codePoints.length === 0 && ligatures.every((ligature) => ligature.length === 0)) {
    throw new Error("No characters to subset. Provide characters, unicodeRanges, or ligatures.");
  }

  if (formats.every((f) => f === "svg")) {
    throw new Error("Subset engine does not support SVG format. Use icon engine for SVG output.");
  }

  const source = await loadSource(content, option.axes);
  const selection: SubsetSelection = { codePoints, ligatures };
  // Planned first, so a ligature of two scripts rejects before anything is subset
  const plans = option.split ? await planSplit(source.content, selection) : undefined;
  const built = await buildSubset(source, selection, option, optimization);
  const missing = await missingCharacters(source, option.characters);
  const result = missing
    ? { ...built.result, warnings: [missing, ...built.result.warnings] }
    : built.result;
  if (!plans) {
    return result;
  }
  const chunks = await buildChunks(plans, (plan) =>
    buildSubset(source, plan.selection, option, optimization, plan.script),
  );
  return { ...result, chunks };
}
