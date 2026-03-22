import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";

const CLI = path.resolve(__dirname, "../dist/cli.js");
const FONT = path.resolve(__dirname, "../assets/font.ttf");

function run(args: string[], cwd?: string): { stdout: string; exitCode: number } {
  try {
    const stdout = execFileSync("node", [CLI, ...args], {
      encoding: "utf8",
      timeout: 10000,
      cwd,
    });
    return { stdout, exitCode: 0 };
  } catch (err: any) {
    return { stdout: err.stdout ?? err.stderr ?? "", exitCode: err.status ?? 1 };
  }
}

describe("CLI", () => {
  let tmpDir: string;

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "fontext-cli-test-"));
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("should print help with --help", () => {
    const { stdout, exitCode } = run(["--help"]);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("fontext");
    expect(stdout).toContain("--input");
    expect(stdout).toContain("--font-name");
  });

  it("should print version with --version", () => {
    const { stdout, exitCode } = run(["--version"]);
    expect(exitCode).toBe(0);
    expect(stdout.trim()).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("should fail without --input", () => {
    const { exitCode } = run(["--font-name", "test", "--ligatures", "abc"]);
    expect(exitCode).toBe(1);
  });

  it("should fail without --font-name", () => {
    const { exitCode } = run(["--input", FONT, "--ligatures", "abc"]);
    expect(exitCode).toBe(1);
  });

  it("should fail without --ligatures or --raws", () => {
    const { exitCode } = run(["--input", FONT, "--font-name", "test"]);
    expect(exitCode).toBe(1);
  });

  it("should extract glyphs and write output files", () => {
    const outDir = path.join(tmpDir, "out");
    const { stdout, exitCode } = run([
      "--input",
      FONT,
      "--font-name",
      "test-icons",
      "--ligatures",
      "abc",
      "--formats",
      "ttf,woff2",
      "--output",
      outDir,
    ]);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("1 glyph(s) extracted");
    expect(fs.existsSync(path.join(outDir, "test-icons.ttf"))).toBe(true);
    expect(fs.existsSync(path.join(outDir, "test-icons.woff2"))).toBe(true);
  });

  it("should output JSON with --json flag", () => {
    const outDir = path.join(tmpDir, "json-out");
    const { stdout, exitCode } = run([
      "--input",
      FONT,
      "--font-name",
      "test-icons",
      "--ligatures",
      "abc",
      "--formats",
      "ttf",
      "--output",
      outDir,
      "--json",
    ]);
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.fontName).toBe("test-icons");
    expect(parsed.glyphs).toBe(1);
    expect(parsed.originalSize).toBeGreaterThan(0);
    expect(parsed.files).toHaveLength(1);
    expect(parsed.files[0].format).toBe("ttf");
    expect(parsed.files[0].saving).toBeGreaterThan(0);
    expect(parsed.meta).toHaveLength(1);
  });

  it("should read options from .fontextrc.json config file", () => {
    const cfgDir = path.join(tmpDir, "cfg-project");
    const outDir = path.join(tmpDir, "cfg-out");
    fs.mkdirSync(cfgDir, { recursive: true });
    fs.writeFileSync(
      path.join(cfgDir, ".fontextrc.json"),
      JSON.stringify({
        input: FONT,
        fontName: "cfg-icons",
        ligatures: ["abc"],
        formats: ["ttf"],
        output: outDir,
      }),
    );
    const { exitCode } = run([], cfgDir);
    expect(exitCode).toBe(0);
    expect(fs.existsSync(path.join(outDir, "cfg-icons.ttf"))).toBe(true);
  });

  it("should process multiple fonts in batch mode", () => {
    const batchDir = path.join(tmpDir, "batch-project");
    const outDir = path.join(tmpDir, "batch-out");
    fs.mkdirSync(batchDir, { recursive: true });
    fs.writeFileSync(
      path.join(batchDir, ".fontextrc.json"),
      JSON.stringify({
        output: outDir,
        formats: ["ttf"],
        batch: [
          { input: FONT, fontName: "font-a", ligatures: ["abc"] },
          { input: FONT, fontName: "font-b", ligatures: ["abc"] },
        ],
      }),
    );
    const { exitCode } = run([], batchDir);
    expect(exitCode).toBe(0);
    expect(fs.existsSync(path.join(outDir, "font-a.ttf"))).toBe(true);
    expect(fs.existsSync(path.join(outDir, "font-b.ttf"))).toBe(true);
  });
});
