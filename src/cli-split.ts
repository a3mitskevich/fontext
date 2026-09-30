import path from "path";
import {
  type ExtractedResult,
  Format,
  type FontWarning,
  type Formats,
  type OptimizationReport,
  type Split,
} from "./types";

const FORMATS = Object.values(Format);

/** A font file the command writes, or would write with --dry-run. */
export interface OutputFile {
  readonly path: string;
  readonly format: Formats;
  readonly size: number;
  readonly saving: number;
  readonly buffer: Buffer;
}

/** The fonts of one output, the whole font or a chunk, with their report. */
type EncodedFont = Partial<Record<Formats, Buffer>> & { readonly report: OptimizationReport };

/** A file per format of the font, named `<fileName>.<format>`. */
export function outputFiles(font: EncodedFont, outputDir: string, fileName: string): OutputFile[] {
  return FORMATS.flatMap((format) => {
    const buffer = font[format];
    if (!buffer) {
      return [];
    }
    const saving = font.report.formats[format]?.saving ?? 0;
    const filePath = path.join(outputDir, `${fileName}.${format}`);
    return [{ path: filePath, format, size: buffer.length, saving, buffer }];
  });
}

/** A chunk of a split and its files. */
export interface ChunkOutput {
  readonly script: string;
  readonly unicodeRange: string;
  readonly codePoints: number;
  readonly glyphs: number;
  readonly files: OutputFile[];
  readonly warnings: FontWarning[];
}

/** The chunks of the result, their files named `<fontName>.<script>.<format>`. */
export function chunkOutputs(
  result: ExtractedResult,
  outputDir: string,
  fontName: string,
): ChunkOutput[] {
  return (result.chunks ?? []).map((chunk) => ({
    script: chunk.script,
    unicodeRange: chunk.unicodeRange,
    codePoints: chunk.codePoints.length,
    glyphs: chunk.meta.length,
    files: outputFiles(chunk, outputDir, `${fontName}.${chunk.script}`),
    warnings: chunk.warnings,
  }));
}

/** A file as --json lists it. */
export const fileSummary = ({ path: filePath, format, size, saving }: OutputFile) => ({
  path: filePath,
  format,
  size,
  saving,
});

/** A chunk as --json lists it: its script, unicode-range, counts, files and warnings. */
export const chunkSummary = ({ files, ...chunk }: ChunkOutput) => ({
  ...chunk,
  files: files.map((file) => fileSummary(file)),
});

/**
 * The split of a config entry, --split over the "split" key in single mode. An invalid value
 * reaches extract(), which rejects it with the valid ones.
 */
export function resolveSplit(
  entry: string | undefined,
  flag: string | undefined,
  useFlag: boolean,
): Split | undefined {
  return ((useFlag ? flag : undefined) ?? entry) as Split | undefined;
}
