import { types } from "util";
import { type ExtractedResult, type FontInput, Format, type MinifyOption } from "./types";
import { extractIcon } from "./engines/icon";
import { extractSubset } from "./engines/subset";
import { extractConvert } from "./engines/convert";

function toBuffer(input: FontInput): Buffer {
  if (Buffer.isBuffer(input)) {
    return input;
  }
  if (ArrayBuffer.isView(input)) {
    return Buffer.from(input.buffer, input.byteOffset, input.byteLength);
  }
  if (types.isAnyArrayBuffer(input)) {
    return Buffer.from(input);
  }
  throw new TypeError("Font input must be a Buffer, Uint8Array or ArrayBuffer");
}

// Removed in 2.0.0; untyped callers and config files would otherwise lose the space silently
export const WITH_WHITESPACE_REMOVED =
  'withWhitespace was removed: add " " to characters to keep the space (subset engine), the icon engine never extracts it';

export default function extract(input: FontInput, option: MinifyOption): Promise<ExtractedResult> {
  const content = toBuffer(input);
  const { fontName = "" } = option;
  const engine = option.engine ?? "icon";
  const formats = option.formats ?? Object.values(Format);

  if (!fontName) {
    throw new Error("fontName is required");
  }

  if ("withWhitespace" in option) {
    throw new Error(WITH_WHITESPACE_REMOVED);
  }

  if (engine !== "convert") {
    const ligatures = "ligatures" in option ? (option.ligatures ?? []) : [];
    const raws = "raws" in option ? (option.raws ?? []) : [];
    const unicodeRanges = "unicodeRanges" in option ? (option.unicodeRanges ?? []) : [];
    const characters = "characters" in option ? option.characters : undefined;

    const hasGlyphSelection =
      ligatures.length > 0 ||
      raws.length > 0 ||
      unicodeRanges.length > 0 ||
      (characters !== undefined && characters.length > 0);

    if (!hasGlyphSelection) {
      throw new Error(
        "At least one of ligatures, raws, unicodeRanges, or characters must be provided",
      );
    }
  }

  if (formats.length === 0) {
    throw new Error("At least one output format must be specified");
  }

  const validFormats = new Set(Object.values(Format));
  const invalidFormats = formats.filter((f) => !validFormats.has(f));
  if (invalidFormats.length > 0) {
    throw new Error(
      `Invalid format(s): ${invalidFormats.join(", ")}. Valid formats: ${[...validFormats].join(", ")}`,
    );
  }

  if (engine === "convert") {
    return extractConvert(content, option as MinifyOption & { engine: "convert" });
  }

  if (engine === "subset") {
    return extractSubset(content, option as MinifyOption & { engine: "subset" });
  }

  return extractIcon(content, option as MinifyOption & { engine?: "icon" });
}
