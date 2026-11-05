import Tesseract from 'tesseract.js';
import { extractMeterDigitsFromOcrText } from '../utils/billingCalculator';

export interface OcrScanResult {
  reading: number | null;
  rawText: string;
  confidence: number;
  processedImageDataUrl: string;
}

/**
 * Crops the sub-meter region of interest and applies contrast enhancement
 * so mechanical drum digits or digital LCD segments are crisp for Tesseract OCR.
 */
export function preprocessMeterImage(
  sourceCanvasOrImg: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement,
  cropRatio = { x: 0.1, y: 0.3, w: 0.8, h: 0.4 },
  highContrast = true
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

  const outCanvas = document.createElement('canvas');
  outCanvas.width = 600;
  outCanvas.height = Math.round((600 * sh) / sw);

  const ctx = outCanvas.getContext('2d');
  if (!ctx) return '';

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

  if (highContrast) {
    const imgData = ctx.getImageData(0, 0, outCanvas.width, outCanvas.height);
    const data = imgData.data;

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      // Luminance
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      // Enhance contrast around mid-point
      const contrasted = Math.min(255, Math.max(0, (lum - 128) * 1.65 + 128));
      data[i] = contrasted;
      data[i + 1] = contrasted;
      data[i + 2] = contrasted;
    }
    ctx.putImageData(imgData, 0, 0);
  }

  return outCanvas.toDataURL('image/png');
}

/**
 * Runs Tesseract.js OCR on a preprocessed sub-meter image and extracts the kWh reading.
 */
export async function recognizeSubMeterReading(
  imageDataUrl: string,
  onProgress?: (pct: number) => void
): Promise<OcrScanResult> {
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
    confidence,
    processedImageDataUrl: imageDataUrl,
  };
}

/**
 * Generates a realistic synthetic sub-meter image (with clear kWh digits) so landlords
 * can test the OCR scanner on Desktop or Mobile even without pointing a camera at a physical meter.
 */
export function generateSimulatedSubMeterDataUrl(readingValue: number): string {
  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 360;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  // Outer meter casing
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(0, 0, 640, 360);

  // Inner metallic faceplate
  ctx.fillStyle = '#334155';
  ctx.strokeStyle = '#64748b';
  ctx.lineWidth = 3;
  ctx.strokeRect(24, 24, 592, 312);
  ctx.fillRect(24, 24, 592, 312);

  // Header label on meter
  ctx.fillStyle = '#cbd5e1';
  ctx.font = 'bold 18px Inter, Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('SINGLE PHASE KILOWATT-HOUR SUB-METER • 230V 60Hz', 320, 72);

  // White high-contrast OCR reading window inside the crop guide area (y: 0.30 to 0.70)
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(90, 118, 460, 120);
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 4;
  ctx.strokeRect(90, 118, 460, 120);

  // Render clean bold digits inside the white window for reliable OCR detection
  const formatted = readingValue.toFixed(1).padStart(7, '0');
  ctx.fillStyle = '#000000';
  ctx.font = 'bold 68px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(formatted, 320, 180);

  // Footer label
  ctx.fillStyle = '#f59e0b';
  ctx.font = 'bold 20px Inter, Arial, sans-serif';
  ctx.fillText('kWh READING', 320, 290);

  return canvas.toDataURL('image/png');
}

/**
 * Registers or authenticates using WebAuthn device biometrics (Fingerprint / FaceID / Windows Hello).
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
        message: 'Biometric authentication is not supported by this browser/device.',
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
          { type: 'public-key', alg: -7 }, // ES256
          { type: 'public-key', alg: -257 }, // RS256
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
        message: 'Biometrics not available on this browser.',
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
        allowCredentials: allowCredentials.length ? allowCredentials : undefined,
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
        err instanceof Error ? err.message : 'Biometric verification cancelled.',
    };
  }
}

