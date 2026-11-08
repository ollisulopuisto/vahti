# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Calendar Versioning](https://calver.org/).

## [0.7.14] - 2026-11-08

### Added
- Opt-in Todoist source: your active tasks, read every few minutes from the Todoist REST API with your own API token. Paste the token in Setup's Sources tab (Todoist Settings, Integrations, Developer); it is validated, stored owner-only on this Mac, and never in config.json, logs or chat. Tasks land in the vault with project, priority, due date and labels, flow through the same tagging, search and forget pipelines as every other source, and can be switched off in What Vahti reads. Completed tasks disappear from the API and stay in the vault as history; closing the loop (ticking a Todoist task off when Vahti sees it done, the way reminders work) is follow-up work. Reads are GET-only against the tasks and projects routes; Todoist is not in the default AI read scopes.

## [0.7.12] - 2026-11-08

### Fixed
- Timeline crash when switching pages: the animated page crossfade/blur and the sidebar selection spring kept SwiftUI's display-link async renderer busy while AppKit ran the window's constraint pass for the toolbar/title swap; cancelling that rendering marked constraints dirty mid-pass and AppKit threw an uncaught NSException (EXC_BREAKPOINT in -[NSWindow _postWindowNeedsUpdateConstraints]). Same crash family as the 0.7.10 Brief/Vault fix; the Timeline's heavier list is why it still crashed. Page switches are now instant. The window-layout regression test now exercises a heavy timeline-like lazy list, and a source check keeps page swaps animation-free.

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
