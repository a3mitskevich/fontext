import ttf2eot from "ttf2eot";
import ttf2woff from "ttf2woff";
import { decodeWoff2, encodeWoff2 } from "../woff2";
import type { FontTransform, FontWarning, Formats, OptimizationReport } from "../types";
import { toSfnt } from "../font/container";
import { applySafariFix } from "../safari";
import { openFont } from "../font/font";
import type { Optimization } from "../optimization";
import { layoutClosure } from "./closure";
import { assertLigaturesKept } from "./ligature-check";
import { hbSubset, SubsetFlag, type SubsetInput } from "./hb-subset";
import { restoreKerning } from "./kerning";
import { applyTransform } from "./transform";

type BinaryFormat = Exclude<Formats, "svg">;

export type FontBuffers = Partial<Record<Formats, Buffer>>;

// The sfnt version is the first field of a font, the WOFF flavor the second field of its header
const SFNT_VERSION_OFFSET = 0;
const WOFF_FLAVOR_OFFSET = 4;

/**
 * The ttf2woff package takes the WOFF flavor from `head.version` (always 1.0), so a CFF font gets
 * 0x00010000 instead of `OTTO` and Safari rejects it. The flavor is the sfnt version, copied here
 * from the font; the WOFF header has no checksum, so nothing else changes.
 *
 * Upstream treats WOFF as outdated and will not fix this, see
 * https://github.com/fontello/ttf2woff/issues/14, so the copy stays as long as ttf2woff does.
 */
function toWoff(ttf: Buffer): Buffer {
  const woff = Buffer.from(ttf2woff(new Uint8Array(ttf)));
  woff.writeUInt32BE(ttf.readUInt32BE(SFNT_VERSION_OFFSET), WOFF_FLAVOR_OFFSET);
  return woff;
}

const ENCODERS: Record<BinaryFormat, (ttf: Buffer) => Buffer | Promise<Buffer>> = {
  ttf: (ttf) => ttf,
  woff: toWoff,
  woff2: encodeWoff2,
  eot: (ttf) => Buffer.from(ttf2eot(new Uint8Array(ttf))),
};

/** Encodes a TrueType font into every requested binary format; `svg` is skipped. */
export async function encodeFromTtf(
  ttf: Buffer,
  formats: readonly Formats[],
): Promise<FontBuffers> {
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

/** What a subset keeps. */
export interface SubsetSelection {
  /** Code points, with every glyph the layout can reach from them, e.g. "fi" for "f" and "i". */
  readonly codePoints: readonly number[];
  /**
   * Texts as the default layout shapes them, e.g. the ligature of "home" and its letters; other
   * glyphs their letters reach, like the ligature of "work", are left out.
   */
  readonly ligatures?: readonly string[];
}

const codePointsOf = (text: string): number[] => [...text].map((char) => char.codePointAt(0) ?? 0);

/** How hb-subset writes the font: what the optimization keeps besides the glyphs. */
type SubsetOutput = Pick<SubsetInput, "flags" | "layoutFeatures" | "nameIds" | "dropTables">;

const LAYOUT_FEATURES = { all: "*", default: undefined } as const;

/** The hb-subset options of an optimization; "default" features leave HarfBuzz's own set. */
function subsetOutputOf(optimization: Optimization): SubsetOutput {
  const { hinting, layoutFeatures, nameIds, dropTables, desubroutinize } = optimization;
  return {
    flags: (hinting ? 0 : SubsetFlag.NO_HINTING) | (desubroutinize ? SubsetFlag.DESUBROUTINIZE : 0),
    layoutFeatures:
      typeof layoutFeatures === "string" ? LAYOUT_FEATURES[layoutFeatures] : layoutFeatures,
    nameIds,
    dropTables,
  };
}

/**
 * HarfBuzz keeps every glyph the layout can reach from the code points, so the letters of a
 * ligature in an icon font would keep nearly every icon. Ligatures are kept as glyph ids without
 * the layout closure instead; the closure of the other code points is found in a pass of its own.
 */
async function subsetSfnt(
  source: Uint8Array,
  selection: SubsetSelection,
  output: SubsetOutput,
): Promise<Uint8Array> {
  const { codePoints } = selection;
  const ligatures = selection.ligatures?.filter((text) => text.length > 0) ?? [];
  if (ligatures.length === 0) {
    return hbSubset(source, { ...output, unicodes: codePoints });
  }
  const font = await openFont(source);
  const closure =
    codePoints.length > 0 ? await layoutClosure(source, codePoints, output.layoutFeatures) : [];
  const subset = await hbSubset(source, {
    ...output,
    unicodes: [...codePoints, ...ligatures.flatMap((text) => codePointsOf(text))],
    glyphs: [...closure, ...ligatures.flatMap((text) => font.layoutGlyphs(text))],
    flags: (output.flags ?? 0) | SubsetFlag.NO_LAYOUT_CLOSURE,
  });
  // Every feature keeps every ligature; a narrower set may leave one out
  if (output.layoutFeatures !== "*") {
    await assertLigaturesKept(font, subset, ligatures);
  }
  return subset;
}

export interface SubsetSettings {
  readonly optimization: Optimization;
  readonly safariFix?: boolean;
  readonly transform?: FontTransform;
  /** The script of the chunk being built, handed to the transform; undefined for the whole font. */
  readonly script?: string;
}

/**
 * Subsets a font as TrueType, with the legacy kern pairs of the kept glyphs, optionally patched
 * for Safari. Warns about legacy kerning it could not keep.
 */
export async function subsetToTtf(
  content: Buffer,
  selection: SubsetSelection,
  { optimization, safariFix = false, transform, script }: SubsetSettings,
): Promise<SubsetTtf> {
  const source = await toSfnt(content, decodeWoff2);
  const subset = await subsetSfnt(source, selection, subsetOutputOf(optimization));
  // HarfBuzz drops the legacy kern table; it is put back unless the options drop it
  const { font, warnings } = optimization.dropTables.includes("kern")
    ? { font: subset, warnings: [] }
    : await restoreKerning(source, subset);
  const ttf = Buffer.from(font.buffer, font.byteOffset, font.byteLength);
  const patched = safariFix ? applySafariFix(ttf) : ttf;
  return {
    ttf: await applyTransform(patched, transform, script === undefined ? undefined : { script }),
    warnings,
  };
}

export function buildReport(
  originalSize: number,
  fonts: FontBuffers,
  formats: readonly Formats[],
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
