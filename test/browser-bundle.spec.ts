import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { build, type Rolldown } from "vite";

type Output = Rolldown.RolldownOutput["output"];

const ENTRIES = { local: "../src/browser.ts", dist: "../dist/browser.js" };
const testTarget = (process.env.TEST_TARGET as keyof typeof ENTRIES | undefined) ?? "local";
const entry = path.resolve(import.meta.dirname, ENTRIES[testTarget]);
const harfbuzzWasm = fs.readFileSync(
  fileURLToPath(import.meta.resolve("harfbuzzjs/dist/harfbuzz.wasm")),
);

/** Bundles the browser entry for browsers with Vite's defaults, in memory. */
async function bundle(): Promise<Output> {
  const result = await build({
    configFile: false,
    logLevel: "silent",
    root: path.dirname(entry),
    build: {
      write: false,
      rolldownOptions: { input: entry, preserveEntrySignatures: "strict" },
    },
  });
  const [{ output }] = Array.isArray(result) ? result : [result as Rolldown.RolldownOutput];
  return output;
}

describe("browser entry bundled with Vite", () => {
  it("should load HarfBuzz and its WebAssembly lazily", async () => {
    const output = await bundle();
    const chunks = output.filter((item): item is Rolldown.OutputChunk => item.type === "chunk");
    const assets = output.filter((item): item is Rolldown.OutputAsset => item.type === "asset");
    const wasm = assets.find((asset) => asset.fileName.endsWith(".wasm")) as Rolldown.OutputAsset;
    const entryChunk = chunks.find((chunk) => chunk.isEntry);
    const harfbuzzChunk = chunks.find((chunk) => chunk.code.includes(wasm.fileName));

    expect(Buffer.from(wasm.source)).toStrictEqual(harfbuzzWasm);
    expect(entryChunk?.exports).toEqual(
      expect.arrayContaining(["createFont", "findLigaturesByRaws", "findMetaByLigatures"]),
    );
    expect(harfbuzzChunk).toBeDefined();
    expect(entryChunk?.imports).not.toContain(harfbuzzChunk?.fileName);
    expect(entryChunk?.dynamicImports).toContain(harfbuzzChunk?.fileName);
  });
});
