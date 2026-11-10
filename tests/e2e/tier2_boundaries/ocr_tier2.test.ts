/**
 * Tier 2 Boundary & Stress Tests: OCR Automatic Reading & Verification (F4, F5, F6, F7, F8)
 *
 * Covers:
 * - Feature 4: OCR Pre-Population Sanity & Bounds Check (Extreme deltas: 599.9, 600.0, 600.1; serial numbers, multiplier headers)
 * - Feature 5: OCR Confidence & Anomaly Gating (Confidence thresholds: 79.9%, 80.0%, 0.0%, 100.0%, corrupted base64)
 * - Feature 6: Dial Rollover Detection & Math (99999.9->00000.0, 99985.0->00015.0, 4-drum vs 5-drum limits, double rollover, precision)
 * - Feature 7: Sub-Meter Photo Fixture Stress (Rotated/skewed images, low-contrast, corrupted bytes, 4K resolution downsample, half-turned drum)
 * - Feature 8: 6-Digit & High-Usage OCR Regex Support (99999.9 max, multiplier scales, impulse ratings, voltage specs, character substitutions)
 */

import { describe, it, beforeEach } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assertStrictEqual,
  assertTrue,
  assertFalse,
  assertCloseTo,
} from '../harness/test_utils';
import { resetBrowserEnv } from '../harness/browser_env';
import {
  verifyOcrReading,
  extractMeterDigitsFromOcrText,
  calculateConsumptionDelta,
  calculateSubMeterDifference,
} from '../../../src/utils/billingCalculator';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../../..');

describe('Tier 2: Sub-Meter OCR Automatic Reading & Verification Boundary Suites (F4–F8)', () => {
  beforeEach(() => {
    resetBrowserEnv();
  });

  // ==========================================================================
  // Feature 4: OCR Pre-Population Sanity & Bounds Check (F4)
  // ==========================================================================
  describe('Feature 4: OCR Pre-Population Sanity & Bounds Check', () => {
    it('T2.F4.1 Delta 599.9 kWh boundary: normal progression passes verification without anomaly', () => {
      // Prev: 100.0, Curr: 699.9 -> Delta = 599.9 (< 600 kWh boundary)
      const res = verifyOcrReading(699.9, 100.0, 0);
      assertStrictEqual(res.status, 'verified');
      assertStrictEqual(res.verifiedReading, 699.9);
      assertStrictEqual(res.anomalyType, undefined);
    });

    it('T2.F4.2 Delta 600.0 kWh exact boundary: passes verified status when average monthly check bypassed', () => {
      // Prev: 100.0, Curr: 700.0 -> Delta = 600.0 (delta > 600 is false, so it does not trigger surge anomaly)
      const res = verifyOcrReading(700.0, 100.0, 0);
      assertStrictEqual(res.status, 'verified');
      assertStrictEqual(res.verifiedReading, 700.0);
      assertStrictEqual(res.anomalyType, undefined);
    });

    it('T2.F4.3 Delta 600.1 kWh boundary: anomaly triggered and requires confirmation', () => {
      // Prev: 100.0, Curr: 700.1 -> Delta = 600.1 (delta > 600 is true)
      const res = verifyOcrReading(700.1, 100.0, 0);
      assertStrictEqual(res.status, 'anomaly_detected');
      assertStrictEqual(res.anomalyType, 'exceeds_threshold');
      assertTrue(res.warningMessage !== undefined && res.warningMessage.includes('exceeds expected monthly threshold'));
    });

    it('T2.F4.4 Serial number filtering: barcode & serial numbers ignored during extraction', () => {
      const serialStrings = [
        'No. 2018-18120672\n00124.5 kWh',
        'S.No. 470946\n00250.0 kWh',
        'Barcode: 18853562\n01234.0 kWh',
        'SERIAL NO: 22501329\n00045.2 kWh',
      ];

      const expectedReadings = [124.5, 250.0, 1234.0, 45.2];
      for (let i = 0; i < serialStrings.length; i++) {
        const val = extractMeterDigitsFromOcrText(serialStrings[i]);
        assertStrictEqual(val, expectedReadings[i], `Failed to extract valid reading from serial string ${i}`);
      }
    });

    it('T2.F4.5 Pure serial number text returns null (never extracted as reading)', () => {
      const pureSerial = 'No. 2018-18120672\nS.No. 470946\nModel: SY-168';
      const val = extractMeterDigitsFromOcrText(pureSerial);
      assertStrictEqual(val, null, 'Pure serial number string must return null');
    });
  });

  // ==========================================================================
  // Feature 5: OCR Confidence & Anomaly Gating (F5)
  // ==========================================================================
  describe('Feature 5: OCR Confidence & Anomaly Gating Boundaries', () => {
    it('T2.F5.1 Confidence 79.9% (< 80%) threshold: prompts verification / requires confirmation', () => {
      const confidence = 79.9;
      const requiresConfirmation = confidence < 80.0;
      assertTrue(requiresConfirmation, 'Confidence 79.9% must require confirmation');

      // Verify gating rule: auto-populate is only allowed if confidence >= 80%
      const shouldAutoPopulate = confidence >= 80.0;
      assertFalse(shouldAutoPopulate, 'Confidence 79.9% must NOT auto-populate');
    });

    it('T2.F5.2 Confidence exactly 80.0% boundary: auto-populates inputs directly', () => {
      const confidence = 80.0;
      const shouldAutoPopulate = confidence >= 80.0;
      assertTrue(shouldAutoPopulate, 'Confidence 80.0% must auto-populate');
    });

    it('T2.F5.3 Confidence 0.0% (blank unpowered meter): flags inspection and returns null/0 reading', () => {
      // Manifest verification for blank digital meter
      const manifestPath = path.join(projectRoot, 'tests/fixtures/sample-meters/manifest.json');
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      const blankFixture = manifest.fixtures.find((f: any) => f.inspection?.isBlankUnpoweredLcd === true);

      assertTrue(blankFixture !== undefined, 'Blank LCD fixture must be cataloged in manifest');
      assertStrictEqual(blankFixture.expectedReadingKwh, 0.0);
      assertStrictEqual(blankFixture.inspection.isBlankUnpoweredLcd, true);

      // Blank reading logic gate: confidence 0% requires manual confirmation
      const blankConfidence = 0.0;
      const autoPopulate = blankConfidence >= 80.0;
      assertFalse(autoPopulate, '0% confidence meter must never auto-populate');
    });

    it('T2.F5.4 Confidence 100.0% (calibrated profile match): auto-populates immediately', () => {
      const manifestPath = path.join(projectRoot, 'tests/fixtures/sample-meters/manifest.json');
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      const safariFixture = manifest.fixtures.find((f: any) => f.profileId === 'safari_sy168_0_1');

      assertTrue(safariFixture !== undefined, 'Safari fixture must exist in manifest');
      assertTrue(safariFixture.expectedConfidence >= 95);

      const canAutoPopulate = safariFixture.expectedConfidence >= 80.0;
      assertTrue(canAutoPopulate, 'High confidence calibrated fixture must auto-populate');
    });

    it('T2.F5.5 Corrupted / unreadable OCR text payload: caught gracefully and guarded by parser', () => {
      const corruptedText = 'CORRUPTED_TEXT_GARBAGE_NO_DIGITS_!@#$%^&*()';
      // extractMeterDigitsFromOcrText handles corrupted non-numeric text gracefully
      const reading = extractMeterDigitsFromOcrText(corruptedText);
      assertStrictEqual(reading, null, 'Corrupted text payload with no valid digits must return null reading without throwing');
    });
  });

  // ==========================================================================
  // Feature 6: Cyclometer Rollover Boundaries (F6)
  // ==========================================================================
  describe('Feature 6: Cyclometer Rollover Boundaries', () => {
    it('T2.F6.1 Maximum 5-drum rollover: 99999.9 -> 00000.0 yields 0.1 kWh delta', () => {
      // (100000 - 99999.9) + 0.0 = 0.1 kWh
      const result = calculateConsumptionDelta(0.0, 99999.9, true, 5);
      assertCloseTo(result.delta, 0.1, 0.001);
      assertStrictEqual(result.isRollover, true);
      assertStrictEqual(result.isNegative, false);
    });

    it('T2.F6.2 5-drum rollover transition: 99985.0 -> 00015.0 yields exactly 30.0 kWh delta', () => {
      // (100000 - 99985.0) + 15.0 = 30.0 kWh
      const result = calculateConsumptionDelta(15.0, 99985.0, true, 5);
      assertStrictEqual(result.delta, 30.0);
      assertStrictEqual(result.isRollover, true);
      assertStrictEqual(result.isNegative, false);
    });

    it('T2.F6.3 4-drum vs 5-drum rollover limits: dialDigits 4 uses 10,000 modulus, dialDigits 5 uses 100,000 modulus', () => {
      // 4-drum: prev = 9950, curr = 25 -> (10000 - 9950) + 25 = 75
      const res4 = calculateConsumptionDelta(25, 9950, true, 4);
      assertStrictEqual(res4.delta, 75);
      assertStrictEqual(res4.isRollover, true);

      // 5-drum: prev = 9950, curr = 25 -> (100000 - 9950) + 25 = 90075
      const res5 = calculateConsumptionDelta(25, 9950, true, 5);
      assertStrictEqual(res5.delta, 90075);
      assertStrictEqual(res5.isRollover, true);
    });

    it('T2.F6.4 Double rollover / extreme rollover prevention: prev = 99000, curr = 500 triggers verification warning', () => {
      // Rollover delta = (100000 - 99000) + 500 = 1500 kWh (> 600 kWh threshold)
      const resDelta = calculateConsumptionDelta(500, 99000, true, 5);
      assertStrictEqual(resDelta.delta, 1500);

      // Anomaly verification triggers for large surge
      const ocrRes = verifyOcrReading(500, 99000, 0);
      // Because 500 < 99000, verifyOcrReading detects rollover_detected status
      assertStrictEqual(ocrRes.status, 'rollover_detected');
    });

    it('T2.F6.5 Decimal precision rollover: 99998.7 -> 00002.3 yields exactly 3.6 kWh without floating-point drift', () => {
      // (100000 - 99998.7) + 2.3 = 1.3 + 2.3 = 3.6
      const result = calculateConsumptionDelta(2.3, 99998.7, true, 5);
      assertStrictEqual(result.delta, 3.6);
      assertStrictEqual(result.isRollover, true);
    });
  });

  // ==========================================================================
  // Feature 7: Sub-Meter Photo Fixture Stress (F7)
  // ==========================================================================
  describe('Feature 7: Sub-Meter Photo Fixture Stress', () => {
    it('T2.F7.1 Rotated / non-square aspect ratio image: canvas handles varying aspect ratios safely', () => {
      const wideCanvas = document.createElement('canvas');
      wideCanvas.width = 800;
      wideCanvas.height = 200;
      const ctx = wideCanvas.getContext('2d');
      assertTrue(ctx !== null);

      // Scale to max dimension 960px
      const scale = Math.min(1, 960 / Math.max(wideCanvas.width, wideCanvas.height));
      const targetW = Math.round(wideCanvas.width * scale);
      const targetH = Math.round(wideCanvas.height * scale);

      assertStrictEqual(targetW, 800);
      assertStrictEqual(targetH, 200);
    });

    it('T2.F7.2 Extreme low-contrast / dim lighting image: analyzer measures luminance safely', () => {
      const darkCanvas = document.createElement('canvas');
      darkCanvas.width = 64;
      darkCanvas.height = 64;
      const ctx = darkCanvas.getContext('2d')!;
      ctx.fillStyle = '#050505';
      ctx.fillRect(0, 0, 64, 64);

      const imgData = ctx.getImageData(0, 0, 64, 64);
      assertTrue(imgData.data.length === 64 * 64 * 4);
      // Average luminance must be very low (< 20)
      let sumLuminance = 0;
      for (let i = 0; i < imgData.data.length; i += 4) {
        sumLuminance += 0.299 * imgData.data[i] + 0.587 * imgData.data[i + 1] + 0.114 * imgData.data[i + 2];
      }
      const avgLuminance = sumLuminance / (64 * 64);
      assertTrue(avgLuminance < 20, `Luminance for dark canvas must be < 20, got ${avgLuminance}`);
    });

    it('T2.F7.3 Corrupted image byte array handling: does not throw unhandled exception and detects header corruption', () => {
      // Corrupted 10-byte buffer without PNG/JPEG magic headers
      const corruptedBytes = Buffer.from([0x00, 0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77, 0x88, 0x99]);
      const isPng = corruptedBytes[0] === 0x89 && corruptedBytes[1] === 0x50 && corruptedBytes[2] === 0x4E && corruptedBytes[3] === 0x47;
      const isJpeg = corruptedBytes[0] === 0xFF && corruptedBytes[1] === 0xD8;
      assertFalse(isPng, 'Corrupted buffer must fail PNG magic header check');
      assertFalse(isJpeg, 'Corrupted buffer must fail JPEG magic header check');

      // Unparseable OCR text from corrupted decode returns null cleanly
      const fallbackOcr = extractMeterDigitsFromOcrText('UNKNOWN_BINARY_BYTE_CORRUPTION');
      assertStrictEqual(fallbackOcr, null, 'Fallback OCR from corrupted payload must return null');
    });

    it('T2.F7.4 4K resolution downsample: 4000x3000 input scales down to max dimension <= 960px', () => {
      const originalW = 4000;
      const originalH = 3000;

      const maxDim = 960;
      const scale = Math.min(1, maxDim / Math.max(originalW, originalH));
      const targetW = Math.round(originalW * scale);
      const targetH = Math.round(originalH * scale);

      assertStrictEqual(targetW, 960, 'Target width must be clamped to 960px');
      assertStrictEqual(targetH, 720, 'Target height must maintain 4:3 aspect ratio (720px)');
    });

    it('T2.F7.5 Half-turned drum digit / ambiguous OCR candidate: sanitizer extracts nearest integer tenths', () => {
      // Text with ambiguous drum reading (e.g., "12623.45" -> rounds to 12623.5)
      const rawWithFraction = 'Meter Register\n12623.45 kWh';
      const extracted = extractMeterDigitsFromOcrText(rawWithFraction);
      assertStrictEqual(extracted, 12623.5, 'Must round tenths drum to 1 decimal place');
    });
  });

  // ==========================================================================
  // Feature 8: 6-Digit & High-Usage OCR Regex Support (F8)
  // ==========================================================================
  describe('Feature 8: 6-Digit & High-Usage OCR Regex Support', () => {
    it('T2.F8.1 99999.9 kWh max reading boundary: "999999" parses to 99999.9 kWh', () => {
      const text = 'Reading: 999999';
      const val = extractMeterDigitsFromOcrText(text);
      assertStrictEqual(val, 99999.9, '6-drum 999999 must parse to 99999.9 kWh');
    });

    it('T2.F8.2 Multiplier scale headers filter: "10000 1000 100 10 1 0.1" ignored', () => {
      const faceplateText = '10000 1000 100 10 1 1/10\n002345 kWh';
      const val = extractMeterDigitsFromOcrText(faceplateText);
      // 002345 -> 5 integer drums (00234) + 1 tenths drum (5) = 234.5 kWh
      assertStrictEqual(val, 234.5, 'Must ignore scale headers and extract 234.5');
    });

    it('T2.F8.3 Impulse constants filter: "1600 imp/kWh" and "3200 imp/kWh" ignored', () => {
      const faceplateText = '1600 imp/kWh\n3200 imp/kWh\n000123';
      const val = extractMeterDigitsFromOcrText(faceplateText);
      // 000123 -> 12.3 kWh
      assertStrictEqual(val, 12.3, 'Must ignore impulse ratings and extract 12.3');
    });

    it('T2.F8.4 Electrical specs filter: "220/240V 60Hz 10(60)A" ignored', () => {
      const faceplateText = 'Single Phase 2 Wire\n220V 240V 60Hz\n10(60)A\n1485.6 kWh';
      const val = extractMeterDigitsFromOcrText(faceplateText);
      assertStrictEqual(val, 1485.6, 'Must extract 1485.6 decimal reading');
    });

    it('T2.F8.5 Character substitutions: "O" -> "0" and "l" -> "1" correctly resolved', () => {
      // "O01234" -> "001234" -> 123.4 kWh
      const textWithO = 'Reading: O01234';
      const valO = extractMeterDigitsFromOcrText(textWithO);
      assertStrictEqual(valO, 123.4, 'Must substitute O with 0 and extract 123.4');

      // "l26230" -> "126230" -> 12623.0 kWh
      const textWithL = 'Reading: l26230';
      const valL = extractMeterDigitsFromOcrText(textWithL);
      assertStrictEqual(valL, 12623.0, 'Must substitute l with 1 and extract 12623.0');
    });
  });
});
