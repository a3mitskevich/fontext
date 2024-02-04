import type { Readable } from 'stream'

export const Format = {
  TTF: 'ttf',
  EOT: 'eot',
  WOFF: 'woff',
  WOFF2: 'woff2',
  SVG: 'svg',
} as const

export type Formats = typeof Format[keyof typeof Format]

export type ExtractedResult = { [key in Formats]?: Buffer } & { meta: GlyphMeta[] }

export interface GlyphMeta {
  name: string
  unicode: string[]
  svg: string
}

export interface GlyphStream extends Readable {
  metadata: {
    name: string
    unicode: string[]
  }
}

export interface MinifyOption {
  fontName: string
  ligatures?: string[]
  raws?: string[]
  formats?: Formats[]
  withWhitespace?: boolean
  // TODO: add in future
  // unicodeOnly: boolean
}
