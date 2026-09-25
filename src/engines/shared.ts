import subsetFont from "subset-font";
import ttf2eot from "ttf2eot";
import ttf2woff from "ttf2woff";
import { compress as ttf2woff2, decompress } from "wawoff2";
import type { FontWarning, Formats, OptimizationReport } from "../types";
import { toSfnt } from "../font/container";
import { applySafariFix } from "../safari";
import { restoreKerning } from "./kerning";

type BinaryFormat = Exclude<Formats, "svg">;

export type FontBuffers = Partial<Record<Formats, Buffer>>;

// The WOFF header starts with the "wOFF" signature, followed by the flavor
const WOFF_FLAVOR_OFFSET = 4;
const SFNT_VERSION_LENGTH = 4;

/**
 * The ttf2woff package takes the WOFF flavor from `head.version` (always 1.0), so a CFF font gets
 * 0x00010000 instead of `OTTO` and Safari rejects it. The flavor is the sfnt version, copied here
 * from the font; the WOFF header has no checksum, so nothing else changes.
 */
function toWoff(ttf: Buffer): Buffer {
  const woff = Buffer.from(ttf2woff(new Uint8Array(ttf)));
  ttf.copy(woff, WOFF_FLAVOR_OFFSET, 0, SFNT_VERSION_LENGTH);
  return woff;
}

const ENCODERS: Record<BinaryFormat, (ttf: Buffer) => Buffer | Promise<Buffer>> = {
  ttf: (ttf) => ttf,
  woff: toWoff,
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

export interface SubsetTtf {
  ttf: Buffer;
  warnings: FontWarning[];
}

/**
 * Subsets a font to the given text as TrueType, with the legacy kern pairs of the kept glyphs,
 * optionally patched for Safari. Warns about legacy kerning it could not keep.
 */
export async function subsetToTtf(
  content: Buffer,
  text: string,
  safariFix = false,
): Promise<SubsetTtf> {
  const source = await toSfnt(content, decompress);
  const subset = await subsetFont(
    Buffer.from(source.buffer, source.byteOffset, source.length),
    text,
    {
      targetFormat: "truetype",
    },
  );
  const { font, warnings } = await restoreKerning(source, subset);
  const ttf = Buffer.from(font.buffer, font.byteOffset, font.byteLength);
  return { ttf: safariFix ? applySafariFix(ttf) : ttf, warnings };
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
