import type { LayoutFeatures, Target } from "./types";

/** The optimization flags of the command line, as `parseArgs` returns them. */
export interface OptimizationFlags {
  readonly target?: string;
  readonly hinting?: boolean;
  readonly "layout-features"?: string;
  readonly "name-ids"?: string;
  readonly "drop-tables"?: string;
}

/** The optimization keys of `.fontextrc.json` and its batch entries. */
export interface OptimizationConfig {
  readonly target?: string;
  readonly hinting?: boolean;
  readonly layoutFeatures?: LayoutFeatures;
  readonly nameIds?: number[];
  readonly dropTables?: string[];
}

/** The optimization options handed to `extract()`; `extract()` validates them. */
export interface OptimizationOptions {
  target?: Target;
  hinting?: boolean;
  layoutFeatures?: LayoutFeatures;
  nameIds?: number[];
  dropTables?: string[];
}

const INTEGER = /^\d+$/u;

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

/** Options of the flags that were given, over the config keys. */
function fromFlags(flags: OptimizationFlags): OptimizationConfig {
  const layoutFeatures = flags["layout-features"];
  const nameIds = flags["name-ids"];
  const dropTables = flags["drop-tables"];
  return {
    ...(flags.target === undefined ? {} : { target: flags.target }),
    ...(flags.hinting === undefined ? {} : { hinting: flags.hinting }),
    ...(layoutFeatures === undefined
      ? {}
      : { layoutFeatures: parseLayoutFeatures(layoutFeatures) }),
    ...(nameIds === undefined ? {} : { nameIds: parseNameIds(nameIds) }),
    ...(dropTables === undefined ? {} : { dropTables: parseList(dropTables) }),
  };
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
  const { target, hinting, layoutFeatures, nameIds, dropTables } = {
    ...entry,
    ...(useFlags ? fromFlags(flags) : {}),
  };
  // An invalid target reaches extract(), which rejects it with the valid ones
  return { target: target as Target | undefined, hinting, layoutFeatures, nameIds, dropTables };
}
