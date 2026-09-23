import subsetFont from "subset-font";
import ttf2eot from "ttf2eot";
import ttf2woff from "ttf2woff";
import { compress as ttf2woff2, decompress } from "wawoff2";
import type { Formats, OptimizationReport } from "../types";
import { toSfnt } from "../font/container";
import { applySafariFix } from "../safari";
import { restoreKerning } from "./kerning";

type BinaryFormat = Exclude<Formats, "svg">;

export type FontBuffers = Partial<Record<Formats, Buffer>>;

const ENCODERS: Record<BinaryFormat, (ttf: Buffer) => Buffer | Promise<Buffer>> = {
  ttf: (ttf) => ttf,
  woff: (ttf) => Buffer.from(ttf2woff(new Uint8Array(ttf))),
  woff2: async (ttf) => Buffer.from(await ttf2woff2(ttf)),
  eot: (ttf) => Buffer.from(ttf2eot(new Uint8Array(ttf))),
};

/** Encodes a TrueType font into every requested binary format; `svg` is skipped. */
export async function encodeFromTtf(ttf: Buffer, formats: Formats[]): Promise<FontBuffers> {
  const binaryFormats = formats.filter((format): format is BinaryFormat => format !== "svg");
  const encoded = await Promise.all(
    binaryFormats.map(async (format) => [format, await ENCODERS[format](ttf)] as const),
  );
  return Object.fromEntries(encoded);
}

/**
 * Subsets a font to the given text as TrueType, with the legacy kern pairs of the kept glyphs,
 * optionally patched for Safari.
 */
export async function subsetToTtf(
  content: Buffer,
  text: string,
  safariFix = false,
): Promise<Buffer> {
  const source = await toSfnt(content, decompress);
  const subset = await subsetFont(
    Buffer.from(source.buffer, source.byteOffset, source.length),
    text,
    {
      targetFormat: "truetype",
    },
  );
  const kerned = await restoreKerning(source, subset);
  const ttf = Buffer.from(kerned.buffer, kerned.byteOffset, kerned.byteLength);
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
