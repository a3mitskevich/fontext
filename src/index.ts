import type extract from "./extract";

export { default, default as extract } from "./extract";
export {
  Format,
  type Formats,
  type MinifyOption,
  type IconOption,
  type SubsetOption,
  type ConvertOption,
  type ExtractedResult,
  type OptimizationReport,
  type Engine,
  type FontInput,
} from "./types";
export type Extract = typeof extract;
