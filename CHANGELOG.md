# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Calendar Versioning](https://calver.org/).

## [0.7.17] - 2026-11-09

### Changed
- Make the orb more subtle: the sky-and-sea island behind it and the hairline round it are gone, so only the orb itself is drawn. The completion ripple, attention light and non-Metal fallback keep working over the transparent background, and the glance line under the orb sits on its own small translucent dark chip, so it never floats over the bare desktop. At rest the orb is 18% smaller and sits at 75% opacity (the chip too); both come to full size and opacity with a short ease on hover or press, with the panel open, when something needs you, and while Vahti works. The motion itself is unchanged. With no backdrop, only the orb and the time chip take the mouse; the empty area around them now lets clicks through to the apps underneath (the tucked notch keeps its full hit area, and in that mode its footprint at the screen edge stays a target while the orb is open, so the island does not tuck and reopen under a still pointer; in always-shown mode that strip lets clicks through).

## [0.7.16] - 2026-11-08

### Fixed
- Keep a non-Metal island and orb visible while the GPU starts or if device, shader, artwork, pipeline or frame submission fails. Report renderer status and installed version/build in the menu, and log failures to macOS Console.
- Start the Metal display link after window attachment; validate shader entry points, retain bundled source for recovery, and reposition the orb on Show and display changes.
- The specific cause of the reported invisible orb is not yet confirmed on the affected Mac. The menu no longer treats a visible empty window as proof of a working renderer.

## [0.7.15] - 2026-11-08

### Fixed
- Keep Vault masonry measurement finite during split-view layout probes. Non-finite, non-positive and out-of-range widths use a safe fallback before column calculation, and the measured size reports that same width.
- Keep the native window-layout fixture aligned with the production width handling.

## [0.7.14] - 2026-11-08

### Added
- Opt-in Todoist source: your active tasks, read every few minutes from the Todoist REST API with your own API token. Paste the token in Setup's Sources tab (Todoist Settings, Integrations, Developer); it is verified against Todoist before it is saved, stored owner-only on this Mac, and never in config.json, logs or chat. Tasks land in the vault with project, priority, due date and labels, and their Todoist due date goes straight onto the task card, so deadlines make the brief without model tagging. Tasks flow through the same search and forget pipelines as every other source and can be switched off in What Vahti reads. Edits in Todoist sync back: changed text, project, moment and due date update the kept item, its card and its embedding, while your renames and tick-offs are kept. Completed tasks disappear from the API and stay in the vault as history; closing the loop (ticking a Todoist task off when Vahti sees it done, the way reminders work) is follow-up work. Reads are GET-only against the tasks and projects routes; Todoist is not in the default AI read scopes. A failed read shows in Setup instead of going silently stale.

## [0.7.13] - 2026-11-08

### Fixed
- Vault crash when clicking the Vault sidebar row (0.7.12/manual.64): the row's press spring and hover fade were still animating when the click's page swap replaced the toolbar, title and inspector, keeping SwiftUI's display-link async renderer busy across AppKit's window-constraint pass - the same uncaught NSException family as 0.7.9 Vault and 0.7.11 Timeline (EXC_BREAKPOINT in -[NSWindow _postWindowNeedsUpdateConstraints]), through the one animation the 0.7.12 swap fix left on the click path. Sidebar press and hover feedback are now instant. The window-layout regression test builds a Vault-like masonry page during swaps and a source check keeps sidebar rows animation-free.
- The "Who read your vault" list no longer relies on timestamp+tool as a row identity, which repeats when an AI reads twice in the same second.

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
