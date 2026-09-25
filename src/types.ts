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

interface BaseOption {
  fontName: string;
  formats?: Formats[];
  safariFix?: boolean;
  silent?: boolean;
}

export interface IconOption extends BaseOption {
  engine?: "icon";
  ligatures?: string[];
  raws?: string[];
  unicodeRanges?: string[];
}

export interface SubsetOption extends BaseOption {
  engine: "subset";
  characters?: string;
  ligatures?: string[];
  unicodeRanges?: string[];
}

export interface ConvertOption extends BaseOption {
  engine: "convert";
}

export type MinifyOption = IconOption | SubsetOption | ConvertOption;
