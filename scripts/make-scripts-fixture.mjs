/**
 * Builds assets/font-scripts.ttf, a TrueType test font with glyphs of several writing systems,
 * for splitting a font by script:
 *
 *   Common:     space . , 0 1       Inherited: U+0301 combining acute accent (no advance)
 *   Latin:      A V a f i           Greek:     Α Ω α
 *   Cyrillic:   А Д а               Unknown:   U+E000 (private use)
 *
 * GSUB liga forms "fi" (a glyph without a code point). A legacy kern table kerns pairs within a
 * script (A V, Α Ω), between Common and a script (1 A, 1 Д) and across scripts (V А).
 * Every glyph is a box of its own size, so every outline differs.
 * The output is deterministic. Run: node scripts/make-scripts-fixture.mjs
 */

import { writeFileSync } from "node:fs";
import { cmap, head, hhea, kern, maxpTrueType, metrics, name, os2, post } from "./font-tables.mjs";
import { gsub, LIGATURE_LOOKUP, ligatureSubst, lookup } from "./gsub-writer.mjs";
import { bytes, i16s, offsetsOf, sfnt, struct, u16s, u32s, u8 } from "./sfnt-writer.mjs";

const OUTPUT = new URL("../assets/font-scripts.ttf", import.meta.url);

const UNITS_PER_EM = 1000;
const ADVANCE = 600;
const ASCENT = 800;
const DESCENT = -200;
const BOX_TOP = 700;
// Seconds between the OpenType epoch (1904-01-01) and the Unix epoch
const OPENTYPE_EPOCH_OFFSET = 2_082_844_800;
const TIMESTAMP = Date.UTC(2026, 0, 1) / 1000 + OPENTYPE_EPOCH_OFFSET;

/** Glyph name → code point; `null` for glyphs only the layout reaches. */
const GLYPHS = [
  [".notdef", null],
  ["space", 0x20],
  ["comma", 0x2c],
  ["period", 0x2e],
  ["zero", 0x30],
  ["one", 0x31],
  ["A", 0x41],
  ["V", 0x56],
  ["a", 0x61],
  ["f", 0x66],
  /*
   * Between its letters, which every subset that keeps it keeps too: kerning restore matches the
   * glyphs without a code point by their order between glyphs with one
   */
  ["f_i", null],
  ["i", 0x69],
  ["acutecomb", 0x3_01],
  ["Alpha", 0x3_91],
  ["Omega", 0x3_a9],
  ["alpha", 0x3_b1],
  ["A-cy", 0x4_10],
  ["De-cy", 0x4_14],
  ["a-cy", 0x4_30],
  ["uniE000", 0xe0_00],
];
const GLYPH_ORDER = GLYPHS.map(([glyphName]) => glyphName);
const gid = (glyphName) => GLYPH_ORDER.indexOf(glyphName);
const CMAP = new Map(
  GLYPHS.filter(([, code]) => code !== null).map(([glyphName, code]) => [code, gid(glyphName)]),
);

// The mark sits above the preceding letter; it has no advance and draws left of its origin
const MARK_BOX = [-400, 750, -200, 850];
/** [xMin, yMin, xMax, yMax] of each glyph; space stays empty. */
const boxOf = (glyphName, index) => {
  if (glyphName === "space") {
    return null;
  }
  if (glyphName === "acutecomb") {
    return MARK_BOX;
  }
  const inset = 20 + index * 10;
  return [inset, inset, ADVANCE - inset, BOX_TOP - index * 5];
};
const BOXES = GLYPH_ORDER.map((glyphName, index) => boxOf(glyphName, index));
const advanceOf = (glyphName) => (glyphName === "acutecomb" ? 0 : ADVANCE);

const sides = BOXES.filter((glyphBox) => glyphBox !== null).map(([xMin, yMin, xMax, yMax]) => ({
  xMin,
  yMin,
  xMax,
  yMax,
}));
const BBOX = [
  Math.min(...sides.map(({ xMin }) => xMin)),
  Math.min(...sides.map(({ yMin }) => yMin)),
  Math.max(...sides.map(({ xMax }) => xMax)),
  Math.max(...sides.map(({ yMax }) => yMax)),
];

const FI = ligatureSubst([{ components: [gid("f"), gid("i")], glyph: gid("f_i") }]);
const GSUB = gsub({ features: { liga: [0] }, lookups: [lookup(LIGATURE_LOOKUP, [FI])] });

const KERN = kern([
  [gid("one"), gid("A"), -30],
  [gid("one"), gid("De-cy"), -40],
  [gid("A"), gid("V"), -80],
  [gid("V"), gid("A-cy"), -60],
  [gid("Alpha"), gid("Omega"), -20],
]);

// --- Outlines ---

/** A simple glyph with one rectangular contour; coordinates are int16 deltas. */
function box([xMin, yMin, xMax, yMax]) {
  const points = [
    [xMin, yMin],
    [xMin, yMax],
    [xMax, yMax],
    [xMax, yMin],
  ];
  const deltas = points.map(([x, y], index) => {
    const [prevX, prevY] = index === 0 ? [0, 0] : points[index - 1];
    return [x - prevX, y - prevY];
  });
  const ON_CURVE = 1;
  return struct(
    i16s([1, xMin, yMin, xMax, yMax]),
    u16s([points.length - 1, 0]),
    points.map(() => u8(ON_CURVE)),
    i16s(deltas.map(([dx]) => dx)),
    i16s(deltas.map(([, dy]) => dy)),
  );
}

function glyfAndLoca() {
  const glyphs = BOXES.map((glyphBox) => (glyphBox ? box(glyphBox) : new Uint8Array()));
  const offsets = offsetsOf(glyphs.map((glyph) => glyph.length));
  return { glyf: struct(glyphs.map((glyph) => bytes(glyph))), loca: struct(u32s(offsets)) };
}

const { glyf, loca } = glyfAndLoca();
const font = sfnt({
  GSUB,
  "OS/2": os2({
    avgCharWidth: ADVANCE,
    codePoints: [...CMAP.keys()],
    ascent: ASCENT,
    descent: DESCENT,
    xHeight: 500,
    capHeight: BOX_TOP,
  }),
  cmap: cmap(CMAP),
  glyf,
  head: head({ unitsPerEm: UNITS_PER_EM, timestamp: TIMESTAMP, bbox: BBOX, longOffsets: true }),
  hhea: hhea({
    ascent: ASCENT,
    descent: DESCENT,
    advanceWidthMax: ADVANCE,
    bbox: BBOX,
    numberOfHMetrics: GLYPH_ORDER.length,
  }),
  hmtx: metrics(
    GLYPH_ORDER.map((glyphName, index) => [advanceOf(glyphName), BOXES[index]?.[0] ?? 0]),
  ),
  kern: KERN,
  loca,
  maxp: maxpTrueType({ numGlyphs: GLYPH_ORDER.length, maxPoints: 4, maxContours: 1 }),
  name: name({ family: "Fontext Scripts", postScriptName: "FontextScripts-Regular" }),
  post: post(),
});

writeFileSync(OUTPUT, font);
console.log(`wrote ${OUTPUT.pathname} (${font.length} bytes)`);
