import { describe, it, expect } from 'vitest';
import {
  calculateSubMeterDifference,
  calculateBillBreakdown,
  applyPaymentToBill,
  applyPaymentWithOverpayment,
  clampDueDayOneToTen,
  extractMeterDigitsFromOcrText,
  formatPeso,
  formatPesoPrivacy,
  formatPhoneNumber,
  maskPhoneNumber,
  generateReceiptVerificationCode,
  getBillingPeriodOptions,
  getNextDueDateInOneToTenWindow,
} from './billingCalculator';
import { BillRecord } from '../types/rental';

describe('4Rent Sub-Meter OCR & Billing Engine', () => {
  it('accurately computes electric sub-meter kWh difference and cost', () => {
    const res = calculateSubMeterDifference({
      prevReading: 1240.5,
      currReading: 1315.0,
      electricRate: 14.5,
    });

    expect(res.isValid).toBe(true);
    expect(res.consumptionKwh).toBe(74.5);
    expect(res.electricTotal).toBe(1080.25);
  });

  it('flags invalid reading when current reading is lower than previous', () => {
    const res = calculateSubMeterDifference({
      prevReading: 1500,
      currReading: 1420,
      electricRate: 15,
    });

    expect(res.isValid).toBe(false);
    expect(res.consumptionKwh).toBe(0);
    expect(res.errorMessage).toContain('Current reading cannot be less');
  });

  it('computes full bill with base rent, electric bill, carry-over balance, and deposit credit', () => {
    const result = calculateBillBreakdown({
      baseRent: 4500,
      prevReading: 200,
      currReading: 250,
      electricRate: 15, // 50 kWh * 15 = 750
      previousBalanceCarryOver: 500,
      depositApplied: 250,
    });

    expect(result.consumptionKwh).toBe(50);
    expect(result.electricTotal).toBe(750);
    expect(result.grossTotal).toBe(5750); // 4500 + 750 + 500
    expect(result.totalAmountDue).toBe(5500); // 5750 - 250
  });

  it('handles partial payment, full payment, and overpayment credit into Advance Payment Balance', () => {
    const mockBill: BillRecord = {
      id: 'bill-1',
      receiptNo: '4R-202611-001',
      roomId: 'room-1',
      roomName: 'Room 101',
      tenantName: 'Juan Dela Cruz',
      billingPeriod: 'Nov 2026',
      createdAt: '2026-11-06T00:00:00Z',
      dueDate: '2026-11-05T00:00:00Z',
      prevReading: 100,
      currReading: 140,
      consumptionKwh: 40,
      electricRate: 15,
      electricTotal: 600,
      baseRent: 4000,
      securityDepositRequired: 4000,
      previousBalanceCarryOver: 0,
      depositApplied: 0,
      totalAmountDue: 4600,
      amountPaid: 0,
      overpaymentToAdvance: 0,
      remainingBalance: 4600,
      status: 'unpaid',
      paymentHistory: [],
      updatedAt: '2026-11-06T00:00:00Z',
    };

    const afterPartial = applyPaymentToBill(mockBill, 2600, 'GCash', 'REF123');
    expect(afterPartial.status).toBe('partial');
    expect(afterPartial.amountPaid).toBe(2600);
    expect(afterPartial.remainingBalance).toBe(2000);

    // Tenant pays ₱2,500 when only ₱2,000 is remaining -> ₱500 goes to Advance Payment Balance
    const overpayOutcome = applyPaymentWithOverpayment(
      afterPartial,
      2500,
      'Cash'
    );
    expect(overpayOutcome.updatedBill.status).toBe('paid');
    expect(overpayOutcome.updatedBill.remainingBalance).toBe(0);
    expect(overpayOutcome.overpaymentCredited).toBe(500);
    expect(overpayOutcome.updatedBill.overpaymentToAdvance).toBe(500);
  });

  it('clamps monthly payment due day strictly between 1 and 10', () => {
    expect(clampDueDayOneToTen(0)).toBe(5);
    expect(clampDueDayOneToTen(3)).toBe(3);
    expect(clampDueDayOneToTen(15)).toBe(10);
  });

  it('extracts numeric sub-meter reading from noisy OCR text', () => {
    expect(extractMeterDigitsFromOcrText('kWh O1485.6')).toBe(1485.6);
    expect(extractMeterDigitsFromOcrText('METER NO 22\n 00342.8 kWh')).toBe(
      342.8
    );
    expect(extractMeterDigitsFromOcrText('no digits here')).toBeNull();
  });

  it('formats currency in Philippine Peso (₱)', () => {
    expect(formatPeso(0)).toBe('₱0.00');
    expect(formatPeso(5420.5)).toBe('₱5,420.50');
  });

  it('auto-formats Philippine mobile numbers as user types', () => {
    expect(formatPhoneNumber('09175550101')).toBe('0917-555-0101');
    expect(formatPhoneNumber('9175550101')).toBe('0917-555-0101');
    expect(formatPhoneNumber('+639187770202')).toBe('0918-777-0202');
  });

  it('computes auto next-month due date strictly within Day 1 to Day 10', () => {
    const dueIso = getNextDueDateInOneToTenWindow(18, '2026-06-15');
    expect(dueIso).toBe('2026-07-10'); // Clamped to Day 10 of next month
    const dueIsoDay5 = getNextDueDateInOneToTenWindow(5, '2026-11-06');
    expect(dueIsoDay5).toBe('2026-12-05');
  });

  it('returns selectable billing period options for OCR reader dropdown', () => {
    const options = getBillingPeriodOptions();
    expect(options.length).toBeGreaterThanOrEqual(8);
  });

  it('masks tenant mobile numbers and landlord revenue when privacy shield is enabled', () => {
    expect(maskPhoneNumber('0917-555-0101')).toBe('0917-•••-••01');
    expect(maskPhoneNumber('0917-555-0101', false)).toBe('0917-555-0101');
    expect(formatPesoPrivacy(18500, false)).toBe('₱18,500.00');
    expect(formatPesoPrivacy(18500, true)).toBe('₱••,•••.••');
  });

  it('generates a deterministic anti-tamper receipt verification seal', () => {
    const seal1 = generateReceiptVerificationCode('4R-202611-001', 'Room 101', 4600);
    const seal2 = generateReceiptVerificationCode('4R-202611-001', 'Room 101', 4600);
    const sealTampered = generateReceiptVerificationCode('4R-202611-001', 'Room 101', 2600);
    expect(seal1).toMatch(/^4R-SEAL-[A-Z0-9]{6}$/);
    expect(seal1).toBe(seal2);
    expect(seal1).not.toBe(sealTampered);
  });
});
