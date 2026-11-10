/**
 * 4Rent E2E Testing Utilities & Fixture Generators
 */

import assert from 'node:assert/strict';
import {
  AppDatabaseSnapshot,
  AppSettings,
  BillRecord,
  PaymentTransaction,
  Room,
  RoomInquiryBooking,
  TenantHistoryEntry,
  TenantProfile,
} from '../../../src/types/rental';
import { DEFAULT_SETTINGS } from '../../../src/services/storageService';
import { resetBrowserEnv } from './browser_env';

// ============================================================================
// 1. Assertion Utilities
// ============================================================================

export function assertStrictEqual<T>(actual: T, expected: T, message?: string): void {
  assert.strictEqual(actual, expected, message);
}

export function assertNotStrictEqual<T>(actual: T, expected: T, message?: string): void {
  assert.notStrictEqual(actual, expected, message);
}

export function assertDeepEqual<T>(actual: T, expected: T, message?: string): void {
  assert.deepStrictEqual(actual, expected, message);
}

export function assertTrue(value: boolean, message?: string): void {
  assert.strictEqual(Boolean(value), true, message || `Expected true, received ${value}`);
}

export function assertFalse(value: boolean, message?: string): void {
  assert.strictEqual(Boolean(value), false, message || `Expected false, received ${value}`);
}

export function assertCloseTo(actual: number, expected: number, delta: number = 0.001, message?: string): void {
  const diff = Math.abs(actual - expected);
  if (diff > delta) {
    throw new assert.AssertionError({
      message: message || `Expected ${actual} to be within ${delta} of ${expected} (diff: ${diff})`,
      actual,
      expected,
      operator: 'assertCloseTo',
    });
  }
}

export function assertThrows(fn: () => any, expected?: RegExp | Function, message?: string): void {
  assert.throws(fn, expected as any, message);
}

export async function assertRejects(fn: (() => Promise<any>) | Promise<any>, expected?: RegExp | Function, message?: string): Promise<void> {
  await assert.rejects(fn, expected as any, message);
}

// ============================================================================
// 2. Realistic Fixture Generators
// ============================================================================

let idCounter = 1000;
export function nextId(prefix: string = 'id'): string {
  idCounter++;
  return `${prefix}_${idCounter}`;
}

export function createMockTenant(overrides: Partial<TenantProfile> = {}): TenantProfile {
  return {
    id: overrides.id || nextId('tenant'),
    fullName: overrides.fullName || 'Juan Dela Cruz',
    phone: overrides.phone || '0917-123-4567',
    messengerUsername: overrides.messengerUsername !== undefined ? overrides.messengerUsername : 'juan.delacruz',
    moveInDate: overrides.moveInDate || '2026-01-01',
    dueDayOfMonth: overrides.dueDayOfMonth !== undefined ? overrides.dueDayOfMonth : 5,
    validIdVerified: overrides.validIdVerified !== undefined ? overrides.validIdVerified : true,
    privacyConsentSigned: overrides.privacyConsentSigned !== undefined ? overrides.privacyConsentSigned : true,
    emergencyContact: overrides.emergencyContact || 'Maria Dela Cruz (0918-987-6543)',
    notes: overrides.notes || '',
    ...overrides,
  };
}

export function createMockRoom(overrides: Partial<Room> = {}): Room {
  const status = overrides.status || 'occupied';
  const tenant = status === 'occupied' ? (overrides.tenant || createMockTenant()) : undefined;

  return {
    id: overrides.id || nextId('room'),
    name: overrides.name || 'Room 101',
    floorOrUnit: overrides.floorOrUnit || '1st Floor • Studio',
    monthlyRent: overrides.monthlyRent !== undefined ? overrides.monthlyRent : 4500,
    lastMeterReading: overrides.lastMeterReading !== undefined ? overrides.lastMeterReading : 1245.5,
    lastReadingDate: overrides.lastReadingDate || '2026-10-01',
    status,
    tenant,
    unpaidBalance: overrides.unpaidBalance !== undefined ? overrides.unpaidBalance : 0,
    securityDeposit: overrides.securityDeposit !== undefined ? overrides.securityDeposit : 4500,
    advanceRent: overrides.advanceRent !== undefined ? overrides.advanceRent : 0,
    advanceHistory: overrides.advanceHistory || [],
    isArchived: overrides.isArchived !== undefined ? overrides.isArchived : false,
    updatedAt: overrides.updatedAt || new Date().toISOString(),
    ...overrides,
  };
}

export function createMockBill(overrides: Partial<BillRecord> = {}): BillRecord {
  const prevReading = overrides.prevReading !== undefined ? overrides.prevReading : 1200.0;
  const currReading = overrides.currReading !== undefined ? overrides.currReading : 1245.5;
  const consumptionKwh = overrides.consumptionKwh !== undefined ? overrides.consumptionKwh : Math.max(0, currReading - prevReading);
  const electricRate = overrides.electricRate !== undefined ? overrides.electricRate : 15.0;
  const electricTotal = overrides.electricTotal !== undefined ? overrides.electricTotal : consumptionKwh * electricRate;
  const baseRent = overrides.baseRent !== undefined ? overrides.baseRent : 4500.0;
  const previousBalanceCarryOver = overrides.previousBalanceCarryOver !== undefined ? overrides.previousBalanceCarryOver : 0;
  const securityDepositRequired = overrides.securityDepositRequired !== undefined ? overrides.securityDepositRequired : 0;
  const depositApplied = overrides.depositApplied !== undefined ? overrides.depositApplied : 0;
  const totalAmountDue = overrides.totalAmountDue !== undefined
    ? overrides.totalAmountDue
    : Math.max(0, baseRent + electricTotal + previousBalanceCarryOver + securityDepositRequired - depositApplied);
  const amountPaid = overrides.amountPaid !== undefined ? overrides.amountPaid : totalAmountDue;
  const remainingBalance = overrides.remainingBalance !== undefined ? overrides.remainingBalance : Math.max(0, totalAmountDue - amountPaid);
  const overpaymentToAdvance = overrides.overpaymentToAdvance !== undefined ? overrides.overpaymentToAdvance : Math.max(0, amountPaid - totalAmountDue);
  const status = overrides.status || (remainingBalance === 0 ? 'paid' : (amountPaid > 0 ? 'partial' : 'unpaid'));

  return {
    id: overrides.id || nextId('bill'),
    receiptNo: overrides.receiptNo || '4R-202611-001',
    roomId: overrides.roomId || 'room_101',
    roomName: overrides.roomName || 'Room 101',
    tenantName: overrides.tenantName || 'Juan Dela Cruz',
    tenantPhone: overrides.tenantPhone || '0917-123-4567',
    billingPeriod: overrides.billingPeriod || 'Nov 2026',
    createdAt: overrides.createdAt || '2026-11-01T08:00:00.000Z',
    dueDate: overrides.dueDate || '2026-11-05',
    prevReading,
    currReading,
    consumptionKwh,
    electricRate,
    electricTotal,
    baseRent,
    securityDepositRequired,
    previousBalanceCarryOver,
    depositApplied,
    totalAmountDue,
    amountPaid,
    overpaymentToAdvance,
    remainingBalance,
    status,
    paymentMethod: overrides.paymentMethod || 'Cash',
    paidAt: overrides.paidAt || '2026-11-02T10:00:00.000Z',
    paymentHistory: overrides.paymentHistory || [
      {
        id: nextId('tx'),
        amount: amountPaid,
        method: overrides.paymentMethod || 'Cash',
        paidAt: overrides.paidAt || '2026-11-02T10:00:00.000Z',
      },
    ],
    updatedAt: overrides.updatedAt || new Date().toISOString(),
    ...overrides,
  };
}

export function createMockInquiry(overrides: Partial<RoomInquiryBooking> = {}): RoomInquiryBooking {
  return {
    id: overrides.id || nextId('inq'),
    prospectName: overrides.prospectName || 'Maria Santos',
    phone: overrides.phone || '0920-555-0199',
    messengerUsername: overrides.messengerUsername || 'maria.santos',
    roomId: overrides.roomId || 'room_102',
    roomName: overrides.roomName || 'Room 102',
    targetMoveInDate: overrides.targetMoveInDate || '2026-12-01',
    reservationFee: overrides.reservationFee !== undefined ? overrides.reservationFee : 2000,
    quotedMonthlyRent: overrides.quotedMonthlyRent !== undefined ? overrides.quotedMonthlyRent : 4500,
    requiredDeposit: overrides.requiredDeposit !== undefined ? overrides.requiredDeposit : 4500,
    status: overrides.status || 'booked',
    validIdPresented: overrides.validIdPresented !== undefined ? overrides.validIdPresented : true,
    privacyConsentAccepted: overrides.privacyConsentAccepted !== undefined ? overrides.privacyConsentAccepted : true,
    createdAt: overrides.createdAt || new Date().toISOString(),
  };
}

export function createMockTenantHistory(overrides: Partial<TenantHistoryEntry> = {}): TenantHistoryEntry {
  return {
    id: overrides.id || nextId('hist'),
    roomId: overrides.roomId || 'room_101',
    roomName: overrides.roomName || 'Room 101',
    tenantName: overrides.tenantName || 'Pedro Penduko',
    phone: overrides.phone || '0919-444-1234',
    moveInDate: overrides.moveInDate || '2025-06-01',
    moveOutDate: overrides.moveOutDate || '2026-05-31',
    reason: overrides.reason || 'Completed Lease',
    finalMeterReading: overrides.finalMeterReading !== undefined ? overrides.finalMeterReading : 950.4,
    depositHeld: overrides.depositHeld !== undefined ? overrides.depositHeld : 4500,
    unpaidBalanceAtMoveOut: overrides.unpaidBalanceAtMoveOut !== undefined ? overrides.unpaidBalanceAtMoveOut : 0,
    lastReceiptNo: overrides.lastReceiptNo || '4R-202605-014',
  };
}

export function createMockSnapshot(overrides: Partial<AppDatabaseSnapshot> = {}): AppDatabaseSnapshot {
  return {
    version: overrides.version || '1.0.0',
    exportedAt: overrides.exportedAt || new Date().toISOString(),
    rooms: overrides.rooms || [createMockRoom()],
    bills: overrides.bills || [createMockBill()],
    inquiries: overrides.inquiries || [],
    tenantHistory: overrides.tenantHistory || [],
    settings: overrides.settings || { ...DEFAULT_SETTINGS },
  };
}

// ============================================================================
// 3. Database Seeding & Reset Helpers
// ============================================================================

export function seedLocalStorage(snapshot: Partial<AppDatabaseSnapshot> = {}): void {
  resetBrowserEnv();
  const rooms = snapshot.rooms || [];
  const bills = snapshot.bills || [];
  const inquiries = snapshot.inquiries || [];
  const history = snapshot.tenantHistory || [];
  const settings = snapshot.settings || { ...DEFAULT_SETTINGS };

  localStorage.setItem('4rent_db_rooms', JSON.stringify(rooms));
  localStorage.setItem('4rent_db_bills', JSON.stringify(bills));
  localStorage.setItem('4rent_db_inquiries', JSON.stringify(inquiries));
  localStorage.setItem('4rent_db_tenant_history', JSON.stringify(history));
  localStorage.setItem('4rent_db_settings', JSON.stringify(settings));
}

export function readLocalStorageSnapshot(): AppDatabaseSnapshot {
  return {
    version: '1.0.0',
    exportedAt: new Date().toISOString(),
    rooms: JSON.parse(localStorage.getItem('4rent_db_rooms') || '[]'),
    bills: JSON.parse(localStorage.getItem('4rent_db_bills') || '[]'),
    inquiries: JSON.parse(localStorage.getItem('4rent_db_inquiries') || '[]'),
    tenantHistory: JSON.parse(localStorage.getItem('4rent_db_tenant_history') || '[]'),
    settings: JSON.parse(localStorage.getItem('4rent_db_settings') || JSON.stringify(DEFAULT_SETTINGS)),
  };
}
