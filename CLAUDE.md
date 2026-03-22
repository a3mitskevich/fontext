# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Fontext is a Node.js library for extracting font glyphs by ligatures from font files and creating new minimized fonts in multiple formats (SVG, TTF, WOFF, WOFF2, EOT). It uses fontkit for font parsing, Handlebars for SVG templating, and various converters (svg2ttf, ttf2woff, ttf2woff2, ttf2eot) for format conversion.

## Commands

- **Build:** `npm run build` (uses tsup, outputs CJS + ESM to `dist/`, copies `svg.hbs` template)
- **Test:** `npm test` (Jest with ts-jest, requires `--experimental-vm-modules`)
- **Test against dist:** `npm run test:dist` (runs tests against built output)
- **Lint:** `npm run lint` / `npm run lint:fix` (ESLint with TypeScript)

## Architecture

The library has a single public entry point: the `extract()` async function exported from `src/index.ts`.

**Pipeline (`src/extract.ts`):**
1. `findLigaturesByRaws()` — resolves raw unicode/symbols to ligature strings by parsing the font's GSUB table
2. `findMetaByLigatures()` — uses fontkit to layout ligatures, extracts glyph SVGs via path transforms (scale -1,1 + rotate π)
3. `convertToSvgFont()` — assembles individual glyph SVGs into an SVG font using SVGIcons2SVGFontStream
4. `convertByFormats()` — converts the SVG font to requested output formats (TTF first via svg2ttf, then WOFF/WOFF2/EOT from TTF)

**Key types (`src/types.ts`):** `MinifyOption` (input config), `ExtractedResult` (output map of format→Buffer + meta), `GlyphMeta` (name, unicode, svg per glyph).

## Testing

Tests use a real font file from `assets/` (TTF and WOFF2 variants). The test suite supports running against either source (`src/`) or built output (`dist/`) controlled by `TEST_TARGET` env var. Tests verify extraction, format conversion, and metadata correctness.

## Build Output

Dual CJS/ESM output via tsup. The `svg.hbs` Handlebars template is copied to `dist/` as a runtime dependency (loaded via `fs.readFileSync` + `__dirname`).