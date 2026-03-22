import { type ExtractedResult, Format, type MinifyOption } from "./types";
import { extractIcon } from "./engines/icon";
import { extractSubset } from "./engines/subset";

export default async function extract(
  content: Buffer,
  option: MinifyOption,
): Promise<ExtractedResult> {
  const {
    fontName = "",
    formats = Object.values(Format),
    ligatures = [],
    raws = [],
    unicodeRanges = [],
    characters,
    engine = "icon",
  } = option;

  if (!fontName) {
    throw new Error("fontName is required");
  }

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

  if (engine === "subset") {
    return extractSubset(content, option);
  }

  return extractIcon(content, option);
}
