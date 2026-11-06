#!/bin/sh
# Builds ~/Applications/Vahti.app for development: it runs the daemon from this repo with Homebrew's Node (scripts/package-app.sh makes the
# self-contained one people download). Signing with the same identity and identifier keeps the Full Disk Access
# grant valid across rebuilds; an ad hoc signature would need granting again every time.
set -e
cd "$(dirname "$0")/.."
# Optional settings on the release machine; never part of the public export.
[ ! -f scripts/local.env ] || . ./scripts/local.env
ROOT="$(pwd)"
APP="${VAHTI_APP:-$HOME/Applications/Vahti.app}"
# Whoever builds it signs with their own certificate: the first Developer ID (or Apple Development) one in the
# keychain, unless VAHTI_SIGN_IDENTITY names another; with none, an ad hoc signature.
IDS="$(security find-identity -v -p codesigning 2>/dev/null)"
IDENTITY="${VAHTI_SIGN_IDENTITY:-$(printf '%s\n' "$IDS" | grep -m1 -oE '"Developer ID Application[^"]*"' | tr -d '"')}"
IDENTITY="${IDENTITY:-$(printf '%s\n' "$IDS" | grep -m1 -oE '"Apple Development[^"]*"' | tr -d '"')}"
IDENTITY="${IDENTITY:--}"
NODE="$(command -v node)"
SPARKLE="$(scripts/sparkle.sh)"

rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources" "$APP/Contents/Frameworks"
swiftc -O -F "$SPARKLE" -framework Sparkle -Xlinker -rpath -Xlinker @executable_path/../Frameworks app/*.swift -o "$APP/Contents/MacOS/Vahti"
# Sparkle, for updates (app/Updater.swift); Vahti isn't sandboxed, so without its XPC services.
FW="$APP/Contents/Frameworks/Sparkle.framework"
ditto "$SPARKLE/Sparkle.framework" "$FW"
rm -rf "$FW/XPCServices" "$FW/Versions/B/XPCServices"
# The companion orb is a Metal shader; SwiftUI loads it from the app's default.metallib. METAL and METALLIB can name
# another compiler when Xcode's own Metal toolchain isn't installed. If metal CLI is absent, fall back to bundling orb.metal.
if xcrun -sdk macosx -f "${METAL:-metal}" >/dev/null 2>&1; then
  SHADERS="$(mktemp -d)"
  xcrun -sdk macosx "${METAL:-metal}" -c app/orb.metal -o "$SHADERS/orb.air"
  xcrun -sdk macosx "${METALLIB:-metallib}" "$SHADERS/orb.air" -o "$APP/Contents/Resources/default.metallib"
else
  echo "metal compiler utility not found; bundling app/orb.metal for runtime compilation"
  cp app/orb.metal "$APP/Contents/Resources/orb.metal"
fi
# High-resolution orb artwork, loaded once with mipmaps.
cp app/icon/orb-hd.png "$APP/Contents/Resources/orb.png"
# Brand marks for where things came from (Design.swift, Brand).
cp -R app/brands "$APP/Contents/Resources/brands"
# What changed in each version, for the app's What's new page.
cp app/changelog.json "$APP/Contents/Resources/changelog.json"
# Every size macOS asks for, from the one 1024 px master: the Sealed Sun artwork fitted to Apple's 824/1024 grid.
ICONSET="$(mktemp -d)/Vahti.iconset"
mkdir -p "$ICONSET"
for s in "16" "32" "128" "256" "512"; do
  sips -z $s $s app/icon/vahti-icon.png --out "$ICONSET/icon_${s}x${s}.png" >/dev/null
  sips -z $((s * 2)) $((s * 2)) app/icon/vahti-icon.png --out "$ICONSET/icon_${s}x${s}@2x.png" >/dev/null
done
iconutil -c icns "$ICONSET" -o "$APP/Contents/Resources/Vahti.icns"
sed -e "s#__ROOT__#$ROOT/daemon#" -e "s#__NODE__#$NODE#" app/Info.plist > "$APP/Contents/Info.plist"
# The installed-app client ID is public configuration, never a client secret.
VAHTI_GOOGLE_CLIENT_ID="${VAHTI_GOOGLE_CLIENT_ID:-}" python3 - "$APP/Contents/Info.plist" <<'PYTHON'
import os, plistlib, sys
path = sys.argv[1]
with open(path, 'rb') as f: info = plistlib.load(f)
info['VahtiGoogleClientID'] = os.environ['VAHTI_GOOGLE_CLIENT_ID']
with open(path, 'wb') as f: plistlib.dump(info, f)
PYTHON
/usr/libexec/PlistBuddy -c "Set :SUFeedURL ${VAHTI_UPDATE_FEED:-https://github.com/${VAHTI_PUBLIC_REPO:-ollisulopuisto/vahti}/releases/latest/download/appcast.xml}" "$APP/Contents/Info.plist"
for part in "$FW/Versions/B/Autoupdate" "$FW/Versions/B/Updater.app" "$FW"; do codesign --force --options runtime --sign "$IDENTITY" "$part"; done
codesign --force --options runtime --identifier to.sulopuis.vahti --sign "$IDENTITY" "$APP"
codesign --verify --strict "$APP"
echo "$APP"
