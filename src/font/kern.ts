import { createReader, type BinaryReader } from "./reader";

// OpenType kern table: https://learn.microsoft.com/typography/opentype/spec/kern
const KERN_HEADER_SIZE = 4;
const SUBTABLE_HEADER_SIZE = 6;
const FORMAT0_HEADER_SIZE = 14;
const PAIR_SIZE = 6;
const MICROSOFT_VERSION = 0;
const APPLE_VERSION = 1;
const HORIZONTAL = 0x1;
const CROSS_STREAM = 0x4;
const FORMAT_SHIFT = 8;
/** Coverage of the subtables written: horizontal kerning, format 0. */
const HORIZONTAL_FORMAT0 = HORIZONTAL;
/**
 * Pairs per written subtable, so that its uint16 length holds them: HarfBuzz steps to the next
 * subtable by that length, and OTS (Chrome, Firefox) drops the whole kern table when a subtable
 * has more than 10 922 pairs.
 */
const MAX_SUBTABLE_PAIRS = Math.floor((0xff_ff - FORMAT0_HEADER_SIZE) / PAIR_SIZE);
const GLYPH_RANGE = 0x1_00_00;
const INT16_MIN = -0x80_00;
const INT16_MAX = 0x7f_ff;
const GPOS_FEATURE_LIST_OFFSET = 6;
const FEATURE_RECORD_SIZE = 6;

const pairKey = (left: number, right: number): number => left * GLYPH_RANGE + right;
const clampInt16 = (value: number): number => Math.min(Math.max(value, INT16_MIN), INT16_MAX);

/** Horizontal kerning between two glyphs, in font units. */
export interface KernPair {
  readonly left: number;
  readonly right: number;
  readonly value: number;
}

/** The pair kerning of a kern table. */
export interface Kerning {
  /** Summed values by `left * 65536 + right`. */
  readonly values: ReadonlyMap<number, number>;
  /** Subtables of other formats, cross-stream or vertical kerning, which give no pairs here. */
  readonly skippedSubtables: number;
  /** An Apple kern table (version 1), which is not read. */
  readonly isApple: boolean;
}

/** How the glyphs of a source font are numbered in its subset. */
export interface GlyphMatch {
  /** Old glyph id → new glyph id. */
  readonly map: ReadonlyMap<number, number>;
  /** Old glyphs the subset may keep, but under an id that is not known. */
  readonly unmatched: ReadonlySet<number>;
}

/** The source kerning a subset kern table leaves out, other than pairs of dropped glyphs. */
export interface KernLoss {
  readonly isApple: boolean;
  readonly skippedSubtables: number;
  /** Non-zero pairs whose glyphs the subset may keep, with at least one of them unmatched. */
  readonly unmatchedPairs: number;
}

export interface SubsetKern {
  /** Undefined when no pair is left. */
  readonly table: Uint8Array | undefined;
  readonly loss: KernLoss;
}

function isPairKerning(coverage: number): boolean {
  return (
    coverage >> FORMAT_SHIFT === 0 &&
    (coverage & HORIZONTAL) !== 0 &&
    (coverage & CROSS_STREAM) === 0
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
 * The pair kerning HarfBuzz takes from a kern table (Microsoft version 0): the values of every
 * horizontal format 0 subtable added up, whatever their minimum and override bits say. Other
 * formats, cross-stream and vertical subtables are counted as skipped.
 */
export function readKerning(kern: Uint8Array): Kerning {
  const reader = createReader(kern, "kern table");
  const version = reader.uint16(0);
  if (version !== MICROSOFT_VERSION) {
    return { values: new Map(), skippedSubtables: 0, isApple: version === APPLE_VERSION };
  }
  const values = new Map<number, number>();
  let skippedSubtables = 0;
  let offset = KERN_HEADER_SIZE;
  for (let index = 0; index < reader.uint16(2); index++) {
    const coverage = reader.uint16(offset + 4);
    const isFormat0 = coverage >> FORMAT_SHIFT === 0;
    if (isPairKerning(coverage)) {
      for (const { left, right, value } of subtablePairs(reader, offset)) {
        const key = pairKey(left, right);
        values.set(key, (values.get(key) ?? 0) + value);
      }
    } else {
      skippedSubtables++;
    }
    // Format 0 lengths overflow in fonts with many pairs, so the pair count sizes them
    offset += isFormat0
      ? FORMAT0_HEADER_SIZE + reader.uint16(offset + SUBTABLE_HEADER_SIZE) * PAIR_SIZE
      : reader.uint16(offset + 2);
  }
  return { values, skippedSubtables, isApple: false };
}

/** Writes a horizontal format 0 subtable at `offset` and returns the offset after it. */
function writeSubtable(view: DataView, offset: number, pairs: readonly KernPair[]): number {
  const count = pairs.length;
  const length = FORMAT0_HEADER_SIZE + count * PAIR_SIZE;
  const entrySelector = Math.floor(Math.log2(count));
  const searchRange = 2 ** entrySelector * PAIR_SIZE;

  view.setUint16(offset + 2, length);
  view.setUint16(offset + 4, HORIZONTAL_FORMAT0);
  view.setUint16(offset + 6, count);
  view.setUint16(offset + 8, searchRange);
  view.setUint16(offset + 10, entrySelector);
  view.setUint16(offset + 12, count * PAIR_SIZE - searchRange);
  pairs.forEach(({ left, right, value }, index) => {
    const pair = offset + FORMAT0_HEADER_SIZE + index * PAIR_SIZE;
    view.setUint16(pair, left);
    view.setUint16(pair + 2, right);
    view.setInt16(pair + 4, value);
  });
  return offset + length;
}

/**
 * A version 0 kern table of sorted pairs in as few horizontal format 0 subtables as their size
 * allows. Windows reads only the first subtable, and almost every font needs just one.
 */
function writeKern(pairs: readonly KernPair[]): Uint8Array {
  const chunks = Array.from({ length: Math.ceil(pairs.length / MAX_SUBTABLE_PAIRS) }, (_, index) =>
    pairs.slice(index * MAX_SUBTABLE_PAIRS, (index + 1) * MAX_SUBTABLE_PAIRS),
  );
  const out = new Uint8Array(
    KERN_HEADER_SIZE + chunks.length * FORMAT0_HEADER_SIZE + pairs.length * PAIR_SIZE,
  );
  const view = new DataView(out.buffer);

  view.setUint16(2, chunks.length);
  chunks.reduce((offset, chunk) => writeSubtable(view, offset, chunk), KERN_HEADER_SIZE);
  return out;
}

/**
 * The kern table of a subset font: the non-zero pairs whose glyphs are both matched, renumbered.
 * Pairs of glyphs the subset dropped are left out as they should be; whatever else is left out
 * is counted in `loss`.
 */
export function subsetKern(kern: Uint8Array, glyphs: GlyphMatch): SubsetKern {
  const { values, skippedSubtables, isApple } = readKerning(kern);
  const kerned = [...values]
    .map(([key, value]) => ({
      left: Math.floor(key / GLYPH_RANGE),
      right: key % GLYPH_RANGE,
      value: clampInt16(value),
    }))
    .filter(({ value }) => value !== 0);
  const pairs = kerned
    .flatMap(({ left, right, value }): KernPair[] => {
      const newLeft = glyphs.map.get(left);
      const newRight = glyphs.map.get(right);
      return newLeft === undefined || newRight === undefined
        ? []
        : [{ left: newLeft, right: newRight, value }];
    })
    .toSorted((a, b) => pairKey(a.left, a.right) - pairKey(b.left, b.right));
  const mayBeKept = (glyph: number) => glyphs.map.has(glyph) || glyphs.unmatched.has(glyph);
  const unmatchedPairs = kerned.filter(
    ({ left, right }) =>
      mayBeKept(left) &&
      mayBeKept(right) &&
      (glyphs.unmatched.has(left) || glyphs.unmatched.has(right)),
  ).length;

  return {
    table: pairs.length === 0 ? undefined : writeKern(pairs),
    loss: { isApple, skippedSubtables, unmatchedPairs },
  };
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
