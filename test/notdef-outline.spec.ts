import { describe, it, expect } from "vitest";
import * as hb from "harfbuzzjs";
import type { MinifyOption } from "../src";
import { resolveOptimizationOptions } from "../src/cli-optimization";
import { cffFont, extract, scriptsFont } from "./setup";

const NOTDEF = 0;

const notdefPath = (font: Uint8Array): string =>
  new hb.Font(new hb.Face(new hb.Blob(font), 0)).glyphToPath(NOTDEF);

async function outputNotdef(font: Buffer, option: Partial<MinifyOption>): Promise<string> {
  const { ttf } = await extract(font, {
    fontName: "test",
    engine: "subset",
    characters: "abc",
    formats: ["ttf"],
    ...option,
  } as MinifyOption);
  if (!ttf) {
    throw new Error("No TTF in the output");
  }
  return notdefPath(ttf);
}

describe("the outline of .notdef", () => {
  it("should keep the TrueType outline of .notdef on request", async () => {
    expect(notdefPath(scriptsFont)).not.toBe("");
    await expect(outputNotdef(scriptsFont, {})).resolves.toBe("");
    await expect(outputNotdef(scriptsFont, { notdefOutline: true })).resolves.toBe(
      notdefPath(scriptsFont),
    );
  });

  it("should keep the CFF outline of .notdef either way", async () => {
    const source = notdefPath(cffFont);
    expect(source).not.toBe("");
    await expect(outputNotdef(cffFont, {})).resolves.toBe(source);
    await expect(outputNotdef(cffFont, { notdefOutline: true })).resolves.toBe(source);
  });

  it("should keep it in the outline-render preset unless the option says otherwise", async () => {
    const source = notdefPath(scriptsFont);
    await expect(outputNotdef(scriptsFont, { preset: "outline-render" })).resolves.toBe(source);
    await expect(
      outputNotdef(scriptsFont, { preset: "outline-render", notdefOutline: false }),
    ).resolves.toBe("");
    await expect(outputNotdef(scriptsFont, { preset: "web-font" })).resolves.toBe("");
  });

  it("should keep it in the convert engine", async () => {
    const option = { engine: "convert", notdefOutline: true } as const;
    await expect(outputNotdef(scriptsFont, option)).resolves.toBe(notdefPath(scriptsFont));
  });

  it("should take --notdef-outline over the config key", () => {
    const config = { notdefOutline: true };
    expect(resolveOptimizationOptions(config, {}, true).notdefOutline).toBe(true);
    const flags = { "notdef-outline": false };
    expect(resolveOptimizationOptions(config, flags, true).notdefOutline).toBe(false);
  });
});
