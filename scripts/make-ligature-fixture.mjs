/**
 * Builds assets/font-multi-ligature-lookups.ttf, a TrueType test font whose ligatures are split
 * across several GSUB subtables and lookups (the shape real icon fonts often have):
 *
 *   lookup 0, subtable 0:   a b c -> U+E001   (liga)
 *   lookup 0, subtable 1:   d e f -> U+E002   (liga)
 *   lookup 1:               g h i -> U+E003   (liga)
 *   lookup 2 (extension):   j k l -> U+E004   (liga)
 *   lookup 3:               k j a -> U+E001   (dlig only, off by default: must not be resolved)
 *
 * Font libraries don't write extension lookups, so the tables are assembled by hand.
 * The output is deterministic. Run: node scripts/make-ligature-fixture.mjs
 */

import { writeFileSync } from "node:fs";
import { cmap, head, hhea, maxpTrueType, metrics, name, os2, post } from "./font-tables.mjs";
import { gsub, LIGATURE_LOOKUP, ligatureSubst, lookup } from "./gsub-writer.mjs";
import { bytes, i16, i16s, offsetsOf, sfnt, struct, u16s, u32s, u8 } from "./sfnt-writer.mjs";

const OUTPUT = new URL("../assets/font-multi-ligature-lookups.ttf", import.meta.url);

const UNITS_PER_EM = 1000;
const ADVANCE = 600;
const ASCENT = 800;
const DESCENT = -200;
const BOX_TOP = 700;
// Seconds between the OpenType epoch (1904-01-01) and the Unix epoch
const OPENTYPE_EPOCH_OFFSET = 2_082_844_800;
const TIMESTAMP = Date.UTC(2026, 0, 1) / 1000 + OPENTYPE_EPOCH_OFFSET;

const LETTERS = [..."abcdefghijkl"];
const LIGATURES = { lig_abc: 0xe0_01, lig_def: 0xe0_02, lig_ghi: 0xe0_03, lig_jkl: 0xe0_04 };
const GLYPH_ORDER = [".notdef", "space", ...LETTERS, ...Object.keys(LIGATURES)];
const gid = (glyphName) => GLYPH_ORDER.indexOf(glyphName);

const CMAP = new Map([
  [0x20, gid("space")],
  ...LETTERS.map((letter) => [letter.codePointAt(0), gid(letter)]),
  ...Object.entries(LIGATURES).map(([glyphName, code]) => [code, gid(glyphName)]),
]);

// Box outline inset per glyph, so every glyph has a distinct path; space stays empty
const INSETS = new Map([
  [".notdef", 50],
  ...LETTERS.map((letter, index) => [letter, 100 + index * 10]),
  ...Object.keys(LIGATURES).map((glyphName) => [glyphName, 20]),
]);
const MIN_INSET = Math.min(...INSETS.values());
const BBOX = [MIN_INSET, MIN_INSET, ADVANCE - MIN_INSET, BOX_TOP - MIN_INSET];

const ligature = (components, glyph) => ({
  components: [...components].map((component) => gid(component)),
  glyph: gid(glyph),
});
const LOOKUPS = [
  { subTables: [[ligature("abc", "lig_abc")], [ligature("def", "lig_def")]] },
  { subTables: [[ligature("ghi", "lig_ghi")]] },
  { subTables: [[ligature("jkl", "lig_jkl")]], extension: true },
  { subTables: [[ligature("kja", "lig_abc")]] },
];
const FEATURES = { dlig: [3], liga: [0, 1, 2] };

const GSUB = gsub({
  features: FEATURES,
  lookups: LOOKUPS.map(({ subTables, extension }) =>
    lookup(
      LIGATURE_LOOKUP,
      subTables.map((ligatures) => ligatureSubst(ligatures)),
      { extension },
    ),
  ),
});

// --- Outlines ---

/** A simple glyph with one rectangular contour; coordinates are int16 deltas. */
function box(inset) {
  const points = [
    [inset, inset],
    [inset, BOX_TOP - inset],
    [ADVANCE - inset, BOX_TOP - inset],
    [ADVANCE - inset, inset],
  ];
  const deltas = points.map(([x, y], index) => {
    const [prevX, prevY] = index === 0 ? [0, 0] : points[index - 1];
    return [x - prevX, y - prevY];
  });
  const ON_CURVE = 1;
  return struct(
    i16(1),
    i16s([inset, inset, ADVANCE - inset, BOX_TOP - inset]),
    u16s([points.length - 1, 0]),
    points.map(() => u8(ON_CURVE)),
    i16s(deltas.map(([dx]) => dx)),
    i16s(deltas.map(([, dy]) => dy)),
  );
}

function glyfAndLoca() {
  const glyphs = GLYPH_ORDER.map((glyphName) =>
    INSETS.has(glyphName) ? box(INSETS.get(glyphName)) : new Uint8Array(),
  );
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
  hmtx: metrics(GLYPH_ORDER.map((glyphName) => [ADVANCE, INSETS.get(glyphName) ?? 0])),
  loca,
  maxp: maxpTrueType({ numGlyphs: GLYPH_ORDER.length, maxPoints: 4, maxContours: 1 }),
  name: name({ family: "Fontext Fixture", postScriptName: "FontextFixture-Regular" }),
  post: post(),
});

writeFileSync(OUTPUT, font);
console.log(`wrote ${OUTPUT.pathname} (${font.length} bytes)`);
