#!/bin/bash
# 4Rent Management System — 1-Click macOS Desktop Installer (v1.0.1)
# Double-click this file in Finder to install 4Rent.app into Applications & Desktop with zero CLI commands.

set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_BUNDLE="$SCRIPT_DIR/4Rent.app"

clear
echo "========================================================"
echo "  4Rent Management System — macOS Desktop Installer     "
echo "  Version 1.0.1 • Apple Silicon & Intel Universal       "
echo "========================================================"
echo ""

TARGET_APPS="/Applications"
if [ ! -w "/Applications" ]; then
  TARGET_APPS="$HOME/Applications"
  mkdir -p "$TARGET_APPS"
fi

if [ -d "$APP_BUNDLE" ]; then
  echo "-> Installing 4Rent.app to $TARGET_APPS/4Rent.app ..."
  rm -rf "$TARGET_APPS/4Rent.app" 2>/dev/null || true
  cp -R "$APP_BUNDLE" "$TARGET_APPS/4Rent.app"
else
  echo "-> Generating 4Rent.app in $TARGET_APPS/4Rent.app ..."
  mkdir -p "$TARGET_APPS/4Rent.app/Contents/MacOS"
  mkdir -p "$TARGET_APPS/4Rent.app/Contents/Resources"
  cat << 'EOF_PLIST' > "$TARGET_APPS/4Rent.app/Contents/Info.plist"
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleExecutable</key>
  <string>4Rent</string>
  <key>CFBundleIconFile</key>
  <string>AppIcon.icns</string>
  <key>CFBundleIdentifier</key>
  <string>com.fourrent.managementsystem</string>
  <key>CFBundleName</key>
  <string>4Rent</string>
  <key>CFBundleDisplayName</key>
  <string>4Rent Management System</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleShortVersionString</key>
  <string>1.0.1</string>
  <key>CFBundleVersion</key>
  <string>1.0.1</string>
  <key>LSMinimumSystemVersion</key>
  <string>11.0</string>
  <key>NSHighResolutionCapable</key>
  <true/>
  <key>NSCameraUsageDescription</key>
  <string>4Rent uses the camera to scan and verify electric sub-meter kWh readings.</string>
</dict>
</plist>
EOF_PLIST
  cat << 'EOF_BIN' > "$TARGET_APPS/4Rent.app/Contents/MacOS/4Rent"
#!/bin/bash
# 4Rent Management System — Official macOS Desktop Application Bundle Launcher (v1.0.1)
# Zero Node.js or CLI required. Runs natively on Apple Silicon (M1-M4) and Intel Macs.

set -e
APP_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
SUPPORT_DIR="$HOME/Library/Application Support/4Rent"
PREF_FILE="$SUPPORT_DIR/property_code.txt"
PROFILE_DIR="$SUPPORT_DIR/ChromiumProfile"
mkdir -p "$SUPPORT_DIR"

DEFAULT_URL="https://splikaa.github.io/4Rent/"
SAVED_CODE=""
if [ -f "$PREF_FILE" ]; then
  SAVED_CODE="$(cat "$PREF_FILE" | tr -cd 'A-Za-z0-9_-')"
fi

# Offer 1-click installation into /Applications if launched from Downloads/DMG/ZIP folder
if [[ "$APP_DIR" != "/Applications/4Rent.app" && "$APP_DIR" != "$HOME/Applications/4Rent.app" ]]; then
  CHOICE="$(osascript -e 'display dialog "Welcome to 4Rent Management System (v1.0.1) for macOS.\n\n• Dedicated Standalone Desktop Window\n• Live Sub-Meter OCR & Official A4/Thermal Receipts\n• Real-Time Mobile & Desktop Cloud Sync\n\nWould you like to install 4Rent into your Applications folder or launch immediately?" buttons {"Cancel", "Launch Now", "Install to Applications & Launch"} default button "Install to Applications & Launch" with title "4Rent Management System — macOS Desktop"' 2>/dev/null || echo "")"
  if [[ "$CHOICE" == *"Cancel"* || -z "$CHOICE" ]]; then
    exit 0
  fi
  if [[ "$CHOICE" == *"Install to Applications & Launch"* ]]; then
    TARGET_APPS="/Applications"
    if [ ! -w "/Applications" ]; then
      TARGET_APPS="$HOME/Applications"
      mkdir -p "$TARGET_APPS"
    fi
    rm -rf "$TARGET_APPS/4Rent.app" 2>/dev/null || true
    cp -R "$APP_DIR" "$TARGET_APPS/4Rent.app"
    xattr -cr "$TARGET_APPS/4Rent.app" 2>/dev/null || true
    chmod +x "$TARGET_APPS/4Rent.app/Contents/MacOS/4Rent" 2>/dev/null || true
    ln -sf "$TARGET_APPS/4Rent.app" "$HOME/Desktop/4Rent.app" 2>/dev/null || true
    osascript -e 'display notification "4Rent.app is now installed in Applications & Desktop!" with title "4Rent Management System"' 2>/dev/null || true
    APP_DIR="$TARGET_APPS/4Rent.app"
  fi
fi

TARGET_URL="${DEFAULT_URL}?desktop=1&app=desktop"
if [ -n "$SAVED_CODE" ]; then
  TARGET_URL="${TARGET_URL}&prop=${SAVED_CODE}"
fi

# Launch in dedicated borderless macOS Desktop App window if Chromium/Chrome/Edge/Brave is available
for BROWSER_BIN in \
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge" \
  "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser" \
  "/Applications/Chromium.app/Contents/MacOS/Chromium"; do
  if [ -x "$BROWSER_BIN" ]; then
    nohup "$BROWSER_BIN" \
      --app="$TARGET_URL" \
      --user-data-dir="$PROFILE_DIR" \
      --window-size=1440,920 \
      --no-first-run \
      --no-default-browser-check \
      >/dev/null 2>&1 &
    exit 0
  fi
done

# Fallback to default macOS Safari / system browser window
open "$TARGET_URL"
EOF_BIN
fi

xattr -cr "$TARGET_APPS/4Rent.app" 2>/dev/null || true
chmod +x "$TARGET_APPS/4Rent.app/Contents/MacOS/4Rent" 2>/dev/null || true
ln -sf "$TARGET_APPS/4Rent.app" "$HOME/Desktop/4Rent.app" 2>/dev/null || true

echo "-> Installed 4Rent.app to $TARGET_APPS and created Desktop shortcut!"
echo "-> Launching 4Rent Management System..."
osascript -e 'display notification "4Rent Desktop App installed to Applications & Desktop!" with title "4Rent Management System"' 2>/dev/null || true
open "$TARGET_APPS/4Rent.app"
exit 0
