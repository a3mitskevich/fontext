import fs from 'fs'
import { Readable } from 'stream'
import { create, type Font, type Glyph, type GlyphRun, type Lookup } from 'fontkit'
import svg2ttf from 'svg2ttf'
import ttf2woff from 'ttf2woff'
import ttf2woff2 from 'ttf2woff2'
import ttf2eot from 'ttf2eot'
import SVGIcons2SVGFontStream from 'svgicons2svgfont'
import handlebars from 'handlebars'
import path from 'path'
import {
  type ExtractedResult,
  Format,
  type Formats,
  type GlyphMeta,
  type GlyphStream,
  type MinifyOption,
} from './types'

const DEFAULT_FORMATS = Object.values(Format)
const WHITESPACE = ' '
const DEFAULT_FONT_SIZE = 1000

function getSvgTemplate (): HandlebarsTemplateDelegate<{
  path: string
  width: number
  height: number
}> {
  const templatePath = path.resolve(__dirname, 'svg.hbs')
  const source = fs.readFileSync(templatePath, 'utf8')
  return handlebars.compile(source)
}

function getByFormat (format: Formats, svgFont: Buffer, ttfBuffer: Buffer): Buffer | null {
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

const uniq = <T>(array: T[]): T[] => array.filter((candidate, index) => array.indexOf(candidate) === index)

async function convertToSvgFont (fontName: string, glyphsMeta: GlyphMeta[]): Promise<Buffer> {
  return new Promise(resolve => {
    let svgFontBuffer = Buffer.alloc(0)
    const config: SVGIcons2SVGFontStream.SvgIcons2FontOptions = {
      fontName,
      normalize: true,
      fontHeight: DEFAULT_FONT_SIZE,
      log: () => {},
    }
    const stream = new SVGIcons2SVGFontStream(config)
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
        unicode: uniq([...meta.unicode, meta.name]),
      }
      stream.write(glyphStream)
    })

    stream.end()
  })
}

function codePointsToName (symbols: number[]): string {
  return symbols.map(symbol => String.fromCharCode(symbol)).join('')
}

function getMetrics (glyph: Glyph): GlyphRun {
  return glyph._metrics
}

function toSvg (glyph: Glyph): string {
  const path = glyph.path.scale(-1, 1).rotate(Math.PI).toSVG()
  const {
    advanceWidth: width = DEFAULT_FONT_SIZE,
    advanceHeight: height = DEFAULT_FONT_SIZE,
  } = getMetrics(glyph)

  const template = getSvgTemplate()

  return template({
    path,
    width,
    height,
  })
}

const findLigaturesByRaws = (content: Buffer, raws: string[]): string[] => {
  if (!raws.length) {
    return []
  }

  // Need several font instances because find process made layout result incorrect
  const font = create(content)

  const lookupList = font.GSUB?.lookupList.toArray().find((list: Lookup) => list.lookupType === 4)
  if (!lookupList) {
    const message = 'Font no contain GSUB table'
    console.warn(message)
    return raws
  }

  const {
    coverage: { glyphs, rangeRecords },
    ligatureSets,
  } = lookupList.subTables[0]

  const leadingChars: string[] = rangeRecords
    ? rangeRecords.reduce(
      (acc: string[], { start, end }) => {
        const array = Array(end - start + 1)
        return [
          ...acc,
          ...Array.from(
            array,
            (_, position) => position + start).map((item) => font.stringsForGlyph(item)[0],
          ),
        ]
      },
      [],
    )
    : glyphs.map((id) => {
      const result = font.stringsForGlyph(id)
      return result.join('')
    })

  const map = new Map<number, Array<{
    ligature: any
    leading: string
  }>>()

  const ligaturesLists = ligatureSets.toArray()

  for (let index = 0; index < ligaturesLists.length; index++) {
    const currentList = ligaturesLists[index]
    const leading = leadingChars[index]
    for (const ligature of currentList) {
      const id = ligature.glyph
      if (!map.has(id)) {
        map.set(id, [])
      }
      map.get(id)?.push({
        ligature,
        leading,
      })
    }
  }

  return raws.map(raw => {
    const glyph = font.glyphsForString(raw)[0]
    const ligaturesMetas = map.get(glyph.id)
    if (!ligaturesMetas) {
      const message = `Target font not contain a ligature for "${raw}"`
      console.error(message)
      return ''
    }
    return ligaturesMetas.map((meta) => {
      const ligatureBody = meta.ligature.components
        .map((code: number) => font.stringsForGlyph(code)[0])
        .join('') as string
      return meta.leading + ligatureBody
    })
  }).flat()
}

const findMetaByLigatures = (font: Font, ligatures: string[], withWhitespace: boolean): GlyphMeta[] => {
  if (!ligatures.length) {
    return []
  }

  const [whitespaceGlyph] = font.glyphsForString(WHITESPACE)
  const layout = font.layout(ligatures.join(WHITESPACE))
  const glyphs = Array.from<Glyph>(new Set(layout.glyphs))
    .filter(glyph => withWhitespace || glyph.id !== whitespaceGlyph?.id)
  return glyphs.map<GlyphMeta>(glyph => ({
    name: codePointsToName(glyph.codePoints),
    unicode: font.stringsForGlyph(glyph.id),
    svg: toSvg(glyph),
  }))
}

// TODO: potentially may find several ligatures for single raw. Rework in feature
export default async function extract (content: Buffer, option: MinifyOption): Promise<ExtractedResult> {
  const { fontName = '', formats = DEFAULT_FORMATS, ligatures = [], raws = [], withWhitespace = false } = option
  if ((ligatures.length === 0 && raws.length === 0) || (formats.length === 0) || (fontName === '')) {
    throw Error('Illegal option')
  }

  const foundLigatures = findLigaturesByRaws(content, raws)
  const glyphsMeta = findMetaByLigatures(create(content), [ligatures, foundLigatures].flat(), withWhitespace)
  const svgFont = await convertToSvgFont(fontName, glyphsMeta)
  const result = convertByFormats(svgFont, formats)
  result.meta = glyphsMeta
  return result
}
