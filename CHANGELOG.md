# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/), and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Changed
- Minimum Node.js version raised to 20.0.0 (Node 18 is EOL)
- Added `.nvmrc` (Node 24) for development environment
- Updated `svgicons2svgfont` to 15.0.1, `ttf2woff2` to 8.0.1, `fontkit` to 2.0.4, `handlebars` to 4.7.8
- Updated all `@types/*` dev dependencies to latest
- CI now tests on Node 20, 22, and 24
- Font collections (TTC/DFONT) now throw a clear error instead of failing silently

## [1.3.0] - 2026-03-22

### Fixed
- Stream errors in SVG font conversion now properly reject the promise instead of hanging
- Silent `console.error` failures replaced with thrown errors for missing GSUB table and non-existent ligatures
- Input validation now provides specific error messages instead of generic "Illegal option"
- Invalid format values are now validated against the Format enum

### Changed
- SVG template is now cached after first load instead of reading from disk on every glyph

## [1.2.0] - 2026-03-22

### Changed
- Restructured README with clear value proposition, API docs, and badges
- Added ROADMAP.md with phased improvement plan
- Replaced ESLint with Oxlint for faster linting
- Added Oxfmt as project formatter
- Updated TypeScript to 5.9, tsup to 8.5, Jest to 30.3
- Updated CI workflow with lint and format check jobs

## [1.1.2] - 2024-01-09

### Fixed
- Fixed package exports configuration

## [1.1.1] - 2024-01-09

### Fixed
- Added `extract` as a named export

## [1.1.0] - 2024-01-08

### Added
- Glyph metadata (`meta`) in `ExtractedResult` — includes name, unicode mappings, and SVG for each glyph

### Changed
- Refactored ESLint, tsconfig, and Jest configuration

## [1.0.10] - 2023-07-29

### Added
- Initial release — extract glyphs by ligatures from font files
- Output formats: SVG, TTF, WOFF, WOFF2, EOT
- Handlebars-based SVG templating
