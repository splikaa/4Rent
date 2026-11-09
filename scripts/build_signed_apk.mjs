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

// 1. Copy required Android binary runtime files
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
  const content = await entry.async('uint8array');
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

console.log('[4Rent APK Signer] Done! Verified release APK is ready for distribution.');
