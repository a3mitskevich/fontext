import fs from 'fs'
import { Readable } from 'stream'
import { type Glyph, create } from 'fontkit'
import svg2ttf from 'svg2ttf'
import ttf2woff from 'ttf2woff'
import ttf2woff2 from 'ttf2woff2'
import ttf2eot from 'ttf2eot'
import SVGIcons2SVGFontStream from 'svgicons2svgfont'
import handlebars from 'handlebars'
import path from 'path'
import { type Formats, type ExtractedResult, type GlyphStream, type GlyphMeta, type MinifyOption, Format } from './types'
import { fileURLToPath } from 'url'

const DEFAULT_FORMATS = Object.values(Format)
const WHITESPACE = ' '
const DEFAULT_FONT_SIZE = 1000

function getSvgTemplate (): HandlebarsTemplateDelegate<{
  path: string
  width: number
  height: number
}> {
  const dirname = path.dirname(fileURLToPath(import.meta.url))
  const templatePath = path.resolve(dirname, 'svg.hbs')
  const source = fs.readFileSync(templatePath, 'utf8')
  return handlebars.compile(source)
}

function getByFormat (format: Formats, svgFont: Buffer, ttfBuffer: Buffer): Buffer {
  if (format === 'svg') {
    return svgFont
  }
  if (format === 'ttf') {
    return ttfBuffer
  }
  if (format === 'woff') {
    const ttfArrayBuffer = new Uint8Array(ttfBuffer)
    return Buffer.from(ttf2woff(ttfArrayBuffer))
  }
  if (format === 'woff2') {
    return Buffer.from(ttf2woff2(ttfBuffer))
  }
  if (format === 'eot') {
    const ttfArrayBuffer = new Uint8Array(ttfBuffer)
    return Buffer.from(ttf2eot(ttfArrayBuffer))
  }

  return null
}

function convertByFormats (svgFont: Buffer, formats: Formats[]): ExtractedResult {
  if (formats.some(format => format !== 'svg')) {
    const ttf = svg2ttf(svgFont.toString())
    return formats.reduce<ExtractedResult>((acc, format) => {
      const byFormat = getByFormat(format, svgFont, Buffer.from(ttf.buffer))
      if (byFormat !== null) {
        acc[format] = byFormat
      }
      return acc
    }, { meta: [] })
  }
  return { svg: svgFont, meta: [] }
}

function createGlyphStream (content: string): GlyphStream {
  const stream = new Readable()
  stream.push(content)
  stream.push(null)
  return stream as GlyphStream
}

async function convertToSvgFont (fontName: string, glyphsMeta: GlyphMeta[]): Promise<Buffer> {
  return await new Promise(resolve => {
    let svgFontBuffer = Buffer.alloc(0)
    const stream = new SVGIcons2SVGFontStream({ fontName, normalize: true })
      .on('data', (data) => {
        svgFontBuffer = Buffer.concat([svgFontBuffer, data])
      })
      .on('end', () => {
        resolve(svgFontBuffer)
      })
    glyphsMeta.forEach(meta => {
      const glyphStream = createGlyphStream(meta.svg)
      glyphStream.metadata = {
        name: meta.name,
        unicode: [...meta.unicode, meta.name]
      }
      stream.write(glyphStream)
    })

    stream.end()
  })
}

function codePointsToName (symbols: number[]): string {
  return symbols.map(symbol => String.fromCharCode(symbol)).join('')
}

function getMetrics (glyph: any): { advanceWidth: number, advanceHeight: number } {
  return glyph._metrics
}

function toSvg (glyph: Glyph): string {
  const path = glyph.path.scale(-1, 1).rotate(Math.PI).toSVG()
  const {
    advanceWidth: width = DEFAULT_FONT_SIZE,
    advanceHeight: height = DEFAULT_FONT_SIZE
  } = getMetrics(glyph)

  const template = getSvgTemplate()

  return template({
    path,
    width,
    height
  })
}

export default async function extract (content: Buffer, option: MinifyOption): Promise<ExtractedResult> {
  const { fontName = '', formats = DEFAULT_FORMATS, ligatures = [], withWhitespace = false } = option
  if ((ligatures.length === 0) || (formats.length === 0) || (fontName === '')) {
    throw Error('Illegal option')
  }
  const font = create(content)
  const [whitespaceGlyph] = font.glyphsForString(WHITESPACE)
  const layout = font.layout(ligatures.join(WHITESPACE))
  const glyphs = Array.from<Glyph>(new Set(layout.glyphs))
    .filter(glyph => withWhitespace || glyph.id !== whitespaceGlyph?.id)
  const glyphsMeta = glyphs.map<GlyphMeta>(glyph => ({
    name: codePointsToName(glyph.codePoints),
    unicode: font.stringsForGlyph(glyph.id),
    svg: toSvg(glyph)
  }))

  const svgFont = await convertToSvgFont(fontName, glyphsMeta)
  const result = convertByFormats(svgFont, formats)
  result.meta = glyphsMeta
  return result
}
