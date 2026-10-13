import { assertRenameOption } from "./engines/rename";
import {
  type Axes,
  type Engine,
  Format,
  type Formats,
  type MinifyOption,
  type NameLanguages,
  type Preset,
  type Rename,
} from "./types";

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
  /** Languages of the name records to keep; undefined keeps HarfBuzz's English (0x409). */
  readonly nameLanguages: "all" | readonly number[] | undefined;
  /** Tags of the tables to drop, padded to four characters. */
  readonly dropTables: readonly string[];
  /** Tags of the tables to keep that HarfBuzz or the hinting option drop, padded. */
  readonly keepTables: readonly string[];
  /** Inline the CFF subroutines: smaller after WOFF2 compression, larger as a raw font. */
  readonly desubroutinize: boolean;
  /** Keep the glyph names in post. */
  readonly glyphNames: boolean;
  /** New family and style names. */
  readonly rename: Rename | undefined;
  /** The axes the source was instanced at, for the style names. */
  readonly axes: Axes;
}

/** What a preset sets when the options leave it open. */
type Defaults = Omit<
  Optimization,
  "formats" | "dropTables" | "keepTables" | "glyphNames" | "nameLanguages" | "rename" | "axes"
>;

/** Family, subfamily, full name (three.js TTFLoader reads it) and PostScript name. */
const PRESET_NAME_IDS = [1, 2, 4, 6];

/**
 * Desubroutinized CFF is 2-8% smaller after WOFF2, WOFF or HTTP compression and up to 45% larger
 * raw; outline renderers often load the raw font.
 */
const PRESETS: Record<Preset, Defaults> = {
  "web-font": {
    hinting: true,
    layoutFeatures: "default",
    nameIds: PRESET_NAME_IDS,
    desubroutinize: true,
  },
  "outline-render": {
    hinting: false,
    layoutFeatures: "default",
    nameIds: PRESET_NAME_IDS,
    desubroutinize: false,
  },
};

/** Without a preset the engines keep what they kept before presets existed. */
const NO_PRESET: Defaults = {
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
const MAX_LANGUAGE_ID = 0xff_ff;
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

/**
 * Tables keepTables brings back: gasp, which hinting: false drops, and tables HarfBuzz drops whose
 * data refers to no glyph id, so a copy from the source stays valid for the subset.
 */
export const KEEPABLE_TABLES: readonly string[] = ["gasp", "meta", "PCLT"];

/** Options every engine reads the same way; an engine that has no such option leaves it out. */
interface OptimizationFields {
  readonly preset?: Preset;
  readonly formats?: readonly Formats[];
  readonly hinting?: boolean;
  readonly layoutFeatures?: "all" | "default" | readonly string[];
  readonly nameIds?: readonly number[];
  readonly nameLanguages?: NameLanguages;
  readonly dropTables?: readonly string[];
  readonly keepTables?: readonly string[];
  readonly glyphNames?: boolean;
  readonly desubroutinize?: boolean;
  readonly rename?: Rename;
  readonly axes?: Axes;
}

/**
 * Resolves the options of an extraction to what it keeps: explicit options first, then what the
 * preset sets, then the engine's defaults. The options must be valid.
 */
export function resolveOptimization(option: MinifyOption): Optimization {
  const fields: OptimizationFields = option;
  const defaults = fields.preset ? PRESETS[fields.preset] : NO_PRESET;
  const layoutFeatures = fields.layoutFeatures ?? defaults.layoutFeatures;
  return {
    formats: fields.formats ?? DEFAULT_FORMATS[option.engine ?? "icon"],
    hinting: fields.hinting ?? defaults.hinting,
    layoutFeatures:
      typeof layoutFeatures === "string"
        ? layoutFeatures
        : layoutFeatures.map((tag) => paddedTag(tag)),
    nameIds: fields.nameIds ?? defaults.nameIds,
    nameLanguages: fields.nameLanguages,
    dropTables: (fields.dropTables ?? []).map((tag) => paddedTag(tag)),
    keepTables: (fields.keepTables ?? []).map((tag) => paddedTag(tag)),
    desubroutinize: fields.desubroutinize ?? defaults.desubroutinize,
    glyphNames: fields.glyphNames ?? false,
    rename: fields.rename,
    axes: fields.axes ?? {},
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

function assertKeepable(keepTables: readonly string[], dropTables: unknown): void {
  const unkeepable = keepTables.filter((tag) => !KEEPABLE_TABLES.includes(paddedTag(tag)));
  if (unkeepable.length > 0) {
    throw new Error(
      `Invalid tag(s) in keepTables: ${quoted(unkeepable)}. keepTables brings back tables HarfBuzz drops whose data refers to no glyph id, and gasp: ${KEEPABLE_TABLES.join(", ")}. The other hinting tables follow the hinting option`,
    );
  }
  const dropped = new Set(
    Array.isArray(dropTables) ? dropTables.map((tag) => paddedTag(String(tag))) : [],
  );
  const both = keepTables.filter((tag) => dropped.has(paddedTag(tag)));
  if (both.length > 0) {
    throw new Error(`keepTables and dropTables both name: ${quoted(both)}`);
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

function assertNameLanguages(nameLanguages: unknown): void {
  if (nameLanguages === "all") {
    return;
  }
  if (!Array.isArray(nameLanguages)) {
    throw new TypeError('nameLanguages must be "all" or an array of language ids');
  }
  const invalid = nameLanguages.filter(
    (id) => !Number.isInteger(id) || (id as number) < 0 || (id as number) > MAX_LANGUAGE_ID,
  );
  if (invalid.length > 0) {
    throw new Error(
      `Invalid name language(s): ${quoted(invalid)}. A language id is an integer from 0 to ${MAX_LANGUAGE_ID}, e.g. 0x409 (1033) for English (United States)`,
    );
  }
}

/**
 * Throws on optimization options of the wrong type or out of range. Every engine checks them,
 * also those it ignores, so a typo fails where it was made.
 */
export function assertOptimizationOptions(option: Readonly<Record<string, unknown>>): void {
  const {
    preset,
    hinting,
    layoutFeatures,
    nameIds,
    nameLanguages,
    dropTables,
    keepTables,
    glyphNames,
    desubroutinize,
    rename,
    axes,
    transform,
  } = option;
  if (preset !== undefined && !Object.hasOwn(PRESETS, preset as string)) {
    throw new Error(
      `Invalid preset: ${JSON.stringify(preset)}. Valid presets: ${Object.keys(PRESETS).join(", ")}`,
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
  if (nameLanguages !== undefined) {
    assertNameLanguages(nameLanguages);
  }
  if (dropTables !== undefined) {
    assertTags("dropTables", dropTables);
    assertDroppable(dropTables as string[]);
  }
  if (keepTables !== undefined) {
    assertTags("keepTables", keepTables);
    assertKeepable(keepTables as string[], dropTables);
  }
  if (glyphNames !== undefined && typeof glyphNames !== "boolean") {
    throw new TypeError("glyphNames must be a boolean");
  }
  if (desubroutinize !== undefined && typeof desubroutinize !== "boolean") {
    throw new TypeError("desubroutinize must be a boolean");
  }
  assertRenameOption(rename, axes as Axes | undefined);
  if (transform !== undefined && typeof transform !== "function") {
    throw new TypeError("transform must be a function");
  }
}
