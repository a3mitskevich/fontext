import fs from "fs";
import path from "path";
import type * as fontext from "../src";
import type { Extract, Formats } from "../src";
import { createCachedImport } from "./utils";

type FontextModule = typeof fontext;

// Dist mirrors src and may not be built yet when types are checked, so it is resolved at runtime only
const DIST_ENTRY = "../dist/index.js";

const importTargets = {
  local: createCachedImport<FontextModule>(() => import("../src")),
  dist: createCachedImport<FontextModule>(() => import(DIST_ENTRY)),
};

const resolve = (format: Formats): string =>
  path.resolve(import.meta.dirname, `../assets/font.${format}`);

export const ttfOriginalFont = fs.readFileSync(resolve("ttf"));
export const woff2OriginalFont = fs.readFileSync(resolve("woff2"));
export const textFont = fs.readFileSync(
  path.resolve(import.meta.dirname, "../assets/font-without-gsub.ttf"),
);
// Ligatures split across GSUB subtables and lookups, see scripts/make-ligature-fixture.mjs
export const multiLookupFont = fs.readFileSync(
  path.resolve(import.meta.dirname, "../assets/font-multi-ligature-lookups.ttf"),
);
// Latin, Greek, Cyrillic, Common and Inherited glyphs, see scripts/make-scripts-fixture.mjs
export const scriptsFont = fs.readFileSync(
  path.resolve(import.meta.dirname, "../assets/font-scripts.ttf"),
);
// CFF outlines, vmtx and ligatures from liga and calt, see scripts/make-cff-fixture.mjs
export const cffFont = fs.readFileSync(
  path.resolve(import.meta.dirname, "../assets/font-cff-features.otf"),
);

/** The module under test, for checks the async `extract` wrapper below would hide. */
export const importFontext = (): Promise<FontextModule> => {
  const testTarget = process.env.TEST_TARGET as keyof typeof importTargets;
  return Promise.resolve(importTargets[testTarget ?? "local"]());
};

export const extract: Extract = async (...args: Parameters<Extract>): ReturnType<Extract> => {
  const { default: index } = await importFontext();
  return index(...args);
};
