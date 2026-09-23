import { convert } from "fontverter";
import subsetFont from "subset-font";
import ttf2eot from "ttf2eot";
import type { Formats, OptimizationReport } from "../types";
import { applySafariFix } from "../safari";

type BinaryFormat = Exclude<Formats, "svg">;

export type FontBuffers = Partial<Record<Formats, Buffer>>;

function encode(ttf: Buffer, format: BinaryFormat): Promise<Buffer> {
  if (format === "ttf") {
    return Promise.resolve(ttf);
  }
  if (format === "eot") {
    const eot = ttf2eot(new Uint8Array(ttf)) as unknown as ArrayBuffer;
    return Promise.resolve(Buffer.from(eot));
  }
  return convert(ttf, format, "truetype");
}

/** Encodes a TrueType font into every requested binary format; `svg` is skipped. */
export async function encodeFromTtf(ttf: Buffer, formats: Formats[]): Promise<FontBuffers> {
  const binaryFormats = formats.filter((format): format is BinaryFormat => format !== "svg");
  const encoded = await Promise.all(
    binaryFormats.map(async (format) => [format, await encode(ttf, format)] as const),
  );
  return Object.fromEntries(encoded);
}

/** Subsets a font to the given text as TrueType, optionally patched for Safari. */
export async function subsetToTtf(
  content: Buffer,
  text: string,
  safariFix = false,
): Promise<Buffer> {
  const ttf = Buffer.from(await subsetFont(content, text, { targetFormat: "truetype" }));
  return safariFix ? applySafariFix(ttf) : ttf;
}

export function buildReport(
  originalSize: number,
  fonts: FontBuffers,
  formats: Formats[],
): OptimizationReport {
  const entries = formats.flatMap((format) => {
    const buffer = fonts[format];
    if (!buffer) {
      return [];
    }
    const saving = originalSize > 0 ? ((originalSize - buffer.length) / originalSize) * 100 : 0;
    return [[format, { size: buffer.length, saving: Math.round(saving * 10) / 10 }] as const];
  });
  return { originalSize, formats: Object.fromEntries(entries) };
}
