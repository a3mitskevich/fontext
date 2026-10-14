import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawnSync } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";
import * as hb from "harfbuzzjs";
import { parseAxes, parseNameLanguages, resolveOptimizationOptions } from "../src/cli-optimization";
import { sfntTable } from "../src/font/sfnt";

const CLI = path.resolve(import.meta.dirname, "../dist/cli.js");
const TEXT_FONT = path.resolve(import.meta.dirname, "../assets/font-without-gsub.ttf");
const VARIABLE_FONT = path.resolve(import.meta.dirname, "../assets/font-variable.ttf");

const runCli = (args: string[]) =>
  spawnSync("node", [CLI, ...args], { encoding: "utf8", timeout: 10_000 });

const subsetArgs = (outDir: string, ...args: string[]): string[] => [
  "-i",
  TEXT_FONT,
  "-n",
  "text",
  "--engine",
  "subset",
  "-c",
  "ABCabc",
  "-o",
  outDir,
  ...args,
];

const writtenTtf = (dir: string, fontName: string): Buffer =>
  fs.readFileSync(path.join(dir, `${fontName}.ttf`));

describe("CLI parsing of axes, names and tables", () => {
  it("should parse name languages in decimal and hex and keep other items for extract()", () => {
    expect(parseNameLanguages("all")).toBe("all");
    expect(parseNameLanguages("0x409, 1049,0X41a")).toStrictEqual([0x4_09, 1049, 0x4_1a]);
    expect(parseNameLanguages("en,0xZZ")).toStrictEqual(["en", "0xZZ"]);
  });

  it("should parse pinned and narrowed axes and keep other values for extract()", () => {
    expect(parseAxes("wght=700, wdth=75:100,opsz=12.5")).toStrictEqual({
      wght: 700,
      wdth: { min: 75, max: 100 },
      opsz: 12.5,
    });
    expect(parseAxes("wght=default,*=default")).toStrictEqual({ wght: "default", "*": "default" });
    expect(parseAxes("wght=bold,wdth=1:2:3,slnt")).toStrictEqual({
      wght: "bold",
      wdth: "1:2:3",
      slnt: "",
    });
  });

  it("should take the family and style flags over --rename and the config", () => {
    const entry = { rename: true as const, axes: { wght: 600 } };
    expect(resolveOptimizationOptions(entry, { "rename-style": "Book" }, true)).toMatchObject({
      axes: { wght: 600 },
      rename: { style: "Book" },
    });
    const both = { rename: true, "rename-family": "Brand", "rename-style": "Book" };
    expect(resolveOptimizationOptions({}, both, true).rename).toStrictEqual({
      family: "Brand",
      style: "Book",
    });
    expect(resolveOptimizationOptions(entry, { rename: false }, true).rename).toBeUndefined();
    expect(resolveOptimizationOptions(entry, { rename: false }, false).rename).toBe(true);
  });
});

describe("CLI flags for axes, names and tables", () => {
  let tmpDir: string;

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "fontext-cli-output-control-"));
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("should pin axes, rename, keep tables and list the dropped ones", () => {
    const outDir = path.join(tmpDir, "variable");
    const args = ["-i", VARIABLE_FONT, "-n", "variable", "--engine", "subset", "-c", "AVfi"];
    const flags = ["--axes", "wght=700,wdth=75", "--rename", "--keep-tables", "meta"];
    const { status, stdout, stderr } = runCli([...args, "-f", "ttf", "-o", outDir, ...flags]);
    expect(stderr).toBe("");
    expect(status).toBe(0);
    expect(stdout).toContain("dropped tables: DSIG, STAT, fvar, gvar");
    expect(stdout).toContain("axes: wght=700 pinned, wdth=75 pinned");
    const ttf = writtenTtf(outDir, "variable");
    const face = new hb.Face(new hb.Blob(ttf), 0);
    expect(face.getName(2, "en")).toBe("Bold");
    expect(face.getAxisInfos()).toStrictEqual({});
    expect(sfntTable(ttf, "meta")).toBeDefined();
  });

  it("should write the tables of the report to --json", () => {
    const outDir = path.join(tmpDir, "json-tables");
    const { status, stdout } = runCli([...subsetArgs(outDir, "--no-hinting"), "--json"]);
    expect(status).toBe(0);
    const result = JSON.parse(stdout);
    expect(result.tables.input.fpgm).toBeGreaterThan(0);
    expect(result.tables.dropped).toContain("fpgm");
  });

  it("should write the axes of the report to --json", () => {
    const outDir = path.join(tmpDir, "json-axes");
    const args = ["-i", VARIABLE_FONT, "-n", "variable", "--engine", "subset", "-c", "AV"];
    const { status, stdout } = runCli([...args, "-o", outDir, "--axes", "wght=700", "--json"]);
    expect(status).toBe(0);
    expect(JSON.parse(stdout).axes).toStrictEqual({
      pinned: { wght: 700 },
      variable: [{ tag: "wdth", min: 75, default: 100, max: 100 }],
    });
  });

  it.each([
    [["--axes", "wght=bold"], 'Invalid value for axis "wght": "bold"'],
    [["--keep-tables", "LTSH"], 'Invalid tag(s) in keepTables: "LTSH"'],
    [["--name-languages", "en"], 'Invalid name language(s): "en"'],
    [["--rename"], "rename: true takes the style from a pinned wght axis"],
  ])("should fail on %j", (args, message) => {
    const { status, stderr } = runCli(subsetArgs(path.join(tmpDir, "invalid"), ...args));
    expect(status).toBe(1);
    expect(stderr).toContain(message);
  });
});
