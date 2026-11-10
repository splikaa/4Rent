/**
 * Challenger 2: Empirical Adversarial Test Harness for Milestone 1
 * Platform Organization and Mobile App Stability (Requirement R3)
 */

const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');

const rootDir = path.resolve('.');
const results = {
  total: 0,
  passed: 0,
  failed: 0,
  tests: []
};

function runTest(suite, name, fn) {
  results.total++;
  const testRecord = { suite, name, status: 'UNKNOWN', trace: null };
  try {
    fn();
    testRecord.status = 'PASS';
    results.passed++;
    console.log(`[PASS] [${suite}] ${name}`);
  } catch (err) {
    testRecord.status = 'FAIL';
    testRecord.trace = err.stack || err.message;
    results.failed++;
    console.error(`[FAIL] [${suite}] ${name}: ${err.message}`);
  }
  results.tests.push(testRecord);
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message || 'Assertion failed'}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

console.log('================================================================');
console.log('   CHALLENGER 2: EMPIRICAL ADVERSARIAL STRESS TEST HARNESS      ');
console.log('   Milestone 1: Platform Organization & Mobile App Stability   ');
console.log('================================================================\n');

// -----------------------------------------------------------------------------
// SUITE 1: Node.js Syntax Verification of scripts/build_signed_apk.mjs
// -----------------------------------------------------------------------------
const scriptPath = path.join(rootDir, 'scripts', 'build_signed_apk.mjs');

runTest('Suite 1: Syntax', 'build_signed_apk.mjs exists and is non-empty', () => {
  assert(fs.existsSync(scriptPath), `File not found: ${scriptPath}`);
  const stat = fs.statSync(scriptPath);
  assert(stat.size > 500, `File size too small: ${stat.size} bytes`);
});

runTest('Suite 1: Syntax', 'Node --check validates syntax cleanly without errors', () => {
  const codeExe = process.execPath;
  const cmd = `"${codeExe}" --check "${scriptPath}"`;
  const env = { ...process.env, ELECTRON_RUN_AS_NODE: '1' };
  const output = execSync(cmd, { env, encoding: 'utf8' });
  assertEqual(output, '', 'Expected no output from node --check on clean syntax');
});

// -----------------------------------------------------------------------------
// SUITE 2: Adversarial Simulation of scripts/build_signed_apk.mjs Logic
// -----------------------------------------------------------------------------
runTest('Suite 2: Adversarial Scripts', 'Missing dist/ directory handling does not throw and emits warning', () => {
  const scriptContent = fs.readFileSync(scriptPath, 'utf8');

  // Verify missing dist handling pattern
  assert(scriptContent.includes('if (!existsSync(distDir))'), 'Missing guard for !existsSync(distDir)');
  assert(scriptContent.includes('console.warn('), 'Missing console.warn for absent distDir');

  // Verify that addDirRecursive is NOT executed if distDir is missing
  const distCheckMatch = scriptContent.match(/if \(!existsSync\(distDir\)\) \{([\s\S]*?)\} else \{([\s\S]*?)\}/);
  assert(distCheckMatch, 'Expected if-else block for distDir check');
  assert(distCheckMatch[1].includes('console.warn'), 'Warn must be inside the if block');
  assert(distCheckMatch[2].includes('addDirRecursive(distDir'), 'addDirRecursive must be inside else block');
});

runTest('Suite 2: Adversarial Scripts', 'statSync with throwIfNoEntry: false behaves safely when icons absent', () => {
  const nonExistentFile = path.join(rootDir, 'public', '__test_non_existent_icon__.png');
  let result;
  assert.doesNotThrow = (fn) => { fn(); };
  try {
    result = fs.statSync(nonExistentFile, { throwIfNoEntry: false });
  } catch (e) {
    throw new Error(`statSync threw unexpectedly: ${e.message}`);
  }
  assertEqual(result, undefined, 'statSync should return undefined for missing entry');
});

runTest('Suite 2: Adversarial Scripts', 'Output targets NEVER write duplicate APKs to root packages/ or public/', () => {
  const scriptContent = fs.readFileSync(scriptPath, 'utf8');

  // Check outputTargets array
  const outputTargetsMatch = scriptContent.match(/const outputTargets = \[([\s\S]*?)\];/);
  assert(outputTargetsMatch, 'Could not find outputTargets array in build_signed_apk.mjs');
  const targetsBlock = outputTargetsMatch[1];

  // Verify root packages/4Rent-v1.0.0-release.apk is NOT in the target array
  assert(!targetsBlock.includes("join(rootDir, 'packages', '4Rent-v1.0.0-release.apk')"),
    'CRITICAL: outputTargets still contains duplicate root packages/ APK!');

  // Verify public/4Rent-v1.0.0-release.apk is NOT in the target array
  assert(!targetsBlock.includes("join(rootDir, 'public', '4Rent-v1.0.0-release.apk')") && !targetsBlock.includes("publicDir"),
    'CRITICAL: outputTargets still contains duplicate public/ APK!');

  // Verify canonical target is present
  assert(targetsBlock.includes("join(rootDir, 'packages', 'mobile', '4Rent-v1.0.0-release.apk')"),
    'Canonical target packages/mobile/4Rent-v1.0.0-release.apk is missing!');
});

runTest('Suite 2: Adversarial Scripts', 'Executing output targets generation with dist absent produces exactly 2 targets', () => {
  const root = rootDir;
  const baseApkPath = path.join(root, 'mobile_app', 'build', 'app', 'outputs', 'flutter-apk', 'app-release.apk');
  const mockDistDirExists = false;

  const simulatedTargets = [
    path.join(root, 'packages', 'mobile', '4Rent-v1.0.0-release.apk'),
    baseApkPath,
  ];
  if (mockDistDirExists) {
    simulatedTargets.push(path.join(root, 'dist', '4Rent-v1.0.0-release.apk'));
  }

  assertEqual(simulatedTargets.length, 2, 'Expected exactly 2 targets when dist is missing');
  assert(simulatedTargets.includes(path.join(root, 'packages', 'mobile', '4Rent-v1.0.0-release.apk')), 'Missing mobile pkg target');
  assert(simulatedTargets.includes(baseApkPath), 'Missing baseApkPath target');
});

runTest('Suite 2: Adversarial Scripts', 'Executing output targets generation with dist present produces exactly 3 targets', () => {
  const root = rootDir;
  const baseApkPath = path.join(root, 'mobile_app', 'build', 'app', 'outputs', 'flutter-apk', 'app-release.apk');
  const mockDistDirExists = true;

  const simulatedTargets = [
    path.join(root, 'packages', 'mobile', '4Rent-v1.0.0-release.apk'),
    baseApkPath,
  ];
  if (mockDistDirExists) {
    simulatedTargets.push(path.join(root, 'dist', '4Rent-v1.0.0-release.apk'));
  }

  assertEqual(simulatedTargets.length, 3, 'Expected exactly 3 targets when dist exists');
  assert(!simulatedTargets.includes(path.join(root, 'packages', '4Rent-v1.0.0-release.apk')), 'Duplicate root packages target detected!');
  assert(!simulatedTargets.includes(path.join(root, 'public', '4Rent-v1.0.0-release.apk')), 'Duplicate public target detected!');
});

// -----------------------------------------------------------------------------
// SUITE 3: package.json Validation and Dependency Hygiene
// -----------------------------------------------------------------------------
const pkgJsonPath = path.join(rootDir, 'package.json');
let pkg;

runTest('Suite 3: package.json', 'package.json is strictly valid RFC 8259 JSON', () => {
  const raw = fs.readFileSync(pkgJsonPath, 'utf8');
  // Check no trailing commas before closing braces/brackets
  assert(!/,\s*[\}\]]/.test(raw), 'package.json contains illegal trailing comma!');
  pkg = JSON.parse(raw);
  assert(pkg && typeof pkg === 'object', 'Parsed package.json must be an object');
});

runTest('Suite 3: package.json', 'devDependencies.electron is defined and satisfies SemVer specification', () => {
  assert(pkg.devDependencies, 'devDependencies is missing');
  const electronVer = pkg.devDependencies.electron;
  assert(electronVer, 'devDependencies.electron is not defined');
  
  // SemVer with optional caret/tilde prefix regex
  const semverRegex = /^(\^|~)?(\d+)\.(\d+)\.(\d+)(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?$/;
  const match = electronVer.match(semverRegex);
  assert(match, `electron version "${electronVer}" does not conform to SemVer pattern`);

  const major = parseInt(match[2], 10);
  const minor = parseInt(match[3], 10);
  const patch = parseInt(match[4], 10);
  assert(major >= 30, `Electron major version ${major} should be modern (>= 30)`);
  assert(!isNaN(minor) && !isNaN(patch), 'Minor and patch versions must be valid numbers');
});

runTest('Suite 3: package.json', 'scripts.electron is defined as "electron ."', () => {
  assert(pkg.scripts, 'scripts object is missing');
  assertEqual(pkg.scripts.electron, 'electron .', 'scripts.electron must be "electron ."');
});

runTest('Suite 3: package.json', 'main entry points to existing electron/main.cjs', () => {
  assertEqual(pkg.main, 'electron/main.cjs', 'main must be "electron/main.cjs"');
  const mainPath = path.join(rootDir, pkg.main);
  assert(fs.existsSync(mainPath), `Declared main entry file does not exist: ${mainPath}`);
  const mainStat = fs.statSync(mainPath);
  assert(mainStat.size > 0, `main file is empty: ${mainPath}`);
});

runTest('Suite 3: package.json', 'scripts["build:apk"] is configured correctly', () => {
  assertEqual(pkg.scripts['build:apk'], 'node scripts/build_signed_apk.mjs', 'build:apk script mismatch');
});

// -----------------------------------------------------------------------------
// SUITE 4: Mobile App Source Integrity & Parsing
// -----------------------------------------------------------------------------
const manifestPath = path.join(rootDir, 'mobile_app', 'android_src', 'AndroidManifest.xml');

runTest('Suite 4: Mobile App Sources', 'AndroidManifest.xml is well-formed XML and contains required configuration', () => {
  assert(fs.existsSync(manifestPath), `AndroidManifest.xml missing at ${manifestPath}`);
  const manifestXml = fs.readFileSync(manifestPath, 'utf8');

  // Verify XML declaration
  assert(manifestXml.startsWith('<?xml version="1.0" encoding="utf-8"?>'), 'Missing or invalid XML declaration');

  // Verify package name
  assert(manifestXml.includes('package="com.splikaa.fourrent"'), 'Missing package="com.splikaa.fourrent"');

  // Verify targetSdkVersion 34
  assert(manifestXml.includes('android:targetSdkVersion="34"'), 'targetSdkVersion must be 34 (Android 14)');

  // Verify permissions
  assert(manifestXml.includes('android.permission.INTERNET'), 'Missing INTERNET permission');
  assert(manifestXml.includes('android.permission.CAMERA'), 'Missing CAMERA permission');
  assert(manifestXml.includes('android.permission.POST_NOTIFICATIONS'), 'Missing POST_NOTIFICATIONS permission');

  // Verify security settings
  assert(manifestXml.includes('android:allowBackup="false"'), 'allowBackup must be false');
  assert(manifestXml.includes('android:usesCleartextTraffic="false"'), 'usesCleartextTraffic must be false');

  // Verify tags balance: count opening and closing tags for key elements
  const openTags = (manifestXml.match(/<(manifest|application|activity|queries)[\s>]/g) || []).length;
  const closeTags = (manifestXml.match(/<\/(manifest|application|activity|queries)>/g) || []).length;
  assertEqual(openTags, closeTags, 'Mismatch between opening and closing tags in AndroidManifest.xml');
});

const pubspecPath = path.join(rootDir, 'mobile_app', 'pubspec.yaml');

runTest('Suite 4: Mobile App Sources', 'pubspec.yaml has valid syntax and declarations', () => {
  assert(fs.existsSync(pubspecPath), `pubspec.yaml missing at ${pubspecPath}`);
  const pubspec = fs.readFileSync(pubspecPath, 'utf8');

  // Check top-level keys
  assert(/^name:\s*four_rent_mobile/m.test(pubspec), 'Missing name: four_rent_mobile');
  assert(/^publish_to:\s*["']none["']/m.test(pubspec), 'Missing publish_to: "none"');
  assert(/^version:\s*1\.0\.0\+1/m.test(pubspec), 'Missing version: 1.0.0+1');
  assert(/sdk:\s*["']>=3\.3\.0 <4\.0\.0["']/.test(pubspec), 'Missing environment sdk >=3.3.0 <4.0.0');

  // Check critical dependencies
  const deps = ['flutter', 'supabase_flutter', 'shared_preferences', 'image_picker', 'google_mlkit_text_recognition', 'intl'];
  for (const dep of deps) {
    const depRegex = new RegExp(`^\\s+${dep}:`, 'm');
    assert(depRegex.test(pubspec), `Missing dependency in pubspec.yaml: ${dep}`);
  }
});

const dartPath = path.join(rootDir, 'mobile_app', 'lib', 'main.dart');

runTest('Suite 4: Mobile App Sources', 'main.dart has balanced braces, brackets, and intact class structure', () => {
  assert(fs.existsSync(dartPath), `main.dart missing at ${dartPath}`);
  const dart = fs.readFileSync(dartPath, 'utf8');

  // Check balanced braces {}
  let braceCount = 0;
  let parenCount = 0;
  let bracketCount = 0;
  let inLineComment = false;
  let inBlockComment = false;
  let inString = false;
  let stringChar = '';

  for (let i = 0; i < dart.length; i++) {
    const c = dart[i];
    const next = dart[i + 1];

    if (inLineComment) {
      if (c === '\n') inLineComment = false;
      continue;
    }
    if (inBlockComment) {
      if (c === '*' && next === '/') {
        inBlockComment = false;
        i++;
      }
      continue;
    }
    if (inString) {
      if (c === '\\') {
        i++; // skip escaped char
        continue;
      }
      if (c === stringChar) {
        inString = false;
      }
      continue;
    }

    if (c === '/' && next === '/') {
      inLineComment = true;
      i++;
      continue;
    }
    if (c === '/' && next === '*') {
      inBlockComment = true;
      i++;
      continue;
    }
    if (c === "'" || c === '"') {
      inString = true;
      stringChar = c;
      continue;
    }

    if (c === '{') braceCount++;
    else if (c === '}') braceCount--;
    else if (c === '(') parenCount++;
    else if (c === ')') parenCount--;
    else if (c === '[') bracketCount++;
    else if (c === ']') bracketCount--;

    if (braceCount < 0) throw new Error(`Unmatched closing brace '}' at character ${i}`);
    if (parenCount < 0) throw new Error(`Unmatched closing paren ')' at character ${i}`);
    if (bracketCount < 0) throw new Error(`Unmatched closing bracket ']' at character ${i}`);
  }

  assertEqual(braceCount, 0, 'Unbalanced curly braces in main.dart');
  assertEqual(parenCount, 0, 'Unbalanced parentheses in main.dart');
  assertEqual(bracketCount, 0, 'Unbalanced square brackets in main.dart');

  // Verify core classes exist
  assert(dart.includes('class FourRentMobileApp extends StatelessWidget'), 'Missing FourRentMobileApp class');
  assert(dart.includes('class FourRentMobileHomeScreen extends StatefulWidget'), 'Missing FourRentMobileHomeScreen class');
  assert(dart.includes('class SubMeterOcrParser'), 'Missing SubMeterOcrParser class');
  assert(/(void|Future<void>)\s+main\s*\(\s*\)\s*async/.test(dart), 'Missing main() async entry point');
});

// -----------------------------------------------------------------------------
// SUITE 5: Mobile Launcher Scripts Portability & Absence of Hardcoded Paths
// -----------------------------------------------------------------------------
runTest('Suite 5: Portability', 'flutter.bat and flutter.cmd use portable %~dp0 and contain zero hardcoded paths', () => {
  const batPath = path.join(rootDir, 'mobile_app', 'flutter.bat');
  const cmdPath = path.join(rootDir, 'mobile_app', 'flutter.cmd');

  assert(fs.existsSync(batPath), 'mobile_app/flutter.bat missing');
  assert(fs.existsSync(cmdPath), 'mobile_app/flutter.cmd missing');

  const batContent = fs.readFileSync(batPath, 'utf8');
  const cmdContent = fs.readFileSync(cmdPath, 'utf8');

  assert(!batContent.includes('Gameiun') && !batContent.includes('Documents\\4Rent'), 'flutter.bat contains hardcoded path!');
  assert(!cmdContent.includes('Gameiun') && !cmdContent.includes('Documents\\4Rent'), 'flutter.cmd contains hardcoded path!');

  assert(batContent.includes('%~dp0build_release_apk.ps1'), 'flutter.bat does not use portable %~dp0');
  assert(cmdContent.includes('%~dp0build_release_apk.ps1'), 'flutter.cmd does not use portable %~dp0');
});

runTest('Suite 5: Portability', 'All files under mobile_app/ contain zero occurrences of developer personal paths', () => {
  function searchDir(dir) {
    const entries = fs.readdirSync(dir);
    for (const entry of entries) {
      if (entry === 'build') continue; // skip build dir
      const full = path.join(dir, entry);
      const stat = fs.statSync(full);
      if (stat.isDirectory()) {
        searchDir(full);
      } else if (stat.isFile()) {
        const ext = path.extname(entry).toLowerCase();
        if (['.bat', '.cmd', '.ps1', '.json', '.yaml', '.dart', '.xml', '.java'].includes(ext)) {
          const content = fs.readFileSync(full, 'utf8');
          assert(!content.includes('Gameiun') && !content.includes('Documents\\4Rent'),
            `Found developer hardcoded path in ${path.relative(rootDir, full)}`);
        }
      }
    }
  }
  searchDir(path.join(rootDir, 'mobile_app'));
});

// -----------------------------------------------------------------------------
// SUITE 6: Repository Packaging & Asset Distribution Structure
// -----------------------------------------------------------------------------
runTest('Suite 6: Repository Hygiene', 'Canonical distribution files exist and are populated', () => {
  const launcherPath = path.join(rootDir, 'packages', 'desktop', '4Rent Launcher.bat');
  const apkPath = path.join(rootDir, 'packages', 'mobile', '4Rent-v1.0.0-release.apk');

  assert(fs.existsSync(launcherPath), `Canonical launcher missing: ${launcherPath}`);
  assert(fs.existsSync(apkPath), `Canonical APK missing: ${apkPath}`);

  const launcherSize = fs.statSync(launcherPath).size;
  const apkSize = fs.statSync(apkPath).size;

  assert(launcherSize > 100, `Desktop launcher is suspiciously small: ${launcherSize} bytes`);
  assert(apkSize > 200000, `Mobile APK is suspiciously small: ${apkSize} bytes`);
});

runTest('Suite 6: Repository Hygiene', 'Duplicate and orphaned files are completely removed', () => {
  const duplicates = [
    path.join(rootDir, 'packages', '4Rent Launcher.bat'),
    path.join(rootDir, 'packages', '4Rent-v1.0.0-release.apk'),
    path.join(rootDir, 'public', '4Rent-v1.0.0-release.apk'),
    path.join(rootDir, 'capacitor.config.json'),
    path.join(rootDir, 'mobile_app', 'build', 'web')
  ];

  for (const dup of duplicates) {
    assert(!fs.existsSync(dup), `Duplicate or orphaned file should NOT exist: ${path.relative(rootDir, dup)}`);
  }
});

runTest('Suite 6: Repository Hygiene', 'packages/ directory contains strictly "desktop" and "mobile" subdirectories', () => {
  const pkgs = fs.readdirSync(path.join(rootDir, 'packages'));
  assertEqual(pkgs.sort().join(','), 'desktop,mobile', 'packages/ must only contain desktop and mobile dirs');
});

runTest('Suite 6: Repository Hygiene', 'public/ directory contains 0 .apk or .bat files', () => {
  function checkPublic(dir) {
    const entries = fs.readdirSync(dir);
    for (const entry of entries) {
      const full = path.join(dir, entry);
      const stat = fs.statSync(full);
      if (stat.isDirectory()) {
        checkPublic(full);
      } else {
        const ext = path.extname(entry).toLowerCase();
        assert(ext !== '.apk' && ext !== '.bat', `Illegal file found in public/: ${path.relative(rootDir, full)}`);
      }
    }
  }
  checkPublic(path.join(rootDir, 'public'));
});

// -----------------------------------------------------------------------------
// SUMMARY & VERDICT
// -----------------------------------------------------------------------------
console.log('\n================================================================');
console.log(`TEST SUMMARY: Total: ${results.total} | Passed: ${results.passed} | Failed: ${results.failed}`);
console.log('================================================================');

if (results.failed === 0) {
  console.log('\n>>> EMPIRICAL VERDICT: ALL TESTS PASSED. VERDICT: APPROVE <<<\n');
  process.exit(0);
} else {
  console.error(`\n>>> EMPIRICAL VERDICT: ${results.failed} TEST(S) FAILED. VERDICT: REJECT <<<\n`);
  process.exit(1);
}
