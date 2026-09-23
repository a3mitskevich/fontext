import { describe, it, expect } from "vitest";
import { extract, ttfOriginalFont } from "./setup";

const toArrayBuffer = (buffer: Buffer): ArrayBuffer =>
  buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;

const inputs = [
  ["Uint8Array", new Uint8Array(ttfOriginalFont)],
  ["ArrayBuffer", toArrayBuffer(ttfOriginalFont)],
] as const;

describe("font input types", () => {
  it.each(inputs)("should accept a %s in the icon engine", async (_label, content) => {
    const result = await extract(content, {
      fontName: "input-types",
      ligatures: ["abc"],
      formats: ["woff2"],
    });
    expect(result.woff2).toBeInstanceOf(Buffer);
    expect(result.meta.map((glyph) => glyph.name)).toStrictEqual(["abc"]);
    expect(result.report.originalSize).toBe(ttfOriginalFont.length);
  });

  it.each(inputs)("should accept a %s in the subset engine", async (_label, content) => {
    const result = await extract(content, {
      fontName: "input-types",
      engine: "subset",
      characters: "abc",
      formats: ["ttf"],
    });
    expect(result.ttf).toBeInstanceOf(Buffer);
    expect(result.report.originalSize).toBe(ttfOriginalFont.length);
  });

  it.each(inputs)("should accept a %s in the convert engine", async (_label, content) => {
    const result = await extract(content, {
      fontName: "input-types",
      engine: "convert",
      formats: ["woff"],
    });
    expect(result.woff).toBeInstanceOf(Buffer);
    expect(result.report.originalSize).toBe(ttfOriginalFont.length);
  });
});
