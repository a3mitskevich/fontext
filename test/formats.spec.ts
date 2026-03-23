import { describe, it, expect } from "vitest";
import { extract, ttfOriginalFont } from "./setup";

describe("output formats", () => {
  it("should produce SVG output", async () => {
    const { svg } = await extract(ttfOriginalFont, {
      fontName: "test-icons",
      ligatures: ["abc"],
      formats: ["svg"],
    });
    expect(svg).toBeInstanceOf(Buffer);
    expect(svg?.toString()).toContain("<svg");
  });

  it("should produce WOFF output", async () => {
    const { woff } = await extract(ttfOriginalFont, {
      fontName: "test-icons",
      ligatures: ["abc"],
      formats: ["woff"],
    });
    expect(woff).toBeInstanceOf(Buffer);
    expect(woff?.length).toBeGreaterThan(0);
  });

  it("should produce EOT output", async () => {
    const { eot } = await extract(ttfOriginalFont, {
      fontName: "test-icons",
      ligatures: ["abc"],
      formats: ["eot"],
    });
    expect(eot).toBeInstanceOf(Buffer);
    expect(eot?.length).toBeGreaterThan(0);
  });

  it("should produce all formats at once", async () => {
    const result = await extract(ttfOriginalFont, {
      fontName: "test-icons",
      ligatures: ["abc"],
    });
    expect(result.svg).toBeInstanceOf(Buffer);
    expect(result.ttf).toBeInstanceOf(Buffer);
    expect(result.woff).toBeInstanceOf(Buffer);
    expect(result.woff2).toBeInstanceOf(Buffer);
    expect(result.eot).toBeInstanceOf(Buffer);
  });
});
