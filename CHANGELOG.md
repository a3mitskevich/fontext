# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/), and this project adheres to [Semantic Versioning](https://semver.org/).

## [1.5.0](https://github.com/a3mitskevich/fontext/compare/fontext-v1.4.0...fontext-v1.5.0) (2026-03-22)


### Features

* add CLI interface ([43923cd](https://github.com/a3mitskevich/fontext/commit/43923cd4810e2d399078f3ab65bc70f997542ef5))

## [1.4.0](https://github.com/a3mitskevich/fontext/compare/fontext-v1.3.0...fontext-v1.4.0) (2026-03-22)


### Features

* add extracting by raws ([f1e6c92](https://github.com/a3mitskevich/fontext/commit/f1e6c92603feee55749b6d222c0cd4fa7d459c7e))
* add meta info to result ([1db9a25](https://github.com/a3mitskevich/fontext/commit/1db9a255561c3a3035d81dc77c767870cd202da5))


### Bug Fixes

* add error handling to SVG font stream conversion ([7598523](https://github.com/a3mitskevich/fontext/commit/75985232109b0fb8ddc5dba4850d45224fc7f32f))
* add input validation for extract options ([44328ab](https://github.com/a3mitskevich/fontext/commit/44328ab24f91d2e0b1dd5bdb18143febf4c83a48))
* add proper Ligature type and remove any from GSUB parsing ([744be7d](https://github.com/a3mitskevich/fontext/commit/744be7d4a430e5a23a2b8212687f38a4393bd11c))
* clean up fontkit type augmentation ([5099b90](https://github.com/a3mitskevich/fontext/commit/5099b90cdb6ef0c68eed4d128cfb963958f29eac))
* exports ([972930d](https://github.com/a3mitskevich/fontext/commit/972930d3c815ca5c1d646d17314bcd9b9349a276))
* index exports ([27fba87](https://github.com/a3mitskevich/fontext/commit/27fba87c91641fa01ab8ba7e9ab19f5d3b3d3f4f))
* remove unsafe _metrics access on fontkit Glyph ([1b8f9e0](https://github.com/a3mitskevich/fontext/commit/1b8f9e044b6fab732ac25dab6dfc9edb030bb7d0))
* replace console.error with thrown errors ([9b908f1](https://github.com/a3mitskevich/fontext/commit/9b908f14612b61239bdab741f60c3e5ac0cc3389))


### Performance Improvements

* cache SVG template compilation ([7cb9d4f](https://github.com/a3mitskevich/fontext/commit/7cb9d4f6f070c7c7d5310e0997b173b792869191))

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
