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
- [ ] **3.5** Remove unsafe `_metrics` access — use public fontkit API or wrap safely

## Phase 4 — Test Coverage

- [x] **4.1** Add negative tests — missing fontName, empty ligatures/raws, invalid formats, non-existent ligatures
- [x] **4.2** Add per-format output tests — verify SVG, EOT, WOFF outputs individually
- [x] **4.3** Add human-readable coverage reporter for local development

## Phase 5 — Features

- [ ] **5.1** CLI interface — `fontext --input font.ttf --ligatures home,search --formats woff2`
- [ ] **5.2** Unicode range extraction — extract by code point ranges (`U+E000-U+E100`)
- [ ] **5.3** ESM-native template loading — inline template or use `import.meta.url`
- [ ] **5.4** Optimization report — show size diff (before/after/saved)
