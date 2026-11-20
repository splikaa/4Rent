import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, join, relative, dirname } from 'node:path';
import JSZip from 'jszip';

const rootDir = resolve('.');
const distDir = join(rootDir, 'dist');
const publicDir = join(rootDir, 'public');
const icnsPath = join(rootDir, 'build', 'icon.icns');

if (!existsSync(icnsPath)) {
  throw new Error(`[4Rent macOS Packager] Icon not found at: ${icnsPath}`);
}

const infoPlist = `<?xml version="1.0" encoding="UTF-8"?>
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
`;

const macLauncherBinaryScript = `#!/bin/bash
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
  CHOICE="$(osascript -e 'display dialog "Welcome to 4Rent Management System (v1.0.1) for macOS.\\n\\n• Dedicated Standalone Desktop Window\\n• Live Sub-Meter OCR & Official A4/Thermal Receipts\\n• Real-Time Mobile & Desktop Cloud Sync\\n\\nWould you like to install 4Rent into your Applications folder or launch immediately?" buttons {"Cancel", "Launch Now", "Install to Applications & Launch"} default button "Install to Applications & Launch" with title "4Rent Management System — macOS Desktop"' 2>/dev/null || echo "")"
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

TARGET_URL="\${DEFAULT_URL}?desktop=1&app=desktop"
if [ -n "$SAVED_CODE" ]; then
  TARGET_URL="\${TARGET_URL}&prop=\${SAVED_CODE}"
fi

# Launch in dedicated borderless macOS Desktop App window if Chromium/Chrome/Edge/Brave is available
for BROWSER_BIN in \\
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \\
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge" \\
  "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser" \\
  "/Applications/Chromium.app/Contents/MacOS/Chromium"; do
  if [ -x "$BROWSER_BIN" ]; then
    nohup "$BROWSER_BIN" \\
      --app="$TARGET_URL" \\
      --user-data-dir="$PROFILE_DIR" \\
      --window-size=1440,920 \\
      --no-first-run \\
      --no-default-browser-check \\
      >/dev/null 2>&1 &
    exit 0
  fi
done

# Fallback to default macOS Safari / system browser window
open "$TARGET_URL"
`;

const oneClickCommandInstaller = `#!/bin/bash
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
${infoPlist.trim()}
EOF_PLIST
  cat << 'EOF_BIN' > "$TARGET_APPS/4Rent.app/Contents/MacOS/4Rent"
${macLauncherBinaryScript.trim()}
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
`;

const macInstructionsTxt = `======================================================================
4Rent Management System — Official macOS Desktop App (v1.0.1)
Universal Apple Silicon (M1 / M2 / M3 / M4) & Intel Mac
Zero Node.js • Zero Terminal Commands • Zero Configuration Required
======================================================================

HOW TO INSTALL & RUN ON macOS (2 EASY OPTIONS):

OPTION A — Drag & Drop (Standard macOS Style):
  1. Unzip "4Rent-Desktop-macOS.zip" (Safari unzips automatically).
  2. Drag "4Rent.app" into your "Applications" folder (or double-click "4Rent.app" directly).
  3. Open "4Rent" from Applications, Launchpad, Dock, or Spotlight!
     (Note: If macOS Gatekeeper asks on first open, right-click "4Rent.app" -> click "Open").

OPTION B — 1-Click Automatic Installer:
  1. Double-click "Install 4Rent to Applications.command".
  2. It automatically clears macOS quarantine flags, installs "4Rent.app" into /Applications,
     adds a Desktop shortcut, and launches 4Rent in a dedicated Desktop window!
`;

const zip = new JSZip();
const appRoot = zip.folder('4Rent.app');
const contents = appRoot.folder('Contents');
contents.file('Info.plist', infoPlist, { unixPermissions: '644' });
contents.file('PkgInfo', 'APPL4RNT', { unixPermissions: '644' });

const macosFolder = contents.folder('MacOS');
macosFolder.file('4Rent', macLauncherBinaryScript, { unixPermissions: '755' });

const resourcesFolder = contents.folder('Resources');
resourcesFolder.file('AppIcon.icns', readFileSync(icnsPath), { unixPermissions: '644' });

zip.file('Install 4Rent to Applications.command', oneClickCommandInstaller, {
  unixPermissions: '755',
});
zip.file('INSTRUCTIONS-macOS.txt', macInstructionsTxt, {
  unixPermissions: '644',
});

const zipBuffer = await zip.generateAsync({
  type: 'nodebuffer',
  platform: 'UNIX',
  compression: 'DEFLATE',
  compressionOptions: { level: 9 },
});

const zipTargets = [
  join(rootDir, '4Rent-Desktop-macOS.zip'),
  join(rootDir, 'packages', 'desktop', '4Rent-Desktop-macOS.zip'),
  join(publicDir, '4Rent-Desktop-macOS.zip'),
  join(publicDir, 'packages', 'desktop', '4Rent-Desktop-macOS.zip'),
  ...(existsSync(distDir)
    ? [
        join(distDir, '4Rent-Desktop-macOS.zip'),
        join(distDir, 'packages', 'desktop', '4Rent-Desktop-macOS.zip'),
      ]
    : []),
];

for (const target of zipTargets) {
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, zipBuffer);
  console.log('[4Rent macOS Packager] Wrote:', relative(rootDir, target), `(${zipBuffer.length} bytes)`);
}

const cmdTargets = [
  join(rootDir, 'packages', 'desktop', 'Install-4Rent-macOS.command'),
  join(publicDir, 'Install-4Rent-macOS.command'),
  ...(existsSync(distDir) ? [join(distDir, 'Install-4Rent-macOS.command')] : []),
];

for (const target of cmdTargets) {
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, oneClickCommandInstaller, { mode: 0o755 });
  console.log('[4Rent macOS Packager] Wrote:', relative(rootDir, target));
}
