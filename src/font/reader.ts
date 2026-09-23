/** Big-endian reads from font data that fail with a clear error instead of reading past the end. */
export interface BinaryReader {
  readonly length: number;
  uint16: (offset: number) => number;
  int16: (offset: number) => number;
  uint32: (offset: number) => number;
  int32: (offset: number) => number;
  tag: (offset: number) => string;
  bytes: (offset: number, length: number) => Uint8Array;
}

/** `name` goes into error messages, e.g. "GSUB table" or "WOFF file". */
export function createReader(data: Uint8Array, name: string): BinaryReader {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);

  const check = (offset: number, size: number): number => {
    if (!Number.isInteger(offset) || offset < 0 || offset + size > data.byteLength) {
      throw new Error(
        `Malformed ${name}: cannot read ${size} bytes at offset ${offset}, it is ${data.byteLength} bytes long`,
      );
    }
    return offset;
  };

  return {
    length: data.byteLength,
    uint16: (offset) => view.getUint16(check(offset, 2)),
    int16: (offset) => view.getInt16(check(offset, 2)),
    uint32: (offset) => view.getUint32(check(offset, 4)),
    int32: (offset) => view.getInt32(check(offset, 4)),
    tag: (offset) => String.fromCodePoint(...data.subarray(check(offset, 4), offset + 4)),
    bytes: (offset, length) => data.subarray(check(offset, length), offset + length),
  };
}
