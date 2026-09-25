import { compress, decompress } from "wawoff2";

type Woff2Codec = (data: Uint8Array) => Promise<Uint8Array>;

/**
 * The wawoff2 package returns a view of its WebAssembly memory, which the next call of the same
 * function overwrites. The view reaches the caller only after the promise settles, so a concurrent
 * call can run in between. Calls go one at a time, each result copied before the next starts.
 */
function oneAtATime(codec: Woff2Codec): (data: Uint8Array) => Promise<Buffer> {
  let last: Promise<unknown> = Promise.resolve();
  return (data) => {
    const result = last.then(async () => Buffer.from(await codec(data)));
    last = result.catch(() => null);
    return result;
  };
}

/** TrueType or OpenType to WOFF2, through wawoff2. */
export const encodeWoff2 = oneAtATime(compress);

/** WOFF2 to TrueType or OpenType, through wawoff2. */
export const decodeWoff2 = oneAtATime(decompress);
