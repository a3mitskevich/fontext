# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Fontext is an ESM-only Node.js (>=22.13) library and CLI that extracts glyphs from fonts and produces minimized fonts in SVG, TTF, WOFF, WOFF2 and EOT. It uses fontkit for parsing, svgicons2svgfont + svg2ttf to build icon fonts, subset-font (HarfBuzz) for subsetting, ttf2woff and wawoff2 for WOFF/WOFF2 encoding and ttf2eot for EOT.

## Commands

- **Build:** `npm run build` (tsdown, config in `tsdown.config.ts`; outputs ESM `index.js` + `index.d.ts`, `browser.js` + `browser.d.ts` and `cli.js` to `dist/`)
- **Test:** `npm test` (Vitest) / `npm run test:watch`
- **Test against dist:** `npm run test:dist` (same suite against the built output, needs a build first)
- **Typecheck:** `npm run typecheck` (lib, test and config tsconfig projects)
- **Package checks:** `npm run lint:pkg` (publint + arethetypeswrong on the packed tarball, needs a build first)
- **Lint:** `npm run lint` / `npm run lint:fix` (Oxlint, `--deny-warnings`)
- **Format:** `npm run format` / `npm run format:check` (Oxfmt)

## Architecture

Public entry points:

- `src/index.ts` — `extract(input, option)`; `input` is `Buffer | Uint8Array | ArrayBuffer`, normalized to a `Buffer` in `src/extract.ts`
- `src/browser.ts` — `fontext/browser`, glyph discovery without Node APIs or converters (ESM only)
- `src/cli.ts` — the `fontext` binary

`src/extract.ts` validates options and routes to an engine by `option.engine`:

- **icon** (`src/engines/icon.ts`, default) — resolves `raws` to ligature strings, lays out ligatures with fontkit, turns glyph paths into SVGs, assembles an SVG font with SVGIcons2SVGFontStream, then converts it to TTF with svg2ttf. The TTF timestamp comes from the source font's `head.modified` so output is deterministic
- **subset** (`src/engines/subset.ts`) — HarfBuzz subset by characters / unicode ranges / ligature characters, keeps OpenType features
- **convert** (`src/engines/convert.ts`) — re-encodes the whole font into other formats

`src/engines/shared.ts` holds what all engines share: `subsetToTtf()` (subset once to TrueType, optionally Safari-patched), `encodeFromTtf()` (TTF → WOFF via ttf2woff, WOFF2 via wawoff2, EOT via ttf2eot) and `buildReport()`.

`src/core.ts` holds the environment-independent logic used by both Node and browser entries: `resolveLigatures()` parses GSUB manually (every lookup of type 4, plus type 7 extension lookups wrapping type 4) because fontkit has no public API for ligature discovery; `findMetaByLigatures()` / `findMetaByCodePoints()` build `GlyphMeta` (SVG via path scale -1,1 + rotate π). `src/glyphs.ts` adds the `Buffer`-based `createFont()` for Node. `src/safari.ts` patches OS/2 and hhea tables for `safariFix`.

**Key types (`src/types.ts`):** `MinifyOption` (discriminated union `IconOption | SubsetOption | ConvertOption`), `FontInput`, `ExtractedResult` (format → Buffer + `meta` + `report`), `GlyphMeta`, `OptimizationReport`.

**Local type declarations:** `fontkit.d.ts` augments `@types/fontkit` with GSUB structures (`Lookup`, `SubTable` incl. extension fields, `Ligature`, `RangeRecord`), `Font.GSUB`, `Font.head.modified` and `Glyph.advanceHeight`.

**Gotcha:** fontkit caches glyph objects with the code points of their first lookup. Resolving raws on the same `Font` instance used for layout changes glyph names, so the icon engine resolves raws on a separate instance.

## Testing

Vitest with real fonts from `assets/`: Material Icons (`font.ttf`, `font.woff2`), a text font without GSUB, and `font-multi-ligature-lookups.ttf` — a generated fixture with ligatures split across subtables, lookups and an extension lookup, plus a `dlig`-only ligature that must not be resolved (regenerate with `node scripts/make-ligature-fixture.mjs`, which writes the tables by hand through `scripts/sfnt-writer.mjs`). `test/setup.ts` switches between `src` and `dist` via `TEST_TARGET`. Tests cover all engines and formats, metadata, reports, Safari fix, CLI, browser entry, input types, determinism and validation errors. Coverage thresholds live in `vitest.config.ts`.

## Tooling

- **Linter:** Oxlint (not ESLint) over `src/`, `test/` and `scripts/`; test rules use the `vitest/` namespace
- **Scripts:** repo scripts are plain Node ESM (`.mjs`), no Python
- **Formatter:** Oxfmt (not Prettier); `.gitattributes` enforces LF
- **Test runner:** Vitest (not Jest)
- **Bundler:** tsdown (not tsup)
- **TypeScript:** 6.x; base config `@tsconfig/node22`. Tests use `module: preserve` + `moduleResolution: bundler`
- **Node version:** `.nvmrc` set to 24 for development; `engines.node` is `>=22.13.0`, the first 22.x where `require()` of an ES module runs without an experimental warning
- **Module format:** `"type": "module"`, ESM only — no CJS build. `tsconfig.lib.json` uses `moduleResolution: bundler` because tsdown bundles the sources, so relative imports need no extensions
- **Releases:** Automated via release-please (manifest mode). Conventional commits (`feat:`, `fix:`, `perf:`) trigger release PRs; `!` / `BREAKING CHANGE` bumps the major. Config in `release-please-config.json` + `.release-please-manifest.json`
- **CI:** GitHub Actions — lint, format check and typecheck on Node 22; build, `lint:pkg` and tests on Node 22/24/26
- **Dependabot:** grouped weekly npm updates, monthly GitHub Actions updates

## Rules

- Never write placeholder or dummy code (e.g., `expect(true).toBe(true)`, empty functions with comments, no-op stubs). If an approach doesn't work, ask the user for guidance instead of substituting real logic with meaningless constructs.

## Conventions

- Conventional commits: `feat:`, `fix:`, `chore:`, `docs:`, `ci:`, `test:`, `perf:`
- Author email: `mitskevich.aliaksandr@gmail.com`
- No manual versioning — release-please handles CHANGELOG and version bumps
