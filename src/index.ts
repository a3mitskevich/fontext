import extract from "./extract";

export {
  type Formats,
  type MinifyOption,
  type ExtractedResult,
  type OptimizationReport,
  type Engine,
  type Formats as Format,
} from "./types";
export type Extract = typeof extract;

export { extract as default, extract };
