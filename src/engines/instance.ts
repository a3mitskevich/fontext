import type { Axes, Engine } from "../types";
import { openFont, type VariationAxis } from "../font/font";
import { hbSubset } from "./hb-subset";

const PRINTABLE_TAG = /^[\x20-\x7e]{1,4}$/u;
const TAG_LENGTH = 4;

interface AxisRange {
  readonly min: number;
  readonly max: number;
}

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

function isAxisSetting(setting: unknown): boolean {
  if (typeof setting !== "object" || setting === null) {
    return isFiniteNumber(setting);
  }
  const { min, max } = setting as Partial<Record<string, unknown>>;
  return isFiniteNumber(min) && isFiniteNumber(max) && min <= max;
}

const describeValue = (value: unknown): string =>
  typeof value === "number" ? String(value) : JSON.stringify(value);

/** The setting as the command line writes it: "700" or "600:700". */
const describeSetting = (setting: number | AxisRange): string =>
  typeof setting === "number" ? String(setting) : `${setting.min}:${setting.max}`;

/**
 * Throws on axes of the wrong shape, and on a range in the icon engine, whose font is static.
 * Whether the font has the axes is checked when it is instanced.
 */
export function assertAxesOption(axes: unknown, engine: Engine): void {
  if (axes === undefined) {
    return;
  }
  if (typeof axes !== "object" || axes === null || Array.isArray(axes)) {
    throw new TypeError("axes must be an object mapping axis tags to a value or { min, max }");
  }
  const entries = Object.entries(axes);
  const invalidTags = entries.map(([tag]) => tag).filter((tag) => !PRINTABLE_TAG.test(tag));
  if (invalidTags.length > 0) {
    throw new Error(
      `Invalid tag(s) in axes: ${invalidTags.map((tag) => JSON.stringify(tag)).join(", ")}. A tag is 1 to 4 printable ASCII characters`,
    );
  }
  const invalid = entries.find(([, setting]) => !isAxisSetting(setting));
  if (invalid) {
    throw new Error(
      `Invalid value for axis "${invalid[0]}": ${describeValue(invalid[1])}. Use a finite number or { min, max } with min <= max`,
    );
  }
  const range = entries.find(([, setting]) => typeof setting === "object");
  if (engine === "icon" && range) {
    throw new Error(`The icon engine builds a static font: pin axis "${range[0]}" to one value`);
  }
}

// HarfBuzz reports the Fixed values of fvar as float32, e.g. 0.3 as 0.30000001192
const FLOAT32_DIGITS = 7;
const axisValue = (value: number): number => Number(value.toPrecision(FLOAT32_DIGITS));

const describeAxis = ({ tag, min, max }: VariationAxis): string =>
  `${tag.trim()} ${axisValue(min)}-${axisValue(max)}`;

/**
 * Throws unless the font has every axis and each setting lies within its axis. HarfBuzz would
 * clamp a value outside the axis silently, e.g. give Bold for Black.
 */
function assertFontAxes(fontAxes: readonly VariationAxis[], axes: Axes): void {
  if (fontAxes.length === 0) {
    throw new Error("axes is set, but the font has no variation axes");
  }
  for (const [tag, setting] of Object.entries(axes)) {
    const axis = fontAxes.find((fontAxis) => fontAxis.tag === tag.padEnd(TAG_LENGTH, " "));
    if (!axis) {
      throw new Error(
        `Unknown axis "${tag}". The font has: ${fontAxes.map((fontAxis) => describeAxis(fontAxis)).join(", ")}`,
      );
    }
    const { min, max } = typeof setting === "number" ? { min: setting, max: setting } : setting;
    // Compared at the precision HarfBuzz reports the axis in
    if (Math.fround(min) < axis.min || Math.fround(max) > axis.max) {
      throw new Error(
        `Axis "${tag}" ${typeof setting === "number" ? "value" : "range"} ${describeSetting(setting)} is outside the font's range ${axisValue(axis.min)}-${axisValue(axis.max)}`,
      );
    }
  }
}

/**
 * The font with its axes pinned or narrowed, every glyph, table and name kept, so the engines
 * read it like the source: outlines, metrics, shaping and legacy kerning at the location.
 */
export async function instanceFont(sfnt: Uint8Array, axes: Axes): Promise<Uint8Array> {
  const font = await openFont(sfnt);
  assertFontAxes(font.axes, axes);
  return hbSubset(sfnt, { keepEverything: true, axes });
}
