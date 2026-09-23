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
import {
  bytes,
  i16,
  i16s,
  i64,
  off16,
  off32,
  offsetsOf,
  sfnt,
  sizeOf,
  struct,
  tag,
  u16,
  u16s,
  u32,
  u32s,
  u8,
  zeros,
} from "./sfnt-writer.mjs";

const OUTPUT = new URL("../assets/font-multi-ligature-lookups.ttf", import.meta.url);

const UNITS_PER_EM = 1000;
const ADVANCE = 600;
const ASCENT = 800;
const DESCENT = -200;
const BOX_TOP = 700;
// Seconds between the OpenType epoch (1904-01-01) and the Unix epoch
const OPENTYPE_EPOCH_OFFSET = 2_082_844_800;
const TIMESTAMP = Date.UTC(2026, 0, 1) / 1000 + OPENTYPE_EPOCH_OFFSET;
const VERSION_1 = 0x1_00_00;
const LIGATURE_LOOKUP = 4;
const EXTENSION_LOOKUP = 7;
const NO_REQUIRED_FEATURE = 0xff_ff;
const LAST_CODE = 0xff_ff;

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

const ligature = (components, glyph) => ({ components: [...components], glyph });
const LOOKUPS = [
  { subTables: [[ligature("abc", "lig_abc")], [ligature("def", "lig_def")]] },
  { subTables: [[ligature("ghi", "lig_ghi")]] },
  { subTables: [[ligature("jkl", "lig_jkl")]], extension: true },
  { subTables: [[ligature("kja", "lig_abc")]] },
];
// FeatureList records must be sorted by tag
const FEATURES = [
  ["dlig", [3]],
  ["liga", [0, 1, 2]],
];

// --- GSUB ---

const coverage = (glyphIds) => struct(u16(1), u16(glyphIds.length), u16s(glyphIds));

function ligatureSet({ components: [, ...rest], glyph }) {
  const table = struct(
    u16(gid(glyph)),
    u16(rest.length + 1),
    u16s(rest.map((component) => gid(component))),
  );
  return struct(u16(1), off16(table));
}

/** LigatureSubstFormat1 where every ligature starts with a different first component. */
function ligatureSubst(ligatures) {
  const sorted = ligatures.toSorted((a, b) => gid(a.components[0]) - gid(b.components[0]));
  const firstGlyphs = sorted.map(({ components }) => gid(components[0]));
  return struct(
    u16(1),
    off16(coverage(firstGlyphs)),
    u16(sorted.length),
    sorted.map((item) => off16(ligatureSet(item))),
  );
}

function lookup({ subTables, extension = false }) {
  const tables = subTables.map((subTable) => ligatureSubst(subTable));
  const wrap = (table) => (extension ? struct(u16(1), u16(LIGATURE_LOOKUP), off32(table)) : table);
  return struct(
    u16s([extension ? EXTENSION_LOOKUP : LIGATURE_LOOKUP, 0, tables.length]),
    tables.map((table) => off16(wrap(table))),
  );
}

function gsub() {
  const featureIndices = FEATURES.map((_, index) => index);
  const langSys = struct(u16s([0, NO_REQUIRED_FEATURE, FEATURES.length, ...featureIndices]));
  const script = struct(off16(langSys), u16(0));
  const scriptList = struct(u16(1), tag("DFLT"), off16(script));
  const featureRecords = FEATURES.map(([featureTag, indices]) => {
    const feature = struct(u16s([0, indices.length, ...indices]));
    return [tag(featureTag), off16(feature)];
  });
  const featureList = struct(u16(FEATURES.length), featureRecords);
  const lookupList = struct(
    u16(LOOKUPS.length),
    LOOKUPS.map((item) => off16(lookup(item))),
  );
  return struct(u16(1), u16(0), off16(scriptList), off16(featureList), off16(lookupList));
}

// --- Outlines and metrics ---

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

const head = () =>
  struct(
    [u16(1), u16(0), u32(VERSION_1), u32(0), u32(0x5f_0f_3c_f5)],
    [u16(0b11), u16(UNITS_PER_EM), i64(TIMESTAMP), i64(TIMESTAMP), i16s(BBOX)],
    // MacStyle, lowestRecPPEM, fontDirectionHint, indexToLocFormat (long), glyphDataFormat
    [u16(0), u16(8), i16s([2, 1, 0])],
  );

const hhea = () =>
  struct(
    [u32(VERSION_1), i16s([ASCENT, DESCENT, 0]), u16(ADVANCE)],
    i16s([MIN_INSET, MIN_INSET, ADVANCE - MIN_INSET]),
    // Caret slope rise and run, caret offset, 4 reserved, metricDataFormat
    i16s([1, 0, 0, 0, 0, 0, 0, 0]),
    u16(GLYPH_ORDER.length),
  );

const MAX_ZONES = 2;
const maxp = () =>
  struct(u32(VERSION_1), u16s([GLYPH_ORDER.length, 4, 1, 0, 0, MAX_ZONES]), zeros(u16, 8));

const hmtx = () =>
  struct(GLYPH_ORDER.map((glyphName) => [u16(ADVANCE), i16(INSETS.get(glyphName) ?? 0)]));

function os2() {
  const codes = [...CMAP.keys()];
  const firstChar = Math.min(...codes);
  const lastChar = Math.min(Math.max(...codes), LAST_CODE);
  return struct(
    [u16(4), i16(ADVANCE), u16s([400, 5, 0])],
    // Subscript, superscript and strikeout metrics, sFamilyClass
    i16s([650, 600, 0, 75, 650, 600, 0, 350, 50, 300, 0]),
    [zeros(u8, 10), zeros(u32, 4), tag("NONE")],
    u16s([0x40, firstChar, lastChar]),
    [i16s([ASCENT, DESCENT, 0]), u16s([ASCENT, -DESCENT]), zeros(u32, 2)],
    [i16s([500, BOX_TOP]), u16s([0, 0x20, 3])],
  );
}

/** Runs of consecutive code points mapped to consecutive glyphs, plus the final 0xFFFF. */
function cmapSegments() {
  const segments = [];
  for (const [code, glyph] of [...CMAP].toSorted(([a], [b]) => a - b)) {
    const last = segments.at(-1);
    if (last && code === last.end + 1 && glyph === last.glyph + code - last.start) {
      segments[segments.length - 1] = { ...last, end: code };
    } else {
      segments.push({ start: code, end: code, glyph });
    }
  }
  return [...segments, { start: LAST_CODE, end: LAST_CODE, glyph: 0 }];
}

/** A format 4 subtable for Windows Unicode BMP. */
function cmap() {
  const segments = cmapSegments();
  const segCountX2 = segments.length * 2;
  const searchRange = 2 * 2 ** Math.floor(Math.log2(segments.length));
  const body = [
    u16s([segCountX2, searchRange, Math.log2(searchRange / 2), segCountX2 - searchRange]),
    u16s(segments.map(({ end }) => end)),
    u16(0),
    u16s(segments.map(({ start }) => start)),
    u16s(segments.map(({ start, glyph }) => (glyph - start) & LAST_CODE)),
    zeros(u16, segments.length),
  ];
  const subTable = struct(u16s([4, 6 + sizeOf(body), 0]), body);
  return struct(u16s([0, 1, 3, 1]), off32(subTable));
}

function name() {
  const records = [
    [1, "Fontext Fixture"],
    [2, "Regular"],
    [4, "Fontext Fixture Regular"],
    [6, "FontextFixture-Regular"],
  ].map(([id, text]) => ({
    id,
    data: new Uint8Array([...text].flatMap((char) => [0, char.codePointAt(0)])),
  }));
  const starts = offsetsOf(records.map(({ data }) => data.length));
  return struct(
    u16s([0, records.length, 6 + records.length * 12]),
    records.map(({ id, data }, index) => u16s([3, 1, 0x4_09, id, data.length, starts[index]])),
    records.map(({ data }) => bytes(data)),
  );
}

const post = () => struct(u32(0x3_00_00), u32(0), i16s([-75, 50]), zeros(u32, 5));

const { glyf, loca } = glyfAndLoca();
const font = sfnt({
  GSUB: gsub(),
  "OS/2": os2(),
  cmap: cmap(),
  glyf,
  head: head(),
  hhea: hhea(),
  hmtx: hmtx(),
  loca,
  maxp: maxp(),
  name: name(),
  post: post(),
});

writeFileSync(OUTPUT, font);
console.log(`wrote ${OUTPUT.pathname} (${font.length} bytes)`);
