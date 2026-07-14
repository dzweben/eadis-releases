#!/bin/bash
# E-ADIS C/P — macOS installer
# Usage:  curl -fsSL https://dzweben.github.io/eadis-releases/install.sh | bash
# Downloads the right build for this Mac, installs to /Applications,
# clears quarantine, and launches the app.
set -euo pipefail

APP_NAME="E-ADIS C-P"
BASE="https://github.com/dzweben/eadis-releases/releases/download/v1.0.0"

if [ "$(uname -s)" != "Darwin" ]; then
  echo "This installer is for macOS. On Windows, download the .exe installer from the site."
  exit 1
fi

ARCH="$(uname -m)"
if [ "$ARCH" = "arm64" ]; then
  DMG_URL="$BASE/E-ADIS-C-P-1.0.0-arm64.dmg"
  echo "→ Detected Apple Silicon Mac"
else
  DMG_URL="$BASE/E-ADIS-C-P-1.0.0-x64.dmg"
  echo "→ Detected Intel Mac"
fi

TMP_DMG="$(mktemp -d)/eadis.dmg"
echo "→ Downloading E-ADIS C/P… (~130 MB)"
curl -fL --progress-bar "$DMG_URL" -o "$TMP_DMG"

echo "→ Mounting disk image…"
MOUNT_DIR="$(hdiutil attach -nobrowse -readonly "$TMP_DMG" | grep -o '/Volumes/.*' | head -1)"
if [ -z "$MOUNT_DIR" ]; then
  echo "✗ Could not mount the disk image."
  exit 1
fi

cleanup() { hdiutil detach "$MOUNT_DIR" -quiet 2>/dev/null || true; rm -f "$TMP_DMG"; }
trap cleanup EXIT

APP_SRC="$MOUNT_DIR/$APP_NAME.app"
if [ ! -d "$APP_SRC" ]; then
  echo "✗ App not found inside the disk image."
  exit 1
fi

echo "→ Installing to /Applications…"
# Quit a running copy so the bundle isn't busy during replace
osascript -e "tell application \"$APP_NAME\" to quit" 2>/dev/null || true
sleep 1
rm -rf "/Applications/$APP_NAME.app"
ditto "$APP_SRC" "/Applications/$APP_NAME.app"

echo "→ Clearing quarantine…"
xattr -dr com.apple.quarantine "/Applications/$APP_NAME.app" 2>/dev/null || true

echo "→ Launching…"
open "/Applications/$APP_NAME.app"

echo ""
echo "✓ E-ADIS C/P installed successfully. You can find it in Applications."
