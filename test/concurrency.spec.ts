import { describe, it, expect } from "vitest";
import { compress } from "wawoff2";
import type { ExtractedResult, MinifyOption } from "../src";
import { createFont } from "../src/glyphs";
import {
  cffFont,
  extract,
  multiLookupFont,
  textFont,
  ttfOriginalFont,
  woff2OriginalFont,
} from "./setup";

type Call = [Buffer, MinifyOption];

// Different fonts and engines, so a result overwritten by another call cannot come out the same
const woff2Calls: Call[] = [
  [multiLookupFont, { fontName: "multi", ligatures: ["abc"], formats: ["woff2"] }],
  [ttfOriginalFont, { fontName: "icons", ligatures: ["home"], formats: ["woff2"] }],
  [textFont, { fontName: "text", engine: "subset", characters: "abc", formats: ["woff2"] }],
  [cffFont, { fontName: "cff", engine: "subset", characters: "fixz", formats: ["woff2"] }],
  [textFont, { fontName: "all", engine: "convert", formats: ["woff2"] }],
];

async function extractOneByOne(calls: Call[]): Promise<ExtractedResult[]> {
  const results: ExtractedResult[] = [];
  for (const [font, option] of calls) {
    results.push(await extract(font, option));
  }
  return results;
}

const extractAtOnce = (calls: Call[]) =>
  Promise.all(calls.map(([font, option]) => extract(font, option)));

describe("concurrent calls", () => {
  it("should encode the same WOFF2 as calls made one by one", async () => {
    const alone = await extractOneByOne(woff2Calls);
    const together = await extractAtOnce(woff2Calls);

    expect(together.map((result) => result.woff2)).toStrictEqual(
      alone.map((result) => result.woff2),
    );
  });

  it("should encode WOFF2 that decodes to a readable font", async () => {
    const together = await extractAtOnce(woff2Calls);

    const files = together
      .map((result) => result.woff2)
      .filter((woff2): woff2 is Buffer => woff2 !== undefined);

    expect(files).toHaveLength(woff2Calls.length);
    for (const woff2 of files) {
      expect(woff2.toString("latin1", 0, 4)).toBe("wOF2");
      const font = await createFont(woff2);
      expect(font.codePoints.length).toBeGreaterThan(0);
    }
  });

  it("should decode WOFF2 inputs as calls made one by one do", async () => {
    const [multiWoff2, textWoff2, iconsWoff2] = [
      Buffer.from(await compress(multiLookupFont)),
      Buffer.from(await compress(textFont)),
      Buffer.from(await compress(ttfOriginalFont)),
    ];
    const calls: Call[] = [
      [iconsWoff2, { fontName: "icons", ligatures: ["home"], formats: ["ttf"] }],
      [multiWoff2, { fontName: "multi", ligatures: ["abc"], formats: ["ttf"] }],
      [textWoff2, { fontName: "text", engine: "subset", characters: "abc", formats: ["ttf"] }],
      [iconsWoff2, { fontName: "sub", engine: "subset", characters: "home", formats: ["ttf"] }],
      [multiWoff2, { fontName: "multi", engine: "subset", characters: "abc", formats: ["ttf"] }],
      [textWoff2, { fontName: "all", engine: "convert", formats: ["ttf"] }],
    ];

    const alone = await extractOneByOne(calls);
    const together = await extractAtOnce(calls);

    expect(together.map((result) => result.ttf)).toStrictEqual(alone.map((result) => result.ttf));
  });

  it("should keep decoding after a WOFF2 input fails to decode", async () => {
    // A valid header over a zeroed body, so the WOFF2 decoder itself fails
    const corrupt = Buffer.from(woff2OriginalFont).fill(0, 48);
    const option: MinifyOption = { fontName: "icons", ligatures: ["home"], formats: ["ttf"] };
    const [alone] = await extractOneByOne([[woff2OriginalFont, option]]);

    const [failed, decoded] = await Promise.allSettled([
      extract(corrupt, option),
      extract(woff2OriginalFont, option),
    ]);

    expect(failed).toMatchObject({
      status: "rejected",
      reason: { message: "ConvertWOFF2ToTTF failed" },
    });
    expect(decoded).toMatchObject({ status: "fulfilled", value: { ttf: alone?.ttf } });
  });
});
