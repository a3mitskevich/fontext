import subsetFont from "subset-font";
import { type ExtractedResult, Format, type MinifyOption, type OptimizationReport } from "../types";
import { createFont, findMetaByCodePoints } from "../glyphs";
import { convertToSvgFont } from "./icon";

const DEFAULT_FORMATS = Object.values(Format);

const FORMAT_TO_TARGET: Record<string, string> = {
  ttf: "truetype",
  woff: "woff",
  woff2: "woff2",
};

export async function extractConvert(
  content: Buffer,
  option: MinifyOption,
): Promise<ExtractedResult> {
  const { fontName = "", formats = DEFAULT_FORMATS } = option;

  const font = createFont(content);
  const allCodePoints = font.characterSet;
  const text = String.fromCodePoint(...allCodePoints);

  const result: ExtractedResult = { meta: [], report: { originalSize: 0, formats: {} } };

  const subsetFormats = formats.filter((f) => f !== "svg" && f !== "eot");

  await Promise.all(
    subsetFormats.map(async (format) => {
      const targetFormat = FORMAT_TO_TARGET[format] as "truetype" | "woff" | "woff2";
      const converted = await subsetFont(content, text, { targetFormat });
      result[format] = Buffer.from(converted);
    }),
  );

  if (formats.includes("eot")) {
    const ttfBuffer =
      result.ttf ?? Buffer.from(await subsetFont(content, text, { targetFormat: "truetype" }));
    const ttf2eotModule = await import("ttf2eot");
    const ttf2eot = ttf2eotModule.default;
    result.eot = Buffer.from(ttf2eot(new Uint8Array(ttfBuffer)) as unknown as ArrayBuffer);
  }

  if (formats.includes("svg")) {
    const glyphsMeta = findMetaByCodePoints(font, allCodePoints);
    const svgFont = await convertToSvgFont(fontName, glyphsMeta);
    result.svg = svgFont;
  }

  const firstBuffer = result.ttf ?? result.woff2 ?? result.woff;
  if (firstBuffer) {
    const outputFont = createFont(firstBuffer);
    result.meta = findMetaByCodePoints(outputFont, outputFont.characterSet);
  } else {
    result.meta = findMetaByCodePoints(font, allCodePoints);
  }

  const originalSize = content.length;
  const reportFormats: OptimizationReport["formats"] = {};
  for (const format of formats) {
    const buffer = result[format];
    if (buffer) {
      const size = buffer.length;
      const saving = originalSize > 0 ? ((originalSize - size) / originalSize) * 100 : 0;
      reportFormats[format] = { size, saving: Math.round(saving * 10) / 10 };
    }
  }
  result.report = { originalSize, formats: reportFormats };

  return result;
}
