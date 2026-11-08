# Vahti

Vahti is a macOS app that reads sources you enable, finds promises and requests,
and keeps a list of what you owe people. It links each card to its evidence and
tries to notice when the work is done. You can search the local vault and ask
questions about what it has collected.

This is a fork of [Kier](https://getkier.com), with a native SwiftUI window, a
Node.js daemon and local model support. It is source-available under
[FSL-1.1-ALv2](LICENSE), not MIT or Apache today. The licence names the upstream
copyright holder and its future Apache 2.0 conversion terms.

Vahti's suggestions are not a complete or authoritative record of your
commitments. Check the source before relying on a card or automatic completion.

## Install

Packaged builds require **Apple Silicon and macOS 14 or later**. The app bundles
its Node runtime and daemon; you do not need Homebrew Node just to run it.

1. Open this repository's [Releases](../../releases). Manual builds are uploaded
   to the **Vahti manual builds** draft, which needs repository write access to
   view. Draft links are not public downloads.
2. Download the numbered arm64 DMG and its matching SHA256 file. In the download
   folder, run `shasum -a 256 -c <actual-DMG-filename>.sha256`.
3. Open the DMG, copy Vahti to Applications and launch it.
4. Follow Setup to choose sources, grant the required macOS permissions and
   install the managed local model or choose a model endpoint.

Depending on the sources, Vahti needs Full Disk Access, Accessibility, Calendar
or Reminders permission. Only grant access you intend to use. Automatic Sparkle
checks are disabled in this fork until its own update-signing setup is ready;
install a newer build deliberately rather than relying on an update prompt.

## What it does

- **Commitment cards:** promises, requests, callbacks, people and dates, with
  the source messages behind them. Completion detection tries to close the loop.
- **Vault and search:** keep collected context, search by meaning, inspect cards
  and use Forget to remove material you do not want retained.
- **Ask:** questions about stored context, using the chosen model. Claude handoffs
  and other optional external helpers have separate controls.
- **Orb and menu:** open the companion panel from the screen-edge orb or shortcut.
  Setup can keep it always shown, tucked on hover or hidden. The menu shows the
  installed version/build and renderer status; a non-Metal drawing is available
  when GPU rendering cannot start.
- **Sources:** Messages/iMessage/SMS, supported WhatsApp data, mail, calls,
  Calendar, notifications, browser history, downloads, Git work, local AI sessions,
  clipboard/app activity and chat text available through Accessibility. What can
  actually be collected depends on installed apps, their data and permissions.
- **Optional integrations:** Gmail, Todoist, local Postilaatikko mail cache,
  Solmu's local reader and explicitly configured MCP read tools.
- **Calendar/Reminders:** opt-in sync can write plans or dated tasks. Reading your
  existing reminders can also let Vahti mark one complete when it sees evidence.
  These are account changes, not read-only collection.

Use **Setup → What Vahti reads** to switch sources off. Disabled sources stop
collection and are excluded from reader results; turning a source off is not a
claim that all stored data has been deleted. Use Forget for removal.

## Privacy and external services

The vault, configuration and local runtime data live under:

```text
~/Library/Application Support/Vahti/
```

The managed model runs locally. Vahti does not require a Vahti account or hosted
vault service. That is not a promise of no network traffic:

- Model/runtime downloads need the network. A custom model endpoint receives
  content sent to it; use a local endpoint if that is your intended boundary.
- Gmail and Todoist connect to their providers. Calendar/Reminders changes may
  sync through the account configured on the Mac.
- Online helpers, cloud review and Claude handoffs are optional. A handoff shows
  its brief before sending. Ask with Codex is currently unavailable because the
  required tools-only boundary is not verified.
- Configured MCP sources run the tools and arguments you choose. A local command
  may contact other services; this is not a sandbox. Only enable tools you trust.
- MCP clients querying Vahti can receive private vault content. Read access is
  logged; the default role is read-only. A client explicitly configured with
  `VAHTI_MCP_ROLE=read-write` has broader tools. Review source scopes as well as roles.

Vahti includes credential redaction and privacy filters, but no filter guarantees
that arbitrary private content is safe. Protect the Mac, its FileVault/login and
backups. Do not share vault files, provider tokens or personal messages in issues.
Report vulnerabilities privately through [SECURITY.md](SECURITY.md).

## Optional local mail and chat readers

**Postilaatikko** reads already-cached personal mail from the existing local
compatibility database, read-only. It does not fetch missing provider bodies,
attachments, or change read markers. Incomplete previews are not treated as full
authored completion evidence. Mail and Postilaatikko must both be enabled.

**Solmu** requires its separate experimental `solmu-reader` on the same Mac and a
dedicated restricted token file. Vahti does not bundle or start it. The current
collector supports one Beeper origin, not native WhatsApp or a full history sync.
It polls bounded recent chats/messages, so busy histories can have gaps.

[Local integration setup and limits](docs/local-integrations.md) preserves the
exact connection commands, token-file rules and current live-verification caveats.
Do not substitute a Beeper access token or put credentials in command arguments.

## Build from source

Use an Apple Silicon Mac, Xcode command-line tools, Node.js **23+** and Python 3.
Node 24 is used for packaged builds. The build can compile bundled Metal source
at runtime when the command-line Metal compiler is unavailable.

```sh
git clone https://github.com/ollisulopuisto/vahti.git
cd vahti
npm --prefix daemon ci
npm --prefix daemon test
scripts/build-app.sh
```

The development app is written to `~/Applications/Vahti.app` and runs the daemon
from this checkout. Set `VAHTI_APP` to choose another output path. The script
fetches/verifies Sparkle and signs with an available development certificate or
ad hoc identity. Keep a stable identity when testing permissions.

A self-contained package also needs Bun:

```sh
scripts/package-app.sh
```

This is not necessarily a notarized distribution build. For a release, use
`scripts/package-app.sh --release` with a Developer ID identity and configured
notary profile, or dispatch **Build & Package Vahti** with **notarize** enabled.
That workflow fails if signing/notary credentials are missing and verifies the
mounted final app/DMG before uploading the DMG and checksum directly to a draft.
No Actions build artifacts are retained. Never commit `scripts/local.env`.

## Test and contribute

```sh
npm --prefix daemon test
python3 -m unittest discover -s scripts/tests -v
```

Native tests in `tests/manual/` need macOS: they exercise disposable keychains and
the non-Metal orb drawing. Linux/synthetic checks do not establish macOS UI,
permission or live-account acceptance. Use invented data in tests and bug reports.

- [Changelog](CHANGELOG.md)
- [Security notes](SECURITY.md)
- [Local integration setup](docs/local-integrations.md)
- [Release workflow](.github/workflows/build.yml)

## Licence and warranty

See [LICENSE](LICENSE) for FSL-1.1-ALv2 permitted uses, restrictions, future licence
and warranty disclaimer. Public source access does not remove those terms.
