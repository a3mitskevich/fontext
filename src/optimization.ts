import { type Engine, Format, type Formats, type MinifyOption } from "./types";

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
}

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

/** Options every engine reads the same way; an engine that has no such option leaves it out. */
interface OptimizationFields {
  readonly formats?: readonly Formats[];
  readonly hinting?: boolean;
  readonly layoutFeatures?: "all" | "default" | readonly string[];
  readonly nameIds?: readonly number[];
  readonly dropTables?: readonly string[];
}

/** Resolves the options of an extraction to what it keeps. The options must be valid. */
export function resolveOptimization(option: MinifyOption): Optimization {
  const fields: OptimizationFields = option;
  const { layoutFeatures = "all" } = fields;
  return {
    formats: fields.formats ?? DEFAULT_FORMATS[option.engine ?? "icon"],
    hinting: fields.hinting ?? true,
    layoutFeatures:
      typeof layoutFeatures === "string"
        ? layoutFeatures
        : layoutFeatures.map((tag) => paddedTag(tag)),
    nameIds: fields.nameIds,
    dropTables: (fields.dropTables ?? []).map((tag) => paddedTag(tag)),
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
  const { hinting, layoutFeatures, nameIds, dropTables } = option;
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
  }
}
