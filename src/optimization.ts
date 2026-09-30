import { type Engine, Format, type Formats, type MinifyOption, type Target } from "./types";

/** What an extraction keeps of the font, resolved from its options. */
export interface Optimization {
  /** Output formats. */
  readonly formats: readonly Formats[];
  /** Keep TrueType hinting. */
  readonly hinting: boolean;
  /** Every layout feature, HarfBuzz's default set or these tags, padded to four characters. */
  readonly layoutFeatures: "all" | "default" | readonly string[];
  /** Name ids to keep; undefined keeps the engine's own set. */
  readonly nameIds: readonly number[] | undefined;
  /** Tags of the tables to drop, padded to four characters. */
  readonly dropTables: readonly string[];
  /** Inline the CFF subroutines: smaller after WOFF2 compression, larger as a raw font. */
  readonly desubroutinize: boolean;
}

/** What a target sets when the options leave it open; no formats means the engine's own. */
type Defaults = Omit<Optimization, "formats" | "dropTables"> & {
  readonly formats?: readonly Formats[];
};

/** Family, subfamily, full name (three.js TTFLoader reads it) and PostScript name. */
const TARGET_NAME_IDS = [1, 2, 4, 6];

const TARGETS: Record<Target, Defaults> = {
  web: {
    formats: ["woff2"],
    hinting: true,
    layoutFeatures: "default",
    nameIds: TARGET_NAME_IDS,
    desubroutinize: true,
  },
  runtime: {
    formats: ["ttf"],
    hinting: false,
    layoutFeatures: "default",
    nameIds: TARGET_NAME_IDS,
    desubroutinize: false,
  },
};

/** Without a target the engines keep what they kept before the target existed. */
const NO_TARGET: Defaults = {
  hinting: true,
  layoutFeatures: "all",
  nameIds: undefined,
  desubroutinize: false,
};

const ALL_FORMATS: readonly Formats[] = Object.values(Format);

const DEFAULT_FORMATS: Record<Engine, readonly Formats[]> = {
  icon: ALL_FORMATS,
  subset: ["ttf", "woff", "woff2"],
  convert: ALL_FORMATS,
};

const TAG_LENGTH = 4;
const MAX_NAME_ID = 32_767;
const PRINTABLE_TAG = /^[\x20-\x7e]{1,4}$/u;

/** A tag padded with spaces to four characters, the way OpenType stores "cvt " or "CFF ". */
const paddedTag = (tag: string): string => tag.padEnd(TAG_LENGTH, " ");

/**
 * Tables no font can drop: those OTS, the sanitizer of browsers, requires of every font (cmap,
 * head, hhea, hmtx, maxp, name, OS/2, post), and the outlines, TrueType (glyf, loca) or CFF
 * (CFF, CFF2). HarfBuzz and the engines need the same ones to read the glyphs back.
 */
export const REQUIRED_TABLES: readonly string[] = [
  "cmap",
  "head",
  "hhea",
  "hmtx",
  "maxp",
  "name",
  "OS/2",
  "post",
  "glyf",
  "loca",
  "CFF ",
  "CFF2",
];

/** Options every engine reads the same way; an engine that has no such option leaves it out. */
interface OptimizationFields {
  readonly target?: Target;
  readonly formats?: readonly Formats[];
  readonly hinting?: boolean;
  readonly layoutFeatures?: "all" | "default" | readonly string[];
  readonly nameIds?: readonly number[];
  readonly dropTables?: readonly string[];
}

/**
 * Resolves the options of an extraction to what it keeps: explicit options first, then what the
 * target sets, then the engine's defaults. The options must be valid.
 */
export function resolveOptimization(option: MinifyOption): Optimization {
  const fields: OptimizationFields = option;
  const defaults = fields.target ? TARGETS[fields.target] : NO_TARGET;
  const layoutFeatures = fields.layoutFeatures ?? defaults.layoutFeatures;
  return {
    formats: fields.formats ?? defaults.formats ?? DEFAULT_FORMATS[option.engine ?? "icon"],
    hinting: fields.hinting ?? defaults.hinting,
    layoutFeatures:
      typeof layoutFeatures === "string"
        ? layoutFeatures
        : layoutFeatures.map((tag) => paddedTag(tag)),
    nameIds: fields.nameIds ?? defaults.nameIds,
    dropTables: (fields.dropTables ?? []).map((tag) => paddedTag(tag)),
    desubroutinize: defaults.desubroutinize,
  };
}

const quoted = (values: readonly unknown[]): string =>
  values.map((value) => JSON.stringify(value)).join(", ");

function assertTags(name: string, tags: unknown): void {
  if (!Array.isArray(tags)) {
    throw new TypeError(`${name} must be an array of tags`);
  }
  const invalid = tags.filter((tag) => typeof tag !== "string" || !PRINTABLE_TAG.test(tag));
  if (invalid.length > 0) {
    throw new Error(
      `Invalid tag(s) in ${name}: ${quoted(invalid)}. A tag is 1 to 4 printable ASCII characters`,
    );
  }
}

function assertDroppable(tags: readonly string[]): void {
  const required = tags.filter((tag) => REQUIRED_TABLES.includes(paddedTag(tag)));
  if (required.length > 0) {
    throw new Error(
      `Invalid tag(s) in dropTables: ${quoted(required)}. The font needs these tables: ${REQUIRED_TABLES.map((tag) => tag.trim()).join(", ")}`,
    );
  }
}

function assertLayoutFeatures(layoutFeatures: unknown): void {
  if (typeof layoutFeatures === "string") {
    if (layoutFeatures !== "all" && layoutFeatures !== "default") {
      throw new Error(
        `Invalid layoutFeatures: ${JSON.stringify(layoutFeatures)}. Use "all", "default" or an array of feature tags`,
      );
    }
    return;
  }
  assertTags("layoutFeatures", layoutFeatures);
}

function assertNameIds(nameIds: unknown): void {
  if (!Array.isArray(nameIds)) {
    throw new TypeError("nameIds must be an array of integers");
  }
  const invalid = nameIds.filter(
    (id) => !Number.isInteger(id) || (id as number) < 0 || (id as number) > MAX_NAME_ID,
  );
  if (invalid.length > 0) {
    throw new Error(
      `Invalid name id(s): ${quoted(invalid)}. A name id is an integer from 0 to ${MAX_NAME_ID}`,
    );
  }
}

/**
 * Throws on optimization options of the wrong type or out of range. Every engine checks them,
 * also those it ignores, so a typo fails where it was made.
 */
export function assertOptimizationOptions(option: Readonly<Record<string, unknown>>): void {
  const { target, hinting, layoutFeatures, nameIds, dropTables, transform } = option;
  if (target !== undefined && !Object.hasOwn(TARGETS, target as string)) {
    throw new Error(
      `Invalid target: ${JSON.stringify(target)}. Valid targets: ${Object.keys(TARGETS).join(", ")}`,
    );
  }
  if (hinting !== undefined && typeof hinting !== "boolean") {
    throw new TypeError("hinting must be a boolean");
  }
  if (layoutFeatures !== undefined) {
    assertLayoutFeatures(layoutFeatures);
  }
  if (nameIds !== undefined) {
    assertNameIds(nameIds);
  }
  if (dropTables !== undefined) {
    assertTags("dropTables", dropTables);
    assertDroppable(dropTables as string[]);
  }
  if (transform !== undefined && typeof transform !== "function") {
    throw new TypeError("transform must be a function");
  }
}
