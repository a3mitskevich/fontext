import fs from "fs";
import path from "path";
import type { Extract, Formats } from "../src";
import { createCachedImport } from "./utils";

const importTargets = {
  local: createCachedImport(() => import("../src")),
  dist: createCachedImport(() => import("../dist")),
};

const resolve = (format: Formats): string => path.resolve(__dirname, `../assets/font.${format}`);

export const ttfOriginalFont = fs.readFileSync(resolve("ttf"));
export const woff2OriginalFont = fs.readFileSync(resolve("woff2"));
export const textFont = fs.readFileSync(path.resolve(__dirname, "../assets/font-without-gsub.ttf"));
// Ligatures split across GSUB subtables and lookups, see scripts/make-ligature-fixture.py
export const multiLookupFont = fs.readFileSync(
  path.resolve(__dirname, "../assets/font-multi-ligature-lookups.ttf"),
);

export const extract: Extract = async (...args: Parameters<Extract>): ReturnType<Extract> => {
  const testTarget = process.env.TEST_TARGET as keyof typeof importTargets;
  const { default: index } = await importTargets[testTarget ?? "local"]();
  return index(...args);
};
