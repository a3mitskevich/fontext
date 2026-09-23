import { describe, it, expect } from "vitest";
import { extract, ttfOriginalFont } from "./setup";

// Contours that start at an off-curve point, which fontkit drew with a wrong first segment.
// The expected paths match fontTools, flipped to the SVG y axis
const OFF_CURVE_STARTS = [
  [
    "fiber_manual_record",
    "M135.5 -135.5Q85 -186 85 -256Q85 -326 135.5 -376.5Q186 -427 256 -427Q326 -427 376.5 -376.5Q427 -326 427 -256Q427 -186 376.5 -135.5Q326 -85 256 -85Q186 -85 135.5 -135.5Z",
  ],
  [
    "play_circle_filled",
    "M213 -160L341 -256L213 -352ZM105.5 -406.5Q168 -469 256 -469Q344 -469 406.5 -406.5Q469 -344 469 -256Q469 -168 406.5 -105.5Q344 -43 256 -43Q168 -43 105.5 -105.5Q43 -168 43 -256Q43 -344 105.5 -406.5Z",
  ],
] as const;

describe("glyph outlines", () => {
  it.each(OFF_CURVE_STARTS)(
    "should start %s at the implied on-curve point",
    async (ligature, path) => {
      const { meta } = await extract(ttfOriginalFont, {
        fontName: "outlines",
        ligatures: [ligature],
        formats: ["svg"],
      });
      expect(meta.map((glyph) => glyph.name)).toStrictEqual([ligature]);
      expect(meta[0].svg).toContain(`d="${path}"`);
    },
  );
});
