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
