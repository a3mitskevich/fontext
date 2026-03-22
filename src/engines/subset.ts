import subsetFont from "subset-font";
import {
  type ExtractedResult,
  Format,
  type Formats,
  type MinifyOption,
  type OptimizationReport,
} from "../types";
import { createFont, findMetaByCodePoints, parseUnicodeRanges } from "../glyphs";

const DEFAULT_FORMATS: Formats[] = ["ttf", "woff", "woff2"];

const FORMAT_TO_TARGET: Record<string, string> = {
  ttf: "truetype",
  woff: "woff",
  woff2: "woff2",
  eot: "truetype",
};

function collectCodePoints(option: MinifyOption): number[] {
  const codePoints = new Set<number>();

  if (option.characters) {
    for (const char of option.characters) {
      const cp = char.codePointAt(0);
      if (cp !== undefined) codePoints.add(cp);
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
        if (cp !== undefined) codePoints.add(cp);
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
  option: MinifyOption,
): Promise<ExtractedResult> {
  const { formats = DEFAULT_FORMATS } = option;

  const codePoints = collectCodePoints(option);
  if (codePoints.length === 0) {
    throw new Error("No characters to subset. Provide characters, unicodeRanges, or ligatures.");
  }

  const text = String.fromCodePoint(...codePoints);
  const result: ExtractedResult = { meta: [], report: { originalSize: 0, formats: {} } };

  // SVG not supported by subset-font — skip silently
  const subsetFormats = formats.filter((f) => f !== "svg" && f !== "eot");

  await Promise.all(
    subsetFormats.map(async (format) => {
      const targetFormat = FORMAT_TO_TARGET[format] as "truetype" | "woff" | "woff2";
      const subsetted = await subsetFont(content, text, { targetFormat });
      result[format] = Buffer.from(subsetted);
    }),
  );

  // EOT: subset as truetype, then the consumer can convert if needed
  if (formats.includes("eot")) {
    const ttfSubset =
      result.ttf ?? Buffer.from(await subsetFont(content, text, { targetFormat: "truetype" }));
    // Dynamic import to avoid loading ttf2eot unless needed
    const ttf2eot = (await import("ttf2eot")).default;
    result.eot = Buffer.from(ttf2eot(new Uint8Array(ttfSubset)) as unknown as ArrayBuffer);
    if (!formats.includes("ttf") && !result.ttf) {
      // TTF was only needed for EOT conversion, don't include in output
    }
  }

  // Extract metadata from the first available subset
  const firstBuffer = result.ttf ?? result.woff2 ?? result.woff;
  if (firstBuffer) {
    const font = createFont(firstBuffer);
    const charSet = font.characterSet;
    result.meta = findMetaByCodePoints(font, charSet);
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
