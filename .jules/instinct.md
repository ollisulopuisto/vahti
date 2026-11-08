## 2026-11-06 - Rename Kier to Vahti (fork identity)

**Task:** Olli asked for the app to be renamed Vahti, keeping a clear mention that it is a fork of Kier, and confirmed nothing has ever run on his Mac, so every identifier could change with no data migration.

**What changed:** every user-visible name, bundle id (`to.sulopuis.vahti`), launchd agent label, codesign identifiers, keychain service prefixes, `KIER_*` env vars to `VAHTI_*`, `Application Support/Vahti` data path, daemon CLI `bin/vahti.mjs`, HTTP auth headers `x-vahti-*`, build/package/release scripts, UI strings in Swift and daemon HTML, README (with fork attribution to Kier, pointing at LICENSE for the upstream copyright) and SECURITY.md. The update-feed default repository is now the fork's own public repository.

**Kept on purpose:** upstream resources that still live at getkier.com (terms of use URL, /changelog link, design references in comments), the upstream Sparkle public key (`SUPublicEDKey` - Olli has no matching private key yet), the FSL license and its upstream copyright line, and `app/changelog.json` history.

**Learning:** a blind `kier` -> `vahti` sed also rewrites `getkier.com` to `getvahti.com` (a domain that does not exist) and misses escaped regexes like `com\.getkier\.kier` in tests. Rename in ordered passes (full IDs first, then env prefixes, then the bare word), revert upstream URLs afterwards, then grep for stragglers.

## 2026-11-06 - Updates off, changelog link to the fork (owner answers)

**Decisions:** keep the getkier.com/terms link in Setup; Sparkle update checks off (`SUEnableAutomaticChecks` false, with the reason noted in Updater.swift) until a Sparkle key pair exists; the What's-new "All changes" button now opens the fork's releases page instead of getkier.com/changelog; Kier's orb artwork stays.

**Learning:** a Swift source that names the fork's repository URL sits outside privacy-gate's five approved identity paths, so a future publish run will flag app/Orb.swift. Accepted: the publish pipeline is upstream machinery the fork does not run, and the alternative (no changelog link) is worse.

## 2026-11-07 - Manual notarized release delivery

Instinct adds fail-closed credential checks for requested notarization and
versioned DMG/SHA256 uploads directly to a draft GitHub release. Workflow
artifacts removed to avoid separately metered retention. Final bytes are
mounted and checked for signatures, Developer ID team, stapled tickets,
Gatekeeper acceptance, Vahti identity and arm64 app/runtime presence. Public
repo and standard macos-latest runner verified live. Prior manual-run logs
proved the certificate/notary credentials worked; secret listing is unavailable.
No changes to the app, data paths, Sparkle settings or UI. Shell syntax and
focused workflow contract checks pass locally; native CI must validate the
build and real notarization only happens on the subsequent manual run.
Maintainer approved this workflow PR's merge once green, then the build.
Rollback: revert this workflow PR. No main push or new service/cost.

## 2026-11-07 - PR10 conflict repair

Instinct merged current main into the adultHost Set-lookup branch, preserving
both conflicting Bolt journal sections and all newer tasks/find changes.
Focused privacy/profile-privacy tests pass locally (5 tests, synthetic data).
Full local tests on Node22/Linux have platform/locale failures; macOS Node24
CI remains the acceptance gate. No layout, collection policy or identifiers
changed. Maintainer approved merging this task's open PRs once green, then
notarized GitHub DMGs. No merge until current checks pass. Rollback: revert PR10.

## 2026-11-07 - Correct final architecture check argument order

Manual build 42352407175 received Apple Accepted for the app and DMG and passed
both staple and Gatekeeper checks, then final verification failed because lipo
interpreted the filename after its variadic -verify_arch option as another
architecture. Move both input filenames before -verify_arch arm64. Add exact
argument-order regression coverage. Keep fail-closed verification and no upload
on failure; no bypass, app/data or signing-policy changes. Focused contract tests
and shell syntax pass locally. Green native CI remains the gate. Revert this
follow-up PR to roll back; no direct main push.

## 2026-11-08 - PR26 production masonry width correction

Both Devin findings apply: move width validation into production Masonry and
return that same normalized width from sizeThatFits. Mirror the helpers in the
window fixture. Non-finite/non-positive/out-of-practical-range widths fall back
to minWidth, avoiding Int traps and pathological column allocations. Version
0.7.15/build107 with What's New. Add shared-source and native math regressions.
No merge, no manual build/publish. Native compile/UI acceptance remains macOS CI.

## 2026-11-08 - Release credential transport hardening

Keep certificate/keychain passwords out of process argv via security -i stdin;
store notary credentials via echo-disabled private TTY and use keychain profiles
for submit/log. Child environments drop secret aliases, errors withhold output,
and line-protocol values reject newline/NUL injection. Reuse the Kuulas transport
pattern, with dummy-data regression tests and an actual disposable macOS keychain
smoke check before real credential setup. Bare-filename checksums are retained.
Release routes remain direct GitHub Releases without cache/artifact writes.
PR only, no merge/tag/build. Native smoke validation awaits macOS CI.

### Missing signing-certificate path

Only store notary credentials after certificate import created the keychain.
Without signing secrets, nonrelease test builds can still skip signing/notary
setup; requested notarized release builds fail at the existing credential gate.

## 2026-11-08 - Keychain search preservation and failure regression

Preserve the original keychain search list when importing a CI identity. Fail
closed on stderr even if the interpreter exits zero, and add a real native
negative smoke check (unlock nonexistent keychain must raise with output withheld).
One-command security -i status is retained in Apple's source; native CI verifies
actual runner behavior. No tag/build/merge; local synthetic tests pass.

## 2026-11-08 - Invisible orb safety net and diagnostics

A shown NSPanel did not mean its Metal layer ever painted. Every renderer init
failure was silently discarded, leaving IslandHost with only the optional glance
text. Keep a non-Metal production view until a completed GPU frame, return to it
on GPU failures or a stalled visible renderer, and show version/build/status in
the menu. Log the init stage and GPU errors to the Orb category. Retain shader
source even for compiled-library builds, validate entry points, defer display-link
start until window attachment, and reposition on Show/display changes. The exact
failure on the reporting Mac is unconfirmed. No AGENTS/BOARD exists in this public
checkout. PR only; no merge or release build. Local source/shell guards pass;
macOS compile/native pixel smoke and actual visual acceptance remain pending.
Rollback: revert this PR. No data/permissions/secret or daemon behavior changes.
