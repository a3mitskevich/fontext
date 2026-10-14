import type { Axes, TableSizes } from "../types";
import { toSfnt } from "../font/container";
import { openFont, type VariationAxis } from "../font/font";
import { decodeWoff2 } from "../woff2";
import type { InstanceAxes } from "./hb-subset";
import { instanceFont, resolveAxes } from "./instance";
import { tableSizes } from "./report";

/** The font an engine reads, and the input the report compares the output with. */
export interface SourceFont {
  /** The input uncompressed, instanced when axes are set. */
  readonly content: Buffer;
  /** The input as given. */
  readonly input: Buffer;
  /** The tables of the input, decompressed, before instancing. */
  readonly inputTables: TableSizes;
  /** The variation axes of the input; none for a static font. */
  readonly inputAxes: readonly VariationAxis[];
  /**
   * The axes the content was instanced at, "default" and `"*"` resolved to values; empty when it
   * was not instanced.
   */
  readonly axes: InstanceAxes;
}

const toBuffer = (data: Uint8Array): Buffer =>
  Buffer.from(data.buffer, data.byteOffset, data.byteLength);

/** Reads the input once: WOFF and WOFF2 are decompressed, a variable font instanced. */
export async function loadSource(input: Buffer, axes: Axes | undefined): Promise<SourceFont> {
  const sfnt = await toSfnt(input, decodeWoff2);
  const { axes: inputAxes } = await openFont(sfnt);
  const isInstanced = axes !== undefined && Object.keys(axes).length > 0;
  const instanceAxes = isInstanced ? resolveAxes(inputAxes, axes) : {};
  return {
    input,
    inputTables: tableSizes(sfnt),
    inputAxes,
    axes: instanceAxes,
    content: toBuffer(isInstanced ? await instanceFont(sfnt, instanceAxes) : sfnt),
  };
}
