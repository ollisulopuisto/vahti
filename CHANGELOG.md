# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Calendar Versioning](https://calver.org/).

## [0.7.27] - 2026-11-12

### Changed
- The notch glows only when something has actually come in: the halo breathes solely while an unseen notification (a fresh card, or someone you owe writing again) waits behind the notch, and goes dark once you have seen it. Reminder nudges for things already on your list, the morning and evening brief, and Vahti's own cards no longer light it up; the notch still widens a little when a reminder waits, and hovering still reveals it.

## [0.7.26] - 2026-11-12

### Changed
- The notch glow is softer and now wraps the notch's sides: Setup gains a glow switch and a brightness slider (defaulting well under the old strength), and the island's window is wide enough that the halo is no longer clipped at its left and right edges.
- Alerts can glow instead of sound: with the glow on, something new or something done plays one glow cycle in place of the ting or the chime; turning the glow off in Setup (or from the island's menu) brings the sounds back.

## [0.7.25] - 2026-11-11

### Fixed
- A tucked notch orb wakes only when the pointer enters the physical camera housing, measured from the screen's auxiliary menu-bar areas and safe-area inset. The old side margin and future orb position no longer launch it early. Once revealed, the wider hover area still keeps the housing-to-orb path open.

## [0.7.24] - 2026-11-10

### Fixed
- The non-Metal fallback performs the notch wake as the same slide: the orb is always drawn on a tall transparent canvas, glides between behind the housing and its spot below it on the island spring, and the housing zone is masked out, instead of appearing and vanishing in a blink.
- The 150ms hover hysteresis introduced for the notch's strip-to-orb hand-off no longer delays the right-edge island's hover and exit timers; it applies in the notch mode only.

## [0.7.23] - 2026-11-10

### Fixed
- The notch island no longer vanishes mid-throw: the hover target is a fixed union of the top-edge strip and the revealed orb's own zone (plus a 150ms hysteresis), so moving from behind the notch down onto the orb never crosses a gap while the island is still answering.
- The notch orb now wakes and sleeps by sliding down from and back up behind the camera housing - the shader paints only what hangs below the notch - instead of the pill growing and shrinking. The pill keeps one slim size and the orb keeps its scale throughout.

## [0.7.22] - 2026-11-10

### Changed
- The notch island is faster and backdrop-free. Hover wakes it the instant the pointer arrives - the 60ms dwell is gone - and the top edge is the target: the hit region spans the housing's width plus a margin and reaches the screen's top edge, so a cursor thrown at the notch wakes Vahti without aiming at the painted sliver. The open spring and the waiting pulse run quicker, and the pill's dark fill is gone again, matching the backdrop-free orb the right-edge island has had since 0.7.17.

## [0.7.21] - 2026-11-09

### Added
- A new "In the notch" island mode: Vahti lives as a slim pill under the camera notch, as wide as the housing. It pulses and runs its light along the pill's edge while something waits, a short hover (60ms) wakes the orb out of it, and it settles back 400ms after the pointer leaves. The pill steps aside while Vahti's own window is frontmost, and on a Mac without a notch the mode behaves like "Tucked away, shown on hover" at the right edge.

## [0.7.20] - 2026-11-09

### Fixed
- A hidden menu bar item whose button has detached from its window is now reported too: once the item has been seen on screen, a missing button window counts as hidden instead of skipping the check, while the same absence at launch still waits for layout to finish.

## [0.7.19] - 2026-11-09

### Added
- Menu bar overflow and notch handling: macOS hides status items that do not fit (a crowded menu bar or the laptop notch), which used to make Vahti's whole menu silently unreachable. The item now has a stable autosave identity so macOS remembers where you drag it, a new "Menu bar: icon only" switch drops the waiting count to keep the item narrow enough to fit, and a periodic geometry check against each screen's unobscured menu bar region reports the hidden state in the menu and Console instead of saying nothing. The orb and Command-Option-K keep opening Vahti either way.

## [0.7.18] - 2026-11-09

### Added
- Calendars to read: Setup's Sources tab lists every calendar the Mac syncs, each with its own switch, so shared or subscribed calendars (a partner's, the kids', a team calendar) can be kept out without turning the Calendar source off. Switching a calendar off stops new reads and removes what Vahti kept from it; switching it back on restores its recent and upcoming events on the next read. The switch is keyed on the calendar's name, the same key the Vault's forget chip uses, so calendars sharing a name switch together. A renamed calendar is seen as a new, switched-on calendar.

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
