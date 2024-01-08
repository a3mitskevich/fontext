import { type GlyphRun } from 'fontkit'


declare module 'fontkit' {
  export interface Glyph {
    _metrics: GlyphRun
  }
}

export {}
