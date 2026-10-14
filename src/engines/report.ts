import type { AxesReport, Formats, OptimizationReport, TableSizes, TablesReport } from "../types";
import type { VariationAxis } from "../font/font";
import { tableDirectory } from "../font/sfnt";
import { axisValue } from "./instance";
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

/** The TTF the binary formats were encoded from, and the variation axes it still has. */
export interface OutputFont {
  readonly ttf: Uint8Array;
  readonly axes: readonly VariationAxis[];
}

/**
 * The axes of a variable input in the output: those it lacks are pinned, at their setting or,
 * when the engine builds a static font from the default instance, at their default.
 */
function axesReport(source: SourceFont, outputAxes: readonly VariationAxis[]): AxesReport {
  const settings = new Map(
    Object.entries(source.axes).map(([tag, setting]) => [tag.padEnd(4, " "), setting]),
  );
  const variable = new Set(outputAxes.map(({ tag }) => tag));
  const pinned = source.inputAxes
    .filter(({ tag }) => !variable.has(tag))
    .map(({ tag, default: defaultValue }) => {
      const setting = settings.get(tag);
      return [tag.trimEnd(), axisValue(typeof setting === "number" ? setting : defaultValue)];
    });
  return {
    pinned: Object.fromEntries(pinned),
    variable: outputAxes.map(({ tag, min, default: defaultValue, max }) => ({
      tag: tag.trimEnd(),
      min: axisValue(min),
      default: axisValue(defaultValue),
      max: axisValue(max),
    })),
  };
}

/**
 * The size of every format against the input, and the tables of the input and of the TTF the
 * binary formats were encoded from, and for a variable input its axes; neither when only SVG was
 * built.
 */
export function buildReport(
  source: SourceFont,
  fonts: FontBuffers,
  formats: readonly Formats[],
  output: OutputFont | undefined,
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
  if (!output) {
    return report;
  }
  const tables = tablesReport(source.inputTables, output.ttf);
  return source.inputAxes.length > 0
    ? { ...report, tables, axes: axesReport(source, output.axes) }
    : { ...report, tables };
}
