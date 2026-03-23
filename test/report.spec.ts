import { describe, it, expect } from "vitest";
import { extract, ttfOriginalFont } from "./setup";

describe("optimization report", () => {
  it("should include report with original size and format savings", async () => {
    const result = await extract(ttfOriginalFont, {
      fontName: "test-icons",
      ligatures: ["abc"],
      formats: ["ttf", "woff2"],
    });
    expect(result.report).toBeDefined();
    expect(result.report.originalSize).toBe(ttfOriginalFont.length);
    expect(result.report.formats.ttf).toBeDefined();
    expect(result.report.formats.ttf?.size).toBeGreaterThan(0);
    expect(result.report.formats.ttf?.saving).toBeGreaterThan(0);
    expect(result.report.formats.woff2).toBeDefined();
    expect(result.report.formats.woff2?.saving).toBeGreaterThan(90);
  });
});
