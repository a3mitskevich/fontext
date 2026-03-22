import { Readable } from "stream";
import {
  create,
  type Font,
  type FontCollection,
  type Glyph,
  type Ligature,
  type Lookup,
} from "fontkit";
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
  type MinifyOption,
  type OptimizationReport,
} from "./types";

const DEFAULT_FORMATS = Object.values(Format);
const WHITESPACE = " ";
const DEFAULT_FONT_SIZE = 1000;

function createFont(content: Buffer): Font {
  const font = create(content);
  if ("fonts" in font) {
    throw new Error("Font collections (TTC/DFONT) are not supported. Provide a single font file.");
  }
  return font;
}

function renderSvg(svgPath: string, width: number, height: number): string {
  return `<svg viewBox="0 -${height} ${width} ${height}" xmlns="http://www.w3.org/2000/svg">\n  <path d="${svgPath}" />\n</svg>`;
}

function getByFormat(format: Formats, svgFont: Buffer, ttfBuffer: Buffer): Buffer | null {
  if (format === "svg") {
    return svgFont;
  }
  if (format === "ttf") {
    return ttfBuffer;
  }
  if (format === "woff") {
    const ttfArrayBuffer = new Uint8Array(ttfBuffer);
    return Buffer.from(ttf2woff(ttfArrayBuffer) as unknown as ArrayBuffer);
  }
  if (format === "woff2") {
    return Buffer.from(ttf2woff2(ttfBuffer) as unknown as ArrayBuffer);
  }
  if (format === "eot") {
    const ttfArrayBuffer = new Uint8Array(ttfBuffer);
    return Buffer.from(ttf2eot(ttfArrayBuffer) as unknown as ArrayBuffer);
  }
  return null;
}

function convertByFormats(svgFont: Buffer, formats: Formats[]): ExtractedResult {
  if (formats.some((format) => format !== "svg")) {
    const ttf = svg2ttf(svgFont.toString());
    return formats.reduce<ExtractedResult>(
      (acc, format) => {
        const byFormat = getByFormat(format, svgFont, Buffer.from(ttf.buffer));
        if (byFormat !== null) {
          acc[format] = byFormat;
        }
        return acc;
      },
      { meta: [], report: { originalSize: 0, formats: {} } },
    );
  }
  return { svg: svgFont, meta: [], report: { originalSize: 0, formats: {} } };
}

function createGlyphStream(content: string): GlyphStream {
  const stream = new Readable();
  stream.push(content);
  stream.push(null);
  return stream as GlyphStream;
}

async function convertToSvgFont(fontName: string, glyphsMeta: GlyphMeta[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    let svgFontBuffer = Buffer.alloc(0);
    const config: Partial<SVGIcons2SVGFontStreamOptions> = {
      fontName,
      normalize: true,
      fontHeight: DEFAULT_FONT_SIZE,
    };
    const stream = new SVGIcons2SVGFontStream(config)
      .on("data", (data: Buffer | string) => {
        const chunk = typeof data === "string" ? Buffer.from(data) : data;
        svgFontBuffer = Buffer.concat([svgFontBuffer, chunk]);
      })
      .on("end", () => {
        resolve(svgFontBuffer);
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

function codePointsToName(symbols: number[]): string {
  return symbols.map((symbol) => String.fromCharCode(symbol)).join("");
}

function toSvg(glyph: Glyph): string {
  const svgPath = glyph.path.scale(-1, 1).rotate(Math.PI).toSVG();
  const width = glyph.advanceWidth ?? DEFAULT_FONT_SIZE;
  const height = glyph.advanceHeight ?? DEFAULT_FONT_SIZE;
  return renderSvg(svgPath, width, height);
}

const findLigaturesByRaws = (content: Buffer, raws: string[]): string[] => {
  if (!raws.length) {
    return [];
  }

  // Need several font instances because find process made layout result incorrect
  const font = createFont(content);

  const lookupList = font.GSUB?.lookupList.toArray().find((list: Lookup) => list.lookupType === 4);
  if (!lookupList) {
    throw new Error("Font does not contain a GSUB ligature lookup table");
  }

  const {
    coverage: { glyphs, rangeRecords },
    ligatureSets,
  } = lookupList.subTables[0];

  const leadingChars: string[] = rangeRecords
    ? rangeRecords.reduce((acc: string[], { start, end }) => {
        const array = Array(end - start + 1);
        return [
          ...acc,
          ...Array.from(array, (_, position) => position + start).map(
            (item) => font.stringsForGlyph(item)[0],
          ),
        ];
      }, [])
    : glyphs.map((id) => {
        const result = font.stringsForGlyph(id);
        return result.join("");
      });

  const map = new Map<
    number,
    Array<{
      ligature: Ligature;
      leading: string;
    }>
  >();

  const ligaturesLists = ligatureSets.toArray();

  for (let index = 0; index < ligaturesLists.length; index++) {
    const currentList = ligaturesLists[index];
    const leading = leadingChars[index];
    for (const ligature of currentList) {
      const id = ligature.glyph;
      if (!map.has(id)) {
        map.set(id, []);
      }
      map.get(id)?.push({
        ligature,
        leading,
      });
    }
  }

  return raws
    .map((raw) => {
      const glyph = font.glyphsForString(raw)[0];
      const ligaturesMetas = map.get(glyph.id);
      if (!ligaturesMetas) {
        throw new Error(`Font does not contain a ligature for "${raw}"`);
      }
      return ligaturesMetas.map((meta) => {
        const ligatureBody = meta.ligature.components
          .map((code) => font.stringsForGlyph(code)[0])
          .join("");
        return meta.leading + ligatureBody;
      });
    })
    .flat();
};

function parseUnicodeRanges(ranges: string[]): number[] {
  const codePoints: number[] = [];
  for (const range of ranges) {
    const match = range.match(/^U\+([0-9A-Fa-f]+)(?:-U?\+?([0-9A-Fa-f]+))?$/);
    if (!match) {
      throw new Error(
        `Invalid unicode range: "${range}". Expected format: U+XXXX or U+XXXX-U+XXXX`,
      );
    }
    const start = parseInt(match[1], 16);
    const end = match[2] ? parseInt(match[2], 16) : start;
    if (end < start) {
      throw new Error(`Invalid unicode range: "${range}". End must be >= start`);
    }
    for (let cp = start; cp <= end; cp++) {
      codePoints.push(cp);
    }
  }
  return codePoints;
}

const findMetaByCodePoints = (font: Font, codePoints: number[]): GlyphMeta[] => {
  const glyphs: Glyph[] = [];
  for (const cp of codePoints) {
    const glyph = font.glyphForCodePoint(cp);
    if (glyph && glyph.id !== 0) {
      glyphs.push(glyph);
    }
  }
  const unique = Array.from(new Map(glyphs.map((g) => [g.id, g])).values());
  return unique.map<GlyphMeta>((glyph) => ({
    name: codePointsToName(glyph.codePoints),
    unicode: font.stringsForGlyph(glyph.id),
    svg: toSvg(glyph),
  }));
};

const findMetaByLigatures = (
  font: Font,
  ligatures: string[],
  withWhitespace: boolean,
): GlyphMeta[] => {
  if (!ligatures.length) {
    return [];
  }

  const [whitespaceGlyph] = font.glyphsForString(WHITESPACE);
  const layout = font.layout(ligatures.join(WHITESPACE));
  const glyphs = Array.from<Glyph>(new Set(layout.glyphs)).filter(
    (glyph) => withWhitespace || glyph.id !== whitespaceGlyph?.id,
  );
  return glyphs.map<GlyphMeta>((glyph) => ({
    name: codePointsToName(glyph.codePoints),
    unicode: font.stringsForGlyph(glyph.id),
    svg: toSvg(glyph),
  }));
};

// TODO: potentially may find several ligatures for single raw. Rework in feature
export default async function extract(
  content: Buffer,
  option: MinifyOption,
): Promise<ExtractedResult> {
  const {
    fontName = "",
    formats = DEFAULT_FORMATS,
    ligatures = [],
    raws = [],
    unicodeRanges = [],
    withWhitespace = false,
  } = option;
  if (!fontName) {
    throw new Error("fontName is required");
  }
  if (ligatures.length === 0 && raws.length === 0 && unicodeRanges.length === 0) {
    throw new Error("At least one of ligatures, raws, or unicodeRanges must be provided");
  }
  if (formats.length === 0) {
    throw new Error("At least one output format must be specified");
  }
  const validFormats = new Set(Object.values(Format));
  const invalidFormats = formats.filter((f) => !validFormats.has(f));
  if (invalidFormats.length > 0) {
    throw new Error(
      `Invalid format(s): ${invalidFormats.join(", ")}. Valid formats: ${[...validFormats].join(", ")}`,
    );
  }

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
  const result = convertByFormats(svgFont, formats);
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
