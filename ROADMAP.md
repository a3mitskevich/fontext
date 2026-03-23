# Roadmap

## Phase 1 — Documentation & Structure

- [x] **1.1** Restructure `README.md` — clear value proposition, usage examples, API docs, badges
- [x] **1.2** Update `CHANGELOG.md` — adopt Keep a Changelog format, document all planned changes going forward

## Phase 2 — Tooling Modernization

- [x] **2.1** Replace ESLint with Oxlint — remove ESLint and all related plugins, configure Oxlint
- [x] **2.2** Add Oxfmt — configure as the project formatter, format the codebase
- [x] **2.3** Update TypeScript to 5.9
- [x] **2.4** Update remaining dev dependencies (Jest 30, ts-jest, tsup 8.5)
- [x] **2.5** Update CI workflow — add lint and format check jobs

## Phase 3 — Stability & Error Handling

- [x] **3.1** Fix stream error handling in `convertToSvgFont` — add `reject` on stream `error` event
- [x] **3.2** Cache SVG template — lazy singleton instead of reading from disk on every glyph
- [x] **3.3** Replace `console.error` with proper error propagation (thrown errors)
- [x] **3.4** Add input validation — validate format values, specific error messages
- [x] **3.5** Remove unsafe `_metrics` access — use public fontkit API or wrap safely

## Phase 4 — Test Coverage

- [x] **4.1** Add negative tests — missing fontName, empty ligatures/raws, invalid formats, non-existent ligatures
- [x] **4.2** Add per-format output tests — verify SVG, EOT, WOFF outputs individually
- [x] **4.3** Add human-readable coverage reporter for local development

## Phase 5 — Features

- [x] **5.1** CLI interface — `fontext --input font.ttf --ligatures home,search --formats woff2`
- [x] **5.2** Unicode range extraction — extract by code point ranges (`U+E000-U+E100`)
- [x] **5.3** ESM-native template loading — inline template, remove handlebars + svg.hbs
- [x] **5.4** Optimization report — show size diff (before/after/saved)

## Phase 6 — Packaging & Correctness

- [ ] **6.1** Add npm publish step to CI — auto-publish to npm after release-please creates a GitHub Release
- [x] **6.2** Move `@tsconfig/node20` from `dependencies` to `devDependencies` — it's only used at build time
- [x] **6.3** Fix "Supported Input Formats" in README — remove TTC/DFONT (not supported)

## Phase 7 — Performance

- [x] **7.1** Parallel format conversion — convert WOFF/WOFF2/EOT in parallel via `Promise.all` instead of sequential `reduce`
- [x] **7.2** Optimize stream buffering — collect chunks in array and `Buffer.concat` once in `end`, not per-chunk

## Phase 8 — CLI Enhancements

- [x] **8.1** `--json` flag — output result as JSON for CI pipelines and build script integration
- [x] **8.2** Progress indicator — animated spinner during extraction
- [x] **8.3** Config file support — `.fontextrc.json` with default options, CLI flags override
- [x] **8.4** Watch mode — `fontext --watch` to re-extract on source font changes
- [x] **8.5** Batch mode — process multiple fonts via `batch` array in `.fontextrc.json`

## Phase 9 — Architecture

- [x] **9.1** Extract GSUB parser into separate module — `src/glyphs.ts` with all glyph discovery logic
- [x] **9.2** Browser-compatible build — `fontext/browser` entry point for glyph discovery without Node.js deps

## Phase 10 — Dual Engine

- [x] **10.1** Subset engine — HarfBuzz-based font subsetting via `subset-font`, preserving kerning/hinting/OpenType
- [x] **10.2** Engine router — `extract.ts` routes to icon or subset engine based on `option.engine`
- [x] **10.3** `characters` option — subset by character string (e.g. `"ABCabc0123"`)
- [x] **10.4** CLI `--engine` and `--characters` flags

## Phase 11 — Code Deduplication

- [x] **11.1** Extract shared pure functions into `src/core.ts` — `renderSvg`, `codePointsToName`, `toSvg`, `glyphToMeta`, `parseUnicodeRanges`, `findMetaByCodePoints`, `findMetaByLigatures`, `resolveLigatures`
- [x] **11.2** Thin wrappers in `glyphs.ts` and `browser.ts` — re-export from core, each adding only its `createFont` variant (`Buffer` vs `Uint8Array`)
- [x] **11.3** Fix `Format` re-export in `src/index.ts` — export `Format` as value, not type alias

## Phase 12 — Robustness & Edge Cases

- [x] **12.1** Guard empty `glyphsForString` result — check array length, throw descriptive error
- [x] **12.2** Validate unicode code points in `parseUnicodeRanges` — reject values > `U+10FFFF`
- [x] **12.3** Error on unsupported formats in subset engine — throw on `formats: ["svg"]` with subset
- [x] **12.4** Remove dead code in subset engine — empty `if` block removed during safariFix refactor
- [x] **12.5** Handle `fs.watch` errors in watch mode — added error event handler

## Phase 13 — Test Coverage Expansion

- [ ] **13.1** Install `@vitest/coverage-v8` — currently missing from devDependencies, `vitest --coverage` fails
- [ ] **13.2** Add coverage threshold to CI — run coverage in GitHub Actions, fail on regression
- [ ] **13.3** Add tests for `fontext/browser` entry point — 5 public functions with zero test coverage
- [ ] **13.4** Remove unused `_source` parameter in test helper — `test.spec.ts:61` declares but never uses it
- [ ] **13.5** Add integration smoke tests with real-world icon fonts (Material Icons, Font Awesome) to catch compatibility regressions

## Phase 14 — CI & Publishing

- [ ] **14.1** Automated npm publish — wire release-please GitHub Release event to `npm publish` (carries over from 6.1)
- [ ] **14.2** Add coverage reporting to CI — upload lcov to Codecov or Coveralls, add badge to README
- [ ] **14.3** Add `engines.npm` field or `.npmrc` with `engine-strict=true` to enforce Node >=20 at install time

## Phase 15 — Convert & Processing

- [x] **15.1** Convert engine — `engine: "convert"` for format conversion without glyph extraction
- [x] **15.2** Silent mode — `--silent` CLI flag, `silent` option in API
- [x] **15.3** Safari compatibility fix — `--safari-fix` patches OS/2 and hhea tables (fsType, fsSelection, metric normalization)
- [x] **15.4** Discriminated union types — `MinifyOption` = `IconOption | SubsetOption | ConvertOption`, compile-time enforcement
- [x] **15.5** Non-BMP Unicode test coverage — verified support for codepoints > U+FFFF across all engines

## Phase 16 — CLI UX

- [x] **16.1** `--dry-run` flag — full extraction without writing files to disk
- [x] **16.2** `--init` interactive wizard — creates `.fontextrc.json` with engine-specific templates
- [x] **16.3** Help grouped by engine compatibility — Common, Icon, Subset, Convert sections
- [x] **16.4** CLI npm scripts — `cli:help`, `cli:init`
