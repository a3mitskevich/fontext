import type { ConvertOption, ExtractedResult } from "../types";
import type { Optimization } from "../optimization";
import { createFont, findMetaByCodePoints } from "../glyphs";
import { buildReport, encodeFromTtf, type FontBuffers, subsetToTtf } from "./shared";
import { buildSvgFont } from "./svg-font";

export async function extractConvert(
  content: Buffer,
  option: ConvertOption,
  optimization: Optimization,
): Promise<ExtractedResult> {
  const { fontName = "" } = option;
  const { formats } = optimization;

  const font = await createFont(content);
  const allCodePoints = font.codePoints;

  const subset = formats.some((f) => f !== "svg")
    ? await subsetToTtf(
        content,
        { codePoints: allCodePoints },
        { optimization, safariFix: option.safariFix },
      )
    : null;
  const ttf = subset?.ttf;
  const binaryFonts = ttf ? await encodeFromTtf(ttf, formats) : {};
  const svgFont = formats.includes("svg")
    ? { svg: buildSvgFont(fontName, findMetaByCodePoints(font, allCodePoints), font.unitsPerEm) }
    : {};
  const fonts: FontBuffers = { ...binaryFonts, ...svgFont };

  const outputFont = ttf ? await createFont(ttf) : font;

  return {
    ...fonts,
    meta: findMetaByCodePoints(outputFont, outputFont.codePoints),
    report: buildReport(content.length, fonts, formats),
    warnings: subset?.warnings ?? [],
  };
}
