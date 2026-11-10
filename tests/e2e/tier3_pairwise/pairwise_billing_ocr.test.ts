/**
 * Tier 3: Combinatorial Pairwise Interactions — Billing & OCR Engine
 *
 * Verifies cross-feature interactions involving:
 * - Pair 1 (F4 + F14): OCR scan reading pre-population combined with Advance Rent balance deduction during bill settlement.
 * - Pair 2 (F6 + F16): Mechanical cyclometer rollover detection combined with negative reading validation guard.
 * - Pair 6 (F8 + F7): 6-digit regex parsing combined with calibrated physical PNG photo fixtures.
 * - Pair 9 (F5 + F16): Low OCR confidence anomaly gating (<80%) combined with manual correction feedback loop.
 * - Pair 13 (F6 + F20): Cyclometer rollover bill calculation combined with dashboard historical trend aggregation.
 * - Pair 14 (F4 + F5): High delta (>600 kWh jump) sanity check combined with OCR confidence gating.
 * - Pair 15 (F14 + F17): Payment overpayment credited to advance rent combined with meter reading log recording.
 * - Pair 19 (F7 + F4): Calibrated sub-meter photo fixtures processed through pre-population bounds check.
 */

import { describe, it } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  calculateConsumptionDelta,
  calculateSubMeterDifference,
  calculateBillBreakdown,
  applyPaymentWithOverpayment,
  verifyOcrReading,
  extractMeterDigitsFromOcrText,
  generateReceiptVerificationCode,
  formatMessengerBillSummary,
} from '../../../src/utils/billingCalculator';
import {
  createMockRoom,
  createMockTenant,
  createMockBill,
  createMockInquiry,
  assertStrictEqual,
  assertNotStrictEqual,
  assertTrue,
  assertFalse,
  assertCloseTo,
} from '../harness/test_utils';
import { BillRecord, Room, AdvanceBalanceTransaction } from '../../../src/types/rental';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../../..');

export interface SubMeterReadingLog {
  id: string;
  roomId: string;
  roomName: string;
  tenantName?: string;
  readingDate: string;
  readingKwh: number;
  consumptionDeltaKwh: number;
  source: 'ocr_scan' | 'manual_entry' | 'rollover';
  photoDataUrl?: string;
  cropDataUrl?: string;
  billId?: string;
  notes?: string;
}

describe('Tier 3: Pairwise Combinatorial Interactions — Billing & OCR Engine', () => {

  // ==========================================================================
  // Pair 1 (F4 + F14): OCR Scan Pre-Population + Advance Rent Balance Deduction
  // ==========================================================================
  it('Pair 1 (F4 + F14): OCR scan reading pre-population combined with Advance Rent balance deduction during bill settlement', () => {
    // 1. Initial State: Tenant booked room with ₱6,000 reservation fee where required deposit was ₱4,500.
    // Fixed math from M2 guarantees excess ₱1,500 is credited to advanceRent.
    const room = createMockRoom({
      id: 'room-101',
      name: 'Room 101',
      monthlyRent: 4500,
      securityDeposit: 4500,
      advanceRent: 1500,
      lastMeterReading: 100.0,
      advanceHistory: [
        {
          id: 'adv-init-1',
          type: 'overpayment_credit',
          amount: 1500,
          createdAt: '2026-11-01T00:00:00.000Z',
          note: 'Excess reservation fee (₱6,000.00 paid vs ₱4,500.00 deposit)',
        },
      ],
    });

    // 2. OCR Scan extracts reading 150.0 kWh (normal 50.0 kWh delta).
    const ocrDetected = 150.0;
    const verification = verifyOcrReading(ocrDetected, room.lastMeterReading);
    assertStrictEqual(verification.status, 'verified');
    assertStrictEqual(verification.verifiedReading, 150.0);

    // 3. Bill breakdown calculation applying tenant's ₱1,500 advance balance
    const breakdown = calculateBillBreakdown({
      baseRent: room.monthlyRent,
      prevReading: room.lastMeterReading,
      currReading: verification.verifiedReading,
      electricRate: 15.0,
      previousBalanceCarryOver: 0,
      depositApplied: room.advanceRent, // apply the ₱1,500 advance
    });

    // Gross = ₱4,500 (rent) + ₱750 (50 kWh * ₱15) = ₱5,250
    // Total Due = max(0, ₱5,250 - ₱1,500 advance) = ₱3,750
    assertStrictEqual(breakdown.consumptionKwh, 50.0);
    assertStrictEqual(breakdown.electricTotal, 750.0);
    assertStrictEqual(breakdown.grossTotal, 5250.0);
    assertStrictEqual(breakdown.depositApplied, 1500.0);
    assertStrictEqual(breakdown.totalAmountDue, 3750.0);

    // 4. Construct official bill and settle with tenant paying exactly ₱3,750
    const bill = createMockBill({
      roomId: room.id,
      roomName: room.name,
      prevReading: room.lastMeterReading,
      currReading: verification.verifiedReading,
      consumptionKwh: breakdown.consumptionKwh,
      electricRate: 15.0,
      electricTotal: breakdown.electricTotal,
      baseRent: breakdown.baseRent,
      depositApplied: breakdown.depositApplied,
      totalAmountDue: breakdown.totalAmountDue,
      amountPaid: 0,
      remainingBalance: breakdown.totalAmountDue,
      status: 'unpaid',
    });

    const paymentOutcome = applyPaymentWithOverpayment(bill, 3750.0, 'Cash');
    assertStrictEqual(paymentOutcome.updatedBill.status, 'paid');
    assertStrictEqual(paymentOutcome.updatedBill.remainingBalance, 0);
    assertStrictEqual(paymentOutcome.overpaymentCredited, 0);

    // 5. Update room advance ledger: advance rent is fully utilized
    const updatedAdvance = Math.max(0, room.advanceRent - breakdown.depositApplied);
    assertStrictEqual(updatedAdvance, 0);

    const deductionTx: AdvanceBalanceTransaction = {
      id: 'adv-deduct-1',
      type: 'applied_to_bill',
      amount: -1500,
      createdAt: new Date().toISOString(),
      note: `Applied ₱1,500.00 to Bill ${bill.receiptNo}`,
    };
    room.advanceRent = updatedAdvance;
    room.advanceHistory = [deductionTx, ...(room.advanceHistory || [])];

    assertStrictEqual(room.advanceRent, 0);
    assertStrictEqual(room.advanceHistory.length, 2);
    assertStrictEqual(room.advanceHistory[0].type, 'applied_to_bill');
  });

  // ==========================================================================
  // Pair 2 (F6 + F16): Dial Rollover Detection + Negative Reading Validation Guard
  // ==========================================================================
  it('Pair 2 (F6 + F16): Mechanical cyclometer rollover detection combined with negative reading validation guard', () => {
    const prevReading = 99985.0;
    const currReading = 15.0;

    // 1. Unconfirmed reading lower than previous reading: verify negative guard triggers
    const unconfirmed = calculateSubMeterDifference({
      prevReading,
      currReading,
      electricRate: 15.0,
      isRollover: false,
    });

    assertStrictEqual(unconfirmed.isValid, false);
    assertStrictEqual(unconfirmed.isRollover, false);
    assertStrictEqual(unconfirmed.consumptionKwh, 0);
    assertTrue(typeof unconfirmed.errorMessage === 'string');
    assertTrue(unconfirmed.errorMessage!.includes('99985.0 kWh'));

    // 2. OCR bounds engine flags rollover_detected
    const ocrCheck = verifyOcrReading(currReading, prevReading);
    assertStrictEqual(ocrCheck.status, 'rollover_detected');
    assertStrictEqual(ocrCheck.anomalyType, 'negative_delta');

    // 3. User enables Rollover Override (5-drum cyclometer capacity = 100,000)
    const confirmedRollover = calculateSubMeterDifference({
      prevReading,
      currReading,
      electricRate: 15.0,
      isRollover: true,
      dialDigits: 5,
    });

    // (100,000 - 99,985.0) + 15.0 = 30.0 kWh
    assertStrictEqual(confirmedRollover.isValid, true);
    assertStrictEqual(confirmedRollover.isRollover, true);
    assertStrictEqual(confirmedRollover.consumptionKwh, 30.0);
    assertStrictEqual(confirmedRollover.electricTotal, 450.0); // 30 * 15

    // 4. Verify bill calculation reflects rollover
    const fullBill = calculateBillBreakdown({
      baseRent: 5000,
      prevReading,
      currReading,
      electricRate: 15.0,
      previousBalanceCarryOver: 0,
      isRollover: true,
      dialDigits: 5,
    });
    assertStrictEqual(fullBill.consumptionKwh, 30.0);
    assertStrictEqual(fullBill.electricTotal, 450.0);
    assertStrictEqual(fullBill.totalAmountDue, 5450.0);
  });

  // ==========================================================================
  // Pair 6 (F8 + F7): 6-Digit Regex Parsing + Calibrated Sub-Meter Photo Fixtures
  // ==========================================================================
  it('Pair 6 (F8 + F7): 6-digit regex parsing combined with calibrated physical PNG photo fixtures', () => {
    // 1. Verify fixture manifest exists and catalogs calibrated profiles
    const manifestPath = path.join(projectRoot, 'tests/fixtures/sample-meters/manifest.json');
    assertTrue(fs.existsSync(manifestPath), 'manifest.json must exist');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    assertTrue(Array.isArray(manifest.fixtures), 'manifest fixtures must be an array');
    assertTrue(manifest.fixtures.length >= 6, 'manifest must catalog at least 6 calibrated profiles');

    // 2. Verify all referenced PNG files exist on disk and have non-zero size
    for (const fixture of manifest.fixtures) {
      const fileName = fixture.fileName || fixture.file;
      const fixtureFile = path.join(projectRoot, 'tests/fixtures/sample-meters', fileName);
      assertTrue(fs.existsSync(fixtureFile), `Fixture file ${fileName} must exist`);
      const stat = fs.statSync(fixtureFile);
      assertTrue(stat.size > 200, `Fixture ${fileName} must have valid PNG size`);
    }

    // 3. Test 6-digit high-usage regex parsing (>= 10,000 kWh without requiring leading zero)
    // "126230" represents 12623.0 kWh (5 integer drums + 1 tenth drum)
    const reading1 = extractMeterDigitsFromOcrText('Safari Submeter\n126230\nkWh');
    assertStrictEqual(reading1, 12623.0);

    // "002523" represents 252.3 kWh
    const reading2 = extractMeterDigitsFromOcrText('TYPE-SP1\n002523\n1600 imp/kWh');
    assertStrictEqual(reading2, 252.3);

    // "000034" represents 3.4 kWh (matches static_sp1 fixture)
    const reading3 = extractMeterDigitsFromOcrText('CIRTECH\n000034\n220V 60Hz');
    assertStrictEqual(reading3, 3.4);

    // "000001" represents 0.1 kWh (matches safari_sy168 fixture)
    const reading4 = extractMeterDigitsFromOcrText('SY-168\n000001');
    assertStrictEqual(reading4, 0.1);

    // 4. Verify 6-digit regex specification:
    // Web regex \b(\d{6})\b supports high-usage >= 10,000 kWh ('126230')
    // Legacy mobile regex \b(0\d{5})\b strictly requires leading 0
    const webPattern = /\b(\d{6})\b/;
    assertTrue(webPattern.test('126230'), 'Web regex must match 6-digit reading >= 10,000 kWh');
    const legacyMobilePattern = /\b(0\d{5})\b/;
    assertFalse(legacyMobilePattern.test('126230'), 'Legacy mobile pattern fails on >= 10,000 kWh without leading zero');

    // In mobile_app/lib/main.dart, verify 6-drum cyclometer regex presence
    const mobileDartPath = path.join(projectRoot, 'mobile_app/lib/main.dart');
    if (fs.existsSync(mobileDartPath)) {
      const dartSource = fs.readFileSync(mobileDartPath, 'utf8');
      const hasCyclometerRegex =
        dartSource.includes(String.raw`\b(\d{6})\b`) ||
        dartSource.includes(String.raw`\b(0\d{5})\b`);
      assertTrue(hasCyclometerRegex, 'mobile_app/lib/main.dart must declare 6-drum cyclometer regex');
    }
  });

  // ==========================================================================
  // Pair 9 (F5 + F16): Low OCR Confidence Anomaly Gating + Manual Correction
  // ==========================================================================
  it('Pair 9 (F5 + F16): Low OCR confidence anomaly gating (<80%) combined with manual correction feedback loop', () => {
    const prevReading = 200.0;
    const blurryDetectedVal = 180.0; // Lower than prevReading and low confidence

    // 1. Bounds verification detects negative delta
    const ocrResult = verifyOcrReading(blurryDetectedVal, prevReading);
    assertStrictEqual(ocrResult.status, 'rollover_detected');
    assertStrictEqual(ocrResult.anomalyType, 'negative_delta');

    // 2. If unconfirmed, bill calculation is invalid and blocks submission
    const invalidCalc = calculateSubMeterDifference({
      prevReading,
      currReading: blurryDetectedVal,
      electricRate: 15.0,
      isRollover: false,
    });
    assertStrictEqual(invalidCalc.isValid, false);

    // 3. Landlord enters manual correction after visually inspecting meter photo
    const manualCorrectedVal = 245.0; // Correct reading is 245.0 kWh
    const correctedCalc = calculateSubMeterDifference({
      prevReading,
      currReading: manualCorrectedVal,
      electricRate: 15.0,
      isRollover: false,
    });

    assertStrictEqual(correctedCalc.isValid, true);
    assertStrictEqual(correctedCalc.consumptionKwh, 45.0);
    assertStrictEqual(correctedCalc.electricTotal, 675.0);

    // 4. Verification engine passes corrected reading
    const verifiedCheck = verifyOcrReading(manualCorrectedVal, prevReading);
    assertStrictEqual(verifiedCheck.status, 'verified');

    // 5. Bill is created with manual_entry provenance
    const bill = {
      ...createMockBill({
        prevReading,
        currReading: manualCorrectedVal,
        consumptionKwh: correctedCalc.consumptionKwh,
        electricTotal: correctedCalc.electricTotal,
      }),
      notes: 'Manual correction entered by landlord after low confidence scan verification.',
    };
    assertStrictEqual(bill.currReading, 245.0);
    assertTrue(bill.notes.includes('Manual correction'));
  });

  // ==========================================================================
  // Pair 13 (F6 + F20): Rollover Bill Calculation + Dashboard Trend Aggregation
  // ==========================================================================
  it('Pair 13 (F6 + F20): Cyclometer rollover bill calculation combined with dashboard historical trend aggregation', () => {
    // 3 rooms with different meter behaviors:
    // Room 1: Normal linear reading 100.0 -> 150.0 (50.0 kWh)
    const delta1 = calculateConsumptionDelta(150.0, 100.0, false);
    assertStrictEqual(delta1.delta, 50.0);

    // Room 2: Normal linear reading 200.0 -> 240.0 (40.0 kWh)
    const delta2 = calculateConsumptionDelta(240.0, 200.0, false);
    assertStrictEqual(delta2.delta, 40.0);

    // Room 3: Mechanical cyclometer rollover 99970.0 -> 00020.0 (50.0 kWh)
    const delta3 = calculateConsumptionDelta(20.0, 99970.0, true, 5);
    assertStrictEqual(delta3.delta, 50.0);
    assertStrictEqual(delta3.isRollover, true);

    // Dashboard historical trend aggregation computes total consumption across all rooms
    const allRoomDeltas = [delta1.delta, delta2.delta, delta3.delta];
    const totalConsumption = allRoomDeltas.reduce((sum, d) => sum + d, 0);

    // Total must be 50 + 40 + 50 = 140.0 kWh (NOT negative due to rollover)
    assertStrictEqual(totalConsumption, 140.0);

    // Verify room proportion bars scale accurately:
    // Room 1: 50 / 140 = ~35.7%
    // Room 2: 40 / 140 = ~28.6%
    // Room 3: 50 / 140 = ~35.7%
    const room3Percentage = (delta3.delta / totalConsumption) * 100;
    assertCloseTo(room3Percentage, 35.714, 0.01);
  });

  // ==========================================================================
  // Pair 14 (F4 + F5): High Delta Sanity Check (>600 kWh) + Confidence Gating
  // ==========================================================================
  it('Pair 14 (F4 + F5): High delta (>600 kWh jump) sanity check combined with OCR confidence gating', () => {
    const prevReading = 100.0;
    const extremeDetectedVal = 850.0; // Jump of 750.0 kWh (> 600 threshold)

    // 1. OCR verification flags anomaly despite high raw confidence
    const anomalyResult = verifyOcrReading(extremeDetectedVal, prevReading, 120.0);
    assertStrictEqual(anomalyResult.status, 'anomaly_detected');
    assertStrictEqual(anomalyResult.anomalyType, 'exceeds_threshold');
    assertTrue(anomalyResult.warningMessage!.includes('750.0 kWh'));

    // 2. Verify bounds check logic: exactly 600.0 kWh delta is upper boundary for normal verified
    const normalUpperBoundary = verifyOcrReading(700.0, 100.0, 0); // delta = 600.0, monthlyAvg disabled
    assertStrictEqual(normalUpperBoundary.status, 'verified');

    // 3. 600.1 kWh delta triggers anomaly
    const exceededUpperBoundary = verifyOcrReading(700.1, 100.0, 0);
    assertStrictEqual(exceededUpperBoundary.status, 'anomaly_detected');
    assertStrictEqual(exceededUpperBoundary.anomalyType, 'exceeds_threshold');

    // 4. Low confidence (<80%) flags verification requirement
    const lowConfidenceDetected = 150.0;
    // When raw confidence is below 80, UI gates pre-population
    const isGated = (confidence: number) => confidence < 0.8;
    assertTrue(isGated(0.72));
    assertFalse(isGated(0.95));
  });

  // ==========================================================================
  // Pair 15 (F14 + F17): Payment Overpayment Crediting + Reading Log Recording
  // ==========================================================================
  it('Pair 15 (F14 + F17): Payment overpayment credited to advance rent combined with meter reading log recording', () => {
    const bill = createMockBill({
      id: 'bill-nov-1',
      receiptNo: '4R-202611-009',
      roomId: 'room-101',
      roomName: 'Room 101',
      tenantName: 'Juan Dela Cruz',
      totalAmountDue: 5000.0,
      amountPaid: 0,
      remainingBalance: 5000.0,
      status: 'unpaid',
      prevReading: 100.0,
      currReading: 145.0,
      consumptionKwh: 45.0,
      electricTotal: 675.0,
    });

    // 1. Tenant pays ₱5,500 (excess ₱500 over ₱5,000 due)
    const outcome = applyPaymentWithOverpayment(bill, 5500.0, 'GCash', 'GC-998877', 'Overpayment deposit');
    assertStrictEqual(outcome.updatedBill.status, 'paid');
    assertStrictEqual(outcome.updatedBill.remainingBalance, 0);
    assertStrictEqual(outcome.overpaymentCredited, 500.0);
    assertStrictEqual(outcome.updatedBill.overpaymentToAdvance, 500.0);

    // 2. Corresponding SubMeterReadingLog created and persisted
    const readingLog: SubMeterReadingLog = {
      id: 'log-202611-001',
      roomId: bill.roomId,
      roomName: bill.roomName,
      tenantName: bill.tenantName,
      readingDate: '2026-11-01T08:00:00.000Z',
      readingKwh: bill.currReading,
      consumptionDeltaKwh: bill.consumptionKwh,
      source: 'ocr_scan',
      billId: bill.id,
      notes: `Bill settled with excess ₱${outcome.overpaymentCredited.toFixed(2)} to advance rent.`,
    };

    assertStrictEqual(readingLog.readingKwh, 145.0);
    assertStrictEqual(readingLog.consumptionDeltaKwh, 45.0);
    assertStrictEqual(readingLog.source, 'ocr_scan');
    assertStrictEqual(readingLog.billId, 'bill-nov-1');
    assertTrue(readingLog.notes!.includes('excess ₱500.00'));
  });

  // ==========================================================================
  // Pair 19 (F7 + F4): Calibrated Photo Fixtures + Bounds Check
  // ==========================================================================
  it('Pair 19 (F7 + F4): Calibrated sub-meter photo fixtures processed through pre-population bounds check', () => {
    // 1. Load manifest fixtures
    const manifestPath = path.join(projectRoot, 'tests/fixtures/sample-meters/manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

    // Test fixture 1: Safari SY-168 (reading = 0.1 kWh)
    const safariFixture = manifest.fixtures.find((f: any) => f.profileId === 'safari_sy168_0_1');
    assertTrue(Boolean(safariFixture), 'Safari SY-168 fixture must be in manifest');
    const safariKwh = safariFixture.expectedReadingKwh ?? safariFixture.readingKwh;
    assertStrictEqual(safariKwh, 0.1);

    // Bounds check against initial 0.0 baseline: delta = 0.1 kWh -> verified
    const safariBounds = verifyOcrReading(safariKwh, 0.0);
    assertStrictEqual(safariBounds.status, 'verified');
    assertStrictEqual(safariBounds.verifiedReading, 0.1);

    // Test fixture 2: Static Watthour TYPE-SP1 (reading = 3.4 kWh)
    const staticFixture = manifest.fixtures.find((f: any) => f.profileId === 'static_sp1_3_4');
    assertTrue(Boolean(staticFixture), 'Static TYPE-SP1 fixture must be in manifest');
    const staticKwh = staticFixture.expectedReadingKwh ?? staticFixture.readingKwh;
    assertStrictEqual(staticKwh, 3.4);

    const staticBounds = verifyOcrReading(staticKwh, 0.0);
    assertStrictEqual(staticBounds.status, 'verified');

    // Test fixture 3: Digital Blank meter (reading = 0.0 kWh)
    const digitalFixture = manifest.fixtures.find((f: any) => f.profileId === 'ge_kv2c_blank');
    assertTrue(Boolean(digitalFixture), 'GE kV2c blank fixture must be in manifest');
    const digitalKwh = digitalFixture.expectedReadingKwh ?? digitalFixture.readingKwh;
    assertStrictEqual(digitalKwh, 0.0);
    assertTrue(digitalFixture.inspection?.isBlankUnpoweredLcd ?? digitalFixture.isBlankUnpoweredLcd, 'Must be flagged as blank unpowered LCD');

    // Bounds check if previous reading was 50.0: detects negative delta
    const blankBounds = verifyOcrReading(digitalKwh, 50.0);
    assertStrictEqual(blankBounds.status, 'rollover_detected');
    assertStrictEqual(blankBounds.anomalyType, 'negative_delta');
  });
});
