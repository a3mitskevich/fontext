import type { Rename } from "../types";
import type { InstanceAxes } from "./hb-subset";
import { assertNamedWeight, PIN_WEIGHT, pinnedWeight, WEIGHT_NAMES } from "./rename-option";
import {
  decodeName,
  encodeName,
  isUtf16,
  type NameRecord,
  readNameTable,
  writeNameTable,
} from "../font/name";
import { requiredSfntTable, sfntTable, withTable } from "../font/sfnt";

const FAMILY = 1;
const SUBFAMILY = 2;
const UNIQUE_ID = 3;
const FULL_NAME = 4;
const POSTSCRIPT_NAME = 6;
const TYPOGRAPHIC_FAMILY = 16;
const TYPOGRAPHIC_SUBFAMILY = 17;
const WWS_FAMILY = 21;
const WWS_SUBFAMILY = 22;
const VARIATIONS_POSTSCRIPT_PREFIX = 25;
/**
 * The name ids rename writes, and those that would keep the old family next to the new one
 * (WWS names, the PostScript prefix of variable instances); their records in every platform and
 * language go.
 */
const RENAMED_IDS = new Set([
  WWS_FAMILY,
  WWS_SUBFAMILY,
  VARIATIONS_POSTSCRIPT_PREFIX,
  FAMILY,
  SUBFAMILY,
  UNIQUE_ID,
  FULL_NAME,
  POSTSCRIPT_NAME,
  TYPOGRAPHIC_FAMILY,
  TYPOGRAPHIC_SUBFAMILY,
]);

const WINDOWS = { platformId: 3, encodingId: 1, languageId: 0x4_09 } as const;

const OS2_FS_SELECTION = 62;
const HEAD_MAC_STYLE = 44;
const FS_ITALIC = 1;
const FS_BOLD = 1 << 5;
const FS_REGULAR = 1 << 6;
const MAC_BOLD = 1;
const MAC_ITALIC = 1 << 1;

const POSTSCRIPT_MAX_LENGTH = 63;
// Everything but printable ASCII, and the delimiters a PostScript name may not hold
const POSTSCRIPT_EXCLUDED = /[^\x21-\x7e]|[[\](){}<>/%]/gu;
const ITALIC = /\bitalic\b/iu;
const RIBBI_WEIGHT = /^(?:regular|bold)$/iu;
const BOLD = /^bold$/iu;

/** The string of a name id, in Windows English if the font has it, else in any UTF-16 record. */
function nameOf(records: readonly NameRecord[], nameId: number): string | undefined {
  const candidates = records.filter((record) => record.nameId === nameId && isUtf16(record));
  const english = candidates.find(
    ({ platformId, languageId }) =>
      platformId === WINDOWS.platformId && languageId === WINDOWS.languageId,
  );
  const record = english ?? candidates[0];
  return record && decodeName(record);
}

interface Names {
  readonly family: string;
  readonly style: string;
}

/** The style of the pinned weight, italic when the source is or ital is pinned to 1. */
function weightStyle(weight: number, sourceStyle: string, axes: InstanceAxes): string {
  const weightName = WEIGHT_NAMES[weight];
  if (!ITALIC.test(sourceStyle) && axes.ital !== 1) {
    return weightName;
  }
  return weightName === "Regular" ? "Italic" : `${weightName} Italic`;
}

/** The family and style to write: those given, else the source's family and the pinned weight. */
function resolveNames(rename: Rename, source: readonly NameRecord[], axes: InstanceAxes): Names {
  const given = rename === true ? {} : rename;
  const family = given.family ?? nameOf(source, TYPOGRAPHIC_FAMILY) ?? nameOf(source, FAMILY);
  if (!family) {
    throw new Error("rename: the font has no family name, set rename.family");
  }
  const sourceStyle = nameOf(source, TYPOGRAPHIC_SUBFAMILY) ?? nameOf(source, SUBFAMILY) ?? "";
  const weight = pinnedWeight(axes);
  if (given.style === undefined && weight !== undefined) {
    assertNamedWeight(weight);
    return { family, style: weightStyle(weight, sourceStyle, axes) };
  }
  // "*": "default" pins no wght in a font without one
  if (rename === true) {
    throw new Error(PIN_WEIGHT);
  }
  return { family, style: given.style ?? (sourceStyle || "Regular") };
}

const postScriptPart = (text: string): string => text.replaceAll(POSTSCRIPT_EXCLUDED, "");

/** Family-Style without spaces and the characters PostScript names exclude. */
function postScriptName({ family, style }: Names): string {
  const [familyPart, stylePart] = [postScriptPart(family), postScriptPart(style)];
  if (!familyPart) {
    throw new Error(
      "rename gives an empty PostScript name: use ASCII letters or digits in the family",
    );
  }
  return (stylePart ? `${familyPart}-${stylePart}` : familyPart).slice(0, POSTSCRIPT_MAX_LENGTH);
}

interface StyleLinking {
  /** Family and subfamily for applications that know only four styles per family. */
  readonly family: string;
  readonly subfamily: string;
  /** The typographic family and subfamily, for every other style. */
  readonly typographic?: Names;
  readonly isBold: boolean;
  readonly isItalic: boolean;
}

/**
 * How the style links into its family. Regular, Italic, Bold and Bold Italic are the four styles
 * of one family; any other style gets a family of its own (Inter SemiBold, Regular) and the
 * typographic names (Inter, SemiBold) that group it with the others.
 */
function linkStyle({ family, style }: Names): StyleLinking {
  const isItalic = ITALIC.test(style);
  const weight = style.replace(ITALIC, " ").replaceAll(/\s+/gu, " ").trim() || "Regular";
  if (RIBBI_WEIGHT.test(weight)) {
    const isBold = BOLD.test(weight);
    const subfamily = [isBold ? "Bold" : "", isItalic ? "Italic" : ""].join(" ").trim();
    return { family, subfamily: subfamily || "Regular", isBold, isItalic };
  }
  return {
    family: `${family} ${weight}`,
    subfamily: isItalic ? "Italic" : "Regular",
    typographic: { family, style },
    isBold: false,
    isItalic,
  };
}

type NameText = readonly [nameId: number, text: string];

function namesToWrite(records: readonly NameRecord[], names: Names): NameText[] {
  const linking = linkStyle(names);
  const postScript = postScriptName(names);
  const hasUniqueId = records.some(({ nameId }) => nameId === UNIQUE_ID);
  const uniqueId: NameText[] = hasUniqueId ? [[UNIQUE_ID, postScript]] : [];
  const typographic: NameText[] = linking.typographic
    ? [
        [TYPOGRAPHIC_FAMILY, linking.typographic.family],
        [TYPOGRAPHIC_SUBFAMILY, linking.typographic.style],
      ]
    : [];
  return [
    [FAMILY, linking.family],
    [SUBFAMILY, linking.subfamily],
    ...uniqueId,
    [FULL_NAME, `${names.family} ${names.style}`],
    [POSTSCRIPT_NAME, postScript],
    ...typographic,
  ];
}

function renamedRecords(records: readonly NameRecord[], names: Names): NameRecord[] {
  return [
    ...records.filter(({ nameId }) => !RENAMED_IDS.has(nameId)),
    ...namesToWrite(records, names).map(([nameId, text]) => ({
      platformId: WINDOWS.platformId,
      encodingId: WINDOWS.encodingId,
      languageId: WINDOWS.languageId,
      nameId,
      data: encodeName(text),
    })),
  ];
}

/** A copy of a table with a uint16 field changed. */
function withUint16(
  table: Uint8Array,
  offset: number,
  update: (value: number) => number,
): Uint8Array {
  const copy = new Uint8Array(table);
  const view = new DataView(copy.buffer);
  view.setUint16(offset, update(view.getUint16(offset)));
  return copy;
}

/** OS/2 fsSelection and head macStyle with the bold, italic and regular bits of the style. */
function withStyleBits(font: Uint8Array, { isBold, isItalic }: StyleLinking): Uint8Array {
  const fsSelection =
    (isItalic ? FS_ITALIC : 0) | (isBold ? FS_BOLD : 0) | (isBold || isItalic ? 0 : FS_REGULAR);
  const macStyle = (isItalic ? MAC_ITALIC : 0) | (isBold ? MAC_BOLD : 0);
  const os2 = sfntTable(font, "OS/2");
  const styled = os2
    ? withTable(
        font,
        "OS/2",
        withUint16(
          os2,
          OS2_FS_SELECTION,
          (value) => (value & ~(FS_ITALIC | FS_BOLD | FS_REGULAR)) | fsSelection,
        ),
      )
    : font;
  const head = requiredSfntTable(styled, "head");
  return withTable(
    styled,
    "head",
    withUint16(head, HEAD_MAC_STYLE, (value) => (value & ~(MAC_BOLD | MAC_ITALIC)) | macStyle),
  );
}

/**
 * Writes the family and style into the name table of the font, Windows English records only, and
 * the matching style bits into OS/2 and head. The names it doesn't give come from `source`, the
 * font the output was made of: its family, and its style or the pinned weight.
 */
export function renameFont(
  font: Uint8Array,
  source: Uint8Array,
  rename: Rename,
  axes: InstanceAxes,
): Uint8Array {
  const { records: sourceRecords } = readNameTable(requiredSfntTable(source, "name"));
  const names = resolveNames(rename, sourceRecords, axes);
  const table = readNameTable(requiredSfntTable(font, "name"));
  const named = withTable(
    font,
    "name",
    writeNameTable({ ...table, records: renamedRecords(table.records, names) }),
  );
  return withStyleBits(named, linkStyle(names));
}
