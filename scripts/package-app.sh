#!/bin/bash
# Makes the Vahti people download: dist/Vahti.dmg, holding a Vahti.app that carries its own Node and daemon, so it needs
# no separate Node installation; setup offers the managed model runtime. scripts/build-app.sh is the development build instead: it runs
# the daemon from this checkout with Homebrew's Node.
#
#   scripts/package-app.sh             signed with your Developer ID, not notarized (to try it on this Mac)
#   scripts/package-app.sh --release   Developer ID, notarized and stapled: what getkier.com hands out
#
# The release path refuses to guess: no Developer ID certificate or no notary credentials and it stops.
#   VAHTI_SIGN_IDENTITY    defaults to the first "Developer ID Application" in the keychain
#   VAHTI_NOTARY_PROFILE   notarytool keychain profile, or a profile in VAHTI_NOTARY_PROFILES
#                         (default: vahti). Create your own with notarytool store-credentials.
#   VAHTI_NODE_VERSION     Node release to bundle (default: the latest 24.x LTS from nodejs.org)
set -euo pipefail
cd "$(dirname "$0")/.."
# Optional settings on the release machine; never part of the public export.
[ ! -f scripts/local.env ] || . ./scripts/local.env
export VAHTI_LANGUAGES="${VAHTI_LANGUAGES:-en,hr}"
ROOT="$(pwd)"
RELEASE=false
[[ "${1:-}" == "--release" ]] && RELEASE=true

die() { echo "package-app: $*" >&2; exit 1; }
step() { echo "==> $*"; }

VERSION="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' app/Info.plist)"
BUILD="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleVersion' app/Info.plist)"
MIN_OS="$(/usr/libexec/PlistBuddy -c 'Print :LSMinimumSystemVersion' app/Info.plist)"
OUT="$ROOT/dist"
APP="$OUT/Vahti.app"
RES="$APP/Contents/Resources"
CACHE="$HOME/Library/Caches/vahti-build"

IDENTITY="${VAHTI_SIGN_IDENTITY:-$(security find-identity -v -p codesigning 2>/dev/null | grep -m1 -oE '"Developer ID Application[^"]*"' | tr -d '"' || true)}"
if $RELEASE; then
  [[ -n "$IDENTITY" ]] || die "no 'Developer ID Application' certificate in the keychain (developer.apple.com > Certificates)."
  PROFILE="${VAHTI_NOTARY_PROFILE:-vahti}"
else
  IDENTITY="${IDENTITY:-$(security find-identity -v -p codesigning 2>/dev/null | grep -m1 -oE '"Apple Development[^"]*"' | tr -d '"' || true)}"
  IDENTITY="${IDENTITY:--}"
fi
echo "Vahti $VERSION ($BUILD), macOS $MIN_OS+, signed by: $IDENTITY"

# --- Node ----------------------------------------------------------------------------------------------------------
# The official nodejs.org build: one self-contained binary (Homebrew's links against other Homebrew libraries).
step "Fetching Node"
mkdir -p "$CACHE"
LINE="$(curl -fsSL "https://nodejs.org/dist/${VAHTI_NODE_VERSION:-latest-v24.x}/SHASUMS256.txt" | grep -E 'node-v[0-9.]+-darwin-arm64\.tar\.xz$')"
SUM="${LINE%% *}"; FILE="${LINE##* }"; NODE_VERSION="$(echo "$FILE" | grep -oE 'v[0-9.]+[0-9]')"
TARBALL="$CACHE/$FILE"
[[ -f "$TARBALL" ]] || curl -fsSL "https://nodejs.org/dist/$NODE_VERSION/$FILE" -o "$TARBALL"
echo "$SUM  $TARBALL" | shasum -a 256 -c - >/dev/null || { rm -f "$TARBALL"; die "Node download failed its checksum"; }
NODE_DIR="$CACHE/${FILE%.tar.xz}"
[[ -x "$NODE_DIR/bin/node" ]] || tar -xJf "$TARBALL" -C "$CACHE"
echo "Node $NODE_VERSION"
# The daemon's tests on exactly the Node that ships.
# On failure, only the names of failing tests are shown, never their output.
failed() { grep -E '^✖' "$1" | sort -u | head -20 >&2; }
TESTLOG="$(mktemp)"
if [[ "${VAHTI_SKIP_TESTS:-false}" != "true" ]]; then
  (cd daemon && "$NODE_DIR/bin/node" --disable-warning=ExperimentalWarning --test 'tests/*.test.mjs' >"$TESTLOG" 2>&1) || { failed "$TESTLOG"; die "daemon tests fail on Node $NODE_VERSION"; }
fi

# --- App -----------------------------------------------------------------------------------------------------------
step "Building Vahti.app"
SPARKLE="$(scripts/sparkle.sh)"
rm -rf "$OUT"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Frameworks" "$RES/runtime"
swiftc -O -target "arm64-apple-macos$MIN_OS" -F "$SPARKLE" -framework Sparkle -Xlinker -rpath -Xlinker @executable_path/../Frameworks \
  app/*.swift -o "$APP/Contents/MacOS/Vahti"
# Sparkle, for updates (app/Updater.swift); Vahti isn't sandboxed, so without its XPC services.
FW="$APP/Contents/Frameworks/Sparkle.framework"
ditto "$SPARKLE/Sparkle.framework" "$FW"
rm -rf "$FW/XPCServices" "$FW/Versions/B/XPCServices"
if xcrun -sdk macosx -f "${METAL:-metal}" >/dev/null 2>&1; then
  SHADERS="$(mktemp -d)"
  xcrun -sdk macosx "${METAL:-metal}" -c app/orb.metal -o "$SHADERS/orb.air"
  xcrun -sdk macosx "${METALLIB:-metallib}" "$SHADERS/orb.air" -o "$RES/default.metallib"
else
  echo "metal compiler utility not found; bundling app/orb.metal for runtime compilation"
fi
# Source is a recovery route for a missing/incompatible compiled library.
cp app/orb.metal "$RES/orb.metal"
# High-resolution orb artwork, loaded once with mipmaps.
cp app/icon/orb-hd.png "$RES/orb.png"
# Brand marks for where things came from (Design.swift, Brand).
cp -R app/brands "$RES/brands"
# What changed in each version, for the app's What's new page.
cp app/changelog.json "$RES/changelog.json"
ICONSET="$(mktemp -d)/Vahti.iconset"
mkdir -p "$ICONSET"
for s in "16" "32" "128" "256" "512"; do
  sips -z $s $s app/icon/vahti-icon.png --out "$ICONSET/icon_${s}x${s}.png" >/dev/null
  sips -z $((s * 2)) $((s * 2)) app/icon/vahti-icon.png --out "$ICONSET/icon_${s}x${s}@2x.png" >/dev/null
done
iconutil -c icns "$ICONSET" -o "$RES/Vahti.icns"
# Empty VahtiRoot and VahtiNode: the launcher finds the daemon and Node inside the app.
sed -e "s#__ROOT__##" -e "s#__NODE__##" app/Info.plist > "$APP/Contents/Info.plist"
# The installed-app client ID is public configuration, never a client secret.
VAHTI_GOOGLE_CLIENT_ID="${VAHTI_GOOGLE_CLIENT_ID:-}" python3 - "$APP/Contents/Info.plist" <<'PYTHON'
import os, plistlib, sys
path = sys.argv[1]
with open(path, 'rb') as f: info = plistlib.load(f)
info['VahtiGoogleClientID'] = os.environ['VAHTI_GOOGLE_CLIENT_ID']
with open(path, 'wb') as f: plistlib.dump(info, f)
PYTHON
/usr/libexec/PlistBuddy -c "Set :SUFeedURL ${VAHTI_UPDATE_FEED:-https://github.com/${VAHTI_PUBLIC_REPO:-ollisulopuisto/vahti}/releases/latest/download/appcast.xml}" "$APP/Contents/Info.plist"

# The daemon with only what it runs on: no tests, no development packages.
mkdir -p "$RES/daemon"
cp -R daemon/bin daemon/lib daemon/collectors daemon/ui daemon/sidecar daemon/package.json daemon/package-lock.json "$RES/daemon/"
(cd "$RES/daemon" && "$NODE_DIR/bin/node" "$NODE_DIR/lib/node_modules/npm/bin/npm-cli.js" ci --omit=dev --ignore-scripts --no-audit --no-fund >/dev/null)
# Strip comments from the packaged runtime to reduce its size; the public source retains them.
# Run tests on the packaged copy as well.
command -v bun >/dev/null || die "bun is needed to take the comments out of the daemon (brew install oven-sh/bun/bun)"
bun scripts/strip-comments.mjs "$RES/daemon"
# Some tests read the app and release scripts beside the daemon, as in the repository.
if [[ "${VAHTI_SKIP_TESTS:-false}" != "true" ]]; then
  CHECK="$(mktemp -d)"
  mkdir "$CHECK/daemon" && cp -R "$RES/daemon/." "$CHECK/daemon/" && cp -R daemon/tests "$CHECK/daemon/tests" && cp -R app scripts .github "$CHECK/"
  (cd "$CHECK/daemon" && "$NODE_DIR/bin/node" --disable-warning=ExperimentalWarning --test 'tests/*.test.mjs' >"$TESTLOG" 2>&1) || { failed "$TESTLOG"; die "daemon tests fail on the copy without comments"; }
  rm -f "$TESTLOG"
  rm -rf "$CHECK"
else
  rm -f "$TESTLOG"
fi
find "$RES/daemon" \( -name '__pycache__' -o -name '.DS_Store' \) -prune -exec rm -rf {} +
cp "$NODE_DIR/bin/node" "$RES/runtime/node"
cp "$NODE_DIR/LICENSE" "$RES/runtime/LICENSE"

# --- Signing -------------------------------------------------------------------------------------------------------
# Inside out: Node and Sparkle's helpers first, Node with what V8 needs under the hardened runtime (JIT only: unsigned
# executable memory is not needed), then the app around it.
step "Signing"
ENT="$(mktemp -d)/node.entitlements"
cat > "$ENT" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>com.apple.security.cs.allow-jit</key><true/>
</dict>
</plist>
PLIST
codesign --force --timestamp --options runtime --entitlements "$ENT" --identifier to.sulopuis.vahti.node --sign "$IDENTITY" "$RES/runtime/node"
for part in "$FW/Versions/B/Autoupdate" "$FW/Versions/B/Updater.app" "$FW"; do codesign --force --timestamp --options runtime --sign "$IDENTITY" "$part"; done
# The app writes plans and dated tasks into Calendar and Reminders (PhoneSync.swift); under the hardened runtime that
# takes the calendars entitlement, without which macOS refuses the access without asking.
APPENT="$(mktemp -d)/vahti.entitlements"
cat > "$APPENT" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>com.apple.security.personal-information.calendars</key><true/>
</dict>
</plist>
PLIST
codesign --force --timestamp --options runtime --entitlements "$APPENT" --identifier to.sulopuis.vahti --sign "$IDENTITY" "$APP"
codesign --verify --strict --deep --verbose=1 "$APP" 2>&1 | tail -1

notarize() {
  step "Notarizing $(basename "$1") (usually a few minutes)"
  xcrun notarytool submit "$1" --keychain-profile "$PROFILE" --wait | tee "$OUT/notary.log" | tail -3
  grep -q "status: Accepted" "$OUT/notary.log" || {
    ID="$(grep -m1 -oE 'id: [0-9a-f-]{36}' "$OUT/notary.log" | cut -d' ' -f2)"
    [[ -n "$ID" ]] && xcrun notarytool log "$ID" --keychain-profile "$PROFILE" >&2
    die "Apple did not accept $(basename "$1")"
  }
}

# --- Disk image ----------------------------------------------------------------------------------------------------
step "Making Vahti.dmg"
STAGE="$(mktemp -d)"
cp -R "$APP" "$STAGE/"
ln -s /Applications "$STAGE/Applications"
hdiutil create -quiet -volname "Vahti" -srcfolder "$STAGE" -fs HFS+ -format UDZO -imagekey zlib-level=9 "$OUT/Vahti.dmg"
python3 packaging/dmg/restyle.py "$OUT/Vahti.dmg" "Vahti.app" packaging/dmg/welcome-vahti.png
xattr -c "$OUT/Vahti.dmg"
codesign --force --timestamp --sign "$IDENTITY" "$OUT/Vahti.dmg"
cp "$OUT/Vahti.dmg" "$OUT/Vahti-$VERSION.dmg"
if $RELEASE; then
  # Notarization uploads bytes too. Validate before the first submission to Apple.
  [ "${VAHTI_VALIDATE_RELEASE:-false}" != "true" ] || scripts/release-app.sh --validate-only
  ditto -c -k --keepParent "$APP" "$OUT/Vahti-notarize.zip"
  notarize "$OUT/Vahti-notarize.zip"
  rm "$OUT/Vahti-notarize.zip"
  xcrun stapler staple "$APP" >/dev/null
  # Stapling changes the app. Build a fresh image and validate it before that upload.
  rm -rf "$STAGE/Vahti.app"
  cp -R "$APP" "$STAGE/"
  rm "$OUT/Vahti.dmg"
  hdiutil create -quiet -volname "Vahti" -srcfolder "$STAGE" -fs HFS+ -format UDZO -imagekey zlib-level=9 "$OUT/Vahti.dmg"
  python3 packaging/dmg/restyle.py "$OUT/Vahti.dmg" "Vahti.app" packaging/dmg/welcome-vahti.png
xattr -c "$OUT/Vahti.dmg"
  codesign --force --timestamp --sign "$IDENTITY" "$OUT/Vahti.dmg"
  cp "$OUT/Vahti.dmg" "$OUT/Vahti-$VERSION.dmg"
  [ "${VAHTI_VALIDATE_RELEASE:-false}" != "true" ] || scripts/release-app.sh --validate-only
  notarize "$OUT/Vahti.dmg"
  xcrun stapler staple "$OUT/Vahti.dmg" >/dev/null
  spctl --assess --type open --context context:primary-signature -v "$OUT/Vahti.dmg" 2>&1 | tail -1
  cp "$OUT/Vahti.dmg" "$OUT/Vahti-$VERSION.dmg"
  # Stapling the DMG changes its length and signature: regenerate and check final metadata.
  [ "${VAHTI_VALIDATE_RELEASE:-false}" != "true" ] || scripts/release-app.sh --validate-only
fi
echo "$OUT/Vahti.dmg ($(du -h "$OUT/Vahti.dmg" | cut -f1), Node $NODE_VERSION)"
