#!/bin/bash
# Fetches Sparkle, the updater framework Vahti ships with (app/Updater.swift), once into the build cache, checks it, and
# prints the folder holding Sparkle.framework and bin/ (sign_update, generate_keys).
set -euo pipefail
VERSION=2.10.1
# The release asset's API id, for when the releases/download CDN 504s; find it on
# api.github.com/repos/sparkle-project/Sparkle/releases/tags/$VERSION when bumping VERSION.
ASSET_ID=673946481
SUM=1a856d2a9edb8e628de88121d7be04cf0e2167f8641650b78fca00b14244cf27
CACHE="$HOME/Library/Caches/vahti-build"
DIR="$CACHE/Sparkle-$VERSION"
if [[ ! -d "$DIR/Sparkle.framework" ]]; then
  mkdir -p "$CACHE"
  TARBALL="$CACHE/Sparkle-$VERSION.tar.xz"
  if [[ ! -f "$TARBALL" ]]; then
    # The canonical download first; on a CDN outage (504s), the API asset route.
    curl -fsSL --retry 3 --retry-all-errors --retry-delay 10 "https://github.com/sparkle-project/Sparkle/releases/download/$VERSION/Sparkle-$VERSION.tar.xz" -o "$TARBALL" \
      || curl -fsSL --retry 10 --retry-all-errors --retry-delay 60 --retry-max-time 900 -H 'Accept: application/octet-stream' "https://api.github.com/repos/sparkle-project/Sparkle/releases/assets/$ASSET_ID" -o "$TARBALL"
  fi
  echo "$SUM  $TARBALL" | shasum -a 256 -c - >/dev/null || { rm -f "$TARBALL"; echo "sparkle: download failed its checksum" >&2; exit 1; }
  mkdir -p "$DIR"
  tar -xJf "$TARBALL" -C "$DIR"
fi
echo "$DIR"
