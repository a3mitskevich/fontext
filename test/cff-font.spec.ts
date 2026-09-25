import { describe, it, expect } from "vitest";
import { findLigaturesByRaws } from "../src/browser";
import { cffFont, extract } from "./setup";

/* See scripts/make-cff-fixture.mjs: f_i comes from liga, x_y from a calt lookup without context,
   y_z from a calt lookup that needs a following x */
const FI_PATH = "M20 -20L20 -680L300 -680C580 -680 580 -20 300 -20Z";

describe("OpenType font with CFF outlines", () => {
  it("should extract a liga ligature with its cubic outline", async () => {
    const { meta, ttf } = await extract(cffFont, {
      fontName: "cff",
      ligatures: ["fi"],
      formats: ["ttf", "svg"],
    });
    expect(ttf).toBeInstanceOf(Buffer);
    expect(meta).toHaveLength(1);
    expect(meta[0].name).toBe("fi");
    expect(meta[0].unicode).toStrictEqual([""]);
    expect(meta[0].svg).toContain(`d="${FI_PATH}"`);
  });

  it("should take vertical advances from vmtx", async () => {
    const { meta } = await extract(cffFont, {
      fontName: "cff",
      ligatures: ["fi", "x"],
      formats: ["svg"],
    });
    // Vmtx gives ligatures 1100 and letters 900, while the OS/2 line height is 1000
    expect(meta.map(({ svg }) => svg.match(/viewBox="(?<box>[^"]+)"/u)?.groups?.box)).toStrictEqual(
      ["0 -1100 600 1100", "0 -900 600 900"],
    );
  });

  it("should resolve a raw to a ligature that calt forms", async () => {
    const { meta } = await extract(cffFont, {
      fontName: "cff",
      raws: [""],
      formats: ["svg"],
    });
    expect(meta.map((glyph) => glyph.name)).toStrictEqual(["xy"]);
  });

  it("should reject a ligature that forms only in a longer context", async () => {
    await expect(
      extract(cffFont, { fontName: "cff", ligatures: ["xy", "yz"], formats: ["svg"] }),
    ).rejects.toThrow('Font does not contain a ligature for "yz"');
  });

  it("should reject a raw whose ligature forms only in a longer context", async () => {
    await expect(findLigaturesByRaws(new Uint8Array(cffFont), [""])).rejects.toThrow(
      'Font does not contain a ligature for ""',
    );
  });
});
