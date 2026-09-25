/**
 * Builds the fonts of every case in cases.mjs with the built package (`dist/`) and writes them
 * with `manifest.json` to e2e/page/public/generated. Run `npm run build` first.
 * The expectations come from the source fonts, never from the fonts under test: the browser
 * draws each sample with the source font and compares.
 */

import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import ttf2woff from "ttf2woff";
import extract from "../dist/index.js";
import {
  createFont,
  findLigaturesByRaws,
  findMetaByCodePoints,
  findMetaByLigatures,
} from "../dist/browser.js";
import { BROWSER_CALLS, BROWSER_INPUTS, FONT_CASES, sample } from "./cases.mjs";

const ASSETS = new URL("../assets/", import.meta.url);
const OUTPUT = new URL("page/public/generated/", import.meta.url);
const FORMATS = ["ttf", "woff", "woff2", "eot", "svg"];
const SFNT_HEADER_SIZE = 12;
const TABLE_RECORD_SIZE = 16;
const HEAD_UNITS_PER_EM = 18;
const OS2_TYPO_ASCENDER = 68;
const OS2_TYPO_DESCENDER = 70;
const OS2_TYPO_LINE_GAP = 72;

const asset = (name) => readFileSync(new URL(name, ASSETS));

/** Inputs of the cases; `file` is the TTF or OTF the browser draws the expected glyphs with. */
const SOURCES = {
  material: { file: "font.ttf", bytes: asset("font.ttf") },
  materialWoff: { file: "font.ttf", bytes: Buffer.from(ttf2woff(asset("font.ttf"))) },
  materialWoff2: { file: "font.ttf", bytes: asset("font.woff2") },
  text: { file: "font-without-gsub.ttf", bytes: asset("font-without-gsub.ttf") },
  cff: { file: "font-cff-features.otf", bytes: asset("font-cff-features.otf") },
  multiLookup: {
    file: "font-multi-ligature-lookups.ttf",
    bytes: asset("font-multi-ligature-lookups.ttf"),
  },
};

function tableOffsets(font) {
  const offsets = new Map();
  for (let index = 0; index < font.readUInt16BE(4); index++) {
    const record = SFNT_HEADER_SIZE + index * TABLE_RECORD_SIZE;
    offsets.set(font.toString("latin1", record, record + 4), font.readUInt32BE(record + 8));
  }
  return offsets;
}

const unitsPerEm = (font) => font.readUInt16BE(tableOffsets(font).get("head") + HEAD_UNITS_PER_EM);

/** The typo ascender, descender and line gap of the OS/2 table, in em units. */
function typoMetrics(font) {
  const os2 = tableOffsets(font).get("OS/2");
  const em = unitsPerEm(font);
  return {
    ascent: font.readInt16BE(os2 + OS2_TYPO_ASCENDER) / em,
    descent: -font.readInt16BE(os2 + OS2_TYPO_DESCENDER) / em,
    lineGap: font.readInt16BE(os2 + OS2_TYPO_LINE_GAP) / em,
  };
}

/** The vertical advance of a glyph SVG: the height of its viewBox. */
const glyphHeight = (meta) => Number(meta.svg.match(/viewBox="[^"]*\s(?<h>[\d.]+)"/u).groups.h);

/**
 * Every character and ligature text of the glyphs, drawn from the source font scaled like the
 * icon engine and the SVG font scale them: the vertical advance of each glyph fills the em.
 */
function scaledSamples(meta, source) {
  const em = unitsPerEm(asset(source.file));
  return meta.flatMap((glyph) =>
    [...new Set([glyph.name, ...glyph.unicode])].map((text) =>
      sample(text, { referenceScale: em / glyphHeight(glyph) }),
    ),
  );
}

/** The characters of the samples as glyphs of the SVG font. */
function characterSamples(meta, samples, source) {
  const characters = new Set(samples.flatMap(({ text }) => [...text]));
  const glyphs = meta.filter((glyph) => glyph.unicode.some((char) => characters.has(char)));
  return scaledSamples(glyphs, source).filter(({ text }) => characters.has(text));
}

function assertCovered(caseId, samples, texts) {
  const missing = texts.filter((text) => !samples.some((item) => item.text === text));
  if (missing.length > 0) {
    throw new Error(`${caseId}: the output has no glyph for ${missing.join(", ")}`);
  }
}

function writeOutputs(caseId, result) {
  mkdirSync(new URL(`${caseId}/`, OUTPUT), { recursive: true });
  const outputs = {};
  for (const format of FORMATS.filter((key) => result[key])) {
    const file = `${caseId}/font.${format}`;
    writeFileSync(new URL(file, OUTPUT), result[format]);
    outputs[format] = `generated/${file}`;
  }
  return outputs;
}

async function buildFontCase(definition) {
  const engine = definition.engine ?? "icon";
  const source = SOURCES[definition.source];
  const option = { fontName: `e2e-${definition.id}`, engine, ...definition.option };
  const result = await extract(source.bytes, option);

  const isIcon = engine === "icon";
  const samples = isIcon
    ? [...scaledSamples(result.meta, source), ...(definition.controls ?? [])]
    : definition.samples;
  assertCovered(definition.id, samples, definition.required ?? []);
  const svgSamples = isIcon
    ? scaledSamples(result.meta, source)
    : characterSamples(result.meta, samples, source);

  return {
    id: definition.id,
    title: definition.title,
    engine,
    option: JSON.stringify({ input: definition.source, ...option }),
    reference: `generated/reference/${source.file}`,
    outputs: writeOutputs(definition.id, result),
    samples,
    svgSamples: result.svg ? svgSamples : [],
    ...(option.safariFix && result.ttf ? { metrics: typoMetrics(result.ttf) } : {}),
  };
}

async function callBrowserEntry(bytes, call) {
  try {
    if (call.name === "findLigaturesByRaws") {
      return { value: await findLigaturesByRaws(bytes, call.raws) };
    }
    const font = await createFont(bytes);
    if (call.name === "findMetaByLigatures") {
      return { value: findMetaByLigatures(font, call.ligatures) };
    }
    if (call.name === "findMetaByCodePoints") {
      return { value: findMetaByCodePoints(font, call.codePoints) };
    }
    return { value: { codePoints: font.codePoints.length } };
  } catch (error) {
    return { error: error.message };
  }
}

/** Each call of the browser entry with what it returns in Node, which the browser must match. */
function buildBrowserCalls() {
  mkdirSync(new URL("browser/", OUTPUT), { recursive: true });
  const inputs = new Map(
    BROWSER_INPUTS.map(([label, key, file]) => {
      writeFileSync(new URL(`browser/${file}`, OUTPUT), SOURCES[key].bytes);
      const bytes = new Uint8Array(SOURCES[key].bytes);
      return [label, { path: `generated/browser/${file}`, bytes }];
    }),
  );
  return Promise.all(
    BROWSER_CALLS.map(async ([label, call]) => ({
      label: `${call.name} (${label})`,
      input: inputs.get(label).path,
      call,
      expected: await callBrowserEntry(inputs.get(label).bytes, call),
    })),
  );
}

rmSync(OUTPUT, { recursive: true, force: true });
mkdirSync(new URL("reference/", OUTPUT), { recursive: true });
for (const { file } of Object.values(SOURCES)) {
  copyFileSync(new URL(file, ASSETS), new URL(`reference/${file}`, OUTPUT));
}

// One case at a time: concurrent extract() calls can corrupt each other's WOFF2 output
const fontCases = [];
for (const definition of FONT_CASES) {
  fontCases.push(await buildFontCase(definition));
}
const manifest = { fontCases, browserCalls: await buildBrowserCalls() };
writeFileSync(new URL("manifest.json", OUTPUT), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(
  `Generated ${fontCases.length} font cases and ${manifest.browserCalls.length} browser entry calls`,
);
