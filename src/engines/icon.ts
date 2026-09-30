import svg2ttf from "svg2ttf";
import type { ExtractedResult, FontTransform, GlyphMeta, IconOption } from "../types";
import type { Optimization } from "../optimization";
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
import { applyTransform } from "./transform";
import { buildSvgFont } from "./svg-font";

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
 * The name ids and dropped tables of the optimization apply; its hinting and layout features
 * don't: svg2ttf writes no hinting, and its `liga` feature is what forms the ligatures.
 */
async function repack(ttf: Uint8Array, optimization: Optimization): Promise<Buffer> {
  const packed = await hbSubset(ttf, {
    unicodes: "*",
    glyphs: "*",
    flags: SubsetFlag.NO_HINTING,
    layoutFeatures: "*",
    nameIds: optimization.nameIds ?? NAME_IDS,
    nameLanguages: NAME_LANGUAGES,
    dropTables: optimization.dropTables,
  });
  return Buffer.from(packed.buffer, packed.byteOffset, packed.byteLength);
}

interface IconSettings {
  readonly optimization: Optimization;
  readonly safariFix?: boolean;
  readonly transform?: FontTransform;
  readonly timestamp: number;
}

async function convertByFormats(
  svgFont: Buffer,
  { optimization, safariFix = false, transform, timestamp }: IconSettings,
): Promise<FontBuffers> {
  const { formats } = optimization;
  const svg = formats.includes("svg") ? { svg: svgFont } : {};
  if (formats.every((format) => format === "svg")) {
    return svg;
  }

  const ttf = await repack(svg2ttf(svgFont.toString(), { ts: timestamp }).buffer, optimization);
  const final = await applyTransform(safariFix ? applySafariFix(ttf) : ttf, transform);
  const binaryFonts = await encodeFromTtf(final, formats);
  return { ...svg, ...binaryFonts };
}

export async function extractIcon(
  content: Buffer,
  option: IconOption,
  optimization: Optimization,
): Promise<ExtractedResult> {
  const { fontName = "", ligatures = [], raws = [], unicodeRanges = [] } = option;
  const { formats } = optimization;

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

  const svgFont = buildSvgFont(fontName, glyphsMeta, font.unitsPerEm);
  const fonts = await convertByFormats(svgFont, {
    optimization,
    safariFix: option.safariFix,
    transform: option.transform,
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
