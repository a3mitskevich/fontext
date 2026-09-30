import { describe, it, expect } from "vitest";
import * as hb from "harfbuzzjs";
import type { IconOption } from "../src";
import type { GlyphMeta } from "../src/types";
import { createFont } from "../src/glyphs";
import { sfntTable } from "../src/font/sfnt";
import { glyphCount } from "../src/font/tables";
import svg2ttf from "svg2ttf";
import { cffFont, extract, multiLookupFont, ttfOriginalFont } from "./setup";

/* The icon engine rewrites the TTF of svg2ttf with hb-subset: every glyph, code point and
   layout feature stays, the cmap, post and name tables shrink */

const MATERIAL_20 = [
  "home",
  "search",
  "settings",
  "menu",
  "close",
  "add",
  "delete",
  "edit",
  "favorite",
  "star",
  "check",
  "arrow_back",
  "arrow_forward",
  "info",
  "warning",
  "person",
  "shopping_cart",
  "visibility",
  "lock",
  "refresh",
];

interface Selection {
  ligatures: string[];
  unicodeRanges?: string[];
}

const CASES: [string, Buffer, Selection][] = [
  ["Material Icons", ttfOriginalFont, { ligatures: MATERIAL_20 }],
  ["the CFF font", cffFont, { ligatures: ["fi", "xy", "x"], unicodeRanges: ["U+0066"] }],
  [
    "the multi-lookup font",
    multiLookupFont,
    { ligatures: ["abc", "def", "ghi", "jkl"], unicodeRanges: ["U+0061-U+0063"] },
  ],
];

const POST_FORMAT_3 = 0x3_00_00;
const POST_HEADER_SIZE = 32;
const PLATFORM_WINDOWS = 3;
const ENCODING_UNICODE_BMP = 1;
const LANGUAGE_ENGLISH_US = 0x4_09;
const CMAP_FORMAT_4 = 4;
// The date fields of head: created, then modified, each a 64-bit count of seconds since 1904
const HEAD_CREATED = 20;
const HEAD_MODIFIED = 28;
const OPENTYPE_EPOCH_OFFSET = 2_082_844_800;

const option = (extra: Partial<IconOption>): IconOption => ({
  fontName: "icons",
  formats: ["ttf", "woff2"],
  ...extra,
});

const bytesOf = (font: Uint8Array) => Buffer.from(font.buffer, font.byteOffset, font.byteLength);

function table(font: Buffer, tag: string): Buffer {
  const data = sfntTable(font, tag);
  if (!data) {
    throw new Error(`The font has no ${tag} table`);
  }
  return bytesOf(data);
}

/** Platform, encoding, language and name id of every name record. */
function nameRecords(font: Buffer) {
  const name = table(font, "name");
  return Array.from({ length: name.readUInt16BE(2) }, (_, index) => {
    const record = 6 + index * 12;
    return {
      platform: name.readUInt16BE(record),
      encoding: name.readUInt16BE(record + 2),
      language: name.readUInt16BE(record + 4),
      nameId: name.readUInt16BE(record + 6),
    };
  });
}

/** Platform, encoding and subtable format of every cmap encoding record. */
function cmapRecords(font: Buffer) {
  const cmap = table(font, "cmap");
  return Array.from({ length: cmap.readUInt16BE(2) }, (_, index) => {
    const record = 4 + index * 8;
    const offset = cmap.readUInt32BE(record + 4);
    return {
      platform: cmap.readUInt16BE(record),
      encoding: cmap.readUInt16BE(record + 2),
      offset,
      format: cmap.readUInt16BE(offset),
    };
  });
}

/** A head date as Unix time in seconds. */
const headDate = (font: Buffer, at: number): number =>
  Number(table(font, "head").readBigInt64BE(at)) - OPENTYPE_EPOCH_OFFSET;

describe("icon engine TTF repack", () => {
  it.each(CASES)("should write post without glyph names for %s", async (_, font, extra) => {
    const { ttf } = await extract(font, option(extra));
    const post = table(ttf as Buffer, "post");

    expect(post.readUInt32BE(0)).toBe(POST_FORMAT_3);
    expect(post).toHaveLength(POST_HEADER_SIZE);
  });

  it.each(CASES)(
    "should keep only the family, subfamily, full and PostScript names of %s in Windows English",
    async (_, font, extra) => {
      const { ttf } = await extract(font, option(extra));
      const records = nameRecords(ttf as Buffer);

      expect(records.map(({ nameId }) => nameId)).toStrictEqual([1, 2, 4, 6]);
      for (const record of records) {
        expect(record).toMatchObject({
          platform: PLATFORM_WINDOWS,
          encoding: ENCODING_UNICODE_BMP,
          language: LANGUAGE_ENGLISH_US,
        });
      }
    },
  );

  it.each(CASES)(
    "should share one BMP cmap subtable between the platforms of %s",
    async (_, font, extra) => {
      const { ttf } = await extract(font, option(extra));
      const records = cmapRecords(ttf as Buffer);

      expect(records.some(({ platform }) => platform === PLATFORM_WINDOWS)).toBe(true);
      expect(new Set(records.map(({ offset }) => offset)).size).toBe(1);
      expect(records.map(({ format }) => format)).toStrictEqual(records.map(() => CMAP_FORMAT_4));
    },
  );

  it.each(CASES)(
    "should keep every glyph, code point and advance svg2ttf wrote for %s",
    async (_, font, extra) => {
      const { svg, ttf } = await extract(font, option({ ...extra, formats: ["svg", "ttf"] }));
      const writtenTtf = Buffer.from(svg2ttf((svg as Buffer).toString()).buffer);
      const written = await createFont(writtenTtf);
      const output = await createFont(ttf as Buffer);
      const glyphs = glyphCount(table(writtenTtf, "maxp"));

      // Keeping every glyph, hb-subset keeps their ids too
      expect(glyphCount(table(ttf as Buffer, "maxp"))).toBe(glyphs);
      expect(output.codePoints).toStrictEqual(written.codePoints);
      for (const codePoint of written.codePoints) {
        expect(output.glyphForCodePoint(codePoint)).toBe(written.glyphForCodePoint(codePoint));
      }
      for (let glyph = 0; glyph < glyphs; glyph++) {
        expect(output.advanceWidth(glyph)).toBe(written.advanceWidth(glyph));
        expect(output.svgPath(glyph)).toBe(written.svgPath(glyph));
      }
    },
  );

  it.each(CASES)("should form every requested ligature of %s", async (_, font, extra) => {
    const { ttf, meta } = await extract(font, option(extra));
    const output = await createFont(ttf as Buffer);

    for (const text of extra.ligatures) {
      const shaped = output.shape(text);
      expect(shaped).toHaveLength(1);
      expect(shaped[0].id).not.toBe(0);
      expect(output.svgPath(shaped[0].id)).not.toBe("");
      const glyph = meta.find(({ name }) => name === text) as GlyphMeta;
      for (const char of glyph.unicode) {
        expect(output.glyphForCodePoint(char.codePointAt(0) as number)).toBe(shaped[0].id);
      }
    }
  });

  it("should keep the liga feature of svg2ttf under DFLT and latn", async () => {
    const { ttf } = await extract(ttfOriginalFont, option({ ligatures: MATERIAL_20 }));
    const face = new hb.Face(new hb.Blob(ttf as Buffer), 0);
    const scripts = face.getTableScriptTags("GSUB");

    expect(scripts).toStrictEqual(["DFLT", "latn"]);
    for (const [index] of scripts.entries()) {
      expect(face.getScriptLanguageTags("GSUB", index)).toStrictEqual([]);
      // The default language system of a script has the index 0xFFFF
      expect(face.getLanguageFeatureTags("GSUB", index, 0xff_ff)).toStrictEqual(["liga"]);
    }
  });

  it("should keep the source font's head.modified as the created and modified dates", async () => {
    const source = await createFont(ttfOriginalFont);
    const { ttf } = await extract(ttfOriginalFont, option({ ligatures: ["home"] }));

    expect(source.modified).toBeGreaterThan(0);
    expect(headDate(ttf as Buffer, HEAD_CREATED)).toBe(source.modified);
    expect(headDate(ttf as Buffer, HEAD_MODIFIED)).toBe(source.modified);
  });

  it("should apply the Safari fix to the repacked font", async () => {
    const { ttf } = await extract(
      ttfOriginalFont,
      option({ ligatures: ["home"], safariFix: true }),
    );
    const os2 = table(ttf as Buffer, "OS/2");
    const hhea = table(ttf as Buffer, "hhea");

    expect(table(ttf as Buffer, "post").readUInt32BE(0)).toBe(POST_FORMAT_3);
    expect(os2.readUInt16BE(8)).toBe(0);
    expect(os2.readUInt16BE(62) & 0x80).toBe(0x80);
    expect(hhea.readInt16BE(4)).toBe(os2.readInt16BE(68));
    expect(hhea.readInt16BE(6)).toBe(os2.readInt16BE(70));
  });

  it("should keep 20 Material Icons within a WOFF2 size budget", async () => {
    const { woff2 } = await extract(ttfOriginalFont, option({ ligatures: MATERIAL_20 }));

    // 2 204 bytes as svg2ttf wrote it on an em of 1000 units, 1 592 repacked at the source's 512
    expect(woff2?.length).toBeLessThanOrEqual(1620);
  });
});
