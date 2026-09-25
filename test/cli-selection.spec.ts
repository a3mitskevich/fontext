import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawnSync } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";

const CLI = path.resolve(import.meta.dirname, "../dist/cli.js");
const FONT = path.resolve(import.meta.dirname, "../assets/font.ttf");

const runCli = (args: string[]) =>
  spawnSync("node", [CLI, ...args], { encoding: "utf8", timeout: 10_000 });

describe("CLI glyph selection", () => {
  let tmpDir: string;

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "fontext-cli-selection-"));
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("should fail with the error of a ligature the font cannot form", () => {
    const { stderr, status } = runCli([
      "-i",
      FONT,
      "-n",
      "test-icons",
      "-l",
      "abc,hme",
      "-f",
      "ttf",
      "-o",
      tmpDir,
    ]);

    expect(status).toBe(1);
    expect(stderr).toContain('Font does not contain a ligature for "hme"');
    expect(fs.existsSync(path.join(tmpDir, "test-icons.ttf"))).toBe(false);
  });
});
