import { BillRecord, PaymentTransaction } from '../types/rental';

export interface SubMeterCalculationInput {
  prevReading: number;
  currReading: number;
  electricRate: number;
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

export interface ApplyPaymentOutcome {
  updatedBill: BillRecord;
  overpaymentCredited: number;
}

/**
 * Detects whether the current device is a mobile/tablet touch device.
 * Desktop systems use PIN-only authentication (no biometric prompts).
 */
export function isMobileDevice(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return false;
  }
  const ua = navigator.userAgent || '';
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
    ua
  );
}

/**
 * Detects whether 4Rent Management System is currently running inside the installed
 * Desktop Launcher (Electron, Edge/Chrome --app window, standalone PWA, or already installed).
 */
export function isRunningInDesktopApp(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const ua = navigator.userAgent || '';
    if (/Electron/i.test(ua)) return true;

    const params = new URLSearchParams(window.location.search);
    if (params.get('desktop') === '1' || params.get('app') === '1') {
      localStorage.setItem('4rent_desktop_installed', 'true');
      return true;
    }

    if (localStorage.getItem('4rent_desktop_installed') === 'true') {
      return true;
    }

    if (
      window.matchMedia?.('(display-mode: standalone)').matches ||
      window.matchMedia?.('(display-mode: minimal-ui)').matches ||
      window.matchMedia?.('(display-mode: window-controls-overlay)').matches
    ) {
      localStorage.setItem('4rent_desktop_installed', 'true');
      return true;
    }

    // Chromium --app mode hides the browser menubar/toolbar
    const winAny = window as unknown as {
      menubar?: { visible?: boolean };
      toolbar?: { visible?: boolean };
    };
    if (
      (winAny.menubar && winAny.menubar.visible === false) ||
      (winAny.toolbar && winAny.toolbar.visible === false)
    ) {
      localStorage.setItem('4rent_desktop_installed', 'true');
      return true;
    }
  } catch {
    // ignore access errors
  }
  return false;
}

/**
 * Automatically formats Philippine mobile phone numbers as the user types:
 * e.g., "09175550101" -> "0917-555-0101"
 */
export function formatPhoneNumber(raw: string): string {
  if (!raw) return '';
  let digits = raw.replace(/\D/g, '');
  if (digits.startsWith('639') && digits.length >= 11) {
    digits = '0' + digits.slice(2);
  } else if (digits.startsWith('9') && digits.length <= 10) {
    digits = '0' + digits;
  }
  digits = digits.slice(0, 11);

  if (digits.length <= 4) {
    return digits;
  }
  if (digits.length <= 7) {
    return `${digits.slice(0, 4)}-${digits.slice(4)}`;
  }
  return `${digits.slice(0, 4)}-${digits.slice(4, 7)}-${digits.slice(7, 11)}`;
}

/**
 * Masks a phone number for Tenant Privacy Protection (e.g., "0917-555-0101" -> "0917-•••-••01").
 */
export function maskPhoneNumber(raw?: string, shouldMask = true): string {
  if (!raw) return '';
  const formatted = formatPhoneNumber(raw);
  if (!shouldMask) return formatted;
  const digits = formatted.replace(/\D/g, '');
  if (digits.length < 6) return '••••-•••-••••';
  return `${digits.slice(0, 4)}-•••-••${digits.slice(-2)}`;
}

/**
 * Masks currency figures when Landlord Privacy Shield is active in public view.
 */
export function formatPesoPrivacy(amount: number, shouldMask = false): string {
  if (shouldMask) return '₱••,•••.••';
  return formatPeso(amount);
}

/**
 * Generates an anti-tamper verification code for Official Receipts to protect Landlord & Tenant.
 */
export function generateReceiptVerificationCode(
  receiptNo: string,
  roomName: string,
  totalAmount: number
): string {
  const seed = `${receiptNo}|${roomName}|${totalAmount.toFixed(2)}`;
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const hex = (hash >>> 0).toString(16).toUpperCase().padStart(8, '0');
  return `4R-SEAL-${hex.slice(0, 6)}`;
}

/**
 * Clamps any due day of the month to the mandatory 1st–10th payment window.
 */
export function clampDueDayOneToTen(day: number): number {
  const parsed = Math.round(Number(day) || 5);
  return Math.min(10, Math.max(1, parsed));
}

/**
 * Automatically computes the Next Month's Payment Due Date strictly within Day 1 to Day 10.
 * If a baseDate (such as Move-In Date) is provided, the due date is set to the NEXT month on `preferredDay` (1-10).
 */
export function getNextDueDateInOneToTenWindow(
  preferredDay = 5,
  baseDateStr?: string
): string {
  const safeDay = clampDueDayOneToTen(preferredDay);
  const base = baseDateStr ? new Date(baseDateStr) : new Date();
  const validBase = Number.isNaN(base.getTime()) ? new Date() : base;

  let year = validBase.getFullYear();
  let month = validBase.getMonth() + 1; // Always advance to next month cycle
  if (month > 11) {
    month = 0;
    year += 1;
  }

  const target = new Date(year, month, safeDay, 12, 0, 0);
  return target.toISOString().slice(0, 10);
}

/**
 * Generates a list of selectable Billing Period options (e.g., "Nov 2026", "Dec 2026", etc.)
 * so the user doesn't have to type the billing period manually in the OCR Reader.
 */
export function getBillingPeriodOptions(): string[] {
  const now = new Date();
  const options: string[] = [];
  for (let offset = -2; offset <= 6; offset++) {
    const d = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    const label = d.toLocaleDateString('en-US', {
      month: 'short',
      year: 'numeric',
    });
    options.push(label);
  }
  return options;
}

/**
 * Calculates the sub-meter kWh difference and total electric cost.
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
 * Total Due = Base Rent + (Curr - Prev) * Global Rate + Previous Unpaid Balance - Advance/Deposit Applied
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
 * Applies a payment to a bill record.
 * If the tenant pays MORE than the remaining balance due, the excess is automatically
 * calculated as `overpaymentToAdvance` so it goes into the room's withdrawable Advance Payment Balance.
 */
export function applyPaymentWithOverpayment(
  bill: BillRecord,
  paymentAmount: number,
  method: 'Cash' | 'GCash' | 'Maya' | 'Bank Transfer',
  referenceNo?: string,
  note?: string
): ApplyPaymentOutcome {
  const validPayment = Math.max(
    0,
    Math.round(Number(paymentAmount) * 100) / 100
  );
  const nowIso = new Date().toISOString();

  const currentRemaining = Math.max(
    0,
    Math.round((bill.totalAmountDue - (bill.amountPaid || 0)) * 100) / 100
  );

  const overpaymentCredited =
    validPayment > currentRemaining
      ? Math.round((validPayment - currentRemaining) * 100) / 100
      : 0;

  const newTx: PaymentTransaction = {
    id: `tx-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    amount: validPayment,
    overpaymentCredited:
      overpaymentCredited > 0 ? overpaymentCredited : undefined,
    method,
    paidAt: nowIso,
    referenceNo,
    note:
      overpaymentCredited > 0
        ? `Excess ₱${overpaymentCredited.toFixed(
            2
          )} credited to Advance Payment Balance`
        : note,
  };

  const newAmountPaid =
    Math.round(((bill.amountPaid || 0) + validPayment) * 100) / 100;
  const remainingBalance = Math.max(
    0,
    Math.round((bill.totalAmountDue - newAmountPaid) * 100) / 100
  );
  const totalOverpayment =
    Math.round(((bill.overpaymentToAdvance || 0) + overpaymentCredited) * 100) /
    100;

  let status: 'paid' | 'partial' | 'unpaid' = 'unpaid';
  if (remainingBalance <= 0.009) {
    status = 'paid';
  } else if (newAmountPaid > 0) {
    status = 'partial';
  }

  const updatedBill: BillRecord = {
    ...bill,
    amountPaid: newAmountPaid,
    overpaymentToAdvance: totalOverpayment,
    remainingBalance,
    status,
    paymentMethod: method,
    paidAt: status === 'paid' ? nowIso : bill.paidAt || nowIso,
    paymentHistory: [...(bill.paymentHistory || []), newTx],
    updatedAt: nowIso,
  };

  return {
    updatedBill,
    overpaymentCredited,
  };
}

/**
 * Backwards-compatible wrapper for applyPaymentToBill.
 */
export function applyPaymentToBill(
  bill: BillRecord,
  paymentAmount: number,
  method: 'Cash' | 'GCash' | 'Maya' | 'Bank Transfer',
  referenceNo?: string,
  note?: string
): BillRecord {
  return applyPaymentWithOverpayment(
    bill,
    paymentAmount,
    method,
    referenceNo,
    note
  ).updatedBill;
}

/**
 * Extracts the accurate numeric electric sub-meter reading (in kWh) from raw OCR text
 * while filtering out faceplate specifications, multiplier scale headers (10000 1000 100 10 1 0.1),
 * impulse constants (1600imp/kWh, 3200imp/kWh), voltage/frequency specs (220/240V, 60Hz, 10(60)A),
 * and barcode/serial numbers (No. 2018-18120672, S.No. 470946, 18853562, No: 22501329).
 */
export function extractMeterDigitsFromOcrText(rawText: string): number | null {
  if (!rawText || !rawText.trim() || !/\d/.test(rawText)) return null;

  // Step 1: Remove known faceplate specification lines, serial numbers, and scale headers
  const cleanedLines = rawText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => {
      if (!line) return false;
      // Ignore serial / barcode / year / model lines
      if (
        /\b(s\.?\s*no|no\.?|serial|year|september|india|japan|technology|barcode|multifunction|approved|erc)\b/i.test(
          line
        )
      ) {
        return false;
      }
      // Ignore multiplier scale headers (e.g. "10000 1000 100 10 1 1/10" or "0.1")
      if (/10000|1000\s+100|1\/10/i.test(line)) {
        return false;
      }
      // Ignore electrical ratings and model spec boxes
      if (
        /\b(1600|3200|imp|220|240v|480\s*v|120-|50hz|60hz|10\s*\(\s*60\s*\)|5-30\s*a|sy-?168|mt-?60i|cl-?60|cl\s*20|kv2c|type-?sp1|1\s*phase|2\s*wire)\b/i.test(
          line
        )
      ) {
        return false;
      }
      return true;
    });

  if (cleanedLines.length === 0) return null;

  const cleanedText = cleanedLines
    .join(' ')
    // Strip circled counter prefix "(2)" or "②" before the cyclometer window
    .replace(/[②③]|(\(\s*2\s*\))/g, ' ')
    .replace(/[OoQq](?=\d)|(?<=\d)[OoQq]/g, '0')
    .replace(/[Il|!](?=\d)|(?<=\d)[Il|!]/g, '1')
    .replace(/,/g, '.');

  // Step 2: Check for explicit decimal kWh reading first (e.g. "00003.4", "00000.1", "1485.6")
  const decimalMatches = cleanedText.match(/\b\d{1,5}\.\d{1,2}\b/g);
  if (decimalMatches && decimalMatches.length > 0) {
    for (const candidate of decimalMatches) {
      const val = parseFloat(candidate);
      if (!Number.isNaN(val) && val >= 0 && val < 100000) {
        return Math.round(val * 10) / 10;
      }
    }
  }

  // Step 3: Check for 6-drum cyclometer reading (5 black integer drums + 1 red tenths drum, e.g. "000034" -> 3.4, "000001" -> 0.1)
  const sixDrumMatch = cleanedText.match(/\b(0\d{5})\b/);
  if (sixDrumMatch) {
    const digits = sixDrumMatch[1];
    const intPart = parseInt(digits.slice(0, 5), 10);
    const tenthsPart = parseInt(digits.slice(5, 6), 10);
    return Math.round((intPart + tenthsPart / 10) * 10) / 10;
  }

  // Step 4: Check for spaced cyclometer drum digits (e.g. "0 0 0 0 3 4" or "0 0 0 0 0 3")
  const compactDigits = cleanedText.replace(/\s+/g, '');
  const compactSixDrum = compactDigits.match(/(000\d{3})/);
  if (compactSixDrum) {
    const d = compactSixDrum[1];
    const intPart = parseInt(d.slice(0, 5), 10);
    const tenthsPart = parseInt(d.slice(5, 6), 10);
    return Math.round((intPart + tenthsPart / 10) * 10) / 10;
  }

  // Step 5: General 3-to-5 digit integer sub-meter reading (excluding 6+ digit serial numbers and common spec constants)
  const blacklistedConstants = new Set([
    10, 20, 30, 50, 60, 100, 120, 168, 220, 230, 240, 480, 1000, 1600, 2018,
    3200, 10000,
  ]);
  const intMatches = cleanedText.match(/\b\d{3,5}\b/g);
  if (intMatches) {
    for (const m of intMatches) {
      if (/^0+$/.test(m)) return 0;
      const val = parseFloat(m);
      if (
        !Number.isNaN(val) &&
        val >= 0 &&
        val < 100000 &&
        !blacklistedConstants.has(val)
      ) {
        return Math.round(val * 10) / 10;
      }
    }
  }

  return null;
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
  apartmentName: string
): string {
  const statusLabel =
    bill.status === 'paid'
      ? '✅ PAID'
      : bill.status === 'partial'
      ? '🟡 PARTIAL PAYMENT'
      : '🔴 UNPAID / DUE';

  const seal = generateReceiptVerificationCode(
    bill.receiptNo,
    bill.roomName,
    bill.totalAmountDue
  );

  const lines = [
    `🏠 *${apartmentName || '4Rent Management System'} • Official Statement*`,
    `Receipt No: ${bill.receiptNo} (${seal})`,
    `Room: *${bill.roomName}*`,
    `Tenant: ${bill.tenantName}`,
    `Billing Period: ${bill.billingPeriod}`,
    `Next Due Date (1st-10th Window): ${new Date(
      bill.dueDate
    ).toLocaleDateString('en-PH', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })}`,
    `────────────────────`,
    `⚡ *DUAL ELECTRIC SUB-METER PROOF*`,
    `• Sub-Meter #1 (Previous): ${bill.prevReading.toFixed(1)} kWh`,
    `• Sub-Meter #2 (Current): ${bill.currReading.toFixed(1)} kWh`,
    `• Consumption Difference (Δ): *${bill.consumptionKwh.toFixed(1)} kWh*`,
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
    lines.push(
      `• Less Advance / Deposit Applied: -${formatPeso(bill.depositApplied)}`
    );
  }

  lines.push(
    `────────────────────`,
    `💰 *TOTAL AMOUNT DUE: ${formatPeso(bill.totalAmountDue)}*`
  );

  if (bill.amountPaid > 0) {
    lines.push(`• Amount Paid: ${formatPeso(bill.amountPaid)}`);
    lines.push(`• Remaining Balance: *${formatPeso(bill.remainingBalance)}*`);
  }
  if (bill.overpaymentToAdvance > 0) {
    lines.push(
      `• Credited to Advance Balance (Withdrawable): +${formatPeso(
        bill.overpaymentToAdvance
      )}`
    );
  }

  lines.push(`• Status: ${statusLabel}`);
  lines.push(`\n4Rent Management System v1.0.0 • Developed by splikaa`);
  return lines.join('\n');
}
