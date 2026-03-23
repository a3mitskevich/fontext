import { type ExtractedResult, Format, type MinifyOption } from "./types";
import { extractIcon } from "./engines/icon";
import { extractSubset } from "./engines/subset";
import { extractConvert } from "./engines/convert";

export default async function extract(
  content: Buffer,
  option: MinifyOption,
): Promise<ExtractedResult> {
  const { fontName = "" } = option;
  const engine = option.engine ?? "icon";
  const formats = option.formats ?? Object.values(Format);

  if (!fontName) {
    throw new Error("fontName is required");
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
