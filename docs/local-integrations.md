# Local mail and chat integrations

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
