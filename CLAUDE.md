# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Fontext is an ESM-only Node.js (>=22.13) library and CLI that extracts glyphs from fonts and produces minimized fonts in SVG, TTF, WOFF, WOFF2 and EOT. It reads fonts with harfbuzzjs (HarfBuzz as WebAssembly) plus a small own layer in `src/font/`, writes its own SVG font and converts it with svg2ttf to build icon fonts, subset-font (HarfBuzz) for subsetting, ttf2woff and wawoff2 for WOFF/WOFF2 encoding and ttf2eot for EOT.

## Commands

- **Build:** `npm run build` (tsdown, config in `tsdown.config.ts`; outputs ESM `index.js` + `index.d.ts`, `browser.js` + `browser.d.ts` and `cli.js` to `dist/`)
- **Test:** `npm test` (Vitest) / `npm run test:watch`
- **Test against dist:** `npm run test:dist` (same suite against the built output, needs a build first)
- **Browser checks:** `npm run test:e2e` (Playwright in Chromium, Firefox and WebKit; builds the package, the fonts and the page first) / `npm run test:e2e:manual` (builds and serves the page at http://localhost:4178 to open in any browser, e.g. real Safari)
- **Typecheck:** `npm run typecheck` (lib, test, config and e2e tsconfig projects)
- **Package checks:** `npm run lint:pkg` (publint + arethetypeswrong on the packed tarball, needs a build first)
- **Lint:** `npm run lint` / `npm run lint:fix` (Oxlint, `--deny-warnings`)
- **Format:** `npm run format` / `npm run format:check` (Oxfmt)

## Architecture

Public entry points:

- `src/index.ts` — `extract(input, option)`; `input` is `Buffer | Uint8Array | ArrayBuffer`, normalized to a `Buffer` in `src/extract.ts`
- `src/browser.ts` — `fontext/browser` (experimental), glyph discovery without Node APIs or converters; async `createFont()`, rejects WOFF2
- `src/cli.ts` — the `fontext` binary

`src/extract.ts` validates options and routes to an engine by `option.engine`:

- **icon** (`src/engines/icon.ts`, default) — resolves `raws` to ligature strings, rejects ligatures that don't form one glyph (`assertLigaturesForm`) and a selection without glyphs (`assertGlyphsSelected`), shapes ligatures with HarfBuzz, turns glyph outlines into SVGs, assembles an SVG font with `buildSvgFont()`, then converts it to TTF with svg2ttf. The TTF timestamp comes from the source font's `head.modified` (`Font.modified`) so output is deterministic
- **subset** (`src/engines/subset.ts`) — HarfBuzz subset by characters / unicode ranges / ligature characters, keeps OpenType features
- **convert** (`src/engines/convert.ts`) — re-encodes the whole font into other formats

`src/engines/svg-font.ts` — `buildSvgFont()`, the SVG font of the icon engine and of the `svg` format of convert: every glyph scaled so its vertical advance fills a 1000 unit em (the float operations of svgicons2svgfont with `normalize`, which it replaced, so svg2ttf writes the same TTF), a `<glyph>` element per character and per ligature text (svg2ttf merges elements with the same outline and advance and builds GSUB ligatures from multi-code-point `unicode` values), names and texts escaped for XML. It reads the viewBox and path of `GlyphMeta.svg` and accepts only the absolute M, L, Q, C and Z commands `outline.ts` writes.

`src/engines/shared.ts` holds what all engines share: `subsetToTtf()` (subset once to TrueType, restore legacy kerning with warnings about what it can't keep, optionally Safari-patched), `encodeFromTtf()` (TTF → WOFF via ttf2woff, WOFF2 via wawoff2, EOT via ttf2eot) and `buildReport()`.

`src/font/` is the font access layer shared by both entries:

- `container.ts` — `toSfnt()` detects the format by signature, inflates WOFF with `DecompressionStream`, hands WOFF2 to a decoder passed in by the entry (wawoff2 in Node, an error in the browser), rejects TTC/DFONT and, through `checkGlyphTables()`, fonts whose glyph tables (head, maxp, cmap, hhea, hmtx, OS/2, vhea, vmtx, loca, glyf, CFF, CFF2, GDEF, GSUB, GPOS) run past the end of the data. HarfBuzz would cut them short silently; records of other tables past the end stay tolerated
- `font.ts` — `openFont()` returns the `Font` interface: cmap and reverse cmap, `shape()` (HarfBuzz shaping, glyphs with the source text of their cluster, UTF-16 indices), SVG paths, advances, `modified`, GSUB ligature records
- `gsub.ts` — ligature records of every lookup of type 4 and type 7 wrapping type 4; `reader.ts` — bounds-checked big-endian reads that throw `MalformedFontError` ("Malformed <table>: ...")
- `kern.ts` — the legacy kern table: pair kerning as HarfBuzz applies it (every horizontal format 0 subtable added up, minimum and override bits ignored), a subset of it for the kept glyphs in subtables of at most 10 920 pairs, and what it had to leave out; `sfnt.ts` — table directory reading, the glyph table range check, packing and adding a table with checksums
- `outline.ts` — HarfBuzz draw commands to SVG path data (y flipped, closing line before `Z` dropped); `tables.ts` — head, maxp, vmtx, OS/2 and hhea fields

`src/core.ts` holds the environment-independent logic: `resolveLigatures()` turns GSUB records into texts and keeps those the default layout forms (`formsGlyph`); `findMetaByLigatures()` / `findMetaByCodePoints()` build `GlyphMeta` from whatever glyphs they find (the letters of a text that forms no ligature), the icon engine checks the selection with `assertLigaturesForm()` / `assertGlyphsSelected()`. `src/glyphs.ts` adds the Node `createFont()` with WOFF2 via wawoff2. `src/woff2.ts` runs wawoff2 `compress` / `decompress` one call at a time: each returns a view of WebAssembly memory that the next call overwrites, and the view reaches the caller only after its promise settles, so each result is copied before the next call starts. `src/safari.ts` patches OS/2 and hhea tables for `safariFix`.

**Key types (`src/types.ts`):** `MinifyOption` (discriminated union `IconOption | SubsetOption | ConvertOption`), `FontInput`, `ExtractedResult` (format → Buffer + `meta` + `report` + `warnings`), `FontWarning`, `GlyphMeta`, `OptimizationReport`.

**harfbuzzjs gotchas:**

- hb-subset drops the legacy `kern` table (it cannot renumber its glyphs). `src/engines/kerning.ts` puts back the non-zero pairs of the glyphs the subset kept. Glyphs are matched through the cmap, and in between by order: hb-subset keeps old glyph order, so a gap where it kept all or none of the glyphs is exact. Pairs it can't match, Apple tables, format 2/3, cross-stream and vertical subtables and malformed tables give a `legacy-kern` warning. Fonts whose GPOS has a `kern` feature don't get the table back. OTS drops a kern table with a subtable over 10 922 pairs. The harfbuzzjs build ignores `kern` when shaping, so tests compare pairs, not advances
- It is imported with `await import("harfbuzzjs")` inside `openFont()`: the module instantiates WebAssembly with top-level await, and a static import would break `require("fontext")`
- `Face.referenceTable()` returns a view of WebAssembly memory that detaches when memory grows; `tableOf()` copies it
- The build has no vertical metrics (`glyphVAdvance` is always the em size), so vmtx is read in `tables.ts`
- It cannot read WOFF or WOFF2; wawoff2 does not work in browsers (its emscripten glue exports only under Node)

## Testing

Vitest with real fonts from `assets/`: Material Icons (`font.ttf`, `font.woff2`), a text font without GSUB, and two generated fixtures:

- `font-multi-ligature-lookups.ttf` — ligatures split across subtables, lookups and an extension lookup, plus a `dlig`-only ligature that must not be resolved (`node scripts/make-ligature-fixture.mjs`)
- `font-cff-features.otf` — CFF outlines, vhea/vmtx, a `liga` ligature, a ligature `calt` forms without context and one it forms only before another glyph (`node scripts/make-cff-fixture.mjs`)

The generators write tables by hand through `scripts/sfnt-writer.mjs`, `font-tables.mjs`, `gsub-writer.mjs` and `cff-writer.mjs`. WOFF, TTC and DFONT inputs are built in tests from the TTF fixtures (`test/font-containers.ts`). `test/setup.ts` switches between `src` and `dist` via `TEST_TARGET`. Tests cover all engines and formats, metadata, reference outlines (checked against fontTools), the SVG font and the TTF built from it (TTF outlines recorded from svgicons2svgfont output), CFF, reports, Safari fix, CLI, browser entry and its Vite bundle, input formats and malformed fonts, determinism and validation errors. Coverage thresholds live in `vitest.config.ts`.

**Browser checks (`e2e/`):** `generate.mjs` runs the cases of `cases.mjs` through the built `dist/` and writes the fonts plus `manifest.json` to `e2e/page/public/generated/` (gitignored). The page (`e2e/page/`, built by Vite with `fontext/browser` aliased to `dist/browser.js`) loads every output format with `FontFace` (EOT through the TTF it wraps), draws each sample with the output font and with the source font at 400px and compares the covered pixels (`raster.ts`: every pixel within 2px of the other drawing, at most 0.2% outliers, ink boxes within 1px, 2px for SVG glyphs drawn with Path2D; resolution about 1% of the em), checks advances, legacy kerning, `safariFix` metrics (typo ascent, descent and line height; Firefox's line height is reported, not asserted), that the SVG font is well-formed XML with each glyph drawn like the source, and that `fontext/browser` returns in the browser what it returns in Node. Icon glyphs are compared with the source drawn `unitsPerEm / verticalAdvance` times larger. Mismatch controls (`expect: "mismatch"`) prove the comparison tells near-identical glyphs apart. `fontext.e2e.ts` opens the page once per case (`?case=<id>`) and fails on any failed check; without `?case` the page runs everything, for manual runs. CI runs it on macOS (`.github/workflows/e2e.yaml`) on demand and weekly.

## Tooling

- **Linter:** Oxlint (not ESLint) over `src/`, `test/`, `scripts/` and `e2e/`; test rules use the `vitest/` namespace
- **Browser tests:** Playwright (`playwright.config.ts`), specs named `*.e2e.ts` so Vitest ignores them
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
