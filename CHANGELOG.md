# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Calendar Versioning](https://calver.org/).

## [0.7.11] - 2026-11-07

### Added
- Opt-in Solmu reader integration for Beeper-backed conversations, with a dedicated revocable read credential, bounded polling and existing task/search/completion/privacy pipelines.
- Opt-in Postilaatikko local cached-mail reader in Setup, without provider calls, credential/draft/attachment copies or read-marker changes.

### Fixed
- Includes the Brief window-sizing fix from PR #14 (0.7.10).

## [0.7.10] - 2026-11-07

### Fixed
- Disable content-derived hosting-controller sizing to avoid re-entrant constraint updates when switching to Brief.

## [v26.11.07.27] - 2026-11-07

### Added
- GitHub Actions workflow (`.github/workflows/build.yml`) to build self-contained macOS app and DMG, with optional Apple Developer ID signing and `notarytool` notarization.
- Support for fallback runtime Metal shader compilation in `app/Island.swift` and build scripts when standalone `metal` CLI is not available.
- Ad-hoc and local codesigning support in `scripts/package-app.sh` for non-release packages.
- Support for `VAHTI_SKIP_TESTS` in `scripts/package-app.sh`.
- Support for `VAHTI_LANGUAGES` in `daemon/lib/lang.mjs` ensuring consistent test execution across environments.

### Changed
- Updated runner to `macos-latest` in `.github/workflows/build.yml`.

### Changed
- Removed unused `#include <SwiftUI/SwiftUI_Metal.h>` from `app/orb.metal` to enable dynamic Metal compilation.
- Cleaned extended filesystem attributes (`xattr -c`) before DMG codesigning in `scripts/package-app.sh`.
