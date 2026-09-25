/**
 * What `e2e/generate.mjs` writes to `generated/manifest.json`: the fonts fontext built for each
 * case and what the browser checks them against. Paths are relative to the page.
 */

/** The id under which the page reports the checks of the `fontext/browser` entry. */
export const BROWSER_ENTRY_CASE = "browser-entry";

export type OutputFormat = "ttf" | "woff" | "woff2" | "eot" | "svg";

/** Formats a browser loads with `FontFace`; EOT is loaded through the TrueType font it wraps. */
export type LoadableFormat = Exclude<OutputFormat, "svg">;

/**
 * Text rendered with the output font and with the source font. The source font is drawn
 * `referenceScale` times larger: the icon engine scales every glyph so its vertical advance fills
 * the em. `referenceText` draws different text with the source font, and `expect: "mismatch"`
 * means the drawings must differ, which shows the comparison can tell glyphs apart.
 */
export interface Sample {
  text: string;
  referenceScale: number;
  referenceText?: string;
  expect: "match" | "mismatch";
  /** The source font kerns the text, so its width must differ from the sum of its characters. */
  kerned?: boolean;
}

/** Vertical metrics in em units every browser should use once `safariFix` is applied. */
export interface Metrics {
  ascent: number;
  descent: number;
  lineGap: number;
}

export interface FontCase {
  id: string;
  title: string;
  engine: "icon" | "subset" | "convert";
  /** The option passed to `extract()`, for display. */
  option: string;
  /** The source font as TTF or OTF, so the browser can render the expected glyphs. */
  reference: string;
  outputs: Partial<Record<OutputFormat, string>>;
  samples: Sample[];
  /** Glyphs of the SVG font: single characters or ligature texts. */
  svgSamples: Sample[];
  metrics?: Metrics;
}

export type CallResult = { value: unknown } | { error: string };

/** A call of the `fontext/browser` entry and what it returns in Node. */
export interface BrowserCall {
  label: string;
  input: string;
  call:
    | { name: "findMetaByLigatures"; ligatures: string[] }
    | { name: "findMetaByCodePoints"; codePoints: number[] }
    | { name: "findLigaturesByRaws"; raws: string[] }
    | { name: "createFont" };
  expected: CallResult;
}

export interface Manifest {
  fontCases: FontCase[];
  browserCalls: BrowserCall[];
}

/** One check of a case in one browser; `detail` explains a failure. */
export interface CheckResult {
  name: string;
  passed: boolean;
  detail: string;
}

export interface CaseResult {
  id: string;
  checks: CheckResult[];
}

/** What the page exposes as `window.fontextE2E` once every requested case has run. */
export interface PageResults {
  done: boolean;
  cases: CaseResult[];
}
