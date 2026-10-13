import { types } from "node:util";
import type { FontInput } from "./types";

/** The bytes of a font input as a Buffer; the data of a Buffer or typed array is not copied. */
export function toBuffer(input: FontInput): Buffer {
  if (Buffer.isBuffer(input)) {
    return input;
  }
  if (ArrayBuffer.isView(input)) {
    return Buffer.from(input.buffer, input.byteOffset, input.byteLength);
  }
  if (types.isAnyArrayBuffer(input)) {
    return Buffer.from(input);
  }
  throw new TypeError("Font input must be a Buffer, Uint8Array or ArrayBuffer");
}
