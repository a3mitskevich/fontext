import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawnSync } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";
import * as hb from "harfbuzzjs";
import {
  parseLayoutFeatures,
  parseNameIds,
  resolveOptimizationOptions,
} from "../src/cli-optimization";
import { sfntTable } from "../src/font/sfnt";

const CLI = path.resolve(import.meta.dirname, "../dist/cli.js");
const TEXT_FONT = path.resolve(import.meta.dirname, "../assets/font-without-gsub.ttf");
const ICON_FONT = path.resolve(import.meta.dirname, "../assets/font.ttf");

const runCli = (args: string[], cwd?: string) =>
  spawnSync("node", [CLI, ...args], { encoding: "utf8", timeout: 10_000, cwd });

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
const outputs = (dir: string): string[] => fs.readdirSync(dir).toSorted();
/** The TTF written to the directory under the font name. */
const writtenTtf = (dir: string, fontName: string): Buffer =>
  fs.readFileSync(path.join(dir, `${fontName}.ttf`));

const nameIdsOf = (font: Uint8Array): number[] => [
  ...new Set(new hb.Face(new hb.Blob(font), 0).listNames().map(({ nameId }) => nameId)),
];

describe("CLI optimization option parsing", () => {
  it.each([
    ["all", "all"],
    ["default", "default"],
    [" default ", "default"],
    ["liga,kern", ["liga", "kern"]],
    ["liga, ss1 ,", ["liga", "ss1"]],
    ["", []],
  ])("should parse --layout-features %j", (value, expected) => {
    expect(parseLayoutFeatures(value)).toStrictEqual(expected);
  });

  it("should parse name ids and keep other items for extract() to reject", () => {
    expect(parseNameIds("1, 2,4")).toStrictEqual([1, 2, 4]);
    expect(parseNameIds("1,x,-3")).toStrictEqual([1, "x", "-3"]);
  });

  it("should put the flags over the config in single mode", () => {
    const entry = { target: "web", hinting: true, nameIds: [1], dropTables: ["DSIG"] };
    const flags = { target: "runtime", hinting: false, "layout-features": "default" };
    expect(resolveOptimizationOptions(entry, flags, true)).toStrictEqual({
      target: "runtime",
      hinting: false,
      layoutFeatures: "default",
      nameIds: [1],
      dropTables: ["DSIG"],
    });
  });

  it("should take only the config in batch mode", () => {
    const entry = { layoutFeatures: ["liga"], nameIds: [1, 4] };
    const flags = { "name-ids": "2", "drop-tables": "MATH" };
    expect(resolveOptimizationOptions(entry, flags, false)).toStrictEqual({
      target: undefined,
      hinting: undefined,
      layoutFeatures: ["liga"],
      nameIds: [1, 4],
      dropTables: undefined,
    });
  });

  it("should parse every flag", () => {
    const flags = {
      target: "web",
      hinting: true,
      "layout-features": "liga,kern",
      "name-ids": "1,2,4",
      "drop-tables": "MATH, DSIG",
    };
    expect(resolveOptimizationOptions({}, flags, true)).toStrictEqual({
      target: "web",
      hinting: true,
      layoutFeatures: ["liga", "kern"],
      nameIds: [1, 2, 4],
      dropTables: ["MATH", "DSIG"],
    });
  });
});

describe("CLI optimization flags", () => {
  let tmpDir: string;

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "fontext-cli-optimization-"));
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("should list the flags in --help", () => {
    const { stdout, status } = runCli(["--help"]);
    expect(status).toBe(0);
    for (const flag of [
      "--target",
      "--no-hinting",
      "--layout-features",
      "--name-ids",
      "--drop-tables",
    ]) {
      expect(stdout).toContain(flag);
    }
  });

  it.each([
    ["web", ["text.woff2"]],
    ["runtime", ["text.ttf"]],
  ])("should write the formats of --target %s", (target, files) => {
    const outDir = path.join(tmpDir, `target-${target}`);
    const { status, stderr } = runCli(subsetArgs(outDir, "--target", target));
    expect(stderr).toBe("");
    expect(status).toBe(0);
    expect(outputs(outDir)).toStrictEqual(files);
  });

  it("should drop hinting for --target runtime unless --hinting is given", () => {
    const dropped = path.join(tmpDir, "runtime-dropped");
    const kept = path.join(tmpDir, "runtime-kept");
    expect(runCli(subsetArgs(dropped, "--target", "runtime")).status).toBe(0);
    expect(runCli(subsetArgs(kept, "--target", "runtime", "--hinting")).status).toBe(0);
    expect(sfntTable(writtenTtf(dropped, "text"), "fpgm")).toBeUndefined();
    expect(sfntTable(writtenTtf(kept, "text"), "fpgm")).toBeDefined();
  });

  it("should apply --no-hinting, --name-ids and --drop-tables", () => {
    const outDir = path.join(tmpDir, "flags");
    const { status } = runCli(
      subsetArgs(
        outDir,
        "-f",
        "ttf",
        "--no-hinting",
        "--layout-features",
        "default",
        "--name-ids",
        "1,4",
        "--drop-tables",
        "gasp,kern",
      ),
    );
    expect(status).toBe(0);
    const ttf = writtenTtf(outDir, "text");
    expect(sfntTable(ttf, "fpgm")).toBeUndefined();
    expect(sfntTable(ttf, "gasp")).toBeUndefined();
    expect(sfntTable(ttf, "kern")).toBeUndefined();
    expect(nameIdsOf(ttf)).toStrictEqual([1, 4]);
  });

  it.each([
    [["--target", "print"], 'Invalid target: "print"'],
    [["--name-ids", "1,x"], 'Invalid name id(s): "x"'],
    [["--drop-tables", "GSUBX"], 'Invalid tag(s) in dropTables: "GSUBX"'],
    [["--layout-features", "liga,ligature"], 'Invalid tag(s) in layoutFeatures: "ligature"'],
    [["--drop-tables", "DSIG,glyf"], 'Invalid tag(s) in dropTables: "glyf". The font needs'],
  ])("should fail on %j", (args, message) => {
    const { status, stderr } = runCli(subsetArgs(path.join(tmpDir, "invalid"), ...args));
    expect(status).toBe(1);
    expect(stderr).toContain(message);
  });

  it("should fail on a table the font needs in .fontextrc.json", () => {
    const projectDir = path.join(tmpDir, "rc-required-table");
    fs.mkdirSync(projectDir, { recursive: true });
    fs.writeFileSync(
      path.join(projectDir, ".fontextrc.json"),
      JSON.stringify({
        input: TEXT_FONT,
        fontName: "text",
        engine: "subset",
        characters: "abc",
        output: path.join(projectDir, "out"),
        dropTables: ["hmtx"],
      }),
    );
    const { status, stderr } = runCli([], projectDir);
    expect(status).toBe(1);
    expect(stderr).toContain('Invalid tag(s) in dropTables: "hmtx". The font needs');
    expect(fs.existsSync(path.join(projectDir, "out"))).toBe(false);
  });

  it("should read the optimization keys from .fontextrc.json and its batch entries", () => {
    const projectDir = path.join(tmpDir, "rc-project");
    const outDir = path.join(projectDir, "out");
    fs.mkdirSync(projectDir, { recursive: true });
    fs.writeFileSync(
      path.join(projectDir, ".fontextrc.json"),
      JSON.stringify({
        output: outDir,
        target: "runtime",
        nameIds: [1, 2, 4],
        batch: [
          { input: TEXT_FONT, fontName: "text", engine: "subset", characters: "abc" },
          {
            input: TEXT_FONT,
            fontName: "text-web",
            engine: "subset",
            characters: "abc",
            target: "web",
            formats: ["ttf"],
            hinting: false,
            dropTables: ["gasp"],
          },
          { input: ICON_FONT, fontName: "icons", ligatures: ["home"], nameIds: [4] },
        ],
      }),
    );

    const { status, stderr } = runCli([], projectDir);
    expect(stderr).toBe("");
    expect(status).toBe(0);
    expect(outputs(outDir)).toStrictEqual(["icons.ttf", "text-web.ttf", "text.ttf"]);

    const text = writtenTtf(outDir, "text");
    expect(sfntTable(text, "fpgm")).toBeUndefined();
    expect(nameIdsOf(text)).toStrictEqual([1, 2, 4]);
    const web = writtenTtf(outDir, "text-web");
    expect(sfntTable(web, "fpgm")).toBeUndefined();
    expect(sfntTable(web, "gasp")).toBeUndefined();
    expect(nameIdsOf(writtenTtf(outDir, "icons"))).toStrictEqual([4]);
  });
});
