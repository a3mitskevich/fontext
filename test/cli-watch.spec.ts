import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawn, type ChildProcess } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";

const CLI = path.resolve(import.meta.dirname, "../dist/cli.js");
const FONT = path.resolve(import.meta.dirname, "../assets/font.ttf");

// Each extraction takes well under a second; the margin keeps slow CI runners green
const WAIT_TIMEOUT = 20_000;
const POLL_INTERVAL = 50;

async function pollUntil(condition: () => boolean, timeout = WAIT_TIMEOUT): Promise<void> {
  const deadline = Date.now() + timeout;
  while (!condition() && Date.now() < deadline) {
    await new Promise((resolve) => {
      setTimeout(resolve, POLL_INTERVAL);
    });
  }
}

// Every extraction ends with the "Watching" line
const hasExtracted =
  (count: number) =>
  (output: string): boolean =>
    output.split("Watching").length - 1 >= count;

async function stop(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) {
    return;
  }
  const exited = new Promise((resolve) => {
    child.once("exit", resolve);
  });
  child.kill();
  await exited;
}

describe("CLI --watch", () => {
  let tmpDir: string;
  let font: Buffer;

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "fontext-cli-watch-"));
    font = fs.readFileSync(FONT);
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("should extract again after in-place writes and replacements by rename", async () => {
    const inputDir = path.join(tmpDir, "input");
    const input = path.join(inputDir, "icons.ttf");
    fs.mkdirSync(inputDir);
    fs.writeFileSync(input, font);

    const child = spawn(
      "node",
      [CLI, "-i", input, "-n", "watched", "-l", "abc", "-f", "ttf", "-o", tmpDir, "--watch"],
      { env: { ...process.env, NO_COLOR: "1" } },
    );
    let output = "";
    child.stdout.on("data", (chunk: Buffer) => {
      output += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      output += chunk.toString();
    });
    const expectExtractions = async (count: number): Promise<void> => {
      await pollUntil(() => hasExtracted(count)(output));
      expect(output).toSatisfy(hasExtracted(count));
    };
    // Editors and build tools save by writing a temporary file and renaming it over the input
    const replaceByRename = (): void => {
      const temporary = path.join(inputDir, ".icons.ttf.tmp");
      fs.writeFileSync(temporary, font);
      fs.renameSync(temporary, input);
    };

    try {
      await expectExtractions(1);

      fs.writeFileSync(input, font);
      await expectExtractions(2);

      replaceByRename();
      await expectExtractions(3);

      replaceByRename();
      await expectExtractions(4);

      expect(fs.existsSync(path.join(tmpDir, "watched.ttf"))).toBe(true);
    } finally {
      await stop(child);
    }
  }, 90_000);
});
