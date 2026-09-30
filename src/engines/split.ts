import type { Engine, ExtractedResult, FontChunk, Split } from "../types";
import { COMMON_SCRIPT, groupByScript, scriptsOf, toUnicodeRange } from "../scripts";
import type { SubsetSelection } from "./shared";

const SPLITS: readonly Split[] = ["scripts"];
/** The chunk whose `unicodeRange` also covers Common and Inherited code points, if it exists. */
const PRIMARY_SCRIPT = "latin";

/** Throws on a split other than "scripts", and on any split with the icon engine. */
export function assertSplit(split: unknown, engine: Engine): void {
  if (split === undefined) {
    return;
  }
  if (!SPLITS.includes(split as Split)) {
    throw new Error(`Invalid split: ${JSON.stringify(split)}. Valid values: ${SPLITS.join(", ")}`);
  }
  if (engine === "icon") {
    throw new Error(
      "split is not supported by the icon engine: its glyphs are icons, not letters of a script. Use the subset or convert engine",
    );
  }
}

/** What one chunk keeps of the source font. */
export interface ChunkPlan {
  readonly script: string;
  readonly selection: SubsetSelection;
}

interface ScriptedLigature {
  readonly text: string;
  /** The script of its letters; "common" when all of them are Common or Inherited. */
  readonly script: string;
}

const codePointsOf = (text: string): number[] => [...text].map((char) => char.codePointAt(0) ?? 0);

/**
 * The script of a ligature's letters other than Common and Inherited ones ("_", digits). A
 * ligature of two scripts can't form in a split font: its letters are in different chunks, and a
 * browser draws each of them with the font of its own `unicode-range`.
 */
function ligatureScript(text: string): string {
  const scripts = [...new Set(scriptsOf(codePointsOf(text)))].filter(
    (script) => script !== COMMON_SCRIPT,
  );
  if (scripts.length > 1) {
    throw new Error(
      `Ligature "${text}" mixes the scripts ${scripts.join(" and ")}, so split: "scripts" puts its letters in different fonts, where it can't form`,
    );
  }
  return scripts[0] ?? COMMON_SCRIPT;
}

/**
 * Scripts other than Common, ordered by their first code point among the code points and the
 * ligature letters, both grouped by script with ascending code points.
 */
function orderedScripts(
  groups: ReadonlyMap<string, readonly number[]>,
  letters: ReadonlyMap<string, readonly number[]>,
): string[] {
  const scripts = [...new Set([...groups.keys(), ...letters.keys()])].filter(
    (script) => script !== COMMON_SCRIPT,
  );
  const first = (script: string): number =>
    Math.min(groups.get(script)?.[0] ?? Infinity, letters.get(script)?.[0] ?? Infinity);
  return scripts.toSorted((a, b) => first(a) - first(b));
}

/**
 * A chunk per script of the selection, in the order of each script's first code point; one
 * "common" chunk when every code point is Common or Inherited. Each chunk keeps its script's
 * code points and ligatures plus every Common and Inherited code point of the selection and the
 * ligatures made only of them, so a selection of one script gives the unsplit selection.
 * `codePoints` must be those the font maps, or scripts the font lacks would get chunks.
 */
export function planChunks(selection: SubsetSelection): ChunkPlan[] {
  const ligatures = (selection.ligatures ?? [])
    .filter((text) => text.length > 0)
    .map((text): ScriptedLigature => ({ text, script: ligatureScript(text) }));
  const groups = groupByScript(selection.codePoints);
  const letters = groupByScript(ligatures.flatMap(({ text }) => codePointsOf(text)));
  const common = groups.get(COMMON_SCRIPT) ?? [];
  const commonLetters = letters.get(COMMON_SCRIPT) ?? [];
  const ordered = orderedScripts(groups, letters);
  const scripts = ordered.length > 0 ? ordered : [COMMON_SCRIPT];

  return scripts.map((script) => {
    const chunkLigatures = ligatures
      .filter((ligature) => ligature.script === script || ligature.script === COMMON_SCRIPT)
      .map(({ text }) => text);
    // Letters of the chunk's own ligatures stay ligature letters, kept without layout closure
    const ownLetters = new Set(chunkLigatures.flatMap((text) => codePointsOf(text)));
    const own = script === COMMON_SCRIPT ? [] : (groups.get(script) ?? []);
    const codePoints = [
      ...new Set([...own, ...common, ...commonLetters.filter((cp) => !ownLetters.has(cp))]),
    ];
    return { script, selection: { codePoints, ligatures: chunkLigatures } };
  });
}

/** A font built for a selection, with every code point its cmap maps. */
export interface BuiltFont {
  readonly result: ExtractedResult;
  readonly codePoints: readonly number[];
}

/** The code points of the script, and the Common and Inherited ones in the primary chunk only. */
function unicodeRangeOf(codePoints: readonly number[], script: string, isPrimary: boolean): string {
  const scripts = scriptsOf(codePoints);
  return toUnicodeRange(
    codePoints.filter(
      (_, index) => scripts[index] === script || (isPrimary && scripts[index] === COMMON_SCRIPT),
    ),
  );
}

/**
 * Builds the font of every chunk, one after another, so the transform sees them in chunk order.
 * Common and Inherited code points are in every chunk's font but in the `unicodeRange` of one
 * chunk only, latin or else the first, so a browser that meets a digit or a space loads one font,
 * not all of them.
 */
export async function buildChunks(
  plans: readonly ChunkPlan[],
  build: (plan: ChunkPlan) => Promise<BuiltFont>,
): Promise<FontChunk[]> {
  const built: BuiltFont[] = [];
  for (const plan of plans) {
    built.push(await build(plan));
  }
  const primary = plans.some(({ script }) => script === PRIMARY_SCRIPT)
    ? PRIMARY_SCRIPT
    : plans[0]?.script;
  return plans.map(({ script }, index) => {
    const { result, codePoints } = built[index];
    return {
      script,
      codePoints: [...codePoints],
      unicodeRange: unicodeRangeOf(codePoints, script, script === primary),
      ...result,
    };
  });
}
