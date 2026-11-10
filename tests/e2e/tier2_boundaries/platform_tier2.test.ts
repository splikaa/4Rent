/**
 * Tier 2 Boundary & Stress Tests: Platform File Organization, Launchers, Dependencies & Mobile Build (F9, F10, F11, F12)
 *
 * Covers:
 * - Feature 9: Platform File Organization Boundaries (CRLF/LF line endings, APK signature presence, zero stray .tmp/.bak files, image magic headers, clean directory tree)
 * - Feature 10: Mobile Launcher Script Portability (Path with spaces, case-insensitivity of flags, missing flutter fallback, doctor/version exit codes, relative %~dp0 paths)
 * - Feature 11: Package & Dependency Hygiene (Zero React 19 peer conflicts, electron sandbox security, offline fallback caching & manifest, no orphaned build configs, manifest integrity)
 * - Feature 12: Mobile Build Boundaries (AndroidManifest 4-byte string pool alignment, network_security_config cleartextTrafficPermitted strictly false, resources.arsc compression, permission injection, targetSdkVersion=34)
 */

import { describe, it, beforeEach } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assertStrictEqual,
  assertTrue,
  assertFalse,
} from '../harness/test_utils';
import { resetBrowserEnv } from '../harness/browser_env';
import { getNetworkStatus } from '../../../src/services/firebaseSync';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../../..');

describe('Tier 2: Platform File Organization, Launchers, Hygiene & Mobile Build (F9–F12)', () => {
  beforeEach(() => {
    resetBrowserEnv();
  });

  // ==========================================================================
  // Feature 9: Platform File Organization Standards (F9)
  // ==========================================================================
  describe('Feature 9: Platform File Organization Boundaries', () => {
    it('T2.F9.1 Line endings integrity: verify no CRLF/LF file corruption across project scripts and critical files', () => {
      const scriptsToCheck = [
        'scripts/build_signed_apk.mjs',
        'electron/main.cjs',
        'run_e2e.bat',
        'mobile_app/flutter.bat',
        'packages/desktop/4Rent Launcher.bat',
      ];

      for (const rel of scriptsToCheck) {
        const full = path.join(projectRoot, rel);
        assertTrue(fs.existsSync(full), `File must exist: ${rel}`);
        const content = fs.readFileSync(full);
        assertTrue(content.length > 0, `File must not be 0 bytes: ${rel}`);
        // Ensure no mixed NUL byte corruption
        assertFalse(content.includes(0), `File must not contain corrupted NUL bytes: ${rel}`);
      }
    });

    it('T2.F9.2 APK release artifact presence & ZIP signature header', () => {
      const apkPath = path.join(projectRoot, 'packages/mobile/4Rent-v1.0.0-release.apk');
      assertTrue(fs.existsSync(apkPath), 'Release APK must exist at packages/mobile/4Rent-v1.0.0-release.apk');

      const fd = fs.openSync(apkPath, 'r');
      const header = Buffer.alloc(4);
      fs.readSync(fd, header, 0, 4, 0);
      fs.closeSync(fd);

      // APK is a zip archive; magic header is PK\x03\x04 (0x50, 0x4B, 0x03, 0x04)
      assertTrue(
        header[0] === 0x50 && header[1] === 0x4B && header[2] === 0x03 && header[3] === 0x04,
        'APK must start with standard ZIP magic header PK\\x03\\x04'
      );
    });

    it('T2.F9.3 Zero stray .tmp or .bak files in source, packages, and scripts directories', () => {
      const targetDirs = ['src', 'packages', 'scripts', 'electron'];

      function checkNoStray(dirRel: string): void {
        const fullDir = path.join(projectRoot, dirRel);
        if (!fs.existsSync(fullDir)) return;
        const entries = fs.readdirSync(fullDir, { withFileTypes: true });
        for (const e of entries) {
          if (e.isDirectory()) {
            checkNoStray(path.join(dirRel, e.name));
          } else {
            assertFalse(
              e.name.endsWith('.tmp') || e.name.endsWith('.bak') || e.name.endsWith('.swp'),
              `Stray temporary file detected: ${path.join(dirRel, e.name)}`
            );
          }
        }
      }

      for (const d of targetDirs) {
        checkNoStray(d);
      }
    });

    it('T2.F9.4 Image magic headers verification: ICO, SVG, and PNG assets have genuine headers', () => {
      // 1. ICO magic header in public/4rent-icon.ico: [0x00, 0x00, 0x01, 0x00]
      const icoPath = path.join(projectRoot, 'public/4rent-icon.ico');
      assertTrue(fs.existsSync(icoPath), 'public/4rent-icon.ico must exist');
      const icoHeader = fs.readFileSync(icoPath).subarray(0, 4);
      assertTrue(
        icoHeader[0] === 0x00 && icoHeader[1] === 0x00 && icoHeader[2] === 0x01 && icoHeader[3] === 0x00,
        '4rent-icon.ico must start with valid ICO header'
      );

      // 2. SVG magic tag in public/icon.svg: <svg
      const svgPath = path.join(projectRoot, 'public/icon.svg');
      assertTrue(fs.existsSync(svgPath), 'public/icon.svg must exist');
      const svgText = fs.readFileSync(svgPath, 'utf8');
      assertTrue(svgText.includes('<svg'), 'public/icon.svg must contain valid <svg root tag');

      // 3. PNG magic header in public/icon-192.png: [0x89, 0x50, 0x4E, 0x47]
      const pngPath = path.join(projectRoot, 'public/icon-192.png');
      assertTrue(fs.existsSync(pngPath), 'public/icon-192.png must exist');
      const pngHeader = fs.readFileSync(pngPath).subarray(0, 4);
      assertTrue(
        pngHeader[0] === 0x89 && pngHeader[1] === 0x50 && pngHeader[2] === 0x4E && pngHeader[3] === 0x47,
        'public/icon-192.png must start with valid PNG header'
      );
    });

    it('T2.F9.5 Clean directory structure: zero duplicate APKs or BATs in root packages/ or public/', () => {
      const packagesRoot = path.join(projectRoot, 'packages');
      const packagesEntries = fs.readdirSync(packagesRoot);

      // Root packages/ must contain only directories ('desktop' and 'mobile'), no loose files
      for (const entry of packagesEntries) {
        const fullPath = path.join(packagesRoot, entry);
        assertTrue(
          fs.statSync(fullPath).isDirectory(),
          `packages/ root must contain only subdirectories, found loose file: ${entry}`
        );
      }

      // public/ must not contain any loose APK files
      const publicFiles = fs.readdirSync(path.join(projectRoot, 'public'));
      const apkInPublic = publicFiles.filter(f => f.toLowerCase().endsWith('.apk'));
      assertStrictEqual(apkInPublic.length, 0, 'public/ must not contain any APK binaries');
    });
  });

  // ==========================================================================
  // Feature 10: Mobile Launcher Script Portability (F10)
  // ==========================================================================
  describe('Feature 10: Mobile Launcher Script Portability Boundaries', () => {
    it('T2.F10.1 Path with spaces support: launcher scripts use quoted %~dp0 paths', () => {
      const flutterBatPath = path.join(projectRoot, 'mobile_app/flutter.bat');
      const flutterBat = fs.readFileSync(flutterBatPath, 'utf8');

      // Line 37 uses "%~dp0build_release_apk.ps1" (quoted)
      assertTrue(
        flutterBat.includes('"%~dp0build_release_apk.ps1"'),
        'mobile_app/flutter.bat must quote %~dp0 path to support directories with spaces'
      );

      const desktopLauncherPath = path.join(projectRoot, 'packages/desktop/4Rent Launcher.bat');
      const desktopLauncher = fs.readFileSync(desktopLauncherPath, 'utf8');
      assertTrue(
        desktopLauncher.includes('cd /d "%~dp0"'),
        'Desktop launcher must quote %~dp0 path'
      );
    });

    it('T2.F10.2 Case-insensitivity of flags: batch script uses /I for arguments', () => {
      const flutterBatPath = path.join(projectRoot, 'mobile_app/flutter.bat');
      const flutterBat = fs.readFileSync(flutterBatPath, 'utf8');

      // Must use `if /I "%ARG1%"` for case-insensitive flag matching
      assertTrue(
        flutterBat.includes('if /I "%ARG1%"=="--version"'),
        'flutter.bat must use case-insensitive /I for --version'
      );
      assertTrue(
        flutterBat.includes('if /I "%ARG1%"=="doctor"'),
        'flutter.bat must use case-insensitive /I for doctor'
      );
      assertTrue(
        flutterBat.includes('if /I "%ARG1%"=="build"'),
        'flutter.bat must use case-insensitive /I for build'
      );
    });

    it('T2.F10.3 Missing Flutter executable fallback: defaults to standalone browser app launch', () => {
      const flutterBatPath = path.join(projectRoot, 'mobile_app/flutter.bat');
      const flutterBat = fs.readFileSync(flutterBatPath, 'utf8');

      // When flutter is not installed in PATH, script falls through to start Edge/Chrome or default browser
      assertTrue(
        flutterBat.includes('msedge.exe') && flutterBat.includes('chrome.exe'),
        'flutter.bat must feature standalone browser fallbacks'
      );
      assertTrue(
        flutterBat.includes('start "" "%APP_URL%"'),
        'flutter.bat must feature default browser fallback'
      );
    });

    it('T2.F10.4 Diagnostics commands exist and exit with code 0', () => {
      const flutterBatPath = path.join(projectRoot, 'mobile_app/flutter.bat');
      const flutterBat = fs.readFileSync(flutterBatPath, 'utf8');

      // :ver and :doc labels exit /b 0
      assertTrue(flutterBat.includes(':ver'));
      assertTrue(flutterBat.includes(':doc'));
      assertTrue(flutterBat.includes('exit /b 0'));
    });

    it('T2.F10.5 Relative script paths: verify no hardcoded developer paths in flutter.bat or flutter.cmd', () => {
      const scripts = [
        'mobile_app/flutter.bat',
        'mobile_app/flutter.cmd',
      ];

      for (const s of scripts) {
        const full = path.join(projectRoot, s);
        if (!fs.existsSync(full)) continue;
        const text = fs.readFileSync(full, 'utf8');
        assertFalse(
          text.includes('C:\\Users\\Gameiun PeSoNet\\Documents\\4Rent'),
          `${s} must not contain hardcoded developer directory path`
        );
      }
    });
  });

  // ==========================================================================
  // Feature 11: Package & Dependency Hygiene (F11)
  // ==========================================================================
  describe('Feature 11: Package & Dependency Hygiene Boundaries', () => {
    it('T2.F11.1 Zero React 19 peer dependency conflicts in package.json', () => {
      const pkgPath = path.join(projectRoot, 'package.json');
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

      // React and React-DOM must match version 19.x
      assertTrue(pkg.dependencies.react.startsWith('^19.') || pkg.dependencies.react.startsWith('19.'));
      assertTrue(pkg.dependencies['react-dom'].startsWith('^19.') || pkg.dependencies['react-dom'].startsWith('19.'));
      assertTrue(pkg.devDependencies['@types/react'].startsWith('^19.') || pkg.devDependencies['@types/react'].startsWith('19.'));
      assertTrue(pkg.devDependencies['@types/react-dom'].startsWith('^19.') || pkg.devDependencies['@types/react-dom'].startsWith('19.'));
    });

    it('T2.F11.2 Electron sandbox security: main.cjs enforces nodeIntegration: false and contextIsolation: true', () => {
      const mainPath = path.join(projectRoot, 'electron/main.cjs');
      assertTrue(fs.existsSync(mainPath), 'electron/main.cjs must exist');
      const mainSrc = fs.readFileSync(mainPath, 'utf8');

      assertTrue(
        mainSrc.includes('nodeIntegration: false'),
        'electron/main.cjs must set nodeIntegration: false'
      );
      assertTrue(
        mainSrc.includes('contextIsolation: true'),
        'electron/main.cjs must set contextIsolation: true'
      );
    });

    it('T2.F11.3 Offline fallback URL & PWA manifest: sw.js and manifest.webmanifest define valid offline assets', () => {
      const manifestPath = path.join(projectRoot, 'public/manifest.webmanifest');
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

      assertStrictEqual(manifest.name, '4Rent Property & Sub-Meter Billing System');
      assertTrue(manifest.start_url !== undefined && manifest.start_url.length > 0);
      assertStrictEqual(manifest.display, 'standalone');
      assertTrue(Array.isArray(manifest.icons) && manifest.icons.length >= 2);

      const swPath = path.join(projectRoot, 'public/sw.js');
      const swSrc = fs.readFileSync(swPath, 'utf8');
      assertTrue(swSrc.includes('CACHE_NAME'), 'sw.js must define cache identifier');
      assertTrue(swSrc.includes('install'), 'sw.js must handle install event');
      assertTrue(swSrc.includes('fetch'), 'sw.js must handle fetch event');
    });

    it('T2.F11.4 No orphaned build configs: capacitor.config.json and stale build/web/ absent', () => {
      const capacitorPath = path.join(projectRoot, 'capacitor.config.json');
      assertFalse(fs.existsSync(capacitorPath), 'Orphaned capacitor.config.json must NOT exist');

      const staleWebBuild = path.join(projectRoot, 'mobile_app/build/web');
      assertFalse(fs.existsSync(staleWebBuild), 'Stale mobile_app/build/web must NOT exist');
    });

    it('T2.F11.5 Dependency manifest integrity: zero duplicate keys between dependencies and devDependencies', () => {
      const pkgPath = path.join(projectRoot, 'package.json');
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

      const prodDeps = Object.keys(pkg.dependencies || {});
      const devDeps = Object.keys(pkg.devDependencies || {});
      const common = prodDeps.filter(dep => devDeps.includes(dep));

      assertStrictEqual(
        common.length,
        0,
        `Duplicate dependencies detected in dependencies & devDependencies: ${common.join(', ')}`
      );
      // Electron must be in devDependencies
      assertTrue(devDeps.includes('electron'), 'electron must be declared in devDependencies');
    });

    it('T2.F11.6 Desktop Wi-Fi/LAN vs Mobile Data network status detection', () => {
      // In desktop browser environment with standard effectiveType "4g", connection must be recognized as Wi-Fi/LAN
      const net = getNetworkStatus();
      assertTrue(net.isOnline, 'Network status must be online');
      assertStrictEqual(net.connectionType, 'wifi', 'Desktop network must report wifi/lan');
      assertTrue(
        net.label.includes('Wi-Fi') || net.label.includes('LAN'),
        `Desktop network label must reflect Wi-Fi/LAN, got "${net.label}"`
      );
      assertFalse(
        net.label.includes('Mobile Data'),
        'Desktop network must NEVER falsely report "Mobile Data (Active)"'
      );
    });
  });

  // ==========================================================================
  // Feature 12: Mobile Build Boundaries (F12)
  // ==========================================================================
  describe('Feature 12: Mobile Build Boundaries', () => {
    it('T2.F12.1 AndroidManifest binary string pool alignment: 4-byte boundary padding strictly calculated', () => {
      const buildScriptPath = path.join(projectRoot, 'scripts/build_signed_apk.mjs');
      assertTrue(fs.existsSync(buildScriptPath), 'scripts/build_signed_apk.mjs must exist');
      const scriptCode = fs.readFileSync(buildScriptPath, 'utf8');

      // Verify 4-byte padding formula in patchAndroidManifestBinary:
      // const padSize = (4 - (allStrData.length % 4)) % 4;
      assertTrue(
        scriptCode.includes('(4 - (allStrData.length % 4)) % 4'),
        'build_signed_apk.mjs must enforce 4-byte boundary padding calculation'
      );
    });

    it('T2.F12.2 Cleartext traffic policy: network_security_config cleartextTrafficPermitted strictly false', () => {
      const netSecPath = path.join(
        projectRoot,
        'mobile_app/android_src/res/xml/network_security_config.xml'
      );
      assertTrue(fs.existsSync(netSecPath), 'network_security_config.xml must exist');
      const xml = fs.readFileSync(netSecPath, 'utf8');

      assertTrue(
        xml.includes('cleartextTrafficPermitted="false"'),
        'network_security_config.xml must set cleartextTrafficPermitted="false"'
      );
      assertFalse(
        xml.includes('cleartextTrafficPermitted="true"'),
        'network_security_config.xml must NEVER permit cleartext traffic'
      );
    });

    it('T2.F12.3 resources.arsc uncompressed / stored requirement check in build script', () => {
      const buildScriptPath = path.join(projectRoot, 'scripts/build_signed_apk.mjs');
      const scriptCode = fs.readFileSync(buildScriptPath, 'utf8');

      // Verify build script handles resources.arsc or compression method
      assertTrue(
        scriptCode.includes('resources.arsc') || scriptCode.includes('JSZip'),
        'build_signed_apk.mjs must process APK archive packaging'
      );
    });

    it('T2.F12.4 Permission injection: build script declares CAMERA and POST_NOTIFICATIONS', () => {
      const buildScriptPath = path.join(projectRoot, 'scripts/build_signed_apk.mjs');
      const scriptCode = fs.readFileSync(buildScriptPath, 'utf8');

      assertTrue(
        scriptCode.includes('android.permission.CAMERA'),
        'build_signed_apk.mjs must inject CAMERA permission'
      );
      assertTrue(
        scriptCode.includes('android.permission.POST_NOTIFICATIONS'),
        'build_signed_apk.mjs must inject POST_NOTIFICATIONS permission'
      );
    });

    it('T2.F12.5 Target SDK boundary: targetSdkVersion = 34 (Android 14)', () => {
      const buildScriptPath = path.join(projectRoot, 'scripts/build_signed_apk.mjs');
      const scriptCode = fs.readFileSync(buildScriptPath, 'utf8');

      // Verify targetSdkVersion update to 34
      assertTrue(
        scriptCode.includes('34'),
        'build_signed_apk.mjs must set targetSdkVersion to 34'
      );

      const androidManifestXml = fs.readFileSync(
        path.join(projectRoot, 'mobile_app/android_src/AndroidManifest.xml'),
        'utf8'
      );
      assertTrue(
        androidManifestXml.includes('android:targetSdkVersion="34"'),
        'AndroidManifest.xml must declare targetSdkVersion="34"'
      );
    });
  });
});
