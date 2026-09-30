import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tagNumber } from "../font/sfnt";

/** Flags of `hb_subset_input_set_flags`, from hb-subset.h. */
export const SubsetFlag = {
  NO_HINTING: 0x1,
  RETAIN_GIDS: 0x2,
  GLYPH_NAMES: 0x80,
  NO_LAYOUT_CLOSURE: 0x2_00,
} as const;

/** What to keep of a font; unset sets keep the HarfBuzz defaults. */
export interface SubsetInput {
  /** Code points to keep, with the glyphs the cmap maps them to; `*` keeps every one. */
  readonly unicodes?: "*" | Iterable<number>;
  /** Glyph ids to keep; `*` keeps every glyph. */
  readonly glyphs?: "*" | Iterable<number>;
  /** `SubsetFlag` values or-ed together, added to the default flags. */
  readonly flags?: number;
  /** Layout features to keep: `*` for all of them, else the tags of the kept ones. */
  readonly layoutFeatures?: "*" | readonly string[];
  /** Tags of tables to drop on top of the tables HarfBuzz drops by default. */
  readonly dropTables?: readonly string[];
  /** Name ids to keep instead of the default 0-6. */
  readonly nameIds?: readonly number[];
  /** Language ids of the Windows and Unicode name records to keep instead of the default 0x409. */
  readonly nameLanguages?: readonly number[];
}

// Neither the ES lib nor @types/node declares WebAssembly; this is the one call made here
declare const WebAssembly: {
  instantiate: (bytes: Uint8Array) => Promise<{ instance: { exports: unknown } }>;
};

// Sets of hb_subset_input_set(), the hb_subset_sets_t enum
const SETS_DROP_TABLE_TAG = 3;
const SETS_NAME_ID = 4;
const SETS_NAME_LANG_ID = 5;
const SETS_LAYOUT_FEATURE_TAG = 6;
const MEMORY_MODE_WRITABLE = 2;

/** The exports of harfbuzz-subset.wasm this module calls; pointers and handles are numbers. */
interface HbSubsetExports {
  readonly memory: { readonly buffer: ArrayBuffer };
  _initialize: () => void;
  malloc: (size: number) => number;
  free: (pointer: number) => void;
  hb_blob_create: (
    data: number,
    length: number,
    mode: number,
    userData: number,
    destroy: number,
  ) => number;
  hb_blob_destroy: (blob: number) => void;
  hb_blob_get_data: (blob: number, length: number) => number;
  hb_blob_get_length: (blob: number) => number;
  hb_face_create: (blob: number, index: number) => number;
  hb_face_destroy: (face: number) => void;
  hb_face_reference_blob: (face: number) => number;
  hb_set_add: (set: number, value: number) => void;
  hb_set_clear: (set: number) => void;
  hb_set_invert: (set: number) => void;
  hb_subset_input_create_or_fail: () => number;
  hb_subset_input_destroy: (input: number) => void;
  hb_subset_input_unicode_set: (input: number) => number;
  hb_subset_input_glyph_set: (input: number) => number;
  hb_subset_input_set: (input: number, set: number) => number;
  hb_subset_input_get_flags: (input: number) => number;
  hb_subset_input_set_flags: (input: number, flags: number) => void;
  hb_subset_or_fail: (face: number, input: number) => number;
}

async function instantiate(): Promise<HbSubsetExports> {
  // The package exports its wasm files; resolved next to this module, in src or in dist
  const wasmPath = createRequire(import.meta.url).resolve("harfbuzzjs/dist/harfbuzz-subset.wasm");
  const { instance } = await WebAssembly.instantiate(await readFile(wasmPath));
  const hb = instance.exports as HbSubsetExports;
  // oxlint-disable-next-line no-underscore-dangle -- the name of the export
  hb._initialize();
  return hb;
}

let loading: Promise<HbSubsetExports> | undefined;

/** The WebAssembly module, instantiated on first use; a failed load is tried again next time. */
function loadHbSubset(): Promise<HbSubsetExports> {
  loading ??= instantiate().catch((error: unknown) => {
    loading = undefined;
    throw error;
  });
  return loading;
}

function addAll(hb: HbSubsetExports, set: number, values: Iterable<number>): void {
  for (const value of values) {
    hb.hb_set_add(set, value);
  }
}

/** Fills an empty set with the values, or with every value for `*`. */
function fill(hb: HbSubsetExports, set: number, values: "*" | Iterable<number>): void {
  if (values === "*") {
    hb.hb_set_invert(set);
  } else {
    addAll(hb, set, values);
  }
}

/** Replaces the HarfBuzz default values of a set. */
function replace(hb: HbSubsetExports, set: number, values: "*" | Iterable<number>): void {
  hb.hb_set_clear(set);
  fill(hb, set, values);
}

function configure(hb: HbSubsetExports, input: number, options: SubsetInput): void {
  fill(hb, hb.hb_subset_input_unicode_set(input), options.unicodes ?? []);
  fill(hb, hb.hb_subset_input_glyph_set(input), options.glyphs ?? []);
  if (options.flags) {
    hb.hb_subset_input_set_flags(input, hb.hb_subset_input_get_flags(input) | options.flags);
  }
  if (options.layoutFeatures) {
    const { layoutFeatures } = options;
    replace(
      hb,
      hb.hb_subset_input_set(input, SETS_LAYOUT_FEATURE_TAG),
      layoutFeatures === "*" ? "*" : layoutFeatures.map((tag) => tagNumber(tag)),
    );
  }
  if (options.dropTables) {
    addAll(
      hb,
      hb.hb_subset_input_set(input, SETS_DROP_TABLE_TAG),
      options.dropTables.map(tagNumber),
    );
  }
  if (options.nameIds) {
    replace(hb, hb.hb_subset_input_set(input, SETS_NAME_ID), options.nameIds);
  }
  if (options.nameLanguages) {
    replace(hb, hb.hb_subset_input_set(input, SETS_NAME_LANG_ID), options.nameLanguages);
  }
}

/** Copies the font into WebAssembly memory and subsets the face made of it. */
function subsetFace(hb: HbSubsetExports, font: Uint8Array, input: number): Uint8Array {
  const data = hb.malloc(font.byteLength);
  if (data === 0) {
    throw new Error("Cannot subset the font: out of WebAssembly memory");
  }
  // Memory can grow on every call into the module and detach older views, so each use takes a new one
  new Uint8Array(hb.memory.buffer).set(font, data);
  const blob = hb.hb_blob_create(data, font.byteLength, MEMORY_MODE_WRITABLE, 0, 0);
  const face = hb.hb_face_create(blob, 0);
  hb.hb_blob_destroy(blob);
  try {
    const subset = hb.hb_subset_or_fail(face, input);
    if (subset === 0) {
      throw new Error("HarfBuzz could not subset the font, it may be malformed");
    }
    const result = hb.hb_face_reference_blob(subset);
    try {
      const length = hb.hb_blob_get_length(result);
      if (length === 0) {
        throw new Error("HarfBuzz could not subset the font, it may be malformed");
      }
      const offset = hb.hb_blob_get_data(result, 0);
      return new Uint8Array(hb.memory.buffer).slice(offset, offset + length);
    } finally {
      hb.hb_blob_destroy(result);
      hb.hb_face_destroy(subset);
    }
  } finally {
    hb.hb_face_destroy(face);
    hb.free(data);
  }
}

/**
 * Subsets an uncompressed sfnt font with hb-subset from harfbuzzjs. The call runs synchronously
 * once the module is loaded, so concurrent calls never share its memory mid-subset.
 */
export async function hbSubset(font: Uint8Array, options: SubsetInput): Promise<Uint8Array> {
  const hb = await loadHbSubset();
  const input = hb.hb_subset_input_create_or_fail();
  if (input === 0) {
    throw new Error("Cannot subset the font: out of WebAssembly memory");
  }
  try {
    configure(hb, input, options);
    return subsetFace(hb, font, input);
  } finally {
    hb.hb_subset_input_destroy(input);
  }
}
