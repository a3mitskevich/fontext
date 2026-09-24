import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawnSync } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";
import { withTable } from "../src/font/sfnt";
import { textFont } from "./setup";
import { kernTable } from "./ttf-utils";

const CLI = path.resolve(import.meta.dirname, "../dist/cli.js");

const runCli = (args: string[]) =>
  spawnSync("node", [CLI, ...args], { encoding: "utf8", timeout: 10_000 });

describe("CLI legacy kern warning", () => {
  let tmpDir: string;
  let args: string[];

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "fontext-cli-warnings-"));
    // A kern table cut short: the subset leaves it out and warns
    const kern = kernTable([{ coverage: 1, pairs: [[1, 2, -80]] }]).subarray(0, -2);
    const input = path.join(tmpDir, "malformed-kern.ttf");
    fs.writeFileSync(input, withTable(textFont, "kern", kern));
    args = ["-i", input, "-n", "kerning", "--engine", "subset", "-c", "AV", "-f", "ttf"];
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("should include warnings in the JSON output", () => {
    const { stdout, status } = runCli([...args, "-o", path.join(tmpDir, "json"), "--json"]);

    expect(status).toBe(0);
    expect(JSON.parse(stdout).warnings).toStrictEqual([
      { code: "legacy-kern", message: expect.stringContaining("the table is malformed") },
    ]);
  });

  it("should print warnings to stderr", () => {
    const { stderr, status } = runCli([...args, "-o", path.join(tmpDir, "text")]);

    expect(status).toBe(0);
    expect(stderr).toContain("warning");
    expect(stderr).toContain("kerning: The font kerns in the legacy kern table");
  });

  it("should print no warnings with --silent", () => {
    const { stderr, status } = runCli([...args, "-o", path.join(tmpDir, "silent"), "--silent"]);

    expect(status).toBe(0);
    expect(stderr).toBe("");
  });
});
