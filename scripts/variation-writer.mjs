/**
 * Builders for the tables of variable TrueType test fixtures (fvar, gvar, STAT) and for the meta and
 * DSIG tables. They take plain numbers, so fixtures only describe their axes and deltas.
 */

import {
  bytes,
  i16s,
  off16,
  off32,
  offsetsOf,
  struct,
  tag,
  u16,
  u16s,
  u32,
  u32s,
  u8,
} from "./sfnt-writer.mjs";

const FVAR_AXES_OFFSET = 16;
const FVAR_AXIS_SIZE = 20;
const FIXED_ONE = 0x1_00_00;
const F2DOT14_ONE = 0x40_00;

const GVAR_HEADER_SIZE = 20;
const GVAR_LONG_OFFSETS = 1;
const SHARED_POINT_NUMBERS = 0x80_00;
const TUPLE_HEADER_SIZE = 4;
const GLYPH_VARIATION_HEADER_SIZE = 4;
// A point number count of 0: the deltas cover every point, phantom points included
const ALL_POINTS = 0;

const DELTAS_ARE_ZERO = 0x80;
const DELTAS_ARE_WORDS = 0x40;
const MAX_RUN = 64;
const INT8_MIN = -128;
const INT8_MAX = 127;

/** A 16.16 fixed-point number; negative values in two's complement. */
const fixed = (value) => u32(Math.round(value * FIXED_ONE) >>> 0);
const toF2dot14 = (value) => Math.round(value * F2DOT14_ONE);

/**
 * Axes `{ tag, min, default, max, nameId }` in user units, no named instances. HarfBuzz and the
 * spec accept fonts without instances.
 */
export function fvar(axes) {
  const instanceSize = 4 + axes.length * 4;
  return struct(
    u16s([1, 0, FVAR_AXES_OFFSET, 2, axes.length, FVAR_AXIS_SIZE, 0, instanceSize]),
    axes.map((axis) => [
      tag(axis.tag),
      fixed(axis.min),
      fixed(axis.default),
      fixed(axis.max),
      u16s([0, axis.nameId]),
    ]),
  );
}

const isWord = (value) => value < INT8_MIN || value > INT8_MAX;

/** Length of the run that starts at `start`: zeros, bytes or words, at most 64 values. */
function runLength(values, start, matches) {
  let length = 0;
  while (start + length < values.length && length < MAX_RUN && matches(values[start + length])) {
    length += 1;
  }
  return length;
}

/** Packed deltas: runs of zeros, of int8 and of int16 values, each behind a control byte. */
export function packedDeltas(values) {
  const runs = [];
  let start = 0;
  while (start < values.length) {
    const first = values[start];
    const zeros = first === 0;
    const words = isWord(first);
    const length = zeros
      ? runLength(values, start, (value) => value === 0)
      : runLength(values, start, (value) => value !== 0 && isWord(value) === words);
    const run = values.slice(start, start + length);
    if (zeros) {
      runs.push(u8(DELTAS_ARE_ZERO | (length - 1)));
    } else {
      runs.push(
        u8((words ? DELTAS_ARE_WORDS : 0) | (length - 1)),
        words ? i16s(run) : run.map((value) => u8(value & 0xff)),
      );
    }
    start += length;
  }
  return runs;
}

/**
 * GlyphVariationData of one glyph: `variations` are `{ tuple, deltas }`, `tuple` the index of a
 * shared tuple and `deltas` one [dx, dy] pair per point, the 4 phantom points last. All
 * variations share the point numbers "all points". Padded to an even length.
 */
function glyphVariationData(variations) {
  const data = variations.map(({ deltas }) =>
    struct(packedDeltas(deltas.map(([dx]) => dx)), packedDeltas(deltas.map(([, dy]) => dy))),
  );
  const headersSize = GLYPH_VARIATION_HEADER_SIZE + variations.length * TUPLE_HEADER_SIZE;
  const glyph = struct(
    u16s([SHARED_POINT_NUMBERS | variations.length, headersSize]),
    variations.map(({ tuple }, index) => u16s([data[index].length, tuple])),
    u8(ALL_POINTS),
    data.map((tupleData) => bytes(tupleData)),
  );
  const padded = new Uint8Array(glyph.length + (glyph.length % 2));
  padded.set(glyph);
  return padded;
}

/**
 * Glyph variations: `sharedTuples` holds peak tuples, one normalized coordinate per axis;
 * `glyphs` holds the variations of each glyph (see glyphVariationData), empty for none.
 * Offsets are long, so the data needs no alignment beyond the even lengths.
 */
export function gvar({ axisCount, sharedTuples, glyphs }) {
  const glyphData = glyphs.map((variations) =>
    variations.length > 0 ? glyphVariationData(variations) : new Uint8Array(),
  );
  const sharedTuplesOffset = GVAR_HEADER_SIZE + (glyphs.length + 1) * 4;
  const dataOffset = sharedTuplesOffset + sharedTuples.length * axisCount * 2;
  const glyphOffsets = offsetsOf(glyphData.map(({ length }) => length));
  const coordinates = sharedTuples.flat().map((coordinate) => toF2dot14(coordinate));
  return struct(
    u16s([1, 0, axisCount, sharedTuples.length]),
    u32(sharedTuplesOffset),
    u16s([glyphs.length, GVAR_LONG_OFFSETS]),
    u32(dataOffset),
    u32s(glyphOffsets),
    i16s(coordinates),
    glyphData.map((data) => bytes(data)),
  );
}

const ascii = (text) => [...text].map((char) => char.codePointAt(0));

/** Version 1 meta table from a map of tag to ASCII text, e.g. `{ dlng: "Latn" }`. */
export function meta(entries) {
  const maps = Object.entries(entries).map(([mapTag, text]) => ({
    mapTag,
    data: new Uint8Array(ascii(text)),
  }));
  return struct(
    u32s([1, 0, 0, maps.length]),
    maps.map(({ mapTag, data }) => [tag(mapTag), off32(data), u32(data.length)]),
  );
}

const STAT_DESIGN_AXIS_SIZE = 8;
const AXIS_VALUE_FORMAT_1 = 1;
/** Axis value flag: style names leave the value's name out, e.g. "Regular". */
export const ELIDABLE_AXIS_VALUE_NAME = 0x2;

/**
 * Version 1.1 STAT: a design axis per `{ tag, nameId }` in that order, and format 1 axis values
 * `{ axisIndex, flags, nameId, value }`, the value in user units.
 */
export function stat({ axes, values, elidedFallbackNameId }) {
  const designAxes = struct(
    axes.map((axis, ordering) => [tag(axis.tag), u16s([axis.nameId, ordering])]),
  );
  const axisValues = values.map(({ axisIndex, flags, nameId, value }) =>
    struct(u16s([AXIS_VALUE_FORMAT_1, axisIndex, flags, nameId]), fixed(value)),
  );
  // The offsets of the axis values count from the start of their array
  const axisValueOffsets = struct(axisValues.map((axisValue) => off16(axisValue)));
  return struct(
    u16s([1, 1, STAT_DESIGN_AXIS_SIZE, axes.length]),
    off32(designAxes),
    u16(values.length),
    off32(axisValueOffsets),
    u16(elidedFallbackNameId),
  );
}

/** A DSIG table without signatures, as fonts that dropped their signature carry. */
export const dsigStub = () => struct(u32(1), u16s([0, 0]));
