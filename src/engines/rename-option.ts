import type { Axes } from "../types";
import type { InstanceAxes } from "./hb-subset";

/** The usual style names of the OpenType weight classes. */
export const WEIGHT_NAMES: Readonly<Record<number, string>> = {
  100: "Thin",
  200: "ExtraLight",
  300: "Light",
  400: "Regular",
  500: "Medium",
  600: "SemiBold",
  700: "Bold",
  800: "ExtraBold",
  900: "Black",
};

const CONTROL = /\p{Cc}/u;

const INVALID_RENAME = "rename must be true or an object with family and/or style";

/** The weight the style is named after: a pinned wght axis. */
export const pinnedWeight = (axes: Axes | InstanceAxes | undefined): number | undefined =>
  typeof axes?.wght === "number" ? axes.wght : undefined;

export const PIN_WEIGHT =
  "rename: true takes the style from a pinned wght axis: pin it with axes or set rename.style";

/** Whether wght is pinned at the font's default, which only the font knows. */
const isDefaultWeight = (axes: Axes | undefined): boolean =>
  axes?.wght === "default" || (axes?.wght === undefined && axes?.["*"] === "default");

/** Throws for a weight without a style name. */
export function assertNamedWeight(weight: number): void {
  if (!Object.hasOwn(WEIGHT_NAMES, weight)) {
    throw new Error(`Cannot name weight ${weight}: set rename.style`);
  }
}

function assertNamePart(key: string, value: unknown): void {
  if (value !== undefined && (typeof value !== "string" || !value.trim() || CONTROL.test(value))) {
    throw new Error(`rename.${key} must be a non-empty string without control characters`);
  }
}

/**
 * Throws on a rename of the wrong shape, and on a style it can't name: without rename.style the
 * style comes from the pinned wght axis, which `true` needs, and only the weights 100-900 in
 * steps of 100 have names.
 */
export function assertRenameOption(rename: unknown, axes?: Axes): void {
  if (rename === undefined) {
    return;
  }
  if (rename !== true && (typeof rename !== "object" || rename === null || Array.isArray(rename))) {
    throw new TypeError(INVALID_RENAME);
  }
  const { family, style } = rename === true ? {} : (rename as Record<string, unknown>);
  if (rename !== true && family === undefined && style === undefined) {
    throw new TypeError(INVALID_RENAME);
  }
  assertNamePart("family", family);
  assertNamePart("style", style);
  if (style !== undefined) {
    return;
  }
  const isWeightRange = typeof axes?.wght === "object";
  if (isWeightRange) {
    throw new Error(
      "rename takes the style from a pinned wght axis, and wght is a range: set rename.style",
    );
  }
  // The default weight is checked when the font is renamed
  if (isDefaultWeight(axes)) {
    return;
  }
  const weight = pinnedWeight(axes);
  if (rename === true && weight === undefined) {
    throw new Error(PIN_WEIGHT);
  }
  if (weight !== undefined) {
    assertNamedWeight(weight);
  }
}
