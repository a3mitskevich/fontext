import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawnSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import * as hb from "harfbuzzjs";
import { chunkOutputs, chunkSummary, outputFiles, resolveSplit } from "../src/cli-split";
import { extract, scriptsFont } from "./setup";

const CLI = path.resolve(import.meta.dirname, "../dist/cli.js");
const SCRIPTS_FONT = path.resolve(import.meta.dirname, "../assets/font-scripts.ttf");
const ICON_FONT = path.resolve(import.meta.dirname, "../assets/font.ttf");
const CHARACTERS = "AVΑΩАД01 ,";
// Options are rejected before anything is written
const REJECTED_DIR = path.join(os.tmpdir(), "fontext-cli-split-rejected");

const runCli = (args: string[], cwd?: string) =>
  spawnSync("node", [CLI, ...args], { encoding: "utf8", timeout: 10_000, cwd });

const splitArgs = (outDir: string, ...args: string[]): string[] => [
  "-i",
  SCRIPTS_FONT,
  "-n",
  "text",
  "--engine",
  "subset",
  "-c",
  CHARACTERS,
  "-f",
  "ttf,woff2",
  "-o",
  outDir,
  ...args,
];

const outputs = (dir: string): string[] =>
  fs.existsSync(dir) ? fs.readdirSync(dir).toSorted() : [];
const SPLIT_FILES = [
  "text.cyrillic.ttf",
  "text.cyrillic.woff2",
  "text.greek.ttf",
  "text.greek.woff2",
  "text.latin.ttf",
  "text.latin.woff2",
  "text.ttf",
  "text.woff2",
];

/** The characters the cmap of a written font file maps. */
function cmapOf(filePath: string): string {
  const face = new hb.Face(new hb.Blob(fs.readFileSync(filePath)), 0);
  return String.fromCodePoint(...face.collectUnicodes());
}

describe("CLI split helpers", () => {
  it("should name chunk files after the font and the script", async () => {
    const result = await extract(scriptsFont, {
      fontName: "text",
      engine: "subset",
      characters: CHARACTERS,
      formats: ["ttf", "woff2"],
      split: "scripts",
    });
    const chunks = chunkOutputs(result, "/out", "text");
    expect(chunks.map(({ files }) => files.map((file) => file.path))).toStrictEqual([
      ["/out/text.latin.ttf", "/out/text.latin.woff2"],
      ["/out/text.greek.ttf", "/out/text.greek.woff2"],
      ["/out/text.cyrillic.ttf", "/out/text.cyrillic.woff2"],
    ]);
    const [latin] = chunks;
    expect(chunkSummary(latin)).toStrictEqual({
      script: "latin",
      unicodeRange: result.chunks?.[0].unicodeRange,
      codePoints: 6,
      glyphs: 6,
      warnings: [],
      files: latin.files.map(({ path: filePath, format, size, saving }) => ({
        path: filePath,
        format,
        size,
        saving,
      })),
    });
    expect(latin.files[0].buffer).toStrictEqual(result.chunks?.[0].ttf);
    expect(outputFiles(result, "/out", "text").map((file) => file.path)).toStrictEqual([
      "/out/text.ttf",
      "/out/text.woff2",
    ]);
  });

  it("should put --split over the config key in single mode only", () => {
    expect(resolveSplit(undefined, "scripts", true)).toBe("scripts");
    expect(resolveSplit("scripts", undefined, true)).toBe("scripts");
    expect(resolveSplit("x", "scripts", true)).toBe("scripts");
    expect(resolveSplit("scripts", "x", false)).toBe("scripts");
    expect(resolveSplit(undefined, "scripts", false)).toBeUndefined();
  });
});

describe("CLI --split", () => {
  let tmpDir: string;

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "fontext-cli-split-"));
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("should list the flag in --help", () => {
    const { stdout, status } = runCli(["--help"]);
    expect(status).toBe(0);
    expect(stdout).toContain("--split");
  });

  it("should write a font per script next to the whole font", () => {
    const outDir = path.join(tmpDir, "flag");
    const { status, stderr } = runCli(splitArgs(outDir, "--split", "scripts"));
    expect(stderr).toBe("");
    expect(status).toBe(0);
    expect(outputs(outDir)).toStrictEqual(SPLIT_FILES);
    expect(cmapOf(path.join(outDir, "text.cyrillic.ttf"))).toBe(" ,01АД");
    expect(cmapOf(path.join(outDir, "text.ttf"))).toBe(" ,01AVΑΩАД");
  });

  it("should read split from .fontextrc.json, also in batch entries", () => {
    const cwd = path.join(tmpDir, "rc");
    const outDir = path.join(tmpDir, "rc-out");
    fs.mkdirSync(cwd, { recursive: true });
    const entry = { input: SCRIPTS_FONT, engine: "subset", characters: CHARACTERS };
    fs.writeFileSync(
      path.join(cwd, ".fontextrc.json"),
      JSON.stringify({
        output: outDir,
        formats: ["ttf", "woff2"],
        batch: [
          { ...entry, fontName: "text", split: "scripts" },
          { ...entry, fontName: "whole" },
        ],
      }),
    );
    const { status, stderr } = runCli([], cwd);
    expect(stderr).toBe("");
    expect(status).toBe(0);
    expect(outputs(outDir)).toStrictEqual([...SPLIT_FILES, "whole.ttf", "whole.woff2"]);
  });

  it("should list the chunks in --json and write nothing with --dry-run", () => {
    const outDir = path.join(tmpDir, "dry-run");
    const { status, stdout } = runCli(
      splitArgs(outDir, "--split", "scripts", "--dry-run", "--json"),
    );
    expect(status).toBe(0);
    expect(outputs(outDir)).toStrictEqual([]);
    const parsed = JSON.parse(stdout);
    expect(
      parsed.files.map(({ path: filePath }: { path: string }) => path.basename(filePath)),
    ).toStrictEqual(["text.ttf", "text.woff2"]);
    expect(
      parsed.chunks.map(({ script, unicodeRange, codePoints, files }: Record<string, unknown>) => ({
        script,
        unicodeRange,
        codePoints,
        files: (files as { path: string; format: string; size: number }[]).map((file) => [
          path.basename(file.path),
          file.format,
          file.size > 0,
        ]),
      })),
    ).toStrictEqual([
      {
        script: "latin",
        unicodeRange: "U+0020,U+002C,U+0030-0031,U+0041,U+0056",
        codePoints: 6,
        files: [
          ["text.latin.ttf", "ttf", true],
          ["text.latin.woff2", "woff2", true],
        ],
      },
      {
        script: "greek",
        unicodeRange: "U+0391,U+03A9",
        codePoints: 6,
        files: [
          ["text.greek.ttf", "ttf", true],
          ["text.greek.woff2", "woff2", true],
        ],
      },
      {
        script: "cyrillic",
        unicodeRange: "U+0410,U+0414",
        codePoints: 6,
        files: [
          ["text.cyrillic.ttf", "ttf", true],
          ["text.cyrillic.woff2", "woff2", true],
        ],
      },
    ]);
  });

  it("should leave chunks out of --json without --split", () => {
    const { status, stdout } = runCli(splitArgs(path.join(tmpDir, "no-split"), "--dry-run", "-j"));
    expect(status).toBe(0);
    expect(JSON.parse(stdout)).not.toHaveProperty("chunks");
  });

  it.each([
    [
      "an invalid value",
      splitArgs(REJECTED_DIR, "--dry-run", "--split", "words"),
      'Invalid split: "words". Valid values: scripts',
    ],
    [
      "the icon engine",
      ["-i", ICON_FONT, "-n", "icons", "-l", "home", "-o", REJECTED_DIR, "--split", "scripts"],
      "split is not supported by the icon engine",
    ],
  ])("should reject %s", (_, args, message) => {
    const { status, stderr } = runCli(args);
    expect(status).toBe(1);
    expect(stderr).toContain(message);
    expect(outputs(REJECTED_DIR)).toStrictEqual([]);
  });
});
