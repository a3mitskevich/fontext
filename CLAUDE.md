# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Fontext is a Node.js (>=20) library for extracting font glyphs by ligatures from font files and creating new minimized fonts in multiple formats (SVG, TTF, WOFF, WOFF2, EOT). It uses fontkit for font parsing, Handlebars for SVG templating, and various converters (svg2ttf, ttf2woff, ttf2woff2, ttf2eot) for format conversion.

## Commands

- **Build:** `npm run build` (tsup, outputs CJS + ESM to `dist/`, copies `svg.hbs` template)
- **Test:** `npm test` (Vitest)
- **Test watch:** `npm run test:watch`
- **Test against dist:** `npm run test:dist` (runs tests against built output)
- **Lint:** `npm run lint` / `npm run lint:fix` (Oxlint)
- **Format:** `npm run format` / `npm run format:check` (Oxfmt)

## Architecture

Single public entry point: `extract()` async function from `src/index.ts`.

**Pipeline (`src/extract.ts`):**
1. `createFont()` — wraps fontkit's `create()`, rejects font collections (TTC/DFONT) with a clear error
2. `findLigaturesByRaws()` — resolves raw unicode/symbols to ligature strings by parsing the font's GSUB table (lookupType 4). This manual parsing is necessary because fontkit has no public API for ligature discovery
3. `findMetaByLigatures()` — uses fontkit to layout ligatures, extracts glyph SVGs via path transforms (scale -1,1 + rotate π)
4. `convertToSvgFont()` — assembles individual glyph SVGs into an SVG font using SVGIcons2SVGFontStream. SVG template is lazy-cached
5. `convertByFormats()` — converts the SVG font to requested output formats (TTF first via svg2ttf, then WOFF/WOFF2/EOT from TTF)

**Key types (`src/types.ts`):** `MinifyOption` (input config), `ExtractedResult` (output map of format→Buffer + meta), `GlyphMeta` (name, unicode, svg per glyph).

**Fontkit type augmentation (`fontkit.d.ts`):** Extends fontkit types with GSUB table structures (`Lookup`, `SubTable`, `Ligature`, `RangeRecord`), `Font.GSUB`, and `Glyph.advanceHeight` — these are real fontkit internals not covered by `@types/fontkit`.

## Testing

Vitest with real font files from `assets/` (TTF and WOFF2). Supports running against source or dist via `TEST_TARGET` env var. Tests cover: extraction, all output formats (SVG, TTF, WOFF, WOFF2, EOT), metadata, and validation errors. 14 tests, ~95% coverage.

## Tooling

- **Linter:** Oxlint (not ESLint)
- **Formatter:** Oxfmt (not Prettier)
- **Test runner:** Vitest (not Jest)
- **Bundler:** tsup (CJS + ESM)
- **Node version:** `.nvmrc` set to 24 for development, built output targets Node 20+ via `@tsconfig/node20`
- **Releases:** Automated via release-please (manifest mode). Conventional commits (`feat:`, `fix:`, `perf:`) trigger release PRs. Config in `release-please-config.json` + `.release-please-manifest.json`
- **CI:** GitHub Actions — lint + format check on Node 22, tests on Node 20/22/24

## Rules

- Never write placeholder or dummy code (e.g., `expect(true).toBe(true)`, empty functions with comments, no-op stubs). If an approach doesn't work, ask the user for guidance instead of substituting real logic with meaningless constructs.

## Conventions

- Conventional commits: `feat:`, `fix:`, `chore:`, `docs:`, `ci:`, `test:`, `perf:`
- Author email: `mitskevich.aliaksandr@gmail.com`
- No manual versioning — release-please handles CHANGELOG and version bumps
