import { describe, it, expect } from "vitest";
import { extract, ttfOriginalFont } from "./setup";

describe("silent option", () => {
  it("should produce the same result with silent: true", async () => {
    const normal = await extract(ttfOriginalFont, {
      fontName: "test-icons",
      ligatures: ["abc"],
      formats: ["woff2", "ttf"],
    });
    const silent = await extract(ttfOriginalFont, {
      fontName: "test-icons",
      ligatures: ["abc"],
      formats: ["woff2", "ttf"],
      silent: true,
    });
    expect(silent.ttf?.length).toBe(normal.ttf?.length);
    expect(silent.woff2?.length).toBe(normal.woff2?.length);
    expect(silent.meta).toEqual(normal.meta);
    expect(silent.report).toEqual(normal.report);
  });
});
