import subsetFont from "subset-font";
import {
  type ExtractedResult,
  type Formats,
  type SubsetOption,
  type OptimizationReport,
} from "../types";
import { createFont, findMetaByCodePoints, parseUnicodeRanges } from "../glyphs";
import { applySafariFix } from "../safari";

const DEFAULT_FORMATS: Formats[] = ["ttf", "woff", "woff2"];

const FORMAT_TO_TARGET: Record<string, string> = {
  ttf: "truetype",
  woff: "woff",
  woff2: "woff2",
  eot: "truetype",
};

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

  const text = String.fromCodePoint(...codePoints);
  const result: ExtractedResult = { meta: [], report: { originalSize: 0, formats: {} } };

  const unsupported = formats.filter((f) => f === "svg");
  if (unsupported.length > 0 && formats.every((f) => f === "svg")) {
    throw new Error("Subset engine does not support SVG format. Use icon engine for SVG output.");
  }

  const subsetFormats = formats.filter((f) => f !== "svg" && f !== "eot");

  if (option.safariFix) {
    // When safariFix: generate TTF, patch it, derive other formats from patched TTF
    const ttfSubset = Buffer.from(await subsetFont(content, text, { targetFormat: "truetype" }));
    const patchedTtf = applySafariFix(ttfSubset);

    if (formats.includes("ttf")) {
      result.ttf = patchedTtf;
    }
    if (formats.includes("woff")) {
      const ttf2woffModule = await import("ttf2woff");
      result.woff = Buffer.from(
        ttf2woffModule.default(new Uint8Array(patchedTtf)) as unknown as ArrayBuffer,
      );
    }
    if (formats.includes("woff2")) {
      const ttf2woff2Module = await import("ttf2woff2");
      result.woff2 = Buffer.from(ttf2woff2Module.default(patchedTtf) as unknown as ArrayBuffer);
    }
    if (formats.includes("eot")) {
      const ttf2eotModule = await import("ttf2eot");
      result.eot = Buffer.from(
        ttf2eotModule.default(new Uint8Array(patchedTtf)) as unknown as ArrayBuffer,
      );
    }
  } else {
    await Promise.all(
      subsetFormats.map(async (format) => {
        const targetFormat = FORMAT_TO_TARGET[format] as "truetype" | "woff" | "woff2";
        const subsetted = await subsetFont(content, text, { targetFormat });
        result[format] = Buffer.from(subsetted);
      }),
    );

    // EOT: subset as truetype, then convert
    if (formats.includes("eot")) {
      const ttfSubset =
        result.ttf ?? Buffer.from(await subsetFont(content, text, { targetFormat: "truetype" }));
      const ttf2eotModule = await import("ttf2eot");
      const ttf2eot = ttf2eotModule.default;
      result.eot = Buffer.from(ttf2eot(new Uint8Array(ttfSubset)) as unknown as ArrayBuffer);
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
