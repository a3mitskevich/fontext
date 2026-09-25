import { describe, it, expect } from "vitest";
import ttf2woff from "ttf2woff";
import { createFont } from "../src/browser";
import type { MinifyOption } from "../src";
import { cffFont, extract, ttfOriginalFont } from "./setup";
import { withRecordPastEnd } from "./ttf-utils";

/**
 * Each cut ends the data inside the named part of the font. Material Icons has a 252-byte table
 * directory, head at 404, hmtx at 936 and glyf, the last table, from 87 756 to the end; the CFF
 * fixture has its outlines from 204 to 514.
 */
const cuts = [
  ["the table directory", ttfOriginalFont.subarray(0, 100), "font"],
  ["the head table", ttfOriginalFont.subarray(0, 420), "head table"],
  ["the hmtx table", ttfOriginalFont.subarray(0, 2000), "hmtx table"],
  ["the glyf table", ttfOriginalFont.subarray(0, 100_000), "glyf table"],
  ["the CFF table", cffFont.subarray(0, 400), "CFF table"],
] as const;

const engines: [string, MinifyOption][] = [
  ["icon", { fontName: "truncated", ligatures: ["home"], formats: ["ttf"] }],
  ["subset", { fontName: "truncated", engine: "subset", characters: "abc", formats: ["ttf"] }],
  ["convert", { fontName: "truncated", engine: "convert", formats: ["ttf"] }],
];

const malformed = (name: string, length: number): RegExp =>
  new RegExp(
    `^Malformed ${name}: cannot read \\d+ bytes at offset \\d+, it is ${length} bytes long$`,
    "u",
  );

describe("truncated font", () => {
  describe.each(engines)("%s engine", (_engine, option) => {
    it.each(cuts)("should reject a font that ends inside %s", async (_part, font, name) => {
      await expect(extract(font, option)).rejects.toThrow(malformed(name, font.length));
    });
  });

  it.each(cuts)(
    "should reject a font that ends inside %s in the browser entry",
    async (_part, font, name) => {
      await expect(createFont(new Uint8Array(font))).rejects.toThrow(malformed(name, font.length));
    },
  );

  it("should reject a WOFF font that ends inside a table", async () => {
    const woff = Buffer.from(ttf2woff(new Uint8Array(ttfOriginalFont)));
    const truncated = woff.subarray(0, woff.length / 2);
    await expect(createFont(truncated)).rejects.toThrow(malformed("WOFF file", truncated.length));
  });

  it("should name the table whose record points past the end", async () => {
    await expect(createFont(withRecordPastEnd(ttfOriginalFont, "GSUB"))).rejects.toThrow(
      malformed("GSUB table", ttfOriginalFont.length),
    );
  });

  it("should read a font whose record of a table it does not need points past the end", async () => {
    const option = { fontName: "icons", ligatures: ["home"], formats: ["ttf" as const] };
    const damaged = await extract(withRecordPastEnd(ttfOriginalFont, "name"), option);
    const intact = await extract(ttfOriginalFont, option);
    expect(damaged.meta).toStrictEqual(intact.meta);
  });
});
