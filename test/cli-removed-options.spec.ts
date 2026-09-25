import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawnSync } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";

const CLI = path.resolve(import.meta.dirname, "../dist/cli.js");
const FONT = path.resolve(import.meta.dirname, "../assets/font.ttf");

const runCli = (args: string[], cwd?: string) =>
  spawnSync("node", [CLI, ...args], { encoding: "utf8", timeout: 10_000, cwd });

describe("CLI without withWhitespace", () => {
  let tmpDir: string;

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "fontext-cli-removed-"));
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it.each(["--with-whitespace", "-w"])("should reject the removed %s flag", (flag) => {
    const { stderr, status } = runCli(["-i", FONT, "-n", "test", "-l", "home", flag]);

    expect(status).toBe(1);
    expect(stderr).toContain(`Unknown option '${flag}'`);
  });

  it("should not list the removed whitespace option in --help", () => {
    expect(runCli(["--help"]).stdout).not.toMatch(/whitespace/iu);
  });

  it.each([
    ["an entry", { input: FONT, fontName: "test", ligatures: ["home"], withWhitespace: true }],
    [
      "a batch entry",
      { batch: [{ input: FONT, fontName: "test", ligatures: ["home"], withWhitespace: false }] },
    ],
  ])("should reject withWhitespace in %s of the config file", (_, config) => {
    const cfgDir = fs.mkdtempSync(path.join(tmpDir, "cfg-"));
    fs.writeFileSync(path.join(cfgDir, ".fontextrc.json"), JSON.stringify(config));

    const { stderr, status } = runCli([], cfgDir);

    expect(status).toBe(1);
    expect(stderr).toContain("withWhitespace was removed");
    expect(fs.existsSync(path.join(cfgDir, "test.ttf"))).toBe(false);
  });
});
