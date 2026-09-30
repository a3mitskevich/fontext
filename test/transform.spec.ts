import { describe, it, expect, vi } from "vitest";
import type { FontTransform, MinifyOption } from "../src";
import { toSfnt } from "../src/font/container";
import { sfntTable, withTable } from "../src/font/sfnt";
import { decodeWoff2 } from "../src/woff2";
import { toCollection } from "./font-containers";
import {
  extract,
  importFontext,
  multiLookupFont,
  textFont,
  ttfOriginalFont,
  woff2OriginalFont,
} from "./setup";
import { withRecordPastEnd } from "./ttf-utils";

const MARKER = new TextEncoder().encode("fontext transform");
const SUBSET: MinifyOption = {
  fontName: "text",
  engine: "subset",
  characters: "AVTo",
  safariFix: true,
  formats: ["ttf", "woff", "woff2", "eot"],
};
const ICON: MinifyOption = {
  fontName: "icons",
  ligatures: ["home"],
  formats: ["ttf", "woff", "woff2", "eot"],
};

/** A transform that adds a table holding the marker. */
const addMarker: FontTransform = (ttf) => withTable(ttf, "TEST", MARKER);

type Result = Awaited<ReturnType<typeof extract>>;

function formatOf(result: Result, format: "ttf" | "woff" | "woff2" | "eot"): Buffer {
  const font = result[format];
  if (!font) {
    throw new Error(`No ${format} in the result`);
  }
  return font;
}

/** The marker table of a font in any format, as a plain Uint8Array. */
async function markerOf(font: Buffer): Promise<Uint8Array | undefined> {
  const table = sfntTable(await toSfnt(font, decodeWoff2), "TEST");
  return table && new Uint8Array(table);
}

async function rejectionOf(promise: Promise<unknown>): Promise<Error> {
  try {
    await promise;
  } catch (error) {
    return error as Error;
  }
  throw new Error("The promise did not reject");
}

describe("transform option", () => {
  it.each([
    ["subset", SUBSET, textFont],
    ["icon", ICON, ttfOriginalFont],
    ["convert", { ...SUBSET, engine: "convert" }, textFont],
  ] as const)("should be called once with the final TTF (%s engine)", async (_, option, font) => {
    const transform = vi.fn<FontTransform>((ttf) => ttf);
    const plain = await extract(font, option as MinifyOption);
    const transformed = await extract(font, { ...option, transform } as MinifyOption);

    // Kerning restored and Safari fix applied, as without the hook
    expect(transform).toHaveBeenCalledExactlyOnceWith(new Uint8Array(formatOf(plain, "ttf")));
    expect(transformed.ttf).toStrictEqual(plain.ttf);
  });

  it.each([
    ["subset", SUBSET, textFont],
    ["icon", ICON, ttfOriginalFont],
  ] as const)(
    "should encode its result into every binary format (%s engine)",
    async (_, option, font) => {
      const result = await extract(font, { ...option, transform: addMarker } as MinifyOption);
      for (const format of ["ttf", "woff", "woff2"] as const) {
        await expect(markerOf(formatOf(result, format))).resolves.toStrictEqual(MARKER);
      }
      const ttf = formatOf(result, "ttf");
      // EOT ends with the TTF it wraps, uncompressed
      const eot = formatOf(result, "eot");
      expect(eot.subarray(eot.length - ttf.length)).toStrictEqual(ttf);
      expect(result.report.formats.ttf).toMatchObject({ size: ttf.length });
    },
  );

  it("should accept an async transform", async () => {
    const result = await extract(textFont, {
      ...SUBSET,
      transform: (font) => Promise.resolve(addMarker(font)),
    });
    await expect(markerOf(formatOf(result, "ttf"))).resolves.toStrictEqual(MARKER);
  });

  it.each(["subset", "convert"] as const)(
    "should read meta from the transformed font (%s engine)",
    async (engine) => {
      const option = { fontName: "text", engine, characters: "AVTo", formats: ["ttf"] };
      const { meta } = await extract(textFont, {
        ...option,
        transform: () => new Uint8Array(multiLookupFont),
      } as unknown as MinifyOption);
      const { meta: expected } = await extract(multiLookupFont, {
        fontName: "text",
        engine: "convert",
        formats: ["ttf"],
      });
      expect(meta).toStrictEqual(expected);
    },
  );

  it("should keep the meta of the icon engine", async () => {
    const plain = await extract(ttfOriginalFont, ICON);
    const { meta } = await extract(ttfOriginalFont, { ...ICON, transform: addMarker });
    expect(meta).toStrictEqual(plain.meta);
  });

  it("should not be called when only SVG is written", async () => {
    const transform = vi.fn<FontTransform>((ttf) => ttf);
    await extract(ttfOriginalFont, { ...ICON, formats: ["svg"], transform });
    await extract(textFont, { fontName: "text", engine: "convert", formats: ["svg"], transform });
    expect(transform).not.toHaveBeenCalled();
  });

  it.each([
    ["WOFF2", () => new Uint8Array(woff2OriginalFont), "not WOFF2"],
    ["a collection", (ttf: Uint8Array) => toCollection(Buffer.from(ttf)), "not a font collection"],
    ["a string", () => "font", "transform must return a Uint8Array"],
    [
      "data of no font format",
      () => new Uint8Array(64),
      "transform must return a TrueType or OpenType font",
    ],
    [
      "a font with a glyph table past the end",
      (ttf: Uint8Array) => withRecordPastEnd(ttf, "glyf"),
      "transform returned a malformed font: Malformed glyf table",
    ],
  ])("should reject a result that is %s", async (_, transform, message) => {
    await expect(
      extract(textFont, { ...SUBSET, transform: transform as unknown as FontTransform }),
    ).rejects.toThrow(message);
  });

  it.each([
    [
      "throws",
      (): Uint8Array => {
        throw new Error("boom");
      },
    ],
    ["rejects", (): Promise<Uint8Array> => Promise.reject(new Error("boom"))],
  ])("should reject with the error as the cause when it %s", async (_, transform) => {
    const error = await rejectionOf(extract(textFont, { ...SUBSET, transform }));
    expect(error.message).toBe("transform failed: boom");
    expect(error.cause).toBeInstanceOf(Error);
    expect((error.cause as Error).message).toBe("boom");
  });

  it("should reject a transform that is not a function", async () => {
    const { extract: extractDirectly } = await importFontext();
    const option = { ...SUBSET, transform: "gzip" } as unknown as MinifyOption;
    await expect(extractDirectly(textFont, option)).rejects.toThrow("transform must be a function");
  });
});
