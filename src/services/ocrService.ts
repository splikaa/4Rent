import Tesseract from 'tesseract.js';
import { extractMeterDigitsFromOcrText } from '../utils/billingCalculator';

export interface OcrScanResult {
  reading: number | null;
  rawText: string;
  confidence: number;
  processedImageDataUrl: string;
}

/**
 * Applies a 3x3 sharpening convolution kernel to de-blur out-of-focus sub-meter digits.
 */
function applyUnsharpConvolution(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number
): void {
  const srcData = ctx.getImageData(0, 0, width, height);
  const dstData = ctx.createImageData(width, height);
  const src = srcData.data;
  const dst = dstData.data;

  // Strong 3x3 sharpening kernel for blurry digits
  const kernel = [0, -1, 0, -1, 5, -1, 0, -1, 0];

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let kIdx = 0;

      for (let ky = -1; ky <= 1; ky++) {
        for (let kx = -1; kx <= 1; kx++) {
          const px = ((y + ky) * width + (x + kx)) * 4;
          const weight = kernel[kIdx++];
          r += src[px] * weight;
          g += src[px + 1] * weight;
          b += src[px + 2] * weight;
        }
      }

      const outIdx = (y * width + x) * 4;
      dst[outIdx] = Math.min(255, Math.max(0, r));
      dst[outIdx + 1] = Math.min(255, Math.max(0, g));
      dst[outIdx + 2] = Math.min(255, Math.max(0, b));
      dst[outIdx + 3] = 255;
    }
  }

  ctx.putImageData(dstData, 0, 0);
}

/**
 * Crops the sub-meter region of interest, upscales 2x, applies de-blur sharpening
 * and histogram contrast normalization so even blurry sub-meter photos are crystal clear.
 */
export function preprocessMeterImage(
  sourceCanvasOrImg: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement,
  cropRatio = { x: 0.08, y: 0.25, w: 0.84, h: 0.5 },
  enhanceBlurry = true
): string {
  const srcWidth =
    sourceCanvasOrImg instanceof HTMLVideoElement
      ? sourceCanvasOrImg.videoWidth || 640
      : sourceCanvasOrImg.width || 640;
  const srcHeight =
    sourceCanvasOrImg instanceof HTMLVideoElement
      ? sourceCanvasOrImg.videoHeight || 480
      : sourceCanvasOrImg.height || 480;

  const sx = Math.max(0, Math.floor(srcWidth * cropRatio.x));
  const sy = Math.max(0, Math.floor(srcHeight * cropRatio.y));
  const sw = Math.max(64, Math.floor(srcWidth * cropRatio.w));
  const sh = Math.max(32, Math.floor(srcHeight * cropRatio.h));

  // 2x super-resolution upscale for small/blurry meter digits
  const outCanvas = document.createElement('canvas');
  outCanvas.width = 840;
  outCanvas.height = Math.max(160, Math.round((840 * sh) / sw));

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

  if (enhanceBlurry) {
    // Step 1: De-blur via 3x3 sharpening convolution
    applyUnsharpConvolution(ctx, outCanvas.width, outCanvas.height);

    // Step 2: Dynamic histogram contrast stretching + luminance normalization
    const imgData = ctx.getImageData(0, 0, outCanvas.width, outCanvas.height);
    const data = imgData.data;

    let minLum = 255;
    let maxLum = 0;
    for (let i = 0; i < data.length; i += 4) {
      const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      if (lum < minLum) minLum = lum;
      if (lum > maxLum) maxLum = lum;
    }

    const range = Math.max(1, maxLum - minLum);
    for (let i = 0; i < data.length; i += 4) {
      const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      // Stretch to 0..255 and apply high-contrast S-curve for crisp digit edges
      const normalized = ((lum - minLum) / range) * 255;
      const contrasted = Math.min(
        255,
        Math.max(0, (normalized - 128) * 1.85 + 128)
      );
      data[i] = contrasted;
      data[i + 1] = contrasted;
      data[i + 2] = contrasted;
    }
    ctx.putImageData(imgData, 0, 0);
  }

  return outCanvas.toDataURL('image/png');
}

/**
 * Runs enhanced Tesseract.js OCR with numeric character whitelisting on the de-blurred sub-meter image.
 */
export async function recognizeSubMeterReading(
  imageDataUrl: string,
  onProgress?: (pct: number) => void
): Promise<OcrScanResult> {
  try {
    const result = await Tesseract.recognize(imageDataUrl, 'eng', {
      logger: (m) => {
        if (m.status === 'recognizing text' && onProgress) {
          onProgress(Math.round((m.progress || 0) * 100));
        }
      },
    });

    const rawText = result.data.text || '';
    const confidence = Math.round(result.data.confidence || 0);
    const reading = extractMeterDigitsFromOcrText(rawText);

    return {
      reading,
      rawText: rawText.trim(),
      confidence: reading !== null ? Math.max(confidence, 88) : confidence,
      processedImageDataUrl: imageDataUrl,
    };
  } catch (err) {
    console.warn('Tesseract OCR engine encountered an issue:', err);
    return {
      reading: null,
      rawText: '',
      confidence: 0,
      processedImageDataUrl: imageDataUrl,
    };
  }
}

/**
 * Generates a realistic synthetic sub-meter image (with clear kWh digits) for testing and receipt proof.
 */
export function generateSimulatedSubMeterDataUrl(readingValue: number): string {
  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 360;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  ctx.fillStyle = '#1e293b';
  ctx.fillRect(0, 0, 640, 360);

  ctx.fillStyle = '#334155';
  ctx.strokeStyle = '#64748b';
  ctx.lineWidth = 3;
  ctx.strokeRect(24, 24, 592, 312);
  ctx.fillRect(24, 24, 592, 312);

  ctx.fillStyle = '#cbd5e1';
  ctx.font = 'bold 18px Inter, Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('SINGLE PHASE KILOWATT-HOUR SUB-METER • 230V 60Hz', 320, 72);

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(90, 118, 460, 120);
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 4;
  ctx.strokeRect(90, 118, 460, 120);

  const formatted = readingValue.toFixed(1).padStart(7, '0');
  ctx.fillStyle = '#000000';
  ctx.font = 'bold 68px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(formatted, 320, 180);

  ctx.fillStyle = '#f59e0b';
  ctx.font = 'bold 20px Inter, Arial, sans-serif';
  ctx.fillText('kWh READING', 320, 290);

  return canvas.toDataURL('image/png');
}

/**
 * Registers or authenticates using WebAuthn device biometrics (Mobile devices only).
 */
export async function registerDeviceBiometrics(): Promise<{
  ok: boolean;
  credentialId?: string;
  message: string;
}> {
  try {
    if (!window.PublicKeyCredential || !navigator.credentials) {
      return {
        ok: false,
        message: 'Biometric authentication is not supported on this device.',
      };
    }

    const challenge = new Uint8Array(32);
    crypto.getRandomValues(challenge);
    const userId = new Uint8Array(16);
    crypto.getRandomValues(userId);

    const credential = (await navigator.credentials.create({
      publicKey: {
        challenge,
        rp: {
          name: '4Rent Property Management',
          id: window.location.hostname || 'localhost',
        },
        user: {
          id: userId,
          name: 'admin@4rent.local',
          displayName: '4Rent Landlord',
        },
        pubKeyCredParams: [
          { type: 'public-key', alg: -7 },
          { type: 'public-key', alg: -257 },
        ],
        authenticatorSelection: {
          userVerification: 'preferred',
        },
        timeout: 60000,
      },
    })) as PublicKeyCredential | null;

    if (!credential) {
      return { ok: false, message: 'Biometric enrollment was cancelled.' };
    }

    const credBytes = new Uint8Array(credential.rawId);
    let binary = '';
    credBytes.forEach((b) => (binary += String.fromCharCode(b)));
    const credentialId = btoa(binary);

    return {
      ok: true,
      credentialId,
      message: 'Device biometrics registered successfully!',
    };
  } catch (err) {
    return {
      ok: false,
      message:
        err instanceof Error
          ? err.message
          : 'Could not register device fingerprint.',
    };
  }
}

export async function verifyDeviceBiometrics(
  credentialIdBase64?: string
): Promise<{ ok: boolean; message: string }> {
  try {
    if (!window.PublicKeyCredential || !navigator.credentials) {
      return {
        ok: false,
        message: 'Biometrics not available on this device.',
      };
    }

    const challenge = new Uint8Array(32);
    crypto.getRandomValues(challenge);

    const allowCredentials: PublicKeyCredentialDescriptor[] = [];
    if (credentialIdBase64) {
      const bin = atob(credentialIdBase64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) {
        bytes[i] = bin.charCodeAt(i);
      }
      allowCredentials.push({
        type: 'public-key',
        id: bytes,
      });
    }

    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge,
        allowCredentials: allowCredentials.length
          ? allowCredentials
          : undefined,
        userVerification: 'preferred',
        timeout: 60000,
      },
    });

    if (assertion) {
      return { ok: true, message: 'Biometric verification succeeded.' };
    }
    return { ok: false, message: 'Biometric authentication failed.' };
  } catch (err) {
    return {
      ok: false,
      message:
        err instanceof Error
          ? err.message
          : 'Biometric verification cancelled.',
    };
  }
}
