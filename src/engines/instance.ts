import type { Axes, Engine, FontWarning } from "../types";
import type { VariationAxis } from "../font/font";
import { type AxisLocation, hbSubset, type InstanceAxes } from "./hb-subset";

const PRINTABLE_TAG = /^[\x20-\x7e]{1,4}$/u;
const TAG_LENGTH = 4;
/** The key of `axes` that pins every axis it doesn't name. */
export const ALL_AXES = "*";
const DEFAULT = "default";

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

function isAxisSetting(setting: unknown): boolean {
  if (typeof setting !== "object" || setting === null) {
    return isFiniteNumber(setting) || setting === DEFAULT;
  }
  const { min, max } = setting as Partial<Record<string, unknown>>;
  return isFiniteNumber(min) && isFiniteNumber(max) && min <= max;
}

const describeValue = (value: unknown): string =>
  typeof value === "number" ? String(value) : JSON.stringify(value);

/** The setting as the command line writes it: "700" or "600:700". */
const describeSetting = (setting: AxisLocation): string =>
  typeof setting === "number" ? String(setting) : `${setting.min}:${setting.max}`;

const paddedTag = (tag: string): string => tag.padEnd(TAG_LENGTH, " ");

/**
 * Throws on axes of the wrong shape, and on a range in the icon engine, whose font is static.
 * Whether the font has the axes is checked when it is instanced.
 */
export function assertAxesOption(axes: unknown, engine: Engine): void {
  if (axes === undefined) {
    return;
  }
  if (typeof axes !== "object" || axes === null || Array.isArray(axes)) {
    throw new TypeError(
      'axes must be an object mapping axis tags to a value, "default" or { min, max }',
    );
  }
  const entries = Object.entries(axes);
  const invalidTags = entries.map(([tag]) => tag).filter((tag) => !PRINTABLE_TAG.test(tag));
  if (invalidTags.length > 0) {
    throw new Error(
      `Invalid tag(s) in axes: ${invalidTags.map((tag) => JSON.stringify(tag)).join(", ")}. A tag is 1 to 4 printable ASCII characters`,
    );
  }
  const all = (axes as Record<string, unknown>)[ALL_AXES];
  if (all !== undefined && all !== DEFAULT) {
    throw new Error(
      `Invalid value for axes["*"]: ${describeValue(all)}. "*": "default" pins every axis not named at its default`,
    );
  }
  const invalid = entries.find(([, setting]) => !isAxisSetting(setting));
  if (invalid) {
    throw new Error(
      `Invalid value for axis "${invalid[0]}": ${describeValue(invalid[1])}. Use a finite number, "default" or { min, max } with min <= max`,
    );
  }
  const range = entries.find(([, setting]) => typeof setting === "object");
  if (engine === "icon" && range) {
    throw new Error(`The icon engine builds a static font: pin axis "${range[0]}" to one value`);
  }
}

// HarfBuzz reports the Fixed values of fvar as float32, e.g. 0.3 as 0.30000001192
const FLOAT32_DIGITS = 7;
export const axisValue = (value: number): number => Number(value.toPrecision(FLOAT32_DIGITS));

const describeAxis = ({ tag, min, max }: VariationAxis): string =>
  `${tag.trim()} ${axisValue(min)}-${axisValue(max)}`;

/** The axis of the font with the tag; throws for an axis the font lacks. */
function fontAxis(fontAxes: readonly VariationAxis[], tag: string): VariationAxis {
  const axis = fontAxes.find((candidate) => candidate.tag === paddedTag(tag));
  if (!axis) {
    throw new Error(
      `Unknown axis "${tag}". The font has: ${fontAxes.map((candidate) => describeAxis(candidate)).join(", ")}`,
    );
  }
  return axis;
}

/**
 * Throws unless the setting lies within its axis. HarfBuzz would clamp a value outside the axis
 * silently, e.g. give Bold for Black.
 */
function assertWithinAxis(axis: VariationAxis, tag: string, setting: AxisLocation): void {
  const { min, max } = typeof setting === "number" ? { min: setting, max: setting } : setting;
  // Compared at the precision HarfBuzz reports the axis in
  if (Math.fround(min) < axis.min || Math.fround(max) > axis.max) {
    throw new Error(
      `Axis "${tag}" ${typeof setting === "number" ? "value" : "range"} ${describeSetting(setting)} is outside the font's range ${axisValue(axis.min)}-${axisValue(axis.max)}`,
    );
  }
}

/**
 * The settings to instance the font at: "default" becomes the default of the axis, and `"*"` adds
 * every axis the settings don't name at its default. Throws for a static font, an axis the font
 * lacks and a value outside its axis.
 */
export function resolveAxes(fontAxes: readonly VariationAxis[], axes: Axes): InstanceAxes {
  if (fontAxes.length === 0) {
    throw new Error("axes is set, but the font has no variation axes");
  }
  const named = Object.entries(axes)
    .filter(([tag]) => tag !== ALL_AXES)
    .map(([tag, setting]): [string, AxisLocation] => {
      const axis = fontAxis(fontAxes, tag);
      const location = setting === DEFAULT ? axis.default : setting;
      assertWithinAxis(axis, tag, location);
      return [tag, location];
    });
  const namedTags = new Set(named.map(([tag]) => paddedTag(tag)));
  const rest =
    axes[ALL_AXES] === DEFAULT
      ? fontAxes
          .filter(({ tag }) => !namedTags.has(tag))
          .map(({ tag, default: defaultValue }): [string, AxisLocation] => [
            tag.trimEnd(),
            defaultValue,
          ])
      : [];
  return Object.fromEntries([...named, ...rest]);
}

/**
 * The font with its axes pinned or narrowed, every glyph, table and name kept, so the engines
 * read it like the source: outlines, metrics, shaping and legacy kerning at the location.
 */
export function instanceFont(sfnt: Uint8Array, axes: InstanceAxes): Promise<Uint8Array> {
  return hbSubset(sfnt, { keepEverything: true, axes });
}

/**
 * The warning that the output stays variable along axes the settings leave out although they pin
 * every axis they name; a range keeps the font variable on purpose, so it gives none.
 */
export function unpinnedAxesWarning(
  fontAxes: readonly VariationAxis[],
  axes: Axes | undefined,
): FontWarning | undefined {
  const settings = Object.values(axes ?? {});
  if (settings.length === 0 || settings.some((setting) => typeof setting === "object")) {
    return undefined;
  }
  const named = new Set(Object.keys(axes ?? {}).map((tag) => paddedTag(tag)));
  const unpinned = axes?.[ALL_AXES] ? [] : fontAxes.filter(({ tag }) => !named.has(tag));
  if (unpinned.length === 0) {
    return undefined;
  }
  return {
    code: "unpinned-axes",
    message: `The output stays variable along ${unpinned.map((axis) => describeAxis(axis)).join(", ")}, which axes leaves out: pin them, or add "*": "default" to pin them at their default`,
  };
}
