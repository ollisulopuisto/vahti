<p align="center">
  <img src="docs/orb.png" width="168" alt="Vahti">
</p>

<h1 align="center">Vahti</h1>

<p align="center">
  <b>Remember every promise.</b><br>
  Vahti keeps track of what you owe people, and notices when it's done.
</p>

<p align="center"><sub>Free · macOS 14 or later · Apple Silicon</sub></p>

<p align="center"><sub>Vahti is a fork of <a href="https://getkier.com">Kier</a>; see <a href="LICENSE">LICENSE</a> for the upstream copyright.</sub></p>

## What it does

You tell someone "I'll send it tomorrow" and then life happens. Vahti reads the conversations you already have and keeps a short list of what you owe, to whom and by when. When you actually do the thing, it sees that too and ticks it off.

- **Reads where you talk.** WhatsApp, iMessage and SMS, calls, calendar, notifications, and the chat apps on your screen.
- **Finds what you owe.** Promises, requests and callbacks become cards with a person, a date and the message behind it.
- **Notices when it's done.** A sent file, a call back, a reply: Vahti closes the card on its own.
- **Ask it anything.** "What did I tell Nika about the puzzle club?" It searches by meaning, in any language.

## Everything stays on your Mac

There is no Vahti account and no Vahti server. The app, your vault and the models that read it all run on your Mac. Nothing leaves it unless you hand something to Claude or ChatGPT yourself, or switch on an optional helper.

## Why the code is public

Vahti reads your messages, so you should be able to read Vahti. Every line that touches your data is here:

- [collectors](daemon/collectors/) read chats, calls, contacts, calendar, browser history, downloads, Git work and AI sessions
- [the app](app/main.swift) reads clipboard changes, app activity and visible chat messages through Accessibility
- [setup settings](daemon/lib/settings.mjs) switch any source off, everywhere
- [redaction](daemon/lib/redact.mjs) masks credentials and financial identifiers before anything is stored
- [privacy filters](daemon/lib/privacy.mjs) keep out adult content and let you forget anything
- [MCP](daemon/bin/mcp.mjs) lets local AI clients query the vault, read only by default, with every read logged

Vahti never sends a chat reply or makes a payment. External model servers are optional and only see what Vahti sends them when you pick one in [model settings](daemon/lib/model-settings.mjs). [Online helpers](daemon/lib/config.mjs), [cloud reviews](daemon/lib/doublecheck.mjs) and [Claude or Codex handoffs](daemon/lib/handoff.mjs) are opt-in, and a handoff shows you the exact brief before anything is sent. [Phone sync](app/PhoneSync.swift) is off by default; turned on, it writes to Calendar and Reminders, which your account provider may sync to your other devices.

## Build it yourself

You need an Apple Silicon Mac with macOS 14 or later, Xcode command line tools with the Metal compiler, Node 23 or later, and Python 3.

```sh
cd vahti
npm --prefix daemon ci
npm --prefix daemon test
scripts/build-app.sh
```

The development app goes to `~/Applications/Vahti.app` and runs the daemon from this checkout; set `VAHTI_APP` to build somewhere else. The build fetches and verifies Sparkle, and signs with your development certificate or an ad hoc signature. Grant the macOS permissions and install the local model from Setup.

`scripts/package-app.sh` makes a self-contained download; it also needs Bun and a Developer ID certificate. Release signing, notary profiles, the update feed and repository settings come from environment variables or a private `scripts/local.env`. Never commit that file.

Ask with Codex is switched off for now, because its CLI can't yet be limited to Vahti's own tools; Ask with Claude works. MCP is read only unless a client you set up explicitly asks for `VAHTI_MCP_ROLE=read-write`, and switched off sources stay off for every query.

Found a security problem? Report it privately, as described in [SECURITY.md](SECURITY.md).

## License

Vahti is a fork of Kier; the upstream copyright holder is named in [LICENSE](LICENSE). The code is available under [FSL-1.1-ALv2](LICENSE), which turns into Apache 2.0 after two years.

## No warranty

Vahti is free and provided as is, without warranty of any kind. Keeping your Mac secure (login, FileVault, updates, backups) is up to you. See [LICENSE](LICENSE) for the license terms.

### Notarized GitHub downloads

Run **Build & Package Vahti** manually with **notarize** enabled (the default).
It requires both the Developer ID certificate and Apple notary credentials;
missing credentials fail rather than produce an ad-hoc download. After signing,
Apple acceptance, stapling and Gatekeeper checks on the mounted app and DMG,
it uploads a numbered Apple Silicon DMG and SHA256 file directly to the
**Vahti manual builds** draft release. The repository owner can download it
there. Tag builds publish through the tag's release. Builds do not retain
workflow artifacts. The app still needs native permission/setup acceptance;
notarization is not a claim that every workflow has been tested.

## Solmu and Postilaatikko (opt-in)

These integrations read existing local data, not send messages. Results stay in
Vahti's vault under the same redaction, Forget and source-access rules as other
messages. No external AI scope is added automatically.

### Postilaatikko

In Setup, choose **Postilaatikko cached mail > Enable cached mail**. Both Mail
and Postilaatikko must be on in **What Vahti reads**. Disconnect in Setup or turn
either source off to stop collection and hide existing mail from readers.

Vahti opens the existing compatibility-path database
`~/Library/Application Support/Aerion/aerion.db` read-only. It reads bounded pages
of enabled accounts' recent personal mail, excluding drafts, deleted mail,
trash/spam, attachments and credential tables. Only already-cached plain bodies
are used as authored completion evidence. Previews/headers remain incomplete;
Vahti never fetches a provider body, runs migrations or marks messages read.
An unfamiliar schema fails closed. A large cache is scanned in pages of at most
200 messages. Newly downloaded bodies are picked up on a later sweep. HTML-only
or unfetched bodies are not treated as complete authored text.

The current Postilaatikko helper does not mount its mail API listener, so this
integration deliberately uses the cache instead of claiming an unavailable API.

### Solmu

Requires the experimental `solmu-reader` binary from Solmu, running on the same
Mac and configured by its owner. It is not bundled, installed or started by
Vahti. This first version serves one Beeper origin only: native WhatsApp mode,
multiple origins, linked-person merging, attachments, edits and deletions are
not imported. At most the newest 100 chats and 100 messages in each are polled
every five minutes; this is not a complete history sync and busy chats can have
gaps. Restricted reader credentials may expose fewer chats with no paging.

Use the Solmu reader's own setup instructions to provision a dedicated credential
with only `chats:read,messages:read`, optionally restricted to chosen accounts.
Save that credential in an absolute-path regular file owned by you, mode 0600.
Never use the Beeper access token, put credentials in command arguments, or
paste them into a conversation. With the reader running on 127.0.0.1:23377, run:

```sh
/Applications/Vahti.app/Contents/Resources/runtime/node /Applications/Vahti.app/Contents/Resources/daemon/bin/connect-solmu.mjs --token-file /absolute/path/to/private/reader-token
```

For a source checkout:

```sh
node daemon/bin/connect-solmu.mjs --token-file /absolute/path/to/private/reader-token
```

`--url http://127.0.0.1:PORT` selects a different loopback port. Remote URLs,
redirects, credential URLs and symlink/world-readable token files are refused.
Only GET chat-list and message-list routes are allowed. No send/edit/read-marker
endpoint is called. Turn Solmu off in **What Vahti reads** to stop collection and
hide stored Solmu evidence; revoke its named token with `solmu-reader token
revoke NAME` for server-side revocation. Reconnect with the helper if you replace
the credential file. Existing external-AI source scopes must explicitly include
`solmu` before those clients can read it.

The reader's real Beeper GET/read-status side effects and real account response
shapes have not been verified. Synthetic end-to-end tests cover the collector,
authorship, scoped reads, source revocation, Forget, transport limits and
Postilaatikko cached body provenance. A real-Mac check is still required before
claiming complete live integration coverage.
