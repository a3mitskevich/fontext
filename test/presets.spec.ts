import { describe, it, expect } from "vitest";
import type { MinifyOption } from "../src";
import { sfntTable } from "../src/font/sfnt";
import { cffSubroutines } from "./cff-utils";
import { cffFont, extract, textFont, ttfOriginalFont } from "./setup";

const FORMAT_KEYS = ["ttf", "eot", "woff", "woff2", "svg"] as const;

type EngineCase = [engine: string, option: MinifyOption, font: Buffer];

const ENGINES: EngineCase[] = [
  ["icon", { fontName: "icons", ligatures: ["home"] }, ttfOriginalFont],
  ["subset", { fontName: "text", engine: "subset", characters: "abc" }, textFont],
  ["convert", { fontName: "text", engine: "convert" }, textFont],
];

const formatsOf = (result: Awaited<ReturnType<typeof extract>>): string[] =>
  FORMAT_KEYS.filter((format) => result[format] !== undefined);

async function ttfOf(font: Buffer, option: MinifyOption): Promise<Buffer> {
  const { ttf } = await extract(font, option);
  if (!ttf) {
    throw new Error("No TTF in the result");
  }
  return ttf;
}

const TEXT_SUBSET: MinifyOption = { fontName: "text", engine: "subset", characters: "abc" };
const CFF_SUBSET: MinifyOption = {
  fontName: "cff",
  engine: "subset",
  // Letters call the global subroutine, the ligatures at U+E001-U+E003 the local one
  characters: "fixyz\u{E001}\u{E002}\u{E003}",
  formats: ["ttf"],
};

const DEFAULT_FORMATS: Record<string, string[]> = {
  icon: ["ttf", "eot", "woff", "woff2", "svg"],
  subset: ["ttf", "woff", "woff2"],
  convert: ["ttf", "eot", "woff", "woff2", "svg"],
};

describe("preset option", () => {
  it.each(ENGINES)(
    "should leave the engine's formats as they are (%s engine)",
    async (engine, option, font) => {
      for (const preset of ["web-font", "outline-render"] as const) {
        const result = await extract(font, { ...option, preset });
        expect(formatsOf(result)).toStrictEqual(DEFAULT_FORMATS[engine]);
      }
    },
  );

  it.each(ENGINES)("should write the explicit formats (%s engine)", async (_, option, font) => {
    const result = await extract(font, {
      ...option,
      preset: "outline-render",
      formats: ["woff", "ttf"],
    });
    expect(formatsOf(result)).toStrictEqual(["ttf", "woff"]);
  });

  it("should drop hinting and gasp for outline rendering and keep them for web fonts", async () => {
    const web = await ttfOf(textFont, { ...TEXT_SUBSET, preset: "web-font", formats: ["ttf"] });
    const outlines = await ttfOf(textFont, {
      ...TEXT_SUBSET,
      preset: "outline-render",
      formats: ["ttf"],
    });
    expect(sfntTable(web, "fpgm")).toBeDefined();
    expect(sfntTable(web, "gasp")).toBeDefined();
    expect(sfntTable(outlines, "fpgm")).toBeUndefined();
    expect(sfntTable(outlines, "gasp")).toBeUndefined();
  });

  it("should let explicit options override the preset", async () => {
    const ttf = await ttfOf(textFont, {
      ...TEXT_SUBSET,
      preset: "outline-render",
      formats: ["ttf"],
      hinting: true,
      nameIds: [1],
    });
    expect(sfntTable(ttf, "fpgm")).toBeDefined();
    const kept = await ttfOf(textFont, {
      ...TEXT_SUBSET,
      preset: "outline-render",
      formats: ["ttf"],
      keepTables: ["gasp"],
    });
    expect(sfntTable(kept, "gasp")).toBeDefined();
  });
});

describe("preset option with CFF outlines", () => {
  it("should keep the subroutines of the source without a preset", async () => {
    expect(cffSubroutines(cffFont)).toStrictEqual({ global: 1, hasLocal: true });
    const ttf = await ttfOf(cffFont, CFF_SUBSET);
    expect(cffSubroutines(ttf)).toStrictEqual({ global: 1, hasLocal: true });
  });

  it("should desubroutinize web fonts", async () => {
    const ttf = await ttfOf(cffFont, { ...CFF_SUBSET, preset: "web-font" });
    expect(cffSubroutines(ttf)).toStrictEqual({ global: 0, hasLocal: false });
  });

  it("should keep the subroutines for outline rendering", async () => {
    const ttf = await ttfOf(cffFont, { ...CFF_SUBSET, preset: "outline-render" });
    expect(cffSubroutines(ttf)).toStrictEqual({ global: 1, hasLocal: true });
  });

  it.each(["web-font", "outline-render"] as const)(
    "should keep the outlines of the source (%s preset)",
    async (preset) => {
      const { meta } = await extract(cffFont, CFF_SUBSET);
      const optimized = await extract(cffFont, { ...CFF_SUBSET, preset });
      expect(meta).toHaveLength(8);
      expect(optimized.meta).toStrictEqual(meta);
    },
  );
});
