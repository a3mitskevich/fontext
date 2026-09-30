import { createReader } from "../font/reader";
import { requiredSfntTable, withTable } from "../font/sfnt";
import { glyphCount } from "../font/tables";
import { hbSubset, type SubsetInput } from "./hb-subset";

const HHEA_LONG_METRICS_COUNT = 34;
const LONG_METRIC_SIZE = 4;

/**
 * A copy of the font where the advance of every glyph is its glyph id plus one. Advances do not
 * take part in the layout closure, and hb-subset copies them unchanged into the glyphs it keeps,
 * so the advances of a subset of this font are the old ids of its glyphs.
 */
function withGlyphIdAdvances(sfnt: Uint8Array): Uint8Array {
  const count = glyphCount(requiredSfntTable(sfnt, "maxp"));
  const hhea = new Uint8Array(requiredSfntTable(sfnt, "hhea"));
  // A MalformedFontError when hhea is too short to hold the count
  createReader(hhea, "hhea table").uint16(HHEA_LONG_METRICS_COUNT);
  new DataView(hhea.buffer).setUint16(HHEA_LONG_METRICS_COUNT, count);
  const hmtx = new Uint8Array(count * LONG_METRIC_SIZE);
  const view = new DataView(hmtx.buffer);
  for (let glyph = 0; glyph < count; glyph++) {
    view.setUint16(glyph * LONG_METRIC_SIZE, glyph + 1);
  }
  return withTable(withTable(sfnt, "hhea", hhea), "hmtx", hmtx);
}

/** The advance of every glyph of the font; glyphs past the last long metric share its advance. */
function advances(sfnt: Uint8Array): number[] {
  const count = glyphCount(requiredSfntTable(sfnt, "maxp"));
  const longMetrics = createReader(requiredSfntTable(sfnt, "hhea"), "hhea table").uint16(
    HHEA_LONG_METRICS_COUNT,
  );
  const hmtx = createReader(requiredSfntTable(sfnt, "hmtx"), "hmtx table");
  return Array.from({ length: count }, (_, glyph) =>
    hmtx.uint16(Math.min(glyph, longMetrics - 1) * LONG_METRIC_SIZE),
  );
}

/**
 * The glyph ids hb-subset keeps for the code points with its layout closure over the layout
 * features: their glyphs, the glyphs GSUB can turn them into (e.g. the "fi" ligature of "f" and
 * "i") and the components of composite glyphs. HarfBuzz exports no closure call, so it subsets a
 * copy of the font whose advances name the glyphs and reads the kept ones back.
 */
export async function layoutClosure(
  sfnt: Uint8Array,
  unicodes: readonly number[],
  layoutFeatures: SubsetInput["layoutFeatures"],
): Promise<number[]> {
  const subset = await hbSubset(withGlyphIdAdvances(sfnt), { unicodes, layoutFeatures });
  const glyphs = advances(subset).map((advance) => advance - 1);
  const isRenumbering = glyphs.every(
    (glyph, index) => glyph >= 0 && (index === 0 ? glyph === 0 : glyph > glyphs[index - 1]),
  );
  if (!isRenumbering) {
    throw new Error("Cannot find the layout closure of the font: its subset lost the glyph ids");
  }
  return glyphs;
}
