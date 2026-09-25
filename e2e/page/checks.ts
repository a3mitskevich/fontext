import type { CheckResult, FontCase, LoadableFormat, Metrics, Sample } from "../manifest";
import {
  BOX_TOLERANCE_PX,
  canvasWidth,
  compare,
  type Comparison,
  drawSvgGlyph,
  drawText,
  FONT_SIZE,
  MAX_MISMATCH,
  PATH_BOX_TOLERANCE_PX,
  measure,
  mismatchRatio,
  SVG_UNITS_PER_EM,
} from "./raster";

/** A check with the drawings behind it, so the report can show what was compared. */
export interface Check extends CheckResult {
  comparison?: Comparison;
}

const LOADABLE_FORMATS: LoadableFormat[] = ["ttf", "woff", "woff2", "eot"];
/**
 * The icon engine truncates advances to whole units of its 1000 unit em, and Firefox rounds
 * advances to whole pixels.
 */
const ADVANCE_TOLERANCE_PX = 1 + FONT_SIZE / 1000;
/** Browsers round ascent and descent to whole pixels. */
const METRICS_TOLERANCE_PX = 1.5;
/** A kerned pair moves its glyphs by far more than this at FONT_SIZE. */
const KERNING_MIN_PX = 2;
/**
 * Gecko on macOS takes the line gap of `line-height: normal` from elsewhere than the patched hhea
 * and OS/2 tables, so only Chromium and WebKit are held to the typo line height.
 */
const IS_GECKO = navigator.userAgent.includes("Firefox/");
const GECKO_LINE_GAP = "not asserted in Firefox, which ignores the patched line gap";
const EOT_SIZE_OFFSET = 0;
const EOT_FONT_DATA_SIZE_OFFSET = 4;

const pass = (name: string, detail = ""): Check => ({ name, passed: true, detail });
const fail = (name: string, detail: string): Check => ({ name, passed: false, detail });
const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

async function fetchBytes(path: string): Promise<ArrayBuffer> {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`GET ${path}: ${response.status}`);
  }
  return response.arrayBuffer();
}

/** The TrueType font an EOT wraps: its last FontDataSize bytes, stored uncompressed by ttf2eot. */
function eotPayload(eot: ArrayBuffer): ArrayBuffer {
  const view = new DataView(eot);
  const eotSize = view.getUint32(EOT_SIZE_OFFSET, true);
  const fontDataSize = view.getUint32(EOT_FONT_DATA_SIZE_OFFSET, true);
  if (eotSize !== eot.byteLength || fontDataSize > eotSize) {
    throw new Error(
      `EOT header sizes ${eotSize}/${fontDataSize} don't fit ${eot.byteLength} bytes`,
    );
  }
  return eot.slice(eotSize - fontDataSize);
}

async function loadFace(family: string, data: ArrayBuffer): Promise<void> {
  const face = new FontFace(family, data);
  await face.load();
  document.fonts.add(face);
}

const quoted = (text: string): string => JSON.stringify(text);

function shapeCheck(
  name: string,
  sample: Sample,
  comparison: Comparison,
  boxTolerance = BOX_TOLERANCE_PX,
): Check {
  const ratio = mismatchRatio(comparison);
  const box = Number.isFinite(comparison.boxShift)
    ? `ink box off by ${comparison.boxShift}px`
    : "one drawing is blank";
  const detail = `${(ratio * 100).toFixed(2)}% of ${comparison.covered} covered pixels differ, ${box}`;
  const matches = ratio <= MAX_MISMATCH && comparison.boxShift <= boxTolerance;
  const passed = sample.expect === "match" ? matches : !matches;
  const expectation = sample.expect === "match" ? "should match" : "should differ";
  return { name, passed, detail: `${detail} (${expectation})`, comparison };
}

function advanceCheck(name: string, actual: number, expected: number): Check {
  const detail = `${actual.toFixed(2)}px, source ${expected.toFixed(2)}px`;
  return Math.abs(actual - expected) <= ADVANCE_TOLERANCE_PX
    ? pass(name, detail)
    : fail(name, detail);
}

/** Draws each sample with the output font and with the source font and compares. */
function sampleChecks(label: string, family: string, reference: string, sample: Sample): Check[] {
  const referenceText = sample.referenceText ?? sample.text;
  const referenceSize = FONT_SIZE * sample.referenceScale;
  const outputAdvance = measure(family, FONT_SIZE, sample.text).width;
  const referenceAdvance = measure(reference, referenceSize, referenceText).width;
  const width = canvasWidth(Math.max(outputAdvance, referenceAdvance));
  const comparison = compare(
    drawText(reference, referenceSize, referenceText, width),
    drawText(family, FONT_SIZE, sample.text, width),
  );
  const checks = [shapeCheck(`${label} shape ${quoted(sample.text)}`, sample, comparison)];
  if (sample.expect === "match") {
    checks.push(
      advanceCheck(`${label} advance ${quoted(sample.text)}`, outputAdvance, referenceAdvance),
    );
  }
  return checks;
}

/** The source font must kern the sample in this browser, or the width check can't see lost kerning. */
function kerningCheck(reference: string, sample: Sample): Check {
  const name = `source kerns ${quoted(sample.text)}`;
  const whole = measure(reference, FONT_SIZE, sample.text).width;
  const parts = [...sample.text].reduce(
    (sum, char) => sum + measure(reference, FONT_SIZE, char).width,
    0,
  );
  const detail = `kerned ${whole.toFixed(2)}px, unkerned ${parts.toFixed(2)}px`;
  return Math.abs(parts - whole) >= KERNING_MIN_PX ? pass(name, detail) : fail(name, detail);
}

function lineHeight(family: string, text: string): number {
  const block = document.createElement("div");
  block.style.cssText = `position:absolute;visibility:hidden;font:${FONT_SIZE}px "${family}";line-height:normal;white-space:nowrap`;
  block.textContent = text;
  document.body.append(block);
  const { height } = block.getBoundingClientRect();
  block.remove();
  return height;
}

/** Metrics of text the font maps: a character it lacks brings in the line box of a fallback font. */
function metricsChecks(label: string, family: string, text: string, expected: Metrics): Check[] {
  const metrics = measure(family, FONT_SIZE, text);
  const within = (name: string, actual: number, em: number): Check => {
    const detail = `${actual.toFixed(2)}px, expected ${(em * FONT_SIZE).toFixed(2)}px`;
    return Math.abs(actual - em * FONT_SIZE) <= METRICS_TOLERANCE_PX
      ? pass(`${label} ${name}`, detail)
      : fail(`${label} ${name}`, detail);
  };
  const lineGapChecked = within(
    "line height",
    lineHeight(family, text),
    expected.ascent + expected.descent + expected.lineGap,
  );
  return [
    within("ascent", metrics.fontBoundingBoxAscent, expected.ascent),
    within("descent", metrics.fontBoundingBoxDescent, expected.descent),
    IS_GECKO
      ? pass(lineGapChecked.name, `${lineGapChecked.detail}; ${GECKO_LINE_GAP}`)
      : lineGapChecked,
  ];
}

async function formatChecks(
  fontCase: FontCase,
  format: LoadableFormat,
  reference: string,
): Promise<Check[]> {
  const path = fontCase.outputs[format];
  if (!path) {
    return [];
  }
  const label = format === "eot" ? "eot (wrapped TTF)" : format;
  const family = `out-${fontCase.id}-${format}`;
  try {
    const data = await fetchBytes(path);
    await loadFace(family, format === "eot" ? eotPayload(data) : data);
  } catch (error) {
    return [fail(`${label} loads`, messageOf(error))];
  }
  return [
    pass(`${label} loads`),
    ...fontCase.samples.flatMap((sample) => sampleChecks(label, family, reference, sample)),
    ...(fontCase.metrics
      ? metricsChecks(label, family, fontCase.samples[0].text, fontCase.metrics)
      : []),
  ];
}

function svgGlyphCheck(glyphs: Element[], reference: string, sample: Sample): Check[] {
  const name = `svg glyph ${quoted(sample.text)}`;
  const glyph = glyphs.find((element) => element.getAttribute("unicode") === sample.text);
  if (!glyph) {
    return [fail(name, "no <glyph> element has this unicode")];
  }
  const referenceSize = FONT_SIZE * sample.referenceScale;
  const referenceAdvance = measure(reference, referenceSize, sample.text).width;
  const advance = (Number(glyph.getAttribute("horiz-adv-x")) * FONT_SIZE) / SVG_UNITS_PER_EM;
  const width = canvasWidth(Math.max(advance, referenceAdvance));
  const comparison = compare(
    drawText(reference, referenceSize, sample.text, width),
    drawSvgGlyph(glyph.getAttribute("d") ?? "", FONT_SIZE, width),
  );
  return [
    shapeCheck(`${name} shape`, sample, comparison, PATH_BOX_TOLERANCE_PX),
    advanceCheck(`${name} advance`, advance, referenceAdvance),
  ];
}

/** The SVG font must be well-formed XML with a glyph drawing each sample like the source. */
async function svgChecks(fontCase: FontCase, reference: string): Promise<Check[]> {
  if (!fontCase.outputs.svg) {
    return [];
  }
  const response = await fetch(fontCase.outputs.svg);
  const text = await response.text();
  const document = new DOMParser().parseFromString(text, "image/svg+xml");
  const error = document.querySelector("parsererror");
  if (error) {
    return [fail("svg is well-formed XML", error.textContent ?? "parser error")];
  }
  const glyphs = [...document.querySelectorAll("glyph")];
  return [
    pass("svg is well-formed XML"),
    ...fontCase.svgSamples.flatMap((sample) => svgGlyphCheck(glyphs, reference, sample)),
  ];
}

export async function runFontCase(fontCase: FontCase): Promise<Check[]> {
  const reference = `ref-${fontCase.id}`;
  try {
    await loadFace(reference, await fetchBytes(fontCase.reference));
  } catch (error) {
    return [fail("source font loads", messageOf(error))];
  }
  const checks: Check[] = fontCase.samples
    .filter((sample) => sample.kerned)
    .map((sample) => kerningCheck(reference, sample));
  for (const format of LOADABLE_FORMATS) {
    checks.push(...(await formatChecks(fontCase, format, reference)));
  }
  checks.push(...(await svgChecks(fontCase, reference)));
  return checks;
}
