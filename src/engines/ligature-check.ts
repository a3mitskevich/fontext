import { formsLigature } from "../core";
import { type Font, openFont } from "../font/font";

const quoted = (texts: readonly string[]): string =>
  texts.map((text) => JSON.stringify(text)).join(", ");

function lostLigaturesError(lost: readonly string[], needed: readonly string[]): Error {
  const advice =
    needed.length > 0
      ? `they need the GSUB feature(s) ${needed.join(", ")}, which the subset left out. Add them to layoutFeatures, or use "default" or "all"`
      : `use "default" or "all" for layoutFeatures`;
  return new Error(`Ligatures do not form with these layoutFeatures: ${quoted(lost)}; ${advice}`);
}

/**
 * Throws when a requested ligature the source forms no longer forms in the subset, because its
 * layout features left out the feature that forms it; the subset would hold the ligature glyph
 * that nothing reaches. Ligatures the source doesn't form keep their letters, as before.
 */
export async function assertLigaturesKept(
  source: Font,
  subset: Uint8Array,
  ligatures: readonly string[],
): Promise<void> {
  const formed = ligatures.filter((text) => formsLigature(source, text));
  if (formed.length === 0) {
    return;
  }
  const output = await openFont(subset);
  const lost = formed.filter((text) => !formsLigature(output, text));
  if (lost.length === 0) {
    return;
  }
  // A left out feature is needed when turning it off in the source unforms a lost ligature
  const kept = new Set(output.gsubFeatures());
  const needed = source
    .gsubFeatures()
    .filter((tag) => !kept.has(tag))
    .filter((tag) => lost.some((text) => !formsLigature(source, text, [`-${tag}`])));
  throw lostLigaturesError(lost, needed);
}
