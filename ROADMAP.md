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

- [ ] **7.1** Parallel format conversion — convert WOFF/WOFF2/EOT in parallel via `Promise.all` instead of sequential `reduce`
- [ ] **7.2** Optimize stream buffering — collect chunks in array and `Buffer.concat` once in `end`, not per-chunk

## Phase 8 — CLI Enhancements

- [ ] **8.1** `--json` flag — output result as JSON for CI pipelines and build script integration
- [ ] **8.2** Progress indicator — show extraction progress for large fonts with many glyphs
- [ ] **8.3** Config file support — `.fontextrc.json` or `fontext` field in `package.json` for default options
- [ ] **8.4** Watch mode — `fontext --watch` to re-extract on source font changes
- [ ] **8.5** Batch mode — process multiple fonts in a single invocation

## Phase 9 — Architecture

- [ ] **9.1** Extract GSUB parser into separate module — move `findLigaturesByRaws` and related code out of `extract.ts`
- [ ] **9.2** Browser-compatible build — separate entry point without `fs`/`stream` for browser usage
