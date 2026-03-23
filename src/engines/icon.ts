import { Readable } from "stream";
import svg2ttf from "svg2ttf";
import ttf2woff from "ttf2woff";
import ttf2woff2 from "ttf2woff2";
import ttf2eot from "ttf2eot";
import { SVGIcons2SVGFontStream, type SVGIcons2SVGFontStreamOptions } from "svgicons2svgfont";
import {
  type ExtractedResult,
  Format,
  type Formats,
  type GlyphMeta,
  type GlyphStream,
  type IconOption,
  type OptimizationReport,
} from "../types";
import {
  createFont,
  findLigaturesByRaws,
  findMetaByCodePoints,
  findMetaByLigatures,
  parseUnicodeRanges,
} from "../glyphs";
import { applySafariFix } from "../safari";

const DEFAULT_FORMATS = Object.values(Format);
const DEFAULT_FONT_SIZE = 1000;

function getByFormat(format: Formats, svgFont: Buffer, ttfBuffer: Buffer): Buffer | null {
  if (format === "svg") {
    return svgFont;
  }
  if (format === "ttf") {
    return ttfBuffer;
  }
  if (format === "woff") {
    return Buffer.from(ttf2woff(new Uint8Array(ttfBuffer)) as unknown as ArrayBuffer);
  }
  if (format === "woff2") {
    return Buffer.from(ttf2woff2(ttfBuffer) as unknown as ArrayBuffer);
  }
  if (format === "eot") {
    return Buffer.from(ttf2eot(new Uint8Array(ttfBuffer)) as unknown as ArrayBuffer);
  }
  return null;
}

function convertByFormats(
  svgFont: Buffer,
  formats: Formats[],
  safariFix?: boolean,
): ExtractedResult {
  const result: ExtractedResult = { meta: [], report: { originalSize: 0, formats: {} } };

  if (formats.some((format) => format !== "svg")) {
    const ttf = svg2ttf(svgFont.toString());
    const ttfBuffer = safariFix ? applySafariFix(Buffer.from(ttf.buffer)) : Buffer.from(ttf.buffer);

    formats.forEach((format) => {
      const byFormat = getByFormat(format, svgFont, ttfBuffer);
      if (byFormat !== null) {
        result[format] = byFormat;
      }
    });
  } else {
    result.svg = svgFont;
  }

  return result;
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
  const foundLigatures = findLigaturesByRaws(content, raws);
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
  const result = convertByFormats(svgFont, formats, option.safariFix);
  result.meta = glyphsMeta;

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
