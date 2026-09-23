import { Readable } from "stream";
import svg2ttf from "svg2ttf";
import { SVGIcons2SVGFontStream, type SVGIcons2SVGFontStreamOptions } from "svgicons2svgfont";
import {
  type ExtractedResult,
  Format,
  type Formats,
  type GlyphMeta,
  type GlyphStream,
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

const DEFAULT_FORMATS = Object.values(Format);
const DEFAULT_FONT_SIZE = 1000;

async function convertByFormats(
  svgFont: Buffer,
  formats: Formats[],
  safariFix?: boolean,
): Promise<FontBuffers> {
  const svg = formats.includes("svg") ? { svg: svgFont } : {};
  if (formats.every((format) => format === "svg")) {
    return svg;
  }

  const ttf = Buffer.from(svg2ttf(svgFont.toString()).buffer);
  const binaryFonts = await encodeFromTtf(safariFix ? applySafariFix(ttf) : ttf, formats);
  return { ...svg, ...binaryFonts };
}

export function createGlyphStream(content: string): GlyphStream {
  const stream = new Readable();
  stream.push(content);
  stream.push(null);
  return stream as GlyphStream;
}

export function convertToSvgFont(fontName: string, glyphsMeta: GlyphMeta[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const config: Partial<SVGIcons2SVGFontStreamOptions> = {
      fontName,
      normalize: true,
      fontHeight: DEFAULT_FONT_SIZE,
    };
    const stream = new SVGIcons2SVGFontStream(config)
      .on("data", (data: Buffer | string) => {
        chunks.push(typeof data === "string" ? Buffer.from(data) : data);
      })
      .on("end", () => {
        resolve(Buffer.concat(chunks));
      })
      .on("error", (err) => {
        reject(err);
      });
    glyphsMeta.forEach((meta) => {
      const glyphStream = createGlyphStream(meta.svg);
      glyphStream.metadata = {
        name: meta.name,
        unicode: [...new Set([...meta.unicode, meta.name])],
      };
      stream.write(glyphStream);
    });

    stream.end();
  });
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

  const font = createFont(content);
  /* Fontkit caches glyphs together with the code points of their first lookup, so resolving
     raws on `font` would make the later layout report the raw code point instead of the ligature */
  const foundLigatures = resolveLigatures(createFont(content), raws);
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

  const svgFont = await convertToSvgFont(fontName, glyphsMeta);
  const fonts = await convertByFormats(svgFont, formats, option.safariFix);

  return {
    ...fonts,
    meta: glyphsMeta,
    report: buildReport(content.length, fonts, formats),
  };
}
