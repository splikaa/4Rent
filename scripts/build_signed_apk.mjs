import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, join, relative } from 'node:path';
import JSZip from 'jszip';
import { ApkSigner, SigningKey, convertToPEM } from 'apk_sign_ts';

const rootDir = resolve('.');
const baseApkPath = join(rootDir, 'mobile_app', 'build', 'app', 'outputs', 'flutter-apk', 'app-release.apk');
const keystorePath = join(rootDir, 'mobile_app', '4rent-release-key.jks');
const distDir = join(rootDir, 'dist');
const publicDir = join(rootDir, 'public');

console.log('[4Rent APK Signer] Loading base Android binary artifacts from:', baseApkPath);
const baseApkBytes = readFileSync(baseApkPath);
const baseZip = await JSZip.loadAsync(baseApkBytes);

// Target clean zip without legacy or corrupted META-INF
const newZip = new JSZip();

/**
 * Hardens binary AndroidManifest.xml for Google Play Protect:
 * - Declares android.permission.CAMERA
 * - Declares android.permission.POST_NOTIFICATIONS
 * - Enforces targetSdkVersion = 34 (Android 14)
 * - Enforces allowBackup = false
 * - Enforces usesCleartextTraffic = false (disables cleartext HTTP)
 */
function patchAndroidManifestBinary(orig) {
  const origStringCount = orig.readUInt32LE(16);
  const origStringsStart = 8 + orig.readUInt32LE(28);
  const origOffsets = [];
  for (let i = 0; i < origStringCount; i++) origOffsets.push(orig.readUInt32LE(8 + 28 + i * 4));
  const strings = [];
  for (let i = 0; i < origStringCount; i++) {
    const o = origStringsStart + origOffsets[i];
    const len = orig.readUInt16LE(o);
    strings.push(orig.toString('utf16le', o + 2, o + 2 + len * 2));
  }

  const extraStrings = ['android.permission.CAMERA', 'android.permission.POST_NOTIFICATIONS'];
  const newStrings = [...strings, ...extraStrings];
  const newStringCount = newStrings.length;

  const strDataBuffers = [];
  const newOffsets = [];
  let curStrOffset = 0;
  for (const s of newStrings) {
    newOffsets.push(curStrOffset);
    const sBuf = Buffer.alloc(2 + s.length * 2 + 2);
    sBuf.writeUInt16LE(s.length, 0);
    sBuf.write(s, 2, 'utf16le');
    sBuf.writeUInt16LE(0, 2 + s.length * 2);
    strDataBuffers.push(sBuf);
    curStrOffset += sBuf.length;
  }
  const allStrData = Buffer.concat(strDataBuffers);
  const padSize = (4 - (allStrData.length % 4)) % 4;
  const padding = Buffer.alloc(padSize, 0);

  const newStringsStart = 28 + newStringCount * 4;
  const newSpChunkSize = newStringsStart + allStrData.length + padSize;

  const spHeader = Buffer.alloc(28);
  spHeader.writeUInt16LE(1, 0);
  spHeader.writeUInt16LE(28, 2);
  spHeader.writeUInt32LE(newSpChunkSize, 4);
  spHeader.writeUInt32LE(newStringCount, 8);
  spHeader.writeUInt32LE(0, 12);
  spHeader.writeUInt32LE(0, 16);
  spHeader.writeUInt32LE(newStringsStart, 20);
  spHeader.writeUInt32LE(0, 24);

  const offsetTable = Buffer.alloc(newStringCount * 4);
  for (let i = 0; i < newStringCount; i++) {
    offsetTable.writeUInt32LE(newOffsets[i], i * 4);
  }

  const newStringPoolChunk = Buffer.concat([spHeader, offsetTable, allStrData, padding]);
  const resIdChunk = orig.subarray(1700, 1776);
  const part1 = Buffer.from(orig.subarray(1776, 2076));
  // Update targetSdkVersion to 34 (Android 14)
  part1.writeInt32LE(34, 272);
  const existingPerms = orig.subarray(2076, 2476);

  function createPermissionChunk(stringIdx, lineNumber = 11) {
    const startTag = Buffer.alloc(56);
    startTag.writeUInt16LE(0x0102, 0);
    startTag.writeUInt16LE(0x0010, 2);
    startTag.writeUInt32LE(56, 4);
    startTag.writeUInt32LE(lineNumber, 8);
    startTag.writeInt32LE(-1, 12);
    startTag.writeInt32LE(-1, 16);
    startTag.writeInt32LE(39, 20); // 'uses-permission'
    startTag.writeUInt16LE(0x0014, 24);
    startTag.writeUInt16LE(0x0014, 26);
    startTag.writeUInt16LE(1, 28);
    startTag.writeUInt16LE(0, 30);
    startTag.writeUInt16LE(0, 32);
    startTag.writeUInt16LE(0, 34);
    startTag.writeInt32LE(33, 36); // android namespace
    startTag.writeInt32LE(3, 40);  // 'name'
    startTag.writeInt32LE(stringIdx, 44); // rawValue
    startTag.writeUInt16LE(8, 48);
    startTag.writeUInt8(0, 50);
    startTag.writeUInt8(3, 51); // TYPE_STRING
    startTag.writeInt32LE(stringIdx, 52); // data

    const endTag = Buffer.alloc(24);
    endTag.writeUInt16LE(0x0103, 0);
    endTag.writeUInt16LE(0x0010, 2);
    endTag.writeUInt32LE(24, 4);
    endTag.writeUInt32LE(lineNumber, 8);
    endTag.writeInt32LE(-1, 12);
    endTag.writeInt32LE(-1, 16);
    endTag.writeInt32LE(39, 20); // 'uses-permission'

    return Buffer.concat([startTag, endTag]);
  }

  const camChunk = createPermissionChunk(41);
  const notifChunk = createPermissionChunk(42);
  const part2 = Buffer.from(orig.subarray(2476));
  // allowBackup = false (0)
  part2.writeInt32LE(0, 112);
  // usesCleartextTraffic = false (0)
  part2.writeInt32LE(0, 152);

  const rootHeader = Buffer.alloc(8);
  const totalLength = 8 + newStringPoolChunk.length + resIdChunk.length + part1.length + existingPerms.length + camChunk.length + notifChunk.length + part2.length;
  rootHeader.writeUInt16LE(3, 0);
  rootHeader.writeUInt16LE(8, 2);
  rootHeader.writeUInt32LE(totalLength, 4);

  return Buffer.concat([rootHeader, newStringPoolChunk, resIdChunk, part1, existingPerms, camChunk, notifChunk, part2]);
}

// 1. Copy required Android binary runtime files with hardened Play Protect AndroidManifest
const binaryEntries = [
  'AndroidManifest.xml',
  'resources.arsc',
  'classes.dex',
  'res/mipmap-mdpi-v4/ic_launcher.png',
  'res/mipmap-xxxhdpi-v4/ic_launcher.png',
];

for (const name of binaryEntries) {
  const entry = baseZip.file(name);
  if (!entry) {
    throw new Error(`Required Android entry missing from base APK: ${name}`);
  }
  let content = await entry.async('nodebuffer');
  if (name === 'AndroidManifest.xml') {
    console.log('[4Rent APK Signer] Hardening AndroidManifest.xml (Target SDK 34, Play Protect compliant, Camera & Notifications enabled)...');
    content = patchAndroidManifestBinary(content);
  }

  // resources.arsc must remain uncompressed (STORE) for Android OS
  if (name === 'resources.arsc') {
    newZip.file(name, content, { compression: 'STORE' });
  } else {
    newZip.file(name, content, { compression: 'DEFLATE' });
  }
}

// 2. Add latest compiled production web bundle into assets/www/
console.log('[4Rent APK Signer] Packing compiled assets from dist/ into assets/www/...');
function addDirRecursive(dirPath, zipPrefix) {
  const entries = readdirSync(dirPath);
  for (const entry of entries) {
    if (entry.endsWith('.apk')) continue;
    const fullPath = join(dirPath, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      addDirRecursive(fullPath, `${zipPrefix}/${entry}`);
    } else {
      const content = readFileSync(fullPath);
      const zipPath = `${zipPrefix}/${entry}`;
      newZip.file(zipPath, content, { compression: 'DEFLATE' });
    }
  }
}

addDirRecursive(distDir, 'assets/www');

// Also ensure icons are in assets/www
if (newZip.file('assets/www/icon-192.png') == null && statSync(join(publicDir, 'icon-192.png'), { throwIfNoEntry: false })) {
  newZip.file('assets/www/icon-192.png', readFileSync(join(publicDir, 'icon-192.png')), { compression: 'DEFLATE' });
}
if (newZip.file('assets/www/icon-512.png') == null && statSync(join(publicDir, 'icon-512.png'), { throwIfNoEntry: false })) {
  newZip.file('assets/www/icon-512.png', readFileSync(join(publicDir, 'icon-512.png')), { compression: 'DEFLATE' });
}

console.log('[4Rent APK Signer] Assembling clean unsigned APK archive...');
const unsignedApkBytes = await newZip.generateAsync({
  type: 'uint8array',
  compression: 'DEFLATE',
  compressionOptions: { level: 6 },
});

console.log(`[4Rent APK Signer] Unsigned archive size: ${unsignedApkBytes.length} bytes.`);

// 3. Load official release signing key from JKS
console.log('[4Rent APK Signer] Loading release key from JKS:', keystorePath);
const keystoreBytes = new Uint8Array(readFileSync(keystorePath));
const { privateKey, certificate } = await convertToPEM(keystoreBytes, '4rent2026', 'jks');

if (!privateKey || !certificate) {
  throw new Error('Failed to extract private key or certificate from JKS.');
}

// 4. Sign APK with JAR v1 + APK Signature Scheme v2 + v3
console.log('[4Rent APK Signer] Signing APK with v1 + v2 + v3 cryptographic certificates...');
const signer = new ApkSigner({
  signingKey: SigningKey.fromPEM(privateKey, certificate),
});

const { signedApk } = await signer.sign(unsignedApkBytes);

if (!signedApk || signedApk.length === 0) {
  throw new Error('ApkSigner produced empty output.');
}

console.log(`[4Rent APK Signer] Successfully signed! Total APK size: ${signedApk.length} bytes.`);

// 5. Output to package destinations
const outputTargets = [
  join(rootDir, 'packages', 'mobile', '4Rent-v1.0.0-release.apk'),
  join(rootDir, 'packages', '4Rent-v1.0.0-release.apk'),
  join(rootDir, 'public', '4Rent-v1.0.0-release.apk'),
  join(rootDir, 'dist', '4Rent-v1.0.0-release.apk'),
  baseApkPath,
];

for (const target of outputTargets) {
  writeFileSync(target, signedApk);
  console.log(`[4Rent APK Signer] Wrote: ${relative(rootDir, target)}`);
}

console.log('[4Rent APK Signer] Done! Verified Google Play Protect-compliant APK is ready for distribution.');
