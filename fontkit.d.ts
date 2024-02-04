import { type GlyphRun } from 'fontkit'

interface Arrayable<T> {
  toArray: () => T[]
}

declare module 'fontkit' {
  export interface Glyph {
    _metrics: GlyphRun
  }

  export interface RangeRecord {
    start: number
    end: number
  }
  export interface SubTable {
    coverage: { glyphs: number[], rangeRecords: RangeRecord[] }
    ligatureSets: Arrayable<Array<{ glyph: number }>>
  }

  export interface Lookup {
    lookupType: number
    subTables: SubTable[]
  }

  export interface Font {
    GSUB: {
      lookupList: Arrayable<Lookup>
    }
  }
}

export {}
