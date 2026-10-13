import { describe, it, expect } from "vitest";
import type { MinifyOption, OptimizationReport, TablesReport } from "../src";
import { tableSizes } from "../src/engines/report";
import { withTable } from "../src/font/sfnt";
import { encodeWoff2 } from "../src/woff2";
import { extract, scriptsFont, textFont, ttfOriginalFont, variableFont } from "./setup";

const HINTING_TABLES = ["LTSH", "VDMX", "cvt", "fpgm", "gasp", "hdmx", "prep"];
const NO_TABLES: TablesReport = { input: {}, output: {}, dropped: [] };
const tablesOf = ({ tables }: OptimizationReport): TablesReport => tables ?? NO_TABLES;

describe("tables in the report", () => {
  it("should list the tables of the input and the output with their sizes", async () => {
    const { ttf = Buffer.alloc(0), report } = await extract(textFont, {
      fontName: "text",
      engine: "subset",
      characters: "abc",
      formats: ["ttf", "woff2"],
    });
    const { input, output, dropped } = tablesOf(report);
    expect(input).toStrictEqual(tableSizes(textFont));
    expect(input).toMatchObject({ cvt: 496, glyf: 37_826, LTSH: 246 });
    expect(output).toStrictEqual(tableSizes(ttf));
    expect(dropped).toStrictEqual(["LTSH"]);
  });

  it("should list the tables the options drop, sorted", async () => {
    const { report } = await extract(textFont, {
      fontName: "text",
      engine: "subset",
      characters: "abc",
      formats: ["ttf"],
      hinting: false,
      dropTables: ["kern"],
    });
    expect(report.tables?.dropped).toStrictEqual([...HINTING_TABLES, "kern"].toSorted());
  });

  it("should list the variation tables of an instanced font as dropped", async () => {
    const { report } = await extract(variableFont, {
      fontName: "test",
      engine: "convert",
      formats: ["woff2"],
      axes: { wght: 700, wdth: 75 },
    });
    expect(report.tables?.input).toMatchObject({ fvar: 56, gvar: 330 });
    expect(report.tables?.dropped).toStrictEqual(["DSIG", "fvar", "gvar", "meta"]);
  });

  it("should report the repacked TTF of the icon engine", async () => {
    const { report } = await extract(ttfOriginalFont, {
      fontName: "icons",
      ligatures: ["home"],
      formats: ["woff2"],
    });
    const { input, output } = tablesOf(report);
    expect(input).toStrictEqual(tableSizes(ttfOriginalFont));
    expect(output.glyf).toBeLessThan(input.glyf);
  });

  it("should read the tables of compressed input", async () => {
    const { report } = await extract(await encodeWoff2(textFont), {
      fontName: "text",
      engine: "subset",
      characters: "abc",
      formats: ["ttf"],
    });
    const { input } = tablesOf(report);
    expect(Object.keys(input)).toStrictEqual(Object.keys(tableSizes(textFont)));
  });

  it("should report the font the transform returned", async () => {
    const extra = new Uint8Array([1, 2, 3]);
    const { report } = await extract(textFont, {
      fontName: "text",
      engine: "subset",
      characters: "abc",
      formats: ["woff"],
      transform: (ttf) => withTable(ttf, "XTRA", extra),
    });
    expect(report.tables?.output.XTRA).toBe(extra.length);
  });

  it("should leave the tables out when only SVG is built", async () => {
    const option: MinifyOption = { fontName: "text", engine: "convert", formats: ["svg"] };
    const { report } = await extract(textFont, option);
    expect(report.tables).toBeUndefined();
  });

  it("should report the tables of every chunk", async () => {
    const { report, chunks = [] } = await extract(scriptsFont, {
      fontName: "scripts",
      engine: "convert",
      formats: ["ttf"],
      split: "scripts",
    });
    expect(chunks.length).toBeGreaterThan(1);
    const outputs = chunks.map((chunk) => chunk.report.tables?.output);
    expect(outputs).toStrictEqual(chunks.map(({ ttf = Buffer.alloc(0) }) => tableSizes(ttf)));
    expect(chunks.every((chunk) => chunk.report.tables?.input === report.tables?.input)).toBe(true);
  });
});
