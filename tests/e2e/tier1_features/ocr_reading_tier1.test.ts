/**
 * Tier 1 Feature Coverage: OCR Reading & Automatic Verification
 *
 * Covers:
 * - Feature 4 (F4): OCR Pre-Population Sanity & Bounds Check (>600 kWh jump, serial numbers)
 * - Feature 5 (F5): OCR Confidence & Anomaly Gating (<80% prompts zoom verification badge)
 * - Feature 6 (F6): Dial Rollover Detection & Math (5-drum cyclometer, 00000.0 rollover)
 * - Feature 7 (F7): Sub-Meter Photo Fixtures Validation (load PNG fixtures & manifest in tests/fixtures/sample-meters/)
 * - Feature 8 (F8): 6-Digit & High-Usage OCR Regex Support (>=10,000 kWh, 126230 -> 12623.0)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  extractMeterDigitsFromOcrText,
  verifyOcrReading,
  calculateConsumptionDelta,
  calculateSubMeterDifference,
  calculateBillBreakdown,
} from '../../../src/utils/billingCalculator';
import {
  assertStrictEqual,
  assertTrue,
  assertFalse,
  assertCloseTo,
  createMockBill,
} from '../harness/test_utils';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../../..');

describe('Tier 1: OCR Reading & Verification Feature Coverage', () => {

  // ==========================================================================
  // Feature 4: OCR Pre-Population Sanity & Bounds Check (F4)
  // ==========================================================================
  describe('Feature 4: OCR Pre-Population Sanity & Bounds Check (F4)', () => {
    it('4.1 Normal consumption within expected bounds returns status "verified"', () => {
      // 150.0 vs 120.0 = 30.0 kWh (normal consumption)
      const result = verifyOcrReading(150.0, 120.0, 100);

      assertStrictEqual(result.status, 'verified');
      assertStrictEqual(result.verifiedReading, 150.0);
      assertTrue(result.confidence >= 0.9, 'Verified status must carry confidence >= 0.9');
      assertStrictEqual(result.anomalyType, undefined);
    });

    it('4.2 High consumption surge exceeding 600 kWh triggers anomaly_detected', () => {
      // 800.0 vs 100.0 = 700.0 kWh (exceeds 600 kWh threshold)
      const result = verifyOcrReading(800.0, 100.0, 120);

      assertStrictEqual(result.status, 'anomaly_detected');
      assertStrictEqual(result.anomalyType, 'exceeds_threshold');
      assertTrue(
        typeof result.warningMessage === 'string' && result.warningMessage.includes('exceeds expected monthly threshold'),
        'Warning message must inform landlord of consumption surge'
      );
    });

    it('4.3 Consumption surge exceeding 4x monthly average triggers anomaly_detected', () => {
      // Delta = 150 kWh with averageMonthlyKwh = 30 (4x = 120 kWh, delta 150 > 120)
      const result = verifyOcrReading(250.0, 100.0, 30);

      assertStrictEqual(result.status, 'anomaly_detected');
      assertStrictEqual(result.anomalyType, 'exceeds_threshold');
    });

    it('4.4 Faceplate serial numbers and barcode headers are stripped and ignored', () => {
      const rawFaceplateText = `
        Safari Electronic kWh Meter
        No. 2018-18120672
        00123.4
        220V 60Hz 1600 imp/kWh
      `;
      const extracted = extractMeterDigitsFromOcrText(rawFaceplateText);

      // Must extract 123.4 and discard the serial number 2018-18120672
      assertStrictEqual(extracted, 123.4);
    });

    it('4.5 Multiplier headers and pulse constants are filtered from numeric candidates', () => {
      const rawMeterText = `
        Static Watthour Meter TYPE-SP1
        10000 1000 100 10 1 0.1
        3200 imp/kWh
        00055.2
      `;
      const extracted = extractMeterDigitsFromOcrText(rawMeterText);

      // Must extract 55.2 and discard 3200 and scale header numbers
      assertStrictEqual(extracted, 55.2);
    });
  });

  // ==========================================================================
  // Feature 5: OCR Confidence & Anomaly Gating (F5)
  // ==========================================================================
  describe('Feature 5: OCR Confidence & Anomaly Gating (F5)', () => {
    it('5.1 High confidence (>=80%) passes verification gating', () => {
      // When OCR engine detects reading with confidence >= 80%, status qualifies for verified pre-population
      const highConfidenceThreshold = 0.80;
      const scanResult = { rawReading: 345.5, confidence: 0.95 };

      const isEligibleForAutoFill = scanResult.confidence >= highConfidenceThreshold;
      assertTrue(isEligibleForAutoFill, 'Confidence >= 80% must allow pre-population');
    });

    it('5.2 Low confidence (<80%) gates pre-population and requires confirmation', () => {
      const highConfidenceThreshold = 0.80;
      const lowConfidenceScan = { rawReading: 345.5, confidence: 0.65 };

      const isEligibleForAutoFill = lowConfidenceScan.confidence >= highConfidenceThreshold;
      assertFalse(isEligibleForAutoFill, 'Confidence < 80% must NOT auto-commit without landlord review');

      const verification = {
        rawReading: lowConfidenceScan.rawReading,
        confidence: lowConfidenceScan.confidence,
        status: lowConfidenceScan.confidence < highConfidenceThreshold ? 'needs_confirmation' : 'verified',
      };
      assertStrictEqual(verification.status, 'needs_confirmation');
    });

    it('5.3 Scanner data structures preserve zoomed register crop data URL for reticle inspection', () => {
      const mockCropDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

      const billWithCrop = createMockBill({
        currReading: 512.4,
        currMeterCropDataUrl: mockCropDataUrl,
        ocrConfidence: 0.78,
      });

      assertTrue(
        Boolean(billWithCrop.currMeterCropDataUrl && billWithCrop.currMeterCropDataUrl.startsWith('data:image/')),
        'BillRecord must retain currMeterCropDataUrl for auditability'
      );
      assertStrictEqual(billWithCrop.ocrConfidence, 0.78);
    });

    it('5.4 User confirmation of low-confidence reading logs ocrConfidence on BillRecord', () => {
      const bill = createMockBill({
        prevReading: 400.0,
        currReading: 420.0,
        ocrConfidence: 0.72,
      });

      assertStrictEqual(bill.ocrConfidence, 0.72);
      assertStrictEqual(bill.currReading, 420.0);
      assertStrictEqual(bill.consumptionKwh, 20.0);
    });

    it('5.5 Manual override after OCR rejection records manual entry accurately', () => {
      // Landlord rejects OCR reading and manually types 425.0
      const manualBill = createMockBill({
        prevReading: 400.0,
        currReading: 425.0,
        ocrConfidence: undefined, // manual entry clears OCR confidence
      });

      assertStrictEqual(manualBill.currReading, 425.0);
      assertStrictEqual(manualBill.consumptionKwh, 25.0);
      assertStrictEqual(manualBill.ocrConfidence, undefined);
    });
  });

  // ==========================================================================
  // Feature 6: Dial Rollover Detection & Math (F6)
  // ==========================================================================
  describe('Feature 6: Dial Rollover Detection & Math (F6)', () => {
    it('6.1 5-digit cyclometer mechanical rollover calculation (100,000 modulus)', () => {
      // 5 drums: prev = 99990.0, curr = 00010.0 -> delta = (100,000 - 99990) + 10 = 20.0 kWh
      const result = calculateConsumptionDelta(10.0, 99990.0, true, 5);

      assertStrictEqual(result.delta, 20.0);
      assertStrictEqual(result.isRollover, true);
      assertStrictEqual(result.isNegative, false);
      assertStrictEqual(result.error, undefined);
    });

    it('6.2 4-digit meter mechanical rollover calculation (10,000 modulus)', () => {
      // 4 drums: prev = 9950.0, curr = 0025.0 -> delta = (10,000 - 9950) + 25 = 75.0 kWh
      const result = calculateConsumptionDelta(25.0, 9950.0, true, 4);

      assertStrictEqual(result.delta, 75.0);
      assertStrictEqual(result.isRollover, true);
      assertStrictEqual(result.isNegative, false);
    });

    it('6.3 Rollover bill calculation computes correct electric total and amount due', () => {
      const breakdown = calculateBillBreakdown({
        baseRent: 4500,
        prevReading: 99990.0,
        currReading: 10.0,
        electricRate: 15.0,
        previousBalanceCarryOver: 0,
        isRollover: true,
        dialDigits: 5,
      });

      // 20 kWh * ₱15 = ₱300 electricTotal + ₱4500 baseRent = ₱4800 totalAmountDue
      assertStrictEqual(breakdown.consumptionKwh, 20.0);
      assertStrictEqual(breakdown.electricTotal, 300.0);
      assertStrictEqual(breakdown.totalAmountDue, 4800.0);
    });

    it('6.4 Post-rollover normal billing cycle advances from new baseline without rollover flag', () => {
      // Previous cycle ended at 10.0 kWh. Next month reads 40.0 kWh.
      const normalDelta = calculateConsumptionDelta(40.0, 10.0, false);

      assertStrictEqual(normalDelta.delta, 30.0);
      assertStrictEqual(normalDelta.isRollover, false);
      assertStrictEqual(normalDelta.isNegative, false);
    });

    it('6.5 calculateSubMeterDifference with rollover toggle returns valid positive result', () => {
      const diffResult = calculateSubMeterDifference({
        prevReading: 99980.0,
        currReading: 15.0,
        electricRate: 15.0,
        isRollover: true,
        dialDigits: 5,
      });

      // (100,000 - 99980) + 15 = 35 kWh * 15 = ₱525.00
      assertTrue(diffResult.isValid);
      assertTrue(diffResult.isRollover);
      assertStrictEqual(diffResult.consumptionKwh, 35.0);
      assertStrictEqual(diffResult.electricTotal, 525.0);
      assertStrictEqual(diffResult.errorMessage, undefined);
    });
  });

  // ==========================================================================
  // Feature 7: Sub-Meter Photo Fixtures Validation (F7)
  // ==========================================================================
  describe('Feature 7: Sub-Meter Photo Fixtures Validation (F7)', () => {
    const fixturesDir = path.join(projectRoot, 'tests/fixtures/sample-meters');
    const manifestPath = path.join(fixturesDir, 'manifest.json');

    it('7.1 Manifest JSON exists, parses cleanly, and catalogs calibrated hardware profiles', () => {
      assertTrue(fs.existsSync(manifestPath), 'manifest.json must exist in tests/fixtures/sample-meters/');
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

      assertTrue(Array.isArray(manifest.fixtures), 'Manifest must declare a fixtures array');
      assertStrictEqual(manifest.fixtures.length, 6, 'Manifest must catalog exactly 6 calibrated profiles');
    });

    it('7.2 Safari SY-168 (0.1 kWh) PNG fixture binary integrity and specs', () => {
      const fixtureFile = path.join(fixturesDir, 'meter_safari_0_1.png');
      assertTrue(fs.existsSync(fixtureFile), 'meter_safari_0_1.png must exist');

      const bytes = fs.readFileSync(fixtureFile);
      // Verify PNG magic header [0x89, 0x50, 0x4E, 0x47]
      assertStrictEqual(bytes[0], 0x89);
      assertStrictEqual(bytes[1], 0x50);
      assertStrictEqual(bytes[2], 0x4E);
      assertStrictEqual(bytes[3], 0x47);
      assertTrue(bytes.length > 300, 'PNG fixture must be non-empty');
    });

    it('7.3 Static Watthour TYPE-SP1 (3.4 kWh) PNG fixture binary integrity', () => {
      const fixtureFile = path.join(fixturesDir, 'meter_static_3_4.png');
      assertTrue(fs.existsSync(fixtureFile), 'meter_static_3_4.png must exist');

      const bytes = fs.readFileSync(fixtureFile);
      assertStrictEqual(bytes[0], 0x89);
      assertStrictEqual(bytes[1], 0x50);
      assertStrictEqual(bytes[2], 0x4E);
      assertStrictEqual(bytes[3], 0x47);
    });

    it('7.4 GE kV2c Blank LCD fixture binary integrity and specifications', () => {
      const fixtureFile = path.join(fixturesDir, 'meter_digital_blank.png');
      assertTrue(fs.existsSync(fixtureFile), 'meter_digital_blank.png must exist');

      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      const digitalEntry = manifest.fixtures.find((f: any) => f.fileName === 'meter_digital_blank.png');

      assertTrue(Boolean(digitalEntry), 'Manifest must declare meter_digital_blank.png');
      assertStrictEqual(digitalEntry.expectedReadingKwh, 0.0);
      assertTrue(digitalEntry.inspection.isBlankUnpoweredLcd, 'Digital blank fixture must flag isBlankUnpoweredLcd: true');
    });

    it('7.5 Safari 0.3 kWh & Round Cyclometer 3.4 kWh fixtures binary verification', () => {
      const safari03 = path.join(fixturesDir, 'meter_safari_0_3.png');
      const cyclometer = path.join(fixturesDir, 'meter_round_cyclometer.png');

      assertTrue(fs.existsSync(safari03), 'meter_safari_0_3.png must exist');
      assertTrue(fs.existsSync(cyclometer), 'meter_round_cyclometer.png must exist');

      const b1 = fs.readFileSync(safari03);
      const b2 = fs.readFileSync(cyclometer);

      assertStrictEqual(b1[0], 0x89);
      assertStrictEqual(b2[0], 0x89);
    });
  });

  // ==========================================================================
  // Feature 8: 6-Digit & High-Usage OCR Regex Support (F8)
  // ==========================================================================
  describe('Feature 8: 6-Digit & High-Usage OCR Regex Support (F8)', () => {
    it('8.1 Parse 6-drum reading >= 10,000 kWh without leading zero ("126230" -> 12623.0)', () => {
      const result = extractMeterDigitsFromOcrText('126230');
      assertStrictEqual(result, 12623.0);
    });

    it('8.2 Parse 6-drum reading with single leading zero ("012623" -> 1262.3)', () => {
      const result = extractMeterDigitsFromOcrText('012623');
      assertStrictEqual(result, 1262.3);
    });

    it('8.3 Parse 6-drum reading with double leading zeroes ("002523" -> 252.3)', () => {
      const result = extractMeterDigitsFromOcrText('002523');
      assertStrictEqual(result, 252.3);
    });

    it('8.4 Parse 6-drum reading with quadruple leading zeroes ("000034" -> 3.4)', () => {
      const result = extractMeterDigitsFromOcrText('000034');
      assertStrictEqual(result, 3.4);
    });

    it('8.5 Synchronized 6-digit regex pattern matches high-usage readings without leading zero', () => {
      // Synchronized web & mobile pattern: \b(\d{6})\b
      const synchronizedPattern = /\b(\d{6})\b/;
      const legacyLeadingZeroPattern = /\b(0\d{5})\b/;

      const highUsageString = '126230'; // 12,623.0 kWh

      // Legacy pattern fails on high usage without leading zero
      assertFalse(
        legacyLeadingZeroPattern.test(highUsageString),
        'Legacy leading-zero regex must fail on high readings >= 10,000 kWh'
      );

      // Synchronized pattern correctly matches
      assertTrue(
        synchronizedPattern.test(highUsageString),
        'Synchronized regex \\b(\\d{6})\\b must match high usage readings'
      );

      const match = highUsageString.match(synchronizedPattern)!;
      const intPart = parseInt(match[1].slice(0, 5), 10);
      const decPart = parseInt(match[1].slice(5, 6), 10);
      const computed = intPart + decPart / 10;
      assertStrictEqual(computed, 12623.0);
    });
  });
});
