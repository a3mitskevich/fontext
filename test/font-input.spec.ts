import { describe, it, expect } from "vitest";
import ttf2woff from "ttf2woff";
import { createFont } from "../src/browser";
import { toCollection, toResourceFork, withTruncatedTable } from "./font-containers";
import { extract, multiLookupFont, textFont, ttfOriginalFont, woff2OriginalFont } from "./setup";

const WOFF_HEADER_SIZE = 44;
const WOFF_TABLE_ENTRY_SIZE = 20;

const toWoff = (font: Buffer): Buffer => Buffer.from(ttf2woff(new Uint8Array(font)));

/** Copies a WOFF font with the zlib header of its first compressed table broken. */
function withCorruptedTable(woff: Buffer): Buffer {
  const entries = Array.from(
    { length: woff.readUInt16BE(12) },
    (_, index) => WOFF_HEADER_SIZE + index * WOFF_TABLE_ENTRY_SIZE,
  );
  const compressed = entries.find(
    (entry) => woff.readUInt32BE(entry + 8) < woff.readUInt32BE(entry + 12),
  );
  if (compressed === undefined) {
    throw new Error("WOFF font has no compressed table");
  }
  const copy = Buffer.from(woff);
  copy.fill(0xff, woff.readUInt32BE(compressed + 4), woff.readUInt32BE(compressed + 4) + 2);
  return copy;
}

const COLLECTION_ERROR =
  "Font collections (TTC/DFONT) are not supported. Provide a single font file.";
const collections = [
  ["TTC", toCollection(textFont)],
  ["DFONT", toResourceFork(textFont)],
] as const;

describe("font input", () => {
  it("should read WOFF like the TrueType font it wraps", async () => {
    const option = { fontName: "woff", ligatures: ["abc", "home"], formats: ["ttf" as const] };
    const fromWoff = await extract(toWoff(ttfOriginalFont), option);
    const fromTtf = await extract(ttfOriginalFont, option);
    expect(fromWoff.meta).toStrictEqual(fromTtf.meta);
    expect(fromWoff.ttf).toStrictEqual(fromTtf.ttf);
  });

  it("should convert from WOFF input", async () => {
    const result = await extract(toWoff(textFont), {
      fontName: "woff",
      engine: "convert",
      formats: ["ttf"],
    });
    expect(result.ttf).toBeInstanceOf(Buffer);
    expect(result.meta.length).toBeGreaterThan(0);
  });

  it("should read WOFF in the browser entry", async () => {
    const fromWoff = await createFont(new Uint8Array(toWoff(textFont)));
    const fromTtf = await createFont(new Uint8Array(textFont));
    expect(fromWoff.codePoints).toStrictEqual(fromTtf.codePoints);
  });

  it("should explain a WOFF table that cannot be decompressed", async () => {
    const corrupted = withCorruptedTable(toWoff(textFont));
    await expect(extract(corrupted, { fontName: "woff", ligatures: ["abc"] })).rejects.toThrow(
      /^Malformed WOFF file: table ".{4}" cannot be decompressed$/u,
    );
  });

  it.each(collections)("should reject a %s font collection", async (_label, font) => {
    await expect(extract(font, { fontName: "collection", ligatures: ["abc"] })).rejects.toThrow(
      COLLECTION_ERROR,
    );
  });

  it.each(collections)(
    "should reject a %s font collection in the browser entry",
    async (_label, font) => {
      await expect(createFont(new Uint8Array(font))).rejects.toThrow(COLLECTION_ERROR);
    },
  );

  it("should reject WOFF2 in the browser entry and point to the Node entry", async () => {
    await expect(createFont(new Uint8Array(woff2OriginalFont))).rejects.toThrow(
      "WOFF2 input is not supported in fontext/browser. Provide a TTF, OTF or WOFF font, or use the Node entry, which reads WOFF2.",
    );
  });

  it("should reject data that is not a font", async () => {
    await expect(
      extract(Buffer.from("definitely not a font"), { fontName: "junk", ligatures: ["abc"] }),
    ).rejects.toThrow("Unsupported font format: expected TrueType, OpenType, WOFF or WOFF2 data");
  });

  it("should explain a truncated GSUB table", async () => {
    const truncated = withTruncatedTable(multiLookupFont, "GSUB", 6);
    await expect(
      extract(truncated, { fontName: "truncated", raws: [""], formats: ["svg"] }),
    ).rejects.toThrow(
      /^Malformed GSUB table: cannot read \d+ bytes at offset \d+, it is \d+ bytes long$/u,
    );
  });
});
