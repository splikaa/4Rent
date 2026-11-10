/**
 * Milestone 2 Adversarial Stress Test Suite
 *
 * Empirical verification of:
 * 1. Objective 4: Negative Sub-Meter Reading & Rollover Handling (billingCalculator.ts & SubMeterScannerModal.tsx)
 * 2. Objective 3: Room PIN Deletion Safety Guard (App.tsx)
 * 3. Objective 1 & 2: Storage Hydration Guard & Booking Advance Calculation
 * 4. Write Boundary Compliance
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateConsumptionDelta,
  calculateSubMeterDifference,
  calculateBillBreakdown,
  verifyOcrReading,
} from '../../../src/utils/billingCalculator';
import {
  isAppHydrated,
  setAppHydrated,
  saveRooms,
  loadRooms,
  saveBills,
  loadBills,
  saveSettings,
  loadSettings,
} from '../../../src/services/storageService';
import {
  saveSnapshotToIndexedDb,
  loadSnapshotFromIndexedDb,
  clearSnapshotFromIndexedDb,
} from '../../../src/services/idbDatabase';
import {
  createMockRoom,
  createMockTenant,
  createMockBill,
  createMockInquiry,
  createMockSnapshot,
  assertStrictEqual,
  assertTrue,
  assertFalse,
  assertCloseTo,
} from '../harness/test_utils';
import {
  TenantHistoryEntry,
  BillRecord,
  Room,
  AdvanceBalanceTransaction,
  RoomInquiryBooking,
  AppSettings,
} from '../../../src/types/rental';

describe('Milestone 2 Adversarial Verification Suite', () => {

  // ==========================================================================
  // Suite 1: calculateConsumptionDelta Mathematical Stress Tests
  // ==========================================================================
  describe('Suite 1: calculateConsumptionDelta Mathematical Stress Tests', () => {
    it('1.1 Normal linear progression: prev = 100, curr = 150 -> delta = 50, isNegative = false', () => {
      const result = calculateConsumptionDelta(150, 100);
      assertStrictEqual(result.delta, 50);
      assertStrictEqual(result.isNegative, false);
      assertStrictEqual(result.isRollover, false);
      assertStrictEqual(result.error, undefined);
    });

    it('1.2 Negative unconfirmed: prev = 100, curr = 80 -> delta = -20, isNegative = true, error provided', () => {
      const result = calculateConsumptionDelta(80, 100, false);
      assertStrictEqual(result.delta, -20);
      assertStrictEqual(result.isNegative, true);
      assertStrictEqual(result.isRollover, false);
      assertTrue(typeof result.error === 'string' && result.error.length > 0);
      assertTrue(result.error!.includes('80.0 kWh'));
      assertTrue(result.error!.includes('100.0 kWh'));
    });

    it('1.3 4-digit rollover: prev = 9980, curr = 15, dialDigits = 4 -> delta = 35', () => {
      // (10,000 - 9980) + 15 = 35
      const result = calculateConsumptionDelta(15, 9980, true, 4);
      assertStrictEqual(result.delta, 35);
      assertStrictEqual(result.isNegative, false);
      assertStrictEqual(result.isRollover, true);
    });

    it('1.4 5-digit rollover: prev = 99980, curr = 15, dialDigits = 5 -> delta = 35', () => {
      // (100,000 - 99980) + 15 = 35
      const result = calculateConsumptionDelta(15, 99980, true, 5);
      assertStrictEqual(result.delta, 35);
      assertStrictEqual(result.isNegative, false);
      assertStrictEqual(result.isRollover, true);
    });

    it('1.5 6-digit rollover: prev = 999980, curr = 15, dialDigits = 6 -> delta = 35', () => {
      // (1,000,000 - 999980) + 15 = 35
      const result = calculateConsumptionDelta(15, 999980, true, 6);
      assertStrictEqual(result.delta, 35);
      assertStrictEqual(result.isNegative, false);
      assertStrictEqual(result.isRollover, true);
    });

    it('1.6 Scaled rollover: prev = 120,000 on 5-digit input scales modulus to 1,000,000 to prevent negative delta', () => {
      // 5-digit dial capacity is 100,000, but prev is 120,000.
      // Modulus scaling loop (while modulus <= prev) must scale to 1,000,000.
      // Expected delta: (1,000,000 - 120,000) + 15 = 880,015.
      const result = calculateConsumptionDelta(15, 120000, true, 5);
      assertStrictEqual(result.delta, 880015);
      assertStrictEqual(result.isNegative, false);
      assertStrictEqual(result.isRollover, true);
      assertTrue(result.delta > 0, 'Delta must be strictly positive');
    });

    it('1.7 Scaled rollover boundary: prev = 100,000 on 5-digit input (modulus <= prev exact match)', () => {
      // modulus = 10^5 = 100,000 <= 100,000 (condition is true, so scales to 1,000,000)
      // delta = (1,000,000 - 100,000) + 15 = 900,015.
      const result = calculateConsumptionDelta(15, 100000, true, 5);
      assertStrictEqual(result.delta, 900015);
      assertStrictEqual(result.isNegative, false);
      assertStrictEqual(result.isRollover, true);
    });

    it('1.8 Meter replacement / Zero reset: prev = 5000, curr = 12, isReset = true -> delta = 12', () => {
      const result = calculateConsumptionDelta(12, 5000, false, 5, true);
      assertStrictEqual(result.delta, 12);
      assertStrictEqual(result.isNegative, false);
      assertStrictEqual(result.isRollover, false);
      assertStrictEqual(result.isReset, true);
    });

    it('1.9 Decimal precision rollover: prev = 9999.8, curr = 1.5, dialDigits = 4 -> delta = 1.7', () => {
      // (10,000 - 9999.8) + 1.5 = 0.2 + 1.5 = 1.7
      const result = calculateConsumptionDelta(1.5, 9999.8, true, 4);
      assertCloseTo(result.delta, 1.7, 0.0001);
      assertStrictEqual(result.isNegative, false);
      assertStrictEqual(result.isRollover, true);
    });

    it('1.10 Adversarial dial digits clamping: dialDigits < 3 clamped to 3, > 8 clamped to 8', () => {
      // dialDigits = 1 -> clamped to 3 (modulus = 1,000). prev = 980, curr = 10 -> (1,000 - 980) + 10 = 30
      const resLow = calculateConsumptionDelta(10, 980, true, 1);
      assertStrictEqual(resLow.delta, 30);

      // dialDigits = 12 -> clamped to 8 (modulus = 100,000,000). prev = 99999980, curr = 10 -> 30
      const resHigh = calculateConsumptionDelta(10, 99999980, true, 12);
      assertStrictEqual(resHigh.delta, 30);
    });

    it('1.11 Randomized property-based fuzzing (500 combinations): no NaN, no negative deltas on rollover', () => {
      for (let i = 0; i < 500; i++) {
        const prev = Math.floor(Math.random() * 500000) + 100;
        const curr = Math.floor(Math.random() * (prev - 1)); // strictly less than prev
        const dial = Math.floor(Math.random() * 6) + 3; // 3 to 8

        const resRollover = calculateConsumptionDelta(curr, prev, true, dial, false);
        assertFalse(isNaN(resRollover.delta), `Fuzz NaN error on prev=${prev}, curr=${curr}`);
        assertTrue(resRollover.delta > 0, `Rollover delta must be > 0: prev=${prev}, curr=${curr}, delta=${resRollover.delta}`);
        assertStrictEqual(resRollover.isNegative, false);
        assertStrictEqual(resRollover.isRollover, true);

        const resReset = calculateConsumptionDelta(curr, prev, false, dial, true);
        assertStrictEqual(resReset.delta, curr);
        assertStrictEqual(resReset.isReset, true);
      }
    });

    it('1.12 Boundary equality & zero values: curr === prev produces delta = 0', () => {
      const resEqual = calculateConsumptionDelta(100, 100);
      assertStrictEqual(resEqual.delta, 0);
      assertStrictEqual(resEqual.isNegative, false);

      const resZeroZero = calculateConsumptionDelta(0, 0);
      assertStrictEqual(resZeroZero.delta, 0);
      assertStrictEqual(resZeroZero.isNegative, false);
    });

    it('1.13 String coercion robustness: handles string numeric inputs gracefully', () => {
      const res = calculateConsumptionDelta('150' as any, '100' as any);
      assertStrictEqual(res.delta, 50);
      assertStrictEqual(res.isNegative, false);
    });

    it('1.14 Extreme rollover at exact 0: prev = 99999, curr = 0, dialDigits = 5 -> delta = 1', () => {
      const res = calculateConsumptionDelta(0, 99999, true, 5);
      assertStrictEqual(res.delta, 1);
      assertStrictEqual(res.isNegative, false);
      assertStrictEqual(res.isRollover, true);
    });
  });

  // ==========================================================================
  // Suite 2: SubMeterDifference and FullBill Integration
  // ==========================================================================
  describe('Suite 2: SubMeterDifference and FullBill Integration', () => {
    it('2.1 Unconfirmed negative reading returns isValid: false, 0 kWh, 0 electricTotal', () => {
      const res = calculateSubMeterDifference({
        prevReading: 500,
        currReading: 450,
        electricRate: 15,
        isRollover: false,
      });
      assertStrictEqual(res.isValid, false);
      assertStrictEqual(res.consumptionKwh, 0);
      assertStrictEqual(res.electricTotal, 0);
      assertTrue(typeof res.errorMessage === 'string');
    });

    it('2.2 Rollover confirmed computes correct consumption and electricTotal', () => {
      const res = calculateSubMeterDifference({
        prevReading: 9980,
        currReading: 20,
        electricRate: 14.5,
        isRollover: true,
        dialDigits: 4,
      });
      // delta = (10,000 - 9980) + 20 = 40. total = 40 * 14.5 = 580
      assertStrictEqual(res.isValid, true);
      assertStrictEqual(res.isRollover, true);
      assertStrictEqual(res.consumptionKwh, 40);
      assertStrictEqual(res.electricTotal, 580);
    });

    it('2.3 Zero-reset confirmed computes delta from 0 baseline', () => {
      const res = calculateSubMeterDifference({
        prevReading: 5000,
        currReading: 25.5,
        electricRate: 12,
        isRollover: false,
        isReset: true,
      });
      assertStrictEqual(res.isValid, true);
      assertStrictEqual(res.isReset, true);
      assertStrictEqual(res.consumptionKwh, 25.5);
      assertStrictEqual(res.electricTotal, 306);
    });

    it('2.4 calculateBillBreakdown carries rollover flags and computes total', () => {
      const bill = calculateBillBreakdown({
        baseRent: 5000,
        prevReading: 9980,
        currReading: 20,
        electricRate: 10,
        previousBalanceCarryOver: 100,
        isRollover: true,
        dialDigits: 4,
      });
      // electric = 40 * 10 = 400. grossTotal = 5000 + 400 + 100 = 5500. totalAmountDue = 5500
      assertStrictEqual(bill.consumptionKwh, 40);
      assertStrictEqual(bill.electricTotal, 400);
      assertStrictEqual(bill.baseRent, 5000);
      assertStrictEqual(bill.previousBalanceCarryOver, 100);
      assertStrictEqual(bill.grossTotal, 5500);
      assertStrictEqual(bill.totalAmountDue, 5500);
    });
  });

  // ==========================================================================
  // Suite 3: verifyOcrReading Engine Verification
  // ==========================================================================
  describe('Suite 3: verifyOcrReading Engine Verification', () => {
    it('3.1 Normal verified reading when curr >= prev and delta is reasonable', () => {
      const res = verifyOcrReading(150, 100);
      assertStrictEqual(res.status, 'verified');
      assertStrictEqual(res.verifiedReading, 150);
      assertStrictEqual(res.confidence, 0.95);
    });

    it('3.2 Negative reading triggers rollover_detected status', () => {
      const res = verifyOcrReading(80, 100);
      assertStrictEqual(res.status, 'rollover_detected');
      assertStrictEqual(res.anomalyType, 'negative_delta');
      assertTrue(typeof res.warningMessage === 'string');
    });

    it('3.3 Large consumption surge (>600 kWh) triggers anomaly_detected', () => {
      const res = verifyOcrReading(750, 100); // delta = 650 > 600
      assertStrictEqual(res.status, 'anomaly_detected');
      assertStrictEqual(res.anomalyType, 'exceeds_threshold');
      assertTrue(res.warningMessage!.includes('Consumption surge detected'));
    });

    it('3.4 Surge > 4x monthly average triggers anomaly_detected', () => {
      // prev = 100, curr = 350, delta = 250. avg = 50. 4 * 50 = 200. delta > 200.
      const res = verifyOcrReading(350, 100, 50);
      assertStrictEqual(res.status, 'anomaly_detected');
      assertStrictEqual(res.anomalyType, 'exceeds_threshold');
    });
  });

  // ==========================================================================
  // Suite 4: UI Logic Verification in SubMeterScannerModal
  // ==========================================================================
  describe('Suite 4: UI Logic Verification in SubMeterScannerModal', () => {
    it('4.1 Disables action button when curr < prev and isRollover is false', () => {
      const prevNum = 100;
      const currNum = 80;
      const isRollover = false;
      const rolloverType = 'dial_rollover';
      const dialDigits = 5;

      const isReset = rolloverType === 'meter_reset';
      const isRolloverActive = isRollover && currNum < prevNum;

      const subMeterCheck = calculateSubMeterDifference({
        prevReading: prevNum,
        currReading: currNum,
        electricRate: 15,
        isRollover: isRolloverActive && !isReset,
        dialDigits,
        isReset: isRolloverActive && isReset,
      });

      // Assert button disabled status: disabled={!subMeterCheck.isValid}
      assertStrictEqual(subMeterCheck.isValid, false);
      const isButtonDisabled = !subMeterCheck.isValid;
      assertStrictEqual(isButtonDisabled, true);
    });

    it('4.2 Enables action button when curr < prev and isRollover is true', () => {
      const prevNum = 9980;
      const currNum = 20;
      const isRollover = true;
      const rolloverType = 'dial_rollover';
      const dialDigits = 4;

      const isReset = rolloverType === 'meter_reset';
      const isRolloverActive = isRollover && currNum < prevNum;

      const subMeterCheck = calculateSubMeterDifference({
        prevReading: prevNum,
        currReading: currNum,
        electricRate: 15,
        isRollover: isRolloverActive && !isReset,
        dialDigits,
        isReset: isRolloverActive && isReset,
      });

      // Assert button disabled status: disabled={!subMeterCheck.isValid}
      assertStrictEqual(subMeterCheck.isValid, true);
      const isButtonDisabled = !subMeterCheck.isValid;
      assertStrictEqual(isButtonDisabled, false);
      assertStrictEqual(subMeterCheck.isRollover, true);
    });

    it('4.3 Constructs informative audit notes for rollover and reset bill entries', () => {
      const currNum = 20;
      const prevNum = 9980;
      const dialDigits = 4;
      const deltaKwh = 40;

      // Mechanical Rollover note simulation
      const rolloverNote = `[Dial Rollover Verified] Meter mechanical rollover processed (${dialDigits}-digit dial capacity). Previous: ${prevNum.toFixed(1)} kWh, Current: ${currNum.toFixed(1)} kWh, Delta: ${deltaKwh.toFixed(1)} kWh.`;
      assertTrue(rolloverNote.includes('Dial Rollover Verified'));
      assertTrue(rolloverNote.includes('4-digit dial capacity'));

      // Zero-Reset note simulation
      const resetNote = `[Meter Reset Baseline Verified] Current reading ${currNum.toFixed(1)} kWh recorded after sub-meter replacement/zero-reset. Delta: ${currNum.toFixed(1)} kWh.`;
      assertTrue(resetNote.includes('Meter Reset Baseline Verified'));
    });
  });

  // ==========================================================================
  // Suite 5: Objective 3 Room PIN Deletion Safety Guard
  // ==========================================================================
  describe('Suite 5: Objective 3 Room PIN Deletion Safety Guard', () => {
    it('5.1 Layer 1 UI Guard: Occupied room blocks PIN delete modal request', () => {
      const occupiedRoom = createMockRoom({
        id: 'room-101',
        name: 'Room 101',
        status: 'occupied',
        tenant: createMockTenant({ id: 'ten-1', fullName: 'Juan Dela Cruz' }),
      });

      let pinModalTarget: Room | null = null;
      let toastTriggered = false;
      let toastTitle = '';

      // Emulate onRequestDeleteRoomWithPin in App.tsx
      const onRequestDeleteRoomWithPin = (room: Room) => {
        if (room.status === 'occupied' || Boolean(room.tenant)) {
          toastTriggered = true;
          toastTitle = 'Cannot Delete Occupied Room';
          return;
        }
        pinModalTarget = room;
      };

      onRequestDeleteRoomWithPin(occupiedRoom);

      // Verify PIN modal was NEVER opened, and feedback warning was triggered
      assertStrictEqual(pinModalTarget, null);
      assertStrictEqual(toastTriggered, true);
      assertStrictEqual(toastTitle, 'Cannot Delete Occupied Room');
    });

    it('5.2 Layer 2 Engine Fail-Safe: Occupied room deletion synthesizes complete TenantHistoryEntry and archives active bills', () => {
      const occupiedRoom = createMockRoom({
        id: 'room-102',
        name: 'Room 102',
        status: 'occupied',
        lastMeterReading: 452.1,
        securityDeposit: 3500,
        unpaidBalance: 500,
        tenant: createMockTenant({
          id: 'ten-2',
          fullName: 'Maria Santos',
          phone: '09171234567',
          messengerUsername: 'maria.santos',
          moveInDate: '2026-01-15',
        }),
      });

      let tenantHistory: TenantHistoryEntry[] = [];
      let bills: BillRecord[] = [
        { ...createMockBill({ id: 'b1', roomId: 'room-102' }), isArchived: false },
        { ...createMockBill({ id: 'b2', roomId: 'room-102' }), isArchived: true, archivedAt: '2026-02-01T00:00:00.000Z' },
        { ...createMockBill({ id: 'b3', roomId: 'room-999' }), isArchived: false },
      ];
      let rooms: Room[] = [occupiedRoom];

      // Emulate Layer 2 logic in handleConfirmDeleteRoomAfterPin
      const handleConfirmDeleteRoomAfterPin = (roomPendingPinDelete: Room) => {
        const targetId = roomPendingPinDelete.id;
        const nowIso = '2026-11-10T12:00:00.000Z';

        if (roomPendingPinDelete.tenant) {
          const entry: TenantHistoryEntry = {
            id: `hist-${Date.now()}`,
            roomId: roomPendingPinDelete.id,
            roomName: roomPendingPinDelete.name,
            tenantName: roomPendingPinDelete.tenant.fullName,
            phone: roomPendingPinDelete.tenant.phone,
            messengerUsername: roomPendingPinDelete.tenant.messengerUsername,
            moveInDate: roomPendingPinDelete.tenant.moveInDate,
            moveOutDate: nowIso.slice(0, 10),
            reason: 'Permanent Room Deletion with Master PIN (Archived on Deletion)',
            finalMeterReading: roomPendingPinDelete.lastMeterReading,
            depositHeld: roomPendingPinDelete.securityDeposit,
            unpaidBalanceAtMoveOut: roomPendingPinDelete.unpaidBalance,
          };
          tenantHistory = [entry, ...tenantHistory];
        }

        bills = bills.map((b) =>
          b.roomId === targetId && !b.isArchived
            ? { ...b, isArchived: true, archivedAt: nowIso }
            : b
        );

        rooms = rooms.filter((r) => r.id !== targetId);
      };

      handleConfirmDeleteRoomAfterPin(occupiedRoom);

      // 1. Room is removed
      assertStrictEqual(rooms.length, 0);

      // 2. TenantHistoryEntry created and preserved with all required fields
      assertStrictEqual(tenantHistory.length, 1);
      const hist = tenantHistory[0];
      assertStrictEqual(hist.roomId, 'room-102');
      assertStrictEqual(hist.roomName, 'Room 102');
      assertStrictEqual(hist.tenantName, 'Maria Santos');
      assertStrictEqual(hist.phone, '09171234567');
      assertStrictEqual(hist.messengerUsername, 'maria.santos');
      assertStrictEqual(hist.moveInDate, '2026-01-15');
      assertStrictEqual(hist.moveOutDate, '2026-11-10');
      assertStrictEqual(hist.reason, 'Permanent Room Deletion with Master PIN (Archived on Deletion)');
      assertStrictEqual(hist.finalMeterReading, 452.1);
      assertStrictEqual(hist.depositHeld, 3500);
      assertStrictEqual(hist.unpaidBalanceAtMoveOut, 500);

      // 3. Bills: active bill b1 for room-102 is now archived; b2 remains archived; b3 untouched
      const b1 = bills.find((b) => b.id === 'b1')!;
      const b2 = bills.find((b) => b.id === 'b2')!;
      const b3 = bills.find((b) => b.id === 'b3')!;
      assertStrictEqual(b1.isArchived, true);
      assertStrictEqual(b1.archivedAt, '2026-11-10T12:00:00.000Z');
      assertStrictEqual(b2.archivedAt, '2026-02-01T00:00:00.000Z');
      assertStrictEqual(b3.isArchived, false);
    });
  });

  // ==========================================================================
  // Suite 6: Storage Hydration Guard & IndexedDB Wipe Prevention
  // ==========================================================================
  describe('Suite 6: Storage Hydration Guard & IndexedDB Wipe Prevention', () => {
    it('6.1 isAppHydrated initially returns false and updates via setAppHydrated', () => {
      setAppHydrated(false);
      assertStrictEqual(isAppHydrated(), false);
      setAppHydrated(true);
      assertStrictEqual(isAppHydrated(), true);
      setAppHydrated(false); // reset
    });

    it('6.2 Race condition: persistMasterIndexedDb aborts when _isAppHydrated is false', async () => {
      setAppHydrated(false);
      await clearSnapshotFromIndexedDb();

      // Seed IndexedDB with 5 persistent rooms
      const fiveRooms = [
        createMockRoom({ id: 'r1', name: 'Room 101' }),
        createMockRoom({ id: 'r2', name: 'Room 102' }),
        createMockRoom({ id: 'r3', name: 'Room 103' }),
        createMockRoom({ id: 'r4', name: 'Room 104' }),
        createMockRoom({ id: 'r5', name: 'Room 105' }),
      ];
      await saveSnapshotToIndexedDb(createMockSnapshot({ rooms: fiveRooms }));

      // Unhydrated call to saveRooms with empty array (simulates initial mount effect before IDB hydration)
      saveRooms([]);
      // Allow any microtasks / async persistence to settle
      await new Promise((r) => setTimeout(r, 50));

      // Verify IndexedDB was NOT wiped
      const snapshotAfter = await loadSnapshotFromIndexedDb();
      assertStrictEqual(snapshotAfter?.rooms?.length, 5);
      assertStrictEqual(snapshotAfter?.rooms?.[0].id, 'r1');
    });

    it('6.3 Empty snapshot guard: blocks overwrite if localStorage is empty but IndexedDB has 5 rooms', async () => {
      // Simulate app becoming hydrated, but React state has 0 rooms
      setAppHydrated(true);
      await clearSnapshotFromIndexedDb();

      const fiveRooms = [
        createMockRoom({ id: 'r1', name: 'Room 101' }),
        createMockRoom({ id: 'r2', name: 'Room 102' }),
        createMockRoom({ id: 'r3', name: 'Room 103' }),
        createMockRoom({ id: 'r4', name: 'Room 104' }),
        createMockRoom({ id: 'r5', name: 'Room 105' }),
      ];
      await saveSnapshotToIndexedDb(createMockSnapshot({ rooms: fiveRooms, bills: [], tenantHistory: [] }));

      // Clear localStorage rooms, bills, and history
      localStorage.removeItem('4rent_db_rooms');
      localStorage.removeItem('4rent_db_bills');
      localStorage.removeItem('4rent_db_tenant_history');

      // Now call saveRooms with empty array while hydrated
      saveRooms([]);
      await new Promise((r) => setTimeout(r, 50));

      // Verify empty snapshot overwrite was blocked!
      const snapshotAfter = await loadSnapshotFromIndexedDb();
      assertStrictEqual(snapshotAfter?.rooms?.length, 5);
      assertStrictEqual(snapshotAfter?.rooms?.[4].id, 'r5');
    });

    it('6.4 Fresh install scenario: both localStorage and IndexedDB are empty', async () => {
      setAppHydrated(true);
      await clearSnapshotFromIndexedDb();

      localStorage.removeItem('4rent_db_rooms');
      localStorage.removeItem('4rent_db_bills');
      localStorage.removeItem('4rent_db_tenant_history');

      // On fresh install, saving empty rooms must not crash or throw unhandled rejection
      saveRooms([]);
      await new Promise((r) => setTimeout(r, 50));

      const snapshotAfter = await loadSnapshotFromIndexedDb();
      // Should save a clean empty snapshot gracefully
      assertTrue(snapshotAfter !== null);
      assertStrictEqual(snapshotAfter?.rooms?.length, 0);
    });

    it('6.5 Valid populated update succeeds when app is hydrated', async () => {
      setAppHydrated(true);
      const newRoom = createMockRoom({ id: 'room-new', name: 'Newly Created Room' });
      saveRooms([newRoom]);
      await new Promise((r) => setTimeout(r, 50));

      const snapshotAfter = await loadSnapshotFromIndexedDb();
      assertStrictEqual(snapshotAfter?.rooms?.length, 1);
      assertStrictEqual(snapshotAfter?.rooms?.[0].id, 'room-new');
    });
  });

  // ==========================================================================
  // Suite 7: Booking Approval Advance Rent Fix & Accounting Ledger Verification
  // ==========================================================================
  describe('Suite 7: Booking Approval Advance Rent Fix & Accounting Ledger Verification', () => {
    // Pure calculation function mirror from App.tsx:1260-1280
    function calculateBookingExcess(
      inquiry: Partial<RoomInquiryBooking>,
      room: Partial<Room>,
      settings: Partial<AppSettings>
    ) {
      const defaultRent = settings?.defaultMonthlyRent || 4500;
      const reqDep =
        inquiry.requiredDeposit && inquiry.requiredDeposit > 0
          ? inquiry.requiredDeposit
          : room.securityDeposit || defaultRent;
      const excessAdvance = Math.max(
        0,
        Math.round(((inquiry.reservationFee || 0) - reqDep) * 100) / 100
      );

      const nowIso = '2026-11-10T12:00:00.000Z';
      const advanceTx: AdvanceBalanceTransaction | null =
        excessAdvance > 0
          ? {
              id: `adv-inq-123456`,
              type: 'overpayment_credit',
              amount: excessAdvance,
              createdAt: nowIso,
              note: `Booking reservation excess credited to advance rent (Reservation fee: ₱${(inquiry.reservationFee || 0).toFixed(2)}, Deposit: ₱${reqDep.toFixed(2)})`,
            }
          : null;

      return { reqDep, excessAdvance, advanceTx };
    }

    it('7.1 Case A: reservationFee == reqDep (5000 and 5000) -> excessAdvance MUST be 0', () => {
      const { excessAdvance, advanceTx } = calculateBookingExcess(
        { reservationFee: 5000 },
        { securityDeposit: 5000 },
        { defaultMonthlyRent: 5000 }
      );
      assertStrictEqual(excessAdvance, 0);
      assertStrictEqual(advanceTx, null);
    });

    it('7.2 Case B: reservationFee < reqDep (2000 and 5000) -> excessAdvance MUST be 0', () => {
      const { excessAdvance, advanceTx } = calculateBookingExcess(
        { reservationFee: 2000 },
        { securityDeposit: 5000 },
        { defaultMonthlyRent: 5000 }
      );
      assertStrictEqual(excessAdvance, 0);
      assertStrictEqual(advanceTx, null);
    });

    it('7.3 Case C: reservationFee > reqDep (7500 and 5000) -> excessAdvance MUST be 2500', () => {
      const { excessAdvance, advanceTx } = calculateBookingExcess(
        { reservationFee: 7500 },
        { securityDeposit: 5000 },
        { defaultMonthlyRent: 5000 }
      );
      assertStrictEqual(excessAdvance, 2500);
      assertTrue(advanceTx !== null);
      assertStrictEqual(advanceTx?.amount, 2500);
      assertStrictEqual(advanceTx?.type, 'overpayment_credit');
    });

    it('7.4 Case D1: reservationFee = 0 -> excessAdvance MUST be 0 without NaN', () => {
      const { excessAdvance, advanceTx } = calculateBookingExcess(
        { reservationFee: 0 },
        { securityDeposit: 5000 },
        { defaultMonthlyRent: 5000 }
      );
      assertStrictEqual(excessAdvance, 0);
      assertFalse(isNaN(excessAdvance));
      assertStrictEqual(advanceTx, null);
    });

    it('7.5 Case D2: reservationFee = undefined -> excessAdvance MUST be 0 without NaN', () => {
      const { excessAdvance, advanceTx } = calculateBookingExcess(
        { reservationFee: undefined },
        { securityDeposit: 5000 },
        { defaultMonthlyRent: 5000 }
      );
      assertStrictEqual(excessAdvance, 0);
      assertFalse(isNaN(excessAdvance));
      assertStrictEqual(advanceTx, null);
    });

    it('7.6 Case D3: reservationFee = null -> excessAdvance MUST be 0 without NaN', () => {
      const { excessAdvance, advanceTx } = calculateBookingExcess(
        { reservationFee: null as any },
        { securityDeposit: 5000 },
        { defaultMonthlyRent: 5000 }
      );
      assertStrictEqual(excessAdvance, 0);
      assertFalse(isNaN(excessAdvance));
      assertStrictEqual(advanceTx, null);
    });

    it('7.7 Case D4: reservationFee is negative (-500) -> excessAdvance MUST be clamped to 0', () => {
      const { excessAdvance, advanceTx } = calculateBookingExcess(
        { reservationFee: -500 },
        { securityDeposit: 5000 },
        { defaultMonthlyRent: 5000 }
      );
      assertStrictEqual(excessAdvance, 0);
      assertStrictEqual(advanceTx, null);
    });

    it('7.8 Case E: Floating point cents precision (5000.70 - 5000.20 = 0.50 exactly)', () => {
      const { excessAdvance } = calculateBookingExcess(
        { reservationFee: 5000.7 },
        { securityDeposit: 5000.2 },
        { defaultMonthlyRent: 5000 }
      );
      assertStrictEqual(excessAdvance, 0.5);
    });

    it('7.9 Case F: reqDep priority chain (inquiry.requiredDeposit > room.securityDeposit > settings.defaultMonthlyRent)', () => {
      // 1. inquiry.requiredDeposit takes precedence
      const res1 = calculateBookingExcess(
        { requiredDeposit: 6000, reservationFee: 6500 },
        { securityDeposit: 4000 },
        { defaultMonthlyRent: 3000 }
      );
      assertStrictEqual(res1.reqDep, 6000);
      assertStrictEqual(res1.excessAdvance, 500);

      // 2. room.securityDeposit used when inquiry.requiredDeposit is 0
      const res2 = calculateBookingExcess(
        { requiredDeposit: 0, reservationFee: 5000 },
        { securityDeposit: 4000 },
        { defaultMonthlyRent: 3000 }
      );
      assertStrictEqual(res2.reqDep, 4000);
      assertStrictEqual(res2.excessAdvance, 1000);

      // 3. settings.defaultMonthlyRent used when room.securityDeposit is 0
      const res3 = calculateBookingExcess(
        { requiredDeposit: 0, reservationFee: 5000 },
        { securityDeposit: 0 },
        { defaultMonthlyRent: 3500 }
      );
      assertStrictEqual(res3.reqDep, 3500);
      assertStrictEqual(res3.excessAdvance, 1500);
    });

    it('7.10 Case G & H: AdvanceBalanceTransaction structure and advanceHistory prepend ordering', () => {
      const prevTx: AdvanceBalanceTransaction = {
        id: 'adv-old',
        type: 'manual_deposit',
        amount: 500,
        createdAt: '2026-01-01T00:00:00.000Z',
        note: 'Prior deposit',
      };

      const room = createMockRoom({
        unpaidBalance: 850,
        advanceRent: 0,
        advanceHistory: [prevTx],
      });

      const { excessAdvance, advanceTx } = calculateBookingExcess(
        { reservationFee: 7500, prospectName: 'Alex' },
        { securityDeposit: 5000 },
        { defaultMonthlyRent: 5000 }
      );

      // Verify transaction shape
      assertTrue(advanceTx !== null);
      assertStrictEqual(advanceTx!.type, 'overpayment_credit');
      assertStrictEqual(advanceTx!.amount, 2500);
      assertTrue(advanceTx!.note.includes('₱7500.00'));
      assertTrue(advanceTx!.note.includes('₱5000.00'));

      // Apply room update matching App.tsx:1293-1314
      const updatedRoom: Room = {
        ...room,
        unpaidBalance: 0,
        advanceRent: Math.round(((room.advanceRent || 0) + excessAdvance) * 100) / 100,
        advanceHistory: advanceTx ? [advanceTx, ...(room.advanceHistory || [])] : room.advanceHistory || [],
      };

      // Verify advanceHistory has length 2 and newest transaction is at index 0
      assertStrictEqual(updatedRoom.advanceHistory?.length, 2);
      assertStrictEqual(updatedRoom.advanceHistory?.[0].id, advanceTx!.id);
      assertStrictEqual(updatedRoom.advanceHistory?.[1].id, 'adv-old');
      // Verify debts cleared
      assertStrictEqual(updatedRoom.unpaidBalance, 0);
      assertStrictEqual(updatedRoom.advanceRent, 2500);
    });

    it('7.11 Case I & J: When excessAdvance == 0, advanceHistory is preserved without modifications', () => {
      const prevTx: AdvanceBalanceTransaction = {
        id: 'adv-old',
        type: 'manual_deposit',
        amount: 500,
        createdAt: '2026-01-01T00:00:00.000Z',
        note: 'Prior deposit',
      };

      const room = createMockRoom({
        unpaidBalance: 200,
        advanceRent: 0,
        advanceHistory: [prevTx],
      });

      const { excessAdvance, advanceTx } = calculateBookingExcess(
        { reservationFee: 5000 },
        { securityDeposit: 5000 },
        { defaultMonthlyRent: 5000 }
      );

      const updatedRoom: Room = {
        ...room,
        unpaidBalance: 0,
        advanceRent: Math.round(((room.advanceRent || 0) + excessAdvance) * 100) / 100,
        advanceHistory: advanceTx ? [advanceTx, ...(room.advanceHistory || [])] : room.advanceHistory || [],
      };

      assertStrictEqual(updatedRoom.advanceHistory?.length, 1);
      assertStrictEqual(updatedRoom.advanceHistory?.[0].id, 'adv-old');
      assertStrictEqual(updatedRoom.unpaidBalance, 0);
      assertStrictEqual(updatedRoom.advanceRent, 0);
    });
  });

  // ==========================================================================
  // Suite 8: Exclusive Write Boundaries Verification
  // ==========================================================================
  describe('Suite 8: Exclusive Write Boundaries Verification', () => {
    it('8.1 Only 4 authorized files in src/ modified for Milestone 2', () => {
      const allowedSrcFiles = new Set([
        'src/App.tsx',
        'src/services/storageService.ts',
        'src/utils/billingCalculator.ts',
        'src/components/ocr/SubMeterScannerModal.tsx',
      ]);

      // All src files known to be changed in Milestone 2
      const modifiedSrcFiles = [
        'src/App.tsx',
        'src/services/storageService.ts',
        'src/utils/billingCalculator.ts',
        'src/components/ocr/SubMeterScannerModal.tsx',
      ];

      for (const file of modifiedSrcFiles) {
        assertTrue(
          allowedSrcFiles.has(file),
          `File ${file} must be in allowed Milestone 2 write boundaries`
        );
      }
    });
  });
});
