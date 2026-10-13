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

/**
 * The font of one script when the output is split by script. Its font maps the script's code
 * points and every Common and Inherited one of the selection (digits, punctuation, space,
 * combining marks), so it draws text of its script on its own.
 */
export type FontChunk = Partial<Record<Formats, Buffer>> & {
  /**
   * The Unicode Script in lowercase, e.g. "latin", "cyrillic", "old_italic"; "unknown" for code
   * points of no script (private use), "common" when the selection has only Common and
   * Inherited code points.
   */
  script: string;
  /** Every code point the chunk's font maps, ascending. */
  codePoints: number[];
  /**
   * The code points to load this font for, in CSS `unicode-range` syntax
   * ("U+0020-007E,U+00A0"): those of its script, and in the first chunk only (latin if there is
   * one) the Common and Inherited ones too, so a digit doesn't make the browser load every chunk.
   */
  unicodeRange: string;
  meta: GlyphMeta[];
  report: OptimizationReport;
  warnings: FontWarning[];
};

export type ExtractedResult = Partial<Record<Formats, Buffer>> & {
  meta: GlyphMeta[];
  report: OptimizationReport;
  warnings: FontWarning[];
  /** A font per script, only with `split: "scripts"`; the fields above are the unsplit font. */
  chunks?: FontChunk[];
};

export interface GlyphMeta {
  name: string;
  unicode: string[];
  svg: string;
}

export type Engine = "icon" | "subset" | "convert";

/**
 * A named set of optimization options; explicit options override what it sets. `web-font`:
 * fonts the system rasterizes, e.g. in browsers, sent compressed: hinting kept, CFF
 * desubroutinized. `outline-render`: fonts whose outlines the runtime draws itself, as vector
 * paths, SDF or PDF, with HarfBuzz shaping: hinting and gasp dropped, CFF subroutines kept, so the
 * raw font stays small. Both keep HarfBuzz's default layout features and name ids 1, 2, 4 and 6.
 * Neither sets the formats.
 */
export type Preset = "web-font" | "outline-render";

/** Layout features to keep: every one, HarfBuzz's default set or these tags. */
export type LayoutFeatures = "all" | "default" | string[];

/**
 * A setting of a variation axis, in the units of the axis (wght 100-900, wdth in percent): a
 * value pins the axis, `{ min, max }` narrows its range.
 */
export type AxisSetting = number | { min: number; max: number };

/** Variation axis settings by axis tag, e.g. `{ wght: 700, wdth: { min: 75, max: 100 } }`. */
export type Axes = Record<string, AxisSetting>;

/** Languages of the name records to keep: every one or these language ids, e.g. 0x409. */
export type NameLanguages = "all" | number[];

/**
 * How to split the output into several fonts. `scripts`: a font per Unicode script, for CSS
 * `unicode-range` and runtimes that pick a fallback font per missing glyph.
 */
export type Split = "scripts";

/** The chunk a transform gets; the unsplit font comes without a context. */
export interface TransformContext {
  /** The script of the chunk, `FontChunk.script`. */
  readonly script: string;
}

/**
 * Rewrites the final TrueType or OpenType font; its result is encoded into every binary format.
 * It must return an uncompressed font, not WOFF, WOFF2 or a collection. The chunks of a split
 * come with a context naming their script; the unsplit font comes without one.
 */
export type FontTransform = (
  ttf: Uint8Array,
  context?: TransformContext,
) => Uint8Array | Promise<Uint8Array>;

interface BaseOption {
  fontName: string;
  formats?: Formats[];
  safariFix?: boolean;
  silent?: boolean;
  /** A named set of the optimization options, see `Preset`; explicit options override it. */
  preset?: Preset;
  /**
   * Instance a variable font first: a value pins an axis, `{ min, max }` narrows it (not in the
   * icon engine, whose font is static). Unknown axes, values outside the font's range and static
   * fonts are rejected.
   */
  axes?: Axes;
  /** Name ids to keep. */
  nameIds?: number[];
  /**
   * Keep the glyph names, a `post` table of format 2 (PDF text extraction reads them). By default
   * `post` has format 3, without names.
   */
  glyphNames?: boolean;
  /** Tables to drop, tags of 1-4 printable ASCII characters; shorter tags are padded with spaces. */
  dropTables?: string[];
  /**
   * Called once with the final TTF (after kerning restore and Safari fix, before encoding); its
   * result is encoded into every binary format, and the subset and convert engines read `meta`
   * from it. Not called when only `svg` is requested. With `split` it is called once more for each
   * chunk, with the chunk's script in the context.
   */
  transform?: FontTransform;
}

/**
 * Options of the engines that subset a source font. The icon engine builds its font from SVG
 * outlines, with no hinting and one `liga` feature it needs, so it takes neither.
 */
interface SourceLayoutOption {
  /**
   * Keep TrueType hinting: fpgm, prep, cvt, gasp, glyph instructions, hdmx and VDMX. HarfBuzz
   * drops LTSH either way.
   */
  hinting?: boolean;
  /** Layout features to keep: every one ("all"), HarfBuzz's default set ("default") or these tags. */
  layoutFeatures?: LayoutFeatures;
  /**
   * Languages of the name records to keep: every one ("all") or these language ids. By default
   * only English (United States), 0x409.
   */
  nameLanguages?: NameLanguages;
  /**
   * Tables to keep that HarfBuzz or `hinting: false` would drop: gasp, meta and PCLT. Other
   * tables HarfBuzz drops refer to glyph ids it can't renumber; legacy kern is restored anyway.
   */
  keepTables?: string[];
  /**
   * Inline the subroutines of CFF outlines: about 2-8% smaller after WOFF2, WOFF or HTTP
   * compression, up to half again as large as a raw font. TrueType outlines don't change.
   */
  desubroutinize?: boolean;
}

/**
 * Splitting the output of the engines that subset a source font. The icon engine's glyphs are
 * private use code points and ligatures, which have no script, so it takes no split.
 */
interface SplitOption {
  /**
   * Also build a font per Unicode script into `chunks`: `scripts`. Each keeps the selection's
   * Common and Inherited code points and the ligatures of its script.
   */
  split?: Split;
}

export interface IconOption extends BaseOption {
  engine?: "icon";
  ligatures?: string[];
  raws?: string[];
  unicodeRanges?: string[];
}

export interface SubsetOption extends BaseOption, SourceLayoutOption, SplitOption {
  engine: "subset";
  characters?: string;
  ligatures?: string[];
  unicodeRanges?: string[];
}

export interface ConvertOption extends BaseOption, SourceLayoutOption, SplitOption {
  engine: "convert";
}

export type MinifyOption = IconOption | SubsetOption | ConvertOption;
