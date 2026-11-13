import Tesseract from 'tesseract.js';
import { extractMeterDigitsFromOcrText } from '../utils/billingCalculator';
import { analyzeSubMeterVision, type VisionReadResult } from './meterVisionEngine';

export interface SubMeterHardwareInspection {
  brandModel: string;
  registerType: string;
  registerBreakdown: string;
  serialOrBarcode: string;
  electricalSpecs: string;
  isBlankUnpoweredLcd?: boolean;
}

export interface OcrOptions {
  onProgress?: (pct: number) => void;
  targetSlot?: 'prev' | 'curr';
  usePsm?: string;
}

export interface OcrScanResult {
  reading: number | null;
  readingValue: string;
  rawText: string;
  confidence: number;
  processedImageDataUrl: string;
  fullResUrl: string;
  registerCropDataUrl: string;
  roiCropUrl: string;
  isAuthentic: boolean;
  needsVerification?: boolean;
  unclearReason?: string;
  inspection?: SubMeterHardwareInspection;
}

export type SubMeterOcrResult = OcrScanResult;

interface CropBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface MediaDimensions {
  width: number;
  height: number;
}

function getSourceDimensions(
  src: HTMLImageElement | HTMLCanvasElement | HTMLVideoElement
): MediaDimensions {
  if (src instanceof HTMLVideoElement) {
    return {
      width: src.videoWidth || 1280,
      height: src.videoHeight || 720,
    };
  }
  if (src instanceof HTMLImageElement) {
    return {
      width: src.naturalWidth || src.width || 1280,
      height: src.naturalHeight || src.height || 720,
    };
  }
  return {
    width: src.width || 1280,
    height: src.height || 720,
  };
}

/**
 * Normalizes huge camera images (e.g., 12MP–48MP mobile uploads) down to a bounded
 * working canvas (maxEdge px) to prevent mobile WebView memory spikes and timeouts
 * while preserving full legibility for small photos.
 */
function createBoundedWorkingCanvas(
  src: HTMLImageElement | HTMLCanvasElement | HTMLVideoElement,
  maxEdge = 1600
): HTMLCanvasElement | null {
  const { width, height } = getSourceDimensions(src);
  if (width <= 0 || height <= 0) return null;

  const scale = Math.min(1, maxEdge / Math.max(width, height));
  const outW = Math.max(32, Math.round(width * scale));
  const outH = Math.max(32, Math.round(height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, 0, 0, outW, outH);
  return canvas;
}

/**
 * Automatically locates the sub-meter register window (cyclometer drum strip or LCD screen)
 * across both wide desktop photos and close-up mobile captures, refining both vertical row bounds
 * and horizontal digit span so header text is excluded and tenths digits are never clipped.
 */
function detectRegisterCropBox(
  img: HTMLImageElement | HTMLCanvasElement
): CropBox {
  const { width: w, height: h } = getSourceDimensions(img);
  const canvas = document.createElement('canvas');
  const sw = 200;
  const sh = 200;
  canvas.width = sw;
  canvas.height = sh;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return { x: 0.14, y: 0.2, w: 0.72, h: 0.18 };

  ctx.drawImage(img, 0, 0, w, h, 0, 0, sw, sh);
  const { data } = ctx.getImageData(0, 0, sw, sh);

  // Build per-row & per-column horizontal contrast maps
  const rowContrast = new Float32Array(sh);
  const rowRedAccent = new Float32Array(sh);

  for (let y = 0; y < sh; y++) {
    let contrast = 0;
    let redHits = 0;
    for (let x = Math.floor(sw * 0.08); x < Math.floor(sw * 0.92) - 1; x++) {
      const idx = (y * sw + x) * 4;
      const nextIdx = (y * sw + x + 1) * 4;
      const lum1 = data[idx] * 0.3 + data[idx + 1] * 0.59 + data[idx + 2] * 0.11;
      const lum2 =
        data[nextIdx] * 0.3 + data[nextIdx + 1] * 0.59 + data[nextIdx + 2] * 0.11;
      const diff = Math.abs(lum1 - lum2);
      if (diff > 10) contrast += diff;

      if (x > sw * 0.45 && data[idx] > 110 && data[idx] - Math.max(data[idx + 1], data[idx + 2]) > 26) {
        redHits++;
      }
    }
    rowContrast[y] = contrast;
    rowRedAccent[y] = redHits;
  }

  // Scan broad vertical window (y0 = 0.08..0.72) to support zoomed-out photos AND mobile center-framed snaps
  const bandH = Math.max(18, Math.floor(sh * 0.14));
  let bestRowStart = Math.floor(sh * 0.18);
  let bestScore = -1;

  for (let y0 = Math.floor(sh * 0.08); y0 <= Math.floor(sh * 0.72); y0 += 2) {
    let bandContrast = 0;
    let bandRed = 0;
    const yEnd = Math.min(sh, y0 + bandH);
    for (let y = y0; y < yEnd; y++) {
      bandContrast += rowContrast[y];
      bandRed += rowRedAccent[y];
    }
    const centerBias = 1 - Math.abs(y0 / sh - 0.34) * 0.22;
    const score = (bandContrast + bandRed * 24) * centerBias;
    if (score > bestScore) {
      bestScore = score;
      bestRowStart = y0;
    }
  }

  // Refine vertical row bounds around peak digit activity so small header labels above aren't included
  const winTop = Math.max(0, bestRowStart - 4);
  const winBot = Math.min(sh - 1, bestRowStart + bandH + 4);
  let peakRowContrast = 1;
  for (let y = winTop; y <= winBot; y++) {
    if (rowContrast[y] > peakRowContrast) peakRowContrast = rowContrast[y];
  }

  let activeTop = bestRowStart;
  let activeBot = Math.min(sh - 1, bestRowStart + bandH);
  const rowThreshold = peakRowContrast * 0.34;
  while (activeTop < activeBot && rowContrast[activeTop] < rowThreshold) activeTop++;
  while (activeBot > activeTop && rowContrast[activeBot] < rowThreshold) activeBot--;

  // Refine horizontal span within the localized digit strip so edge digits (e.g. .7) are never cut off
  const colActivity = new Float32Array(sw);
  let maxColAct = 1;
  for (let x = 2; x < sw - 2; x++) {
    let act = 0;
    for (let y = activeTop; y <= activeBot; y++) {
      const idx = (y * sw + x) * 4;
      const nextIdx = (y * sw + x + 1) * 4;
      const lum1 = data[idx] * 0.3 + data[idx + 1] * 0.59 + data[idx + 2] * 0.11;
      const lum2 =
        data[nextIdx] * 0.3 + data[nextIdx + 1] * 0.59 + data[nextIdx + 2] * 0.11;
      act += Math.abs(lum1 - lum2);
      if (data[idx] > 110 && data[idx] - Math.max(data[idx + 1], data[idx + 2]) > 26) {
        act += 20;
      }
    }
    colActivity[x] = act;
    if (act > maxColAct) maxColAct = act;
  }

  let leftCol = Math.floor(sw * 0.06);
  let rightCol = Math.floor(sw * 0.94);
  const colThreshold = maxColAct * 0.18;
  while (leftCol < Math.floor(sw * 0.45) && colActivity[leftCol] < colThreshold) leftCol++;
  while (rightCol > Math.floor(sw * 0.55) && colActivity[rightCol] < colThreshold) rightCol--;

  const padX = 0.06;
  const padY = 0.02;
  const normX = Math.max(0.04, leftCol / sw - padX);
  const normRight = Math.min(0.96, rightCol / sw + padX);
  const normW = Math.min(0.92, Math.max(0.46, normRight - normX));

  const normY = Math.max(0.05, activeTop / sh - padY);
  const rawH = (activeBot - activeTop + 1) / sh + padY * 2;
  const normH = Math.max(0.11, Math.min(0.24, rawH));

  return {
    x: normX,
    y: Math.min(0.84 - normH, normY),
    w: normW,
    h: normH,
  };
}

/**
 * Builds a zoomed-in, verified cropped screenshot of the sub-meter register value itself
 * directly from the uploaded/captured photo, with a clean verification header bar.
 */
export function buildVerifiedValueCropScreenshot(
  img: HTMLImageElement | HTMLCanvasElement | HTMLVideoElement,
  cropBox: CropBox,
  readingValue: number | null,
  label = 'VERIFIED REGISTER VALUE'
): string {
  const { width: srcW, height: srcH } = getSourceDimensions(img);

  const sx = Math.max(0, Math.floor(srcW * cropBox.x));
  const sy = Math.max(0, Math.floor(srcH * cropBox.y));
  const sw = Math.max(48, Math.min(srcW - sx, Math.floor(srcW * cropBox.w)));
  const sh = Math.max(28, Math.min(srcH - sy, Math.floor(srcH * cropBox.h)));

  // Generate 2x crisp high-definition crop (1040x400)
  const outW = 1040;
  const headerH = 68;
  const imgAreaH = 332;
  const outH = headerH + imgAreaH;

  const canvas = document.createElement('canvas');
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  ctx.fillStyle = '#090d16';
  ctx.fillRect(0, 0, outW, outH);

  // Draw the zoomed register crop at ultra-high quality
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, sx, sy, sw, sh, 8, headerH + 8, outW - 16, imgAreaH - 16);

  // Highlight frame around the register digits
  ctx.strokeStyle = '#f59e0b';
  ctx.lineWidth = 4;
  ctx.strokeRect(8, headerH + 8, outW - 16, imgAreaH - 16);

  // Target reticle ticks in corners
  ctx.strokeStyle = '#10b981';
  ctx.lineWidth = 5;
  const rLeft = 32;
  const rTop = headerH + 28;
  const rRight = outW - 32;
  const rBottom = outH - 28;
  const tick = 28;

  ctx.beginPath();
  ctx.moveTo(rLeft, rTop + tick);
  ctx.lineTo(rLeft, rTop);
  ctx.lineTo(rLeft + tick, rTop);
  ctx.moveTo(rRight - tick, rTop);
  ctx.lineTo(rRight, rTop);
  ctx.lineTo(rRight, rTop + tick);
  ctx.moveTo(rLeft, rBottom - tick);
  ctx.lineTo(rLeft, rBottom);
  ctx.lineTo(rLeft + tick, rBottom);
  ctx.moveTo(rRight - tick, rBottom);
  ctx.lineTo(rRight, rBottom);
  ctx.lineTo(rRight, rBottom - tick);
  ctx.stroke();

  // Top verification bar
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 0, outW, headerH);

  ctx.fillStyle = '#10b981';
  ctx.font = 'bold 24px Inter, -apple-system, BlinkMacSystemFont, Arial, sans-serif';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillText(`✓ ${label}`, 24, headerH / 2 + 2);

  if (readingValue !== null && !Number.isNaN(readingValue)) {
    ctx.fillStyle = '#fbbf24';
    ctx.font = 'bold 28px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';
    ctx.textAlign = 'right';
    ctx.fillText(`${readingValue.toFixed(1)} kWh`, outW - 24, headerH / 2 + 2);
  }

  return canvas.toDataURL('image/jpeg', 0.98);
}

/**
 * Generates a cropped register value graphic when a reading is set manually or initialized.
 */
export function generateSimulatedValueCropDataUrl(readingValue: number): string {
  const fullUrl = generateSimulatedSubMeterDataUrl(readingValue);
  const canvas = document.createElement('canvas');
  canvas.width = 1040;
  canvas.height = 340;
  const ctx = canvas.getContext('2d');
  if (!ctx) return fullUrl;

  const safeVal = Math.max(0, Number(readingValue) || 0);
  const intPart = Math.floor(safeVal).toString().padStart(5, '0').slice(-5);
  const decPart = Math.round((safeVal - Math.floor(safeVal)) * 10)
    .toString()
    .slice(0, 1);

  ctx.fillStyle = '#090d16';
  ctx.fillRect(0, 0, 1040, 340);

  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 0, 1040, 64);
  ctx.fillStyle = '#10b981';
  ctx.font = 'bold 24px Inter, Arial, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText('✓ REGISTER VALUE CROP (HIGH DEFINITION)', 24, 32);

  ctx.fillStyle = '#fbbf24';
  ctx.font = 'bold 28px monospace';
  ctx.textAlign = 'right';
  ctx.fillText(`${safeVal.toFixed(1)} kWh`, 1016, 32);

  const startX = 92;
  const drumW = 132;
  const drumH = 192;
  const drumY = 100;

  for (let i = 0; i < 6; i++) {
    const isRedTenths = i === 5;
    const x = startX + i * (drumW + 14);
    ctx.fillStyle = isRedTenths ? '#dc2626' : '#111827';
    ctx.fillRect(x, drumY, drumW, drumH);
    ctx.strokeStyle = isRedTenths ? '#f87171' : '#475569';
    ctx.lineWidth = 4;
    ctx.strokeRect(x, drumY, drumW, drumH);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 100px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const digit = isRedTenths ? decPart : intPart[i];
    ctx.fillText(digit, x + drumW / 2, drumY + drumH / 2 + 4);
  }

  ctx.strokeStyle = '#f59e0b';
  ctx.lineWidth = 4;
  ctx.strokeRect(4, 68, 1032, 268);

  return canvas.toDataURL('image/png');
}

interface OfflineWindowAnalysis {
  reading: number | null;
  confidence: number;
  hasRegisterStructure: boolean;
  inspection: SubMeterHardwareInspection;
}

/**
 * Local 100% Offline Register Window Analyzer Fallback:
 * Inspects the cropped register window directly on Canvas to verify cyclometer / LCD
 * sub-meter hardware features and extract unambiguous readings without fabricating digits.
 */
function analyzeRegisterWindowOffline(
  img: HTMLImageElement | HTMLCanvasElement,
  cropBox: CropBox
): OfflineWindowAnalysis {
  const { width: w, height: h } = getSourceDimensions(img);
  const sx = Math.max(0, Math.floor(w * cropBox.x));
  const sy = Math.max(0, Math.floor(h * cropBox.y));
  const sw = Math.max(48, Math.min(w - sx, Math.floor(w * cropBox.w)));
  const sh = Math.max(24, Math.min(h - sy, Math.floor(h * cropBox.h)));

  const canvas = document.createElement('canvas');
  canvas.width = 240;
  canvas.height = 80;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    return {
      reading: null,
      confidence: 0,
      hasRegisterStructure: false,
      inspection: {
        brandModel: 'Electric Sub-Meter',
        registerType: 'Register Window Scan',
        registerBreakdown: 'Could not auto-detect digits. Please verify from close-up photo.',
        serialOrBarcode: 'Faceplate Serial Excluded',
        electricalSpecs: '220-240V • 60Hz',
      },
    };
  }

  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, 240, 80);
  const { data } = ctx.getImageData(0, 0, 240, 80);

  // Check luminance variance, red tenths accent, dark drums, and sharp horizontal digit transitions
  let lumSum = 0;
  let lumSqSum = 0;
  let redRightPixels = 0;
  let redLeftPixels = 0;
  let darkDrumsCount = 0;
  let digitTransitions = 0;

  for (let y = 12; y < 68; y++) {
    let prevLum = -1;
    for (let x = 16; x < 224; x++) {
      const idx = (y * 240 + x) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const lum = r * 0.299 + g * 0.587 + b * 0.114;
      lumSum += lum;
      lumSqSum += lum * lum;
      if (prevLum >= 0 && Math.abs(lum - prevLum) > 28) {
        digitTransitions++;
      }
      prevLum = lum;

      const isRed = r > 110 && r - Math.max(g, b) > 26;
      if (isRed) {
        if (x > 165) {
          redRightPixels++;
        } else if (x < 150) {
          redLeftPixels++;
        }
      } else if (x < 165 && lum < 80) {
        darkDrumsCount++;
      }
    }
  }

  const sampleCount = (68 - 12) * (224 - 16);
  const meanLum = lumSum / sampleCount;
  const variance = Math.max(0, lumSqSum / sampleCount - meanLum * meanLum);
  const stdDev = Math.sqrt(variance);

  const isCyclometerDrums =
    redRightPixels >= 25 &&
    redRightPixels > redLeftPixels * 1.6 &&
    darkDrumsCount > 180;

  const isStructuredLcdRegister =
    stdDev > 20 &&
    digitTransitions > 180 &&
    (redRightPixels >= 18 || (meanLum >= 60 && meanLum <= 210));

  // Unpowered LCD has low variance within mid-tone grey/green glass bounds (not pure white or pitch black)
  if (stdDev < 14 && redRightPixels < 25 && meanLum >= 45 && meanLum <= 170) {
    return {
      reading: 0.0,
      confidence: 96,
      hasRegisterStructure: true,
      inspection: {
        brandModel: 'Digital LCD Sub-Meter',
        registerType: 'Digital LCD Register (Blank / Unpowered)',
        registerBreakdown: 'LCD Display Off/Zero → 0.0 kWh (Verified)',
        serialOrBarcode: 'Faceplate Serial Excluded',
        electricalSpecs: '240V • 60Hz Sub-Meter',
        isBlankUnpoweredLcd: true,
      },
    };
  }

  return {
    reading: null,
    confidence: 0,
    hasRegisterStructure: isCyclometerDrums || isStructuredLcdRegister,
    inspection: {
      brandModel: isCyclometerDrums
        ? 'Mechanical Cyclometer kWh Sub-Meter'
        : isStructuredLcdRegister
        ? 'Digital LCD kWh Sub-Meter'
        : 'Unrecognized Device (Not an Electric Sub-Meter)',
      registerType: isCyclometerDrums
        ? 'Sub-Meter Cyclometer Dial Scan (Manual Verification Required)'
        : isStructuredLcdRegister
        ? 'Digital Register Window (Manual Verification Required)'
        : 'Non-Sub-Meter Object Detected',
      registerBreakdown:
        isCyclometerDrums || isStructuredLcdRegister
          ? 'Sub-meter register detected, but digits were ambiguous. Please verify reading from close-up photo.'
          : 'No electric sub-meter cyclometer dials or kWh display found in this image.',
      serialOrBarcode: 'Faceplate Serial Excluded',
      electricalSpecs:
        isCyclometerDrums || isStructuredLcdRegister
          ? '220-240V • 60Hz Single-Phase'
          : 'N/A',
    },
  };
}

/**
 * Preserves the full sensor resolution and sharpness of the sub-meter photo.
 * Eliminates forced 960px downscaling, ensuring full 1080p, 4K, 12MP/48MP clarity.
 */
export function preprocessMeterImage(
  sourceCanvasOrImg: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement,
  cropRatio = { x: 0, y: 0, w: 1, h: 1 }
): string {
  const { width: srcWidth, height: srcHeight } = getSourceDimensions(sourceCanvasOrImg);

  const sx = Math.max(0, Math.floor(srcWidth * cropRatio.x));
  const sy = Math.max(0, Math.floor(srcHeight * cropRatio.y));
  const sw = Math.max(64, Math.floor(srcWidth * cropRatio.w));
  const sh = Math.max(32, Math.floor(srcHeight * cropRatio.h));

  // If full image and already an HTMLImageElement with data URL, preserve pristine source directly
  if (
    cropRatio.x === 0 &&
    cropRatio.y === 0 &&
    cropRatio.w === 1 &&
    cropRatio.h === 1 &&
    sourceCanvasOrImg instanceof HTMLImageElement &&
    sourceCanvasOrImg.src &&
    sourceCanvasOrImg.src.startsWith('data:')
  ) {
    return sourceCanvasOrImg.src;
  }

  // Preserve full capture resolution without forced downscaling
  const outCanvas = document.createElement('canvas');
  outCanvas.width = sw;
  outCanvas.height = sh;

  const ctx = outCanvas.getContext('2d');
  if (!ctx) return '';

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(
    sourceCanvasOrImg,
    sx,
    sy,
    sw,
    sh,
    0,
    0,
    outCanvas.width,
    outCanvas.height
  );

  return outCanvas.toDataURL('image/jpeg', 0.96);
}

/**
 * Computes the optimal Otsu binarization threshold to maximize inter-class luminance variance.
 */
function computeOtsuThreshold(grayData: Uint8Array, total: number): number {
  const histogram = new Int32Array(256);
  for (let i = 0; i < total; i++) {
    histogram[grayData[i]]++;
  }
  let sumAll = 0;
  for (let t = 0; t < 256; t++) {
    sumAll += t * histogram[t];
  }

  let sumB = 0;
  let wB = 0;
  let maxVariance = 0;
  let bestThreshold = 128;

  for (let t = 0; t < 256; t++) {
    wB += histogram[t];
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;

    sumB += t * histogram[t];
    const mB = sumB / wB;
    const mF = (sumAll - sumB) / wF;
    const varBetween = wB * wF * (mB - mF) * (mB - mF);

    if (varBetween > maxVariance) {
      maxVariance = varBetween;
      bestThreshold = t;
    }
  }

  return bestThreshold;
}

function computeHistogramPercentile(
  histogram: Int32Array,
  total: number,
  fraction: number
): number {
  const target = total * fraction;
  let acc = 0;
  for (let i = 0; i < 256; i++) {
    acc += histogram[i];
    if (acc >= target) return i;
  }
  return 255;
}

function expandCropBox(box: CropBox, padX: number, padY: number): CropBox {
  const x = Math.max(0, box.x - padX);
  const y = Math.max(0, box.y - padY);
  const right = Math.min(1, box.x + box.w + padX);
  const bottom = Math.min(1, box.y + box.h + padY);
  return {
    x,
    y,
    w: Math.max(0.1, right - x),
    h: Math.max(0.08, bottom - y),
  };
}

/**
 * Renders a normalized, quiet-bordered OCR image variant for the cropped register window.
 * Preserves dark-digit contrast inside red tenths boxes via red-channel blending and avoids
 * destructive polarity flips on backlit/silver LCD meters.
 */
function buildOcrVariantUrl(
  img: HTMLImageElement | HTMLCanvasElement,
  cropBox: CropBox,
  options: { forceInvert?: boolean; applyOtsu?: boolean } = {}
): string {
  const { width: w, height: h } = getSourceDimensions(img);
  const sx = Math.max(0, Math.floor(w * cropBox.x));
  const sy = Math.max(0, Math.floor(h * cropBox.y));
  const sw = Math.max(64, Math.min(w - sx, Math.floor(w * cropBox.w)));
  const sh = Math.max(32, Math.min(h - sy, Math.floor(h * cropBox.h)));

  const innerW = Math.max(960, sw);
  const innerH = Math.max(180, Math.round((innerW * sh) / sw));
  const border = 20;
  const targetW = innerW + border * 2;
  const targetH = innerH + border * 2;

  const canvas = document.createElement('canvas');
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return '';

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, targetW, targetH);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, sx, sy, sw, sh, border, border, innerW, innerH);

  const imgData = ctx.getImageData(border, border, innerW, innerH);
  const data = imgData.data;
  const totalPixels = innerW * innerH;
  const luma = new Float32Array(totalPixels);
  const histogram = new Int32Array(256);

  for (let i = 0; i < totalPixels; i++) {
    const idx = i * 4;
    const r = data[idx];
    const g = data[idx + 1];
    const b = data[idx + 2];
    const baseLum = 0.299 * r + 0.587 * g + 0.114 * b;
    // Keep black/dark digits inside red tenths frames legible by lifting pure red background luminance
    const isRedTint = r > 105 && r - Math.max(g, b) > 26;
    const blendedLum = isRedTint ? Math.max(baseLum, 0.72 * r + 0.25 * g) : baseLum;
    luma[i] = blendedLum;
    histogram[Math.min(255, Math.max(0, Math.round(blendedLum)))]++;
  }

  const p2 = computeHistogramPercentile(histogram, totalPixels, 0.02);
  const median = computeHistogramPercentile(histogram, totalPixels, 0.5);
  const p98 = computeHistogramPercentile(histogram, totalPixels, 0.98);
  const range = Math.max(24, p98 - p2);

  // Only invert automatically for true dark cyclometer drums (white digits on black background)
  const autoDarkDrum = median < 105 && p98 - median > 45;
  const shouldInvert = options.forceInvert ? !autoDarkDrum : autoDarkDrum;
  const grayData = new Uint8Array(totalPixels);

  for (let i = 0; i < totalPixels; i++) {
    const stretched = Math.min(255, Math.max(0, ((luma[i] - p2) / range) * 255));
    grayData[i] = Math.round(shouldInvert ? 255 - stretched : stretched);
  }

  const otsu = options.applyOtsu ? computeOtsuThreshold(grayData, totalPixels) : -1;
  for (let i = 0; i < totalPixels; i++) {
    const idx = i * 4;
    let outVal = grayData[i];
    if (options.applyOtsu) {
      outVal =
        outVal < otsu - 10
          ? 0
          : outVal > otsu + 10
          ? 255
          : Math.round(((outVal - (otsu - 10)) / 20) * 255);
    }
    data[idx] = outVal;
    data[idx + 1] = outVal;
    data[idx + 2] = outVal;
  }

  ctx.putImageData(imgData, border, border);
  return canvas.toDataURL('image/png');
}

function loadImageElement(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = (err) => reject(err);
    img.src = dataUrl;
  });
}

// Persistent shared Tesseract worker to avoid mobile cold-start/WASM reload timeouts on every pass
let sharedWorkerPromise: Promise<Tesseract.Worker> | null = null;
let workerQueue: Promise<unknown> = Promise.resolve();
let activeProgressCallback: ((pct: number) => void) | undefined;

async function getSharedTesseractWorker(): Promise<Tesseract.Worker> {
  if (!sharedWorkerPromise) {
    sharedWorkerPromise = Promise.race([
      Tesseract.createWorker('eng', 1, {
        logger: (m: any) => {
          if (m.status === 'recognizing text' && activeProgressCallback) {
            activeProgressCallback(
              Math.min(94, 45 + Math.round((m.progress || 0) * 50))
            );
          }
        },
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Tesseract worker init timeout')), 28000)
      ),
    ]).catch((err) => {
      sharedWorkerPromise = null;
      throw err;
    });
  }
  return sharedWorkerPromise;
}

function runTesseractPass(
  url: string,
  psmMode: string,
  whitelist: string,
  timeoutMs: number,
  onProgress?: (pct: number) => void
): Promise<{ text: string; confidence: number } | null> {
  const execPass = async (): Promise<{ text: string; confidence: number } | null> => {
    activeProgressCallback = onProgress;
    let timedOut = false;
    let timerId: ReturnType<typeof setTimeout> | undefined;
    const workerPromise = getSharedTesseractWorker();

    const recognizePromise = (async () => {
      const worker = await workerPromise;
      if (timedOut) return null;
      await worker.setParameters({
        tessedit_char_whitelist: whitelist,
        tessedit_pageseg_mode: psmMode as any,
      });
      if (timedOut) return null;
      const res = await worker.recognize(url);
      if (timedOut || !res?.data) return null;
      return {
        text: res.data.text || '',
        confidence: Math.round(res.data.confidence || 0),
      };
    })();

    try {
      const timeoutPromise = new Promise<'TIMEOUT'>((resolve) => {
        timerId = setTimeout(() => {
          timedOut = true;
          resolve('TIMEOUT');
        }, timeoutMs);
      });
      const raceResult = await Promise.race([recognizePromise, timeoutPromise]);
      if (raceResult === 'TIMEOUT') {
        // Terminate and reset any wedged/in-flight worker so the next queued pass never collides with it
        if (sharedWorkerPromise === workerPromise) {
          sharedWorkerPromise = null;
        }
        workerPromise
          .then((w) => {
            const candidate = w as unknown as { terminate?: () => Promise<unknown> };
            if (candidate && typeof candidate.terminate === 'function') {
              return candidate.terminate();
            }
            return undefined;
          })
          .catch(() => undefined);
        return null;
      }
      return raceResult;
    } catch {
      if (sharedWorkerPromise === workerPromise) {
        sharedWorkerPromise = null;
      }
      return null;
    } finally {
      if (timerId !== undefined) clearTimeout(timerId);
      activeProgressCallback = undefined;
    }
  };

  const next = workerQueue.then(execPass, execPass);
  workerQueue = next.catch(() => undefined);
  return next;
}

const SUBMETER_KEYWORD_REGEX =
  /(?:kwh|kw[\.·\-]?h|watthour|watt[\s-]hour|meter|imp[\s/]*kwh|\b220\s*v\b|\b240\s*v\b|\b120\s*v\b|\b60\s*hz\b|\b50\s*hz\b|single[\s-]phase|1[\s-]phase|1phase|\b10\(60\)a\b|\b5\(30\)a\b|safari|voschtech|dds1288|q&y|qy-?169|cirtech|type[\s-]sp1|sub[\s-]?meter|ge\s*kv2c)/i;

function detectBrandMetadata(
  rawText: string,
  isCyclometer: boolean
): { brandModel: string; electricalSpecs: string; serialOrBarcode: string } {
  let brandModel = isCyclometer
    ? 'Mechanical Cyclometer kWh Sub-Meter'
    : 'Digital LCD kWh Sub-Meter';
  let electricalSpecs = '220–240V • 60Hz Sub-Meter';
  let serialOrBarcode = 'Faceplate Serial Excluded';

  if (/voschtech|dds1288/i.test(rawText)) {
    brandModel = 'Voschtech DDS1288 Static kWh Meter';
    electricalSpecs = '240V • 10(60)A • 1Phase • 60Hz';
  } else if (/q&y|qy-?169|anti-?theft/i.test(rawText)) {
    brandModel = 'Q&Y i-Series QY-169 LCD Meter';
    electricalSpecs = '240V • 10(60)A • 1Phase • 60Hz';
  } else if (/safari|sy-?168/i.test(rawText)) {
    brandModel = isCyclometer
      ? 'Safari SY-168 Electronic kWh Meter'
      : 'Safari SY-168 Digital Kilowatt Hour Meter';
    electricalSpecs = '240V • 10(60)A • 1Phase • 60Hz';
  } else if (/static|sp1|type-?sp1/i.test(rawText)) {
    brandModel = 'Static Watthour Meter TYPE-SP1';
    electricalSpecs = '240V • 5-30A • 50Hz • 3200 imp/kWh';
  } else if (/cirtech|mt-?60i|cl-?60/i.test(rawText)) {
    brandModel = 'Cirtech MT-60i Digital Sub-Meter';
    electricalSpecs = '240V • 10(60)A • 60Hz • 1600 imp/kWh';
  }

  const serialMatch = rawText.match(
    /\b(?:no\.?|s\.?\s*no|serial)\s*[:#-]?\s*([A-Z0-9\-]+)/i
  );
  if (serialMatch) {
    serialOrBarcode = `No. ${serialMatch[1]} (Excluded)`;
  }

  return { brandModel, electricalSpecs, serialOrBarcode };
}

function parseSpacedRegisterText(
  rawText: string,
  expectedDigits?: number
): { value: number | null; digitCount: number } {
  const cleaned = rawText
    .replace(/[OoQq]/g, '0')
    .replace(/[Il|!]/g, '1')
    .replace(/[Ss]/g, '5')
    .replace(/[Bb]/g, '8')
    .replace(/,/g, '.')
    .replace(/\s+/g, '');

  const dotMatch = cleaned.match(/(\d{4,6})\.(\d)/);
  if (dotMatch) {
    const val = parseFloat(`${dotMatch[1]}.${dotMatch[2]}`);
    if (!Number.isNaN(val) && val >= 0 && val < 999999) {
      return {
        value: Math.round(val * 10) / 10,
        digitCount: dotMatch[1].length + 1,
      };
    }
  }

  const digitsOnly = cleaned.replace(/[^\d]/g, '');
  if (
    expectedDigits &&
    digitsOnly.length === expectedDigits &&
    digitsOnly.length >= 5
  ) {
    const intPart = parseInt(digitsOnly.slice(0, -1), 10);
    const decPart = parseInt(digitsOnly.slice(-1), 10);
    return {
      value: Math.round((intPart + decPart / 10) * 10) / 10,
      digitCount: digitsOnly.length,
    };
  }

  // Never let a dropped or extra glyph (e.g. 7-digit hallucination when 6 drums expected) slip through!
  if (expectedDigits && digitsOnly.length !== expectedDigits) {
    return { value: null, digitCount: digitsOnly.length };
  }

  if (digitsOnly.length === 7 || digitsOnly.length === 6) {
    const intPart = parseInt(digitsOnly.slice(0, -1), 10);
    const decPart = parseInt(digitsOnly.slice(-1), 10);
    return {
      value: Math.round((intPart + decPart / 10) * 10) / 10,
      digitCount: digitsOnly.length,
    };
  }

  return { value: extractMeterDigitsFromOcrText(rawText), digitCount: digitsOnly.length };
}

/**
 * Multi-Stage Sub-Meter Visual Inspector, Value Cropper & Auto-Reader:
 * 1. Normalizes oversized mobile camera uploads to prevent WebView OOM/hangs.
 * 2. Locates & deskews physical cyclometer drums or LCD glass using visual invariants.
 * 3. Decodes 7-segment LCDs structurally + verifies against persistent-worker Tesseract.
 * 4. Isolates per-drum cyclometer glyphs + ensembles spaced/enhanced Tesseract passes.
 * 5. Flags mid-rollover or low-margin readings for verification instead of guessing.
 */
export async function recognizeSubMeterReading(
  imageDataUrl: string,
  optionsOrProgress?: ((pct: number) => void) | OcrOptions
): Promise<OcrScanResult> {
  const onProgress =
    typeof optionsOrProgress === 'function'
      ? optionsOrProgress
      : optionsOrProgress?.onProgress;

  try {
    if (onProgress) onProgress(15);
    const img = await loadImageElement(imageDataUrl);
    const preservedColorUrl = preprocessMeterImage(img, { x: 0, y: 0, w: 1, h: 1 });
    const workingCanvas = createBoundedWorkingCanvas(img, 1400);
    const workingSource: HTMLImageElement | HTMLCanvasElement = workingCanvas || img;
    const workingDataUrl = workingCanvas
      ? workingCanvas.toDataURL('image/jpeg', 0.93)
      : preservedColorUrl || imageDataUrl;

    if (onProgress) onProgress(30);

    // Stage 1: Physical Computer-Vision Register Localization + Structural Decode
    const vision: VisionReadResult | null = analyzeSubMeterVision(workingSource);
    const detectedCropBox = vision?.cropBox || detectRegisterCropBox(workingSource);
    const offlineAnalysis = analyzeRegisterWindowOffline(workingSource, detectedCropBox);

    let reading: number | null = null;
    let rawText = '';
    let contextText = '';
    let confidence = 0;
    let needsVerification = false;
    let unclearReason: string | undefined;

    const isOnline = typeof navigator === 'undefined' || navigator.onLine !== false;

    if (vision?.kind === 'lcd') {
      // Primary: Geometric 7-segment decoder (resilient to shadows, glare, hooked-7, slant)
      reading = vision.reading;
      confidence = vision.confidence;
      needsVerification = vision.needsVerification;
      unclearReason = vision.unclearReason;
      rawText = vision.debugInfo;

      // Fast consensus verification on cleaned deskewed spaced strip
      if (isOnline && vision.tesseractStripUrl) {
        const res = await runTesseractPass(
          vision.tesseractStripUrl,
          Tesseract.PSM.SINGLE_LINE,
          '0123456789.',
          7000,
          onProgress
        );
        if (res?.text) {
          contextText = `${res.text}`.trim();
          const parsed = parseSpacedRegisterText(res.text);
          if (parsed.value !== null && reading !== null && Math.abs(parsed.value - reading) < 0.05) {
            confidence = Math.max(confidence, 96);
          } else if (reading === null && parsed.value !== null && parsed.digitCount >= 6) {
            reading = parsed.value;
            confidence = Math.min(82, res.confidence);
            needsVerification = true;
            unclearReason = '7-segment layout low contrast — verify kWh';
          }
        }
      }
    } else if (vision?.kind === 'cyclometer') {
      needsVerification = vision.needsVerification;
      unclearReason = vision.unclearReason;

      let stripVal: { value: number | null; conf: number; count: number; text: string } = {
        value: null,
        conf: 0,
        count: 0,
        text: '',
      };
      let enhVal: { value: number | null; conf: number; count: number; text: string } = {
        value: null,
        conf: 0,
        count: 0,
        text: '',
      };
      let cellVal: {
        value: number | null;
        avgConf: number;
        minConf: number;
        digits: string;
        confs: number[];
      } = {
        value: null,
        avgConf: 0,
        minConf: 0,
        digits: '',
        confs: [],
      };
      let cellChars: string[] = ['', '', '', '', '', ''];
      let cellConfs: number[] = [0, 0, 0, 0, 0, 0];
      let blackIntVal: { intStr: string | null; conf: number; raw: string } = {
        intStr: null,
        conf: 0,
        raw: '',
      };

      const extractFiveIntDigits = (rawTextStr: string, digitCount: number): string | null => {
        const clean = rawTextStr.replace(/\s+/g, '');
        const digitsOnly = clean.replace(/[^\d]/g, '');
        if (digitCount === 6 && digitsOnly.length === 6) return digitsOnly.slice(0, 5);
        const dotIdx = clean.indexOf('.');
        if (dotIdx > 0) {
          const leftDigits = clean.slice(0, dotIdx).replace(/[^\d]/g, '');
          if (leftDigits.length === 5) return leftDigits;
        }
        return null;
      };

      if (isOnline) {
        // Pass 1: Clean isolated 6-drum black-on-white strip with explicit decimal point
        const res1 = await runTesseractPass(
          vision.tesseractStripUrl,
          Tesseract.PSM.SINGLE_LINE,
          '0123456789.',
          8000,
          onProgress
        );
        if (res1?.text) {
          const parsed1 = parseSpacedRegisterText(res1.text, 6);
          stripVal = {
            value: parsed1.value,
            conf: res1.confidence,
            count: parsed1.digitCount,
            text: res1.text.trim(),
          };
          contextText = `strip=${res1.text.trim()}(${res1.confidence})`;
        }

        // Pass 1b: 1-to-1 per-drum SINGLE_WORD verification with SINGLE_CHAR fallback
        if (vision.cellImageUrls && vision.cellImageUrls.length === 6) {
          const chars: string[] = [];
          const confs: number[] = [];
          for (let ci = 0; ci < 6; ci++) {
            const parseCellText = (txt: string | undefined): string => {
              const isNarrow = (vision.cellAspectRatios?.[ci] ?? 1) < 0.48;
              const rawCell = (txt || '').replace(/[Oo]/g, '0');
              const normalized = (isNarrow ? rawCell.replace(/[lI]/g, '1') : rawCell).replace(/[^\d]/g, '');
              return normalized.length === 1 ? normalized[0] : '';
            };
            const cRes = await runTesseractPass(
              vision.cellImageUrls[ci],
              Tesseract.PSM.SINGLE_WORD,
              '0123456789OolI',
              5000,
              onProgress
            );
            let cDigit = parseCellText(cRes?.text);
            let cConf = cDigit ? Math.round(cRes?.confidence || 0) : 0;
            if (!cDigit) {
              const scRes = await runTesseractPass(
                vision.cellImageUrls[ci],
                Tesseract.PSM.SINGLE_CHAR,
                '0123456789OolI',
                4000,
                onProgress
              );
              cDigit = parseCellText(scRes?.text);
              cConf = cDigit ? Math.round(scRes?.confidence || 0) : 0;
            }
            chars.push(cDigit);
            confs.push(cConf);
          }
          cellChars = chars;
          cellConfs = confs;
          if (chars.every((d) => d.length === 1)) {
            const joined = chars.join('');
            const intPart = parseInt(joined.slice(0, 5), 10);
            const decPart = parseInt(joined.slice(5), 10);
            cellVal = {
              value: Math.round((intPart + decPart / 10) * 10) / 10,
              avgConf: Math.round(confs.reduce((a, b) => a + b, 0) / 6),
              minConf: Math.min(...confs),
              digits: joined,
              confs,
            };
            contextText = `${contextText} | cells=${joined}(min=${cellVal.minConf},avg=${cellVal.avgConf})`;
          } else {
            contextText = `${contextText} | cells=${chars.map((c) => c || '?').join('')}`;
          }
        }

        // Pass 2: Clean 5-drum black integer strip + full enhanced crop when Pass 1 and per-cell do not agree
        const passesAgree =
          stripVal.value !== null &&
          cellVal.value !== null &&
          Math.abs(stripVal.value - cellVal.value) < 0.05;
        if (!passesAgree) {
          if (vision.blackStripUrl) {
            const bRes = await runTesseractPass(
              vision.blackStripUrl,
              Tesseract.PSM.SINGLE_LINE,
              '0123456789',
              7000,
              onProgress
            );
            if (bRes?.text) {
              const bDigits = bRes.text.replace(/[^\d]/g, '');
              blackIntVal = {
                intStr: bDigits.length === 5 ? bDigits : null,
                conf: bRes.confidence,
                raw: bRes.text.trim(),
              };
              contextText = `${contextText} | blk=${bRes.text.trim()}(${bRes.confidence})`;
            }
          }
          const res2 = await runTesseractPass(
            vision.enhancedCropUrl,
            Tesseract.PSM.SINGLE_LINE,
            '0123456789.',
            8000,
            onProgress
          );
          if (res2?.text) {
            const parsed2 = parseSpacedRegisterText(res2.text, 6);
            enhVal = {
              value: parsed2.value,
              conf: res2.confidence,
              count: parsed2.digitCount,
              text: res2.text.trim(),
            };
            contextText = `${contextText} | enh=${res2.text.trim()}(${res2.confidence})`;
          }
        }
      }

      const stripInt = extractFiveIntDigits(stripVal.text, stripVal.count);
      const enhInt = extractFiveIntDigits(enhVal.text, enhVal.count);
      const cellInt = cellChars.slice(0, 5).every((d) => d.length === 1)
        ? cellChars.slice(0, 5).join('')
        : null;
      const intVotes = new Map<string, number>();
      for (const candidateInt of [blackIntVal.intStr, stripInt, enhInt, cellInt]) {
        if (candidateInt) intVotes.set(candidateInt, (intVotes.get(candidateInt) || 0) + 1);
      }
      let consensusInt: string | null = null;
      let consensusIntCount = 0;
      for (const [k, v] of intVotes.entries()) {
        if (v > consensusIntCount) {
          consensusInt = k;
          consensusIntCount = v;
        }
      }

      if (
        cellVal.value !== null &&
        stripVal.value !== null &&
        Math.abs(cellVal.value - stripVal.value) < 0.05
      ) {
        reading = cellVal.value;
        confidence = Math.max(cellVal.avgConf, stripVal.conf, 94);
      } else if (
        cellVal.value !== null &&
        enhVal.value !== null &&
        Math.abs(cellVal.value - enhVal.value) < 0.05
      ) {
        reading = cellVal.value;
        confidence = Math.max(cellVal.avgConf, enhVal.conf, 90);
      } else if (
        stripVal.value !== null &&
        enhVal.value !== null &&
        Math.abs(stripVal.value - enhVal.value) < 0.05 &&
        (stripVal.conf >= 45 || enhVal.conf >= 45)
      ) {
        reading = stripVal.value;
        confidence = Math.max(stripVal.conf, enhVal.conf, 90);
      } else if (consensusInt && consensusIntCount >= 2) {
        // Two or more independent OCR views agree on all 5 black integer drums
        const stripDec = stripVal.count === 6 && stripInt === consensusInt ? stripVal.text.replace(/[^\d]/g, '')[5] : '';
        const enhDec = enhVal.count === 6 && enhInt === consensusInt ? enhVal.text.replace(/[^\d]/g, '')[5] : '';
        let cellDec = cellChars[5] || '';
        let cellDecConf = cellConfs[5] || 0;
        // Geometric disambiguation on low-confidence '3' vs '5' in normalized 28x44 drum bitmap
        const bmp5 = vision.cellBitmaps?.[5];
        if (cellDec === '3' && bmp5 && bmp5.length === 28 * 44) {
          const boxDens = (x0: number, x1: number, y0: number, y1: number) => {
            let s = 0;
            let n = 0;
            for (let y = y0; y <= y1; y++) {
              for (let x = x0; x <= x1; x++) {
                s += bmp5[y * 28 + x] ? 1 : 0;
                n++;
              }
            }
            return n > 0 ? s / n : 0;
          };
          const ul = boxDens(2, 11, 10, 19);
          const ur = boxDens(17, 25, 11, 18);
          const lr = boxDens(16, 25, 24, 35);
          if (ul >= 0.45 && ur <= 0.14 && ul - ur >= 0.40 && lr >= 0.30) {
            cellDec = '5';
            cellDecConf = Math.max(cellDecConf, 78);
          }
        }
        const tenthsVotes = new Map<string, number>();
        for (const [d, c] of [
          [stripDec, stripVal.conf],
          [enhDec, enhVal.conf],
          [cellDec, cellDecConf],
        ] as Array<[string, number]>) {
          if (d && c >= 40) tenthsVotes.set(d, (tenthsVotes.get(d) || 0) + 1);
        }
        let bestDec = '';
        let bestDecVotes = 0;
        for (const [d, v] of tenthsVotes.entries()) {
          if (v > bestDecVotes) {
            bestDec = d;
            bestDecVotes = v;
          }
        }
        const intNum = parseInt(consensusInt, 10);
        const tenthsRollover = vision.rolloverPositions.includes(5);
        if (!tenthsRollover && bestDec && bestDecVotes >= 2) {
          reading = Math.round((intNum + parseInt(bestDec, 10) / 10) * 10) / 10;
          confidence = Math.max(84, Math.min(92, Math.round(blackIntVal.conf || 85)));
        } else if (!tenthsRollover && bestDec && (cellDecConf >= 55 || (enhDec === bestDec && enhVal.conf >= 55))) {
          reading = Math.round((intNum + parseInt(bestDec, 10) / 10) * 10) / 10;
          confidence = Math.max(76, Math.min(86, cellDecConf || enhVal.conf || 78));
          // Flag single-source tenths unless confirmed by geometric disambiguation
          if (tenthsVotes.size > 1 || (bestDecVotes < 2 && cellDecConf < 78)) {
            needsVerification = true;
            unclearReason = unclearReason || 'Tenths drum decimal uncertain — verify last digit';
          }
        } else if (tenthsRollover && enhDec && enhVal.conf >= 55) {
          reading = Math.round((intNum + parseInt(enhDec, 10) / 10) * 10) / 10;
          confidence = Math.min(72, enhVal.conf);
          needsVerification = true;
          unclearReason = unclearReason || 'Tenths drum is rolling over between digits — verify kWh';
        } else {
          reading = intNum;
          confidence = Math.max(72, Math.round(blackIntVal.conf || 74));
          needsVerification = true;
          unclearReason =
            unclearReason ||
            (tenthsRollover
              ? `Integer reading confirmed (${intNum} kWh); tenths drum mid-rollover — verify decimal`
              : `Integer reading confirmed (${intNum} kWh); tenths digit unclear — verify decimal`);
        }
      } else if (cellVal.value !== null && stripVal.value !== null && Math.abs(cellVal.value - stripVal.value) <= 0.15) {
        reading = cellVal.avgConf >= stripVal.conf ? cellVal.value : stripVal.value;
        confidence = Math.max(cellVal.avgConf, stripVal.conf);
      } else if (stripVal.count === 6 && stripVal.value !== null && stripVal.conf >= 78 && !blackIntVal.intStr && !enhVal.value) {
        reading = stripVal.value;
        confidence = stripVal.conf;
      } else {
        reading = null;
        confidence = Math.max(stripVal.conf, enhVal.conf, cellVal.avgConf, blackIntVal.conf);
        needsVerification = true;
        unclearReason =
          unclearReason || 'Cyclometer passes did not reach integer consensus — verify kWh';
      }
      rawText = vision.debugInfo;
    } else if (isOnline) {
      // Fallback generic pipeline (meters without blue+red band or inset rectangular bezel)
      const primaryCropUrl = buildOcrVariantUrl(workingSource, detectedCropBox, {
        forceInvert: false,
        applyOtsu: false,
      });
      const passSpecs: Array<{
        getUrl: () => string;
        psm: string;
        whitelist: string;
        timeoutMs: number;
      }> = [
        {
          getUrl: () => primaryCropUrl,
          psm: Tesseract.PSM.SINGLE_LINE,
          whitelist: '0123456789.',
          timeoutMs: 9000,
        },
        {
          getUrl: () =>
            buildOcrVariantUrl(workingSource, detectedCropBox, {
              forceInvert: true,
              applyOtsu: true,
            }),
          psm: Tesseract.PSM.SINGLE_LINE,
          whitelist: '0123456789.',
          timeoutMs: 9000,
        },
        {
          getUrl: () =>
            buildOcrVariantUrl(
              workingSource,
              expandCropBox(detectedCropBox, 0.1, 0.14),
              { forceInvert: false, applyOtsu: false }
            ),
          psm: Tesseract.PSM.AUTO,
          whitelist: '',
          timeoutMs: 9000,
        },
        {
          getUrl: () => workingDataUrl,
          psm: Tesseract.PSM.AUTO,
          whitelist: '',
          timeoutMs: 10000,
        },
      ];

      for (const pass of passSpecs) {
        const url = pass.getUrl();
        if (!url) continue;
        const res = await runTesseractPass(url, pass.psm, pass.whitelist, pass.timeoutMs, onProgress);
        if (!res) continue;
        contextText = `${contextText}\n${res.text}`.trim();
        const extracted = extractMeterDigitsFromOcrText(res.text);
        if (extracted !== null) {
          reading = extracted;
          rawText = res.text;
          confidence = Math.max(confidence, res.confidence);
          if (res.confidence >= 80) break;
        }
      }
      if (reading !== null && confidence < 76) {
        needsVerification = true;
        unclearReason = 'Low OCR confidence — please verify kWh value';
      }
    }

    const combinedText = `${rawText}\n${contextText}`.trim();
    const hasMeterKeywords = SUBMETER_KEYWORD_REGEX.test(combinedText);
    const isCyclometer =
      vision?.kind === 'cyclometer' ||
      offlineAnalysis.inspection?.brandModel?.includes('Cyclometer') === true;
    const isBlankLcd = offlineAnalysis.inspection?.isBlankUnpoweredLcd === true && !vision;
    const isSubMeterDevice =
      Boolean(vision) ||
      hasMeterKeywords ||
      offlineAnalysis.hasRegisterStructure ||
      isBlankLcd;

    let finalReading: number | null = null;
    let isAuthentic = false;
    let finalConfidence = 0;
    let finalInspection: SubMeterHardwareInspection;

    if (!isSubMeterDevice) {
      finalReading = null;
      isAuthentic = false;
      needsVerification = true;
      unclearReason = 'No electric sub-meter detected';
      finalConfidence = 0;
      finalInspection = {
        brandModel: 'Not an Electric Sub-Meter',
        registerType: 'Unrecognized Device',
        registerBreakdown:
          'No electric sub-meter dials or LCD display detected in this photo.',
        serialOrBarcode: 'N/A',
        electricalSpecs: 'N/A',
      };
    } else {
      finalReading = reading !== null ? reading : offlineAnalysis.reading;
      isAuthentic = true;
      finalConfidence =
        reading !== null ? Math.max(confidence, 50) : offlineAnalysis.confidence;
      if (finalReading === null) {
        needsVerification = true;
        unclearReason = unclearReason || 'Display unclear — enter reading manually';
      }

      const meta = detectBrandMetadata(combinedText, isCyclometer);
      finalInspection =
        finalReading !== null
          ? {
              brandModel: meta.brandModel,
              registerType: isCyclometer
                ? 'Mechanical Cyclometer (5 + 0.1 kWh)'
                : 'Digital LCD Register (kW·h)',
              registerBreakdown: needsVerification
                ? `Detected ~${finalReading.toFixed(1)} kWh (${unclearReason || 'Verify digit'})`
                : `Verified: ${finalReading.toFixed(1)} kWh`,
              serialOrBarcode: meta.serialOrBarcode,
              electricalSpecs: meta.electricalSpecs,
            }
          : {
              ...offlineAnalysis.inspection,
              brandModel:
                meta.brandModel !== 'Digital LCD kWh Sub-Meter' &&
                meta.brandModel !== 'Mechanical Cyclometer kWh Sub-Meter'
                  ? meta.brandModel
                  : offlineAnalysis.inspection.brandModel,
              electricalSpecs:
                meta.electricalSpecs !== '220–240V • 60Hz Sub-Meter'
                  ? meta.electricalSpecs
                  : offlineAnalysis.inspection.electricalSpecs,
            };
    }

    const readingValueStr = finalReading !== null ? finalReading.toFixed(1) : '';
    const registerCropDataUrl = buildVerifiedValueCropScreenshot(
      img,
      detectedCropBox,
      finalReading,
      !isSubMeterDevice
        ? 'NOT A SUB-METER'
        : needsVerification || finalReading === null
        ? 'VERIFY REGISTER CROP'
        : 'VERIFIED REGISTER CROP'
    );

    if (onProgress) onProgress(100);
    return {
      reading: finalReading,
      readingValue: readingValueStr,
      confidence: finalConfidence,
      rawText:
        combinedText ||
        `${finalInspection.brandModel} | ${finalInspection.registerBreakdown}`,
      processedImageDataUrl: preservedColorUrl || imageDataUrl,
      fullResUrl: preservedColorUrl || imageDataUrl,
      registerCropDataUrl: registerCropDataUrl || preservedColorUrl || imageDataUrl,
      roiCropUrl: vision?.tesseractStripUrl || registerCropDataUrl || preservedColorUrl || imageDataUrl,
      isAuthentic,
      needsVerification,
      unclearReason,
      inspection: finalInspection,
    };
  } catch (err) {
    console.warn('Sub-Meter OCR engine encountered an issue:', err);
    return {
      reading: null,
      readingValue: '',
      confidence: 0,
      rawText: 'Sub-Meter Register Scan (Manual Verification Required)',
      processedImageDataUrl: imageDataUrl,
      fullResUrl: imageDataUrl,
      registerCropDataUrl: generateSimulatedValueCropDataUrl(0),
      roiCropUrl: generateSimulatedValueCropDataUrl(0),
      isAuthentic: false,
      inspection: {
        brandModel: 'Electric Sub-Meter',
        registerType: 'Manual Verification Required',
        registerBreakdown:
          'Could not auto-detect digits with high confidence. Please verify from the close-up photo above.',
        serialOrBarcode: 'Faceplate Serial Excluded',
        electricalSpecs: '220-240V • 60Hz',
      },
    };
  }
}

/**
 * Generates a clean sub-meter register graphic when no photo has been uploaded yet.
 */
export function generateSimulatedSubMeterDataUrl(readingValue: number): string {
  const canvas = document.createElement('canvas');
  canvas.width = 1280;
  canvas.height = 720;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 0, 1280, 720);

  ctx.fillStyle = '#1e293b';
  ctx.strokeStyle = '#475569';
  ctx.lineWidth = 6;
  ctx.strokeRect(48, 48, 1184, 624);
  ctx.fillRect(48, 48, 1184, 624);

  ctx.fillStyle = '#cbd5e1';
  ctx.font = 'bold 34px Inter, Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('ELECTRONIC KILOWATT-HOUR SUB-METER • 240V 60Hz', 640, 136);

  ctx.fillStyle = '#94a3b8';
  ctx.font = 'bold 26px monospace';
  ctx.fillText('10000    1000     100      10       1      0.1', 640, 216);

  const safeVal = Math.max(0, Number(readingValue) || 0);
  const intPart = Math.floor(safeVal)
    .toString()
    .padStart(5, '0')
    .slice(-5);
  const decPart = Math.round((safeVal - Math.floor(safeVal)) * 10)
    .toString()
    .slice(0, 1);

  const startX = 220;
  const drumW = 128;
  const drumH = 184;
  const drumY = 248;

  for (let i = 0; i < 6; i++) {
    const isRedTenths = i === 5;
    const x = startX + i * (drumW + 12);
    ctx.fillStyle = isRedTenths ? '#dc2626' : '#090d16';
    ctx.fillRect(x, drumY, drumW, drumH);
    ctx.strokeStyle = isRedTenths ? '#f87171' : '#334155';
    ctx.lineWidth = 4;
    ctx.strokeRect(x, drumY, drumW, drumH);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 104px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const digit = isRedTenths ? decPart : intPart[i];
    ctx.fillText(digit, x + drumW / 2, drumY + drumH / 2 + 4);
  }

  ctx.fillStyle = '#f59e0b';
  ctx.font = 'bold 40px Inter, Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(`${safeVal.toFixed(1)} kWh`, 640, 550);

  return canvas.toDataURL('image/png');
}

// Re-export extracted auth & notification services for backwards compatibility
export { registerDeviceBiometrics, verifyDeviceBiometrics } from './authService';
export {
  META_MESSENGER_APP_ID,
  openMessengerAppWithReceipt,
  requestAndVerifyNotifications,
} from './notificationService';
