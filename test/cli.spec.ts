import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";

const CLI = path.resolve(__dirname, "../dist/cli.js");
const FONT = path.resolve(__dirname, "../assets/font.ttf");

function run(args: string[]): { stdout: string; exitCode: number } {
  try {
    const stdout = execFileSync("node", [CLI, ...args], {
      encoding: "utf8",
      timeout: 10000,
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
    expect(stdout).toContain("Usage: fontext");
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
    expect(stdout).toContain("Extracted 1 glyph(s)");
    expect(fs.existsSync(path.join(outDir, "test-icons.ttf"))).toBe(true);
    expect(fs.existsSync(path.join(outDir, "test-icons.woff2"))).toBe(true);
  });
});
