import { requiredSfntTable } from "../src/font/sfnt";

/* Reads the subroutines of the CFF table of an OpenType font: the count of its Global Subr INDEX
   and whether its Private DICT points to local subroutines.
   https://adobe-type-tools.github.io/font-tech-notes/pdfs/5176.CFF.pdf */

const PRIVATE = 18;
const SUBRS = 19;
const ESCAPE = 12;
const REAL = 30;

interface CffIndex {
  count: number;
  items: Uint8Array[];
  end: number;
}

function readOffset(data: Uint8Array, at: number, size: number): number {
  let value = 0;
  for (let byte = 0; byte < size; byte++) {
    value = value * 256 + data[at + byte];
  }
  return value;
}

function readIndex(data: Uint8Array, at: number): CffIndex {
  const count = readOffset(data, at, 2);
  if (count === 0) {
    return { count, items: [], end: at + 2 };
  }
  const offSize = data[at + 2];
  const offsets = Array.from({ length: count + 1 }, (_, index) =>
    readOffset(data, at + 3 + index * offSize, offSize),
  );
  const base = at + 3 + (count + 1) * offSize - 1;
  const items = offsets
    .slice(0, -1)
    .map((offset, index) => data.subarray(base + offset, base + offsets[index + 1]));
  return { count, items, end: base + offsets[count] };
}

/** The length in bytes of the DICT operand that starts with `byte`. */
function operandLength(dict: Uint8Array, at: number): number {
  const byte = dict[at];
  if (byte === 28) {
    return 3;
  }
  if (byte === 29) {
    return 5;
  }
  if (byte === REAL) {
    let end = at + 1;
    while ((dict[end] & 0x0f) !== 0x0f && (dict[end] & 0xf0) !== 0xf0) {
      end++;
    }
    return end - at + 1;
  }
  return byte >= 247 ? 2 : 1;
}

/** An integer DICT operand; reals are not needed here. */
function readInteger(dict: Uint8Array, at: number): number {
  const byte = dict[at];
  if (byte === 28) {
    return ((dict[at + 1] << 24) >> 16) | dict[at + 2];
  }
  if (byte === 29) {
    return (dict[at + 1] << 24) | (dict[at + 2] << 16) | (dict[at + 3] << 8) | dict[at + 4];
  }
  if (byte >= 247 && byte <= 250) {
    return (byte - 247) * 256 + dict[at + 1] + 108;
  }
  if (byte >= 251) {
    return -(byte - 251) * 256 - dict[at + 1] - 108;
  }
  return byte - 139;
}

/** The integer operands of every one-byte operator of a DICT. */
function readDict(dict: Uint8Array): Map<number, number[]> {
  const entries = new Map<number, number[]>();
  let operands: number[] = [];
  let at = 0;
  while (at < dict.length) {
    const byte = dict[at];
    if (byte <= 21) {
      if (byte !== ESCAPE) {
        entries.set(byte, operands);
      }
      operands = [];
      at += byte === ESCAPE ? 2 : 1;
    } else {
      operands = [...operands, byte === REAL ? Number.NaN : readInteger(dict, at)];
      at += operandLength(dict, at);
    }
  }
  return entries;
}

/** The global subroutine count and whether the font has local subroutines. */
export function cffSubroutines(font: Uint8Array): { global: number; hasLocal: boolean } {
  const cff = requiredSfntTable(font, "CFF ");
  const names = readIndex(cff, cff[2]);
  const topDicts = readIndex(cff, names.end);
  const strings = readIndex(cff, topDicts.end);
  const global = readIndex(cff, strings.end).count;
  const [size, offset] = readDict(topDicts.items[0]).get(PRIVATE) ?? [0, 0];
  const privateDict = readDict(cff.subarray(offset, offset + size));
  return { global, hasLocal: privateDict.has(SUBRS) };
}
