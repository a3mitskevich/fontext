import type { FontWarning } from "../types";

/** How many code points the message names before it only counts the rest. */
const LISTED = 20;
const HEX_DIGITS = 4;
// Control, format, separator and unassigned characters are named by their code point only
const UNPRINTABLE = /^[\p{Cc}\p{Cf}\p{Z}\p{Cn}\p{Cs}]$/u;
// Joiners and variation selectors: shaping hides them, so fonts rarely map them and needn't
const DEFAULT_IGNORABLE = /^\p{Default_Ignorable_Code_Point}$/u;

function describeCodePoint(codePoint: number): string {
  const code = `U+${codePoint.toString(16).toUpperCase().padStart(HEX_DIGITS, "0")}`;
  const char = String.fromCodePoint(codePoint);
  return UNPRINTABLE.test(char) ? code : `${code} ${JSON.stringify(char)}`;
}

/**
 * The warning about characters of the selection the font has no glyph for, which the subset
 * can't keep; undefined when the font maps them all. Default ignorable code points (ZWJ, variation
 * selectors) are left out; control characters such as a line feed are not.
 */
export function missingCharactersWarning(missing: readonly number[]): FontWarning | undefined {
  const codePoints = missing.filter(
    (codePoint) => !DEFAULT_IGNORABLE.test(String.fromCodePoint(codePoint)),
  );
  if (codePoints.length === 0) {
    return undefined;
  }
  const listed = codePoints.slice(0, LISTED).map((codePoint) => describeCodePoint(codePoint));
  const rest = codePoints.length - LISTED;
  const characters = codePoints.length === 1 ? "character" : "characters";
  return {
    code: "missing-characters",
    message: `The font does not map ${codePoints.length} ${characters} of the selection: ${listed.join(", ")}${rest > 0 ? ` and ${rest} more` : ""}`,
  };
}
