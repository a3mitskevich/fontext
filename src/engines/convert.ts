import type { ConvertOption, ExtractedResult } from "../types";
import type { Optimization } from "../optimization";
import type { Font } from "../font/font";
import { createFont, findMetaByCodePoints } from "../glyphs";
import { buildReport, encodeFromTtf, type FontBuffers, subsetToTtf } from "./shared";
import { type BuiltFont, buildChunks, planChunks } from "./split";
import { buildSvgFont } from "./svg-font";

interface ConvertSource {
  readonly content: Buffer;
  readonly font: Font;
  readonly option: ConvertOption;
  readonly optimization: Optimization;
}

/** Re-encodes the code points of the source, all of them or those of a chunk, in every format. */
async function buildConvert(
  { content, font, option, optimization }: ConvertSource,
  codePoints: readonly number[],
  script?: string,
): Promise<BuiltFont> {
  const { fontName = "", safariFix, transform } = option;
  const { formats } = optimization;
  const subset = formats.some((f) => f !== "svg")
    ? await subsetToTtf(content, { codePoints }, { optimization, safariFix, transform, script })
    : null;
  const ttf = subset?.ttf;
  const binaryFonts = ttf ? await encodeFromTtf(ttf, formats) : {};
  const svgFont = formats.includes("svg")
    ? { svg: buildSvgFont(fontName, findMetaByCodePoints(font, codePoints), font.unitsPerEm) }
    : {};
  const fonts: FontBuffers = { ...binaryFonts, ...svgFont };

  // Without a binary format the output maps what the source maps of the code points
  const outputFont = ttf ? await createFont(ttf) : font;
  const outputCodePoints = ttf ? outputFont.codePoints : codePoints;

  return {
    result: {
      ...fonts,
      meta: findMetaByCodePoints(outputFont, outputCodePoints),
      report: buildReport(content.length, fonts, formats),
      warnings: subset?.warnings ?? [],
    },
    codePoints: outputCodePoints,
  };
}

export async function extractConvert(
  content: Buffer,
  option: ConvertOption,
  optimization: Optimization,
): Promise<ExtractedResult> {
  const font = await createFont(content);
  const source: ConvertSource = { content, font, option, optimization };

  const { result } = await buildConvert(source, font.codePoints);
  if (!option.split) {
    return result;
  }
  const plans = planChunks({ codePoints: font.codePoints });
  const chunks = await buildChunks(plans, (plan) =>
    buildConvert(source, plan.selection.codePoints, plan.script),
  );
  return { ...result, chunks };
}
