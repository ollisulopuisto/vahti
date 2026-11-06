## 2026-11-06 - Rename Kier to Vahti (fork identity)

**Task:** Olli asked for the app to be renamed Vahti, keeping a clear mention that it is a fork of Kier, and confirmed nothing has ever run on his Mac, so every identifier could change with no data migration.

**What changed:** every user-visible name, bundle id (`to.sulopuis.vahti`), launchd agent label, codesign identifiers, keychain service prefixes, `KIER_*` env vars to `VAHTI_*`, `Application Support/Vahti` data path, daemon CLI `bin/vahti.mjs`, HTTP auth headers `x-vahti-*`, build/package/release scripts, UI strings in Swift and daemon HTML, README (with fork attribution to Kier, pointing at LICENSE for the upstream copyright) and SECURITY.md. The update-feed default repository is now the fork's own public repository.

**Kept on purpose:** upstream resources that still live at getkier.com (terms of use URL, /changelog link, design references in comments), the upstream Sparkle public key (`SUPublicEDKey` - Olli has no matching private key yet), the FSL license and its upstream copyright line, and `app/changelog.json` history.

**Learning:** a blind `kier` -> `vahti` sed also rewrites `getkier.com` to `getvahti.com` (a domain that does not exist) and misses escaped regexes like `com\.getkier\.kier` in tests. Rename in ordered passes (full IDs first, then env prefixes, then the bare word), revert upstream URLs afterwards, then grep for stragglers.

## 2026-11-06 - Updates off, changelog link to the fork (owner answers)

**Decisions:** keep the getkier.com/terms link in Setup; Sparkle update checks off (`SUEnableAutomaticChecks` false, with the reason noted in Updater.swift) until a Sparkle key pair exists; the What's-new "All changes" button now opens the fork's releases page instead of getkier.com/changelog; Kier's orb artwork stays.

**Learning:** a Swift source that names the fork's repository URL sits outside privacy-gate's five approved identity paths, so a future publish run will flag app/Orb.swift. Accepted: the publish pipeline is upstream machinery the fork does not run, and the alternative (no changelog link) is worse.
