import fs from "fs";
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
import handlebars from "handlebars";
import path from "path";
import {
  type ExtractedResult,
  Format,
  type Formats,
  type GlyphMeta,
  type GlyphStream,
  type MinifyOption,
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

let cachedTemplate: HandlebarsTemplateDelegate<{
  path: string;
  width: number;
  height: number;
}> | null = null;

function getSvgTemplate(): HandlebarsTemplateDelegate<{
  path: string;
  width: number;
  height: number;
}> {
  if (!cachedTemplate) {
    const templatePath = path.resolve(__dirname, "svg.hbs");
    const source = fs.readFileSync(templatePath, "utf8");
    cachedTemplate = handlebars.compile(source);
  }
  return cachedTemplate;
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
      { meta: [] },
    );
  }
  return { svg: svgFont, meta: [] };
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
        unicode: [...meta.unicode, meta.name],
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
  const path = glyph.path.scale(-1, 1).rotate(Math.PI).toSVG();
  const width = glyph.advanceWidth ?? DEFAULT_FONT_SIZE;
  const height = glyph.advanceHeight ?? DEFAULT_FONT_SIZE;

  const template = getSvgTemplate();

  return template({
    path,
    width,
    height,
  });
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
    withWhitespace = false,
  } = option;
  if (!fontName) {
    throw new Error("fontName is required");
  }
  if (ligatures.length === 0 && raws.length === 0) {
    throw new Error("At least one of ligatures or raws must be provided");
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

  const foundLigatures = findLigaturesByRaws(content, raws);
  const glyphsMeta = findMetaByLigatures(
    createFont(content),
    [ligatures, foundLigatures].flat(),
    withWhitespace,
  );
  const svgFont = await convertToSvgFont(fontName, glyphsMeta);
  const result = convertByFormats(svgFont, formats);
  result.meta = glyphsMeta;
  return result;
}
