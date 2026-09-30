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

describe("target option", () => {
  it.each(ENGINES)("should write WOFF2 only for the web (%s engine)", async (_, option, font) => {
    const result = await extract(font, { ...option, target: "web" });
    expect(formatsOf(result)).toStrictEqual(["woff2"]);
    expect(Object.keys(result.report.formats)).toStrictEqual(["woff2"]);
  });

  it.each(ENGINES)("should write TTF only for runtimes (%s engine)", async (_, option, font) => {
    const result = await extract(font, { ...option, target: "runtime" });
    expect(formatsOf(result)).toStrictEqual(["ttf"]);
  });

  it.each(ENGINES)("should write the explicit formats (%s engine)", async (_, option, font) => {
    const result = await extract(font, { ...option, target: "runtime", formats: ["woff", "ttf"] });
    expect(formatsOf(result)).toStrictEqual(["ttf", "woff"]);
  });

  it("should drop hinting for runtimes and keep it for the web", async () => {
    const web = await ttfOf(textFont, { ...TEXT_SUBSET, target: "web", formats: ["ttf"] });
    const runtime = await ttfOf(textFont, { ...TEXT_SUBSET, target: "runtime" });
    expect(sfntTable(web, "fpgm")).toBeDefined();
    expect(sfntTable(runtime, "fpgm")).toBeUndefined();
  });

  it("should let explicit hinting override the runtime target", async () => {
    const ttf = await ttfOf(textFont, { ...TEXT_SUBSET, target: "runtime", hinting: true });
    expect(sfntTable(ttf, "fpgm")).toBeDefined();
  });
});

describe("target option with CFF outlines", () => {
  it("should keep the subroutines of the source without a target", async () => {
    expect(cffSubroutines(cffFont)).toStrictEqual({ global: 1, hasLocal: true });
    const ttf = await ttfOf(cffFont, CFF_SUBSET);
    expect(cffSubroutines(ttf)).toStrictEqual({ global: 1, hasLocal: true });
  });

  it("should desubroutinize for the web", async () => {
    const ttf = await ttfOf(cffFont, { ...CFF_SUBSET, target: "web" });
    expect(cffSubroutines(ttf)).toStrictEqual({ global: 0, hasLocal: false });
  });

  it("should keep the subroutines for runtimes", async () => {
    const ttf = await ttfOf(cffFont, { ...CFF_SUBSET, target: "runtime" });
    expect(cffSubroutines(ttf)).toStrictEqual({ global: 1, hasLocal: true });
  });

  it.each(["web", "runtime"] as const)(
    "should keep the outlines of the source (%s target)",
    async (target) => {
      const { meta } = await extract(cffFont, CFF_SUBSET);
      const optimized = await extract(cffFont, { ...CFF_SUBSET, target });
      expect(meta).toHaveLength(8);
      expect(optimized.meta).toStrictEqual(meta);
    },
  );
});
