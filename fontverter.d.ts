declare module "fontverter" {
  export type FontFormat = "sfnt" | "truetype" | "woff" | "woff2";

  export function detectFormat(buffer: Buffer): Exclude<FontFormat, "truetype">;

  export function convert(
    buffer: Buffer,
    toFormat: FontFormat,
    fromFormat?: FontFormat,
  ): Promise<Buffer>;
}
