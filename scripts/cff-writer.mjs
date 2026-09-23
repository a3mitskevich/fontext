/**
 * A minimal CFF (version 1) table writer for test fixtures: one font, glyph names in the String
 * INDEX, a format 0 charset and Type 2 charstrings built from absolute outline points.
 * https://adobe-type-tools.github.io/font-tech-notes/pdfs/5176.CFF.pdf
 */

import { bytes, offsetsOf, struct, u16, u16s, u32, u8 } from "./sfnt-writer.mjs";

// Top DICT and Private DICT operators
const FONT_BBOX = 5;
const CHARSET = 15;
const CHAR_STRINGS = 17;
const PRIVATE = 18;
const DEFAULT_WIDTH_X = 20;
// Type 2 charstring operators
const RLINETO = 5;
const RRCURVETO = 8;
const ENDCHAR = 14;
const RMOVETO = 21;
// The first SID after the 391 standard strings
const FIRST_CUSTOM_SID = 391;

const ascii = (text) => new Uint8Array([...text].map((char) => char.codePointAt(0)));

/** An integer operand in the shortest encoding shared by DICTs and charstrings. */
function shortInt(value) {
  if (value >= -107 && value <= 107) {
    return [u8(value + 139)];
  }
  if (value >= 108 && value <= 1131) {
    return [u8(((value - 108) >> 8) + 247), u8((value - 108) & 0xff)];
  }
  if (value >= -1131 && value <= -108) {
    return [u8(((-value - 108) >> 8) + 251), u8((-value - 108) & 0xff)];
  }
  return [u8(28), u16(value & 0xff_ff)];
}

/** A DICT operand of fixed size, so offsets can be filled in without moving anything. */
const fixedInt = (value) => [u8(29), u32(value)];

const dict = (entries) => struct(entries.map(([operands, operator]) => [operands, u8(operator)]));

function offSizeOf(maxOffset) {
  const limits = [0x1_00, 0x1_00_00, 0x1_00_00_00];
  const index = limits.findIndex((limit) => maxOffset < limit);
  return index === -1 ? 4 : index + 1;
}

function offsetField(size, value) {
  const fields = { 1: () => u8(value), 2: () => u16(value), 4: () => u32(value) };
  return fields[size]?.() ?? [u8(value >> 16), u16(value & 0xff_ff)];
}

/** An INDEX of byte arrays: count, offset size, 1-based offsets, then the data. */
function cffIndex(items) {
  if (items.length === 0) {
    return struct(u16(0));
  }
  const offsets = offsetsOf(
    items.map((item) => item.length),
    1,
  );
  const offSize = offSizeOf(offsets.at(-1));
  return struct(
    u16(items.length),
    u8(offSize),
    offsets.map((offset) => offsetField(offSize, offset)),
    items.map((item) => bytes(item)),
  );
}

/**
 * A Type 2 charstring from contours given as a start point and segments in absolute font
 * units: one point per line, three (two controls and the end) per cubic curve.
 */
export function charstring(contours) {
  const commands = contours.flatMap(([start, ...segments]) => [
    { points: [start], operator: RMOVETO },
    ...segments.map((points) => ({ points, operator: points.length === 1 ? RLINETO : RRCURVETO })),
  ]);
  const points = commands.flatMap((command) => command.points);
  const deltas = points.map(([x, y], index) => {
    const [prevX, prevY] = index === 0 ? [0, 0] : points[index - 1];
    return [x - prevX, y - prevY];
  });
  const starts = offsetsOf(commands.map((command) => command.points.length));
  return struct(
    commands.map(({ operator }, index) => [
      deltas
        .slice(starts[index], starts[index + 1])
        .flat()
        .map((value) => shortInt(value)),
      u8(operator),
    ]),
    u8(ENDCHAR),
  );
}

/**
 * A CFF table for one font. `glyphNames` start with .notdef; `charstrings` are in glyph order.
 * Advance widths come from hmtx, `defaultWidth` only keeps the charstrings free of widths.
 */
export function cff({ fontName, glyphNames, charstrings, bbox, defaultWidth }) {
  const header = struct(u8(1), u8(0), u8(4), u8(4));
  const names = cffIndex([ascii(fontName)]);
  const strings = cffIndex(glyphNames.slice(1).map((glyphName) => ascii(glyphName)));
  const globalSubrs = cffIndex([]);
  const charset = struct(
    u8(0),
    u16s(glyphNames.slice(1).map((_, position) => FIRST_CUSTOM_SID + position)),
  );
  const charStrings = cffIndex(charstrings);
  const privateDict = dict([[shortInt(defaultWidth), DEFAULT_WIDTH_X]]);
  const topDict = ({ charsetAt, charStringsAt, privateAt }) =>
    cffIndex([
      dict([
        [bbox.map((value) => shortInt(value)), FONT_BBOX],
        [fixedInt(charsetAt), CHARSET],
        [fixedInt(charStringsAt), CHAR_STRINGS],
        [[fixedInt(privateDict.length), fixedInt(privateAt)], PRIVATE],
      ]),
    ]);
  const placeholder = topDict({ charsetAt: 0, charStringsAt: 0, privateAt: 0 });
  const [charsetAt, charStringsAt, privateAt] = offsetsOf(
    [charset.length, charStrings.length],
    header.length + names.length + placeholder.length + strings.length + globalSubrs.length,
  );
  return struct(
    [header, names, topDict({ charsetAt, charStringsAt, privateAt }), strings, globalSubrs].map(
      (part) => bytes(part),
    ),
    [charset, charStrings, privateDict].map((part) => bytes(part)),
  );
}
