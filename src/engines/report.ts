import type { Formats, OptimizationReport, TableSizes, TablesReport } from "../types";
import { tableDirectory } from "../font/sfnt";
import type { FontBuffers } from "./shared";
import type { SourceFont } from "./source";

/**
 * The tables of an uncompressed font and the lengths their records declare, in directory order,
 * by tag without trailing spaces ("cvt", "CFF"), the form dropTables and keepTables take.
 */
export const tableSizes = (sfnt: Uint8Array): TableSizes =>
  Object.fromEntries(tableDirectory(sfnt).map(({ tag, length }) => [tag.trimEnd(), length]));

function tablesReport(input: TableSizes, ttf: Uint8Array): TablesReport {
  const output = tableSizes(ttf);
  const dropped = Object.keys(input)
    .filter((tag) => !Object.hasOwn(output, tag))
    .toSorted();
  return { input, output, dropped };
}

/**
 * The size of every format against the input, and the tables of the input and of the TTF the
 * binary formats were encoded from; no tables when only SVG was built.
 */
export function buildReport(
  source: SourceFont,
  fonts: FontBuffers,
  formats: readonly Formats[],
  ttf: Uint8Array | undefined,
): OptimizationReport {
  const originalSize = source.input.length;
  const entries = formats.flatMap((format) => {
    const buffer = fonts[format];
    if (!buffer) {
      return [];
    }
    const saving = originalSize > 0 ? ((originalSize - buffer.length) / originalSize) * 100 : 0;
    return [[format, { size: buffer.length, saving: Math.round(saving * 10) / 10 }] as const];
  });
  const report = { originalSize, formats: Object.fromEntries(entries) };
  return ttf ? { ...report, tables: tablesReport(source.inputTables, ttf) } : report;
}
