import { describe, it, expect } from "vitest";
import type { MinifyOption } from "../src";
import { requiredSfntTable, sfntTable, withTable } from "../src/font/sfnt";
import { extract, textFont, ttfOriginalFont, variableFont } from "./setup";
import { readKernPairs } from "./ttf-utils";

// A PCLT table is 54 bytes; its content doesn't matter to the copy
const PCLT_LENGTH = 54;
const pclt = Uint8Array.from({ length: PCLT_LENGTH }, (_, index) => index);
const pcltFont = Buffer.from(withTable(textFont, "PCLT", pclt));

async function ttfOf(font: Buffer, option: Partial<MinifyOption>): Promise<Buffer> {
  const { ttf } = await extract(font, {
    fontName: "test",
    formats: ["ttf"],
    ...option,
  } as MinifyOption);
  if (!ttf) {
    throw new Error("No TTF in the result");
  }
  return ttf;
}

type EngineCase = [engine: string, option: Partial<MinifyOption>];

const SOURCE_ENGINES: EngineCase[] = [
  ["subset", { engine: "subset", characters: "AVfi" }],
  ["convert", { engine: "convert" }],
];

describe("keepTables option", () => {
  it.each(SOURCE_ENGINES)("should copy meta from the source (%s engine)", async (_, option) => {
    expect(sfntTable(await ttfOf(variableFont, option), "meta")).toBeUndefined();
    const ttf = await ttfOf(variableFont, { ...option, keepTables: ["meta"] });
    expect(sfntTable(ttf, "meta")).toStrictEqual(sfntTable(variableFont, "meta"));
  });

  it.each(SOURCE_ENGINES)("should copy PCLT from the source (%s engine)", async (_, option) => {
    expect(sfntTable(await ttfOf(pcltFont, option), "PCLT")).toBeUndefined();
    const ttf = await ttfOf(pcltFont, { ...option, keepTables: ["PCLT"] });
    expect(Buffer.from(requiredSfntTable(ttf, "PCLT"))).toStrictEqual(Buffer.from(pclt));
  });

  it("should keep gasp without hinting", async () => {
    const option = { engine: "subset", characters: "abc", hinting: false } as const;
    expect(sfntTable(await ttfOf(textFont, option), "gasp")).toBeUndefined();
    const ttf = await ttfOf(textFont, { ...option, keepTables: ["gasp"] });
    expect(sfntTable(ttf, "gasp")).toStrictEqual(sfntTable(textFont, "gasp"));
    expect(sfntTable(ttf, "fpgm")).toBeUndefined();
  });

  it("should change nothing for tables the output keeps anyway", async () => {
    const option = { engine: "subset", characters: "abc" } as const;
    await expect(ttfOf(textFont, { ...option, keepTables: ["gasp"] })).resolves.toStrictEqual(
      await ttfOf(textFont, option),
    );
  });

  it("should change nothing for tables the source lacks", async () => {
    const option = { engine: "subset", characters: "abc" } as const;
    await expect(
      ttfOf(textFont, { ...option, keepTables: ["meta", "PCLT"] }),
    ).resolves.toStrictEqual(await ttfOf(textFont, option));
  });

  it("should restore legacy kerning next to the kept tables", async () => {
    const ttf = await ttfOf(pcltFont, {
      engine: "subset",
      characters: "AVTWYavy",
      keepTables: ["PCLT"],
    });
    expect(sfntTable(ttf, "PCLT")).toBeDefined();
    expect(readKernPairs(ttf).length).toBeGreaterThan(0);
  });

  it("should check keepTables in the icon engine, which ignores them", async () => {
    const option = { fontName: "icons", ligatures: ["home"], keepTables: ["LTSH"] };
    await expect(extract(ttfOriginalFont, option as MinifyOption)).rejects.toThrow(
      'Invalid tag(s) in keepTables: "LTSH"',
    );
  });
});
