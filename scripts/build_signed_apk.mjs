import { readFileSync, writeFileSync, readdirSync, statSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, join, relative, dirname } from 'node:path';
import JSZip from 'jszip';
import { ApkSigner, SigningKey, convertToPEM } from 'apk_sign_ts';

const rootDir = resolve('.');
const baseTemplatePath = join(rootDir, 'mobile_app', 'base-template.apk');
const fallbackBaseApkPath = join(rootDir, 'mobile_app', 'build', 'app', 'outputs', 'flutter-apk', 'app-release.apk');
const baseApkPath = existsSync(baseTemplatePath) ? baseTemplatePath : fallbackBaseApkPath;
const keystorePath = join(rootDir, 'mobile_app', '4rent-release-key.jks');
const distDir = join(rootDir, 'dist');
const publicDir = join(rootDir, 'public');

if (!existsSync(baseApkPath)) {
  throw new Error(`[4Rent APK Signer] Base APK not found at: ${baseApkPath}`);
}
if (!existsSync(keystorePath)) {
  throw new Error(`[4Rent APK Signer] Keystore not found at: ${keystorePath}`);
}

console.log('[4Rent APK Signer] Loading base Android binary artifacts from:', baseApkPath);
const baseApkBytes = readFileSync(baseApkPath);
const baseZip = await JSZip.loadAsync(baseApkBytes);

// Target clean zip without legacy or corrupted META-INF
const newZip = new JSZip();

/**
 * AndroidManifest Google Play Protect & Android 14 requirements:
 * - Target SDK boundary: targetSdkVersion = 34 (Android 14)
 * - Required permissions declared in base template:
 *   - 'android.permission.INTERNET'
 *   - 'android.permission.CAMERA'
 *   - 'android.permission.POST_NOTIFICATIONS'
 * - String pool alignment formula: (4 - (allStrData.length % 4)) % 4
 */

/**
 * Dynamically injects android.permission.CAMERA and android.permission.POST_NOTIFICATIONS
 * into binary AndroidManifest.xml (AXML) without corrupting binary chunk headers or string pools.
 */
function patchBinaryAndroidManifest(manifest) {
  const strPoolChunk = 8;
  const strPoolSize = manifest.readUInt32LE(strPoolChunk + 4);
  const stringCount = manifest.readUInt32LE(strPoolChunk + 8);
  const styleCount = manifest.readUInt32LE(strPoolChunk + 12);
  const flags = manifest.readUInt32LE(strPoolChunk + 16);
  const stringsStart = manifest.readUInt32LE(strPoolChunk + 20);
  const stylesStart = manifest.readUInt32LE(strPoolChunk + 24);

  const strings = [];
  for (let i = 0; i < stringCount; i++) {
    const off = manifest.readUInt32LE(strPoolChunk + 28 + i * 4);
    const abs = strPoolChunk + stringsStart + off;
    const len = manifest.readUInt16LE(abs);
    strings.push(manifest.toString('utf16le', abs + 2, abs + 2 + len * 2));
  }

  const permsToAdd = ['android.permission.CAMERA', 'android.permission.POST_NOTIFICATIONS'];
  const needed = permsToAdd.filter((p) => !strings.includes(p));
  if (needed.length === 0) return manifest;

  const newStrings = [...strings, ...needed];

  const strDataOffsets = [];
  const strDataBuffers = [];
  let curDataOff = 0;
  for (const s of newStrings) {
    strDataOffsets.push(curDataOff);
    const charBuf = Buffer.from(s, 'utf16le');
    const itemBuf = Buffer.alloc(2 + charBuf.length + 2);
    itemBuf.writeUInt16LE(s.length, 0);
    charBuf.copy(itemBuf, 2);
    itemBuf.writeUInt16LE(0, 2 + charBuf.length);
    strDataBuffers.push(itemBuf);
    curDataOff += itemBuf.length;
  }
  const allStrData = Buffer.concat(strDataBuffers);
  const strPadding = (4 - (allStrData.length % 4)) % 4;
  const paddedStrData = Buffer.concat([allStrData, Buffer.alloc(strPadding)]);

  const headerSize = 28;
  const offsetsSize = newStrings.length * 4;
  const newStringsStart = headerSize + offsetsSize;
  const newStrPoolSize = newStringsStart + paddedStrData.length;

  const newStrPoolBuf = Buffer.alloc(newStrPoolSize);
  newStrPoolBuf.writeUInt32LE(0x001C0001, 0);
  newStrPoolBuf.writeUInt32LE(newStrPoolSize, 4);
  newStrPoolBuf.writeUInt32LE(newStrings.length, 8);
  newStrPoolBuf.writeUInt32LE(styleCount, 12);
  newStrPoolBuf.writeUInt32LE(flags, 16);
  newStrPoolBuf.writeUInt32LE(newStringsStart, 20);
  newStrPoolBuf.writeUInt32LE(stylesStart, 24);

  for (let i = 0; i < newStrings.length; i++) {
    newStrPoolBuf.writeUInt32LE(strDataOffsets[i], 28 + i * 4);
  }
  paddedStrData.copy(newStrPoolBuf, newStringsStart);

  const oldResMapStart = strPoolChunk + strPoolSize;
  const resMapSize = manifest.readUInt32LE(oldResMapStart + 4);
  const resMapBuf = manifest.subarray(oldResMapStart, oldResMapStart + resMapSize);

  const usesPermIdx = newStrings.indexOf('uses-permission');
  const nsIdx = newStrings.indexOf('http://schemas.android.com/apk/res/android');
  const nameIdx = newStrings.indexOf('name');

  function makeUsesPermNode(permString) {
    const permIdx = newStrings.indexOf(permString);
    const start = Buffer.alloc(56);
    start.writeUInt32LE(0x00100102, 0);
    start.writeUInt32LE(56, 4);
    start.writeUInt32LE(15, 8);
    start.writeUInt32LE(0xFFFFFFFF, 12);
    start.writeInt32LE(-1, 16);
    start.writeInt32LE(usesPermIdx, 20);
    start.writeUInt16LE(20, 24);
    start.writeUInt16LE(20, 26);
    start.writeUInt16LE(1, 28);
    start.writeUInt16LE(0, 30);
    start.writeUInt16LE(0, 32);
    start.writeUInt16LE(0, 34);

    start.writeInt32LE(nsIdx, 36);
    start.writeInt32LE(nameIdx, 40);
    start.writeInt32LE(permIdx, 44);
    start.writeUInt16LE(8, 48);
    start.writeUInt8(0, 50);
    start.writeUInt8(3, 51);
    start.writeInt32LE(permIdx, 52);

    const end = Buffer.alloc(24);
    end.writeUInt32LE(0x00100103, 0);
    end.writeUInt32LE(24, 4);
    end.writeUInt32LE(15, 8);
    end.writeUInt32LE(0xFFFFFFFF, 12);
    end.writeInt32LE(-1, 16);
    end.writeInt32LE(usesPermIdx, 20);

    return Buffer.concat([start, end]);
  }

  const permNodes = Buffer.concat(needed.map(makeUsesPermNode));

  const oldXmlBodyStart = oldResMapStart + resMapSize;
  const appStrIdx = strings.indexOf('application');
  let appOffsetInXml = -1;
  let scanP = oldXmlBodyStart;
  while (scanP < manifest.length) {
    const type = manifest.readUInt32LE(scanP);
    const size = manifest.readUInt32LE(scanP + 4);
    if (type === 0x00100102) {
      const nameId = manifest.readInt32LE(scanP + 20);
      if (nameId === appStrIdx) {
        appOffsetInXml = scanP - oldXmlBodyStart;
        break;
      }
    }
    scanP += size;
  }

  const insertOffset = appOffsetInXml >= 0 ? appOffsetInXml : (2476 - oldXmlBodyStart);
  const xmlBeforeApp = manifest.subarray(oldXmlBodyStart, oldXmlBodyStart + insertOffset);
  const xmlFromAppToEnd = manifest.subarray(oldXmlBodyStart + insertOffset);

  const newTotalSize = 8 + newStrPoolBuf.length + resMapBuf.length + xmlBeforeApp.length + permNodes.length + xmlFromAppToEnd.length;

  const newHeader = Buffer.alloc(8);
  newHeader.writeUInt32LE(0x00080003, 0);
  newHeader.writeUInt32LE(newTotalSize, 4);

  return Buffer.concat([
    newHeader,
    newStrPoolBuf,
    resMapBuf,
    xmlBeforeApp,
    permNodes,
    xmlFromAppToEnd
  ]);
}

// 1. Copy required Android binary runtime files without binary mangling
const updatedDexPath = join(rootDir, 'mobile_app', 'classes.dex');
const binaryEntries = [
  'AndroidManifest.xml',
  'resources.arsc',
  'classes.dex',
  'res/mipmap-mdpi-v4/ic_launcher.png',
  'res/mipmap-xxxhdpi-v4/ic_launcher.png',
];

for (const name of binaryEntries) {
  let content;
  if (name === 'classes.dex' && existsSync(updatedDexPath)) {
    content = readFileSync(updatedDexPath);
    console.log(`[4Rent APK Signer] Using updated compiled classes.dex (${content.length} bytes) with camera permission handlers.`);
  } else if (name === 'AndroidManifest.xml') {
    const entry = baseZip.file(name);
    if (!entry) {
      throw new Error(`Required Android entry missing from base APK: ${name}`);
    }
    const rawManifest = await entry.async('nodebuffer');
    content = patchBinaryAndroidManifest(rawManifest);
    console.log(`[4Rent APK Signer] Injected CAMERA & POST_NOTIFICATIONS permissions into binary AndroidManifest (${content.length} bytes).`);
  } else {
    const entry = baseZip.file(name);
    if (!entry) {
      throw new Error(`Required Android entry missing from base APK: ${name}`);
    }
    content = await entry.async('nodebuffer');
  }

  // resources.arsc must remain uncompressed (STORE) for Android OS
  if (name === 'resources.arsc') {
    newZip.file(name, content, { compression: 'STORE', createFolders: false });
  } else {
    newZip.file(name, content, { compression: 'DEFLATE', createFolders: false });
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
      newZip.file(zipPath, content, { compression: 'DEFLATE', createFolders: false });
    }
  }
}

if (!existsSync(distDir)) {
  console.warn('[4Rent APK Signer] Warning: dist/ directory not found. Run "npm run build" first to package latest web assets.');
} else {
  addDirRecursive(distDir, 'assets/www');
}

// Also ensure icons are in assets/www
if (newZip.file('assets/www/icon-192.png') == null && existsSync(join(publicDir, 'icon-192.png'))) {
  newZip.file('assets/www/icon-192.png', readFileSync(join(publicDir, 'icon-192.png')), { compression: 'DEFLATE', createFolders: false });
}
if (newZip.file('assets/www/icon-512.png') == null && existsSync(join(publicDir, 'icon-512.png'))) {
  newZip.file('assets/www/icon-512.png', readFileSync(join(publicDir, 'icon-512.png')), { compression: 'DEFLATE', createFolders: false });
}

// Ensure zero empty directory entries in the ZIP archive
for (const fileName of Object.keys(newZip.files)) {
  if (newZip.files[fileName].dir || fileName.endsWith('/')) {
    newZip.remove(fileName);
  }
}

console.log('[4Rent APK Signer] Assembling clean unsigned APK archive...');
const rawUnsignedBytes = await newZip.generateAsync({
  type: 'nodebuffer',
  compression: 'DEFLATE',
  compressionOptions: { level: 6 },
});

/**
 * 4-byte boundary ZIP alignment (zipalign) for uncompressed entries (such as resources.arsc).
 * Omit any directory entries from local headers and central directory.
 */
function zipalignZip(buffer) {
  let eocdOffset = -1;
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 65557); i--) {
    if (buffer.readUInt32LE(i) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset === -1) {
    throw new Error('Invalid ZIP archive: End of Central Directory (EOCD) not found');
  }

  const cdOffset = buffer.readUInt32LE(eocdOffset + 16);
  const cdSize = buffer.readUInt32LE(eocdOffset + 12);
  const numEntries = buffer.readUInt16LE(eocdOffset + 10);

  const entries = [];
  let cur = cdOffset;
  for (let i = 0; i < numEntries; i++) {
    if (buffer.readUInt32LE(cur) !== 0x02014b50) {
      throw new Error(`Invalid Central Directory header at byte ${cur}`);
    }
    const method = buffer.readUInt16LE(cur + 10);
    const compSize = buffer.readUInt32LE(cur + 20);
    const uncompSize = buffer.readUInt32LE(cur + 24);
    const nameLen = buffer.readUInt16LE(cur + 28);
    const extraLen = buffer.readUInt16LE(cur + 30);
    const commentLen = buffer.readUInt16LE(cur + 32);
    const localOffset = buffer.readUInt32LE(cur + 42);
    const name = buffer.toString('utf8', cur + 46, cur + 46 + nameLen);
    const cdEntrySize = 46 + nameLen + extraLen + commentLen;
    const cdHeaderRaw = buffer.subarray(cur, cur + cdEntrySize);
    entries.push({
      name,
      method,
      compSize,
      uncompSize,
      nameLen,
      localOffset,
      cdHeaderRaw,
    });
    cur += cdEntrySize;
  }

  // Omit directory entries
  const fileEntries = entries.filter((e) => !e.name.endsWith('/'));
  fileEntries.sort((a, b) => a.localOffset - b.localOffset);

  const localBuffers = [];
  const cdBuffers = [];
  let newLocalOffset = 0;

  for (const entry of fileEntries) {
    const locOff = entry.localOffset;
    if (buffer.readUInt32LE(locOff) !== 0x04034b50) {
      throw new Error(`Invalid Local File Header at byte ${locOff}`);
    }
    const locNameLen = buffer.readUInt16LE(locOff + 26);
    const locExtraLen = buffer.readUInt16LE(locOff + 28);
    const dataStart = locOff + 30 + locNameLen + locExtraLen;
    const data = buffer.subarray(dataStart, dataStart + entry.compSize);
    const nameBuf = buffer.subarray(locOff + 30, locOff + 30 + locNameLen);

    let padLen = 0;
    // Align uncompressed entries (compression method 0) on 4-byte boundaries
    if (entry.method === 0) {
      const headerBase = newLocalOffset + 30 + locNameLen;
      padLen = (4 - (headerBase % 4)) % 4;
    }
    const extraBuf = Buffer.alloc(padLen, 0);

    const localHdr = Buffer.alloc(30);
    buffer.copy(localHdr, 0, locOff, locOff + 26);
    localHdr.writeUInt16LE(locNameLen, 26);
    localHdr.writeUInt16LE(padLen, 28);

    const fullLocal = Buffer.concat([localHdr, nameBuf, extraBuf, data]);
    localBuffers.push(fullLocal);

    const cdHdr = Buffer.alloc(46);
    entry.cdHeaderRaw.copy(cdHdr, 0, 0, 28);
    cdHdr.writeUInt16LE(locNameLen, 28);
    cdHdr.writeUInt16LE(padLen, 30);
    cdHdr.writeUInt16LE(0, 32); // comment length
    entry.cdHeaderRaw.copy(cdHdr, 34, 34, 42); // disk & attributes
    cdHdr.writeUInt32LE(newLocalOffset, 42);

    const fullCd = Buffer.concat([cdHdr, nameBuf, extraBuf]);
    cdBuffers.push(fullCd);

    newLocalOffset += fullLocal.length;
  }

  const allLocal = Buffer.concat(localBuffers);
  const allCd = Buffer.concat(cdBuffers);
  const newEocd = Buffer.alloc(22);
  newEocd.writeUInt32LE(0x06054b50, 0);
  newEocd.writeUInt16LE(0, 4);
  newEocd.writeUInt16LE(0, 6);
  newEocd.writeUInt16LE(fileEntries.length, 8);
  newEocd.writeUInt16LE(fileEntries.length, 10);
  newEocd.writeUInt32LE(allCd.length, 12);
  newEocd.writeUInt32LE(allLocal.length, 16);
  newEocd.writeUInt16LE(0, 20);

  return Buffer.concat([allLocal, allCd, newEocd]);
}

const unsignedApkBytes = zipalignZip(rawUnsignedBytes);
console.log(`[4Rent APK Signer] Unsigned aligned archive size: ${unsignedApkBytes.length} bytes.`);

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

// 5. Output to package destination and distribution endpoints
const outputTargets = [
  join(rootDir, 'packages', 'mobile', '4Rent-v1.0.0-release.apk'),
  join(rootDir, '4Rent-v1.0.0-release.apk'),
  join(rootDir, 'public', '4Rent-v1.0.0-release.apk'),
  join(rootDir, 'dist', '4Rent-v1.0.0-release.apk'),
  join(rootDir, 'public', 'packages', 'mobile', '4Rent-v1.0.0-release.apk'),
  join(rootDir, 'dist', 'packages', 'mobile', '4Rent-v1.0.0-release.apk'),
];

for (const target of outputTargets) {
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, signedApk);
  console.log(`[4Rent APK Signer] Wrote: ${relative(rootDir, target)}`);
}

console.log('[4Rent APK Signer] Done! Verified Android release APK is ready for distribution.');
