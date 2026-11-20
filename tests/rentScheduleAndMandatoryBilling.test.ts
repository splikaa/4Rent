import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  calculateLatePaymentPenalty,
  calculateMonthlyRentProration,
  calculateMonthlyRentSummary,
  getBillingMonthSchedule,
  getDaysInBillingMonth,
  updateIndependentMonthlyElectricRate,
  validateMonthlyMeterReading,
} from '../src/utils/rentSchedule';
import {
  computeBillComponentBalances,
  executeGenerateBillTransaction,
  executeRecordPaymentTransaction,
} from '../src/utils/financialEngine';
import { recalculateActiveBillsForRates } from '../src/utils/billingCalculator';
import {
  commitBillingTransaction,
  DEFAULT_SETTINGS,
  loadBills,
  loadMonthlyReadings,
  loadRooms,
  migrateDatabaseIfNeeded,
  saveBills,
  saveRooms,
} from '../src/services/storageService';
import { PrintableA4Receipt } from '../src/components/receipt/PrintableA4Receipt';
import { ReceiptModal } from '../src/components/receipt/ReceiptModal';
import { SettingsView } from '../src/components/settings/SettingsView';
import { SubMeterScannerModal } from '../src/components/ocr/SubMeterScannerModal';
import { ManageRoomsView } from '../src/components/rooms/ManageRoomsView';
import { AllPaymentsView } from '../src/components/payments/AllPaymentsView';
import { AppSettings, BillRecord, Room } from '../src/types/rental';

function installSimpleLocalStorage(failOnKey?: string) {
  const store = new Map<string, string>();
  const prevDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const mock = {
    get length() {
      return store.size;
    },
    key(index: number) {
      return Array.from(store.keys())[index] ?? null;
    },
    getItem(key: string) {
      return store.has(key) ? store.get(key)! : null;
    },
    setItem(key: string, value: string) {
      if (failOnKey && key === failOnKey) {
        const err = new Error('Simulated storage commit failure');
        err.name = 'QuotaExceededError';
        throw err;
      }
      store.set(key, String(value));
    },
    removeItem(key: string) {
      store.delete(key);
    },
    clear() {
      store.clear();
    },
  };
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    writable: true,
    value: mock,
  });
  return {
    store,
    restore() {
      if (prevDescriptor) {
        Object.defineProperty(globalThis, 'localStorage', prevDescriptor);
      } else {
        delete (globalThis as { localStorage?: unknown }).localStorage;
      }
    },
  };
}

function makeOccupiedRoom(overrides: Partial<Room> = {}): Room {
  return {
    id: 'room-101',
    name: 'Room 101',
    monthlyRent: 4500,
    lastMeterReading: 1250,
    status: 'occupied',
    tenant: {
      id: 'ten-101',
      fullName: 'Maria Santos',
      phone: '0917-555-0101',
      moveInDate: '2026-01-01',
      dueDayOfMonth: 10,
    },
    unpaidBalance: 0,
    securityDeposit: 4500,
    securityDepositPaid: 0,
    advanceRent: 0,
    advanceHistory: [],
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeBillDraft(overrides: Partial<BillRecord> = {}): BillRecord {
  return {
    id: 'bill-jan-101',
    receiptNo: '4R-202601-101',
    roomId: 'room-101',
    roomName: 'Room 101',
    tenantName: 'Maria Santos',
    billingPeriod: 'Jan 2026',
    billingMonthKey: '2026-01',
    createdAt: '2026-01-05T10:00:00.000Z',
    dueDate: '2026-01-10T12:00:00.000Z',
    prevReading: 1250,
    currReading: 1310,
    consumptionKwh: 60,
    electricRate: 12.5,
    electricTotal: 750,
    electricityVerified: true,
    meterReadingId: 'mread-room-101-2026-01',
    baseRent: 4500,
    monthlyRentFull: 4500,
    isProrated: false,
    occupiedDays: 31,
    daysInBillingMonth: 31,
    latePenalty: 0,
    totalRentDue: 4500,
    securityDepositRequired: 4500,
    previousBalanceCarryOver: 0,
    depositApplied: 0,
    totalAmountDue: 5250,
    amountPaid: 0,
    overpaymentToAdvance: 0,
    remainingBalance: 5250,
    status: 'unpaid',
    paymentHistory: [],
    updatedAt: '2026-01-05T10:00:00.000Z',
    ...overrides,
  };
}

test('Task 3: Monthly electricity rates stay strictly independent across months and preserve historical bills', () => {
  let settings: Pick<AppSettings, 'defaultElectricRate' | 'monthlyElectricRates'> = {
    defaultElectricRate: 15.0,
    monthlyElectricRates: {
      '2026-01': 12.5,
      '2026-02': 13.2,
      '2026-03': 11.8,
    },
  };

  // Update February only -> January, March, and defaultElectricRate must NOT change
  const updatedRates = updateIndependentMonthlyElectricRate(settings, '2026-02', 14.25);
  assert.equal(updatedRates['2026-01'], 12.5);
  assert.equal(updatedRates['2026-02'], 14.25);
  assert.equal(updatedRates['2026-03'], 11.8);
  assert.equal(settings.defaultElectricRate, 15.0);

  // Finalized/paid January bill preserves its historical ₱12.50/kWh rate even if rates change later
  const room = makeOccupiedRoom();
  const janPaidBill = makeBillDraft({
    status: 'paid',
    isLocked: true,
    amountPaid: 5250,
    remainingBalance: 0,
    electricRate: 12.5,
    electricTotal: 750,
  });
  const recalc = recalculateActiveBillsForRates(
    [janPaidBill],
    {
      ...DEFAULT_SETTINGS,
      defaultElectricRate: 18.0,
      monthlyElectricRates: { '2026-01': 19.0, '2026-02': 14.25 },
    },
    [room]
  );
  assert.equal(recalc.updatedCount, 0);
  assert.equal(recalc.bills[0].electricRate, 12.5);
  assert.equal(recalc.bills[0].electricTotal, 750);
});

test('Task 4: Monthly payment schedule is anchored to billing month (1st-10th window, late penalty starts 11th)', () => {
  const onDueDate = getBillingMonthSchedule('2026-03', '2026-03-10');
  assert.equal(onDueDate.paymentPeriodStart, '2026-03-01');
  assert.equal(onDueDate.paymentDueDate, '2026-03-10');
  assert.equal(onDueDate.latePenaltyStartDate, '2026-03-11');
  assert.equal(onDueDate.isWithinPaymentWindow, true);
  assert.equal(onDueDate.isPastDue, false);
  assert.equal(onDueDate.daysPastDue, 0);

  const day11 = getBillingMonthSchedule('2026-03', '2026-03-11');
  assert.equal(day11.isWithinPaymentWindow, false);
  assert.equal(day11.isPastDue, true);
  assert.equal(day11.daysPastDue, 1);

  // Even when reference date is in April, billing month Feb schedule remains anchored to Feb 1-10
  const febBilledInApr = getBillingMonthSchedule('2026-02', '2026-04-02');
  assert.equal(febBilledInApr.paymentDueDate, '2026-02-10');
  assert.equal(febBilledInApr.isPastDue, true);
});

test('Task 4: Monthly rent proration accounts for 28, 29 (leap year), 30, and 31-day months plus mid-month move-in/move-out', () => {
  assert.equal(getDaysInBillingMonth('2024-02'), 29); // Leap year
  assert.equal(getDaysInBillingMonth('2025-02'), 28); // Non-leap year
  assert.equal(getDaysInBillingMonth('2026-04'), 30);
  assert.equal(getDaysInBillingMonth('2026-01'), 31);

  // Mid-month move-in on Feb 15, 2024 (29-day leap year -> 15 occupied days: Feb 15..29)
  const leapMoveIn = calculateMonthlyRentProration({
    monthlyRent: 5800,
    billingPeriod: '2024-02',
    occupancyStartDate: '2024-02-15',
  });
  assert.equal(leapMoveIn.daysInMonth, 29);
  assert.equal(leapMoveIn.occupiedDays, 15);
  assert.equal(leapMoveIn.isProrated, true);
  assert.equal(leapMoveIn.dailyRate, 200);
  assert.equal(leapMoveIn.chargeableRent, 3000);

  // Mid-month move-in on Feb 15, 2025 (28-day non-leap year -> 14 occupied days: Feb 15..28)
  const nonLeapMoveIn = calculateMonthlyRentProration({
    monthlyRent: 5600,
    billingPeriod: '2025-02',
    occupancyStartDate: '2025-02-15',
  });
  assert.equal(nonLeapMoveIn.daysInMonth, 28);
  assert.equal(nonLeapMoveIn.occupiedDays, 14);
  assert.equal(nonLeapMoveIn.chargeableRent, 2800);

  // Mid-month move-out on Apr 15, 2026 (30-day month -> 15 occupied days)
  const midMonthMoveOut = calculateMonthlyRentProration({
    monthlyRent: 4500,
    billingPeriod: '2026-04',
    occupancyStartDate: '2026-01-01',
    occupancyEndDate: '2026-04-15',
  });
  assert.equal(midMonthMoveOut.daysInMonth, 30);
  assert.equal(midMonthMoveOut.occupiedDays, 15);
  assert.equal(midMonthMoveOut.chargeableRent, 2250);

  // Exact divided daily value (truncated to 2 decimals): 5000 / 30 = 166.66/day -> 1 day = 166.66, 2 days = 333.32, full 30 days = 5000
  const oneDay5000 = calculateMonthlyRentProration({
    monthlyRent: 5000,
    billingPeriod: '2026-04',
    occupancyStartDate: '2026-04-01',
    occupancyEndDate: '2026-04-01',
  });
  assert.equal(oneDay5000.daysInMonth, 30);
  assert.equal(oneDay5000.occupiedDays, 1);
  assert.equal(oneDay5000.dailyRate, 166.66);
  assert.equal(oneDay5000.chargeableRent, 166.66);

  const twoDays5000 = calculateMonthlyRentProration({
    monthlyRent: 5000,
    billingPeriod: '2026-04',
    occupancyStartDate: '2026-04-01',
    occupancyEndDate: '2026-04-02',
  });
  assert.equal(twoDays5000.occupiedDays, 2);
  assert.equal(twoDays5000.dailyRate, 166.66);
  assert.equal(twoDays5000.chargeableRent, 333.32);

  // Both mid-month move-in (Apr 10) and move-out (Apr 19) -> 10 occupied days of 30
  const shortStay = calculateMonthlyRentProration({
    monthlyRent: 4500,
    billingPeriod: '2026-04',
    occupancyStartDate: '2026-04-10',
    occupancyEndDate: '2026-04-19',
  });
  assert.equal(shortStay.occupiedDays, 10);
  assert.equal(shortStay.chargeableRent, 1500);
});

test('Task 4: Late Charges apply strictly starting Day 11 (Day 10 = 0, Day 11 = 166.66, Day 12 = 333.32 for 5000/30) and support custom modes', () => {
  // Default daily divided rent late charges on ₱5,000 in 30-day month (April 2026):
  // Day 10 -> ₱0.00 (still within 1st-10th payment window)
  const day10Default = calculateLatePaymentPenalty({
    chargeableRent: 5000,
    billingPeriod: '2026-04',
    latePenaltyConfig: DEFAULT_SETTINGS.latePenalty,
    referenceDate: '2026-04-10',
  });
  assert.equal(day10Default.isLate, false);
  assert.equal(day10Default.daysPastDue, 0);
  assert.equal(day10Default.penaltyAmount, 0);

  // Day 11 (1 day late) -> exact divided daily value 5000 / 30 = ₱166.66
  const day11Default = calculateLatePaymentPenalty({
    chargeableRent: 5000,
    billingPeriod: '2026-04',
    latePenaltyConfig: DEFAULT_SETTINGS.latePenalty,
    referenceDate: '2026-04-11',
  });
  assert.equal(day11Default.isLate, true);
  assert.equal(day11Default.isConfigured, true);
  assert.equal(day11Default.daysPastDue, 1);
  assert.equal(day11Default.penaltyAmount, 166.66);

  // Day 12 (2 days late, unpaid on Day 11) -> 166.66 + 166.66 = ₱333.32
  const day12Default = calculateLatePaymentPenalty({
    chargeableRent: 5000,
    billingPeriod: '2026-04',
    latePenaltyConfig: DEFAULT_SETTINGS.latePenalty,
    referenceDate: '2026-04-12',
  });
  assert.equal(day12Default.daysPastDue, 2);
  assert.equal(day12Default.penaltyAmount, 333.32);

  // Day 13 (3 days late) -> 166.66 * 3 = ₱499.98
  const day13Default = calculateLatePaymentPenalty({
    chargeableRent: 5000,
    billingPeriod: '2026-04',
    latePenaltyConfig: DEFAULT_SETTINGS.latePenalty,
    referenceDate: '2026-04-13',
  });
  assert.equal(day13Default.daysPastDue, 3);
  assert.equal(day13Default.penaltyAmount, 499.98);

  // Explicit disabled config -> ₱0 even on Day 15
  const disabled = calculateLatePaymentPenalty({
    chargeableRent: 4500,
    billingPeriod: '2026-03',
    latePenaltyConfig: { enabled: false, mode: 'fixed', value: null, applyPerDay: false },
    referenceDate: '2026-03-15',
  });
  assert.equal(disabled.isLate, true);
  assert.equal(disabled.isConfigured, false);
  assert.equal(disabled.penaltyAmount, 0);

  // Fixed ₱250 flat: Day 10 = ₱0, Day 11 = ₱250
  const day10 = calculateLatePaymentPenalty({
    chargeableRent: 4500,
    billingPeriod: '2026-03',
    latePenaltyConfig: { enabled: true, mode: 'fixed', value: 250, applyPerDay: false },
    referenceDate: '2026-03-10',
  });
  assert.equal(day10.penaltyAmount, 0);

  const day11Fixed = calculateLatePaymentPenalty({
    chargeableRent: 4500,
    billingPeriod: '2026-03',
    latePenaltyConfig: { enabled: true, mode: 'fixed', value: 250, applyPerDay: false },
    referenceDate: '2026-03-11',
  });
  assert.equal(day11Fixed.penaltyAmount, 250);

  // Percentage 5% on ₱4,500 on Day 11 = ₱225
  const pctSummary = calculateMonthlyRentSummary({
    monthlyRent: 4500,
    billingPeriod: '2026-03',
    latePenaltyConfig: { enabled: true, mode: 'percentage', value: 5, applyPerDay: false },
    referenceDate: '2026-03-11',
  });
  assert.equal(pctSummary.latePenalty, 225);
  assert.equal(pctSummary.totalRentDue, 4725);

  // Per-day fixed ₱50/day on Day 13 (3 days past 10th) = ₱150
  const perDay = calculateLatePaymentPenalty({
    chargeableRent: 4500,
    billingPeriod: '2026-03',
    latePenaltyConfig: { enabled: true, mode: 'fixed', value: 50, applyPerDay: true },
    referenceDate: '2026-03-13',
  });
  assert.equal(perDay.daysPastDue, 3);
  assert.equal(perDay.penaltyAmount, 150);
});

test('Task 5: Mandatory electricity validation enforces consumption math, verification, negative rejection, and deduplication', () => {
  // Exact spec example: Prev 1,250, Curr 1,310, Rate ₱12.50 -> 60 kWh -> ₱750.00
  const valid = validateMonthlyMeterReading({
    roomId: 'room-101',
    roomName: 'Room 101',
    billingPeriod: 'Jan 2026',
    previousReadingKwh: 1250,
    currentReadingKwh: 1310,
    electricRate: 12.5,
    isVerified: true,
    source: 'ocr_verified',
    ocrExtractedReadingKwh: 1310,
  });
  assert.equal(valid.isValid, true);
  assert.equal(valid.consumptionKwh, 60);
  assert.equal(valid.electricCharge, 750);
  assert.ok(valid.record);

  // Missing current reading blocked
  const missingCurr = validateMonthlyMeterReading({
    roomId: 'room-101',
    roomName: 'Room 101',
    billingPeriod: 'Jan 2026',
    previousReadingKwh: 1250,
    currentReadingKwh: '',
    electricRate: 12.5,
    isVerified: true,
  });
  assert.equal(missingCurr.isValid, false);
  assert.equal(missingCurr.errorCode, 'MISSING_CURRENT_READING');

  // Unverified reading blocked
  const unverified = validateMonthlyMeterReading({
    roomId: 'room-101',
    roomName: 'Room 101',
    billingPeriod: 'Jan 2026',
    previousReadingKwh: 1250,
    currentReadingKwh: 1310,
    electricRate: 12.5,
    isVerified: false,
  });
  assert.equal(unverified.isValid, false);
  assert.equal(unverified.errorCode, 'UNVERIFIED_ELECTRICITY_READING');

  // Negative consumption rejected without documented replacement/reset
  const negativeBlocked = validateMonthlyMeterReading({
    roomId: 'room-101',
    roomName: 'Room 101',
    billingPeriod: 'Jan 2026',
    previousReadingKwh: 1250,
    currentReadingKwh: 1200,
    electricRate: 12.5,
    isVerified: true,
  });
  assert.equal(negativeBlocked.isValid, false);
  assert.equal(negativeBlocked.errorCode, 'NEGATIVE_CONSUMPTION_UNAUTHORIZED');

  // Negative consumption accepted ONLY with documented meter reset
  const documentedReset = validateMonthlyMeterReading({
    roomId: 'room-101',
    roomName: 'Room 101',
    billingPeriod: 'Jan 2026',
    previousReadingKwh: 1250,
    currentReadingKwh: 45,
    electricRate: 12.5,
    isVerified: true,
    meterResetOrReplacement: true,
    meterResetType: 'meter_reset',
    meterResetDocumentedReason: 'Replaced defective sub-meter on Jan 4, 2026',
  });
  assert.equal(documentedReset.isValid, true);
  assert.equal(documentedReset.consumptionKwh, 45);
  assert.equal(documentedReset.electricCharge, 562.5);

  // Conflicting duplicate reading for same room & billing month rejected
  const duplicate = validateMonthlyMeterReading({
    roomId: 'room-101',
    roomName: 'Room 101',
    billingPeriod: 'Jan 2026',
    previousReadingKwh: 1250,
    currentReadingKwh: 1350,
    electricRate: 12.5,
    isVerified: true,
    existingMonthlyReadings: [valid.record!],
  });
  assert.equal(duplicate.isValid, false);
  assert.equal(duplicate.errorCode, 'DUPLICATE_MONTHLY_METER_RECORD');
});

test('Task 5: Closes rent-without-electricity loophole (blocks unverified billing, prevents duplicate period, keeps unpaid electricity PARTIAL)', () => {
  const room = makeOccupiedRoom();

  // 1. Billing blocked if electricity reading is not verified
  const unverifiedAttempt = executeGenerateBillTransaction({
    room,
    existingBills: [],
    billDraft: makeBillDraft({ electricityVerified: false }),
    requireVerifiedElectricity: true,
  });
  assert.equal(unverifiedAttempt.ok, false);
  assert.equal(unverifiedAttempt.errorCode, 'MISSING_VERIFIED_ELECTRICITY_READING');

  // 2. Generate verified monthly bill (Rent ₱4,500 + Electricity ₱750 = ₱5,250)
  const gen = executeGenerateBillTransaction({
    room,
    existingBills: [],
    billDraft: makeBillDraft({ electricityVerified: true }),
    requireVerifiedElectricity: true,
  });
  assert.equal(gen.ok, true);
  assert.ok(gen.createdBill);
  assert.ok(gen.updatedRoom);

  // 3. Duplicate active bill for same room & billing month is blocked
  const dupBillAttempt = executeGenerateBillTransaction({
    room: gen.updatedRoom!,
    existingBills: [gen.createdBill!],
    billDraft: makeBillDraft({ id: 'bill-jan-101-dup', receiptNo: '4R-202601-101B' }),
    requireVerifiedElectricity: true,
  });
  assert.equal(dupBillAttempt.ok, false);
  assert.equal(dupBillAttempt.errorCode, 'DUPLICATE_BILLING_PERIOD');

  // 4. Tenant pays ONLY ₱4,500 rent while ignoring ₱750 electricity -> MUST stay PARTIAL (NEVER PAID!)
  const rentOnlyPay = executeRecordPaymentTransaction({
    bill: gen.createdBill!,
    room: gen.updatedRoom!,
    paymentAmount: 4500,
    method: 'Cash',
    allocationTarget: 'rent',
  });
  assert.equal(rentOnlyPay.ok, true);
  const afterRent = rentOnlyPay.updatedBill!;
  assert.equal(afterRent.status, 'partial');
  assert.equal(afterRent.paidAt, undefined);
  assert.equal(afterRent.rentPaid, 4500);
  assert.equal(afterRent.rentRemaining, 0);
  assert.equal(afterRent.electricityPaid, 0);
  assert.equal(afterRent.electricityRemaining, 750);
  assert.equal(afterRent.remainingBalance, 750);
  assert.equal(rentOnlyPay.overpaymentCredited, 0);

  // 5. Tenant subsequently settles ₱750 electricity -> NOW bill transitions cleanly to PAID
  const elecPay = executeRecordPaymentTransaction({
    bill: afterRent,
    room: rentOnlyPay.updatedRoom!,
    paymentAmount: 750,
    method: 'GCash',
    allocationTarget: 'electricity',
  });
  assert.equal(elecPay.ok, true);
  const settled = elecPay.updatedBill!;
  assert.equal(settled.status, 'paid');
  assert.ok(settled.paidAt);
  assert.equal(settled.rentRemaining, 0);
  assert.equal(settled.electricityRemaining, 0);
  assert.equal(settled.remainingBalance, 0);
  const comp = computeBillComponentBalances(settled);
  assert.equal(comp.rentPaid, 4500);
  assert.equal(comp.electricityPaid, 750);
});

test('Task 6: Atomic commitBillingTransaction rolls back on failure and migrateDatabaseIfNeeded preserves legacy records', () => {
  // 1. Atomic rollback test: fail when writing bills after rooms succeeds
  const mockFail = installSimpleLocalStorage('4rent_db_bills');
  try {
    const initialRoom = makeOccupiedRoom({ lastMeterReading: 1250 });
    saveRooms([initialRoom]);
    const beforeRoomsRaw = mockFail.store.get('4rent_db_rooms');

    const res = commitBillingTransaction({
      rooms: [makeOccupiedRoom({ lastMeterReading: 1310 })],
      bills: [makeBillDraft()],
    });
    assert.equal(res.ok, false);
    // Rooms MUST be rolled back to 1250 kWh (no partial state persisted!)
    assert.equal(mockFail.store.get('4rent_db_rooms'), beforeRoomsRaw);
    assert.equal(loadRooms()[0].lastMeterReading, 1250);
  } finally {
    mockFail.restore();
  }

  // 2. Non-destructive v1 -> v2 migration test
  const mockMig = installSimpleLocalStorage();
  try {
    saveRooms([makeOccupiedRoom()]);
    saveBills([makeBillDraft({ billingMonthKey: undefined })]);
    mockMig.store.delete('4rent_db_monthly_readings');
    mockMig.store.delete('4rent_db_schema_version');

    const firstRun = migrateDatabaseIfNeeded();
    assert.equal(firstRun.migrated, true);
    assert.equal(firstRun.backfilledReadingsCount, 1);

    // Existing records intact and historical reading backfilled
    assert.equal(loadRooms().length, 1);
    assert.equal(loadBills().length, 1);
    assert.equal(loadBills()[0].billingMonthKey, '2026-01');
    const readings = loadMonthlyReadings('room-101');
    assert.equal(readings.length, 1);
    assert.equal(readings[0].consumptionKwh, 60);
    assert.equal(readings[0].electricCharge, 750);

    // Idempotent on second run
    const secondRun = migrateDatabaseIfNeeded();
    assert.equal(secondRun.migrated, false);
    assert.equal(loadMonthlyReadings('room-101').length, 1);
  } finally {
    mockMig.restore();
  }
});

test('Task 1 & Task 2: macOS Electron packaging, iOS Home Screen PWA assets, and Receipt breakdown verification', () => {
  const pkg = JSON.parse(fs.readFileSync(path.resolve('package.json'), 'utf8'));
  assert.equal(pkg.version, '1.0.1');
  assert.ok(pkg.scripts['dist:mac'], 'dist:mac script must exist');
  assert.ok(pkg.scripts['dist:win'], 'dist:win script must exist');
  assert.ok(
    fs.existsSync(path.resolve('public/4Rent-v1.0.1-release.apk')),
    'public/4Rent-v1.0.1-release.apk must exist to prevent broken download links'
  );
  assert.ok(
    fs.existsSync(path.resolve('packages/mobile/4Rent-v1.0.1-release.apk')),
    'packages/mobile/4Rent-v1.0.1-release.apk must exist'
  );
  assert.ok(
    fs.existsSync(path.resolve('public/4Rent-Desktop-macOS.zip')),
    'public/4Rent-Desktop-macOS.zip must exist for zero-CLI macOS client installation'
  );
  assert.ok(
    fs.existsSync(path.resolve('public/Install-4Rent-macOS.command')),
    'public/Install-4Rent-macOS.command must exist for 1-click macOS installation'
  );
  assert.equal(pkg.build.mac.icon, 'build/icon.icns');
  assert.equal(pkg.build.mac.entitlements, 'build/entitlements.mac.plist');
  assert.ok(
    pkg.build.mac.target.some((t: { target: string }) => t.target === 'dmg'),
    'macOS DMG target must be configured'
  );

  // Verify valid Apple ICNS container header ('icns') & entitlements plist & preload
  const icnsBuf = fs.readFileSync(path.resolve('build/icon.icns'));
  assert.equal(icnsBuf.subarray(0, 4).toString('ascii'), 'icns');
  assert.ok(fs.existsSync(path.resolve('build/entitlements.mac.plist')));
  assert.ok(fs.existsSync(path.resolve('electron/preload.cjs')));
  const mainSrc = fs.readFileSync(path.resolve('electron/main.cjs'), 'utf8');
  assert.ok(mainSrc.includes('4rent:copy-png-to-clipboard'));
  assert.ok(mainSrc.includes('Menu.setApplicationMenu'));

  // Verify iOS Home Screen PWA metadata & icon assets
  const indexHtml = fs.readFileSync(path.resolve('index.html'), 'utf8');
  assert.ok(indexHtml.includes('name="apple-mobile-web-app-capable" content="yes"'));
  assert.ok(indexHtml.includes('href="./apple-touch-icon.png"'));
  assert.ok(fs.existsSync(path.resolve('public/apple-touch-icon.png')));
  assert.ok(fs.existsSync(path.resolve('public/icon-180.png')));
  assert.ok(fs.existsSync(path.resolve('public/icon-167.png')));
  assert.ok(fs.existsSync(path.resolve('public/icon-152.png')));

  const manifest = JSON.parse(
    fs.readFileSync(path.resolve('public/manifest.webmanifest'), 'utf8')
  );
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.theme_color, '#0B0E14');

  // Verify PrintableA4Receipt renders Proration, Late Penalty, Rent vs Electricity tracking, and zero em-dashes
  const proratedPartialBill = makeBillDraft({
    baseRent: 2250,
    monthlyRentFull: 4500,
    isProrated: true,
    occupiedDays: 15,
    daysInBillingMonth: 30,
    dailyRentRate: 150,
    latePenalty: 200,
    latePenaltyLabel: 'Fixed ₱200.00 late penalty (starting Feb 11, 2026)',
    totalRentDue: 2450,
    grossCharges: 3200,
    totalAmountDue: 3200,
    amountPaid: 2250,
    remainingBalance: 950,
    rentPaid: 2250,
    rentRemaining: 0,
    electricityPaid: 0,
    electricityRemaining: 750,
    latePenaltyPaid: 0,
    latePenaltyRemaining: 200,
    status: 'partial',
  });

  const html = renderToStaticMarkup(
    React.createElement(PrintableA4Receipt, {
      bill: proratedPartialBill,
      settings: DEFAULT_SETTINGS,
      maskContactsOnReceipt: false,
      prevMeterProofImg: 'data:image/png;base64,AAA',
      currMeterProofImg: 'data:image/png;base64,BBB',
      prevMeterCropImg: 'data:image/png;base64,CCC',
      currMeterCropImg: 'data:image/png;base64,DDD',
      remainingAdvanceCredit: 0,
    })
  );
  assert.ok(html.includes('Prorated Rent'));
  assert.ok(html.includes('Late Charges'));
  assert.ok(html.includes('Total Rent Due'));
  assert.ok(html.includes('Component Payment Tracking'));
  assert.ok(html.includes('Electricity balance'));
  assert.equal(html.includes('\u2014'), false, 'Receipt HTML must contain zero em-dashes');
});

test('Task 7: Core UI Views (Settings, Scanner, ReceiptModal, AllPayments) render cleanly with all new controls', () => {
  const mockLs = installSimpleLocalStorage();
  const prevWindow = (globalThis as { window?: unknown }).window;
  (globalThis as { window?: unknown }).window = {
    location: { origin: 'https://4rent.local', pathname: '/', search: '', href: 'https://4rent.local/' },
    matchMedia: () => ({ matches: false }),
    addEventListener: () => {},
    removeEventListener: () => {},
  };
  try {
    const room = makeOccupiedRoom({
      lastMeterPhotoDataUrl: 'data:image/png;base64,AAA',
      lastMeterCropDataUrl: 'data:image/png;base64,BBB',
    });
    const partialBill = makeBillDraft({
      status: 'partial',
      amountPaid: 4500,
      remainingBalance: 750,
      rentPaid: 4500,
      rentRemaining: 0,
      electricityPaid: 0,
      electricityRemaining: 750,
      prevMeterPhotoDataUrl: 'data:image/png;base64,AAA',
      prevMeterCropDataUrl: 'data:image/png;base64,BBB',
      meterPhotoDataUrl: 'data:image/png;base64,CCC',
      currMeterCropDataUrl: 'data:image/png;base64,DDD',
    });

    // 1. SettingsView renders independent monthly rate inputs (text/decimal, not snapping to 0) & late charges config
    const settingsHtml = renderToStaticMarkup(
      React.createElement(SettingsView, {
        settings: DEFAULT_SETTINGS,
        onBack: () => {},
        onUpdateSettings: () => {},
        onReloadAllData: () => {},
        onOpenSecuritySetup: () => {},
      })
    );
    assert.ok(settingsHtml.includes('Monthly Electric Rate Schedule'));
    assert.ok(settingsHtml.includes('inputMode="decimal"') || settingsHtml.includes('inputmode="decimal"'));
    assert.ok(settingsHtml.includes('Monthly Rent Payment Schedule'));
    assert.ok(settingsHtml.includes('Late Charges'));
    assert.ok(
      settingsHtml.includes('4Rent-Desktop-macOS.zip'),
      'SettingsView must provide direct macOS Desktop App download without requiring CLI commands'
    );
    assert.equal(
      settingsHtml.includes('npm run dist:mac'),
      false,
      'Client UI must never require npm CLI commands to install macOS Desktop App'
    );

    // 2. ReceiptModal renders Copy Receipt as PNG (replacing Share PDF to Messenger) while preserving Share Receipt
    const receiptModalHtml = renderToStaticMarkup(
      React.createElement(ReceiptModal, {
        bill: partialBill,
        settings: DEFAULT_SETTINGS,
        onApplyMonthlyRate: () => {},
        onClose: () => {},
      })
    );
    assert.ok(receiptModalHtml.includes('Copy Receipt as PNG'));
    assert.ok(receiptModalHtml.includes('Share Receipt'));
    assert.ok(receiptModalHtml.includes('Download PDF'));
    assert.ok(receiptModalHtml.includes('Download PNG'));
    assert.ok(receiptModalHtml.includes('Print Receipt'));
    assert.equal(receiptModalHtml.includes('Share PDF to Messenger'), false);

    // 3. SubMeterScannerModal renders mandatory verification gate, proration, and payment schedule
    const scannerHtml = renderToStaticMarkup(
      React.createElement(SubMeterScannerModal, {
        isOpen: true,
        rooms: [room],
        existingBills: [],
        monthlyReadings: [],
        initialRoom: room,
        globalElectricRate: 12.5,
        latePenaltyConfig: DEFAULT_SETTINGS.latePenalty,
        onClose: () => {},
        onGenerateBill: () => true,
      })
    );
    assert.ok(scannerHtml.includes('Mandatory Electricity Reading Verification Required'));
    assert.ok(scannerHtml.includes('Verify &amp; Confirm Reading'));
    assert.ok(scannerHtml.includes('Rent Proration'));
    assert.ok(scannerHtml.includes('Payment Schedule (1st-10th)'));
    assert.ok(scannerHtml.includes('Late Charges'));

    // 4. AllPaymentsView renders separate Rent Paid vs Electricity Unpaid warning for partial bill,
    // and hides the Advance Credit button until overall balance is paid
    const paymentsHtml = renderToStaticMarkup(
      React.createElement(AllPaymentsView, {
        bills: [partialBill],
        rooms: [{ ...room, unpaidBalance: 750 }],
        onBack: () => {},
        onSelectBillForReceipt: () => {},
        onRecordPayment: () => {},
        onOpenAdvanceModal: () => {},
        onArchiveBill: () => {},
        onOpenNewBillScanner: () => {},
        onOpenArchiveCenter: () => {},
      })
    );
    assert.ok(paymentsHtml.includes('Electricity Balance Still Unpaid'));
    assert.ok(paymentsHtml.includes('Rent Paid'));
    assert.ok(paymentsHtml.includes('Bill Not Completed'));
    assert.equal(
      paymentsHtml.includes('Advance / Refund'),
      false,
      'Advance Credit button must remain hidden while tenant still has an unpaid balance'
    );

    // Once tenant pays overall balance, the Advance Credit button appears
    const paidBill = makeBillDraft({
      status: 'paid',
      amountPaid: 5250,
      remainingBalance: 0,
      rentPaid: 4500,
      rentRemaining: 0,
      electricityPaid: 750,
      electricityRemaining: 0,
    });
    const paidPaymentsHtml = renderToStaticMarkup(
      React.createElement(AllPaymentsView, {
        bills: [paidBill],
        rooms: [{ ...room, unpaidBalance: 0, activeReceiptId: paidBill.id }],
        onBack: () => {},
        onSelectBillForReceipt: () => {},
        onRecordPayment: () => {},
        onOpenAdvanceModal: () => {},
        onArchiveBill: () => {},
        onOpenNewBillScanner: () => {},
        onOpenArchiveCenter: () => {},
      })
    );
    assert.ok(
      paidPaymentsHtml.includes('Advance / Refund') ||
        paidPaymentsHtml.includes('Pay Advance for Next Month'),
      'Advance Credit button must appear once overall balance is paid'
    );

    // 5. ManageRoomsView anchors the single floating Room Action Button outside .animate-view-enter so CSS transforms never trap position:fixed
    const roomsHtml = renderToStaticMarkup(
      React.createElement(ManageRoomsView, {
        rooms: [room],
        bills: [partialBill],
        globalElectricRate: 12.5,
        onBack: () => {},
        onOpenAddRoom: () => {},
        onOpenEditRoom: () => {},
        onRequestDeleteRoomWithPin: () => {},
        onArchiveRoom: () => {},
        onMoveOutTenant: () => {},
        onOpenScanMeter: () => {},
        onOpenRoomReceipt: () => {},
        onOpenAdvanceBalanceModal: () => {},
        onSelectRoomDetails: () => {},
        onOpenArchiveCenter: () => {},
      })
    );
    const fabMatches = roomsHtml.match(/aria-label="Add new room"/g) || [];
    assert.equal(fabMatches.length, 1, 'ManageRoomsView must render exactly one floating Room Action Button');
    assert.ok(
      roomsHtml.endsWith('</button>'),
      'Floating Room Action Button must be rendered as a top-level sibling outside the .animate-view-enter div'
    );
  } finally {
    if (prevWindow === undefined) {
      delete (globalThis as { window?: unknown }).window;
    } else {
      (globalThis as { window?: unknown }).window = prevWindow;
    }
    mockLs.restore();
  }
});
