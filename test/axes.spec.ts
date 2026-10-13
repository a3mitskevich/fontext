import { describe, it, expect } from "vitest";
import * as hb from "harfbuzzjs";
import ttf2woff from "ttf2woff";
import type { MinifyOption } from "../src";
import { openFont } from "../src/font/font";
import { requiredSfntTable, sfntTable } from "../src/font/sfnt";
import { encodeWoff2 } from "../src/woff2";
import { extract, textFont, variableFont } from "./setup";
import { readKernPairs } from "./ttf-utils";

/*
 * See scripts/make-variable-fixture.mjs: wght 100-400-900 moves the right edge and the advance of
 * every box glyph by +100 and its top by +50 at 900; wdth 75-100-100 moves the right edge and the
 * advance by -150 at 75. Glyph A is the box 40,40 - 560,690 with an advance of 600.
 */
interface Box {
  readonly xMax: number;
  readonly yMax: number;
  readonly advance: number;
}

const A_DEFAULT: Box = { xMax: 560, yMax: 690, advance: 600 };
// Wght 700 is 0.6 of the way from 400 to 900, 600 is 0.4
const A_WGHT_700: Box = { xMax: 620, yMax: 720, advance: 660 };
const A_WGHT_600: Box = { xMax: 600, yMax: 710, advance: 640 };
const A_WGHT_700_WDTH_75: Box = { xMax: 470, yMax: 720, advance: 510 };
const A_ORIGIN = { xMin: 40, yMin: 40 };

const VARIATION_TABLES = ["fvar", "gvar", "avar", "HVAR", "MVAR", "STAT"];
const OS2_WEIGHT_CLASS = 4;
const OS2_FS_SELECTION = 62;
const USE_TYPO_METRICS = 0x80;

async function ttfOf(font: Buffer, option: Partial<MinifyOption>): Promise<Buffer> {
  const { ttf } = await extract(font, {
    fontName: "test",
    formats: ["ttf"],
    ...option,
  } as MinifyOption);
  if (!ttf) {
    throw new Error("No TTF in the result");
  }
  return ttf;
}

/** The box and advance of the glyph the cmap maps the character to. */
function boxOf(font: Uint8Array, char: string): Box & { xMin: number; yMin: number } {
  const hbFont = new hb.Font(new hb.Face(new hb.Blob(font), 0));
  const glyph = hbFont.nominalGlyph(char.codePointAt(0) ?? 0) ?? 0;
  const extents = hbFont.glyphExtents(glyph);
  if (!extents) {
    throw new Error(`No extents for "${char}"`);
  }
  return {
    xMin: extents.xBearing,
    yMin: extents.yBearing + extents.height,
    xMax: extents.xBearing + extents.width,
    yMax: extents.yBearing,
    advance: hbFont.glyphHAdvance(glyph),
  };
}

function os2Uint16(font: Uint8Array, offset: number): number {
  const os2 = requiredSfntTable(font, "OS/2");
  return new DataView(os2.buffer, os2.byteOffset, os2.byteLength).getUint16(offset);
}

const variationTablesOf = (font: Uint8Array): string[] =>
  VARIATION_TABLES.filter((tag) => sfntTable(font, tag) !== undefined);

async function axesOf(font: Uint8Array) {
  const opened = await openFont(font);
  return opened.axes;
}

/** The TTF of an extraction; an empty buffer fails the checks on it. */
const ttfIn = ({ ttf }: { ttf?: Buffer }): Buffer => ttf ?? Buffer.alloc(0);

type EngineCase = [engine: string, option: Partial<MinifyOption>];

const SOURCE_ENGINES: EngineCase[] = [
  ["subset", { engine: "subset", characters: "AVafi" }],
  ["convert", { engine: "convert" }],
];

describe("axes option", () => {
  it("should read the axes of the fixture", async () => {
    await expect(axesOf(variableFont)).resolves.toStrictEqual([
      { tag: "wght", min: 100, default: 400, max: 900 },
      { tag: "wdth", min: 75, default: 100, max: 100 },
    ]);
    expect(boxOf(variableFont, "A")).toStrictEqual({ ...A_DEFAULT, ...A_ORIGIN });
    await expect(axesOf(textFont)).resolves.toStrictEqual([]);
  });

  it.each(SOURCE_ENGINES)(
    "should pin every axis into a static font (%s engine)",
    async (_, option) => {
      const ttf = await ttfOf(variableFont, { ...option, axes: { wght: 700, wdth: 75 } });
      expect(variationTablesOf(ttf)).toStrictEqual([]);
      expect(boxOf(ttf, "A")).toStrictEqual({ ...A_WGHT_700_WDTH_75, ...A_ORIGIN });
    },
  );

  it.each(SOURCE_ENGINES)(
    "should pin one axis and keep the other (%s engine)",
    async (_, option) => {
      const ttf = await ttfOf(variableFont, { ...option, axes: { wght: 700 } });
      await expect(axesOf(ttf)).resolves.toStrictEqual([
        { tag: "wdth", min: 75, default: 100, max: 100 },
      ]);
      expect(boxOf(ttf, "A")).toStrictEqual({ ...A_WGHT_700, ...A_ORIGIN });
    },
  );

  it.each(SOURCE_ENGINES)("should narrow an axis (%s engine)", async (_, option) => {
    const ttf = await ttfOf(variableFont, { ...option, axes: { wght: { min: 600, max: 700 } } });
    // HarfBuzz keeps the default of the font clamped into the range
    await expect(axesOf(ttf)).resolves.toStrictEqual([
      { tag: "wght", min: 600, default: 600, max: 700 },
      { tag: "wdth", min: 75, default: 100, max: 100 },
    ]);
    expect(boxOf(ttf, "A")).toStrictEqual({ ...A_WGHT_600, ...A_ORIGIN });
  });

  it("should write the weight class of the pinned weight", async () => {
    const option = { engine: "subset", characters: "A", axes: { wght: 700 } } as const;
    expect(os2Uint16(await ttfOf(variableFont, option), OS2_WEIGHT_CLASS)).toBe(700);
  });

  it("should draw the convert engine's SVG font and meta at the location", async () => {
    const { svg, meta } = await extract(variableFont, {
      fontName: "test",
      engine: "convert",
      formats: ["svg"],
      axes: { wght: 700 },
    });
    const glyphA = meta.find(({ unicode }) => unicode.includes("A"));
    expect(glyphA?.svg).toContain(`viewBox="0 -1000 ${A_WGHT_700.advance} 1000"`);
    expect(svg?.toString()).toContain(`horiz-adv-x="${A_WGHT_700.advance}"`);
  });

  it("should draw the icon engine's glyphs at the location", async () => {
    const option: MinifyOption = { fontName: "icons", ligatures: ["fi"], formats: ["ttf"] };
    const pinned = await extract(variableFont, { ...option, axes: { wght: 700 } });
    const regular = await extract(variableFont, option);
    expect(pinned.meta).toHaveLength(1);
    expect(pinned.meta[0].svg).toContain('viewBox="0 -1000 660 1000"');
    expect(regular.meta[0].svg).toContain('viewBox="0 -1000 600 1000"');
    expect(variationTablesOf(ttfIn(pinned))).toStrictEqual([]);
  });

  it("should restore the legacy kern pairs of the instance", async () => {
    const option = { engine: "subset", characters: "AV", axes: { wght: 700 } } as const;
    expect(readKernPairs(await ttfOf(variableFont, option))).toStrictEqual([[1, 2, -80]]);
  });

  it("should keep the ligature of the instance", async () => {
    const ttf = await ttfOf(variableFont, {
      engine: "subset",
      ligatures: ["fi"],
      axes: { wght: 700, wdth: 75 },
    });
    const font = await openFont(ttf);
    expect(font.shape("fi")).toHaveLength(1);
  });

  it("should instance WOFF and WOFF2 input", async () => {
    const option = { engine: "convert", axes: { wght: 700 } } as const;
    const woff = Buffer.from(ttf2woff(new Uint8Array(variableFont)));
    const fromWoff = await ttfOf(woff, option);
    const fromWoff2 = await ttfOf(await encodeWoff2(variableFont), option);
    expect(boxOf(fromWoff, "A")).toStrictEqual({ ...A_WGHT_700, ...A_ORIGIN });
    expect(boxOf(fromWoff2, "A")).toStrictEqual({ ...A_WGHT_700, ...A_ORIGIN });
  });

  it("should report the size of the input, not of the instance", async () => {
    const { report } = await extract(variableFont, {
      fontName: "test",
      engine: "convert",
      formats: ["ttf"],
      axes: { wght: 700, wdth: 75 },
    });
    expect(report.originalSize).toBe(variableFont.length);
  });

  it("should give the same bytes for the same axes", async () => {
    const option = { engine: "subset", characters: "AVfi", axes: { wght: 650, wdth: 80 } } as const;
    await expect(ttfOf(variableFont, option)).resolves.toStrictEqual(
      await ttfOf(variableFont, option),
    );
  });

  it("should leave the font as it is for empty axes", async () => {
    const option = { engine: "subset", characters: "AV" } as const;
    await expect(ttfOf(variableFont, { ...option, axes: {} })).resolves.toStrictEqual(
      await ttfOf(variableFont, option),
    );
  });

  it("should patch the instance for Safari", async () => {
    const ttf = await ttfOf(variableFont, {
      engine: "subset",
      characters: "A",
      axes: { wght: 700 },
      safariFix: true,
    });
    expect(os2Uint16(ttf, OS2_FS_SELECTION) & USE_TYPO_METRICS).toBe(USE_TYPO_METRICS);
  });

  it("should instance every chunk of a split", async () => {
    const { chunks = [] } = await extract(variableFont, {
      fontName: "test",
      engine: "convert",
      formats: ["ttf"],
      split: "scripts",
      axes: { wght: 700, wdth: 75 },
    });
    expect(chunks.map(({ script }) => script)).toStrictEqual(["latin"]);
    const chunk = ttfIn(chunks[0]);
    expect(variationTablesOf(chunk)).toStrictEqual([]);
    expect(boxOf(chunk, "A")).toStrictEqual({ ...A_WGHT_700_WDTH_75, ...A_ORIGIN });
  });
});
