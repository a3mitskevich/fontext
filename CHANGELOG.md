# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/), and this project adheres to [Semantic Versioning](https://semver.org/).

## [1.9.0](https://github.com/a3mitskevich/fontext/compare/fontext-v1.8.0...fontext-v1.9.0) (2026-03-22)


### Features

* add browser-compatible entry point ([91693c6](https://github.com/a3mitskevich/fontext/commit/91693c655fb80d91327984f6989dc3e8d588f409))
* add dual engine architecture with subset support ([aca7927](https://github.com/a3mitskevich/fontext/commit/aca7927172c9b4ce6c90aed77a149a8bb6777ad5))

## [1.8.0](https://github.com/a3mitskevich/fontext/compare/fontext-v1.7.0...fontext-v1.8.0) (2026-03-22)


### Features

* add --json flag for machine-readable CLI output ([6cd6aba](https://github.com/a3mitskevich/fontext/commit/6cd6abacee22fb7b40c6c98921162b5baeba5b4b))
* add --watch mode for auto re-extraction ([54e81e3](https://github.com/a3mitskevich/fontext/commit/54e81e3139db47ea9ccca9cbc279a278f986e3a7))
* add .fontextrc.json config file support ([162aa7f](https://github.com/a3mitskevich/fontext/commit/162aa7ff77bccffe576a2b06a9e87740e5307e31))
* add animated spinner during extraction ([50d01f0](https://github.com/a3mitskevich/fontext/commit/50d01f0f6d28a89b7dbbad340eb5c577b7266a72))
* add batch mode for processing multiple fonts ([91f5431](https://github.com/a3mitskevich/fontext/commit/91f5431657497941c0f45c90481de350aac21a15))
* add CLI interface ([bfddbca](https://github.com/a3mitskevich/fontext/commit/bfddbcae773e0b8d118b1729ac9408a90eb7fb72))
* add extracting by raws ([f1e6c92](https://github.com/a3mitskevich/fontext/commit/f1e6c92603feee55749b6d222c0cd4fa7d459c7e))
* add meta info to result ([1db9a25](https://github.com/a3mitskevich/fontext/commit/1db9a255561c3a3035d81dc77c767870cd202da5))
* add optimization report with size savings ([69a42b5](https://github.com/a3mitskevich/fontext/commit/69a42b5e35a769bf2d2e617b23e589347cf68eee))
* add unicode range extraction ([9f5a236](https://github.com/a3mitskevich/fontext/commit/9f5a2366c8cf7550d3c2b0379d023eb63b541183))
* colorful CLI output with progress bars ([69e7b6f](https://github.com/a3mitskevich/fontext/commit/69e7b6fd75e52e8ef9e44fd537af0dfd7d2cd0bb))


### Bug Fixes

* add error handling to SVG font stream conversion ([7598523](https://github.com/a3mitskevich/fontext/commit/75985232109b0fb8ddc5dba4850d45224fc7f32f))
* add input validation for extract options ([44328ab](https://github.com/a3mitskevich/fontext/commit/44328ab24f91d2e0b1dd5bdb18143febf4c83a48))
* add proper Ligature type and remove any from GSUB parsing ([744be7d](https://github.com/a3mitskevich/fontext/commit/744be7d4a430e5a23a2b8212687f38a4393bd11c))
* clean up fontkit type augmentation ([5099b90](https://github.com/a3mitskevich/fontext/commit/5099b90cdb6ef0c68eed4d128cfb963958f29eac))
* exports ([972930d](https://github.com/a3mitskevich/fontext/commit/972930d3c815ca5c1d646d17314bcd9b9349a276))
* index exports ([27fba87](https://github.com/a3mitskevich/fontext/commit/27fba87c91641fa01ab8ba7e9ab19f5d3b3d3f4f))
* move @tsconfig/node20 to devDependencies and fix supported formats docs ([75cb1cd](https://github.com/a3mitskevich/fontext/commit/75cb1cd9d76f20799683a989ae11e195f171e5a7))
* remove unsafe _metrics access on fontkit Glyph ([1b8f9e0](https://github.com/a3mitskevich/fontext/commit/1b8f9e044b6fab732ac25dab6dfc9edb030bb7d0))
* replace console.error with thrown errors ([9b908f1](https://github.com/a3mitskevich/fontext/commit/9b908f14612b61239bdab741f60c3e5ac0cc3389))
* use absolute paths and align CLI output columns ([3211923](https://github.com/a3mitskevich/fontext/commit/32119233f2b8db76a0b4b8179b9aa634b9aece49))


### Performance Improvements

* cache SVG template compilation ([7cb9d4f](https://github.com/a3mitskevich/fontext/commit/7cb9d4f6f070c7c7d5310e0997b173b792869191))
* optimize stream buffering in convertToSvgFont ([fe39d6c](https://github.com/a3mitskevich/fontext/commit/fe39d6c2a46dacb526d580ac1c76bafa9eed6ab3))
* parallelize format conversion with Promise.all ([aa1198d](https://github.com/a3mitskevich/fontext/commit/aa1198ddaae4dbdee34cc333bd3c14e64d2e528d))

## [1.7.0](https://github.com/a3mitskevich/fontext/compare/fontext-v1.6.0...fontext-v1.7.0) (2026-03-22)


### Features

* add --json flag for machine-readable CLI output ([decbf47](https://github.com/a3mitskevich/fontext/commit/decbf478408b792e505729af4c4e8cfe314dad9f))
* add --watch mode for auto re-extraction ([ce86dde](https://github.com/a3mitskevich/fontext/commit/ce86ddedd2d2b51a54fb3be87d2a06033658665d))
* add .fontextrc.json config file support ([85b821f](https://github.com/a3mitskevich/fontext/commit/85b821f8a2e0f0fc26891ae0c1effd9388861e6f))
* add animated spinner during extraction ([c2e3408](https://github.com/a3mitskevich/fontext/commit/c2e340827d950ba441bb351fd22eb6900b83a3df))
* add batch mode for processing multiple fonts ([96747f3](https://github.com/a3mitskevich/fontext/commit/96747f30c8cb501a73dd2db1d9f1fdf5731bf9a4))
* add unicode range extraction ([13592da](https://github.com/a3mitskevich/fontext/commit/13592da43f482665751318abd37dd65911406416))


### Bug Fixes

* move @tsconfig/node20 to devDependencies and fix supported formats docs ([681af35](https://github.com/a3mitskevich/fontext/commit/681af357180116b9399eb828581e05aa86f4745b))


### Performance Improvements

* optimize stream buffering in convertToSvgFont ([d1964af](https://github.com/a3mitskevich/fontext/commit/d1964af2dc10c9c6b63bb31ac4dec2a4de4bb862))
* parallelize format conversion with Promise.all ([43bcea5](https://github.com/a3mitskevich/fontext/commit/43bcea5401f9ae02d930487af817e41f5bf6bfa9))

## [1.6.0](https://github.com/a3mitskevich/fontext/compare/fontext-v1.5.0...fontext-v1.6.0) (2026-03-22)


### Features

* add optimization report with size savings ([64faba1](https://github.com/a3mitskevich/fontext/commit/64faba1f3c2bf12855d62448ce6ff98262318218))
* colorful CLI output with progress bars ([2f07dd0](https://github.com/a3mitskevich/fontext/commit/2f07dd090c0be869b8f41ce3708b4cf66c108671))


### Bug Fixes

* use absolute paths and align CLI output columns ([ad88acd](https://github.com/a3mitskevich/fontext/commit/ad88acd7e77aaa4a000f944d80c9ce42dd0b98f8))

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
