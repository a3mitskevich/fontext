import { describe, it, expect } from "vitest";
import { assertAxesOption } from "../src/engines/instance";
import { requiredSfntTable, withTable } from "../src/font/sfnt";
import { extract, textFont, variableFont } from "./setup";

// The fvar of the fixture with the minimum of wdth, its second axis, set to the Fixed 75.3
const FVAR_AXES = 16;
const FVAR_AXIS_SIZE = 20;
const FIXED_ONE = 0x1_00_00;
function withWidthMinimum(minimum: number): Buffer {
  const fvar = new Uint8Array(requiredSfntTable(variableFont, "fvar"));
  new DataView(fvar.buffer).setInt32(
    FVAR_AXES + FVAR_AXIS_SIZE + 4,
    Math.round(minimum * FIXED_ONE),
  );
  return Buffer.from(withTable(variableFont, "fvar", fvar));
}

describe("axes option against the font", () => {
  it.each([
    ["a static font", textFont, { wght: 700 }, "axes is set, but the font has no variation axes"],
    [
      "an axis the font lacks",
      variableFont,
      { opsz: 12 },
      'Unknown axis "opsz". The font has: wght 100-900, wdth 75-100',
    ],
    [
      "a value outside the axis",
      variableFont,
      { wght: 950 },
      'Axis "wght" value 950 is outside the font\'s range 100-900',
    ],
    [
      "a range outside the axis",
      variableFont,
      { wdth: { min: 50, max: 100 } },
      'Axis "wdth" range 50:100 is outside the font\'s range 75-100',
    ],
  ])("should reject %s", async (_, font, axes, message) => {
    const option = { fontName: "test", engine: "subset", characters: "A", axes } as const;
    await expect(extract(font, option)).rejects.toThrow(message);
  });

  it("should take the bound of an axis as the font states it, not its float32 value", async () => {
    const font = withWidthMinimum(75.3);
    const option = { fontName: "test", engine: "subset", characters: "A" } as const;
    await expect(extract(font, { ...option, axes: { wdth: 75.3 } })).resolves.toBeDefined();
    await expect(extract(font, { ...option, axes: { wdth: 75.2 } })).rejects.toThrow(
      'Axis "wdth" value 75.2 is outside the font\'s range 75.3-100',
    );
  });
});

describe("axes option validation", () => {
  it.each([
    ["axes that are not an object", "wght=700", "axes must be an object mapping axis tags"],
    ["axes that are an array", [700], "axes must be an object mapping axis tags"],
    ["a tag over four characters", { weight: 700 }, 'Invalid tag(s) in axes: "weight"'],
    ["an empty tag", { "": 700 }, 'Invalid tag(s) in axes: ""'],
    [
      "a value that is not a number",
      { wght: "700" },
      'Invalid value for axis "wght": "700". Use a finite number, "default" or { min, max } with min <= max',
    ],
    ["a value that is not finite", { wght: Number.NaN }, 'Invalid value for axis "wght": NaN'],
    ["a range without max", { wght: { min: 100 } }, 'Invalid value for axis "wght"'],
    [
      "a range with min over max",
      { wght: { min: 700, max: 600 } },
      'Invalid value for axis "wght"',
    ],
  ])("should reject %s", (_, axes, message) => {
    expect(() => assertAxesOption(axes, "subset")).toThrow(message);
  });

  it("should reject a range in the icon engine, whose font is static", async () => {
    expect(() => assertAxesOption({ wght: { min: 600, max: 700 } }, "icon")).toThrow(
      'The icon engine builds a static font: pin axis "wght" to one value',
    );
    await expect(
      extract(variableFont, {
        fontName: "icons",
        ligatures: ["fi"],
        axes: { wght: { min: 600, max: 700 } },
      }),
    ).rejects.toThrow("The icon engine builds a static font");
  });

  it("should accept pins and ranges", () => {
    expect(() =>
      assertAxesOption({ wght: 700, wdth: { min: 75, max: 75 } }, "subset"),
    ).not.toThrow();
    expect(() => assertAxesOption({}, "icon")).not.toThrow();
    expect(() => assertAxesOption(undefined, "convert")).not.toThrow();
  });
});
