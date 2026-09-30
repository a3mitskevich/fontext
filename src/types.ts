export const Format = {
  TTF: "ttf",
  EOT: "eot",
  WOFF: "woff",
  WOFF2: "woff2",
  SVG: "svg",
} as const;

export type Formats = (typeof Format)[keyof typeof Format];

/** Raw bytes of a TTF, OTF, WOFF or WOFF2 font. */
export type FontInput = Buffer | Uint8Array | ArrayBuffer;

export interface OptimizationReport {
  originalSize: number;
  formats: Partial<Record<Formats, { size: number; saving: number }>>;
}

/**
 * Something of the source font the output could not keep. `legacy-kern`: the font kerns only in
 * the legacy kern table, and part of that kerning was left out.
 */
export interface FontWarning {
  code: "legacy-kern";
  message: string;
}

export type ExtractedResult = Partial<Record<Formats, Buffer>> & {
  meta: GlyphMeta[];
  report: OptimizationReport;
  warnings: FontWarning[];
};

export interface GlyphMeta {
  name: string;
  unicode: string[];
  svg: string;
}

export type Engine = "icon" | "subset" | "convert";

/**
 * Where the font goes. `web`: browsers, WOFF2 by default, CFF desubroutinized. `runtime`:
 * runtimes that load TTF directly and draw the outlines themselves (three.js, troika, Rive), TTF
 * by default, hinting dropped. Both keep HarfBuzz's default layout features and name ids 1, 2, 4
 * and 6. Explicit options override what the target sets.
 */
export type Target = "web" | "runtime";

/** Layout features to keep: every one, HarfBuzz's default set or these tags. */
export type LayoutFeatures = "all" | "default" | string[];

/**
 * Rewrites the final TrueType or OpenType font; its result is encoded into every binary format.
 * It must return an uncompressed font, not WOFF, WOFF2 or a collection.
 */
export type FontTransform = (ttf: Uint8Array) => Uint8Array | Promise<Uint8Array>;

interface BaseOption {
  fontName: string;
  formats?: Formats[];
  safariFix?: boolean;
  silent?: boolean;
  /** Where the font goes: browsers ("web") or runtimes that load TTF directly ("runtime"). */
  target?: Target;
  /** Name ids to keep. */
  nameIds?: number[];
  /** Tables to drop, tags of 1-4 printable ASCII characters; shorter tags are padded with spaces. */
  dropTables?: string[];
  /**
   * Called once with the final TTF (after kerning restore and Safari fix, before encoding); its
   * result is encoded into every binary format, and the subset and convert engines read `meta`
   * from it. Not called when only `svg` is requested.
   */
  transform?: FontTransform;
}

/**
 * Options of the engines that subset a source font. The icon engine builds its font from SVG
 * outlines, with no hinting and one `liga` feature it needs, so it takes neither.
 */
interface SourceLayoutOption {
  /**
   * Keep TrueType hinting: fpgm, prep, cvt, glyph instructions, hdmx and VDMX. HarfBuzz drops
   * LTSH either way.
   */
  hinting?: boolean;
  /** Layout features to keep: every one ("all"), HarfBuzz's default set ("default") or these tags. */
  layoutFeatures?: LayoutFeatures;
}

export interface IconOption extends BaseOption {
  engine?: "icon";
  ligatures?: string[];
  raws?: string[];
  unicodeRanges?: string[];
}

export interface SubsetOption extends BaseOption, SourceLayoutOption {
  engine: "subset";
  characters?: string;
  ligatures?: string[];
  unicodeRanges?: string[];
}

export interface ConvertOption extends BaseOption, SourceLayoutOption {
  engine: "convert";
}

export type MinifyOption = IconOption | SubsetOption | ConvertOption;
