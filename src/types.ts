import type { Readable } from "stream";

export const Format = {
  TTF: "ttf",
  EOT: "eot",
  WOFF: "woff",
  WOFF2: "woff2",
  SVG: "svg",
} as const;

export type Formats = (typeof Format)[keyof typeof Format];

export interface OptimizationReport {
  originalSize: number;
  formats: Partial<Record<Formats, { size: number; saving: number }>>;
}

export type ExtractedResult = Partial<Record<Formats, Buffer>> & {
  meta: GlyphMeta[];
  report: OptimizationReport;
};

export interface GlyphMeta {
  name: string;
  unicode: string[];
  svg: string;
}

export interface GlyphStream extends Readable {
  metadata: {
    name: string;
    unicode: string[];
  };
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
  withWhitespace?: boolean;
}

export interface SubsetOption extends BaseOption {
  engine: "subset";
  characters?: string;
  ligatures?: string[];
  unicodeRanges?: string[];
  withWhitespace?: boolean;
}

export interface ConvertOption extends BaseOption {
  engine: "convert";
}

export type MinifyOption = IconOption | SubsetOption | ConvertOption;
