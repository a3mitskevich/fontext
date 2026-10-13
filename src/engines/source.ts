import type { Axes } from "../types";
import { toSfnt } from "../font/container";
import { decodeWoff2 } from "../woff2";
import { instanceFont } from "./instance";

/** The font an engine reads, and the input the report compares the output with. */
export interface SourceFont {
  /** The input uncompressed, instanced when axes are set. */
  readonly content: Buffer;
  /** The input as given. */
  readonly input: Buffer;
}

const toBuffer = (data: Uint8Array): Buffer =>
  Buffer.from(data.buffer, data.byteOffset, data.byteLength);

/** Reads the input once: WOFF and WOFF2 are decompressed, a variable font instanced. */
export async function loadSource(input: Buffer, axes: Axes | undefined): Promise<SourceFont> {
  const sfnt = await toSfnt(input, decodeWoff2);
  const isInstanced = axes !== undefined && Object.keys(axes).length > 0;
  return { input, content: toBuffer(isInstanced ? await instanceFont(sfnt, axes) : sfnt) };
}
