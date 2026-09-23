import type * as HarfBuzzModule from "harfbuzzjs";
import { readLigatures, type LigatureRecord } from "./gsub";
import { toSvgPath } from "./outline";
import { defaultVerticalAdvance, modifiedTime, vmtxAdvances } from "./tables";

export type { LigatureRecord } from "./gsub";

/** A glyph of shaped text and the source text of its cluster. */
export interface ShapedGlyph {
  readonly id: number;
  readonly text: string;
}

/** A single TrueType or OpenType font, read with HarfBuzz. Glyph metrics are in font units. */
export interface Font {
  /** Code points mapped by the cmap, ascending. */
  readonly codePoints: readonly number[];
  /** The head.modified date as Unix time in seconds; dates before 1970 give 0. */
  readonly modified: number;
  /** The glyph the cmap maps `codePoint` to, without shaping. */
  glyphForCodePoint: (codePoint: number) => number | undefined;
  /** Characters the cmap maps to `glyph`, by ascending code point. */
  stringsForGlyph: (glyph: number) => readonly string[];
  /** Shapes `text` with the default features of its script and language. */
  shape: (text: string) => ShapedGlyph[];
  /** Every ligature of the GSUB ligature lookups, whether a default feature reaches it or not. */
  ligatures: () => readonly LigatureRecord[];
  /** SVG path data of the glyph outline, y axis pointing down. */
  svgPath: (glyph: number) => string;
  advanceWidth: (glyph: number) => number;
  advanceHeight: (glyph: number) => number;
}

type HarfBuzz = typeof HarfBuzzModule;
type Face = InstanceType<HarfBuzz["Face"]>;

/** Characters mapped to each glyph, in ascending code point order. */
function reverseCmap(
  codePoints: readonly number[],
  glyphOf: (codePoint: number) => number | undefined,
): Map<number, string[]> {
  const strings = new Map<number, string[]>();
  for (const codePoint of codePoints) {
    const glyph = glyphOf(codePoint);
    if (glyph !== undefined) {
      strings.set(glyph, [...(strings.get(glyph) ?? []), String.fromCodePoint(codePoint)]);
    }
  }
  return strings;
}

/** A copy of a table: harfbuzzjs returns a view of WebAssembly memory, which moves when it grows. */
const tableOf = (face: Face, tag: string): Uint8Array | undefined =>
  face.referenceTable(tag)?.slice();

/** Text of each cluster: from its start index to the start of the next cluster in text order. */
function clusterTexts(text: string, clusters: readonly number[]): Map<number, string> {
  const starts = [...new Set(clusters)].toSorted((a, b) => a - b);
  return new Map(
    starts.map((start, index) => [start, text.slice(start, starts[index + 1] ?? text.length)]),
  );
}

/**
 * Opens an uncompressed sfnt font. HarfBuzz is imported on first use: it instantiates its
 * WebAssembly module with top-level await, which a static import would pass on to this package
 * and break `require()` of it.
 */
export async function openFont(sfnt: Uint8Array): Promise<Font> {
  const hb: HarfBuzz = await import("harfbuzzjs");
  const face = new hb.Face(new hb.Blob(sfnt), 0);
  const head = tableOf(face, "head");
  if (!head) {
    throw new Error("Malformed font: it has no head table");
  }
  const font = new hb.Font(face);
  const glyphForCodePoint = (codePoint: number) => font.nominalGlyph(codePoint);
  const codePoints = [...face.collectUnicodes()];
  const strings = reverseCmap(codePoints, glyphForCodePoint);
  const vmtxAdvance = vmtxAdvances(tableOf(face, "vhea"), tableOf(face, "vmtx"));
  const os2 = tableOf(face, "OS/2");
  const hhea = tableOf(face, "hhea");
  let ligatures: readonly LigatureRecord[] | undefined;

  return {
    codePoints,
    modified: modifiedTime(head),
    glyphForCodePoint,
    stringsForGlyph: (glyph) => strings.get(glyph) ?? [],
    shape(text) {
      const buffer = new hb.Buffer();
      buffer.addText(text);
      buffer.guessSegmentProperties();
      hb.shape(font, buffer);
      const infos = buffer.getGlyphInfos();
      const texts = clusterTexts(
        text,
        infos.map(({ cluster }) => cluster),
      );
      return infos.map(({ codepoint, cluster }) => ({
        id: codepoint,
        text: texts.get(cluster) ?? "",
      }));
    },
    ligatures: () => (ligatures ??= readLigatures(tableOf(face, "GSUB"))),
    svgPath: (glyph) => toSvgPath(font.glyphToJson(glyph)),
    advanceWidth: (glyph) => font.glyphHAdvance(glyph),
    advanceHeight: (glyph) => vmtxAdvance?.(glyph) ?? defaultVerticalAdvance(os2, hhea),
  };
}
