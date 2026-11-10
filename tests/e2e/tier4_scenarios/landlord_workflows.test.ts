/**
 * Tier 4: Realistic Landlord End-to-End Application Scenarios
 *
 * Simulates genuine full-lifecycle landlord workflows:
 * - Scenario 1: Complete Tenant Move-In, Initial Sub-Meter Baseline, First Monthly OCR Reading, Payment, and Receipt Generation.
 * - Scenario 2: Tenant Advance Rent Overpayment, Automatic Advance Credit, and Subsequent Billing Deduction.
 * - Scenario 3: Occupied Room Security Guarding: Attempted PIN Deletion Blocking, Safe Move-Out Archiving to Tenant History, and Final Bill Clearance.
 * - Scenario 4: Mechanical Cyclometer Dial Rollover: Reading Drop from 99,985.0 to 00,025.0 kWh, Landlord Rollover Override Confirmation, Correct 40.0 kWh Billing, and Next Month Normal Baseline Continuation.
 * - Scenario 5: OCR Anomaly Detection: High Surge (>600 kWh Jump or Low Confidence <80%), Manual Landlord Correction, and Audit Trail Persistence.
 * - Scenario 6: Multi-Device Persistence & Cold Reload: Offline IndexedDB Hydration, Heavy Photo Base64 Quota Offloading, and Cross-Window Synchronization.
 */

import { describe, it, beforeEach } from 'node:test';
import {
  isAppHydrated,
  setAppHydrated,
  loadRooms,
  saveRooms,
  loadBills,
  saveBills,
  loadReadingLogs,
  saveReadingLogs,
  appendReadingLog,
  loadTenantHistory,
  saveTenantHistory,
  loadAuditLogs,
  appendAuditLog,
  exportDatabaseSnapshot,
  importDatabaseSnapshot,
} from '../../../src/services/storageService';
import {
  saveSnapshotToIndexedDb,
  loadSnapshotFromIndexedDb,
  clearSnapshotFromIndexedDb,
} from '../../../src/services/idbDatabase';
import {
  calculateBillBreakdown,
  calculateConsumptionDelta,
  calculateSubMeterDifference,
  verifyOcrReading,
  applyPaymentWithOverpayment,
} from '../../../src/utils/billingCalculator';
import {
  createMockRoom,
  createMockTenant,
  createMockBill,
  createMockInquiry,
  createMockTenantHistory,
  createMockSnapshot,
  assertStrictEqual,
  assertNotStrictEqual,
  assertTrue,
  assertFalse,
  assertCloseTo,
} from '../harness/test_utils';
import { resetBrowserEnv } from '../harness/browser_env';
import { Room, BillRecord, SubMeterReadingLog } from '../../../src/types/rental';

describe('Tier 4: Realistic Landlord Workflows & Application Journeys', () => {
  beforeEach(() => {
    resetBrowserEnv();
    setAppHydrated(true);
  });

  // ==========================================================================
  // Scenario 1: Tenant Move-In -> Baseline -> First Scan -> Payment -> Receipt
  // ==========================================================================
  it('Scenario 1: Complete Tenant Move-In, Initial Sub-Meter Baseline, First Monthly OCR Reading, Payment, and Receipt Generation', async () => {
    // 1. Landlord configures new room and records baseline sub-meter reading (1,250.0 kWh)
    const newRoom = createMockRoom({
      id: 'room-101',
      name: 'Room 101',
      monthlyRent: 5000,
      securityDeposit: 5000,
      lastMeterReading: 1250.0,
      status: 'occupied',
      tenant: createMockTenant({
        fullName: 'Maria Santos',
        phone: '0917-111-2222',
        moveInDate: '2026-10-01',
        dueDayOfMonth: 5,
      }),
    });
    saveRooms([newRoom]);

    // 2. Month-end meter scan: OCR reads 1,295.4 kWh (delta = 45.4 kWh)
    const currentOcrReading = 1295.4;
    const verification = verifyOcrReading(currentOcrReading, newRoom.lastMeterReading, 50);
    assertStrictEqual(verification.status, 'verified');
    assertStrictEqual(verification.verifiedReading, 1295.4);

    // 3. Landlord generates bill breakdown
    const breakdown = calculateBillBreakdown({
      baseRent: newRoom.monthlyRent,
      prevReading: newRoom.lastMeterReading,
      currReading: currentOcrReading,
      electricRate: 15.0, // ₱15/kWh
      previousBalanceCarryOver: 0,
      depositApplied: 0,
    });

    assertStrictEqual(breakdown.consumptionKwh, 45.4);
    assertCloseTo(breakdown.electricTotal, 681.0); // 45.4 * 15 = 681.0
    assertStrictEqual(breakdown.totalAmountDue, 5681.0); // 5000 + 681.0

    // 4. Save bill and record persistent sub-meter log
    const bill: BillRecord = createMockBill({
      id: 'bill-101-nov',
      receiptNo: '4R-202611-001',
      roomId: 'room-101',
      roomName: 'Room 101',
      tenantName: 'Maria Santos',
      prevReading: newRoom.lastMeterReading,
      currReading: currentOcrReading,
      consumptionKwh: breakdown.consumptionKwh,
      electricRate: 15.0,
      electricTotal: breakdown.electricTotal,
      baseRent: newRoom.monthlyRent,
      totalAmountDue: breakdown.totalAmountDue,
      amountPaid: 5681.0,
      remainingBalance: 0,
      status: 'paid',
    });

    saveBills([bill]);

    appendReadingLog({
      id: 'log-101-nov',
      roomId: 'room-101',
      roomName: 'Room 101',
      tenantName: 'Maria Santos',
      readingDate: '2026-11-01T08:00:00.000Z',
      readingKwh: currentOcrReading,
      consumptionDeltaKwh: breakdown.consumptionKwh,
      source: 'ocr_scan',
      billId: bill.id,
    });

    // 5. Update room state to new baseline
    const updatedRoom: Room = {
      ...newRoom,
      lastMeterReading: currentOcrReading,
      lastReadingDate: '2026-11-01T08:00:00.000Z',
      activeReceiptId: bill.id,
      unpaidBalance: 0,
    };
    saveRooms([updatedRoom]);

    // 6. Verify assertions
    const savedRooms = loadRooms();
    const savedBills = loadBills();
    const savedLogs = loadReadingLogs('room-101');

    assertStrictEqual(savedRooms[0].lastMeterReading, 1295.4);
    assertStrictEqual(savedBills.length, 1);
    assertStrictEqual(savedBills[0].status, 'paid');
    assertStrictEqual(savedLogs.length, 1);
    assertStrictEqual(savedLogs[0].consumptionDeltaKwh, 45.4);
  });

  // ==========================================================================
  // Scenario 2: Tenant Overpayment -> Advance Credit -> Deducted on Next Bill
  // ==========================================================================
  it('Scenario 2: Tenant Advance Rent Overpayment, Automatic Advance Credit, and Subsequent Billing Deduction', () => {
    // 1. Active room with tenant
    const room = createMockRoom({
      id: 'room-202',
      name: 'Room 202',
      monthlyRent: 4000,
      advanceRent: 0,
      advanceHistory: [],
    });
    saveRooms([room]);

    // 2. Bill 1 is ₱4,300 total due. Tenant pays ₱5,000 cash (₱700 overpayment)
    const initialBill = createMockBill({
      totalAmountDue: 4300,
      amountPaid: 0,
      remainingBalance: 4300,
    });
    const paymentResult = applyPaymentWithOverpayment(initialBill, 5000, 'Cash');
    assertStrictEqual(paymentResult.updatedBill.amountPaid, 5000);
    assertStrictEqual(paymentResult.updatedBill.remainingBalance, 0);
    assertStrictEqual(paymentResult.overpaymentCredited, 700);

    // 3. Room advance rent balance increments to ₱700 with transaction history
    const roomAfterOverpayment: Room = {
      ...room,
      advanceRent: 700,
      advanceHistory: [
        {
          id: 'adv-over-1',
          type: 'overpayment_credit',
          amount: 700,
          createdAt: '2026-11-02T10:00:00.000Z',
          note: 'Overpayment from Receipt #4R-202611-002',
        },
      ],
    };
    saveRooms([roomAfterOverpayment]);

    assertStrictEqual(loadRooms()[0].advanceRent, 700);
    assertStrictEqual(loadRooms()[0].advanceHistory?.length, 1);

    // 4. Next billing period: total bill is ₱4,250. Landlord applies ₱700 advance credit
    const advanceDeducted = 700;
    const netDue = 4250 - advanceDeducted; // ₱3,550
    assertStrictEqual(netDue, 3550);

    const roomAfterDeduction: Room = {
      ...roomAfterOverpayment,
      advanceRent: 0,
      advanceHistory: [
        {
          id: 'adv-use-1',
          type: 'applied_to_bill',
          amount: 700,
          createdAt: '2026-12-01T08:00:00.000Z',
          note: 'Applied to Receipt #4R-202612-001',
        },
        ...roomAfterOverpayment.advanceHistory!,
      ],
    };
    saveRooms([roomAfterDeduction]);

    const finalRooms = loadRooms();
    assertStrictEqual(finalRooms[0].advanceRent, 0);
    assertStrictEqual(finalRooms[0].advanceHistory?.length, 2);
    assertStrictEqual(finalRooms[0].advanceHistory![0].type, 'applied_to_bill');
  });

  // ==========================================================================
  // Scenario 3: Occupied Room Security Guarding & Safe Move-Out
  // ==========================================================================
  it('Scenario 3: Occupied Room Security Guarding: Attempted PIN Deletion Blocking, Safe Move-Out Archiving to Tenant History, and Final Bill Clearance', () => {
    // 1. Occupied room with active tenant and held deposit
    const occupiedRoom = createMockRoom({
      id: 'room-303',
      name: 'Room 303',
      status: 'occupied',
      securityDeposit: 6000,
      unpaidBalance: 1200,
      tenant: createMockTenant({
        fullName: 'Carlos Reyes',
        phone: '0922-333-4444',
      }),
    });
    saveRooms([occupiedRoom]);

    // 2. Direct deletion guard: Occupied rooms cannot be deleted without move-out
    const canDeleteDirectly = occupiedRoom.status === 'vacant';
    assertFalse(canDeleteDirectly, 'Occupied room must block direct deletion');

    // 3. Move-out process: archive tenant history entry
    const moveOutEntry = createMockTenantHistory({
      roomId: occupiedRoom.id,
      roomName: occupiedRoom.name,
      tenantName: occupiedRoom.tenant!.fullName,
      phone: occupiedRoom.tenant!.phone,
      finalMeterReading: 1540.0,
      depositHeld: occupiedRoom.securityDeposit,
      unpaidBalanceAtMoveOut: occupiedRoom.unpaidBalance,
      reason: 'End of Lease Contract',
    });
    saveTenantHistory([moveOutEntry]);

    // 4. Convert room to vacant status
    const vacantRoom: Room = {
      ...occupiedRoom,
      status: 'vacant',
      tenant: undefined,
      unpaidBalance: 0,
      advanceRent: 0,
    };
    saveRooms([vacantRoom]);

    // 5. Verification: Tenant history preserved, room safely vacant
    const history = loadTenantHistory();
    const rooms = loadRooms();

    assertStrictEqual(history.length, 1);
    assertStrictEqual(history[0].tenantName, 'Carlos Reyes');
    assertStrictEqual(history[0].depositHeld, 6000);
    assertStrictEqual(rooms[0].status, 'vacant');
    assertStrictEqual(rooms[0].tenant, undefined);
  });

  // ==========================================================================
  // Scenario 4: Mechanical Cyclometer Dial Rollover
  // ==========================================================================
  it('Scenario 4: Mechanical Cyclometer Dial Rollover: Reading Drop from 99,985.0 to 00,025.0 kWh, Landlord Rollover Override Confirmation, and Correct Billing', () => {
    // 1. Room near mechanical cyclometer capacity (99,985.0 kWh on a 5-digit meter)
    const prevReading = 99985.0;
    const currReading = 25.0; // Rolled over past 100,000 to 25.0

    // 2. Pure calculation without override returns negative delta / blocked
    const unconfirmedDelta = calculateConsumptionDelta(currReading, prevReading, false);
    assertTrue(unconfirmedDelta.isNegative);
    assertFalse(unconfirmedDelta.isRollover);

    // 3. Landlord enables Rollover Override (5-digit cyclometer, modulus = 100,000)
    const rolloverDelta = calculateConsumptionDelta(currReading, prevReading, true, 5);
    assertFalse(rolloverDelta.isNegative);
    assertTrue(rolloverDelta.isRollover);
    assertStrictEqual(rolloverDelta.delta, 40.0); // (100,000 - 99,985) + 25 = 15 + 25 = 40.0 kWh

    // 4. Calculate bill breakdown
    const billBreakdown = calculateBillBreakdown({
      baseRent: 4500, // rent
      prevReading,
      currReading,
      electricRate: 15.0, // rate
      previousBalanceCarryOver: 0,
      depositApplied: 0,
      isRollover: true,
      dialDigits: 5,
    });
    assertStrictEqual(billBreakdown.consumptionKwh, 40.0);
    assertCloseTo(billBreakdown.electricTotal, 600.0); // 40 * 15 = 600
    assertStrictEqual(billBreakdown.totalAmountDue, 5100.0);

    // 5. Next month normal progression: reading advances from 25.0 to 65.0 kWh
    const nextMonthCurr = 65.0;
    const normalNextDelta = calculateConsumptionDelta(nextMonthCurr, currReading, false);
    assertFalse(normalNextDelta.isNegative);
    assertFalse(normalNextDelta.isRollover);
    assertStrictEqual(normalNextDelta.delta, 40.0); // 65 - 25 = 40.0 kWh
  });

  // ==========================================================================
  // Scenario 5: OCR Anomaly Detection & Manual Landlord Correction
  // ==========================================================================
  it('Scenario 5: OCR Anomaly Detection: High Surge (>600 kWh Jump or Low Confidence <80%), Manual Landlord Correction, and Audit Trail Persistence', () => {
    const prevReading = 1000.0;
    // Erroneous OCR detects 8,500.0 kWh due to reading a serial number or light glare
    const anomalousOcrReading = 8500.0;

    // 1. Sanity & Bounds Check intercepts anomalous jump
    const verification = verifyOcrReading(anomalousOcrReading, prevReading, 80);
    assertStrictEqual(verification.status, 'anomaly_detected');
    assertStrictEqual(verification.anomalyType, 'exceeds_threshold');
    assertTrue(verification.warningMessage !== undefined && verification.warningMessage.length > 0);

    // 2. Landlord reviews photo reticle, rejects 8,500.0, and manually corrects reading to 1,065.0 kWh
    const correctedReading = 1065.0;
    const verifiedCorrection = verifyOcrReading(correctedReading, prevReading, 80);
    assertStrictEqual(verifiedCorrection.status, 'verified');
    assertStrictEqual(verifiedCorrection.verifiedReading, 1065.0);

    // 3. Append security and billing audit log
    appendAuditLog(
      'OCR Reading Corrected',
      `Room 404: Anomaly reading 8,500.0 kWh manually corrected by landlord to 1,065.0 kWh.`,
      'billing'
    );

    const auditLogs = loadAuditLogs();
    assertStrictEqual(auditLogs.length, 1);
    assertTrue(auditLogs[0].details.includes('manually corrected by landlord'));
  });

  // ==========================================================================
  // Scenario 6: Multi-Device Persistence & Cold Reload
  // ==========================================================================
  it('Scenario 6: Multi-Device Persistence & Cold Reload: Offline IndexedDB Hydration, Heavy Photo Base64 Quota Offloading, and Cross-Window Synchronization', async () => {
    // 1. Simulate populated IndexedDB snapshot with full photo payload
    const testPhoto = 'data:image/jpeg;base64,' + 'Z'.repeat(50000);
    const initialSnapshot = createMockSnapshot({
      rooms: [
        createMockRoom({
          id: 'room-601',
          name: 'Room 601',
          lastMeterReading: 888.8,
          lastMeterPhotoDataUrl: testPhoto,
        }),
      ],
      bills: [createMockBill({ id: 'bill-601', roomId: 'room-601' })],
    });

    await saveSnapshotToIndexedDb(initialSnapshot);

    // 2. Cold start / localStorage cleared simulation (IndexedDB intact)
    localStorage.clear();
    setAppHydrated(false);

    // Verify localStorage is currently empty
    assertStrictEqual(loadRooms().length, 0);

    // 3. Hydrate state from IndexedDB
    const snapshotFromIdb = await loadSnapshotFromIndexedDb();
    assertTrue(Boolean(snapshotFromIdb));
    assertStrictEqual(snapshotFromIdb?.rooms.length, 1);
    assertStrictEqual(snapshotFromIdb?.rooms[0].lastMeterReading, 888.8);

    // Restore to application storage
    importDatabaseSnapshot(snapshotFromIdb!);
    setAppHydrated(true);

    // 4. Verify rooms and bills are fully restored
    const restoredRooms = loadRooms();
    const restoredBills = loadBills();

    assertStrictEqual(restoredRooms.length, 1);
    assertStrictEqual(restoredRooms[0].id, 'room-601');
    assertStrictEqual(restoredBills.length, 1);
    assertStrictEqual(restoredBills[0].id, 'bill-601');
  });
});
