/**
 * Physical Electric Sub-Meter Computer Vision & Register Digit Engine
 *
 * Supports:
 * - Mechanical Cyclometer sub-meters (5 black integer drums + 1 red 0.1 tenths drum)
 * - 7-segment LCD digital sub-meters (both 6-digit e.g. Q&Y QY-169 and 7-digit e.g. Safari SY-168 Digital, Voschtech DDS1288)
 * - Tilted/skewed captures, shadows, glass glare, and inactive-segment LCD ghosting
 * - Genuine mid-rollover and low-margin ambiguity detection (no hardcoded/estimated fallbacks)
 */

export type MeterDisplayKind = 'cyclometer' | 'lcd' | 'unknown';

export interface CropBoxNormalized {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface RegionLocalization {
  kind: MeterDisplayKind;
  cropBox: CropBoxNormalized;
  tiltDeg: number;
  hasBlueRedBand: boolean;
  /** Fraction [0..1] across the localized crop where blue turns to red (if applicable) */
  seamXNorm: number | null;
  tightCanvas: HTMLCanvasElement;
  innerCropBox: CropBoxNormalized;
  locDebug?: string;
}

function isCyclometerBlue(r: number, g: number, b: number): boolean {
  return b > r + 20 && b > r * 1.28 && b > g + 4 && b > 56;
}

export interface VisionReadResult {
  kind: MeterDisplayKind;
  reading: number | null;
  digitsString: string;
  decimalDigits: number;
  confidence: number;
  needsVerification: boolean;
  unclearReason?: string;
  perDigitConfidences: number[];
  rolloverPositions: number[];
  /** Clean high-contrast spaced strip rendered specifically for Tesseract verification */
  tesseractStripUrl: string;
  /** Clean 5-digit black-drum integer strip without red tenths wheel */
  blackStripUrl?: string;
  /** Individual padded single-digit PNGs for per-cell cyclometer verification */
  cellImageUrls?: string[];
  /** Normalized 28x44 binary bitmaps (0/1) per cyclometer cell */
  cellBitmaps?: Uint8Array[];
  /** Aspect ratios (w/h) per normalized cell bitmap */
  cellAspectRatios?: number[];
  /** Secondary enhanced crop of the tight register window for fallback Tesseract verification */
  enhancedCropUrl: string;
  cropBox: CropBoxNormalized;
  debugInfo: string;
}

function getSourceDims(src: HTMLImageElement | HTMLCanvasElement | HTMLVideoElement): { w: number; h: number } {
  if (src instanceof HTMLVideoElement) {
    return { w: src.videoWidth || 1280, h: src.videoHeight || 720 };
  }
  if (src instanceof HTMLImageElement) {
    return { w: src.naturalWidth || src.width || 800, h: src.naturalHeight || src.height || 600 };
  }
  return { w: src.width || 800, h: src.height || 600 };
}

function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

export function createScaledCanvas(
  src: HTMLImageElement | HTMLCanvasElement | HTMLVideoElement,
  maxDim: number
): HTMLCanvasElement | null {
  const { w, h } = getSourceDims(src);
  if (!w || !h) return null;
  const scale = Math.min(1, maxDim / Math.max(w, h));
  const outW = Math.max(64, Math.round(w * scale));
  const outH = Math.max(64, Math.round(h * scale));
  const c = makeCanvas(outW, outH);
  const ctx = c.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, 0, 0, outW, outH);
  return c;
}

function rgbLum(r: number, g: number, b: number): number {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

function isBlueBandPixel(r: number, g: number, b: number): boolean {
  return b > 86 && b - r >= 22 && b - g >= 4 && b > r * 1.26;
}

function isRedBandPixel(r: number, g: number, b: number): boolean {
  return r > 94 && r - Math.max(g, b) >= 22 && r > Math.max(g, b) * 1.25;
}

interface BandCandidate {
  topY: number;
  botY: number;
  leftX: number;
  rightX: number;
  seamX: number;
  tiltDeg: number;
  score: number;
}

/**
 * Finds horizontal blue(left)+red(right) printed kWh bands common across IEC sub-meters.
 * Requiring blue on the left AND red on the right at the same scanlines rejects logos & unit stickers.
 */
function detectBlueRedBand(data: Uint8ClampedArray, w: number, h: number): BandCandidate | null {
  const yStart = Math.floor(h * 0.06);
  const yEnd = Math.floor(h * 0.78);
  const xStart = Math.floor(w * 0.04);
  const xEnd = Math.floor(w * 0.96);

  const rowScore = new Float32Array(h);
  const rowLeft = new Float32Array(h);
  const rowRight = new Float32Array(h);
  const rowSeam = new Float32Array(h);

  for (let y = yStart; y < yEnd; y++) {
    let bCnt = 0;
    let rCnt = 0;
    let bSumX = 0;
    let rSumX = 0;
    let bMinX = w;
    let bMaxX = 0;
    let rMaxX = 0;

    for (let x = xStart; x < xEnd; x++) {
      const idx = (y * w + x) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      if (isBlueBandPixel(r, g, b)) {
        bCnt++;
        bSumX += x;
        if (x < bMinX) bMinX = x;
        if (x > bMaxX) bMaxX = x;
      } else if (isRedBandPixel(r, g, b)) {
        rCnt++;
        rSumX += x;
        if (x > rMaxX) rMaxX = x;
      }
    }

    if (bCnt >= w * 0.035 && rCnt >= w * 0.025) {
      const bMean = bSumX / bCnt;
      const rMean = rSumX / rCnt;
      if (rMean > bMean + w * 0.14) {
        rowScore[y] = Math.min(bCnt, rCnt * 1.45) + 0.15 * (bCnt + rCnt);
        rowLeft[y] = bMinX;
        rowRight[y] = rMaxX;
        rowSeam[y] = Math.min(rMean, bMaxX + (rMean - bMean) * 0.35);
      }
    }
  }

  // Smooth over a 5-row vertical window to locate strongest band
  let peakY = -1;
  let peakSmooth = 0;
  for (let y = yStart + 2; y < yEnd - 2; y++) {
    const s =
      rowScore[y - 2] + rowScore[y - 1] + rowScore[y] + rowScore[y + 1] + rowScore[y + 2];
    if (s > peakSmooth) {
      peakSmooth = s;
      peakY = y;
    }
  }

  if (peakY < 0 || peakSmooth < w * 0.25) return null;

  // Peak can occur either in top header strip (blue->red directly touch) OR lower strip around LCD/drums
  // Find contiguous band allowing tiny vertical dip across header/register boundary
  const maxSingle = Math.max(...Array.from(rowScore.slice(yStart, yEnd)));
  const thresh = Math.max(w * 0.02, maxSingle * 0.18);

  let topY = peakY;
  let missTop = 0;
  while (topY > yStart && missTop <= 4) {
    topY--;
    if (rowScore[topY] >= thresh) missTop = 0;
    else missTop++;
  }
  while (topY < peakY && rowScore[topY] < thresh) topY++;

  let botY = peakY;
  let missBot = 0;
  while (botY < yEnd - 1 && missBot <= 6) {
    botY++;
    if (rowScore[botY] >= thresh) missBot = 0;
    else missBot++;
  }
  while (botY > peakY && rowScore[botY] < thresh) botY--;

  const bandH = botY - topY + 1;
  if (bandH < h * 0.035 || bandH > h * 0.28) return null;

  const validLefts: number[] = [];
  const validRights: number[] = [];
  const validSeams: number[] = [];
  for (let y = topY; y <= botY; y++) {
    if (rowScore[y] >= thresh) {
      validLefts.push(rowLeft[y]);
      validRights.push(rowRight[y]);
      validSeams.push(rowSeam[y]);
    }
  }
  validLefts.sort((a, b) => a - b);
  validRights.sort((a, b) => a - b);
  validSeams.sort((a, b) => a - b);

  const leftX = validLefts[Math.floor(validLefts.length * 0.25)] ?? xStart;
  const rightX = validRights[Math.floor(validRights.length * 0.75)] ?? xEnd;
  const seamX = validSeams[Math.floor(validSeams.length * 0.5)] ?? (leftX + rightX) * 0.7;

  // Estimate tilt from the top & bottom edge of the blue/red sticker across horizontal slices
  const span = rightX - leftX;
  const pts: Array<{ x: number; y: number }> = [];
  const slices = 10;
  const padSearch = Math.max(8, Math.round(bandH * 0.45));
  for (let s = 0; s < slices; s++) {
    const sx = Math.round(leftX + ((s + 0.5) / slices) * span);
    let fyTop = -1;
    let fyBot = -1;
    for (let y = Math.max(0, topY - padSearch); y <= Math.min(h - 1, botY + padSearch); y++) {
      const idx = (y * w + sx) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      if (isBlueBandPixel(r, g, b) || isRedBandPixel(r, g, b)) {
        if (fyTop < 0) fyTop = y;
        fyBot = y;
      }
    }
    if (fyTop >= 0 && fyBot - fyTop >= bandH * 0.45) {
      pts.push({ x: sx, y: (fyTop + fyBot) / 2 });
    }
  }

  let tiltDeg = 0;
  if (pts.length >= 4) {
    let mx = 0;
    let my = 0;
    for (const p of pts) {
      mx += p.x;
      my += p.y;
    }
    mx /= pts.length;
    my /= pts.length;
    let num = 0;
    let den = 0;
    for (const p of pts) {
      num += (p.x - mx) * (p.y - my);
      den += (p.x - mx) * (p.x - mx);
    }
    if (den > 10) {
      tiltDeg = Math.max(-10, Math.min(10, (Math.atan(num / den) * 180) / Math.PI));
    }
  }

  return {
    topY,
    botY,
    leftX,
    rightX,
    seamX,
    tiltDeg,
    score: peakSmooth,
  };
}

interface LcdCandidateRect {
  topY: number;
  botY: number;
  leftX: number;
  rightX: number;
  tiltDeg: number;
  score: number;
}

/**
 * Finds bandless inset grey/olive LCD glass rectangles on white/silver faceplates (e.g. Q&Y QY-169).
 */
function detectBandlessLcdRect(
  data: Uint8ClampedArray,
  w: number,
  h: number
): LcdCandidateRect | null {
  const lumArr = new Float32Array(w * h);
  const satArr = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const idx = i * 4;
    const r = data[idx];
    const g = data[idx + 1];
    const b = data[idx + 2];
    lumArr[i] = rgbLum(r, g, b);
    satArr[i] = Math.max(r, g, b) - Math.min(r, g, b);
  }

  const yMin = Math.floor(h * 0.14);
  const yMax = Math.floor(h * 0.56);
  const xMin = Math.floor(w * 0.14);
  const xMax = Math.floor(w * 0.86);

  let best: LcdCandidateRect | null = null;
  for (let bh = Math.floor(h * 0.045); bh <= Math.floor(h * 0.12); bh += Math.max(2, Math.floor(h * 0.01))) {
    for (let bw = Math.floor(w * 0.21); bw <= Math.floor(w * 0.56); bw += Math.max(4, Math.floor(w * 0.025))) {
      const aspect = bw / bh;
      if (aspect < 2.5 || aspect > 5.8) continue;

      for (let y0 = yMin; y0 <= yMax - bh; y0 += 3) {
        for (let x0 = xMin; x0 <= xMax - bw; x0 += 4) {
          let innerSamples = 0;
          let neutralCount = 0;
          let innerSum = 0;
          let midDarkCnt = 0;
          let edgeDarkCnt = 0;
          let edgeSamples = 0;
          let innerTrans = 0;

          const rowStep = Math.max(2, Math.floor(bh / 9));
          const colStep = Math.max(2, Math.floor(bw / 22));
          for (let y = y0 + 2; y < y0 + bh - 2; y += rowStep) {
            const relY = (y - y0) / bh;
            const isEdgeRow = relY < 0.14 || relY > 0.86;
            const isMidRow = relY >= 0.22 && relY <= 0.78;
            let prev = -1;
            for (let x = x0 + 4; x < x0 + bw - 4; x += colStep) {
              const p = y * w + x;
              const l = lumArr[p];
              const s = satArr[p];
              innerSamples++;
              if (s < 28) neutralCount++;
              innerSum += l;
              if (isEdgeRow) {
                edgeSamples++;
                if (l < 85) edgeDarkCnt++;
              }
              if (isMidRow) {
                if (l < 115) midDarkCnt++;
                if (prev >= 0 && Math.abs(l - prev) > 15) innerTrans++;
                prev = l;
              }
            }
          }
          if (innerSamples < 30 || neutralCount / innerSamples < 0.78) continue;
          const innerMean = innerSum / innerSamples;
          if (innerMean < 82 || innerMean > 168) continue;
          // Reject dark vent holes / plastic frame grooves whose top/bottom edges are dark solid bars
          if (edgeSamples > 0 && edgeDarkCnt / edgeSamples > 0.28) continue;
          if (innerTrans < 10) continue;

          // Verify columns alternate between darker digit strokes and brighter glass gaps (rejects uniform dark plastic moldings!)
          let glassGapCols = 0;
          let darkStrokeCols = 0;
          for (let x = x0 + 6; x < x0 + bw - 6; x += Math.max(2, Math.floor(bw / 28))) {
            let colMin = 255;
            let colMidSum = 0;
            let colMidCnt = 0;
            for (let y = y0 + Math.round(bh * 0.2); y <= y0 + Math.round(bh * 0.8); y += 2) {
              const l = lumArr[y * w + x];
              if (l < colMin) colMin = l;
              colMidSum += l;
              colMidCnt++;
            }
            const colAvg = colMidSum / Math.max(1, colMidCnt);
            if (colMin > innerMean - 8 && colAvg > innerMean * 0.96) glassGapCols++;
            else if (colMin < innerMean - 22) darkStrokeCols++;
          }
          if (glassGapCols < 3 || darkStrokeCols < 3) continue;

          // Recessed LCD MUST be bordered by brighter faceplate above & below (use 75th percentile so adjacent logo/text ink doesn't hide white faceplate!)
          const topOuter: number[] = [];
          const botOuter: number[] = [];
          const padLow = Math.max(3, Math.round(bh * 0.14));
          const padHigh = Math.max(padLow + 2, Math.round(bh * 0.36));
          for (let x = x0 + 6; x < x0 + bw - 6; x += colStep) {
            for (let dy = padLow; dy <= padHigh; dy += Math.max(2, Math.floor((padHigh - padLow) / 2) || 1)) {
              if (y0 - dy >= 0) topOuter.push(lumArr[(y0 - dy) * w + x]);
              if (y0 + bh + dy < h) botOuter.push(lumArr[(y0 + bh + dy) * w + x]);
            }
          }
          topOuter.sort((a, b) => a - b);
          botOuter.sort((a, b) => a - b);
          const aboveMean = topOuter[Math.floor(topOuter.length * 0.78)] ?? 0;
          const belowMean = botOuter[Math.floor(botOuter.length * 0.78)] ?? 0;
          const minOuterMean = Math.min(aboveMean, belowMean);
          const recessContrast = minOuterMean - innerMean;
          if (recessContrast < 22) continue;

          const cx = (x0 + bw / 2) / w;
          const cy = (y0 + bh / 2) / h;
          const posBonus = 1 - Math.abs(cx - 0.44) * 0.2 - Math.abs(cy - 0.36) * 0.25;
          const strokeDensity = Math.min(1, midDarkCnt / Math.max(1, innerSamples * 0.45));
          const digitRichness = Math.min(48, (innerTrans / Math.max(1, innerSamples * 0.08)) * 5.5 + strokeDensity * 24);
          const score = (recessContrast * 1.3 + digitRichness) * posBonus;

          if (!best || score > best.score) {
            best = {
              leftX: x0,
              rightX: x0 + bw,
              topY: y0,
              botY: y0 + bh,
              tiltDeg: 0,
              score,
            };
          }
        }
      }
    }
  }

  if (!best) return null;

  // Trim strictly to grey LCD glass interior boundaries (excluding outer dark bezel shadows & white faceplate)
  const bw0 = best.rightX - best.leftX;
  const bh0 = best.botY - best.topY;
  const xMid = Math.round((best.leftX + best.rightX) / 2);
  const yMid = Math.round((best.topY + best.botY) / 2);

  const scanPadY = Math.round(bh0 * 0.28);
  const syMin = Math.max(0, best.topY - scanPadY);
  const syMax = Math.min(h - 1, best.botY + scanPadY);
  const rowMean = new Float32Array(syMax - syMin + 1);
  for (let y = syMin; y <= syMax; y++) {
    let sum = 0;
    for (let x = best.leftX + 6; x <= best.rightX - 6; x++) sum += lumArr[y * w + x];
    rowMean[y - syMin] = sum / Math.max(1, bw0 - 12);
  }
  let topPeak = rowMean[0];
  for (let y = syMin; y < best.topY; y++) {
    if (rowMean[y - syMin] > topPeak) topPeak = rowMean[y - syMin];
  }
  let botPeak = rowMean[rowMean.length - 1];
  for (let y = best.botY + 1; y <= syMax; y++) {
    if (rowMean[y - syMin] > botPeak) botPeak = rowMean[y - syMin];
  }
  const innerRows = Array.from(rowMean.slice(Math.max(0, best.topY - syMin + 2), Math.min(rowMean.length, best.botY - syMin - 1))).sort((a, b) => a - b);
  const innerGlassY = innerRows[Math.floor(innerRows.length * 0.75)] ?? rowMean[yMid - syMin];
  const splitTop = innerGlassY + (topPeak - innerGlassY) * 0.52;
  const splitBot = innerGlassY + (botPeak - innerGlassY) * 0.52;
  const darkRimThresh = Math.max(46, innerGlassY * 0.56);

  let refTop = best.topY;
  for (let y = yMid; y >= syMin; y--) {
    const rm = rowMean[y - syMin];
    if (rm > splitTop || rm < darkRimThresh) {
      refTop = Math.min(yMid - 4, y + 1);
      break;
    }
  }
  let refBot = best.botY;
  for (let y = yMid; y <= syMax; y++) {
    const rm = rowMean[y - syMin];
    if (rm > splitBot || rm < darkRimThresh) {
      refBot = Math.max(yMid + 4, y - 1);
      break;
    }
  }

  const scanPadX = Math.round(bw0 * 0.28);
  const sxMin = Math.max(0, best.leftX - scanPadX);
  const sxMax = Math.min(w - 1, best.rightX + scanPadX);
  const colMean = new Float32Array(sxMax - sxMin + 1);
  for (let x = sxMin; x <= sxMax; x++) {
    let sum = 0;
    for (let y = refTop + 2; y <= refBot - 2; y++) sum += lumArr[y * w + x];
    colMean[x - sxMin] = sum / Math.max(1, refBot - refTop - 4);
  }
  const innerCols = Array.from(colMean.slice(Math.max(0, best.leftX - sxMin + 4), Math.min(colMean.length, best.rightX - sxMin - 3))).sort((a, b) => a - b);
  const innerGlassX = innerCols[Math.floor(innerCols.length * 0.78)] ?? colMean[xMid - sxMin];
  const leftOuterPeak = Math.max(...colMean.slice(0, Math.max(4, best.leftX - sxMin)));
  const rightOuterPeak = Math.max(...colMean.slice(Math.min(colMean.length - 4, best.rightX - sxMin)));
  const splitLeft = innerGlassX + Math.max(12, (leftOuterPeak - innerGlassX) * 0.5);
  const splitRight = innerGlassX + Math.max(12, (rightOuterPeak - innerGlassX) * 0.5);

  let refLeft = best.leftX;
  for (let x = xMid; x >= sxMin; x--) {
    const cm = colMean[x - sxMin];
    if (cm > splitLeft) {
      refLeft = Math.min(xMid - 12, x + 1);
      break;
    }
  }
  let refRight = best.rightX;
  for (let x = xMid; x <= sxMax; x++) {
    const cm = colMean[x - sxMin];
    if (cm > splitRight) {
      refRight = Math.max(xMid + 12, x - 1);
      break;
    }
  }

  if (refRight - refLeft < w * 0.16 || refBot - refTop < h * 0.04) {
    return best;
  }
  return {
    leftX: refLeft,
    rightX: refRight,
    topY: refTop,
    botY: refBot,
    tiltDeg: 0,
    score: best.score,
  };
}

/**
 * Extracts a deskewed crop from high-res source canvas around a normalized box.
 */
function extractDeskewedCrop(
  highSrc: HTMLImageElement | HTMLCanvasElement,
  box: CropBoxNormalized,
  tiltDeg: number,
  targetW: number,
  targetH: number
): HTMLCanvasElement {
  const { w: sw, h: sh } = getSourceDims(highSrc);
  const c = makeCanvas(targetW, targetH);
  const ctx = c.getContext('2d', { willReadFrequently: true });
  if (!ctx) return c;

  const cx = (box.x + box.w / 2) * sw;
  const cy = (box.y + box.h / 2) * sh;
  const rad = (-tiltDeg * Math.PI) / 180;
  const scaleX = targetW / (box.w * sw);
  const scaleY = targetH / (box.h * sh);

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, targetW, targetH);
  ctx.save();
  ctx.translate(targetW / 2, targetH / 2);
  ctx.rotate(rad);
  ctx.scale(scaleX, scaleY);
  ctx.translate(-cx, -cy);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(highSrc, 0, 0, sw, sh);
  ctx.restore();
  return c;
}

/**
 * Inside a deskewed blue+red band strip, determines whether the register is
 * Mechanical Cyclometer (dark drums + red tenths) or Digital LCD (grey glass between blue/red)
 * and trims directly to the exact digit display box.
 */
function refineBlueRedStrip(
  highSrc: HTMLImageElement | HTMLCanvasElement,
  band: BandCandidate,
  anaW: number,
  anaH: number
): RegionLocalization {
  // Crop slightly padded vertically around blue+red band and deskew
  const padX = (band.rightX - band.leftX) * 0.04;
  const padY = (band.botY - band.topY) * 0.25;
  const rawBox: CropBoxNormalized = {
    x: Math.max(0, (band.leftX - padX) / anaW),
    y: Math.max(0, (band.topY - padY) / anaH),
    w: Math.min(1, (band.rightX - band.leftX + padX * 2) / anaW),
    h: Math.min(1, (band.botY - band.topY + padY * 2) / anaH),
  };

  const bandAspect = (rawBox.w * anaW) / Math.max(1, rawBox.h * anaH);
  const stripW = 640;
  const stripH = Math.max(96, Math.round(stripW / Math.max(1.5, bandAspect)));
  const strip = extractDeskewedCrop(highSrc, rawBox, band.tiltDeg, stripW, stripH);
  const sCtx = strip.getContext('2d', { willReadFrequently: true })!;
  const sData = sCtx.getImageData(0, 0, stripW, stripH).data;

  // Measure outer white faceplate reference luminance from extreme top/bottom padY rows
  let whiteLumSum = 0;
  let whiteLumCnt = 0;
  for (const ry of [2, 4, stripH - 5, stripH - 3]) {
    for (let x = Math.floor(stripW * 0.25); x < Math.floor(stripW * 0.75); x += 4) {
      const idx = (ry * stripW + x) * 4;
      const r = sData[idx];
      const g = sData[idx + 1];
      const b = sData[idx + 2];
      if (!isBlueBandPixel(r, g, b) && !isRedBandPixel(r, g, b)) {
        whiteLumSum += rgbLum(r, g, b);
        whiteLumCnt++;
      }
    }
  }
  const faceplateLum = whiteLumCnt > 10 ? whiteLumSum / whiteLumCnt : 195;

  // Analyze row profiles strictly INSIDE the deskewed color band
  const rowDarkNeutral = new Float32Array(stripH);
  const rowGreyLcd = new Float32Array(stripH);
  const rowRedFrac = new Float32Array(stripH);
  const rowBlueFrac = new Float32Array(stripH);

  for (let y = 0; y < stripH; y++) {
    let darkN = 0;
    let greyL = 0;
    let redC = 0;
    let blueC = 0;
    for (let x = Math.floor(stripW * 0.06); x < Math.floor(stripW * 0.92); x++) {
      const idx = (y * stripW + x) * 4;
      const r = sData[idx];
      const g = sData[idx + 1];
      const b = sData[idx + 2];
      const l = rgbLum(r, g, b);
      const sat = Math.max(r, g, b) - Math.min(r, g, b);

      if (isBlueBandPixel(r, g, b)) blueC++;
      else if (isRedBandPixel(r, g, b)) redC++;
      else if (x < stripW * 0.7 && l < Math.min(108, faceplateLum * 0.54) && sat < 36) darkN++;
      else if (
        x > stripW * 0.16 &&
        x < stripW * 0.8 &&
        sat < 26 &&
        l >= 56 &&
        l <= Math.min(190, faceplateLum - 14)
      ) {
        greyL++;
      }
    }
    const span = stripW * 0.86;
    rowDarkNeutral[y] = darkN / span;
    rowGreyLcd[y] = greyL / span;
    rowRedFrac[y] = redC / span;
    rowBlueFrac[y] = blueC / span;
  }

  // Strictly bound active search rows [bandY0 .. bandY1] to rows belonging to the printed blue+red strip!
  // This guarantees Model: DDS1288 / header text ABOVE the band can NEVER leak into the register crop.
  const isBandRow = (y: number) => rowBlueFrac[y] >= 0.045 && rowRedFrac[y] >= 0.045;
  let bandY0 = -1;
  let bandY1 = -1;
  for (let y = 4; y < stripH - 4; y++) {
    if (isBandRow(y)) {
      if (bandY0 < 0) bandY0 = y;
      bandY1 = y;
    }
  }
  if (bandY0 < 0 || bandY1 - bandY0 < 16) {
    bandY0 = Math.floor(stripH * 0.16);
    bandY1 = Math.floor(stripH * 0.84);
  }

  // Compare polarity inside central band region:
  // Cyclometer: left drums have dark black wells + bright white digits (high p95-p45) AND red tenths wheel has white digit strokes directly right of hdrBlueEnd.
  // Digital LCD: wide contiguous grey LCD glass flanked by blue left & red right, dark segments on lighter glass (high p72-p12) extending smoothly into digits.
  const coreY0 = Math.max(bandY0, Math.round(bandY0 + (bandY1 - bandY0) * 0.24));
  const coreY1 = Math.min(bandY1, Math.round(bandY1 - (bandY1 - bandY0) * 0.12));
  const midWinY0 = Math.round(coreY0 + (coreY1 - coreY0) * 0.18);
  const midWinY1 = Math.round(coreY1 - (coreY1 - coreY0) * 0.18);

  // Find column spans where blue ends and red starts at TOP of band (above window) vs inside window
  let hdrBlueEnd = Math.floor(stripW * 0.56);
  for (let x = Math.floor(stripW * 0.35); x < Math.floor(stripW * 0.78); x++) {
    let rAtTop = 0;
    let bAtTop = 0;
    for (let y = bandY0; y <= Math.min(bandY1, bandY0 + Math.max(8, Math.round((bandY1 - bandY0) * 0.25))); y++) {
      const idx = (y * stripW + x) * 4;
      if (isRedBandPixel(sData[idx], sData[idx + 1], sData[idx + 2])) rAtTop++;
      if (isBlueBandPixel(sData[idx], sData[idx + 1], sData[idx + 2])) bAtTop++;
    }
    if (rAtTop > bAtTop && rAtTop >= 3) {
      hdrBlueEnd = x;
      break;
    }
  }

  // Sample neutral pixel luminances strictly inside the interior window [midWinY0 .. midWinY1]
  // to avoid dark top/bottom bezel groove bias.
  const drumProbeLums: number[] = [];
  let rightGlassGrey = 0;
  let rightGlassRed = 0;
  let rightWhiteOnRed = 0;
  const checkWinRightEnd = Math.min(stripW - 8, hdrBlueEnd + Math.round(stripW * 0.085));
  for (let y = midWinY0; y <= midWinY1; y++) {
    for (let x = Math.floor(stripW * 0.26); x < Math.max(Math.floor(stripW * 0.28), hdrBlueEnd - 8); x += 2) {
      const idx = (y * stripW + x) * 4;
      const r = sData[idx];
      const g = sData[idx + 1];
      const b = sData[idx + 2];
      if (!isBlueBandPixel(r, g, b) && !isRedBandPixel(r, g, b)) {
        drumProbeLums.push(rgbLum(r, g, b));
      }
    }
    for (let x = Math.max(0, hdrBlueEnd - 4); x < checkWinRightEnd; x += 2) {
      const idx = (y * stripW + x) * 4;
      const r = sData[idx];
      const g = sData[idx + 1];
      const b = sData[idx + 2];
      const sat = Math.max(r, g, b) - Math.min(r, g, b);
      const lum = rgbLum(r, g, b);
      if (isRedBandPixel(r, g, b)) {
        rightGlassRed++;
      } else if (r > 135 && Math.min(g, b) > 125 && sat < 45) {
        // Bright white stroke inside/near the red tenths wheel
        rightWhiteOnRed++;
      } else if (sat < 28 && lum >= 64) {
        rightGlassGrey++;
      }
    }
  }

  drumProbeLums.sort((a, b) => a - b);
  const p12 = drumProbeLums[Math.floor(drumProbeLums.length * 0.12)] ?? 50;
  const p42 = drumProbeLums[Math.floor(drumProbeLums.length * 0.42)] ?? 90;
  const p72 = drumProbeLums[Math.floor(drumProbeLums.length * 0.72)] ?? 115;
  const p95 = drumProbeLums[Math.floor(drumProbeLums.length * 0.95)] ?? 145;
  const brightStrokeSkew = p95 - p42; // Large on white-digit-on-dark-drum cyclometers
  const darkStrokeSkew = p72 - p12;   // Large on dark-segment-on-grey-glass LCDs

  // Cyclometer vs LCD decision:
  // 1) Mechanical cyclometers have solid red 0.1 drum right at hdrBlueEnd (not grey glass!) + white-on-red digit strokes,
  //    AND either dark drum wells (p42 < 86) or positive white-digit tail (brightStrokeSkew > darkStrokeSkew * 0.9).
  // 2) Digital LCDs (Safari SY-168 Digital, Voschtech DDS1288) have grey glass extending right at/past hdrBlueEnd
  //    OR clear dark-stroke-on-brighter-glass polarity (p72 > 84 && darkStrokeSkew > brightStrokeSkew * 1.1).
  const hasRedTenthsWindow = rightGlassRed > rightGlassGrey * 1.1 && (rightWhiteOnRed >= 6 || p42 < 78);
  const isStrongLcdPolarity = p72 >= 86 && darkStrokeSkew > brightStrokeSkew * 1.08 && rightGlassGrey >= rightGlassRed * 0.45;
  const isCyclometer =
    !isStrongLcdPolarity &&
    ((p42 < 84 && brightStrokeSkew >= 38 && rightGlassRed > rightGlassGrey * 0.85) ||
      (hasRedTenthsWindow && brightStrokeSkew > darkStrokeSkew * 0.8));

  if (isCyclometer) {
    // Locate exact vertical drum window [yTop .. yBot] using BOTH cutout non-blue trough AND dark neutrals so overhead glare cannot shrink winH!
    const cutX0 = Math.max(4, Math.floor(hdrBlueEnd - stripW * 0.36));
    const cutX1 = Math.max(cutX0 + 16, hdrBlueEnd - 8);
    const cutSpanX = Math.max(1, cutX1 - cutX0 + 1);
    const rowCutoutColor = new Float32Array(stripH);
    for (let y = bandY0; y <= bandY1; y++) {
      let cCnt = 0;
      for (let x = cutX0; x <= cutX1; x++) {
        const idx = (y * stripW + x) * 4;
        const r = sData[idx];
        const g = sData[idx + 1];
        const b = sData[idx + 2];
        if (isCyclometerBlue(r, g, b) || isRedBandPixel(r, g, b)) cCnt++;
      }
      rowCutoutColor[y] = cCnt / cutSpanX;
    }

    const bandH = Math.max(20, bandY1 - bandY0 + 1);
    let midY = Math.round(bandY0 + bandH * 0.56);
    let bestWinScore = -Infinity;
    for (let y = bandY0 + Math.round(bandH * 0.25); y <= bandY1 - Math.round(bandH * 0.15); y++) {
      const sc = rowDarkNeutral[y] + (1 - rowCutoutColor[y]) * 0.9;
      if (sc > bestWinScore) {
        bestWinScore = sc;
        midY = y;
      }
    }

    const dThresh = Math.max(0.08, rowDarkNeutral[midY] * 0.42);
    let yTop = midY;
    let yBot = midY;
    while (yTop > bandY0 + Math.round(bandH * 0.12) && (rowCutoutColor[yTop - 1] < 0.32 || rowDarkNeutral[yTop - 1] >= dThresh)) {
      yTop--;
    }
    while (yBot < bandY1 - 2 && (rowCutoutColor[yBot + 1] < 0.32 || rowDarkNeutral[yBot + 1] >= dThresh)) {
      yBot++;
    }

    // Clamp cutout height to physical SY-168 drum cutout proportion [0.45..0.58] of sticker bandH
    // so overhead glare on cool-lit meters (#12-#16) never shrinks winH and clips digit bottoms!
    const minWinH = Math.round(bandH * 0.45);
    const maxWinH = Math.round(bandH * 0.58);
    if (yBot - yTop + 1 < minWinH) {
      const targetBot = Math.max(yBot, bandY0 + Math.round(bandH * 0.75));
      yBot = Math.min(bandY1 - 2, targetBot);
      yTop = Math.max(bandY0 + Math.round(bandH * 0.2), yBot - minWinH + 1);
      if (yBot - yTop + 1 < minWinH) {
        yBot = Math.min(bandY1 - 2, yTop + minWinH - 1);
      }
    } else if (yBot - yTop + 1 > maxWinH) {
      const mid = Math.round((yTop + yBot) / 2);
      yTop = mid - Math.floor(maxWinH / 2);
      yBot = yTop + maxWinH - 1;
    }

    const colDark = new Float32Array(stripW);
    const colRed = new Float32Array(stripW);
    const colBlue = new Float32Array(stripW);
    const winH = Math.max(1, yBot - yTop + 1);
    for (let x = 0; x < stripW; x++) {
      let dCnt = 0;
      let rCnt = 0;
      let bCnt = 0;
      for (let y = yTop; y <= yBot; y++) {
        const idx = (y * stripW + x) * 4;
        const r = sData[idx];
        const g = sData[idx + 1];
        const b = sData[idx + 2];
        const l = rgbLum(r, g, b);
        if (b > r + 14 && b > g + 1 && b > 54) bCnt++;
        else if (isRedBandPixel(r, g, b)) rCnt++;
        else if (l < Math.min(115, faceplateLum * 0.58) && Math.max(r, g, b) - Math.min(r, g, b) < 38) dCnt++;
      }
      colDark[x] = dCnt / winH;
      colRed[x] = rCnt / winH;
      colBlue[x] = bCnt / winH;
    }

    // Anchor black-to-red drum seam near hdrBlueEnd (+/- 9% stripW) so faceplate noise cannot capture seam!
    let boundaryX = hdrBlueEnd;
    let bestBoundaryScore = -1;
    const seamMin = Math.max(Math.floor(stripW * 0.36), hdrBlueEnd - Math.round(stripW * 0.09));
    const seamMax = Math.min(Math.floor(stripW * 0.74), hdrBlueEnd + Math.round(stripW * 0.09));
    for (let x = seamMin; x <= seamMax; x++) {
      let leftDark = 0;
      let rightRed = 0;
      for (let k = 1; k <= 14; k++) {
        if (x - k >= 0) leftDark += colDark[x - k] > 0.22 ? 1 : colDark[x - k];
        if (x + k < stripW) rightRed += colRed[x + k] > 0.2 ? 1 : colRed[x + k];
      }
      const bScore = leftDark * 1.1 + rightRed;
      if (bScore > bestBoundaryScore) {
        bestBoundaryScore = bScore;
        boundaryX = x;
      }
    }

    // Locate exact blue-sticker-to-black-drum wall within [2.15*bandH .. 2.68*bandH] left of seam:
    // maximize blue wall + non-dark to the LEFT [x-10..x-1] paired with dark drum plastic [x+2..x+16] to the RIGHT
    // so cool glare specks inside Drum 0 can never pull drumsLeft rightwards!
    const min5Span = Math.round(bandH * 2.15);
    const max5Span = Math.round(bandH * 2.68);
    let drumsLeft = Math.max(0, Math.round(boundaryX - bandH * 2.38));
    const searchRightX = Math.max(12, boundaryX - min5Span);
    const searchLeftX = Math.max(10, boundaryX - max5Span);
    let rightmostBlueEdge = -1;
    let bestWallScore = -Infinity;
    let fallbackWallX = -1;
    let bestFallbackScore = -Infinity;
    for (let x = searchLeftX; x <= searchRightX; x++) {
      let lBlue = 0;
      let lDark = 0;
      const lSpan = Math.min(10, x);
      for (let k = 1; k <= lSpan; k++) {
        lBlue += colBlue[x - k];
        lDark += colDark[x - k];
      }
      lBlue /= Math.max(1, lSpan);
      lDark /= Math.max(1, lSpan);

      let rDark = 0;
      let rBlue = 0;
      const rSpan = Math.min(16, boundaryX - x);
      for (let k = 1; k <= rSpan; k++) {
        rDark += colDark[x + k];
        rBlue += colBlue[x + k];
      }
      rDark /= Math.max(1, rSpan);
      rBlue /= Math.max(1, rSpan);

      let rDark7 = 0;
      const rSpan7 = Math.min(8, boundaryX - x);
      for (let k = 1; k <= rSpan7; k++) {
        rDark7 += colDark[x + k];
      }
      rDark7 /= Math.max(1, rSpan7);

      if (lBlue >= 0.22 && lDark <= 0.35 && rDark >= 0.28) {
        const wScore = lBlue * 1.4 + rDark * 1.2 - lDark * 1.4 - rBlue * 1.5;
        if (wScore > bestWallScore) {
          bestWallScore = wScore;
          rightmostBlueEdge = x;
        }
      } else if (lDark <= 0.35 && rDark7 >= 0.35 && rDark7 - lDark >= 0.18 && rBlue <= 0.15) {
        const fScore = rDark7 * 1.3 - lDark * 1.2 + lBlue * 0.8;
        if (fScore > bestFallbackScore) {
          bestFallbackScore = fScore;
          fallbackWallX = x;
        }
      }
    }
    if (rightmostBlueEdge > 0) {
      drumsLeft = rightmostBlueEdge;
    } else if (fallbackWallX > 0) {
      drumsLeft = fallbackWallX;
    }

    const blackDrumsW = Math.max(80, boundaryX - drumsLeft);
    const estDrumW = blackDrumsW / 5;
    const padSides = Math.max(4, Math.round(estDrumW * 0.12));
    const cropLeft = Math.max(0, drumsLeft - padSides);
    const cropRight = Math.min(stripW, Math.round(boundaryX + estDrumW * 1.08 + padSides));
    const padV = Math.max(1, Math.round((yBot - yTop) * 0.04));
    const cropTop = Math.max(bandY0, yTop - padV);
    const cropBot = Math.min(bandY1, yBot + padV);

    const tightW = 680;
    const tightH = Math.max(96, Math.round((tightW * (cropBot - cropTop)) / Math.max(1, cropRight - cropLeft)));
    const tightCanvas = makeCanvas(tightW, tightH);
    const tCtx = tightCanvas.getContext('2d', { willReadFrequently: true })!;
    tCtx.imageSmoothingEnabled = true;
    tCtx.imageSmoothingQuality = 'high';
    tCtx.drawImage(
      strip,
      cropLeft,
      cropTop,
      cropRight - cropLeft,
      cropBot - cropTop,
      0,
      0,
      tightW,
      tightH
    );

    const seamXNorm = (boundaryX - cropLeft) / Math.max(1, cropRight - cropLeft);
    const innerBox: CropBoxNormalized = {
      x: rawBox.x + (cropLeft / stripW) * rawBox.w,
      y: rawBox.y + (cropTop / stripH) * rawBox.h,
      w: ((cropRight - cropLeft) / stripW) * rawBox.w,
      h: ((cropBot - cropTop) / stripH) * rawBox.h,
    };

    return {
      kind: 'cyclometer',
      cropBox: innerBox,
      tiltDeg: band.tiltDeg,
      hasBlueRedBand: true,
      seamXNorm,
      tightCanvas,
      innerCropBox: innerBox,
      locDebug: `wh=${winH}/${bandH},dl=${drumsLeft}/${boundaryX},rbe=${rightmostBlueEdge}`,
    };
  }

  // Otherwise: Blue+Red LCD Meter (Safari SY-168 Digital, Voschtech DDS1288, etc.)
  // Expand vertically across [bandY0 .. bandY1] including darker top/bottom shadow rows (7.jpg!) so segA/segD are never cropped!
  let peakY = Math.round((bandY0 + bandY1) * 0.55);
  let maxG = -1;
  for (let y = bandY0; y <= bandY1; y++) {
    const sc = rowGreyLcd[y] + rowBlueFrac[y] * 0.15 + rowRedFrac[y] * 0.15;
    if (rowGreyLcd[y] >= 0.10 && sc > maxG) {
      maxG = sc;
      peakY = y;
    }
  }
  const gThresh = Math.max(0.08, rowGreyLcd[peakY] * 0.35);
  let yTop = peakY;
  let yBot = peakY;
  while (yTop > bandY0 && (rowGreyLcd[yTop - 1] >= gThresh || rowDarkNeutral[yTop - 1] >= 0.18)) yTop--;
  while (yBot < bandY1 && (rowGreyLcd[yBot + 1] >= gThresh || rowDarkNeutral[yBot + 1] >= 0.18)) yBot++;

  const winH = Math.max(1, yBot - yTop + 1);
  const colNeutral = new Float32Array(stripW);
  const colBlue = new Float32Array(stripW);
  const colRed = new Float32Array(stripW);
  for (let x = 0; x < stripW; x++) {
    let n = 0;
    let bl = 0;
    let rd = 0;
    for (let y = yTop; y <= yBot; y++) {
      const idx = (y * stripW + x) * 4;
      const r = sData[idx];
      const g = sData[idx + 1];
      const b = sData[idx + 2];
      const sat = Math.max(r, g, b) - Math.min(r, g, b);
      if (isBlueBandPixel(r, g, b)) bl++;
      else if (isRedBandPixel(r, g, b)) rd++;
      else if (sat < 34) n++;
    }
    colNeutral[x] = n / winH;
    colBlue[x] = bl / winH;
    colRed[x] = rd / winH;
  }

  let lcdMidX = Math.floor(stripW * 0.48);
  let bestMid = -1;
  for (let x = Math.floor(stripW * 0.22); x < Math.floor(stripW * 0.72); x++) {
    const score = colNeutral[x] + (x > 2 ? colNeutral[x - 2] : 0) + (x + 2 < stripW ? colNeutral[x + 2] : 0);
    if (score > bestMid) {
      bestMid = score;
      lcdMidX = x;
    }
  }

  let xL = lcdMidX;
  while (xL > 10 && !(colBlue[xL] > 0.32 && colNeutral[xL] < 0.35)) xL--;
  let xR = lcdMidX;
  while (xR < stripW - 10 && !(colRed[xR] > 0.32 && colNeutral[xR] < 0.35)) xR++;

  const padX2 = 6;
  const padY2 = Math.max(6, Math.round(winH * 0.14));
  const cropL = Math.max(0, xL - padX2);
  const cropR = Math.min(stripW, xR + padX2);
  const cropT = Math.max(0, yTop - padY2);
  const cropB = Math.min(stripH, yBot + padY2);

  const tightW = 720;
  const tightH = Math.max(110, Math.round((tightW * (cropB - cropT)) / Math.max(1, cropR - cropL)));
  const tightCanvas = makeCanvas(tightW, tightH);
  const tCtx = tightCanvas.getContext('2d', { willReadFrequently: true })!;
  tCtx.imageSmoothingEnabled = true;
  tCtx.imageSmoothingQuality = 'high';
  tCtx.drawImage(strip, cropL, cropT, cropR - cropL, cropB - cropT, 0, 0, tightW, tightH);

  const innerBox: CropBoxNormalized = {
    x: rawBox.x + (cropL / stripW) * rawBox.w,
    y: rawBox.y + (cropT / stripH) * rawBox.h,
    w: ((cropR - cropL) / stripW) * rawBox.w,
    h: ((cropB - cropT) / stripH) * rawBox.h,
  };

  return {
    kind: 'lcd',
    cropBox: innerBox,
    tiltDeg: band.tiltDeg,
    hasBlueRedBand: true,
    seamXNorm: null,
    tightCanvas,
    innerCropBox: innerBox,
  };
}

export function locateMeterRegister(
  img: HTMLImageElement | HTMLCanvasElement
): RegionLocalization | null {
  const anaCanvas = createScaledCanvas(img, 480);
  if (!anaCanvas) return null;
  const aw = anaCanvas.width;
  const ah = anaCanvas.height;
  const ctx = anaCanvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  const { data } = ctx.getImageData(0, 0, aw, ah);

  // 1. Primary: IEC Blue+Red header/side band meters (Safari Mech, Safari Digital, Voschtech)
  const blueRedBand = detectBlueRedBand(data, aw, ah);
  if (blueRedBand) {
    return refineBlueRedStrip(img, blueRedBand, aw, ah);
  }

  // 2. Secondary: Bandless recessed grey LCD meters (Q&Y QY-169, Cirtech, etc.)
  const lcdRect = detectBandlessLcdRect(data, aw, ah);
  if (lcdRect) {
    const padX = (lcdRect.rightX - lcdRect.leftX) * 0.025;
    const padY = (lcdRect.botY - lcdRect.topY) * 0.04;
    const cropBox: CropBoxNormalized = {
      x: Math.max(0, (lcdRect.leftX - padX) / aw),
      y: Math.max(0, (lcdRect.topY - padY) / ah),
      w: Math.min(1, (lcdRect.rightX - lcdRect.leftX + padX * 2) / aw),
      h: Math.min(1, (lcdRect.botY - lcdRect.topY + padY * 2) / ah),
    };
    const aspect = (cropBox.w * aw) / Math.max(1, cropBox.h * ah);
    const tightW = 680;
    const tightH = Math.max(110, Math.round(tightW / Math.max(1.8, aspect)));
    const tightCanvas = extractDeskewedCrop(img, cropBox, lcdRect.tiltDeg, tightW, tightH);
    return {
      kind: 'lcd',
      cropBox,
      tiltDeg: lcdRect.tiltDeg,
      hasBlueRedBand: false,
      seamXNorm: null,
      tightCanvas,
      innerCropBox: cropBox,
    };
  }

  return null;
}

// ============================================================================
// 7-SEGMENT LCD ENGINE (handles glare, shadows, ghost segments, slant, & 6/7 digits)
// ============================================================================

/** Canonical 7-segment patterns: [a, b, c, d, e, f, g] */
const SEVEN_SEG_TEMPLATES: Array<{ digit: string; segs: [number, number, number, number, number, number, number] }> = [
  { digit: '0', segs: [1, 1, 1, 1, 1, 1, 0] },
  { digit: '1', segs: [0, 1, 1, 0, 0, 0, 0] },
  { digit: '2', segs: [1, 1, 0, 1, 1, 0, 1] },
  { digit: '3', segs: [1, 1, 1, 1, 0, 0, 1] },
  { digit: '4', segs: [0, 1, 1, 0, 0, 1, 1] },
  { digit: '5', segs: [1, 0, 1, 1, 0, 1, 1] },
  { digit: '6', segs: [1, 0, 1, 1, 1, 1, 1] },
  { digit: '7', segs: [1, 1, 1, 0, 0, 1, 0] }, // European/Chinese hooked-7 (Safari Digital, Q&Y, Voschtech)
  { digit: '7', segs: [1, 1, 1, 0, 0, 0, 0] }, // Standard 3-segment 7
  { digit: '8', segs: [1, 1, 1, 1, 1, 1, 1] },
  { digit: '9', segs: [1, 1, 1, 1, 0, 1, 1] },
];

/**
 * Normalizes illumination & shadow across the tight LCD patch using a coarse local-upper-quantile background field,
 * trims outer plastic bezel shadows, shears upright, and decodes all N (6 or 7) 7-segment cells.
 */
function readLcdRegister(loc: RegionLocalization): VisionReadResult {
  const c = loc.tightCanvas;
  const w = c.width;
  const h = c.height;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  const { data } = ctx.getImageData(0, 0, w, h);

  // Step 1: Trim outer blue/red plastic sides & solid dark/white outer bezel borders inside tightCanvas
  // IMPORTANT: Active dark digit strokes (segA/segD) must NOT be excluded as outer frame!
  // A solid horizontal bezel bar has >72% dark columns continuously across width, whereas digit rows have inter-digit glass gaps.
  const rowNeutralCols = new Float32Array(h);
  const rowDarkBarCols = new Float32Array(h);
  const colNeutralRows = new Float32Array(w);
  const lum = new Float32Array(w * h);
  const isNeutralInside = new Uint8Array(w * h);
  const isGlassBg = new Uint8Array(w * h);

  for (let y = 0; y < h; y++) {
    let nCnt = 0;
    let dBarCnt = 0;
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const l = rgbLum(r, g, b);
      lum[y * w + x] = l;
      const sat = Math.max(r, g, b) - Math.min(r, g, b);
      // Include BOTH grey LCD glass AND dark LCD digit ink as interior neutral pixels!
      if (!isBlueBandPixel(r, g, b) && !isRedBandPixel(r, g, b) && sat < 34) {
        isNeutralInside[y * w + x] = 1;
        nCnt++;
        if (l > 36) isGlassBg[y * w + x] = 1;
        else dBarCnt++;
      }
    }
    rowNeutralCols[y] = nCnt / w;
    rowDarkBarCols[y] = dBarCnt / w;
  }

  // Locate vertical glass interior span without eating shaded top/bottom digits (clamp outer rim trim to 20% top/bottom)
  const peakRowNeutral = Math.max(...rowNeutralCols);
  let gy0 = 0;
  let gy1 = h - 1;
  const maxTopTrim = Math.floor(h * 0.2);
  const minBotTrim = Math.floor(h * 0.8);
  while (gy0 < maxTopTrim && (rowNeutralCols[gy0] < peakRowNeutral * 0.58 || rowDarkBarCols[gy0] > 0.72)) {
    gy0++;
  }
  while (gy1 > minBotTrim && (rowNeutralCols[gy1] < peakRowNeutral * 0.58 || rowDarkBarCols[gy1] > 0.72)) {
    gy1--;
  }
  const yIn0 = Math.min(h - 16, gy0 + 2);
  const yIn1 = Math.max(yIn0 + 16, gy1 - 2);

  const glassH = yIn1 - yIn0 + 1;
  const colDarkBarRows = new Float32Array(w);
  for (let x = 0; x < w; x++) {
    let nCnt = 0;
    let dCnt = 0;
    for (let y = yIn0; y <= yIn1; y++) {
      if (isNeutralInside[y * w + x]) nCnt++;
      if (!isGlassBg[y * w + x] && isNeutralInside[y * w + x]) dCnt++;
    }
    colNeutralRows[x] = nCnt / glassH;
    colDarkBarRows[x] = dCnt / glassH;
  }
  let gx0 = 0;
  let gx1 = w - 1;
  while (gx0 < w * 0.35 && (colNeutralRows[gx0] < 0.72 || colDarkBarRows[gx0] > 0.72)) gx0++;
  while (gx1 > w * 0.65 && (colNeutralRows[gx1] < 0.72 || colDarkBarRows[gx1] > 0.72)) gx1--;
  const xIn0 = Math.min(w - 24, gx0 + 3);
  const xIn1 = Math.max(xIn0 + 24, gx1 - 3);

  const gw = xIn1 - xIn0 + 1;
  const gh = yIn1 - yIn0 + 1;

  // Step 2: Local 85th-percentile glass background field via coarse blocks (grid spacing ~16px)
  // Using a coarse grid + bilinear interpolation removes shadows & top reflections without blurring ink!
  const stepG = 14;
  const gridW = Math.max(3, Math.ceil(gw / stepG) + 1);
  const gridH = Math.max(2, Math.ceil(gh / stepG) + 1);
  const bgGrid = new Float32Array(gridW * gridH);

  for (let gy = 0; gy < gridH; gy++) {
    const cy = Math.min(yIn1, yIn0 + gy * stepG);
    const wy0 = Math.max(yIn0, cy - 18);
    const wy1 = Math.min(yIn1, cy + 18);
    for (let gx = 0; gx < gridW; gx++) {
      const cx = Math.min(xIn1, xIn0 + gx * stepG);
      const wx0 = Math.max(xIn0, cx - 22);
      const wx1 = Math.min(xIn1, cx + 22);
      const vals: number[] = [];
      for (let y = wy0; y <= wy1; y += 2) {
        for (let x = wx0; x <= wx1; x += 2) {
          if (isGlassBg[y * w + x]) vals.push(lum[y * w + x]);
        }
      }
      if (vals.length === 0) {
        bgGrid[gy * gridW + gx] = 145;
      } else {
        vals.sort((a, b) => a - b);
        bgGrid[gy * gridW + gx] = vals[Math.floor(vals.length * 0.84)];
      }
    }
  }

  const darkness = new Float32Array(gw * gh);
  for (let dy = 0; dy < gh; dy++) {
    const gyf = Math.min(gridH - 1.001, dy / stepG);
    const gy0i = Math.floor(gyf);
    const ty = gyf - gy0i;
    for (let dx = 0; dx < gw; dx++) {
      const gxf = Math.min(gridW - 1.001, dx / stepG);
      const gx0i = Math.floor(gxf);
      const tx = gxf - gx0i;
      const b00 = bgGrid[gy0i * gridW + gx0i];
      const b10 = bgGrid[gy0i * gridW + gx0i + 1];
      const b01 = bgGrid[(gy0i + 1) * gridW + gx0i];
      const b11 = bgGrid[(gy0i + 1) * gridW + gx0i + 1];
      const localBg = (b00 * (1 - tx) + b10 * tx) * (1 - ty) + (b01 * (1 - tx) + b11 * tx) * ty;
      const d = localBg - lum[(yIn0 + dy) * w + (xIn0 + dx)];
      darkness[dy * gw + dx] = Math.max(0, d);
    }
  }

  // Normalize darkness scale to 0..255 using 98.5th percentile across inner core
  const coreDark: number[] = [];
  for (let dy = Math.floor(gh * 0.12); dy < Math.floor(gh * 0.88); dy += 2) {
    for (let dx = Math.floor(gw * 0.04); dx < Math.floor(gw * 0.96); dx += 2) {
      coreDark.push(darkness[dy * gw + dx]);
    }
  }
  coreDark.sort((a, b) => a - b);
  const dMaxRef = Math.max(22, coreDark[Math.floor(coreDark.length * 0.985)] ?? 60);
  const dNoiseFloor = Math.max(4, coreDark[Math.floor(coreDark.length * 0.45)] ?? 6);
  const dNorm = new Float32Array(gw * gh);
  for (let i = 0; i < gw * gh; i++) {
    dNorm[i] = Math.max(0, Math.min(1, (darkness[i] - dNoiseFloor) / Math.max(12, dMaxRef - dNoiseFloor)));
  }

  // Step 3: Find tight vertical digit bounds [inkTop .. inkBot] inside LCD glass
  // Track both peak ink strength AND horizontal coverage so solid bezel bars (>70% coverage near outer edge) are excluded
  const rowPeakDark = new Float32Array(gh);
  const rowInkCov = new Float32Array(gh);
  for (let dy = 0; dy < gh; dy++) {
    let sumTop = 0;
    let cnt = 0;
    let cov = 0;
    const spanX = Math.max(1, Math.floor(gw * 0.9) - Math.floor(gw * 0.05));
    for (let dx = Math.floor(gw * 0.05); dx < Math.floor(gw * 0.95); dx++) {
      const v = dNorm[dy * gw + dx];
      if (v > 0.36) cnt++;
      if (v > 0.44) cov++;
      sumTop += v;
    }
    rowPeakDark[dy] = cnt * 0.02 + sumTop / gw;
    rowInkCov[dy] = cov / spanX;
  }

  // Search middle 60% for peak digit row (digits sit in the core vertical band and never cover >72% continuously)
  let midRow = Math.floor(gh * 0.5);
  let bestMidSum = -1;
  for (let dy = Math.floor(gh * 0.24); dy < Math.floor(gh * 0.76); dy++) {
    if (rowInkCov[dy] < 0.72 && rowPeakDark[dy] > bestMidSum) {
      bestMidSum = rowPeakDark[dy];
      midRow = dy;
    }
  }
  const coreRowAvg =
    rowPeakDark.slice(Math.floor(gh * 0.22), Math.floor(gh * 0.78)).reduce((a, b) => a + b, 0) /
    Math.max(1, Math.floor(gh * 0.56));
  const rowActiveThresh = Math.max(0.06, coreRowAvg * 0.24);

  // Walk upward/downward from midRow across digits, allowing at most 2px hollow gap,
  // and stopping BEFORE any solid bezel bar (>72% horizontal coverage) separated by a white gap!
  const isDigitActiveRow = (dy: number) =>
    rowPeakDark[dy] >= rowActiveThresh && !(rowInkCov[dy] > 0.72 && (dy < gh * 0.22 || dy > gh * 0.78));

  let inkTop = midRow;
  let gapUp = 0;
  for (let dy = midRow - 1; dy >= 2; dy--) {
    if (isDigitActiveRow(dy)) {
      inkTop = dy;
      gapUp = 0;
    } else {
      gapUp++;
      if (gapUp > 3 || (rowInkCov[dy] > 0.72 && dy < gh * 0.22)) break;
    }
  }

  let inkBot = midRow;
  let gapDn = 0;
  for (let dy = midRow + 1; dy <= gh - 3; dy++) {
    if (isDigitActiveRow(dy)) {
      inkBot = dy;
      gapDn = 0;
    } else {
      gapDn++;
      if (gapDn > 3 || (rowInkCov[dy] > 0.72 && dy > gh * 0.78)) break;
    }
  }

  const digitH = Math.max(24, inkBot - inkTop + 1);

  // Step 4: Deskew italic slant of 7-segment digits!
  // On LCD meters (Voschtech, Safari, Q&Y), digit tops slant clockwise (+x) relative to bottoms (-x).
  // Mapping upright (dx, dy) back to image space uses: sx = dx - shear * (dy - midY).
  const shearCandidates = [-0.04, 0.0, 0.04, 0.08, 0.11, 0.14, 0.18];
  let bestShear = 0.09;
  let bestValleyScore = -1;
  const shearEvalX0 = Math.floor(gw * 0.06);
  const shearEvalX1 = Math.floor(gw * 0.94);

  for (const shear of shearCandidates) {
    const colInk = new Float32Array(gw);
    for (let dx = shearEvalX0; dx < shearEvalX1; dx++) {
      let colSum = 0;
      for (let dy = inkTop; dy <= inkBot; dy++) {
        const sx = Math.round(dx - shear * (dy - (inkTop + digitH * 0.5)));
        if (sx >= 0 && sx < gw) {
          colSum += dNorm[dy * gw + sx];
        }
      }
      colInk[dx] = colSum / digitH;
    }
    let mean = 0;
    for (let dx = shearEvalX0; dx < shearEvalX1; dx++) mean += colInk[dx];
    mean /= Math.max(1, shearEvalX1 - shearEvalX0);
    let varSum = 0;
    for (let dx = shearEvalX0; dx < shearEvalX1; dx++) {
      const diff = colInk[dx] - mean;
      varSum += diff * diff;
    }
    if (varSum > bestValleyScore) {
      bestValleyScore = varSum;
      bestShear = shear;
    }
  }

  // Build upright sheared normalized darkness buffer [gw x digitH] (preserve full top segA; per-cell logic handles hairlines!)
  const upright = new Float32Array(gw * digitH);
  const effDigitH = digitH;
  const colProfile = new Float32Array(gw);
  for (let dy = 0; dy < effDigitH; dy++) {
    const origY = inkTop + dy;
    const shift = -bestShear * (origY - (inkTop + digitH * 0.5));
    for (let dx = 0; dx < gw; dx++) {
      const sx = dx + shift;
      const sx0 = Math.floor(sx);
      const fx = sx - sx0;
      const v0 = sx0 >= 0 && sx0 < gw ? dNorm[origY * gw + sx0] : 0;
      const v1 = sx0 + 1 >= 0 && sx0 + 1 < gw ? dNorm[origY * gw + sx0 + 1] : 0;
      const val = v0 * (1 - fx) + v1 * fx;
      upright[dy * gw + dx] = val;
      colProfile[dx] += val / effDigitH;
    }
  }

  // Find active horizontal span [inkLeft .. inkRight] ignoring outer bezel edges
  const maxColP = Math.max(...colProfile.slice(Math.floor(gw * 0.04), Math.floor(gw * 0.96)));
  const colThresh = Math.max(0.05, maxColP * 0.16);
  let inkLeft = Math.floor(gw * 0.03);
  while (inkLeft < gw * 0.35 && colProfile[inkLeft] < colThresh) inkLeft++;
  let inkRight = Math.floor(gw * 0.97);
  while (inkRight > gw * 0.65 && colProfile[inkRight] < colThresh) inkRight--;

  // Check for thin outer glass border / recessed left bezel wall: thin dark edge bar followed by clear full-height empty gap into a real digit
  const minWidthForGap = Math.max(5, Math.round(effDigitH * 0.15));
  const maxEdgeBarW = Math.max(4, Math.round(effDigitH * 0.28));
  for (let jump = 1; jump <= maxEdgeBarW; jump++) {
    if (inkLeft + jump < gw * 0.35 && colProfile[inkLeft + jump] < colThresh * 0.75) {
      let zeroRun = 0;
      let k = inkLeft + jump;
      while (k < gw * 0.42 && colProfile[k] < colThresh * 0.75) {
        zeroRun++;
        k++;
      }
      let nextPeak = 0;
      for (let p = k; p < Math.min(gw, k + Math.max(12, Math.round(effDigitH * 0.35))); p++) {
        if (colProfile[p] > nextPeak) nextPeak = colProfile[p];
      }
      if (zeroRun >= minWidthForGap && nextPeak > maxColP * 0.4) {
        inkLeft = k;
        break;
      }
    }
  }
  for (let jump = 1; jump <= Math.round(gw * 0.08); jump++) {
    if (inkRight - jump > gw * 0.65 && colProfile[inkRight - jump] < colThresh * 0.5) {
      let zeroRun = 0;
      let k = inkRight - jump;
      while (k > gw * 0.6 && colProfile[k] < colThresh * 0.6) {
        zeroRun++;
        k--;
      }
      if (zeroRun >= minWidthForGap && colProfile[k] > maxColP * 0.35) {
        inkRight = k;
        break;
      }
    }
  }

  const activeSpanW = Math.max(60, inkRight - inkLeft + 1);

  // Step 5: Segment N (6 vs 7) digits using lattice pitch + inter-digit valley alignment
  // On 6-digit LCDs (Q&Y QY-169), 6 cells fit into activeSpanW cleanly.
  // On 7-digit LCDs (Safari Digital, Voschtech DDS1288), 7 cells fit into activeSpanW cleanly.
  // Score N=6 and N=7 by:
  // (a) expected cell aspect ratio (7-segment cell width ~ 0.48..0.64 * digitH; gap ~ 0.12..0.28 * cellW)
  // (b) inter-digit valley darkness minimization at the N-1 boundaries!
  // Wait: watch out if the leftmost or rightmost digit is '1' (only occupies right half of its cell!).
  // Check both full-span lattice AND expanded left/right pitch matching!
  interface LatticeHypothesis {
    N: number;
    cells: Array<{ x0: number; x1: number }>;
    score: number;
  }

  const hypotheses: LatticeHypothesis[] = [];
  for (const N of [7, 6]) {
    const step = activeSpanW / N;
    const cellW = step * 0.84;
    const aspect = step / effDigitH;
    // Physical 7-segment meters typically have pitch/digitH in [0.54 .. 0.92]
    if (aspect < 0.44 || aspect > 1.15) continue;

    // Measure minimum colProfile near each internal boundary k = 1 .. N-1
    let valleyPenalty = 0;
    const cells: Array<{ x0: number; x1: number }> = [];
    for (let k = 0; k < N; k++) {
      const cx0 = Math.round(inkLeft + k * step + step * 0.04);
      const cx1 = Math.round(inkLeft + (k + 1) * step - step * 0.04);
      cells.push({ x0: Math.max(0, cx0), x1: Math.min(gw - 1, cx1) });
      if (k > 0) {
        const bx = Math.round(inkLeft + k * step);
        let minCol = 1;
        for (let off = -Math.max(2, Math.round(step * 0.1)); off <= Math.max(2, Math.round(step * 0.1)); off++) {
          const px = bx + off;
          if (px >= 0 && px < gw && colProfile[px] < minCol) minCol = colProfile[px];
        }
        valleyPenalty += minCol;
      }
    }
    const avgValley = valleyPenalty / (N - 1);

    // Measure how much ink sits inside cells vs gaps
    // On 7-digit meters, N=7 valleys should match actual gaps while N=6 cuts right across middle digits!
    const aspectPrior = Math.exp(-Math.pow((aspect - 0.68) / 0.22, 2));
    const score = (1 - Math.min(1, avgValley * 4.2)) * 2.0 + aspectPrior * 1.1;
    hypotheses.push({ N, cells, score });
  }

  hypotheses.sort((a, b) => b.score - a.score);
  const chosen = hypotheses[0] || {
    N: 7,
    cells: Array.from({ length: 7 }, (_, k) => ({
      x0: Math.round(inkLeft + (k * activeSpanW) / 7),
      x1: Math.round(inkLeft + ((k + 1) * activeSpanW) / 7),
    })),
    score: 0.5,
  };

  // Step 6: Extract 7-segment activations inside each cell [x0..x1] (two-pass so narrow digits inherit global nomDigitW)
  interface CellGeometry {
    x0: number;
    x1: number;
    cw: number;
    cellY0: number;
    cellY1: number;
    useH: number;
    actL: number;
    actR: number;
    activeCellW: number;
  }
  const cellGeos: CellGeometry[] = [];
  const rawDigitBoxes: Array<{ x0: number; x1: number }> = [];

  for (let k = 0; k < chosen.N; k++) {
    let { x0, x1 } = chosen.cells[k];
    const origW = Math.max(10, x1 - x0 + 1);

    // Refine cell borders slightly into neighboring valley minima if better
    const snapSearch = Math.max(2, Math.round(origW * 0.14));
    if (k > 0) {
      let bestX = x0;
      let minV = colProfile[x0];
      for (let sx = Math.max(0, x0 - snapSearch); sx <= Math.min(gw - 1, x0 + snapSearch); sx++) {
        if (colProfile[sx] < minV) {
          minV = colProfile[sx];
          bestX = sx;
        }
      }
      x0 = bestX;
    }
    if (k < chosen.N - 1) {
      let bestX = x1;
      let minV = colProfile[x1];
      for (let sx = Math.max(0, x1 - snapSearch); sx <= Math.min(gw - 1, x1 + snapSearch); sx++) {
        if (colProfile[sx] < minV) {
          minV = colProfile[sx];
          bestX = sx;
        }
      }
      x1 = bestX;
    }

    const cw = Math.max(8, x1 - x0 + 1);
    const rxStart = k === chosen.N - 1 ? Math.round(x0 + cw * 0.22) : x0;
    const rxEndDot = k === chosen.N - 2 ? Math.max(x0 + 4, Math.round(x0 + cw * 0.76)) : x1;
    const cellRowInk = new Float32Array(effDigitH);
    let cellPeakR = 0;
    for (let dy = 0; dy < effDigitH; dy++) {
      let s = 0;
      const sx0 = dy > effDigitH * 0.78 ? rxStart : x0;
      const sx1 = dy > effDigitH * 0.78 ? rxEndDot : x1;
      for (let dx = sx0; dx <= sx1; dx++) {
        s += upright[dy * gw + dx];
      }
      const avg = s / Math.max(1, sx1 - sx0 + 1);
      cellRowInk[dy] = avg;
      if (avg > cellPeakR) cellPeakR = avg;
    }

    // Jump past any detached top hairline (<3px) + blank gap rows (cellRowInk < 0.07) within top 26%
    let cellY0 = 0;
    const topLim = Math.floor(effDigitH * 0.26);
    const cellRThresh = Math.max(0.06, cellPeakR * 0.16);
    for (let r = 0; r < topLim - 2; r++) {
      if (cellRowInk[r] < 0.07 && cellRowInk[r + 1] < 0.07) {
        // Jump after this blank gap to where real digit starts
        let nextOn = r + 2;
        while (nextOn < topLim && cellRowInk[nextOn] < cellRThresh) nextOn++;
        if (nextOn < topLim) {
          cellY0 = nextOn;
        }
      }
    }
    while (cellY0 < topLim && cellRowInk[cellY0] < cellRThresh) cellY0++;

    let cellY1 = effDigitH - 1;
    const botLim = Math.floor(effDigitH * 0.74);
    while (cellY1 > botLim && cellRowInk[cellY1] < cellRThresh) cellY1--;
    if (cellY1 - cellY0 + 1 < effDigitH * 0.62) {
      cellY0 = 0;
      cellY1 = effDigitH - 1;
    }
    const useH = Math.max(12, cellY1 - cellY0 + 1);

    // Measure horizontal ink extent purely from vertical column coverage inside [cellY0..cellY1]
    const yScan0 = Math.min(cellY1, cellY0 + Math.round(useH * 0.03));
    const yScan1 = Math.max(yScan0 + 6, cellY1 - Math.round(useH * 0.03));
    const scanH = Math.max(6, yScan1 - yScan0 + 1);
    let actL = x1;
    let actR = x0;
    for (let dx = x0; dx <= x1; dx++) {
      let sumCol = 0;
      let colCnt = 0;
      const inLeftDot = k === chosen.N - 1 && dx < x0 + cw * 0.24;
      const inRightDot = k === chosen.N - 2 && dx > x0 + cw * 0.76;
      const colY1 = inLeftDot || inRightDot ? Math.floor(cellY0 + useH * 0.76) : yScan1;
      for (let dy = yScan0; dy <= colY1; dy++) {
        sumCol += upright[dy * gw + dx];
        colCnt++;
      }
      if (colCnt > 0 && sumCol / scanH > 0.12) {
        if (dx < actL) actL = dx;
        if (dx > actR) actR = dx;
      }
    }

    const activeCellW = Math.max(4, actR - actL + 1);
    rawDigitBoxes.push({ x0, x1 });
    cellGeos.push({ x0, x1, cw, cellY0, cellY1, useH, actL, actR, activeCellW });
  }

  // Estimate global canonical digit width across wide cells (fallback to 72% of pitch)
  const stepNom = activeSpanW / chosen.N;
  const wideWidths = cellGeos
    .filter((g) => g.activeCellW >= stepNom * 0.48 && g.activeCellW <= stepNom * 0.94)
    .map((g) => g.activeCellW)
    .sort((a, b) => a - b);
  const nomDigitW =
    wideWidths.length > 0 ? wideWidths[Math.floor(wideWidths.length * 0.5)] : Math.round(stepNom * 0.72);

  const cellSegMaps: Array<[number, number, number, number, number, number, number]> = [];
  for (let k = 0; k < chosen.N; k++) {
    const { x0, x1, cw, cellY0, useH, actL, actR, activeCellW } = cellGeos[k];
    const isNarrowOrPartial = activeCellW < nomDigitW * 0.76 && actR >= actL;
    const boxR =
      actR >= actL
        ? Math.min(x1, actR + 1)
        : x1 - Math.round(cw * 0.04);
    const boxL = isNarrowOrPartial
      ? Math.max(x0, boxR - Math.round(nomDigitW))
      : actR >= actL
      ? Math.max(x0, actL - 1)
      : x0 + Math.round(cw * 0.04);

    // Measure 7 canonical segment boxes within normalized [boxL..boxR] x [cellY0..cellY1].
    const sampleSeg = (rx0: number, ry0: number, rx1: number, ry1: number): number => {
      const px0 = Math.max(0, Math.round(boxL + rx0 * (boxR - boxL)));
      const px1 = Math.min(gw - 1, Math.round(boxL + rx1 * (boxR - boxL)));
      const py0 = Math.max(0, Math.round(cellY0 + ry0 * useH));
      const py1 = Math.min(effDigitH - 1, Math.round(cellY0 + ry1 * useH));
      const vals: number[] = [];
      for (let y = py0; y <= py1; y++) {
        for (let x = px0; x <= px1; x++) {
          vals.push(upright[y * gw + x]);
        }
      }
      if (vals.length === 0) return 0;
      vals.sort((a, b) => a - b);
      const startIdx = Math.floor(vals.length * 0.55);
      let sum = 0;
      let cnt = 0;
      for (let i = startIdx; i < vals.length; i++) {
        sum += vals[i];
        cnt++;
      }
      return cnt > 0 ? sum / cnt : 0;
    };

    const segA = sampleSeg(0.3, 0.0, 0.7, 0.2); // center of top horizontal bar
    const segB = sampleSeg(0.76, 0.12, 1.0, 0.45); // upper-right vertical
    const segC = sampleSeg(0.76, 0.55, 1.0, 0.88); // lower-right vertical
    const segD = sampleSeg(0.3, 0.8, 0.7, 1.0); // center of bottom horizontal bar
    const segE = sampleSeg(0.0, 0.55, 0.24, 0.88); // lower-left vertical
    const segF = sampleSeg(0.0, 0.12, 0.24, 0.45); // upper-left vertical
    const segG = sampleSeg(0.3, 0.43, 0.7, 0.57); // center of middle horizontal bar

    cellSegMaps.push([segA, segB, segC, segD, segE, segF, segG]);
  }

  // Step 7: Adaptive global ghost-segment separation across ALL segments in this LCD display!
  // On 18.jpg and 21.jpg, inactive LCD ghost segments can score ~0.20..0.38 while active ON segments score ~0.58..0.95.
  // Cluster segment intensities cleanly into ON vs OFF using 1D Otsu-like split on segment activations!
  const allSegVals = cellSegMaps.flat().sort((a, b) => a - b);
  let bestSplit = 0.44;
  let bestVarBetween = -1;
  for (let cand = 0.26; cand <= 0.68; cand += 0.02) {
    const low: number[] = [];
    const high: number[] = [];
    for (const v of allSegVals) {
      if (v < cand) low.push(v);
      else high.push(v);
    }
    if (low.length < 3 || high.length < 6) continue;
    const mLow = low.reduce((a, b) => a + b, 0) / low.length;
    const mHigh = high.reduce((a, b) => a + b, 0) / high.length;
    if (mHigh - mLow < 0.22) continue;
    const vb = low.length * high.length * (mHigh - mLow) * (mHigh - mLow);
    if (vb > bestVarBetween) {
      bestVarBetween = vb;
      bestSplit = (mLow + mHigh) / 2;
    }
  }

  // Remap segment values around [0..1] centered on bestSplit so ghost segments map near 0 and ON segments map near 1
  const mOff = allSegVals.filter((v) => v < bestSplit);
  const mOn = allSegVals.filter((v) => v >= bestSplit);
  const offAnchor = mOff.length > 0 ? mOff[Math.floor(mOff.length * 0.7)] : 0.15;
  const onAnchor = mOn.length > 0 ? mOn[Math.floor(mOn.length * 0.3)] : 0.75;
  const segSpan = Math.max(0.2, onAnchor - offAnchor);

  const decodedDigits: string[] = [];
  const perDigitConfidences: number[] = [];
  const cellDebugSegs: string[] = [];
  let minMargin = Infinity;
  let worstDigitIdx = -1;

  for (let k = 0; k < cellSegMaps.length; k++) {
    const rawSegs = cellSegMaps[k];
    const normSegs = rawSegs.map((v) => Math.max(0, Math.min(1, (v - offAnchor) / segSpan)));
    cellDebugSegs.push(normSegs.map((v) => Math.round(v * 9)).join(''));

    // Compute SSE error against every template (grouping the two '7' templates by taking min error for '7')
    const bestErrByDigit = new Map<string, number>();
    for (const tpl of SEVEN_SEG_TEMPLATES) {
      let err = 0;
      for (let s = 0; s < 7; s++) {
        const diff = normSegs[s] - tpl.segs[s];
        err += diff * diff;
      }
      const prev = bestErrByDigit.get(tpl.digit);
      if (prev === undefined || err < prev) {
        bestErrByDigit.set(tpl.digit, err);
      }
    }

    const ranked = Array.from(bestErrByDigit.entries()).sort((a, b) => a[1] - b[1]);
    const bestDigit = ranked[0][0];
    const bestErr = ranked[0][1];
    const secondErr = ranked[1]?.[1] ?? 1.5;
    const margin = secondErr - bestErr;

    if (margin < minMargin) {
      minMargin = margin;
      worstDigitIdx = k;
    }

    const digitConf = Math.max(10, Math.min(99, Math.round(100 - bestErr * 42)));
    decodedDigits.push(bestDigit);
    perDigitConfidences.push(digitConf);
  }

  // Step 8: Render clean thickened black-on-white LCD strip with clear decimal dot for Tesseract cross-check
  const charH = 64;
  const cellDrawW = Math.max(36, Math.round((activeSpanW / chosen.N / effDigitH) * charH));
  const padOut = 28;
  const gapOut = 18;
  const stripWOut = padOut * 2 + chosen.N * cellDrawW + (chosen.N - 1) * gapOut + 24;
  const stripHOut = charH + padOut * 2;
  const stripCanvas = makeCanvas(stripWOut, stripHOut);
  const stCtx = stripCanvas.getContext('2d')!;
  stCtx.fillStyle = '#ffffff';
  stCtx.fillRect(0, 0, stripWOut, stripHOut);

  let curX = padOut;
  for (let k = 0; k < chosen.N; k++) {
    const { x0, x1 } = rawDigitBoxes[k];
    const cw = Math.max(4, x1 - x0 + 1);
    const cellImg = makeCanvas(cw, effDigitH);
    const cellCtx = cellImg.getContext('2d')!;
    const cid = cellCtx.createImageData(cw, effDigitH);
    // Light 3x3 max filter bridges narrow diagonal 7-segment miter gaps so Tesseract reads segments cleanly
    for (let dy = 0; dy < effDigitH; dy++) {
      for (let dx = 0; dx < cw; dx++) {
        const val = upright[dy * gw + (x0 + dx)];
        let maxN = val;
        if (val < bestSplit) {
          for (let oy = -1; oy <= 1; oy++) {
            const ny = dy + oy;
            if (ny < 0 || ny >= effDigitH) continue;
            for (let ox = -1; ox <= 1; ox++) {
              const nx = x0 + dx + ox;
              if (nx < x0 || nx > x1) continue;
              const nv = upright[ny * gw + nx];
              if (nv > maxN) maxN = nv;
            }
          }
        }
        const closedVal = val * 0.45 + maxN * 0.55;
        const ink =
          closedVal >= bestSplit * 0.92
            ? 0
            : closedVal <= offAnchor
            ? 255
            : Math.round((1 - (closedVal - offAnchor) / segSpan) * 255);
        const o = (dy * cw + dx) * 4;
        cid.data[o] = ink;
        cid.data[o + 1] = ink;
        cid.data[o + 2] = ink;
        cid.data[o + 3] = 255;
      }
    }
    cellCtx.putImageData(cid, 0, 0);
    stCtx.imageSmoothingEnabled = true;
    stCtx.imageSmoothingQuality = 'high';
    stCtx.drawImage(cellImg, 0, 0, cw, effDigitH, curX, padOut, cellDrawW, charH);

    curX += cellDrawW;
    if (k === chosen.N - 2) {
      // Draw crisp decimal point before tenths digit
      stCtx.fillStyle = '#000000';
      stCtx.beginPath();
      stCtx.arc(curX + gapOut * 0.55, padOut + charH - 6, 4.5, 0, Math.PI * 2);
      stCtx.fill();
      curX += 20;
    } else {
      curX += gapOut;
    }
  }

  // Format final reading: last digit is tenths (.1 kWh) on all 6-digit & 7-digit electric kWh LCDs!
  const intStr = decodedDigits.slice(0, chosen.N - 1).join('');
  const decStr = decodedDigits[chosen.N - 1];
  const digitsString = `${intStr}.${decStr}`;
  const numericVal = parseFloat(digitsString);
  const avgConf = Math.round(
    perDigitConfidences.reduce((a, b) => a + b, 0) / Math.max(1, perDigitConfidences.length)
  );

  // Flag unclear only when a digit has genuinely tight margin between top-2 candidates or very low template fit
  const isUnclear = Number.isNaN(numericVal) || minMargin < 0.14 || avgConf < 68;

  return {
    kind: 'lcd',
    reading: Number.isNaN(numericVal) ? null : Math.round(numericVal * 10) / 10,
    digitsString,
    decimalDigits: 1,
    confidence: Math.min(99, avgConf),
    needsVerification: isUnclear,
    unclearReason: isUnclear
      ? `Ambiguous LCD digit #${worstDigitIdx + 1} — verify from close-up crop`
      : undefined,
    perDigitConfidences,
    rolloverPositions: [],
    tesseractStripUrl: stripCanvas.toDataURL('image/png'),
    enhancedCropUrl: c.toDataURL('image/png'),
    cropBox: loc.cropBox,
    debugInfo: `lcd(N=${chosen.N}, shear=${bestShear.toFixed(2)}, split=${bestSplit.toFixed(2)}, minMargin=${minMargin.toFixed(2)}, digits=${digitsString}, segs=[${cellDebugSegs.join(' ')}])`,
  };
}

// ============================================================================
// MECHANICAL CYCLOMETER ENGINE (5 black integer drums + 1 red tenths drum)
// ============================================================================

interface DrumCellExtraction {
  bitmap: Uint8Array; // 28x44 binary glyph (1 = digit ink, 0 = background)
  hasInk: boolean;
  isRollover: boolean;
  rolloverNote?: string;
  aspectRatio: number;
  widthFrac: number;
}

/**
 * Extracts normalized 28x44 binary white-digit glyph from a single cyclometer drum cell.
 * Uses luminance for black drums and min(G, B) whiteness for red tenths drums,
 * trims border frames / pointer ticks, and detects vertical split-rollover digits.
 */
function extractDrumGlyph(
  data: Uint8ClampedArray,
  imgW: number,
  imgH: number,
  cellX0: number,
  cellX1: number,
  cellIndex: number
): DrumCellExtraction {
  const isRedDrum = cellIndex === 5;
  const cw = Math.max(8, Math.round(cellX1 - cellX0));
  // Trim inner drum seams while preserving outer edges of Drum 0 and Drum 4
  const trimL =
    cellIndex === 0 ? Math.max(2, Math.round(cw * 0.115)) : Math.max(2, Math.round(cw * 0.11));
  const trimR =
    isRedDrum
      ? Math.max(2, Math.round(cw * 0.22))
      : cellIndex === 4
      ? Math.max(2, Math.round(cw * 0.07))
      : Math.max(2, Math.round(cw * 0.11));
  const trimT = Math.max(3, Math.round(imgH * 0.08));
  const trimB = Math.max(3, Math.round(imgH * 0.08));

  const x0 = Math.max(0, Math.round(cellX0 + trimL));
  const x1 = Math.min(imgW - 1, Math.round(cellX1 - trimR));
  const y0 = trimT;
  const y1 = Math.max(y0 + 8, imgH - trimB);
  const pw = Math.max(4, x1 - x0 + 1);
  const ph = Math.max(8, y1 - y0 + 1);

  // Measure pixel whiteness & row-wise local drum plastic background (eliminates curved-drum overhead glare)
  const whiteScore = new Float32Array(pw * ph);
  const rawRowBg = new Float32Array(ph);

  for (let dy = 0; dy < ph; dy++) {
    const y = y0 + dy;
    const rowScores: number[] = [];
    for (let dx = 0; dx < pw; dx++) {
      const x = x0 + dx;
      const idx = (y * imgW + x) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      // On red drum: min(g,b) isolates crisp white paint against deep red
      const score = isRedDrum ? Math.min(g, b) * 0.72 + g * 0.28 : rgbLum(r, g, b);
      whiteScore[dy * pw + dx] = score;
      rowScores.push(score);
    }
    rowScores.sort((a, b) => a - b);
    rawRowBg[dy] = rowScores[Math.floor(rowScores.length * 0.2)] ?? 40;
  }

  // Global low baseline prevents horizontal digit bars from subtracting themselves out; smooth rowBg handles glare gradient
  const cVals: number[] = [];
  const cy0 = Math.floor(ph * 0.14);
  const cy1 = Math.ceil(ph * 0.86);
  const cx0 = Math.floor(pw * 0.12);
  const cx1 = Math.ceil(pw * 0.88);
  for (let dy = cy0; dy < cy1; dy++) {
    for (let dx = cx0; dx < cx1; dx++) {
      cVals.push(whiteScore[dy * pw + dx]);
    }
  }
  cVals.sort((a, b) => a - b);
  const globalBg = cVals[Math.floor(cVals.length * 0.32)] ?? 40;

  const fgScore = new Float32Array(pw * ph);
  const fgCentral: number[] = [];
  for (let dy = 0; dy < ph; dy++) {
    let rbSum = 0;
    let rbCnt = 0;
    for (let oy = -3; oy <= 3; oy++) {
      const ry = dy + oy;
      if (ry >= 0 && ry < ph) {
        rbSum += rawRowBg[ry];
        rbCnt++;
      }
    }
    const smoothRowBg = rbSum / Math.max(1, rbCnt);
    const rowBase = globalBg * 0.3 + smoothRowBg * 0.7;
    for (let dx = 0; dx < pw; dx++) {
      const fg = Math.max(0, whiteScore[dy * pw + dx] - rowBase);
      fgScore[dy * pw + dx] = fg;
      if (dy >= cy0 && dy < cy1 && dx >= cx0 && dx < cx1) {
        fgCentral.push(fg);
      }
    }
  }

  fgCentral.sort((a, b) => a - b);
  const fgLow = fgCentral[Math.floor(fgCentral.length * 0.34)] ?? 0;
  const fgPeak = Math.min(fgCentral[Math.floor(fgCentral.length * 0.91)] ?? 110, fgLow + 120);
  const contrast = Math.max(0, fgPeak - fgLow);

  const thresh = fgLow + Math.max(17, contrast * 0.35);
  const mask = new Uint8Array(pw * ph);
  for (let dy = 0; dy < ph; dy++) {
    for (let dx = 0; dx < pw; dx++) {
      if (fgScore[dy * pw + dx] >= thresh) {
        mask[dy * pw + dx] = 1;
      }
    }
  }

  // Connected component analysis (8-connected) to isolate the primary digit blob and reject
  // tiny edge noise specks or half-visible neighboring wheel edge slivers!
  const labels = new Int32Array(pw * ph);
  interface Comp {
    id: number;
    area: number;
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
    cy: number;
  }
  const comps: Comp[] = [];
  let nextLabel = 1;
  const queue = new Int32Array(pw * ph);

  for (let dy = 0; dy < ph; dy++) {
    for (let dx = 0; dx < pw; dx++) {
      const start = dy * pw + dx;
      if (!mask[start] || labels[start]) continue;
      let qHead = 0;
      let qTail = 0;
      queue[qTail++] = start;
      labels[start] = nextLabel;
      let area = 0;
      let minX = dx;
      let maxX = dx;
      let minY = dy;
      let maxY = dy;
      let sumY = 0;

      while (qHead < qTail) {
        const cur = queue[qHead++];
        const cx = cur % pw;
        const cy = (cur - cx) / pw;
        area++;
        sumY += cy;
        if (cx < minX) minX = cx;
        if (cx > maxX) maxX = cx;
        if (cy < minY) minY = cy;
        if (cy > maxY) maxY = cy;

        for (let oy = -1; oy <= 1; oy++) {
          const ny = cy + oy;
          if (ny < 0 || ny >= ph) continue;
          for (let ox = -1; ox <= 1; ox++) {
            const nx = cx + ox;
            if (nx < 0 || nx >= pw) continue;
            const np = ny * pw + nx;
            if (mask[np] && !labels[np]) {
              labels[np] = nextLabel;
              queue[qTail++] = np;
            }
          }
        }
      }
      comps.push({
        id: nextLabel++,
        area,
        minX,
        maxX,
        minY,
        maxY,
        cy: sumY / Math.max(1, area),
      });
    }
  }

  // Reject border-glued inter-drum divider slivers when centered digit components exist
  const significantAll = comps.filter(
    (cp) => cp.area >= pw * ph * 0.025 && cp.maxY - cp.minY >= ph * 0.14
  );
  const interiorSig = significantAll.filter(
    (cp) =>
      !(
        ((cp.minX <= 1 && cp.maxX < pw * 0.25) || (cp.maxX >= pw - 2 && cp.minX > pw * 0.68)) &&
        cp.maxX - cp.minX + 1 < pw * 0.26
      )
  );
  const significant = interiorSig.length > 0 ? interiorSig : significantAll;

  // Detect mid-rollover split before deprioritizing edge slivers
  const midCenter = ph * 0.5;
  const upperComps = significant.filter((c) => c.maxY < ph * 0.49 && c.area >= pw * ph * 0.062);
  const lowerComps = significant.filter((c) => c.minY > ph * 0.51 && c.area >= pw * ph * 0.062);
  const topHeavy = upperComps.reduce((s, c) => s + c.area, 0);
  const botHeavy = lowerComps.reduce((s, c) => s + c.area, 0);

  let isRollover = false;
  let rolloverNote: string | undefined;
  if (topHeavy > pw * ph * 0.065 && botHeavy > pw * ph * 0.065 && Math.min(topHeavy, botHeavy) / Math.max(topHeavy, botHeavy) > 0.42) {
    isRollover = true;
    rolloverNote = 'Split rollover detected between two digits';
  }

  // Prefer components that cross or span near the central reading band [0.24*ph .. 0.76*ph]
  const centralComps = significant.filter((cp) => cp.maxY >= ph * 0.25 && cp.minY <= ph * 0.75);
  const rankPool = centralComps.length > 0 ? centralComps : significant;
  rankPool.sort((a, b) => {
    const scoreA = a.area * (1 - Math.min(0.65, Math.abs(a.cy - midCenter) / ph));
    const scoreB = b.area * (1 - Math.min(0.65, Math.abs(b.cy - midCenter) / ph));
    return scoreB - scoreA;
  });

  const primary = rankPool[0];
  if (!primary) {
    return {
      bitmap: new Uint8Array(28 * 44),
      hasInk: false,
      isRollover: false,
      aspectRatio: 0,
      widthFrac: 0,
    };
  }

  // Merge secondary strokes belonging to the same centered digit (reject detached side specks)
  const keptIds = new Set<number>([primary.id]);
  const primH = primary.maxY - primary.minY + 1;
  for (const cp of significant) {
    if (cp.id === primary.id) continue;
    const vOverlap =
      Math.min(cp.maxY, primary.maxY) - Math.max(cp.minY, primary.minY);
    const closeVert = Math.min(
      Math.abs(cp.minY - primary.maxY),
      Math.abs(primary.minY - cp.maxY)
    );
    const xOverlap =
      Math.min(cp.maxX, primary.maxX) - Math.max(cp.minX, primary.minX);
    const horizGap = Math.max(
      0,
      cp.minX - primary.maxX,
      primary.minX - cp.maxX
    );
    const cpH = cp.maxY - cp.minY + 1;
    const centered = Math.abs(cp.cy - midCenter) < ph * 0.36;
    const verticalMate = xOverlap >= -1 && (vOverlap > -4 || closeVert <= 4) && cp.area >= primary.area * 0.12;
    const bilateralMate =
      vOverlap >= Math.min(cpH, primH) * 0.45 &&
      horizGap <= pw * 0.12 &&
      cp.area >= primary.area * 0.30;
    if (centered && (verticalMate || bilateralMate)) {
      keptIds.add(cp.id);
    }
  }

  // Bounding box of kept digit glyph
  let gx0 = pw;
  let gx1 = 0;
  let gy0 = ph;
  let gy1 = 0;
  for (const cp of significant) {
    if (!keptIds.has(cp.id)) continue;
    if (cp.minX < gx0) gx0 = cp.minX;
    if (cp.maxX > gx1) gx1 = cp.maxX;
    if (cp.minY < gy0) gy0 = cp.minY;
    if (cp.maxY > gy1) gy1 = cp.maxY;
  }

  // Check BOTH half-clipped partial digit, wide truncated rollover arch, and tall stacked split
  const gh = Math.max(1, gy1 - gy0 + 1);
  const gw = Math.max(1, gx1 - gx0 + 1);
  if ((gh < ph * 0.48 && (gy0 <= 4 || gy1 >= ph - 5)) || (gw / gh > 1.02 && gh < ph * 0.52)) {
    isRollover = true;
    rolloverNote = 'Drum mid-transition (partial digit)';
  } else if (!isRollover && gh >= ph * 0.88 && gy0 <= 2 && gy1 >= ph - 3) {
    let midMinRow = gw;
    let topMaxRow = 0;
    let botMaxRow = 0;
    for (let dy = Math.floor(ph * 0.35); dy <= Math.ceil(ph * 0.65); dy++) {
      let rc = 0;
      for (let dx = gx0; dx <= gx1; dx++) {
        if (keptIds.has(labels[dy * pw + dx])) rc++;
      }
      if (rc < midMinRow) midMinRow = rc;
    }
    for (let dy = gy0; dy < Math.floor(ph * 0.36); dy++) {
      let rc = 0;
      for (let dx = gx0; dx <= gx1; dx++) {
        if (keptIds.has(labels[dy * pw + dx])) rc++;
      }
      if (rc > topMaxRow) topMaxRow = rc;
    }
    for (let dy = Math.ceil(ph * 0.64); dy <= gy1; dy++) {
      let rc = 0;
      for (let dx = gx0; dx <= gx1; dx++) {
        if (keptIds.has(labels[dy * pw + dx])) rc++;
      }
      if (rc > botMaxRow) botMaxRow = rc;
    }
    if (midMinRow <= Math.max(1, Math.floor(gw * 0.12)) && topMaxRow >= gw * 0.35 && botMaxRow >= gw * 0.35) {
      isRollover = true;
      rolloverNote = 'Two stacked numerals mid-rollover';
    }
  }

  // Render normalized 28x44 glyph bitmap preserving aspect ratio (preventing wide tenths numerals from shrinking to superscript)
  const BW = 28;
  const BH = 44;
  const bitmap = new Uint8Array(BW * BH);
  const scaleX = (BW - 4) / gw;
  const maxScaleY = (BH - 4) / gh;
  const scaleY = !isRollover && gw / gh > 0.62 ? Math.min(scaleX * 1.35, maxScaleY) : Math.min(scaleX, maxScaleY);
  const scaleW = Math.min(scaleX, maxScaleY);
  const drawW = Math.max(4, Math.round(gw * scaleW));
  const drawH = Math.max(6, Math.round(gh * scaleY));
  const offX = Math.floor((BW - drawW) / 2);
  const offY = Math.floor((BH - drawH) / 2);

  for (let by = 0; by < drawH; by++) {
    const sy = Math.min(gy1, gy0 + Math.floor((by / drawH) * gh));
    for (let bx = 0; bx < drawW; bx++) {
      const sx = Math.min(gx1, gx0 + Math.floor((bx / drawW) * gw));
      if (keptIds.has(labels[sy * pw + sx])) {
        bitmap[(offY + by) * BW + (offX + bx)] = 1;
      }
    }
  }

  return {
    bitmap,
    hasInk: true,
    isRollover,
    rolloverNote,
    aspectRatio: gw / Math.max(1, gh),
    widthFrac: gw / pw,
  };
}

function readCyclometerRegister(loc: RegionLocalization): VisionReadResult {
  const c = loc.tightCanvas;
  const w = c.width;
  const h = c.height;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  const { data } = ctx.getImageData(0, 0, w, h);

  // Locate exact black/red seam inside tightCanvas near seamXNorm
  const estSeam = Math.round((loc.seamXNorm ?? 0.82) * w);
  let seamX = estSeam;
  let bestEdge = -Infinity;
  for (let x = Math.max(40, estSeam - 35); x < Math.min(w - 20, estSeam + 35); x++) {
    let leftDark = 0;
    let rightRed = 0;
    for (let y = Math.floor(h * 0.2); y < Math.floor(h * 0.8); y++) {
      const idxL = (y * w + Math.max(0, x - 6)) * 4;
      const idxR = (y * w + Math.min(w - 1, x + 6)) * 4;
      const lumL = rgbLum(data[idxL], data[idxL + 1], data[idxL + 2]);
      if (lumL < 85) leftDark++;
      if (data[idxR] - Math.max(data[idxR + 1], data[idxR + 2]) > 20) rightRed++;
    }
    const sc = leftDark + rightRed * 1.25;
    if (sc > bestEdge) {
      bestEdge = sc;
      seamX = x;
    }
  }

  // Find drums left edge strictly within left bezel margin <= 5.5% of seamX (never jump into Drum 0 on cool glare!)
  const estPadSides = Math.round(seamX * 0.025);
  let drumsLeft = Math.max(4, estPadSides);
  for (let x = Math.round(seamX * 0.055); x >= 4; x--) {
    let blueHits = 0;
    for (let y = Math.floor(h * 0.2); y < Math.floor(h * 0.8); y++) {
      const idx = (y * w + x) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      if (isCyclometerBlue(r, g, b)) blueHits++;
    }
    if (blueHits > h * 0.32) {
      drumsLeft = x + 2;
      break;
    }
  }

  // Valley-align 5-drum lattice within +/-14px around drumsLeft so cuts fall cleanly between digits
  const fgCol = new Float32Array(seamX + 1);
  const yLo = Math.floor(h * 0.18);
  const yHi = Math.ceil(h * 0.82);
  for (let x = 0; x < seamX; x++) {
    let fgSum = 0;
    for (let y = yLo; y < yHi; y++) {
      const idx = (y * w + x) * 4;
      const lum = rgbLum(data[idx], data[idx + 1], data[idx + 2]);
      if (lum > 110) fgSum += lum - 110;
    }
    fgCol[x] = fgSum / Math.max(1, yHi - yLo);
  }
  let bestDrumsLeft = drumsLeft;
  let bestValleyCost = Infinity;
  const dlMin = Math.max(4, drumsLeft - 1);
  const dlMax = Math.min(Math.round(seamX * 0.085), drumsLeft + 14);
  for (let dl = dlMin; dl <= dlMax; dl += 2) {
    const dw = (seamX - dl) / 5;
    let seamFg = fgCol[dl] * 1.4;
    for (let k = 1; k <= 4; k++) {
      const sx = Math.round(dl + k * dw);
      for (let ox = -2; ox <= 2; ox++) {
        if (sx + ox >= 0 && sx + ox < seamX) seamFg += fgCol[sx + ox];
      }
    }
    const cost = seamFg + Math.abs(dl - drumsLeft) * 0.35;
    if (cost < bestValleyCost) {
      bestValleyCost = cost;
      bestDrumsLeft = dl;
    }
  }
  drumsLeft = bestDrumsLeft;

  const blackSpan = Math.max(120, seamX - drumsLeft);
  const drumW = blackSpan / 5;
  const cells: DrumCellExtraction[] = [];
  const rolloverPositions: number[] = [];
  const cellImageUrls: string[] = [];

  for (let i = 0; i < 6; i++) {
    const cx0 = i < 5 ? drumsLeft + i * drumW : seamX;
    const cx1 = i < 5 ? drumsLeft + (i + 1) * drumW : seamX + drumW * 1.06;
    const cell = extractDrumGlyph(data, w, h, cx0, cx1, i);
    cells.push(cell);
    if (cell.isRollover) {
      rolloverPositions.push(i);
    }
  }

  // Render crisp black-on-white spaced 6-drum strip, 5-drum integer strip, and padded cell PNGs
  const BW = 28;
  const BH = 44;
  const drawScale = 1.4;
  const drawW = Math.round(BW * drawScale);
  const drawH = Math.round(BH * drawScale);
  const pad = 26;
  const gap = 14;
  const outW = pad * 2 + 6 * drawW + 5 * gap + 18;
  const blackW = pad * 2 + 5 * drawW + 4 * gap;
  const outH = drawH + pad * 2;
  const stripCanvas = makeCanvas(outW, outH);
  const stCtx = stripCanvas.getContext('2d')!;
  stCtx.fillStyle = '#ffffff';
  stCtx.fillRect(0, 0, outW, outH);

  const blackCanvas = makeCanvas(blackW, outH);
  const blkCtx = blackCanvas.getContext('2d')!;
  blkCtx.fillStyle = '#ffffff';
  blkCtx.fillRect(0, 0, blackW, outH);

  let curX = pad;
  for (let i = 0; i < 6; i++) {
    const gCanvas = makeCanvas(BW, BH);
    const gCtx = gCanvas.getContext('2d')!;
    const gid = gCtx.createImageData(BW, BH);
    for (let k = 0; k < BW * BH; k++) {
      const ink = cells[i].bitmap[k] ? 0 : 255;
      const o = k * 4;
      gid.data[o] = ink;
      gid.data[o + 1] = ink;
      gid.data[o + 2] = ink;
      gid.data[o + 3] = 255;
    }
    gCtx.putImageData(gid, 0, 0);
    stCtx.imageSmoothingEnabled = true;
    stCtx.imageSmoothingQuality = 'high';
    stCtx.drawImage(gCanvas, 0, 0, BW, BH, curX, pad, drawW, drawH);
    if (i < 5) {
      blkCtx.imageSmoothingEnabled = true;
      blkCtx.imageSmoothingQuality = 'high';
      blkCtx.drawImage(gCanvas, 0, 0, BW, BH, curX, pad, drawW, drawH);
    }

    // Individual generously padded cell card (96x100, glyph 32x52) matched to Tesseract LSTM x-height
    const cellCard = makeCanvas(96, 100);
    const ccCtx = cellCard.getContext('2d')!;
    ccCtx.fillStyle = '#ffffff';
    ccCtx.fillRect(0, 0, 96, 100);
    ccCtx.imageSmoothingEnabled = true;
    ccCtx.imageSmoothingQuality = 'high';
    ccCtx.drawImage(gCanvas, 0, 0, BW, BH, 32, 24, 32, 52);
    cellImageUrls.push(cellCard.toDataURL('image/png'));

    curX += drawW;
    if (i === 4) {
      stCtx.fillStyle = '#000000';
      stCtx.beginPath();
      stCtx.arc(curX + gap * 0.55, pad + drawH - 5, 4, 0, Math.PI * 2);
      stCtx.fill();
      curX += 18;
    } else {
      curX += gap;
    }
  }

  // Build inverted high-contrast full drum strip as secondary image (black digits on white)
  const enhCanvas = makeCanvas(w, h);
  const eCtx = enhCanvas.getContext('2d')!;
  const eId = eCtx.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const isRightRed = x >= seamX;
      const score = isRightRed ? Math.min(g, b) * 0.72 + g * 0.28 : rgbLum(r, g, b);
      // Invert white-on-dark to black-on-white
      const val = Math.max(0, Math.min(255, 255 - Math.round(score * 1.15)));
      eId.data[idx] = val;
      eId.data[idx + 1] = val;
      eId.data[idx + 2] = val;
      eId.data[idx + 3] = 255;
    }
  }
  eCtx.putImageData(eId, 0, 0);

  // An integer-wheel rollover (positions 0..4) creates real integer ambiguity and should flag verification.
  const hasIntegerRollover = rolloverPositions.some((p) => p < 5);
  const missingDrums = cells.filter((cl) => !cl.hasInk).length;
  const needsVerification = hasIntegerRollover || missingDrums > 1;
  const unclearReason = hasIntegerRollover
    ? `Integer dial drum #${rolloverPositions.find((p) => p < 5)! + 1} is mid-rollover — please verify`
    : rolloverPositions.includes(5)
    ? 'Tenths drum (.1) is rolling over between values'
    : undefined;

  return {
    kind: 'cyclometer',
    reading: null, // Populated by Tesseract + morphological ensemble in ocrService
    digitsString: '',
    decimalDigits: 1,
    confidence: 0,
    needsVerification,
    unclearReason,
    perDigitConfidences: [],
    rolloverPositions,
    tesseractStripUrl: stripCanvas.toDataURL('image/png'),
    blackStripUrl: blackCanvas.toDataURL('image/png'),
    cellImageUrls,
    cellBitmaps: cells.map((cl) => cl.bitmap),
    cellAspectRatios: cells.map((cl) => cl.aspectRatio),
    enhancedCropUrl: enhCanvas.toDataURL('image/png'),
    cropBox: loc.cropBox,
    debugInfo: `cyclometer(${loc.locDebug || ''},drumsLeft=${drumsLeft},seamX=${seamX},rollovers=[${rolloverPositions.join(',')}],missing=${missingDrums})`,
  };
}

export function analyzeSubMeterVision(
  img: HTMLImageElement | HTMLCanvasElement
): VisionReadResult | null {
  const loc = locateMeterRegister(img);
  if (!loc) return null;
  if (loc.kind === 'cyclometer') {
    return readCyclometerRegister(loc);
  }
  if (loc.kind === 'lcd') {
    return readLcdRegister(loc);
  }
  return null;
}
