interface Arrayable<T> {
  toArray: () => T[];
}

declare module "fontkit" {
  export interface Glyph {
    advanceHeight: number;
  }

  export interface RangeRecord {
    start: number;
    end: number;
  }
  export interface Ligature {
    glyph: number;
    compCount: number;
    components: number[];
  }

  export interface SubTable {
    coverage: { glyphs: number[]; rangeRecords: RangeRecord[] };
    ligatureSets: Arrayable<Ligature[]>;
    /** Set on extension (lookupType 7) subtables: the wrapped lookup type and subtable */
    lookupType?: number;
    extension?: SubTable;
  }

  export interface Lookup {
    lookupType: number;
    subTables: SubTable[];
  }

  export interface Font {
    GSUB: {
      lookupList: Arrayable<Lookup>;
    };
  }
}

export {};
