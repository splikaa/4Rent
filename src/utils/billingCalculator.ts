import { BillRecord, PaymentTransaction } from '../types/rental';

export interface SubMeterCalculationInput {
  prevReading: number;
  currReading: number;
  electricRate: number;
  meterMaxDigits?: number; // Default 99999.9 rollover support if needed
}

export interface SubMeterCalculationResult {
  isValid: boolean;
  isRollover: boolean;
  consumptionKwh: number;
  electricTotal: number;
  errorMessage?: string;
}

export interface FullBillInput {
  baseRent: number;
  prevReading: number;
  currReading: number;
  electricRate: number;
  previousBalanceCarryOver: number;
  depositApplied?: number;
}

export interface FullBillResult {
  consumptionKwh: number;
  electricTotal: number;
  baseRent: number;
  previousBalanceCarryOver: number;
  depositApplied: number;
  grossTotal: number;
  totalAmountDue: number;
}

/**
 * Calculates the sub-meter kWh difference and total electric cost.
 * Handles decimal readings (e.g. 1245.6 - 1190.2 = 55.4 kWh).
 */
export function calculateSubMeterDifference(
  input: SubMeterCalculationInput
): SubMeterCalculationResult {
  const prev = Number(input.prevReading) || 0;
  const curr = Number(input.currReading) || 0;
  const rate = Math.max(0, Number(input.electricRate) || 0);

  if (curr < prev) {
    return {
      isValid: false,
      isRollover: false,
      consumptionKwh: 0,
      electricTotal: 0,
      errorMessage:
        'Current reading cannot be less than previous reading unless meter was reset.',
    };
  }

  const consumptionKwh = Math.round((curr - prev) * 100) / 100;
  const electricTotal = Math.round(consumptionKwh * rate * 100) / 100;

  return {
    isValid: true,
    isRollover: false,
    consumptionKwh,
    electricTotal,
  };
}

/**
 * Calculates the full apartment bill breakdown:
 * Total Due = Base Rent + (Curr - Prev) * Rate + Previous Unpaid Balance - Deposit Applied
 */
export function calculateBillBreakdown(input: FullBillInput): FullBillResult {
  const subMeter = calculateSubMeterDifference({
    prevReading: input.prevReading,
    currReading: input.currReading,
    electricRate: input.electricRate,
  });

  const baseRent = Math.max(0, Number(input.baseRent) || 0);
  const previousBalanceCarryOver = Math.max(
    0,
    Number(input.previousBalanceCarryOver) || 0
  );
  const depositApplied = Math.max(0, Number(input.depositApplied) || 0);

  const grossTotal =
    Math.round(
      (baseRent + subMeter.electricTotal + previousBalanceCarryOver) * 100
    ) / 100;
  const totalAmountDue = Math.max(
    0,
    Math.round((grossTotal - depositApplied) * 100) / 100
  );

  return {
    consumptionKwh: subMeter.consumptionKwh,
    electricTotal: subMeter.electricTotal,
    baseRent,
    previousBalanceCarryOver,
    depositApplied,
    grossTotal,
    totalAmountDue,
  };
}

/**
 * Applies a full or partial payment to a bill record and computes the remaining carry-over balance.
 */
export function applyPaymentToBill(
  bill: BillRecord,
  paymentAmount: number,
  method: 'Cash' | 'GCash' | 'Maya' | 'Bank Transfer',
  referenceNo?: string,
  note?: string
): BillRecord {
  const validPayment = Math.max(0, Math.round(Number(paymentAmount) * 100) / 100);
  const nowIso = new Date().toISOString();

  const newTx: PaymentTransaction = {
    id: `tx-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    amount: validPayment,
    method,
    paidAt: nowIso,
    referenceNo,
    note,
  };

  const newAmountPaid =
    Math.round(((bill.amountPaid || 0) + validPayment) * 100) / 100;
  const remainingBalance = Math.max(
    0,
    Math.round((bill.totalAmountDue - newAmountPaid) * 100) / 100
  );

  let status: 'paid' | 'partial' | 'unpaid' = 'unpaid';
  if (remainingBalance <= 0.009) {
    status = 'paid';
  } else if (newAmountPaid > 0) {
    status = 'partial';
  }

  return {
    ...bill,
    amountPaid: newAmountPaid,
    remainingBalance,
    status,
    paymentMethod: method,
    paidAt: status === 'paid' ? nowIso : bill.paidAt || nowIso,
    paymentHistory: [...(bill.paymentHistory || []), newTx],
    updatedAt: nowIso,
  };
}

/**
 * Extracts the most plausible numeric electric sub-meter reading from raw OCR text.
 * Handles common OCR digit substitutions (O -> 0, I/l -> 1, S -> 5, B -> 8).
 */
export function extractMeterDigitsFromOcrText(rawText: string): number | null {
  if (!rawText || !rawText.trim() || !/\d/.test(rawText)) return null;

  const normalized = rawText
    .replace(/[OoQq](?=\d)|(?<=\d)[OoQq]/g, '0')
    .replace(/[Il|!](?=\d)|(?<=\d)[Il|!]/g, '1')
    .replace(/[Zz](?=\d)|(?<=\d)[Zz]/g, '2')
    .replace(/[Ss](?=\d)|(?<=\d)[Ss]/g, '5')
    .replace(/[Bb](?=\d)|(?<=\d)[Bb]/g, '8')
    .replace(/,/g, '.');

  // Match sequences of digits with optional single decimal part (e.g., "01482.5" or "1482")
  const matches = normalized.match(/\d{1,7}(?:\.\d{1,2})?/g);
  if (!matches || matches.length === 0) return null;

  // Prefer the longest digit sequence (typical 4-6 digit sub-meter drum/LCD)
  const sorted = [...matches].sort((a, b) => b.replace('.', '').length - a.replace('.', '').length);
  const parsed = parseFloat(sorted[0]);
  if (Number.isNaN(parsed) || parsed < 0) return null;

  return Math.round(parsed * 100) / 100;
}

/**
 * Formats numbers into Philippine Peso (₱0.00).
 */
export function formatPeso(amount: number): string {
  const num = Number(amount) || 0;
  return `₱${num.toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/**
 * Generates a formatted plain-text billing summary ready for Facebook Messenger paste/share.
 */
export function formatMessengerBillSummary(
  bill: BillRecord,
  apartmentName: string,
  paymentInstructions: string
): string {
  const statusLabel =
    bill.status === 'paid'
      ? '✅ PAID'
      : bill.status === 'partial'
      ? '🟡 PARTIAL PAYMENT'
      : '🔴 UNPAID / DUE';

  const lines = [
    `🏠 *${apartmentName} — Official Billing Statement*`,
    `Receipt No: ${bill.receiptNo}`,
    `Room: *${bill.roomName}*`,
    `Tenant: ${bill.tenantName}`,
    `Billing Period: ${bill.billingPeriod}`,
    `Due Date: ${new Date(bill.dueDate).toLocaleDateString('en-PH', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })}`,
    `────────────────────`,
    `⚡ *ELECTRIC SUB-METER READING*`,
    `• Current Reading: ${bill.currReading.toFixed(1)} kWh`,
    `• Previous Reading: ${bill.prevReading.toFixed(1)} kWh`,
    `• Consumption (Δ): *${bill.consumptionKwh.toFixed(1)} kWh*`,
    `• Electric Rate: ${formatPeso(bill.electricRate)} / kWh`,
    `• Electric Sub-Total: *${formatPeso(bill.electricTotal)}*`,
    `────────────────────`,
    `📋 *BILLING BREAKDOWN*`,
    `• Monthly Room Rent: ${formatPeso(bill.baseRent)}`,
    `• Electric Bill: ${formatPeso(bill.electricTotal)}`,
  ];

  if (bill.previousBalanceCarryOver > 0) {
    lines.push(
      `• Previous Unpaid Balance: ${formatPeso(bill.previousBalanceCarryOver)}`
    );
  }
  if (bill.depositApplied > 0) {
    lines.push(`• Less Deposit/Credit Applied: -${formatPeso(bill.depositApplied)}`);
  }

  lines.push(
    `────────────────────`,
    `💰 *TOTAL AMOUNT DUE: ${formatPeso(bill.totalAmountDue)}*`
  );

  if (bill.amountPaid > 0) {
    lines.push(`• Amount Paid: ${formatPeso(bill.amountPaid)}`);
    lines.push(`• Remaining Balance: *${formatPeso(bill.remainingBalance)}*`);
  }

  lines.push(`• Status: ${statusLabel}`);

  if (paymentInstructions && bill.status !== 'paid') {
    lines.push(`────────────────────`, `💳 *Payment Channels:*`, paymentInstructions);
  }

  lines.push(`\nGenerated via 4Rent Property Management System`);
  return lines.join('\n');
}

