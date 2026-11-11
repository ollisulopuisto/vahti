# Morning Vahti build diagnostic, 2026-11-11

Original fresh-main run cancelled after over two hours hung in packaged-copy daemon
tests, before signing/notarization. This isolated build-config branch keeps app and
daemon checkout pinned to merged main. The package script is instrumented only to
name its temporary test log; a progress monitor emits only test names, not output.
All tests stay enabled. Package execution has a 20-minute bound and workflow a
35-minute bound. No Actions artifacts/cache writes. A successful build is verified
and delivered to the existing manual draft release. Do not merge.
