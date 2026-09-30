import svg2ttf from "svg2ttf";
import {
  type ExtractedResult,
  Format,
  type Formats,
  type GlyphMeta,
  type IconOption,
} from "../types";
import {
  createFont,
  findMetaByCodePoints,
  findMetaByLigatures,
  parseUnicodeRanges,
  resolveLigatures,
} from "../glyphs";
import { assertGlyphsSelected, assertLigaturesForm } from "../core";
import { applySafariFix } from "../safari";
import { hbSubset, SubsetFlag } from "./hb-subset";
import { buildReport, encodeFromTtf, type FontBuffers } from "./shared";
import { buildSvgFont } from "./svg-font";

const DEFAULT_FORMATS = Object.values(Format);
/**
 * Name records the repacked font keeps: family, subfamily, full name (three.js TTFLoader reads
 * it) and PostScript name.
 */
const NAME_IDS = [1, 2, 4, 6];
/** Windows English, the only language svg2ttf writes. */
const NAME_LANGUAGES = [0x4_09];

/**
 * Rewrites the TTF of svg2ttf with hb-subset, keeping every glyph, code point and layout feature.
 * svg2ttf writes cmap subtables for several platforms, glyph names in post and Mac and Windows
 * name records; HarfBuzz writes the cmap compactly, post without glyph names (the names are in
 * `meta`) and only the Windows records of the kept names. The head dates stay those of svg2ttf.
 */
async function repack(ttf: Uint8Array): Promise<Buffer> {
  const packed = await hbSubset(ttf, {
    unicodes: "*",
    glyphs: "*",
    flags: SubsetFlag.NO_HINTING,
    layoutFeatures: "*",
    nameIds: NAME_IDS,
    nameLanguages: NAME_LANGUAGES,
  });
  return Buffer.from(packed.buffer, packed.byteOffset, packed.byteLength);
}

async function convertByFormats(
  svgFont: Buffer,
  formats: Formats[],
  { safariFix = false, timestamp }: { safariFix?: boolean; timestamp: number },
): Promise<FontBuffers> {
  const svg = formats.includes("svg") ? { svg: svgFont } : {};
  if (formats.every((format) => format === "svg")) {
    return svg;
  }

  const ttf = await repack(svg2ttf(svgFont.toString(), { ts: timestamp }).buffer);
  const binaryFonts = await encodeFromTtf(safariFix ? applySafariFix(ttf) : ttf, formats);
  return { ...svg, ...binaryFonts };
}

export async function extractIcon(content: Buffer, option: IconOption): Promise<ExtractedResult> {
  const {
    fontName = "",
    formats = DEFAULT_FORMATS,
    ligatures = [],
    raws = [],
    unicodeRanges = [],
  } = option;

  const font = await createFont(content);
  assertLigaturesForm(font, ligatures);
  const foundLigatures = resolveLigatures(font, raws);
  const ligatureMeta = findMetaByLigatures(font, [ligatures, foundLigatures].flat());
  const unicodeMeta =
    unicodeRanges.length > 0 ? findMetaByCodePoints(font, parseUnicodeRanges(unicodeRanges)) : [];

  const seen = new Set<string>();
  const glyphsMeta: GlyphMeta[] = [];
  for (const meta of [...ligatureMeta, ...unicodeMeta]) {
    if (!seen.has(meta.name)) {
      seen.add(meta.name);
      glyphsMeta.push(meta);
    }
  }
  assertGlyphsSelected(glyphsMeta, unicodeRanges);

  const svgFont = buildSvgFont(fontName, glyphsMeta);
  const fonts = await convertByFormats(svgFont, formats, {
    safariFix: option.safariFix,
    /* The source font's head.modified instead of the current time keeps the output
       byte-identical for identical input, so content-hashed asset names stay stable */
    timestamp: font.modified,
  });

  return {
    ...fonts,
    meta: glyphsMeta,
    report: buildReport(content.length, fonts, formats),
    warnings: [],
  };
}
