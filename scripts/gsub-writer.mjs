/**
 * Builders for GSUB tables of test fixtures: ligature and chained context substitutions, plain
 * or wrapped in extension lookups, under a single DFLT script. Glyphs are given by id.
 */

import { off16, off32, struct, tag, u16, u16s } from "./sfnt-writer.mjs";

// GSUB lookup types: https://learn.microsoft.com/typography/opentype/spec/gsub
export const LIGATURE_LOOKUP = 4;
export const CHAINED_CONTEXT_LOOKUP = 6;
const EXTENSION_LOOKUP = 7;
const NO_REQUIRED_FEATURE = 0xff_ff;

const coverage = (glyphIds) => struct(u16(1), u16(glyphIds.length), u16s(glyphIds));

/** A count, then a coverage offset for each position of a context sequence. */
const coverages = (positions) => [
  u16(positions.length),
  positions.map((glyphIds) => off16(coverage(glyphIds.toSorted((a, b) => a - b)))),
];

function ligatureSet(ligatures) {
  return struct(
    u16(ligatures.length),
    ligatures.map(({ components: [, ...rest], glyph }) =>
      off16(struct(u16(glyph), u16(rest.length + 1), u16s(rest))),
    ),
  );
}

/** LigatureSubstFormat1 from `{ components, glyph }` records, one set per first component. */
export function ligatureSubst(ligatures) {
  const firstGlyphs = [...new Set(ligatures.map(({ components }) => components[0]))].toSorted(
    (a, b) => a - b,
  );
  const sets = firstGlyphs.map((first) =>
    ligatures.filter(({ components }) => components[0] === first),
  );
  return struct(
    u16(1),
    off16(coverage(firstGlyphs)),
    u16(sets.length),
    sets.map((set) => off16(ligatureSet(set))),
  );
}

/**
 * ChainedSequenceContextFormat3: `backtrack`, `input` and `lookahead` hold the glyphs allowed at
 * each position; `lookups` holds [input position, lookup index] pairs applied on a match.
 */
export function chainedContextSubst({ backtrack = [], input, lookahead = [], lookups }) {
  return struct(
    u16(3),
    coverages(backtrack),
    coverages(input),
    coverages(lookahead),
    u16(lookups.length),
    lookups.map((record) => u16s(record)),
  );
}

export function lookup(type, subTables, { extension = false } = {}) {
  const wrap = (table) => (extension ? struct(u16(1), u16(type), off32(table)) : table);
  return struct(
    u16s([extension ? EXTENSION_LOOKUP : type, 0, subTables.length]),
    subTables.map((table) => off16(wrap(table))),
  );
}

/** `features` maps a feature tag to the indices of its lookups in `lookups`. */
export function gsub({ features, lookups }) {
  // FeatureList records must be sorted by tag
  const sorted = Object.entries(features).toSorted(([a], [b]) => (a < b ? -1 : 1));
  const featureIndices = sorted.map((_, index) => index);
  const langSys = struct(u16s([0, NO_REQUIRED_FEATURE, sorted.length, ...featureIndices]));
  const script = struct(off16(langSys), u16(0));
  const scriptList = struct(u16(1), tag("DFLT"), off16(script));
  const featureRecords = sorted.map(([featureTag, indices]) => {
    const feature = struct(u16s([0, indices.length, ...indices]));
    return [tag(featureTag), off16(feature)];
  });
  const featureList = struct(u16(sorted.length), featureRecords);
  const lookupList = struct(
    u16(lookups.length),
    lookups.map((table) => off16(table)),
  );
  return struct(u16(1), u16(0), off16(scriptList), off16(featureList), off16(lookupList));
}
