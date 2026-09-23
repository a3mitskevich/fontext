/**
 * Builds assets/font-cff-features.otf, an OpenType test font with CFF outlines, vertical
 * metrics and ligatures reached through different features:
 *
 *   lookup 0:   f i -> U+E001                        (liga)
 *   lookup 1:   x y, then lookup 2 on x              (calt, chained context without context)
 *   lookup 2:   x y -> U+E002                        (no feature, reached from lookup 1)
 *   lookup 3:   y z followed by x, then lookup 4     (calt, chained context with lookahead)
 *   lookup 4:   y z -> U+E003                        (no feature: "yz" alone doesn't form it)
 *
 * Letters are boxes; ligatures are arches with a cubic curve. vmtx gives letters and
 * ligatures vertical advances that differ from the OS/2 line height.
 * The output is deterministic. Run: node scripts/make-cff-fixture.mjs
 */

import { writeFileSync } from "node:fs";
import { charstring, cff } from "./cff-writer.mjs";
import { cmap, head, hhea, maxpCff, metrics, name, os2, post, vhea } from "./font-tables.mjs";
import {
  CHAINED_CONTEXT_LOOKUP,
  chainedContextSubst,
  gsub,
  LIGATURE_LOOKUP,
  ligatureSubst,
  lookup,
} from "./gsub-writer.mjs";
import { CFF_VERSION, sfnt } from "./sfnt-writer.mjs";

const OUTPUT = new URL("../assets/font-cff-features.otf", import.meta.url);

const UNITS_PER_EM = 1000;
const ADVANCE = 600;
const ASCENT = 800;
const DESCENT = -200;
const BOX_TOP = 700;
const LETTER_ADVANCE_HEIGHT = 900;
const LIGATURE_ADVANCE_HEIGHT = 1100;
// Seconds between the OpenType epoch (1904-01-01) and the Unix epoch
const OPENTYPE_EPOCH_OFFSET = 2_082_844_800;
const TIMESTAMP = Date.UTC(2026, 0, 1) / 1000 + OPENTYPE_EPOCH_OFFSET;

const LETTERS = [..."fixyz"];
const LIGATURES = { f_i: 0xe0_01, x_y: 0xe0_02, y_z: 0xe0_03 };
const GLYPH_ORDER = [".notdef", "space", ...LETTERS, ...Object.keys(LIGATURES)];
const gid = (glyphName) => GLYPH_ORDER.indexOf(glyphName);
const isLigature = (glyphName) => glyphName in LIGATURES;

const CMAP = new Map([
  [0x20, gid("space")],
  ...LETTERS.map((letter) => [letter.codePointAt(0), gid(letter)]),
  ...Object.entries(LIGATURES).map(([glyphName, code]) => [code, gid(glyphName)]),
]);

// Outline inset per glyph, so every glyph has a distinct path; space stays empty
const INSETS = new Map([
  [".notdef", 50],
  ...LETTERS.map((letter, index) => [letter, 100 + index * 10]),
  ...Object.keys(LIGATURES).map((glyphName, index) => [glyphName, 20 + index * 10]),
]);
const MIN_INSET = Math.min(...INSETS.values());
const BBOX = [MIN_INSET, MIN_INSET, ADVANCE - MIN_INSET, BOX_TOP - MIN_INSET];

// --- GSUB ---

const ligature = (glyphName) => ({
  components: glyphName.split("_").map((component) => gid(component)),
  glyph: gid(glyphName),
});
const ligatureLookup = (glyphName) =>
  lookup(LIGATURE_LOOKUP, [ligatureSubst([ligature(glyphName)])]);
const contextLookup = (context) => lookup(CHAINED_CONTEXT_LOOKUP, [chainedContextSubst(context)]);

const GSUB = gsub({
  features: { calt: [1, 3], liga: [0] },
  lookups: [
    ligatureLookup("f_i"),
    contextLookup({ input: [[gid("x")], [gid("y")]], lookups: [[0, 2]] }),
    ligatureLookup("x_y"),
    contextLookup({ input: [[gid("y")], [gid("z")]], lookahead: [[gid("x")]], lookups: [[0, 4]] }),
    ligatureLookup("y_z"),
  ],
});

// --- Outlines and metrics ---

/** A rectangle, drawn with lines only. */
const box = (inset) => [
  [inset, inset],
  [[inset, BOX_TOP - inset]],
  [[ADVANCE - inset, BOX_TOP - inset]],
  [[ADVANCE - inset, inset]],
];

/** A rectangle whose right side is a cubic curve through the right edge. */
const arch = (inset) => [
  [inset, inset],
  [[inset, BOX_TOP - inset]],
  [[ADVANCE / 2, BOX_TOP - inset]],
  [
    [ADVANCE - inset, BOX_TOP - inset],
    [ADVANCE - inset, inset],
    [ADVANCE / 2, inset],
  ],
];

const outline = (glyphName) => {
  if (!INSETS.has(glyphName)) {
    return [];
  }
  const inset = INSETS.get(glyphName);
  return [isLigature(glyphName) ? arch(inset) : box(inset)];
};

const advanceHeight = (glyphName) =>
  isLigature(glyphName) ? LIGATURE_ADVANCE_HEIGHT : LETTER_ADVANCE_HEIGHT;

const font = sfnt(
  {
    "CFF ": cff({
      fontName: "FontextCffFixture-Regular",
      glyphNames: GLYPH_ORDER,
      charstrings: GLYPH_ORDER.map((glyphName) => charstring(outline(glyphName))),
      bbox: BBOX,
      defaultWidth: ADVANCE,
    }),
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
    head: head({ unitsPerEm: UNITS_PER_EM, timestamp: TIMESTAMP, bbox: BBOX }),
    hhea: hhea({
      ascent: ASCENT,
      descent: DESCENT,
      advanceWidthMax: ADVANCE,
      bbox: BBOX,
      numberOfHMetrics: GLYPH_ORDER.length,
    }),
    hmtx: metrics(GLYPH_ORDER.map((glyphName) => [ADVANCE, INSETS.get(glyphName) ?? 0])),
    maxp: maxpCff({ numGlyphs: GLYPH_ORDER.length }),
    name: name({ family: "Fontext CFF Fixture", postScriptName: "FontextCffFixture-Regular" }),
    post: post(),
    vhea: vhea({
      advanceHeightMax: LIGATURE_ADVANCE_HEIGHT,
      bbox: BBOX,
      numOfLongVerMetrics: GLYPH_ORDER.length,
    }),
    vmtx: metrics(
      GLYPH_ORDER.map((glyphName) => [
        advanceHeight(glyphName),
        BOX_TOP - (INSETS.get(glyphName) ?? 0),
      ]),
    ),
  },
  CFF_VERSION,
);

writeFileSync(OUTPUT, font);
console.log(`wrote ${OUTPUT.pathname} (${font.length} bytes)`);
