/**
 * What the browser checks: each font case is an extract() call on one of the sources of
 * generate.mjs, and each browser call is a call of the fontext/browser entry.
 *
 * Icon cases draw every glyph of the output (`required` lists texts that must be among them),
 * subset and convert cases draw their `samples`. A case of the variable font with a
 * `referenceLocation` is drawn against the static font generate.mjs builds at that location,
 * with the deltas applied by hand instead of by HarfBuzz.
 */

const char = (codePoint) => String.fromCodePoint(codePoint);

// The legacy kern table of the text font kerns these pairs, see test/kerning.spec.ts
const KERNED_TEXT = "Ye Fa P. W, V.";
// The variable font has these glyphs, kerns A V and forms the fi ligature
const VARIABLE_TEXT = "AVa fi";
const TEXT_SAMPLE = "Hello, World!";

export const sample = (text, extra = {}) => ({
  text,
  referenceScale: 1,
  expect: "match",
  ...extra,
});

const ICON_CASES = [
  {
    id: "icon-material",
    title: "Icon: Material Icons ligatures, raws, ranges and non-BMP",
    source: "material",
    option: {
      ligatures: ["home", "search", "fiber_manual_record", "arrow_back"],
      raws: [char(0xe8_b8)],
      unicodeRanges: ["U+E000-U+E004", "U+10FFFD"],
    },
    required: ["home", "search", "fiber_manual_record", "arrow_back", "settings", char(0x10_ff_fd)],
  },
  {
    id: "icon-material-woff2-input",
    title: "Icon: WOFF2 input",
    source: "materialWoff2",
    option: { ligatures: ["home", "star"] },
    required: ["home", "star"],
  },
  {
    id: "icon-material-woff-input",
    title: "Icon: WOFF input",
    source: "materialWoff",
    option: { ligatures: ["home", "star"] },
    required: ["home", "star"],
  },
  {
    id: "icon-cff",
    title: "Icon: CFF outlines with per-glyph vertical advances (vmtx)",
    source: "cff",
    option: { ligatures: ["fi", "xy", "x", "y"], unicodeRanges: ["U+0066"] },
    required: ["fi", "xy", "x", "y", "f"],
    // The boxes of x and y differ by an inset of 10 of 1000 units: the drawings must tell them apart
    controls: [sample("x", { referenceText: "y", referenceScale: 1000 / 900, expect: "mismatch" })],
  },
  {
    id: "icon-multi-lookup",
    title: "Icon: ligatures from several GSUB lookups, subtables and an extension lookup",
    source: "multiLookup",
    option: { ligatures: ["abc", "def", "ghi", "jkl"] },
    required: ["abc", "def", "ghi", "jkl"],
  },
  {
    id: "icon-text-xml-reserved",
    title: 'Icon: characters XML reserves (" & < >) in a text font',
    source: "text",
    option: { unicodeRanges: ["U+0022-U+0026", "U+003C-U+003E"] },
    required: ['"', "&", "<", ">"],
  },
  {
    id: "icon-variable-pinned",
    title: "Icon: variable font pinned to wght 700",
    source: "variable",
    option: { ligatures: ["fi"], unicodeRanges: ["U+0041"], axes: { wght: 700 } },
    referenceLocation: { wght: 700 },
    required: ["fi", "A"],
  },
  {
    id: "icon-safari-fix",
    title: "Icon: safariFix vertical metrics",
    source: "material",
    option: { ligatures: ["home", "search"], safariFix: true },
    required: ["home", "search"],
  },
];

const SUBSET_CASES = [
  {
    id: "subset-text-kerning",
    title: "Subset: text font with legacy kern table",
    engine: "subset",
    source: "text",
    option: { characters: `${TEXT_SAMPLE} ${KERNED_TEXT}` },
    samples: [
      sample(TEXT_SAMPLE),
      sample(KERNED_TEXT, { kerned: true }),
      // The subset has no q, so the browser draws it with a fallback font
      sample("q", { expect: "mismatch" }),
    ],
  },
  {
    id: "subset-text-safari-fix",
    title: "Subset: safariFix vertical metrics",
    engine: "subset",
    source: "text",
    option: { characters: TEXT_SAMPLE, safariFix: true },
    samples: [sample(TEXT_SAMPLE)],
  },
  {
    id: "subset-cff-features",
    title: "Subset: CFF font keeps liga and calt (contextual) ligatures",
    engine: "subset",
    source: "cff",
    option: { characters: "fixyz" },
    samples: [sample("fi"), sample("xy"), sample("yzx"), sample("yz"), sample("fixyz")],
  },
  {
    id: "subset-material-ligatures",
    title: "Subset: Material Icons ligatures still form",
    engine: "subset",
    source: "material",
    option: { ligatures: ["home", "search"] },
    samples: [sample("home"), sample("search"), sample("home search")],
  },
  {
    id: "subset-variable-pinned",
    title: "Subset: variable font pinned to wght 700 and wdth 75, renamed",
    engine: "subset",
    source: "variable",
    option: { characters: VARIABLE_TEXT, axes: { wght: 700, wdth: 75 }, rename: true },
    referenceLocation: { wght: 700, wdth: 75 },
    samples: [sample(VARIABLE_TEXT), sample("AV", { kerned: true })],
  },
  {
    id: "subset-variable-unpinned-control",
    title: "Subset: the default instance differs from the wght 700 reference (control)",
    engine: "subset",
    source: "variable",
    option: { characters: VARIABLE_TEXT },
    referenceLocation: { wght: 700 },
    samples: [sample("AVa", { expect: "mismatch" })],
  },
  {
    id: "subset-text-outline-render",
    title: "Subset: outline-render preset, hinting dropped, legacy kerning kept",
    engine: "subset",
    source: "text",
    option: { characters: `${TEXT_SAMPLE} ${KERNED_TEXT}`, preset: "outline-render" },
    samples: [sample(TEXT_SAMPLE), sample(KERNED_TEXT, { kerned: true })],
  },
  {
    id: "subset-material-woff2-input",
    title: "Subset: WOFF2 input",
    engine: "subset",
    source: "materialWoff2",
    option: { ligatures: ["star"] },
    samples: [sample("star")],
  },
];

const CONVERT_CASES = [
  {
    id: "convert-text",
    title: "Convert: text font to every format",
    engine: "convert",
    source: "text",
    option: {},
    samples: [
      sample("The quick brown fox jumps over the lazy dog 0123456789"),
      sample(KERNED_TEXT, { kerned: true }),
    ],
  },
  {
    id: "convert-text-safari-fix",
    title: "Convert: safariFix vertical metrics",
    engine: "convert",
    source: "text",
    option: { safariFix: true },
    samples: [sample(TEXT_SAMPLE)],
  },
  {
    id: "convert-cff",
    title: "Convert: CFF font (WOFF keeps the OTTO flavor)",
    engine: "convert",
    source: "cff",
    option: {},
    samples: [sample("fi"), sample("xy"), sample("yzx"), sample("fixyz")],
  },
  {
    id: "convert-variable-range",
    title: "Convert: variable font narrowed to wght 600-700, drawn at its new default 600",
    engine: "convert",
    source: "variable",
    option: { axes: { wght: { min: 600, max: 700 } } },
    referenceLocation: { wght: 600 },
    samples: [sample(VARIABLE_TEXT)],
  },
  {
    id: "convert-cff-web-font",
    title: "Convert: CFF font with the web-font preset, desubroutinized",
    engine: "convert",
    source: "cff",
    option: { preset: "web-font" },
    samples: [sample("fi"), sample("xy"), sample("yzx"), sample("fixyz")],
  },
  {
    id: "convert-material-woff2-input",
    title: "Convert: Material Icons from WOFF2",
    engine: "convert",
    source: "materialWoff2",
    option: { formats: ["ttf", "woff", "woff2"] },
    samples: [sample("home"), sample("search")],
  },
];

export const FONT_CASES = [...ICON_CASES, ...SUBSET_CASES, ...CONVERT_CASES];

/** Label, source key and file name of each input of the browser entry calls. */
export const BROWSER_INPUTS = [
  ["material TTF", "material", "font.ttf"],
  ["material WOFF", "materialWoff", "font.woff"],
  ["material WOFF2", "materialWoff2", "font.woff2"],
  ["CFF OTF", "cff", "font-cff-features.otf"],
  ["multi-lookup TTF", "multiLookup", "font-multi-ligature-lookups.ttf"],
  ["variable TTF", "variable", "font-variable.ttf"],
];

export const BROWSER_CALLS = [
  ["material TTF", { name: "findMetaByLigatures", ligatures: ["home", "search"] }],
  ["material TTF", { name: "findMetaByCodePoints", codePoints: [0xe8_8a, 0x10_ff_fd] }],
  ["material TTF", { name: "findLigaturesByRaws", raws: [char(0xe8_8a), char(0xe8_b6)] }],
  ["material WOFF", { name: "findMetaByLigatures", ligatures: ["home", "search"] }],
  ["material WOFF", { name: "createFont" }],
  // The browser entry has no WOFF2 decoder and must reject it
  ["material WOFF2", { name: "createFont" }],
  ["CFF OTF", { name: "findMetaByLigatures", ligatures: ["fi", "xy", "yzx"] }],
  [
    "multi-lookup TTF",
    { name: "findLigaturesByRaws", raws: [char(0xe0_01), char(0xe0_02), char(0xe0_03)] },
  ],
  ["variable TTF", { name: "findMissingCodePoints", text: `AV\nЖ${char(0x1_f6_00)}fi` }],
  ["variable TTF", { name: "createFont" }],
];
