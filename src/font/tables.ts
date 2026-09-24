import { createReader } from "./reader";

// Seconds between the OpenType epoch (1904-01-01) and the Unix epoch
const OPENTYPE_EPOCH_OFFSET = 2_082_844_800;
const UINT32_RANGE = 2 ** 32;
const HEAD_MODIFIED = 28;
const OS2_TYPO_ASCENDER = 68;
const OS2_TYPO_DESCENDER = 70;
const HHEA_ASCENDER = 4;
const HHEA_DESCENDER = 6;
const VHEA_LONG_METRICS_COUNT = 34;
const LONG_METRIC_SIZE = 4;
const MAXP_NUM_GLYPHS = 4;

/** The head.modified date as Unix time in seconds; dates before 1970 give 0. */
export function modifiedTime(head: Uint8Array): number {
  const reader = createReader(head, "head table");
  const high = reader.int32(HEAD_MODIFIED);
  const low = reader.uint32(HEAD_MODIFIED + 4);
  return Math.max(high * UINT32_RANGE + low - OPENTYPE_EPOCH_OFFSET, 0);
}

/** The number of glyphs in the font, from maxp. */
export function glyphCount(maxp: Uint8Array): number {
  return createReader(maxp, "maxp table").uint16(MAXP_NUM_GLYPHS);
}

/**
 * Vertical advances from vmtx, or undefined for fonts without vertical metrics. harfbuzzjs is
 * built without vertical metrics and reports the em size for every glyph, so vmtx is read here.
 * Glyphs past the last long metric share its advance.
 */
export function vmtxAdvances(
  vhea: Uint8Array | undefined,
  vmtx: Uint8Array | undefined,
): ((glyph: number) => number) | undefined {
  if (!vhea || !vmtx) {
    return undefined;
  }
  const count = createReader(vhea, "vhea table").uint16(VHEA_LONG_METRICS_COUNT);
  if (count === 0) {
    return undefined;
  }
  const reader = createReader(vmtx, "vmtx table");
  return (glyph) => reader.uint16(Math.min(glyph, count - 1) * LONG_METRIC_SIZE);
}

/**
 * The vertical advance of fonts without vmtx: the typographic line height from OS/2 (version 1
 * and later), else the hhea line height. The same fallback fontkit used.
 */
export function defaultVerticalAdvance(
  os2: Uint8Array | undefined,
  hhea: Uint8Array | undefined,
): number {
  if (os2) {
    const reader = createReader(os2, "OS/2 table");
    if (reader.uint16(0) > 0) {
      return Math.abs(reader.int16(OS2_TYPO_ASCENDER) - reader.int16(OS2_TYPO_DESCENDER));
    }
  }
  if (!hhea) {
    throw new Error("Malformed font: it has neither vmtx, OS/2 version 1+ nor hhea metrics");
  }
  const reader = createReader(hhea, "hhea table");
  return Math.abs(reader.int16(HHEA_ASCENDER) - reader.int16(HHEA_DESCENDER));
}
