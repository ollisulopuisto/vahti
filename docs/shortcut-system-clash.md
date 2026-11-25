# Search shortcut fix, 25 November 2026

Scope: approved A1 shortcut proposal. Search defaults to Option-Shift-Command-K;
panel stays Option-Command-K. Explicit saved overrides are not migrated,
including a deliberately saved legacy search chord. Reset adopts the default.
Both registration failures now flow from HotKey to observable Store state and
appear beside the shortcut in Settings. Recording hides the old error; releasing
recording re-registers both shortcuts and refreshes or clears both errors.

Overlap check: current main6d4bce94, open/recent PRs and all branch tips inspected;
no competing shortcut change found. No AGENTS/BOARD/CODEX/roadmap/todo/bugs ledger
exists in this source snapshot. README and existing native test patterns read.

Own adversarial review RAN: traced default loading, explicit overrides, reset,
recording suspend/resume, releasing old registrations, independent hotkey ids,
menu hints and Settings error lifetime. No open source findings. No daemon,
network, account, dependency, workflow or paid-service changes.

Validation: new source regression failed on the old default, passes with fix.
Targeted Node tests10 pass,3 native tests skipped on this non-Mac host.
New macOS Swift test executes production Shortcut/HotKey definitions for defaults,
overrides, reset, malformed storage and registration-status messages in existing
CI. Full native build/test and real error-state pixels remain pending. No merge
or released-DMG claim. Version0.7.32, after main0.7.31.
