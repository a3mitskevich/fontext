# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/), and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

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
