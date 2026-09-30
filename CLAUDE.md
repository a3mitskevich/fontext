# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Fontext is an ESM-only Node.js (>=22.13) library and CLI that extracts glyphs from fonts and produces minimized fonts in SVG, TTF, WOFF, WOFF2 and EOT. It reads fonts with harfbuzzjs (HarfBuzz as WebAssembly) plus a small own layer in `src/font/`, writes its own SVG font and converts it with svg2ttf to build icon fonts, hb-subset from harfbuzzjs (`harfbuzz-subset.wasm`) for subsetting, ttf2woff and wawoff2 for WOFF/WOFF2 encoding and ttf2eot for EOT.

## Commands

- **Build:** `npm run build` (tsdown, config in `tsdown.config.ts`; outputs ESM `index.js` + `index.d.ts`, `browser.js` + `browser.d.ts` and `cli.js` to `dist/`)
- **Test:** `npm test` (Vitest) / `npm run test:watch`
- **Test against dist:** `npm run test:dist` (same suite against the built output, needs a build first)
- **Browser checks (local only, no CI):** `npm run test:e2e:chrome` (installed Google Chrome via Playwright), `npm run test:e2e:firefox` (Playwright's Firefox, `npx playwright install firefox` once), `npm run test:e2e:safari` (installed Safari via `safaridriver`; once per Mac enable Safari > Settings > Developer > Allow remote automation). Each builds the package, the fonts and the page first; `npm run test:e2e:safari -- <case-id>…` runs only those cases. Safari is required before a release. `npm run test:e2e:manual` builds and serves the page at http://localhost:4178 to open in any browser
- **Typecheck:** `npm run typecheck` (lib, test, config and e2e tsconfig projects)
- **Package checks:** `npm run lint:pkg` (publint + arethetypeswrong on the packed tarball, needs a build first)
- **Lint:** `npm run lint` / `npm run lint:fix` (Oxlint, `--deny-warnings`)
- **Format:** `npm run format` / `npm run format:check` (Oxfmt)

## Architecture

Public entry points:

- `src/index.ts` — `extract(input, option)`; `input` is `Buffer | Uint8Array | ArrayBuffer`, normalized to a `Buffer` in `src/extract.ts`
- `src/browser.ts` — `fontext/browser` (experimental), glyph discovery without Node APIs or converters; async `createFont()`, rejects WOFF2
- `src/cli.ts` — the `fontext` binary; `src/cli-optimization.ts` parses its optimization flags (`--target`, `--hinting` / `--no-hinting` through `parseArgs` `allowNegative`, `--layout-features`, `--name-ids`, `--drop-tables`) and merges them over the same `.fontextrc.json` keys; `extract()` validates the values

`src/extract.ts` validates options, resolves them with `resolveOptimization()` and routes to an engine by `option.engine`, passing the resolved `Optimization`:

- **icon** (`src/engines/icon.ts`, default) — resolves `raws` to ligature strings, rejects ligatures that don't form one glyph (`assertLigaturesForm`) and a selection without glyphs (`assertGlyphsSelected`), shapes ligatures with HarfBuzz, turns glyph outlines into SVGs, assembles an SVG font with `buildSvgFont()` at the source font's units per em, converts it to TTF with svg2ttf, then repacks that TTF with hb-subset (`repack()`, before the Safari fix and encoding): every glyph, code point and layout feature stays (svg2ttf's `liga` under DFLT and latn), the cmap shrinks to one shared subtable, `post` loses the glyph names (`meta` has them) and `name` keeps ids 1, 2, 4 and 6 (family, subfamily, full name, PostScript name) in Windows English. The TTF timestamp comes from the source font's `head.modified` (`Font.modified`), hb-subset keeps the head dates, so output is deterministic
- **subset** (`src/engines/subset.ts`) — HarfBuzz subset by characters / unicode ranges with the layout closure ("f" and "i" keep "fi"), and by ligatures without it: each ligature keeps its letters and the glyphs its default layout passes through (`Font.layoutGlyphs()`), not the other ligatures its letters form. Keeps every OpenType feature; a text that forms no ligature keeps its letters
- **convert** (`src/engines/convert.ts`) — re-encodes the whole font into other formats (hb-subset of every code point, the same path as subset)

`src/optimization.ts` — `resolveOptimization()`, one pure function from the options to an `Optimization` (formats, hinting, layout features, name ids, dropped tables, CFF desubroutinization): explicit options first, then the `target` preset (`web`: WOFF2, hinting, HarfBuzz default features, name ids 1, 2, 4, 6, desubroutinized CFF; `runtime`: TTF, no hinting, the same features and names, subroutines kept), then the engine's defaults, which without a target are exactly the output before these options existed. Tags shorter than four characters are padded with spaces. `assertOptimizationOptions()` checks the values at the boundary for every engine, and rejects dropping `REQUIRED_TABLES` (the tables OTS requires of every font, plus glyf, loca, CFF and CFF2). Dropping `kern` skips the legacy kern restore. The icon engine applies only `nameIds` and `dropTables` to its repack (svg2ttf writes no hinting, its `liga` must stay); `hinting` and `layoutFeatures` are left out of `IconOption` and ignored at runtime. `src/engines/transform.ts` — `applyTransform()` runs the `transform` hook once on a copy of the final TTF (after kerning restore and Safari fix, before encoding) and accepts only an uncompressed sfnt with whole glyph tables (`containerFormat()`, `checkGlyphTables()`); a failing hook rejects with its error as `cause`

`src/engines/svg-font.ts` — `buildSvgFont()`, the SVG font of the icon engine and of the `svg` format of convert: every glyph scaled so its vertical advance fills the em (the float operations of svgicons2svgfont with `normalize`, which it replaced). The em is the source font's units per em (`Font.unitsPerEm`), so a glyph whose vertical advance is the em keeps its coordinates; below 512 it is multiplied up to at least 512, since svg2ttf rounds every point to whole units, and it is lowered when a glyph would overflow the int16 coordinates of TrueType (a glyph over twice as wide as its vertical advance at 16 384 units). The `svg` format of convert uses the same em, a `<glyph>` element per character and per ligature text (svg2ttf merges elements with the same outline and advance and builds GSUB ligatures from multi-code-point `unicode` values), names and texts escaped for XML. It reads the viewBox and path of `GlyphMeta.svg` and accepts only the absolute M, L, Q, C and Z commands `outline.ts` writes.

`src/engines/hb-subset.ts` — `hbSubset()`, a Node-only call into `harfbuzz-subset.wasm` (resolved through `createRequire(import.meta.url)`, instantiated once on first use): unicodes and glyph ids (a list or `*` for all), flags, layout features (`*` or a list), extra tables to drop, and name ids and name language ids to keep. Every WebAssembly object is freed on error paths too, and memory views are taken fresh at each use because the memory can grow.

`src/engines/closure.ts` — `layoutClosure()`, the glyph ids hb-subset keeps for code points with its layout closure over the same layout features as the final subset. It subsets a copy of the font whose hmtx advances are glyph id + 1 and reads the kept ids back from the subset's advances.

`src/engines/shared.ts` holds what all engines share: `subsetToTtf()` (subset to TrueType with the flags, layout features, name ids and dropped tables of the `Optimization` (`NO_HINTING`, `DESUBROUTINIZE`): code points with the layout closure, ligatures by glyph id with `NO_LAYOUT_CLOSURE`, restore legacy kerning with warnings about what it can't keep, optionally Safari-patched, then the `transform` hook), `encodeFromTtf()` (TTF → WOFF via ttf2woff, WOFF2 via wawoff2, EOT via ttf2eot) and `buildReport()`.

`src/font/` is the font access layer shared by both entries:

- `container.ts` — `toSfnt()` detects the format by signature, inflates WOFF with `DecompressionStream`, hands WOFF2 to a decoder passed in by the entry (wawoff2 in Node, an error in the browser), rejects TTC/DFONT and, through `checkGlyphTables()`, fonts whose glyph tables (head, maxp, cmap, hhea, hmtx, OS/2, vhea, vmtx, loca, glyf, CFF, CFF2, GDEF, GSUB, GPOS) run past the end of the data. HarfBuzz would cut them short silently; records of other tables past the end stay tolerated
- `font.ts` — `openFont()` returns the `Font` interface: units per em, cmap and reverse cmap, `shape()` (HarfBuzz shaping, glyphs with the source text of their cluster, UTF-16 indices), `layoutGlyphs()` (every glyph of every GSUB stage of shaping a text, collected through the buffer message function), SVG paths, advances, `modified`, GSUB ligature records
- `gsub.ts` — ligature records of every lookup of type 4 and type 7 wrapping type 4; `reader.ts` — bounds-checked big-endian reads that throw `MalformedFontError` ("Malformed <table>: ...")
- `kern.ts` — the legacy kern table: pair kerning as HarfBuzz applies it (every horizontal format 0 subtable added up, minimum and override bits ignored), a subset of it for the kept glyphs in subtables of at most 10 920 pairs, and what it had to leave out; `sfnt.ts` — table directory reading, the glyph table range check, packing and adding a table with checksums
- `outline.ts` — HarfBuzz draw commands to SVG path data (y flipped, closing line before `Z` dropped); `tables.ts` — head, maxp, vmtx, OS/2 and hhea fields

`src/core.ts` holds the environment-independent logic: `resolveLigatures()` turns GSUB records into texts and keeps those the default layout forms (`formsGlyph`); `findMetaByLigatures()` / `findMetaByCodePoints()` build `GlyphMeta` from whatever glyphs they find (the letters of a text that forms no ligature), the icon engine checks the selection with `assertLigaturesForm()` / `assertGlyphsSelected()`. `src/glyphs.ts` adds the Node `createFont()` with WOFF2 via wawoff2. `src/woff2.ts` runs wawoff2 `compress` / `decompress` one call at a time: each returns a view of WebAssembly memory that the next call overwrites, and the view reaches the caller only after its promise settles, so each result is copied before the next call starts. `src/safari.ts` patches OS/2 and hhea tables for `safariFix`.

**Key types (`src/types.ts`):** `MinifyOption` (discriminated union `IconOption | SubsetOption | ConvertOption`; a base of `target`, `nameIds`, `dropTables`, `transform`, and `hinting` / `layoutFeatures` for subset and convert only), `Target`, `LayoutFeatures`, `FontTransform`, `FontInput`, `ExtractedResult` (format → Buffer + `meta` + `report` + `warnings`), `FontWarning`, `GlyphMeta`, `OptimizationReport`.

**harfbuzzjs gotchas:**

- hb-subset drops the legacy `kern` table (it cannot renumber its glyphs). `src/engines/kerning.ts` puts back the non-zero pairs of the glyphs the subset kept. Glyphs are matched through the cmap, and in between by order: hb-subset keeps old glyph order, so a gap where it kept all or none of the glyphs is exact. Pairs it can't match, Apple tables, format 2/3, cross-stream and vertical subtables and malformed tables give a `legacy-kern` warning. Fonts whose GPOS has a `kern` feature don't get the table back. OTS drops a kern table with a subtable over 10 922 pairs. The harfbuzzjs build ignores `kern` when shaping, so tests compare pairs, not advances
- It is imported with `await import("harfbuzzjs")` inside `openFont()`: the module instantiates WebAssembly with top-level await, and a static import would break `require("fontext")`
- `Face.referenceTable()` returns a view of WebAssembly memory that detaches when memory grows; `tableOf()` copies it
- The build has no vertical metrics (`glyphVAdvance` is always the em size), so vmtx is read in `tables.ts`
- It cannot read WOFF or WOFF2; wawoff2 does not work in browsers (its emscripten glue exports only under Node)
- hb-subset lives in a separate `harfbuzz-subset.wasm` with a raw C export list and no JS glue; `src/engines/hb-subset.ts` instantiates it itself. It exports no closure API, and `NO_LAYOUT_CLOSURE` applies to the whole call
- With its layout closure, hb-subset keeps every glyph GSUB can reach from the kept glyphs: the letters of a few Material Icons ligatures reach almost every icon (`rlig`). Ligatures are therefore kept by glyph id without the closure; a request that also has characters or unicode ranges first finds their closure in a pass of its own (`layoutClosure()`), then subsets once with the union. hb-subset maps every code point of a glyph kept by id, so that output's cmap can hold more code points than asked for (the PUA code points of icons, components of accented letters)
- `Buffer.setMessageFunc()` adds a function to the WebAssembly table and never removes it, so `layoutGlyphs()` shares one buffer and one message function across calls

## Testing

Vitest with real fonts from `assets/`: Material Icons (`font.ttf`, `font.woff2`), a text font without GSUB, and two generated fixtures:

- `font-multi-ligature-lookups.ttf` — ligatures split across subtables, lookups and an extension lookup, plus a `dlig`-only ligature that must not be resolved (`node scripts/make-ligature-fixture.mjs`)
- `font-cff-features.otf` — CFF outlines, vhea/vmtx, a `liga` ligature, a ligature `calt` forms without context and one it forms only before another glyph; letters end their charstrings in a global subroutine, ligatures in a local one (`node scripts/make-cff-fixture.mjs`)

The generators write tables by hand through `scripts/sfnt-writer.mjs`, `font-tables.mjs`, `gsub-writer.mjs` and `cff-writer.mjs`. WOFF, TTC and DFONT inputs are built in tests from the TTF fixtures (`test/font-containers.ts`). `test/setup.ts` switches between `src` and `dist` via `TEST_TARGET`. Tests cover all engines and formats, the hb-subset wrapper, the icon engine repack (post, name and cmap tables, glyphs and ligatures kept, a WOFF2 size budget) and units per em (kept, raised from 16, 16 384 with overflow guard), subset engine ligatures (only the requested ones form) and the layout closure of characters, option resolution and validation, hinting / layout features / name ids / dropped tables per engine, byte-identical output without options (against hb-subset called with the previous parameters), target formats and CFF subroutines per target (`test/cff-utils.ts`), the transform hook, CLI optimization flags and rc keys, metadata, reference outlines (checked against fontTools), the SVG font and the TTF built from it (TTF outlines recorded from svgicons2svgfont output), CFF, reports, Safari fix, CLI, browser entry and its Vite bundle, input formats and malformed fonts, determinism and validation errors. Coverage thresholds live in `vitest.config.ts`.

**Browser checks (`e2e/`):** `generate.mjs` runs the cases of `cases.mjs` through the built `dist/` and writes the fonts plus `manifest.json` to `e2e/page/public/generated/` (gitignored). The page (`e2e/page/`, built by Vite with `fontext/browser` aliased to `dist/browser.js`) loads every output format with `FontFace` (EOT through the TTF it wraps), draws each sample with the output font and with the source font at 400px and compares the covered pixels (`raster.ts`: every pixel within 2px of the other drawing, at most 0.2% outliers, ink boxes within 1px, 2px for SVG glyphs drawn with Path2D; resolution about 1% of the em), checks advances, legacy kerning, `safariFix` metrics (typo ascent, descent and line height; Firefox's line height is reported, not asserted), that the SVG font is well-formed XML with each glyph drawn like the source, and that `fontext/browser` returns in the browser what it returns in Node. Icon glyphs are compared with the source drawn `unitsPerEm / verticalAdvance` times larger; SVG glyphs are drawn at the `units-per-em` of the SVG font's `font-face`. Mismatch controls (`expect: "mismatch"`) prove the comparison tells near-identical glyphs apart. `fontext.e2e.ts` (Playwright: Chrome, Firefox) and `run-safari.mjs` (plain WebDriver calls to `/usr/bin/safaridriver`, since Playwright only drives its own WebKit build) open the page once per case (`?case=<id>`) and fail on any failed check; without `?case` the page runs everything, for manual runs.

## Tooling

- **Linter:** Oxlint (not ESLint) over `src/`, `test/`, `scripts/` and `e2e/`; test rules use the `vitest/` namespace
- **Browser tests:** Playwright (`playwright.config.ts`) for Chrome and Firefox, specs named `*.e2e.ts` so Vitest ignores them; safaridriver for Safari
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
