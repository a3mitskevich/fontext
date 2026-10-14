import type { ConvertOption, ExtractedResult } from "../types";
import type { Optimization } from "../optimization";
import type { Font } from "../font/font";
import { createFont, findMetaByCodePoints } from "../glyphs";
import { unpinnedAxesWarning } from "./instance";
import { buildReport } from "./report";
import { encodeFromTtf, type FontBuffers, subsetToTtf } from "./shared";
import { loadSource, type SourceFont } from "./source";
import { type BuiltFont, buildChunks, planChunks } from "./split";
import { buildSvgFont } from "./svg-font";

interface ConvertSource {
  readonly source: SourceFont;
  readonly font: Font;
  readonly option: ConvertOption;
  readonly optimization: Optimization;
}

/** Re-encodes the code points of the source, all of them or those of a chunk, in every format. */
async function buildConvert(
  { source, font, option, optimization }: ConvertSource,
  codePoints: readonly number[],
  script?: string,
): Promise<BuiltFont> {
  const { fontName = "", safariFix, transform } = option;
  const { formats } = optimization;
  const subset = formats.some((f) => f !== "svg")
    ? await subsetToTtf(
        source.content,
        { codePoints },
        {
          optimization,
          safariFix,
          transform,
          script,
          axes: source.axes,
        },
      )
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
      report: buildReport(source, fonts, formats, ttf && { ttf, axes: outputFont.axes }),
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
  const source = await loadSource(content, option.axes);
  const font = await createFont(source.content);
  const convertSource: ConvertSource = { source, font, option, optimization };

  const built = await buildConvert(convertSource, font.codePoints);
  // The warning about the axes goes to the unsplit font only
  const axesWarning = unpinnedAxesWarning(source.inputAxes, option.axes);
  const result = axesWarning
    ? { ...built.result, warnings: [axesWarning, ...built.result.warnings] }
    : built.result;
  if (!option.split) {
    return result;
  }
  const plans = planChunks({ codePoints: font.codePoints });
  const chunks = await buildChunks(plans, (plan) =>
    buildConvert(convertSource, plan.selection.codePoints, plan.script),
  );
  return { ...result, chunks };
}
