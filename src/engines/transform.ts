import type { FontTransform } from "../types";
import { type ContainerFormat, containerFormat } from "../font/container";
import { checkGlyphTables } from "../font/sfnt";

const CONTAINER_NAMES: Record<Exclude<ContainerFormat, "sfnt">, string> = {
  woff: "WOFF",
  woff2: "WOFF2",
  collection: "a font collection",
};

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

function formatOf(font: Uint8Array): ContainerFormat {
  try {
    return containerFormat(font);
  } catch (error) {
    throw new Error(`transform must return a TrueType or OpenType font: ${messageOf(error)}`, {
      cause: error,
    });
  }
}

/** Throws unless the data is an uncompressed TrueType or OpenType font with whole glyph tables. */
function assertSfnt(font: unknown): asserts font is Uint8Array {
  if (!(font instanceof Uint8Array)) {
    throw new TypeError("transform must return a Uint8Array holding a TrueType or OpenType font");
  }
  const format = formatOf(font);
  if (format !== "sfnt") {
    throw new Error(
      `transform must return an uncompressed TrueType or OpenType font, not ${CONTAINER_NAMES[format]}`,
    );
  }
  try {
    checkGlyphTables(font);
  } catch (error) {
    throw new Error(`transform returned a malformed font: ${messageOf(error)}`, { cause: error });
  }
}

/**
 * Runs the transform hook once on a copy of the final TrueType font and returns a copy of its
 * checked result, or the font itself when there is no hook. A failing hook rejects with its
 * error as the cause.
 */
export async function applyTransform(ttf: Buffer, transform?: FontTransform): Promise<Buffer> {
  if (!transform) {
    return ttf;
  }
  let result: unknown;
  try {
    result = await transform(new Uint8Array(ttf));
  } catch (error) {
    throw new Error(`transform failed: ${messageOf(error)}`, { cause: error });
  }
  assertSfnt(result);
  return Buffer.from(result);
}
