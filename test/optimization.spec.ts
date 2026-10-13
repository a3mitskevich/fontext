import { describe, it, expect } from "vitest";
import { assertOptimizationOptions, resolveOptimization } from "../src/optimization";
import type { ConvertOption, IconOption, MinifyOption, SubsetOption } from "../src/types";
import { extract, textFont, ttfOriginalFont } from "./setup";

const ALL_FORMATS = ["ttf", "eot", "woff", "woff2", "svg"];
const icon: IconOption = { fontName: "icons", ligatures: ["home"] };
const subset: SubsetOption = { fontName: "text", engine: "subset", characters: "abc" };
const convert: ConvertOption = { fontName: "text", engine: "convert" };

describe("resolveOptimization", () => {
  it.each([
    ["icon", icon, ALL_FORMATS],
    ["subset", subset, ["ttf", "woff", "woff2"]],
    ["convert", convert, ALL_FORMATS],
  ] as const)(
    "should keep what the %s engine kept before without options",
    (_, option, formats) => {
      expect(resolveOptimization(option)).toStrictEqual({
        formats,
        hinting: true,
        layoutFeatures: "all",
        nameIds: undefined,
        nameLanguages: undefined,
        dropTables: [],
        keepTables: [],
        desubroutinize: false,
        glyphNames: false,
      });
    },
  );

  it.each([
    ["icon", icon],
    ["subset", subset],
    ["convert", convert],
  ] as const)("should resolve the web target (%s engine)", (_, option) => {
    expect(resolveOptimization({ ...option, target: "web" })).toStrictEqual({
      formats: ["woff2"],
      hinting: true,
      layoutFeatures: "default",
      nameIds: [1, 2, 4, 6],
      nameLanguages: undefined,
      dropTables: [],
      keepTables: [],
      desubroutinize: true,
      glyphNames: false,
    });
  });

  it.each([
    ["icon", icon],
    ["subset", subset],
    ["convert", convert],
  ] as const)("should resolve the runtime target (%s engine)", (_, option) => {
    expect(resolveOptimization({ ...option, target: "runtime" })).toStrictEqual({
      formats: ["ttf"],
      hinting: false,
      layoutFeatures: "default",
      nameIds: [1, 2, 4, 6],
      nameLanguages: undefined,
      dropTables: [],
      keepTables: [],
      desubroutinize: false,
      glyphNames: false,
    });
  });

  it("should let explicit options override the target", () => {
    const runtime: SubsetOption = {
      ...subset,
      target: "runtime",
      formats: ["ttf", "woff2"],
      hinting: true,
      layoutFeatures: "all",
      nameIds: [4],
      nameLanguages: undefined,
      dropTables: ["DSIG"],
    };
    expect(resolveOptimization(runtime)).toStrictEqual({
      formats: ["ttf", "woff2"],
      hinting: true,
      layoutFeatures: "all",
      nameIds: [4],
      nameLanguages: undefined,
      dropTables: ["DSIG"],
      keepTables: [],
      desubroutinize: false,
      glyphNames: false,
    });
    const web: SubsetOption = {
      ...subset,
      target: "web",
      hinting: false,
      layoutFeatures: ["liga"],
    };
    expect(resolveOptimization(web)).toMatchObject({
      formats: ["woff2"],
      hinting: false,
      layoutFeatures: ["liga"],
      desubroutinize: true,
      glyphNames: false,
    });
  });

  it("should take the explicit options", () => {
    const option: SubsetOption = {
      ...subset,
      formats: ["woff"],
      hinting: false,
      layoutFeatures: "default",
      nameIds: [1, 4],
      nameLanguages: "all",
      dropTables: ["MATH", "DSIG"],
      keepTables: ["gasp", "meta"],
      glyphNames: true,
    };
    expect(resolveOptimization(option)).toStrictEqual({
      formats: ["woff"],
      hinting: false,
      layoutFeatures: "default",
      nameIds: [1, 4],
      nameLanguages: "all",
      dropTables: ["MATH", "DSIG"],
      keepTables: ["gasp", "meta"],
      desubroutinize: false,
      glyphNames: true,
    });
  });

  it("should pad tags shorter than four characters with spaces", () => {
    const { layoutFeatures, dropTables } = resolveOptimization({
      ...convert,
      layoutFeatures: ["liga", "ss1"],
      dropTables: ["cvt", "CFF", "a"],
    });
    expect(
      resolveOptimization({ ...convert, keepTables: ["PCLT", "gasp"] }).keepTables,
    ).toStrictEqual(["PCLT", "gasp"]);
    expect(layoutFeatures).toStrictEqual(["liga", "ss1 "]);
    expect(dropTables).toStrictEqual(["cvt ", "CFF ", "a   "]);
  });

  it("should not change the options", () => {
    const option = { ...subset, layoutFeatures: ["ss1"], dropTables: ["cvt"] };
    resolveOptimization(option);
    expect(option).toStrictEqual({ ...subset, layoutFeatures: ["ss1"], dropTables: ["cvt"] });
  });
});

describe("optimization option validation", () => {
  it.each([
    [
      "an unknown target",
      { target: "print" },
      'Invalid target: "print". Valid targets: web, runtime',
    ],
    ["a target that is not a string", { target: 1 }, "Invalid target: 1"],
    ["a target named after an object property", { target: "toString" }, "Invalid target"],
    ["hinting that is not a boolean", { hinting: "no" }, "hinting must be a boolean"],
    ["glyphNames that is not a boolean", { glyphNames: 1 }, "glyphNames must be a boolean"],
    [
      "nameLanguages that are neither all nor an array",
      { nameLanguages: "en" },
      'nameLanguages must be "all" or an array of language ids',
    ],
    [
      "name languages out of range or fractional",
      { nameLanguages: [0x4_09, -1, 65_536, 1.5, "ru"] },
      'Invalid name language(s): -1, 65536, 1.5, "ru". A language id is an integer from 0 to 65535',
    ],
    [
      "an unknown layoutFeatures keyword",
      { layoutFeatures: "none" },
      'Invalid layoutFeatures: "none"',
    ],
    ["layoutFeatures of the wrong type", { layoutFeatures: 5 }, "layoutFeatures must be an array"],
    [
      "a feature tag over four characters",
      { layoutFeatures: ["liga", "ligature"] },
      'Invalid tag(s) in layoutFeatures: "ligature"',
    ],
    ["an empty feature tag", { layoutFeatures: [""] }, 'Invalid tag(s) in layoutFeatures: ""'],
    [
      "a feature tag with a non-ASCII character",
      { layoutFeatures: ["lïga"] },
      'Invalid tag(s) in layoutFeatures: "lïga"',
    ],
    ["nameIds that are not an array", { nameIds: 1 }, "nameIds must be an array of integers"],
    [
      "name ids out of range or fractional",
      { nameIds: [1, -1, 32_768, 1.5, "4"] },
      'Invalid name id(s): -1, 32768, 1.5, "4"',
    ],
    ["dropTables that are not an array", { dropTables: "DSIG" }, "dropTables must be an array"],
    [
      "a table tag over four characters",
      { dropTables: ["DSIG", "GSUBX", 7] },
      'Invalid tag(s) in dropTables: "GSUBX", 7',
    ],
    [
      "a table the font needs",
      { dropTables: ["DSIG", "head", "OS/2"] },
      'Invalid tag(s) in dropTables: "head", "OS/2". The font needs these tables: cmap, head, hhea, hmtx, maxp, name, OS/2, post, glyf, loca, CFF, CFF2',
    ],
    [
      "a short tag of a table the font needs",
      { dropTables: ["CFF"] },
      'dropTables: "CFF". The font needs',
    ],
    ["keepTables that are not an array", { keepTables: "meta" }, "keepTables must be an array"],
    [
      "a table whose data refers to glyph ids",
      { keepTables: ["meta", "LTSH", "DSIG", "fpgm"] },
      'Invalid tag(s) in keepTables: "LTSH", "DSIG", "fpgm". keepTables brings back tables HarfBuzz drops whose data refers to no glyph id, and gasp: gasp, meta, PCLT. The other hinting tables follow the hinting option',
    ],
    [
      "a table both kept and dropped",
      { keepTables: ["meta", "gasp"], dropTables: ["gasp", "DSIG"] },
      'keepTables and dropTables both name: "gasp"',
    ],
  ])("should reject %s", (_, option, message) => {
    expect(() => assertOptimizationOptions(option)).toThrow(message);
  });

  it("should accept valid options and empty lists", () => {
    expect(() =>
      assertOptimizationOptions({
        hinting: false,
        layoutFeatures: ["liga", "ss1", "cv01"],
        nameIds: [0, 32_767],
        nameLanguages: [0, 0x4_09, 0xff_ff],
        keepTables: ["gasp", "meta", "PCLT"],
        dropTables: [],
      }),
    ).not.toThrow();
    expect(() => assertOptimizationOptions({ layoutFeatures: [], nameIds: [] })).not.toThrow();
  });

  it.each([
    ["subset", textFont, { engine: "subset", characters: "abc", hinting: 0 }, "hinting"],
    ["icon", ttfOriginalFont, { ligatures: ["home"], layoutFeatures: "some" }, "layoutFeatures"],
    ["convert", textFont, { engine: "convert", nameIds: [70_000] }, "Invalid name id(s): 70000"],
    ["icon", ttfOriginalFont, { ligatures: ["home"], dropTables: ["cmap"] }, 'dropTables: "cmap"'],
    ["subset", textFont, { engine: "subset", characters: "a", dropTables: ["glyf"] }, '"glyf"'],
    ["convert", textFont, { engine: "convert", dropTables: ["loca", "post"] }, '"loca", "post"'],
  ])("should reject invalid options in extract() (%s engine)", async (_, font, option, message) => {
    const invalid = { fontName: "test", formats: ["ttf"], ...option } as unknown as MinifyOption;
    await expect(extract(font, invalid)).rejects.toThrow(message);
  });
});
