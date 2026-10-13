import type { Axes, AxisSetting, LayoutFeatures, NameLanguages, Preset, Rename } from "./types";

/** The optimization flags of the command line, as `parseArgs` returns them. */
export interface OptimizationFlags {
  readonly preset?: string;
  readonly hinting?: boolean;
  readonly "layout-features"?: string;
  readonly "name-ids"?: string;
  readonly "name-languages"?: string;
  readonly "drop-tables"?: string;
  readonly "keep-tables"?: string;
  readonly "glyph-names"?: boolean;
  readonly desubroutinize?: boolean;
  readonly axes?: string;
  readonly rename?: boolean;
  readonly "rename-family"?: string;
  readonly "rename-style"?: string;
}

/** The optimization keys of `.fontextrc.json` and its batch entries. */
export interface OptimizationConfig {
  readonly preset?: string;
  readonly hinting?: boolean;
  readonly layoutFeatures?: LayoutFeatures;
  readonly nameIds?: number[];
  readonly nameLanguages?: NameLanguages;
  readonly dropTables?: string[];
  readonly keepTables?: string[];
  readonly glyphNames?: boolean;
  readonly desubroutinize?: boolean;
  readonly axes?: Axes;
  readonly rename?: Rename;
}

/** The optimization options handed to `extract()`; `extract()` validates them. */
export interface OptimizationOptions {
  preset?: Preset;
  hinting?: boolean;
  layoutFeatures?: LayoutFeatures;
  nameIds?: number[];
  nameLanguages?: NameLanguages;
  dropTables?: string[];
  keepTables?: string[];
  glyphNames?: boolean;
  desubroutinize?: boolean;
  axes?: Axes;
  rename?: Rename;
}

const INTEGER = /^\d+$/u;
const HEX_INTEGER = /^0x[\da-f]+$/iu;
const NUMBER = /^-?(?:\d+\.?\d*|\.\d+)$/u;
const HEX_RADIX = 16;

/** A comma-separated list without blanks around or between its items. */
const parseList = (value: string): string[] =>
  value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

/** "all", "default" or a comma-separated list of feature tags. */
export function parseLayoutFeatures(value: string): LayoutFeatures {
  const keyword = value.trim();
  return keyword === "all" || keyword === "default" ? keyword : parseList(value);
}

/**
 * Comma-separated name ids. An item that is not a whole number stays a string, so `extract()`
 * names it in its error like any other invalid name id.
 */
export const parseNameIds = (value: string): number[] =>
  parseList(value).map((item) => (INTEGER.test(item) ? Number(item) : item)) as number[];

/** A language id in decimal or hex (0x409); anything else stays a string for extract(). */
function parseLanguageId(item: string): number | string {
  if (HEX_INTEGER.test(item)) {
    return Number.parseInt(item.slice(2), HEX_RADIX);
  }
  return INTEGER.test(item) ? Number(item) : item;
}

/** "all" or comma-separated language ids, e.g. "0x409,0x419". */
export function parseNameLanguages(value: string): NameLanguages {
  return value.trim() === "all"
    ? "all"
    : (parseList(value).map((item) => parseLanguageId(item)) as number[]);
}

/** "700" pins, "600:700" narrows; any other text stays a string for extract() to reject. */
function parseAxisSetting(value: string): AxisSetting {
  const parts = value.split(":").map((part) => part.trim());
  if (parts.length === 1 && NUMBER.test(parts[0])) {
    return Number(parts[0]);
  }
  if (parts.length === 2 && parts.every((part) => NUMBER.test(part))) {
    return { min: Number(parts[0]), max: Number(parts[1]) };
  }
  return value as unknown as AxisSetting;
}

/** Comma-separated axis settings: "wght=700,wdth=75:100". */
export function parseAxes(value: string): Axes {
  return Object.fromEntries(
    parseList(value).map((item) => {
      const [tag, ...setting] = item.split("=");
      return [tag.trim(), parseAxisSetting(setting.join("="))];
    }),
  );
}

/** --rename-family and --rename-style, or --rename alone for the names of the pinned weight. */
function renameOf(flags: OptimizationFlags): Rename | undefined {
  const family = flags["rename-family"];
  const style = flags["rename-style"];
  if (family === undefined && style === undefined) {
    return flags.rename ? true : undefined;
  }
  return {
    ...(family === undefined ? {} : { family }),
    ...(style === undefined ? {} : { style }),
  };
}

/** The parsed value of a flag that was given; undefined for a missing one. */
const parsed = <T>(value: string | undefined, parse: (text: string) => T): T | undefined =>
  value === undefined ? undefined : parse(value);

/** Options of the flags that were given; the others are left out, so the config keys stay. */
function fromFlags(flags: OptimizationFlags): OptimizationConfig {
  const options: OptimizationConfig = {
    preset: flags.preset,
    hinting: flags.hinting,
    layoutFeatures: parsed(flags["layout-features"], parseLayoutFeatures),
    nameIds: parsed(flags["name-ids"], parseNameIds),
    nameLanguages: parsed(flags["name-languages"], parseNameLanguages),
    dropTables: parsed(flags["drop-tables"], parseList),
    keepTables: parsed(flags["keep-tables"], parseList),
    glyphNames: flags["glyph-names"],
    desubroutinize: flags.desubroutinize,
    axes: parsed(flags.axes, parseAxes),
    rename: renameOf(flags),
  };
  return Object.fromEntries(Object.entries(options).filter(([, value]) => value !== undefined));
}

/**
 * The optimization options of a config entry, with the command line flags over them when
 * `useFlags` is set (single mode; batch entries take only their own and the shared keys).
 */
export function resolveOptimizationOptions(
  entry: OptimizationConfig,
  flags: OptimizationFlags,
  useFlags: boolean,
): OptimizationOptions {
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
    axes,
    rename,
  } = { ...entry, ...(useFlags ? fromFlags(flags) : {}) };
  // --no-rename turns off the rename of the config
  const isRenameOff = useFlags && flags.rename === false && renameOf(flags) === undefined;
  // An invalid preset reaches extract(), which rejects it with the valid ones
  return {
    preset: preset as Preset | undefined,
    hinting,
    layoutFeatures,
    nameIds,
    nameLanguages,
    dropTables,
    keepTables,
    glyphNames,
    desubroutinize,
    axes,
    rename: isRenameOff ? undefined : rename,
  };
}
