import { afterEach, describe, it, expect, vi } from "vitest";
import type { ExtractedResult, Formats, MinifyOption } from "../src";
import { extract, textFont, ttfOriginalFont } from "./setup";

const FIRST_RUN = new Date("2026-01-01T00:00:00Z");
const SECOND_RUN = new Date("2026-06-01T12:34:56Z");
const ALL_FORMATS: Formats[] = ["ttf", "woff", "woff2", "eot", "svg"];
const BINARY_FORMATS: Formats[] = ["ttf", "woff2"];

// Convert re-encodes every glyph, so it uses the small text font to stay fast on CI runners
const engines: [string, Buffer, MinifyOption][] = [
  ["icon", ttfOriginalFont, { fontName: "stable", ligatures: ["abc"], formats: ALL_FORMATS }],
  [
    "subset",
    ttfOriginalFont,
    { fontName: "stable", engine: "subset", characters: "abc", formats: BINARY_FORMATS },
  ],
  ["convert", textFont, { fontName: "stable", engine: "convert", formats: BINARY_FORMATS }],
];

function extractAt(date: Date, font: Buffer, option: MinifyOption): Promise<ExtractedResult> {
  vi.setSystemTime(date);
  return extract(font, option);
}

const fontsOf = (result: ExtractedResult) =>
  Object.fromEntries(ALL_FORMATS.map((format) => [format, result[format]]));

describe("deterministic output", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it.each(engines)(
    "should produce identical bytes over time in the %s engine",
    async (_, font, option) => {
      vi.useFakeTimers({ toFake: ["Date"] });
      const first = await extractAt(FIRST_RUN, font, option);
      const second = await extractAt(SECOND_RUN, font, option);

      expect(fontsOf(second)).toStrictEqual(fontsOf(first));
    },
  );
});
