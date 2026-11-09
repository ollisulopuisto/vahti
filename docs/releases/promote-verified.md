# Promote manual.96 without rebuilding

Prepared for the owner's November 9 request. No AGENTS/BOARD/TODO files exist;
read .jules/instinct.md, both workflows, CHANGELOG and app/changelog.json first.

The existing v* tag route builds and notarizes again. A new guard committed today
cannot affect a tag pinned to the older binary-source commit. Instead,
`promote-verified.yml` is manually dispatched on main by the repository owner.
Default `publish=false` only verifies. `publish=true` creates a separate clean
release for v0.7.16, pinned to the original binary source 0c1a3ed, with only the
verified manual.96 DMG and its checksum. The old manual draft stays intact.

The workflow uses only the repository's GITHUB_TOKEN. GitHub documents that its
tag/release events do not start other workflows:
https://docs.github.com/en/actions/how-tos/writing-workflows/choosing-when-your-workflow-runs/triggering-a-workflow
Do not substitute a PAT or App token, or create the v* tag outside this route.

The helper checks the original successful build source, source draft asset IDs,
size, actual downloaded SHA256 and exact checksum file. It uploads to a new draft,
downloads and compares both uploaded files before publication, then checks the
published tag points at the original source. An existing target tag/release stops
it rather than overwriting. A failed partial upload stays unpublished for review;
do not blindly retry, delete or retarget it.

No Mac build, signing/notary secrets, cache, retained Actions artifact or external
service is used. The repository is public and uses a standard Ubuntu runner.
Source build verification includes Apple's Accepted status, staple and Gatekeeper
checks; the owner subsequently confirmed the orb and Settings work on their Mac.

Validation: four synthetic tests plus live read-only verifier downloaded and
hashed both original assets. PR-only preparation: do not merge, dispatch or
publish until the owner approves. Release wording is in 0.7.16.md, drawn from the
bundled What's New. Rollback before publishing: close the PR. After publishing,
unpublishing requires a separate owner decision.
