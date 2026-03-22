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

export type Engine = "icon" | "subset";

export interface MinifyOption {
  fontName: string;
  ligatures?: string[];
  raws?: string[];
  unicodeRanges?: string[];
  characters?: string;
  formats?: Formats[];
  withWhitespace?: boolean;
  engine?: Engine;
}
