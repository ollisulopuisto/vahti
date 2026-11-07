#!/bin/bash
# Inspect the final shipped bytes, not merely a successful notary submission.
set -euo pipefail
DMG="${1:?DMG path required}"
codesign --verify --strict --verbose=2 "$DMG"
xcrun stapler validate "$DMG"
spctl --assess --type open --context context:primary-signature --verbose=2 "$DMG"
MOUNT="$(mktemp -d)"
cleanup() { hdiutil detach "$MOUNT" -quiet || true; rmdir "$MOUNT" || true; }
trap cleanup EXIT
hdiutil attach "$DMG" -nobrowse -readonly -mountpoint "$MOUNT" -quiet
APP="$MOUNT/Vahti.app"
test -d "$APP"
codesign --verify --strict --deep --verbose=2 "$APP"
codesign -dvv "$APP" 2>&1 | grep -F 'TeamIdentifier=LWSR8T5392'
xcrun stapler validate "$APP"
spctl --assess --type execute --verbose=2 "$APP"
test "$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$APP/Contents/Info.plist")" = 'to.sulopuis.vahti'
lipo "$APP/Contents/MacOS/Vahti" -verify_arch arm64
test -x "$APP/Contents/Resources/runtime/node"
lipo "$APP/Contents/Resources/runtime/node" -verify_arch arm64
printf 'Verified notarized Vahti app, bundled runtime and disk image.\n'
