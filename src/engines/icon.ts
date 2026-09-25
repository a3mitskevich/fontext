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
import { applySafariFix } from "../safari";
import { buildReport, encodeFromTtf, type FontBuffers } from "./shared";
import { buildSvgFont } from "./svg-font";

const DEFAULT_FORMATS = Object.values(Format);
async function convertByFormats(
  svgFont: Buffer,
  formats: Formats[],
  { safariFix = false, timestamp }: { safariFix?: boolean; timestamp: number },
): Promise<FontBuffers> {
  const svg = formats.includes("svg") ? { svg: svgFont } : {};
  if (formats.every((format) => format === "svg")) {
    return svg;
  }

  const ttf = Buffer.from(svg2ttf(svgFont.toString(), { ts: timestamp }).buffer);
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
    withWhitespace = false,
  } = option;

  const font = await createFont(content);
  const foundLigatures = resolveLigatures(font, raws);
  const ligatureMeta = findMetaByLigatures(
    font,
    [ligatures, foundLigatures].flat(),
    withWhitespace,
  );
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
