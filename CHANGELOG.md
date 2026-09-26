# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/), and this project adheres to [Semantic Versioning](https://semver.org/).

## [2.0.0](https://github.com/a3mitskevich/fontext/compare/fontext-v1.11.0...fontext-v2.0.0) (2026-09-26)


### ⚠ BREAKING CHANGES

* reject the removed withWhitespace option instead of ignoring it
* the withWhitespace option, the -w/--with-whitespace CLI flag and the withWhitespace config field are removed, and findMetaByLigatures() of fontext/browser takes no third argument. The icon engine never adds a space glyph; with the subset engine add a space to characters.
* the icon engine now rejects a ligature that doesn't shape into one glyph other than .notdef with 'Font does not contain a ligature for "<text>"', the same error raws give, and a selection that matches no glyph with "No glyphs match the selection: the font maps none of unicodeRanges <ranges>". The fontext/browser helpers findMetaByLigatures() and findMetaByCodePoints() still return what they find.
* the svg output of the icon and convert engines is written without the XML declaration and DOCTYPE and with one element per line, so its bytes and content hashes change; its glyphs, mappings, advances and outlines are the same. The internal createGlyphStream(), convertToSvgFont() and GlyphStream type are removed; no entry point exported them.
* SVG paths of glyphs whose contours start at an off-curve point change, so icon fonts built from such glyphs get new bytes and content hashes. fontext/browser is async now: createFont() and findLigaturesByRaws() return promises, and createFont() returns fontext's own Font interface instead of a fontkit Font. The browser entry rejects WOFF2 input; the Node entry still reads it. Malformed fonts fail with "Malformed <table>" errors, unknown data with "Unsupported font format".
* fontext is ESM only and requires Node.js >=22.13. CommonJS code can still load it with require("fontext").
* Node.js 20 is no longer supported; the minimum is 22.12.

### Features

* accept Uint8Array and ArrayBuffer font input in extract() ([69a112a](https://github.com/a3mitskevich/fontext/commit/69a112a1b8654da5691e28e0c519c6fb37517144))
* warn about legacy kern kerning the subset can't keep ([c6acbe9](https://github.com/a3mitskevich/fontext/commit/c6acbe90ac55c89c7262f70d3ecfdcb19915d5e6))


### Bug Fixes

* announce --watch only once the watcher is attached ([5bdedb9](https://github.com/a3mitskevich/fontext/commit/5bdedb98fe76e8adca098b3f862b65c3e9d04d26))
* avoid call stack overflow on large code point sets ([9d84e17](https://github.com/a3mitskevich/fontext/commit/9d84e1700c270abf2b126d1c911657701308e766))
* correct exports map so ESM consumers get ESM types ([956396e](https://github.com/a3mitskevich/fontext/commit/956396e5679b2d2f198bf6be9e27365a70b20a29))
* **deps:** update dependencies and patch @xmldom/xmldom advisories ([1ea491c](https://github.com/a3mitskevich/fontext/commit/1ea491c6d788c9bfb17e27c26fc10ae5d5f8c3ea))
* keep the legacy kern pairs of the kept glyphs in subset output ([ab1ec51](https://github.com/a3mitskevich/fontext/commit/ab1ec5142b1540694aa512f34cd5c61f3b01f51b))
* keep watching the input after it is replaced ([8a5bc6a](https://github.com/a3mitskevich/fontext/commit/8a5bc6a7717873fda586bcb300a2420aef78861b))
* keep WOFF2 output and input intact across concurrent calls ([9c09273](https://github.com/a3mitskevich/fontext/commit/9c09273bacd18b29e51159cfce94fa1cfe3a12e6))
* make icon engine output deterministic ([f705add](https://github.com/a3mitskevich/fontext/commit/f705addec88f0203a05f3ae0637330a81a761dc2))
* print the report bar when an output is larger than the input ([63b9d64](https://github.com/a3mitskevich/fontext/commit/63b9d649e829e649a55b219500710404f687e8c9))
* reject font input that is not binary data ([ac18407](https://github.com/a3mitskevich/fontext/commit/ac18407b9204f2f8afcdea11d0524ef72532f076))
* reject fonts whose glyph tables run past the end of the data ([07d026c](https://github.com/a3mitskevich/fontext/commit/07d026ca06ec63c9e5ec5441b7e9b21dc9ebe460))
* reject icon ligatures and selections the font cannot form ([07867cc](https://github.com/a3mitskevich/fontext/commit/07867ccc7ae33d5a892118a52ef99489c4a2730f))
* resolve ligatures from every GSUB lookup and subtable ([178adb7](https://github.com/a3mitskevich/fontext/commit/178adb797e32e5ec861194563cf4fb659b77b1b0))
* resolve only ligatures that the default features form ([ac25640](https://github.com/a3mitskevich/fontext/commit/ac256406b2ee6826c187394bc8b8c991acba82d8))
* subset fonts whose other table records point past the end ([dea0fd8](https://github.com/a3mitskevich/fontext/commit/dea0fd8d5263b18bbb923c405cba3fed00e0d451))
* **test:** resolve the dist entry at runtime so typecheck works without a build ([a75ea4a](https://github.com/a3mitskevich/fontext/commit/a75ea4a39a0757e683b64c64f453cb6010a7008a))
* write the OTTO flavor into WOFF output of CFF fonts ([efc829c](https://github.com/a3mitskevich/fontext/commit/efc829cfd581243b5e936fa96889e8ce5b57e9ee))


### Performance Improvements

* encode WOFF/WOFF2 via fontverter and drop ttf2woff2 ([02356fc](https://github.com/a3mitskevich/fontext/commit/02356fc2ce0bb22fc714b75790c3c60825a997ea))


### Code Refactoring

* build the SVG font without svgicons2svgfont ([b254ef0](https://github.com/a3mitskevich/fontext/commit/b254ef0a8b6cd7c2c21503a07ee8d92dc31bd7ae))
* read fonts with harfbuzzjs instead of fontkit ([8a8953d](https://github.com/a3mitskevich/fontext/commit/8a8953da03820d709d741099f3852a6122fd8f12))
* reject the removed withWhitespace option instead of ignoring it ([49363da](https://github.com/a3mitskevich/fontext/commit/49363da8e4fc185665ca8eb32dea6cd731a26c30))
* remove the withWhitespace option ([a43d067](https://github.com/a3mitskevich/fontext/commit/a43d067e43fc8b84e301103c258f98c20791d3ca))


### Build System

* require Node.js &gt;=22.12 ([c0f9b5d](https://github.com/a3mitskevich/fontext/commit/c0f9b5d87f07231a07c7b07336accdf703ecdcec))
* ship ESM only and require Node.js &gt;=22.13 ([242282b](https://github.com/a3mitskevich/fontext/commit/242282bfd95edc1c7faa39b04e3d5eb2def82574))

## [1.11.0](https://github.com/a3mitskevich/fontext/compare/fontext-v1.10.0...fontext-v1.11.0) (2026-03-23)


### Features

* add convert engine for format conversion without minification ([45c3684](https://github.com/a3mitskevich/fontext/commit/45c3684d82e156960b7970c734724cbbc8a3aae9))
* add safariFix option for cross-platform font compatibility ([f654690](https://github.com/a3mitskevich/fontext/commit/f654690b82b8add8ea0d3be1873d67ba0bca8faf))
* add silent mode for CLI and API ([cbccfe1](https://github.com/a3mitskevich/fontext/commit/cbccfe165bf6a374e281e55e947f6aa8ceb7f12e))
* **cli:** add --dry-run flag to preview output without writing files ([cb08706](https://github.com/a3mitskevich/fontext/commit/cb08706446d6e5f049769bad3fe76644f2a496ad))
* **cli:** add --init wizard and regroup help by engine compatibility ([e9a3489](https://github.com/a3mitskevich/fontext/commit/e9a3489c89e18d58c61015f10dc0a7ebbfbf0daf))


### Bug Fixes

* improve robustness and update ROADMAP (Phase 12) ([78151c8](https://github.com/a3mitskevich/fontext/commit/78151c8bd7604118a3e7663325028b8a9cf61d71))

## [1.10.0](https://github.com/a3mitskevich/fontext/compare/fontext-v1.9.1...fontext-v1.10.0) (2026-03-22)


### Features

* **ci:** add commit message and pre-commit lint/format hooks ([b528167](https://github.com/a3mitskevich/fontext/commit/b528167124f243017f927addbe078f9d91185099))

## [1.9.1](https://github.com/a3mitskevich/fontext/compare/fontext-v1.9.0...fontext-v1.9.1) (2026-03-22)


### Bug Fixes

* update repository and homepage URLs to fontext ([d41e106](https://github.com/a3mitskevich/fontext/commit/d41e106cabe325864d0a8e1a009bc2d2b7faa05f))

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
