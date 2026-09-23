/**
 * Builders for the OpenType tables every test fixture needs. They take plain numbers and maps,
 * so fixtures only describe their glyphs and metrics.
 */

import {
  bytes,
  i16,
  i16s,
  i64,
  off32,
  offsetsOf,
  sizeOf,
  struct,
  tag,
  u16,
  u16s,
  u32,
  u8,
  zeros,
} from "./sfnt-writer.mjs";

const VERSION_1 = 0x1_00_00;
const CFF_MAXP_VERSION = 0x50_00;
const VHEA_VERSION = 0x1_10_00;
const LAST_CODE = 0xff_ff;
const MAX_ZONES = 2;

/** `timestamp` is in seconds since the OpenType epoch; `longOffsets` sets indexToLocFormat. */
export const head = ({ unitsPerEm, timestamp, bbox, longOffsets = false }) =>
  struct(
    [u16(1), u16(0), u32(VERSION_1), u32(0), u32(0x5f_0f_3c_f5)],
    [u16(0b11), u16(unitsPerEm), i64(timestamp), i64(timestamp), i16s(bbox)],
    // MacStyle, lowestRecPPEM, fontDirectionHint, indexToLocFormat, glyphDataFormat
    [u16(0), u16(8), i16s([2, longOffsets ? 1 : 0, 0])],
  );

export const hhea = ({ ascent, descent, advanceWidthMax, bbox, numberOfHMetrics }) =>
  struct(
    [u32(VERSION_1), i16s([ascent, descent, 0]), u16(advanceWidthMax)],
    // MinLeftSideBearing, minRightSideBearing, xMaxExtent
    i16s([bbox[0], bbox[0], bbox[2]]),
    // Caret slope rise and run, caret offset, 4 reserved, metricDataFormat
    i16s([1, 0, 0, 0, 0, 0, 0, 0]),
    u16(numberOfHMetrics),
  );

/** Vertical header for fonts with vmtx; `advanceHeightMax` also serves as the line height. */
export const vhea = ({ advanceHeightMax, bbox, numOfLongVerMetrics }) =>
  struct(
    [u32(VHEA_VERSION), i16s([advanceHeightMax / 2, -advanceHeightMax / 2, 0])],
    u16(advanceHeightMax),
    // MinTopSideBearing, minBottomSideBearing, yMaxExtent
    i16s([0, 0, bbox[3] - bbox[1]]),
    // Caret slope rise and run, caret offset, 4 reserved, metricDataFormat
    i16s([0, 1, 0, 0, 0, 0, 0, 0]),
    u16(numOfLongVerMetrics),
  );

export const maxpTrueType = ({ numGlyphs, maxPoints, maxContours }) =>
  struct(u32(VERSION_1), u16s([numGlyphs, maxPoints, maxContours, 0, 0, MAX_ZONES]), zeros(u16, 8));

export const maxpCff = ({ numGlyphs }) => struct(u32(CFF_MAXP_VERSION), u16(numGlyphs));

/** Horizontal or vertical metrics: one [advance, side bearing] pair per glyph. */
export const metrics = (pairs) =>
  struct(pairs.map(([advance, bearing]) => [u16(advance), i16(bearing)]));

export function os2({ avgCharWidth, codePoints, ascent, descent, xHeight, capHeight }) {
  const firstChar = Math.min(...codePoints);
  const lastChar = Math.min(Math.max(...codePoints), LAST_CODE);
  return struct(
    [u16(4), i16(avgCharWidth), u16s([400, 5, 0])],
    // Subscript, superscript and strikeout metrics, sFamilyClass
    i16s([650, 600, 0, 75, 650, 600, 0, 350, 50, 300, 0]),
    [zeros(u8, 10), zeros(u32, 4), tag("NONE")],
    u16s([0x40, firstChar, lastChar]),
    [i16s([ascent, descent, 0]), u16s([ascent, -descent]), zeros(u32, 2)],
    [i16s([xHeight, capHeight]), u16s([0, 0x20, 3])],
  );
}

/** Runs of consecutive code points mapped to consecutive glyphs, plus the final 0xFFFF. */
function cmapSegments(glyphsByCode) {
  const segments = [];
  for (const [code, glyph] of [...glyphsByCode].toSorted(([a], [b]) => a - b)) {
    const last = segments.at(-1);
    if (last && code === last.end + 1 && glyph === last.glyph + code - last.start) {
      segments[segments.length - 1] = { ...last, end: code };
    } else {
      segments.push({ start: code, end: code, glyph });
    }
  }
  return [...segments, { start: LAST_CODE, end: LAST_CODE, glyph: 0 }];
}

/** A format 4 subtable for Windows Unicode BMP, from a Map of code point to glyph id. */
export function cmap(glyphsByCode) {
  const segments = cmapSegments(glyphsByCode);
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

/** Windows English names: family, subfamily, full name and PostScript name. */
export function name({ family, postScriptName }) {
  const records = [
    [1, family],
    [2, "Regular"],
    [4, `${family} Regular`],
    [6, postScriptName],
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

/** Version 3: no glyph names. */
export const post = () => struct(u32(0x3_00_00), u32(0), i16s([-75, 50]), zeros(u32, 5));
