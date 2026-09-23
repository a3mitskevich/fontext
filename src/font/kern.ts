import { createReader, type BinaryReader } from "./reader";

// OpenType kern table: https://learn.microsoft.com/typography/opentype/spec/kern
const KERN_HEADER_SIZE = 4;
const SUBTABLE_HEADER_SIZE = 6;
const FORMAT0_HEADER_SIZE = 14;
const PAIR_SIZE = 6;
const HORIZONTAL = 0x1;
const MINIMUM = 0x2;
const CROSS_STREAM = 0x4;
const OVERRIDE = 0x8;
const FORMAT_SHIFT = 8;
/** Coverage of the one subtable written: horizontal kerning, format 0. */
const HORIZONTAL_FORMAT0 = HORIZONTAL;
const MAX_UINT16 = 0xff_ff;
const INT16_MIN = -0x80_00;
const INT16_MAX = 0x7f_ff;
const GPOS_FEATURE_LIST_OFFSET = 6;
const FEATURE_RECORD_SIZE = 6;

const pairKey = (left: number, right: number): number => left * 0x1_00_00 + right;
const clampInt16 = (value: number): number => Math.min(Math.max(value, INT16_MIN), INT16_MAX);

/** Horizontal kerning between two glyphs, in font units. */
export interface KernPair {
  readonly left: number;
  readonly right: number;
  readonly value: number;
}

function isPairKerning(coverage: number): boolean {
  return (
    coverage >> FORMAT_SHIFT === 0 &&
    (coverage & HORIZONTAL) !== 0 &&
    (coverage & (MINIMUM | CROSS_STREAM)) === 0
  );
}

function subtablePairs(reader: BinaryReader, offset: number): KernPair[] {
  return Array.from({ length: reader.uint16(offset + SUBTABLE_HEADER_SIZE) }, (_, index) => {
    const pair = offset + FORMAT0_HEADER_SIZE + index * PAIR_SIZE;
    return {
      left: reader.uint16(pair),
      right: reader.uint16(pair + 2),
      value: reader.int16(pair + 4),
    };
  });
}

/**
 * The pair kerning a shaper takes from a kern table (Microsoft version 0): the horizontal format 0
 * subtables in order, each adding to the value so far or, with the override bit, replacing it.
 * Minimum and cross-stream subtables and other formats don't kern pairs this way and are left out;
 * Apple kern tables (version 1) give no pairs. Keys are `left * 65536 + right`.
 */
export function readKerning(kern: Uint8Array): ReadonlyMap<number, number> {
  const reader = createReader(kern, "kern table");
  const kerning = new Map<number, number>();
  if (reader.uint16(0) !== 0) {
    return kerning;
  }
  let offset = KERN_HEADER_SIZE;
  for (let index = 0; index < reader.uint16(2); index++) {
    const coverage = reader.uint16(offset + 4);
    const isFormat0 = coverage >> FORMAT_SHIFT === 0;
    if (isPairKerning(coverage)) {
      for (const { left, right, value } of subtablePairs(reader, offset)) {
        const key = pairKey(left, right);
        const previous = (coverage & OVERRIDE) === 0 ? (kerning.get(key) ?? 0) : 0;
        kerning.set(key, clampInt16(previous + value));
      }
    }
    // Format 0 lengths overflow in fonts with many pairs, so the pair count sizes them
    offset += isFormat0
      ? FORMAT0_HEADER_SIZE + reader.uint16(offset + SUBTABLE_HEADER_SIZE) * PAIR_SIZE
      : reader.uint16(offset + 2);
  }
  return kerning;
}

/** A version 0 kern table with one horizontal format 0 subtable of the pairs, sorted as required. */
function writeKern(pairs: readonly KernPair[]): Uint8Array {
  const count = pairs.length;
  const entrySelector = Math.floor(Math.log2(count));
  const searchRange = 2 ** entrySelector * PAIR_SIZE;
  const out = new Uint8Array(KERN_HEADER_SIZE + FORMAT0_HEADER_SIZE + count * PAIR_SIZE);
  const view = new DataView(out.buffer);
  const subtable = KERN_HEADER_SIZE;

  view.setUint16(2, 1);
  view.setUint16(subtable + 2, Math.min(FORMAT0_HEADER_SIZE + count * PAIR_SIZE, MAX_UINT16));
  view.setUint16(subtable + 4, HORIZONTAL_FORMAT0);
  view.setUint16(subtable + 6, count);
  view.setUint16(subtable + 8, searchRange);
  view.setUint16(subtable + 10, entrySelector);
  view.setUint16(subtable + 12, count * PAIR_SIZE - searchRange);
  pairs.forEach(({ left, right, value }, index) => {
    const pair = subtable + FORMAT0_HEADER_SIZE + index * PAIR_SIZE;
    view.setUint16(pair, left);
    view.setUint16(pair + 2, right);
    view.setInt16(pair + 4, value);
  });
  return out;
}

/**
 * The kern table of a subset font: the non-zero pairs whose glyphs are both in `glyphMap` (old
 * glyph id → new glyph id), renumbered, in one subtable. Undefined when no pair is left.
 */
export function subsetKern(
  kern: Uint8Array,
  glyphMap: ReadonlyMap<number, number>,
): Uint8Array | undefined {
  const pairs = [...readKerning(kern)]
    .flatMap(([key, value]): KernPair[] => {
      const left = glyphMap.get(Math.floor(key / 0x1_00_00));
      const right = glyphMap.get(key % 0x1_00_00);
      return left === undefined || right === undefined || value === 0
        ? []
        : [{ left, right, value }];
    })
    .toSorted((a, b) => pairKey(a.left, a.right) - pairKey(b.left, b.right))
    // A format 0 subtable counts its pairs in a uint16
    .slice(0, MAX_UINT16);
  return pairs.length === 0 ? undefined : writeKern(pairs);
}

/** Whether the GPOS table has a kern feature: shapers then ignore the kern table. */
export function hasGposKern(gpos?: Uint8Array): boolean {
  if (!gpos) {
    return false;
  }
  const reader = createReader(gpos, "GPOS table");
  const featureList = reader.uint16(GPOS_FEATURE_LIST_OFFSET);
  return Array.from({ length: reader.uint16(featureList) }, (_, index) =>
    reader.tag(featureList + 2 + index * FEATURE_RECORD_SIZE),
  ).includes("kern");
}
