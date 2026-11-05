import { describe, it, expect } from 'vitest';
import {
  calculateSubMeterDifference,
  calculateBillBreakdown,
  applyPaymentToBill,
  extractMeterDigitsFromOcrText,
  formatPeso,
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

  it('handles partial payment and tracks remaining carry-over balance', () => {
    const mockBill: BillRecord = {
      id: 'bill-1',
      receiptNo: '4R-202611-001',
      roomId: 'room-1',
      roomName: 'Room 101',
      tenantName: 'Juan Dela Cruz',
      billingPeriod: 'Nov 2026',
      createdAt: '2026-11-06T00:00:00Z',
      dueDate: '2026-11-15T00:00:00Z',
      prevReading: 100,
      currReading: 140,
      consumptionKwh: 40,
      electricRate: 15,
      electricTotal: 600,
      baseRent: 4000,
      previousBalanceCarryOver: 0,
      depositApplied: 0,
      totalAmountDue: 4600,
      amountPaid: 0,
      remainingBalance: 4600,
      status: 'unpaid',
      paymentHistory: [],
      updatedAt: '2026-11-06T00:00:00Z',
    };

    const afterPartial = applyPaymentToBill(mockBill, 2600, 'GCash', 'REF123');
    expect(afterPartial.status).toBe('partial');
    expect(afterPartial.amountPaid).toBe(2600);
    expect(afterPartial.remainingBalance).toBe(2000);
    expect(afterPartial.paymentHistory).toHaveLength(1);

    const afterFull = applyPaymentToBill(afterPartial, 2000, 'Cash');
    expect(afterFull.status).toBe('paid');
    expect(afterFull.amountPaid).toBe(4600);
    expect(afterFull.remainingBalance).toBe(0);
    expect(afterFull.paymentHistory).toHaveLength(2);
  });

  it('extracts numeric sub-meter reading from noisy OCR text', () => {
    expect(extractMeterDigitsFromOcrText('kWh O1485.6')).toBe(1485.6);
    expect(extractMeterDigitsFromOcrText('METER NO 22\n 00342.8 kWh')).toBe(342.8);
    expect(extractMeterDigitsFromOcrText('no digits here')).toBeNull();
  });

  it('formats currency in Philippine Peso (₱)', () => {
    expect(formatPeso(0)).toBe('₱0.00');
    expect(formatPeso(5420.5)).toBe('₱5,420.50');
  });
});

