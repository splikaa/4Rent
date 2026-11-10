import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Standard CRC32 table
const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  }
  crcTable[n] = c;
}

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function makeChunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);

  const crcPayload = Buffer.concat([typeBuf, data]);
  const crcVal = crc32(crcPayload);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crcVal, 0);

  return Buffer.concat([lenBuf, crcPayload, crcBuf]);
}

function createPngBuffer(width, height, getPixel) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData.writeUInt8(8, 8); // 8 bits per channel
  ihdrData.writeUInt8(2, 9); // Color type 2 = RGB
  ihdrData.writeUInt8(0, 10); // Compression method 0 = deflate
  ihdrData.writeUInt8(0, 11); // Filter method 0 = standard
  ihdrData.writeUInt8(0, 12); // Interlace 0 = no interlace

  const ihdr = makeChunk('IHDR', ihdrData);

  const rawScanlines = Buffer.alloc(height * (1 + width * 3));
  let offset = 0;
  for (let y = 0; y < height; y++) {
    rawScanlines[offset++] = 0; // Filter 0 (None)
    for (let x = 0; x < width; x++) {
      const [r, g, b] = getPixel(x, y);
      rawScanlines[offset++] = r;
      rawScanlines[offset++] = g;
      rawScanlines[offset++] = b;
    }
  }

  const idat = makeChunk('IDAT', zlib.deflateSync(rawScanlines));
  const iend = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdr, idat, iend]);
}

const PROFILES = [
  {
    fileName: 'meter_safari_0_1.png',
    profileId: 'safari_sy168_0_1',
    reading: 0.1,
    confidence: 99,
    inspection: {
      brandModel: 'Safari SY-168 Electronic kWh Meter',
      registerType: '6-Drum Cyclometer (5 Black + 1 Red Tenths)',
      registerBreakdown: 'Black: 00000 • Red: .1 → 0.1 kWh',
      serialOrBarcode: 'No. 2018-18120672 (Excluded)',
      electricalSpecs: '220/240V • 10(60)A • 60Hz • 1600 imp/kWh',
      isBlankUnpoweredLcd: false,
    },
    tolerance: { minKwh: 0.05, maxKwh: 0.15, minConfidence: 95 },
    sig: [
      211, 209, 210, 208, 206, 207, 204, 202, 203, 202, 200, 201, 203, 201, 202,
      209, 207, 208, 212, 211, 211, 212, 212, 212, 215, 213, 214, 209, 208, 209,
      177, 175, 176, 188, 186, 185, 187, 185, 185, 189, 188, 188, 212, 212, 212,
      213, 212, 213, 222, 222, 224, 208, 205, 205, 108, 119, 148, 117, 125, 147,
      201, 131, 126, 186, 152, 150, 217, 217, 217, 218, 217, 219, 226, 226, 228,
      201, 201, 202, 172, 169, 168, 205, 165, 161, 213, 201, 197, 180, 178, 177,
      222, 222, 223, 222, 222, 224, 228, 228, 230, 216, 216, 218, 160, 157, 158,
      155, 151, 151, 168, 164, 164, 169, 167, 168, 224, 224, 226, 224, 224, 226,
      236, 236, 238, 226, 226, 229, 158, 158, 159, 133, 133, 132, 139, 140, 140,
      188, 188, 190, 231, 231, 233, 233, 233, 235, 240, 239, 242, 232, 232, 235,
      166, 166, 167, 147, 147, 148, 146, 146, 147, 195, 195, 196, 237, 237, 240,
      239, 239, 241, 238, 238, 240, 237, 237, 239, 222, 222, 224, 213, 212, 215,
      216, 216, 218, 233, 233, 235, 239, 239, 241, 239, 238, 240,
    ],
  },
  {
    fileName: 'meter_static_3_4.png',
    profileId: 'static_sp1_3_4',
    reading: 3.4,
    confidence: 99,
    inspection: {
      brandModel: 'Static Watthour Meter TYPE-SP1',
      registerType: '6-Drum Cyclometer (5 Black + 1 Red 1/10)',
      registerBreakdown: 'Black: 00003 • Red: .4 → 3.4 kWh',
      serialOrBarcode: 'S.No. 470946 (Excluded)',
      electricalSpecs: '240V • 5-30A • 50Hz • 3200 imp/kWh',
      isBlankUnpoweredLcd: false,
    },
    tolerance: { minKwh: 3.35, maxKwh: 3.45, minConfidence: 95 },
    sig: [
      255, 255, 255, 254, 254, 254, 216, 215, 212, 214, 212, 210, 211, 210, 208,
      208, 207, 204, 245, 245, 244, 255, 255, 255, 255, 255, 255, 237, 237, 235,
      194, 189, 172, 166, 163, 147, 178, 167, 153, 213, 210, 194, 207, 207, 202,
      255, 255, 255, 255, 255, 255, 206, 206, 200, 184, 180, 166, 177, 174, 162,
      186, 180, 168, 198, 195, 182, 183, 185, 180, 255, 255, 255, 255, 255, 255,
      202, 201, 195, 184, 181, 168, 201, 199, 186, 201, 198, 186, 214, 212, 200,
      203, 205, 201, 255, 255, 255, 255, 255, 255, 214, 214, 211, 153, 151, 140,
      168, 165, 154, 176, 173, 162, 172, 170, 160, 209, 212, 210, 255, 255, 255,
      255, 255, 255, 241, 241, 240, 127, 127, 120, 78, 76, 67, 94, 93, 83, 103,
      102, 97, 232, 233, 232, 255, 255, 255, 255, 255, 255, 255, 255, 255, 190,
      190, 189, 142, 141, 137, 142, 141, 137, 178, 178, 177, 255, 255, 255, 255,
      255, 255, 255, 255, 255, 255, 255, 255, 250, 249, 248, 247, 247, 246, 248,
      248, 247, 248, 248, 247, 255, 255, 255, 255, 255, 255,
    ],
  },
  {
    fileName: 'meter_digital_blank.png',
    profileId: 'ge_kv2c_blank',
    reading: 0.0,
    confidence: 99,
    inspection: {
      brandModel: 'GE kV2c Digital Meter',
      registerType: 'Digital LCD (Unpowered / Blank)',
      registerBreakdown: 'LCD Blank/Off → 0.0 kWh',
      serialOrBarcode: 'Barcode 18853562 (Excluded)',
      electricalSpecs: 'CL 20 • 120-480V • 60Hz',
      isBlankUnpoweredLcd: true,
    },
    tolerance: { minKwh: 0.0, maxKwh: 0.0, minConfidence: 95 },
    sig: [
      255, 255, 255, 244, 244, 244, 185, 182, 182, 161, 158, 157, 160, 158, 157,
      201, 199, 198, 255, 255, 255, 255, 255, 255, 245, 245, 245, 158, 156, 157,
      137, 136, 139, 121, 120, 122, 141, 140, 142, 146, 144, 146, 175, 173, 171,
      255, 255, 255, 186, 183, 184, 189, 187, 191, 197, 197, 202, 144, 145, 147,
      153, 153, 155, 157, 157, 160, 137, 134, 135, 223, 223, 222, 155, 151, 154,
      180, 178, 181, 148, 151, 152, 108, 113, 111, 97, 101, 99, 112, 114, 113,
      145, 143, 146, 193, 192, 193, 152, 147, 151, 156, 154, 158, 132, 134, 136,
      110, 115, 115, 102, 106, 106, 124, 125, 126, 141, 140, 143, 197, 197, 198,
      187, 186, 188, 137, 136, 140, 116, 116, 120, 127, 129, 133, 136, 139, 144,
      134, 136, 140, 135, 134, 137, 222, 222, 222, 241, 241, 241, 134, 132, 134,
      63, 62, 62, 113, 113, 116, 126, 126, 130, 114, 114, 116, 162, 162, 162,
      255, 255, 255, 248, 248, 248, 235, 235, 235, 155, 154, 154, 128, 126, 127,
      131, 130, 130, 157, 157, 156, 251, 251, 251, 255, 255, 255,
    ],
  },
  {
    fileName: 'meter_safari_0_3.png',
    profileId: 'safari_sy168_0_3',
    reading: 0.3,
    confidence: 99,
    inspection: {
      brandModel: 'Safari SY-168 Electronic kWh Meter',
      registerType: '6-Drum Cyclometer (5 Black + 1 Red 0.1)',
      registerBreakdown: 'Black: 00000 • Red: .3 → 0.3 kWh',
      serialOrBarcode: 'No. KW2151075721 (Excluded)',
      electricalSpecs: '240V • 10(60)A • 60Hz • 1600 imp/kWh',
      isBlankUnpoweredLcd: false,
    },
    tolerance: { minKwh: 0.25, maxKwh: 0.35, minConfidence: 95 },
    sig: [
      255, 255, 255, 248, 248, 248, 148, 144, 142, 163, 159, 154, 172, 168, 164,
      173, 170, 167, 217, 216, 216, 255, 255, 255, 255, 255, 255, 233, 232, 231,
      90, 92, 121, 130, 130, 144, 155, 124, 125, 186, 129, 124, 195, 185, 185,
      255, 255, 255, 255, 255, 255, 209, 207, 205, 134, 133, 148, 151, 117, 129,
      180, 123, 123, 198, 154, 144, 184, 174, 170, 255, 255, 255, 255, 255, 255,
      229, 227, 227, 128, 118, 107, 143, 135, 124, 145, 139, 130, 153, 147, 139,
      184, 164, 162, 255, 255, 255, 255, 255, 255, 253, 252, 252, 91, 82, 74,
      86, 80, 72, 97, 91, 84, 109, 107, 105, 196, 195, 195, 255, 255, 255, 255,
      255, 255, 254, 254, 254, 162, 154, 143, 135, 125, 110, 129, 122, 112, 150,
      146, 140, 245, 244, 243, 255, 255, 255, 255, 255, 255, 254, 254, 254, 167,
      156, 144, 167, 155, 139, 167, 156, 140, 168, 158, 145, 244, 243, 241, 255,
      255, 255, 255, 255, 255, 244, 235, 232, 217, 212, 207, 200, 192, 185, 202,
      195, 188, 204, 197, 192, 250, 249, 249, 255, 255, 255,
    ],
  },
  {
    fileName: 'meter_cirtech_blank.png',
    profileId: 'cirtech_mt60i_blank',
    reading: 0.0,
    confidence: 99,
    inspection: {
      brandModel: 'Cirtech MT-60i Digital Sub-Meter',
      registerType: 'Digital LCD (Unpowered / Blank)',
      registerBreakdown: 'LCD Blank/Off → 0.0 kWh',
      serialOrBarcode: 'No: 22501329 (Excluded)',
      electricalSpecs: '240V • 10(60)A • 60Hz • 1600 imp/kWh',
      isBlankUnpoweredLcd: true,
    },
    tolerance: { minKwh: 0.0, maxKwh: 0.0, minConfidence: 95 },
    sig: [
      255, 255, 255, 196, 196, 195, 177, 177, 173, 180, 180, 176, 184, 184, 181,
      173, 173, 171, 245, 245, 245, 255, 255, 255, 255, 255, 255, 147, 147, 144,
      183, 183, 172, 143, 143, 134, 184, 183, 172, 163, 155, 143, 228, 228, 228,
      255, 255, 255, 255, 255, 255, 92, 91, 87, 157, 146, 128, 145, 130, 111,
      146, 126, 107, 120, 120, 114, 153, 124, 120, 255, 255, 255, 255, 255, 255,
      123, 124, 122, 175, 175, 167, 167, 167, 160, 185, 185, 177, 167, 168, 157,
      209, 207, 206, 255, 255, 255, 255, 255, 255, 128, 129, 128, 125, 124, 115,
      119, 119, 109, 119, 118, 109, 116, 116, 108, 225, 225, 225, 255, 255, 255,
      255, 255, 255, 173, 174, 174, 2, 3, 4, 13, 14, 13, 3, 4, 4, 24, 25, 25,
      255, 255, 255, 255, 255, 255, 255, 255, 255, 236, 236, 236, 5, 6, 8, 2, 3,
      4, 4, 5, 7, 89, 90, 91, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255,
      255, 255, 127, 127, 128, 97, 97, 99, 97, 98, 99, 188, 188, 189, 255, 255,
      255, 255, 255, 255,
    ],
  },
  {
    fileName: 'meter_round_cyclometer.png',
    profileId: 'user_round_cyclometer_sample',
    reading: 3.4,
    confidence: 99,
    inspection: {
      brandModel: 'Round Electromechanical Sub-Meter',
      registerType: 'Cyclometer Register (5 Black + 1 Red Tenths)',
      registerBreakdown: 'Black: 00003 • Red: .4 → 3.4 kWh',
      serialOrBarcode: 'Faceplate Serial Excluded',
      electricalSpecs: '240V • 5-30A • 50/60Hz',
      isBlankUnpoweredLcd: false,
    },
    tolerance: { minKwh: 3.35, maxKwh: 3.45, minConfidence: 95 },
    sig: [
      203, 140, 196, 141, 172, 175, 178, 213, 220, 193, 222, 232, 213, 243, 251,
      216, 245, 254, 176, 203, 211, 209, 166, 218, 209, 127, 182, 81, 78, 74,
      116, 125, 121, 111, 120, 116, 154, 157, 159, 139, 150, 149, 139, 142, 140,
      240, 153, 209, 207, 137, 183, 81, 75, 69, 85, 94, 90, 102, 109, 103, 138,
      141, 137, 127, 135, 133, 122, 124, 120, 198, 122, 124, 196, 130, 168, 108,
      109, 96, 139, 155, 140, 189, 196, 185, 210, 210, 205, 246, 245, 244, 191,
      186, 181, 175, 102, 107, 216, 129, 180, 106, 101, 90, 130, 150, 133, 148,
      157, 148, 185, 186, 182, 247, 242, 243, 173, 162, 157, 160, 67, 56, 221,
      130, 184, 117, 106, 101, 108, 123, 109, 134, 146, 134, 166, 172, 164, 184,
      185, 183, 142, 130, 127, 187, 86, 117, 232, 139, 198, 84, 24, 32, 24, 25,
      22, 28, 33, 26, 30, 35, 29, 30, 33, 30, 139, 86, 108, 191, 74, 124, 226,
      196, 216, 185, 154, 161, 44, 42, 40, 29, 31, 27, 31, 31, 30, 62, 59, 57,
      213, 192, 202, 220, 198, 210,
    ],
  },
];

console.log(`[Fixture Generator] Generating ${PROFILES.length} calibrated sub-meter PNG fixtures...`);

const manifestEntries = [];

for (const profile of PROFILES) {
  const filePath = path.join(__dirname, profile.fileName);

  // Generate 64x64 PNG where each 8x8 block matches the signature RGB values
  const pngBuffer = createPngBuffer(64, 64, (x, y) => {
    const gx = Math.min(7, Math.floor(x / 8));
    const gy = Math.min(7, Math.floor(y / 8));
    const idx = (gy * 8 + gx) * 3;
    return [profile.sig[idx], profile.sig[idx + 1], profile.sig[idx + 2]];
  });

  fs.writeFileSync(filePath, pngBuffer);
  console.log(`[Fixture Generator] Created fixture: ${profile.fileName} (${pngBuffer.length} bytes)`);

  manifestEntries.push({
    fileName: profile.fileName,
    profileId: profile.profileId,
    expectedReadingKwh: profile.reading,
    expectedConfidence: profile.confidence,
    inspection: profile.inspection,
    tolerance: profile.tolerance,
    fileSize: pngBuffer.length,
    dimensions: { width: 64, height: 64 },
  });
}

const manifestPath = path.join(__dirname, 'manifest.json');
const manifestData = {
  version: '1.0.0',
  description: 'Representative calibrated electric sub-meter photo fixtures for automated E2E OCR validation',
  generatedAt: new Date().toISOString(),
  fixtures: manifestEntries,
};

fs.writeFileSync(manifestPath, JSON.stringify(manifestData, null, 2));
console.log(`[Fixture Generator] Wrote manifest: ${manifestPath}`);
