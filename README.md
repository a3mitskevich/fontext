# Fontext

[![npm version](https://img.shields.io/npm/v/fontext)](https://www.npmjs.com/package/fontext)
[![license](https://img.shields.io/npm/l/fontext)](./LICENSE)
[![node](https://img.shields.io/node/v/fontext)](./package.json)

Extract only the glyphs you need from icon fonts and generate optimized, minimal font files.

Instead of shipping a full icon font with hundreds of glyphs to your users, Fontext lets you pull out just the ones you
use — by ligature name or raw unicode — and produces a new font containing only those glyphs. The result is a
dramatically smaller file in any format you need.

## Why Fontext?

Icon fonts like Material Icons or custom ligature-based fonts often contain 1000+ glyphs. If your app only uses 20
icons, you're forcing users to download the entire font. Fontext solves this:

- **Extract by ligature** — pass ligature names like `"home"`, `"search"`, `"menu"`
- **Extract by raw unicode** — pass the actual unicode character and Fontext resolves the ligature automatically
- **Multiple output formats** — SVG, TTF, WOFF, WOFF2, EOT
- **Glyph metadata** — get name, unicode mappings, and SVG path data for each extracted glyph

## Installation

```bash
npm install fontext
```

## CLI

```bash
npx fontext -i material-icons.woff2 -n my-icons -l home,search,menu -f woff2,ttf -o ./fonts
```

| Flag                    | Description                                             |
|-------------------------|---------------------------------------------------------|
| `-i, --input`           | Path to the font file (required)                        |
| `-n, --font-name`       | Name for the output font (required)                     |
| `-l, --ligatures`       | Comma-separated ligature names                          |
| `-r, --raws`            | Comma-separated raw unicode characters                  |
| `-u, --unicode-ranges`  | Comma-separated unicode ranges (e.g. `U+E000-U+E100`)   |
| `-f, --formats`         | Output formats: `svg,ttf,woff,woff2,eot` (default: all) |
| `-o, --output`          | Output directory (default: `.`)                         |
| `-w, --with-whitespace` | Include whitespace glyph                                |

## Quick Start

```javascript
import {extract} from 'fontext';
import fs from 'fs';

const font = fs.readFileSync('material-icons.woff2');

const result = await extract(font, {
    fontName: 'my-icons',
    ligatures: ['home', 'search', 'menu'],
    formats: ['woff2', 'ttf'],
});

// result.woff2 — Buffer with optimized WOFF2 font
// result.ttf  — Buffer with optimized TTF font
// result.meta — glyph metadata (name, unicode, svg)

fs.writeFileSync('my-icons.woff2', result.woff2);
```

## API

### `extract(content, options): Promise<ExtractedResult>`

| Parameter | Type           | Description                                                         |
|-----------|----------------|---------------------------------------------------------------------|
| `content` | `Buffer`       | Font file contents (TTF, WOFF2, or any format supported by fontkit) |
| `options` | `MinifyOption` | Extraction configuration (see below)                                |

### `MinifyOption`

| Field            | Type        | Default     | Description                                                                 |
|------------------|-------------|-------------|-----------------------------------------------------------------------------|
| `fontName`       | `string`    | —           | **Required.** Name for the output font                                      |
| `ligatures`      | `string[]`  | `[]`        | Ligature strings to extract (e.g. `['home', 'search']`)                     |
| `raws`           | `string[]`  | `[]`        | Raw unicode characters — Fontext will resolve their ligatures automatically |
| `unicodeRanges`  | `string[]`  | `[]`        | Unicode ranges to extract (e.g. `['U+E000-U+E100', 'U+F000']`)              |
| `formats`        | `Formats[]` | all formats | Output formats: `'svg'`, `'ttf'`, `'woff'`, `'woff2'`, `'eot'`              |
| `withWhitespace` | `boolean`   | `false`     | Include whitespace glyph in the output                                      |

> At least one of `ligatures`, `raws`, or `unicodeRanges` must be provided.

### Error Handling

`extract()` throws in the following cases:

- Missing or empty `fontName`, `ligatures`/`raws`, or `formats` — `"Illegal option"`
- Font lacks a GSUB ligature lookup table (required for `raws`) — `"Font does not contain a GSUB ligature lookup table"`
- A raw unicode character has no matching ligature — `"Font does not contain a ligature for \"...\""`

### `ExtractedResult`

An object with optional keys for each requested format (`svg`, `ttf`, `woff`, `woff2`, `eot`), each containing a
`Buffer`. Also includes `meta` and `report`:

```typescript
interface GlyphMeta {
    name: string;      // ligature name
    unicode: string[];  // unicode mappings
    svg: string;        // SVG markup for the glyph
}

interface OptimizationReport {
    originalSize: number;  // input font size in bytes
    formats: {
        [format: string]: {
            size: number;    // output size in bytes
            saving: number;  // percentage saved (0-100)
        };
    };
}
```

## Supported Input Formats

Any font format supported by [fontkit](https://github.com/foliojs/fontkit): TTF, OTF, WOFF, WOFF2, TTC, DFONT.

## License

[MIT](./LICENSE)
