import { type ConvertOption, type ExtractedResult, Format } from "../types";
import { codePointsToString, createFont, findMetaByCodePoints } from "../glyphs";
import { convertToSvgFont } from "./icon";
import { buildReport, encodeFromTtf, type FontBuffers, subsetToTtf } from "./shared";

const DEFAULT_FORMATS = Object.values(Format);

export async function extractConvert(
  content: Buffer,
  option: ConvertOption,
): Promise<ExtractedResult> {
  const { fontName = "", formats = DEFAULT_FORMATS } = option;

  const font = await createFont(content);
  const allCodePoints = font.codePoints;

  const ttf = formats.some((f) => f !== "svg")
    ? await subsetToTtf(content, codePointsToString(allCodePoints), option.safariFix)
    : null;
  const binaryFonts = ttf ? await encodeFromTtf(ttf, formats) : {};
  const svgFont = formats.includes("svg")
    ? { svg: await convertToSvgFont(fontName, findMetaByCodePoints(font, allCodePoints)) }
    : {};
  const fonts: FontBuffers = { ...binaryFonts, ...svgFont };

  const outputFont = ttf ? await createFont(ttf) : font;

  return {
    ...fonts,
    meta: findMetaByCodePoints(outputFont, outputFont.codePoints),
    report: buildReport(content.length, fonts, formats),
  };
}
