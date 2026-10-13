/**
 * Builds assets/font-variable.ttf, a variable TrueType test font with two axes:
 *
 *   wght  100..400..900  (name id 256 "Weight")   wdth  75..100..100  (name id 257 "Width")
 *
 * Glyphs: .notdef, space (empty), A, V, a, f, f_i (no code point), i. Every other glyph is a box
 * of its own size with two variations in gvar:
 *
 *   wght +1.0:  right edge and advance (right phantom point) +100, top edge +50
 *   wdth -1.0:  right edge and advance -150
 *
 * No avar and no HVAR: advances come from the phantom points. So wght 700 (0.6) moves the right
 * edge and the advance by 60 and the top by 30; wght below 400 changes nothing. GSUB liga forms
 * "fi", a legacy kern table kerns A V. The name table also holds Russian family and subfamily
 * names, meta a dlng map, and DSIG an empty signature.
 *
 * `buildVariableFont({ location })` builds instead a static font at a location given in user
 * units (`{ wght: 700 }`, missing axes at their default), with the deltas applied by hand: the
 * reference for instanced output.
 * The output is deterministic. Run: node scripts/make-variable-fixture.mjs
 */

import { writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { cmap, head, hhea, kern, maxpTrueType, metrics, name, os2, post } from "./font-tables.mjs";
import { gsub, LIGATURE_LOOKUP, ligatureSubst, lookup } from "./gsub-writer.mjs";
import { bytes, i16s, offsetsOf, sfnt, struct, u16s, u32s, u8 } from "./sfnt-writer.mjs";
import { dsigStub, fvar, gvar, meta } from "./variation-writer.mjs";

const OUTPUT = new URL("../assets/font-variable.ttf", import.meta.url);

const UNITS_PER_EM = 1000;
const ADVANCE = 600;
const ASCENT = 800;
const DESCENT = -200;
const BOX_TOP = 700;
// Seconds between the OpenType epoch (1904-01-01) and the Unix epoch
const OPENTYPE_EPOCH_OFFSET = 2_082_844_800;
const TIMESTAMP = Date.UTC(2026, 0, 1) / 1000 + OPENTYPE_EPOCH_OFFSET;
const RUSSIAN = 0x4_19;
const F2DOT14_ONE = 0x40_00;

const AXES = [
  { tag: "wght", min: 100, default: 400, max: 900, nameId: 256, name: "Weight" },
  { tag: "wdth", min: 75, default: 100, max: 100, nameId: 257, name: "Width" },
];
/** Peak tuple (normalized, one coordinate per axis) and the moves of each box glyph there. */
const VARIATIONS = [
  { peak: [1, 0], right: 100, top: 50 },
  { peak: [0, -1], right: -150, top: 0 },
];

/** Glyph name → code point; `null` for glyphs only the layout reaches. */
const GLYPHS = [
  [".notdef", null],
  ["space", 0x20],
  ["A", 0x41],
  ["V", 0x56],
  ["a", 0x61],
  ["f", 0x66],
  // Between its letters, as in make-scripts-fixture.mjs, for kerning restore
  ["f_i", null],
  ["i", 0x69],
];
const GLYPH_ORDER = GLYPHS.map(([glyphName]) => glyphName);
const gid = (glyphName) => GLYPH_ORDER.indexOf(glyphName);
const CMAP = new Map(
  GLYPHS.filter(([, code]) => code !== null).map(([glyphName, code]) => [code, gid(glyphName)]),
);

/** [xMin, yMin, xMax, yMax] of each glyph at the default location; space stays empty. */
const boxOf = (glyphName, index) => {
  if (glyphName === "space") {
    return null;
  }
  const inset = 20 + index * 10;
  return [inset, inset, ADVANCE - inset, BOX_TOP - index * 5];
};
const BOXES = GLYPH_ORDER.map((glyphName, index) => boxOf(glyphName, index));

const FI = ligatureSubst([{ components: [gid("f"), gid("i")], glyph: gid("f_i") }]);
const GSUB = gsub({ features: { liga: [0] }, lookups: [lookup(LIGATURE_LOOKUP, [FI])] });
const KERN = kern([[gid("A"), gid("V"), -80]]);

const NAME = name({
  family: "Fontext Variable",
  postScriptName: "FontextVariable-Regular",
  extra: [
    ...AXES.map((axis) => ({ id: axis.nameId, text: axis.name })),
    { id: 1, text: "Фонтекст Вариативный", language: RUSSIAN },
    { id: 2, text: "Обычный", language: RUSSIAN },
  ],
});

// --- Variations ---

/**
 * Deltas of a box glyph for one variation, in the point order of box() and then the phantom
 * points: left origin, advance, top origin, bottom origin.
 */
const boxDeltas = ({ right, top }) => [
  [0, 0],
  [0, top],
  [right, top],
  [right, 0],
  [0, 0],
  [right, 0],
  [0, 0],
  [0, 0],
];

const GVAR = gvar({
  axisCount: AXES.length,
  sharedTuples: VARIATIONS.map(({ peak }) => peak),
  glyphs: BOXES.map((glyphBox) =>
    glyphBox ? VARIATIONS.map((variation, tuple) => ({ tuple, deltas: boxDeltas(variation) })) : [],
  ),
});

/** A user value as a normalized coordinate, clamped and rounded to F2DOT14 as the spec does. */
function normalize(axis, value) {
  const clamped = Math.min(Math.max(value, axis.min), axis.max);
  const range = clamped < axis.default ? axis.default - axis.min : axis.max - axis.default;
  const normalized = range === 0 ? 0 : (clamped - axis.default) / range;
  return Math.round(normalized * F2DOT14_ONE) / F2DOT14_ONE;
}

/** How much of a variation with this peak applies at the normalized coordinates. */
function scalarOf(peak, coordinates) {
  return peak.reduce((scalar, peakValue, index) => {
    const coordinate = coordinates[index];
    if (peakValue === 0) {
      return scalar;
    }
    if (
      coordinate === 0 ||
      coordinate * peakValue < 0 ||
      Math.abs(coordinate) > Math.abs(peakValue)
    ) {
      return 0;
    }
    return scalar * (coordinate / peakValue);
  }, 1);
}

/** The moves of the right edge and of the top of a box glyph at a location in user units. */
function movesAt(location) {
  const coordinates = AXES.map((axis) => normalize(axis, location[axis.tag] ?? axis.default));
  const sum = (key) =>
    VARIATIONS.reduce(
      (total, variation) => total + scalarOf(variation.peak, coordinates) * variation[key],
      0,
    );
  return { right: Math.round(sum("right")), top: Math.round(sum("top")) };
}

// The width percentage each usWidthClass from 1 to 9 stands for
const WIDTH_CLASSES = [50, 62.5, 75, 87.5, 100, 112.5, 125, 150, 200];
/** The OS/2 width class of a wdth value: the class of the largest percentage not above it. */
const widthClassOf = (width) =>
  Math.max(1, WIDTH_CLASSES.findLastIndex((percent) => percent <= width) + 1);

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

function glyfAndLoca(boxes) {
  const glyphs = boxes.map((glyphBox) => (glyphBox ? box(glyphBox) : new Uint8Array()));
  const offsets = offsetsOf(glyphs.map((glyph) => glyph.length));
  return { glyf: struct(glyphs.map((glyph) => bytes(glyph))), loca: struct(u32s(offsets)) };
}

function bboxOf(boxes) {
  const drawn = boxes.filter((glyphBox) => glyphBox !== null);
  const side = (index) => drawn.map((glyphBox) => glyphBox[index]);
  return [Math.min(...side(0)), Math.min(...side(1)), Math.max(...side(2)), Math.max(...side(3))];
}

/** The tables every build shares, for boxes and advances moved to one location. */
function staticTables({ boxes, advances, weightClass, widthClass }) {
  const { glyf, loca } = glyfAndLoca(boxes);
  const bbox = bboxOf(boxes);
  const advanceWidthMax = Math.max(...advances);
  const drawnAdvances = advances.filter((advance) => advance > 0);
  return {
    DSIG: dsigStub(),
    GSUB,
    "OS/2": os2({
      avgCharWidth: Math.round(
        drawnAdvances.reduce((total, advance) => total + advance, 0) / drawnAdvances.length,
      ),
      codePoints: [...CMAP.keys()],
      ascent: ASCENT,
      descent: DESCENT,
      xHeight: 500,
      capHeight: BOX_TOP,
      weightClass,
      widthClass,
    }),
    cmap: cmap(CMAP),
    glyf,
    head: head({ unitsPerEm: UNITS_PER_EM, timestamp: TIMESTAMP, bbox, longOffsets: true }),
    hhea: hhea({
      ascent: ASCENT,
      descent: DESCENT,
      advanceWidthMax,
      bbox,
      numberOfHMetrics: GLYPH_ORDER.length,
    }),
    hmtx: metrics(advances.map((advance, index) => [advance, boxes[index]?.[0] ?? 0])),
    kern: KERN,
    loca,
    maxp: maxpTrueType({ numGlyphs: GLYPH_ORDER.length, maxPoints: 4, maxContours: 1 }),
    meta: meta({ dlng: "Latn" }),
    name: NAME,
    post: post(),
  };
}

/**
 * The variable font, or with `location` (user units per axis tag, e.g. `{ wght: 600, wdth: 75 }`)
 * a static font with the variations applied there and the OS/2 weight and width classes of it.
 */
export function buildVariableFont({ location } = {}) {
  if (location === undefined) {
    const defaults = Object.fromEntries(AXES.map((axis) => [axis.tag, axis.default]));
    return sfnt({
      ...staticTables({
        boxes: BOXES,
        advances: GLYPH_ORDER.map(() => ADVANCE),
        weightClass: defaults.wght,
        widthClass: widthClassOf(defaults.wdth),
      }),
      fvar: fvar(AXES),
      gvar: GVAR,
    });
  }
  const { right, top } = movesAt(location);
  const [wght, wdth] = AXES.map((axis) =>
    Math.min(Math.max(location[axis.tag] ?? axis.default, axis.min), axis.max),
  );
  return sfnt(
    staticTables({
      boxes: BOXES.map((glyphBox) =>
        glyphBox ? [glyphBox[0], glyphBox[1], glyphBox[2] + right, glyphBox[3] + top] : null,
      ),
      advances: BOXES.map((glyphBox) => (glyphBox ? ADVANCE + right : ADVANCE)),
      weightClass: Math.round(wght),
      widthClass: widthClassOf(wdth),
    }),
  );
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const font = buildVariableFont();
  writeFileSync(OUTPUT, font);
  console.log(`wrote ${OUTPUT.pathname} (${font.length} bytes)`);
}
