import { AppSettings, BillRecord, PaymentTransaction, Room } from '../types/rental';

export interface OcrVerificationResult {
  rawReading: number;
  verifiedReading: number;
  confidence: number;
  status: 'verified' | 'needs_confirmation' | 'anomaly_detected' | 'rollover_detected';
  warningMessage?: string;
  anomalyType?: 'exceeds_threshold' | 'negative_delta' | 'low_confidence';
}

export interface ConsumptionDeltaResult {
  delta: number;
  isNegative: boolean;
  isRollover: boolean;
  isReset?: boolean;
  error?: string;
}

export interface SubMeterCalculationInput {
  prevReading: number;
  currReading: number;
  electricRate: number;
  isRollover?: boolean;
  dialDigits?: number;
  isReset?: boolean;
}

export interface SubMeterCalculationResult {
  isValid: boolean;
  isRollover: boolean;
  isReset?: boolean;
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
  isRollover?: boolean;
  dialDigits?: number;
  isReset?: boolean;
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
    if (
      params.get('desktop') === '1' ||
      params.get('desktop') === 'true' ||
      params.get('app') === '1' ||
      params.get('app') === 'desktop'
    ) {
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
 * Detects whether 4Rent is running inside the standalone Android Mobile APK
 */
export function isRunningInMobileApp(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const params = new URLSearchParams(window.location.search);
    if (
      params.get('mobile') === '1' ||
      params.get('mobile') === 'true' ||
      params.get('app') === 'mobile' ||
      params.get('apk') === '1'
    ) {
      localStorage.setItem('4rent_mobile_installed', 'true');
      return true;
    }

    // Android WebView asset loader host or file protocol
    const hostname = window.location.hostname || '';
    if (
      hostname === 'appassets.androidplatform.net' ||
      window.location.protocol === 'file:'
    ) {
      localStorage.setItem('4rent_mobile_installed', 'true');
      return true;
    }

    const winAny = window as unknown as {
      AndroidNative?: unknown;
      AndroidBiometrics?: unknown;
      AndroidBridge?: unknown;
      Android?: unknown;
    };
    if (
      winAny.AndroidNative !== undefined ||
      winAny.AndroidBiometrics !== undefined ||
      winAny.AndroidBridge !== undefined ||
      winAny.Android !== undefined
    ) {
      localStorage.setItem('4rent_mobile_installed', 'true');
      return true;
    }
    if (localStorage.getItem('4rent_mobile_installed') === 'true') {
      return true;
    }
  } catch {
    // ignore
  }
  return false;
}

/**
 * Returns true if the app is running in an installed environment (Desktop Launcher or Mobile APK),
 * so that web download banners/buttons are hidden.
 */
export function isStandaloneApp(): boolean {
  return isRunningInDesktopApp() || isRunningInMobileApp();
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
 * Generates a list of selectable Billing Period options (e.g., "Nov 2026", "Oct 2026", etc.)
 * Strictly locked to the current active calendar month and past cycles.
 * Future months cannot be selected because electricity meters can only be billed for current or past periods.
 */
export function getBillingPeriodOptions(): string[] {
  const now = new Date();
  const options: string[] = [];
  // Current active calendar month first, followed by previous 5 consecutive monthly cycles (no future months)
  for (let offset = 0; offset >= -5; offset--) {
    const d = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    const label = d.toLocaleDateString('en-US', {
      month: 'short',
      year: 'numeric',
    });
    options.push(label);
  }
  return options;
}

export function roundCurrency(value: number): number {
  return Math.round((Number(value) || 0) * 100) / 100;
}

/**
 * Normalizes a billing period ("Nov 2026", "November 2026", "2026-11", or ISO timestamp)
 * into a canonical "YYYY-MM" key.
 */
export function normalizeMonthKey(periodOrDate?: string): string {
  const trimmed = (periodOrDate || '').trim();
  const ymMatch = trimmed.match(/^(\d{4})-(\d{2})/);
  if (ymMatch) {
    return `${ymMatch[1]}-${ymMatch[2]}`;
  }

  if (trimmed) {
    const parsedFromLabel = new Date(`1 ${trimmed}`);
    if (!Number.isNaN(parsedFromLabel.getTime())) {
      const y = parsedFromLabel.getFullYear();
      const m = String(parsedFromLabel.getMonth() + 1).padStart(2, '0');
      return `${y}-${m}`;
    }
    const parsedIso = new Date(trimmed);
    if (!Number.isNaN(parsedIso.getTime())) {
      const y = parsedIso.getFullYear();
      const m = String(parsedIso.getMonth() + 1).padStart(2, '0');
      return `${y}-${m}`;
    }
  }

  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export function getAdjacentMonthKey(monthKey: string, offsetMonths: number): string {
  const normalized = normalizeMonthKey(monthKey);
  const [yStr, mStr] = normalized.split('-');
  const baseDate = new Date(Number(yStr), Number(mStr) - 1 + offsetMonths, 1);
  return `${baseDate.getFullYear()}-${String(baseDate.getMonth() + 1).padStart(2, '0')}`;
}

export function formatMonthKeyLabel(
  monthKey: string,
  style: 'short' | 'long' | 'month' = 'short'
): string {
  const normalized = normalizeMonthKey(monthKey);
  const [yStr, mStr] = normalized.split('-');
  const d = new Date(Number(yStr), Number(mStr) - 1, 1, 12, 0, 0);
  if (style === 'month') {
    return d.toLocaleDateString('en-US', { month: 'long' });
  }
  if (style === 'long') {
    return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  }
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

export function getCurrentCalendarPeriodLabel(date = new Date()): string {
  return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

/**
 * Returns chronological "YYYY-MM" keys starting from `baseDate` (default: current month + upcoming months)
 * merged with any custom monthly rate keys configured by the landlord.
 */
export function getScheduledMonthKeys(
  baseDate = new Date(),
  upcomingCount = 3,
  configuredRates?: Record<string, number>
): string[] {
  const set = new Set<string>();
  const baseKey = normalizeMonthKey(baseDate.toISOString());
  for (let i = 0; i < Math.max(2, upcomingCount); i++) {
    set.add(getAdjacentMonthKey(baseKey, i));
  }
  if (configuredRates) {
    Object.keys(configuredRates).forEach((k) => {
      if (/^\d{4}-\d{2}$/.test(k)) set.add(k);
    });
  }
  return Array.from(set).sort();
}

/**
 * Resolves the landlord's electric rate (₱/kWh) for a given billing period or month key,
 * falling back to `settings.defaultElectricRate`.
 */
export function getElectricRateForPeriod(
  settings: Pick<AppSettings, 'defaultElectricRate' | 'monthlyElectricRates'>,
  periodOrDate?: string
): number {
  const key = normalizeMonthKey(periodOrDate);
  const monthlyRate = settings.monthlyElectricRates?.[key];
  if (typeof monthlyRate === 'number' && Number.isFinite(monthlyRate) && monthlyRate >= 0) {
    return roundCurrency(monthlyRate);
  }
  return roundCurrency(settings.defaultElectricRate || 0);
}

/**
 * Recalculates active unpaid/partial bills when the landlord applies updated monthly electric rates.
 * Previous archived receipts or already paid/applied receipts remain strictly locked at their original rate.
 */
export function recalculateActiveBillsForRates(
  bills: BillRecord[],
  settings: Pick<AppSettings, 'defaultElectricRate' | 'monthlyElectricRates'>
): { bills: BillRecord[]; updatedCount: number; roomUnpaidMap: Record<string, number> } {
  let updatedCount = 0;
  const roomUnpaidMap: Record<string, number> = {};
  const nowIso = new Date().toISOString();

  const updatedBills = bills.map((b) => {
    // Previous/archived receipts or already paid/settled receipts must NOT change when rate updates
    if (b.isArchived || b.status === 'paid') {
      return b;
    }

    const nextRate = getElectricRateForPeriod(settings, b.billingPeriod);
    const nextElecTotal = roundCurrency(b.consumptionKwh * nextRate);
    const nextTotalDue = Math.max(
      0,
      roundCurrency(
        b.baseRent + nextElecTotal + b.previousBalanceCarryOver - b.depositApplied
      )
    );
    const nextRemaining = Math.max(0, roundCurrency(nextTotalDue - b.amountPaid));
    const nextStatus: BillRecord['status'] =
      nextRemaining <= 0.009 ? 'paid' : b.amountPaid > 0 ? 'partial' : 'unpaid';

    roomUnpaidMap[b.roomId] = nextRemaining;

    if (
      nextRate !== b.electricRate ||
      nextElecTotal !== b.electricTotal ||
      nextTotalDue !== b.totalAmountDue ||
      nextRemaining !== b.remainingBalance
    ) {
      updatedCount += 1;
      return {
        ...b,
        electricRate: nextRate,
        electricTotal: nextElecTotal,
        totalAmountDue: nextTotalDue,
        remainingBalance: nextRemaining,
        status: nextStatus,
        paidAt: nextStatus === 'paid' ? b.paidAt || nowIso : b.paidAt,
        updatedAt: nowIso,
      };
    }

    return b;
  });

  return { bills: updatedBills, updatedCount, roomUnpaidMap };
}

export interface MonthlyPaymentStatusSummary {
  status: 'paid' | 'partial' | 'unpaid' | 'not_billed';
  periodLabel: string;
  monthKey: string;
  badgeText: string;
  detailText: string;
  matchingBill: BillRecord | null;
}

/**
 * Determines clearly whether a room's tenant has paid for the current billing month (e.g. "Paid for Nov 2026").
 */
export function getRoomMonthlyPaymentStatus(
  room: Room,
  bills: BillRecord[],
  targetPeriodOrDate?: string
): MonthlyPaymentStatusSummary {
  const monthKey = normalizeMonthKey(targetPeriodOrDate);
  const periodLabel = formatMonthKeyLabel(monthKey, 'short');

  const roomBillsForMonth = bills
    .filter(
      (b) =>
        b.roomId === room.id &&
        normalizeMonthKey(b.billingPeriod) === monthKey &&
        (!room.tenant?.fullName || b.tenantName === room.tenant.fullName || !b.isArchived)
    )
    .sort((a, b) => {
      if (Boolean(a.isArchived) !== Boolean(b.isArchived)) {
        return a.isArchived ? 1 : -1;
      }
      return b.createdAt.localeCompare(a.createdAt);
    });

  const matchingBill = roomBillsForMonth[0] || null;

  if (!matchingBill) {
    return {
      status: 'not_billed',
      periodLabel,
      monthKey,
      badgeText: `Not Billed (${periodLabel})`,
      detailText: `No ${periodLabel} bill issued yet`,
      matchingBill: null,
    };
  }

  if (matchingBill.status === 'paid') {
    const paidDate = matchingBill.paidAt
      ? new Date(matchingBill.paidAt).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
        })
      : '';
    return {
      status: 'paid',
      periodLabel,
      monthKey,
      badgeText: `Paid for ${periodLabel}`,
      detailText: paidDate
        ? `Paid ${paidDate}${matchingBill.paymentMethod ? ` • ${matchingBill.paymentMethod}` : ''}`
        : 'Settled in full',
      matchingBill,
    };
  }

  if (matchingBill.status === 'partial') {
    return {
      status: 'partial',
      periodLabel,
      monthKey,
      badgeText: `Partial (${periodLabel})`,
      detailText: `Remaining: ${formatPeso(matchingBill.remainingBalance)}`,
      matchingBill,
    };
  }

  return {
    status: 'unpaid',
    periodLabel,
    monthKey,
    badgeText: `Unpaid (${periodLabel})`,
    detailText: `Due: ${formatPeso(matchingBill.remainingBalance)}`,
    matchingBill,
  };
}

/**
 * Pure calculator for sub-meter consumption delta supporting linear progression,
 * mechanical dial rollover ($10^N - prev + curr$), and zero-reset / replacement.
 */
export function calculateConsumptionDelta(
  current: number,
  previous: number,
  isRollover = false,
  dialDigits = 5,
  isReset = false
): ConsumptionDeltaResult {
  const prev = Number(previous) || 0;
  const curr = Number(current) || 0;

  if (curr >= prev) {
    const delta = Math.round((curr - prev) * 100) / 100;
    return { delta, isNegative: false, isRollover: false };
  }

  if (!isRollover && !isReset) {
    const delta = Math.round((curr - prev) * 100) / 100;
    return {
      delta,
      isNegative: true,
      isRollover: false,
      error: `Current reading (${curr.toFixed(1)} kWh) is lower than previous reading (${prev.toFixed(1)} kWh). Confirm meter dial rollover or meter reset to proceed.`,
    };
  }

  if (isReset) {
    const delta = Math.round(curr * 100) / 100;
    return { delta, isNegative: false, isRollover: false, isReset: true };
  }

  const safeDigits = Math.max(3, Math.min(8, Number(dialDigits) || 5));
  let modulus = 10 ** safeDigits;
  while (modulus <= prev) {
    modulus *= 10;
  }

  const delta = Math.round((modulus - prev + curr) * 100) / 100;
  return { delta, isNegative: false, isRollover: true };
}

/**
 * Validates extracted OCR meter readings against previous readings and historical benchmarks.
 */
export function verifyOcrReading(
  detectedVal: number,
  prevReading: number,
  averageMonthlyKwh = 120
): OcrVerificationResult {
  const curr = Number(detectedVal) || 0;
  const prev = Number(prevReading) || 0;

  if (curr < prev) {
    return {
      rawReading: curr,
      verifiedReading: curr,
      confidence: 0.9,
      status: 'rollover_detected',
      warningMessage: `Current reading (${curr.toFixed(1)}) is lower than previous reading (${prev.toFixed(1)}). Dial rollover or meter reset required.`,
      anomalyType: 'negative_delta',
    };
  }

  const delta = curr - prev;
  if (delta > 600 || (averageMonthlyKwh > 0 && delta > averageMonthlyKwh * 4)) {
    return {
      rawReading: curr,
      verifiedReading: curr,
      confidence: 0.85,
      status: 'anomaly_detected',
      warningMessage: `Consumption surge detected: Δ ${delta.toFixed(1)} kWh exceeds expected monthly threshold. Please verify meter photo.`,
      anomalyType: 'exceeds_threshold',
    };
  }

  return {
    rawReading: curr,
    verifiedReading: curr,
    confidence: 0.95,
    status: 'verified',
  };
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

  const deltaResult = calculateConsumptionDelta(
    curr,
    prev,
    input.isRollover,
    input.dialDigits,
    input.isReset
  );

  if (deltaResult.isNegative) {
    return {
      isValid: false,
      isRollover: false,
      isReset: false,
      consumptionKwh: 0,
      electricTotal: 0,
      errorMessage:
        deltaResult.error ||
        'Current reading cannot be less than previous reading unless meter was reset.',
    };
  }

  const consumptionKwh = deltaResult.delta;
  const electricTotal = Math.round(consumptionKwh * rate * 100) / 100;

  return {
    isValid: true,
    isRollover: Boolean(deltaResult.isRollover),
    isReset: Boolean(deltaResult.isReset),
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
    isRollover: input.isRollover,
    dialDigits: input.dialDigits,
    isReset: input.isReset,
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

  // Step 0: Pre-clean character substitutions and circled counter prefixes
  const preCleaned = rawText
    .replace(/[②③]|(\(\s*[123]\s*\))/g, ' ')
    .replace(/[OoQq](?=\d)|(?<=\d)[OoQq]/g, '0')
    .replace(/[Il|!](?=\d)|(?<=\d)[Il|!]/g, '1')
    .replace(/,/g, '.');

  // Step 1: Explicit kWh / kW·h unit anchored readings (HIGHEST PRIORITY)
  // Sub-meters explicitly display the unit "kW·h", "kW-h", "kWh", or "kW.h" immediately after the reading.
  // 1A. Explicit decimal reading right next to kWh (e.g. "003020.7 kW-h", "3020.7 kWh", "00123.4 kW·h")
  const kwhDecimalMatch = preCleaned.match(/(?:^|[^\d])(\d{1,6}\.\d{1,2})\s*(?:kw[·\-.]?h|kwh)\b/i);
  if (kwhDecimalMatch) {
    const val = parseFloat(kwhDecimalMatch[1]);
    if (!Number.isNaN(val) && val >= 0 && val < 999999) {
      return Math.round(val * 10) / 10;
    }
  }

  // 1B. 7-digit reading right next to kWh (6 integer digits + 1 tenths digit, e.g. "0030207 kW-h" -> 3020.7)
  const kwhSevenMatch = preCleaned.match(/(?:^|[^\d])(\d{7})\s*(?:kw[·\-.]?h|kwh)\b/i);
  if (kwhSevenMatch) {
    const d = kwhSevenMatch[1];
    const intPart = parseInt(d.slice(0, 6), 10);
    const tenthsPart = parseInt(d.slice(6, 7), 10);
    return Math.round((intPart + tenthsPart / 10) * 10) / 10;
  }

  // 1C. 6-digit reading right next to kWh (5 integer digits + 1 tenths digit, e.g. "000034 kW-h" -> 3.4)
  const kwhSixMatch = preCleaned.match(/(?:^|[^\d])(\d{6})\s*(?:kw[·\-.]?h|kwh)\b/i);
  if (kwhSixMatch) {
    const d = kwhSixMatch[1];
    const intPart = parseInt(d.slice(0, 5), 10);
    const tenthsPart = parseInt(d.slice(5, 6), 10);
    return Math.round((intPart + tenthsPart / 10) * 10) / 10;
  }

  // Step 2: Strip known faceplate specifications, serial numbers, and scale headers
  const cleanedLines = preCleaned
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => {
      if (!line) return false;
      // Multiplier scale headers (e.g. "10000 1000 100 10 1 0.1" or "1/10") must be dropped
      if (/\b(10000|1000\s+100|1\/10)\b/i.test(line)) {
        return false;
      }
      // Pure impulse rating lines (e.g. "1600 imp/kWh", "3200 imp/kWh")
      if (/^\s*\d+\s*imp\/kwh\s*$/i.test(line) || /^\s*imp\/kwh\s*$/i.test(line)) {
        return false;
      }
      // Lines with serial/barcode/specs without kWh reading
      const hasKwhOrReading = /kw[·\-.]?h|\bkwh\b|\b\d{1,6}\.\d{1,2}\b|\b\d{6,7}\b/i.test(line);
      if (
        !hasKwhOrReading &&
        /\b(s\.?\s*no|no\.?|serial|year|september|india|japan|technology|barcode|multifunction|approved|erc)\b/i.test(
          line
        )
      ) {
        return false;
      }
      // Electrical ratings lines without kWh reading
      if (
        !hasKwhOrReading &&
        /\b(1600|3200|imp|220\s*v|240\s*v|480\s*v|120-|50\s*hz|60\s*hz|10\s*\(\s*60\s*\)|5-30\s*a|sy-?168|mt-?60i|cl-?60|cl\s*20|kv2c|type-?sp1|1\s*phase|2\s*wire)\b/i.test(
          line
        )
      ) {
        return false;
      }
      return true;
    })
    .map((line) => {
      // Strip serial / barcode tokens (e.g. No. LGT2023921126001, S.No. 470946, etc.)
      let l = line.replace(/\b(s\.?\s*no\.?|serial(?:\s*no\.?)?|barcode|no\.)\s*[:#-]?\s*[A-Z0-9\-]+/gi, ' ');
      // Strip electrical specs & model tokens
      l = l.replace(/\b(1600\s*imp\/kwh|3200\s*imp\/kwh|imp\/kwh|220\s*v|240\s*v|480\s*v|120-480v|50\s*hz|60\s*hz|10\s*\(\s*60\s*\)\s*a?|5-30\s*a|sy-?168|mt-?60i|cl-?60|cl\s*20|kv2c|type-?sp1|1\s*phase|2\s*wire)\b/gi, ' ');
      // Strip non-reading keywords
      l = l.replace(/\b(japan|technology|india|electronic|digital kilowatt hour meter|kilowatt hour meter|reverse impulse power|reverse|impulse|power)\b/gi, ' ');
      return l.trim();
    })
    .filter((line) => {
      if (!line) return false;
      if (!/\d/.test(line)) return false;
      if (/^(?:no\.?|s\.?\s*no|year|september|approved|erc)\b/i.test(line)) return false;
      return true;
    });

  if (cleanedLines.length === 0) return null;

  const cleanedText = cleanedLines.join(' ');

  // Step 3: Check for explicit decimal kWh reading (e.g. "003020.7", "12623.0", "00003.4", "00000.1", "1485.6")
  const decimalMatches = cleanedText.match(/\b\d{1,6}\.\d{1,2}\b/g);
  if (decimalMatches && decimalMatches.length > 0) {
    for (const candidate of decimalMatches) {
      const val = parseFloat(candidate);
      if (!Number.isNaN(val) && val >= 0 && val < 999999) {
        return Math.round(val * 10) / 10;
      }
    }
  }

  // Step 4: Check for 7-digit reading (6 integer digits + 1 tenths digit, e.g. "0030207" -> 3020.7)
  const sevenDrumMatches = cleanedText.match(/\b(\d{7})\b/g);
  if (sevenDrumMatches && sevenDrumMatches.length > 0) {
    for (const d of sevenDrumMatches) {
      const valCandidate = parseInt(d, 10);
      if (valCandidate < 9999990) {
        const intPart = parseInt(d.slice(0, 6), 10);
        const tenthsPart = parseInt(d.slice(6, 7), 10);
        return Math.round((intPart + tenthsPart / 10) * 10) / 10;
      }
    }
  }

  // Step 5: Check for 6-drum cyclometer reading (5 integer drums + 1 tenths drum, e.g. "126230" -> 12623.0, "002523" -> 252.3, "000034" -> 3.4)
  const sixDrumMatches = cleanedText.match(/\b(\d{6})\b/g);
  if (sixDrumMatches && sixDrumMatches.length > 0) {
    for (const d of sixDrumMatches) {
      const valCandidate = parseInt(d, 10);
      // Avoid obvious year or phone patterns
      if (valCandidate !== 202611 && valCandidate !== 202610 && valCandidate !== 202612) {
        const intPart = parseInt(d.slice(0, 5), 10);
        const tenthsPart = parseInt(d.slice(5, 6), 10);
        return Math.round((intPart + tenthsPart / 10) * 10) / 10;
      }
    }
  }

  // Step 6: Check for spaced cyclometer drum digits (e.g. "1 2 6 2 3 . 0" or "0 0 0 0 3 4" or "0 0 3 0 2 0 7")
  const compactDigits = cleanedText.replace(/[^\d.]/g, '');
  if (compactDigits.includes('.')) {
    const decVal = parseFloat(compactDigits);
    if (!Number.isNaN(decVal) && decVal >= 0 && decVal < 999999) {
      return Math.round(decVal * 10) / 10;
    }
  }
  const compactSeven = compactDigits.match(/(\d{7})/);
  if (compactSeven) {
    const d = compactSeven[1];
    const intPart = parseInt(d.slice(0, 6), 10);
    const tenthsPart = parseInt(d.slice(6, 7), 10);
    return Math.round((intPart + tenthsPart / 10) * 10) / 10;
  }
  const compactSix = compactDigits.match(/(\d{6})/);
  if (compactSix) {
    const d = compactSix[1];
    const intPart = parseInt(d.slice(0, 5), 10);
    const tenthsPart = parseInt(d.slice(5, 6), 10);
    return Math.round((intPart + tenthsPart / 10) * 10) / 10;
  }

  // Step 7: Check for 5-digit integer sub-meter reading (e.g. "12623", "02523")
  const fiveMatches = cleanedText.match(/\b\d{5}\b/g);
  if (fiveMatches && fiveMatches.length > 0) {
    for (const m of fiveMatches) {
      const val = parseFloat(m);
      if (!Number.isNaN(val) && val >= 0 && val < 100000) {
        return Math.round(val * 10) / 10;
      }
    }
  }

  // Step 8: General 3-to-4 digit integer sub-meter reading (excluding common spec constants)
  const blacklistedConstants = new Set([
    10, 20, 30, 50, 60, 100, 120, 168, 220, 230, 240, 480, 1000, 1600, 2018,
    3200, 10000,
  ]);
  const intMatches = cleanedText.match(/\b\d{3,4}\b/g);
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
  apartmentName: string,
  settings?: Pick<AppSettings, 'defaultElectricRate' | 'monthlyElectricRates'>
): string {
  const statusLabel =
    bill.status === 'paid'
      ? '✅ PAID IN FULL'
      : bill.status === 'partial'
      ? '🟡 PARTIAL PAYMENT'
      : '🔴 STATEMENT DUE';

  const seal = generateReceiptVerificationCode(
    bill.receiptNo,
    bill.roomName,
    bill.totalAmountDue
  );

  const parsedDue = new Date(bill.dueDate);
  const validDue = Number.isNaN(parsedDue.getTime()) ? new Date() : parsedDue;
  const parsedPeriod = new Date(`1 ${bill.billingPeriod}`);
  const startDate = Number.isNaN(parsedPeriod.getTime())
    ? new Date(validDue.getFullYear(), validDue.getMonth(), 1)
    : new Date(parsedPeriod.getFullYear(), parsedPeriod.getMonth(), 1);
  const nextMonthStart = new Date(
    startDate.getFullYear(),
    startDate.getMonth() + 1,
    1
  );
  const nextCycleLabel = nextMonthStart.toLocaleDateString('en-US', {
    month: 'short',
    year: 'numeric',
  });
  const safeDueDay = clampDueDayOneToTen(validDue.getDate());
  const nextDueDate = new Date(
    validDue.getFullYear(),
    validDue.getMonth() + 1,
    safeDueDay,
    12,
    0,
    0
  ).toLocaleDateString('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  const formattedDue = validDue.toLocaleDateString('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  const nextRate = settings
    ? getElectricRateForPeriod(settings, nextCycleLabel)
    : bill.electricRate;

  const lines = [
    `🏠 *${apartmentName || 'Rental Management'} • Statement & Receipt*`,
    `Receipt #: ${bill.receiptNo} (${seal})`,
    `Unit: *${bill.roomName}* • Tenant: ${bill.tenantName}`,
    `────────────────────`,
    `⚡ *MONTHLY ELECTRIC RATE BREAKDOWN*`,
    `• ${formatMonthKeyLabel(normalizeMonthKey(bill.billingPeriod), 'long')}: ${formatPeso(bill.electricRate)}/kWh (Applied)`,
    `• ${formatMonthKeyLabel(normalizeMonthKey(nextCycleLabel), 'long')}: ${formatPeso(nextRate)}/kWh (Next Cycle)`,
    `────────────────────`,
    `📅 *CYCLE SCHEDULE*`,
    `• This Month (${bill.billingPeriod}): ${formatPeso(bill.baseRent)}/mo + ${formatPeso(bill.electricRate)}/kWh • Due ${formattedDue}`,
    `• Next Month (${nextCycleLabel}): ${formatPeso(bill.baseRent)}/mo + metered kWh (Start: ${bill.currReading.toFixed(1)} kWh @ ${formatPeso(nextRate)}/kWh) • Due ${nextDueDate}`,
    `────────────────────`,
    `⚡ *ELECTRIC SUB-METER PROOF*`,
    `• Previous: ${bill.prevReading.toFixed(1)} kWh → Current: ${bill.currReading.toFixed(1)} kWh`,
    `• Usage: *${bill.consumptionKwh.toFixed(1)} kWh* × ${formatPeso(bill.electricRate)}/kWh = *${formatPeso(bill.electricTotal)}*`,
    `────────────────────`,
    `📋 *CHARGES & SETTLEMENT*`,
    `• Base Rent (${bill.billingPeriod}): ${formatPeso(bill.baseRent)}`,
    `• Electricity (${bill.consumptionKwh.toFixed(1)} kWh): ${formatPeso(bill.electricTotal)}`,
  ];

  if (bill.previousBalanceCarryOver > 0) {
    lines.push(
      `• Prior Unpaid Balance: ${formatPeso(bill.previousBalanceCarryOver)}`
    );
  }
  if ((bill.securityDepositApplied || 0) > 0) {
    lines.push(
      `• Required Deposit Deducted: -${formatPeso(bill.securityDepositApplied || 0)}`
    );
  }
  if ((bill.advanceApplied || 0) > 0) {
    lines.push(
      `• Advance Credit Applied: -${formatPeso(bill.advanceApplied || 0)}`
    );
  } else if (bill.depositApplied > 0 && !(bill.securityDepositApplied || 0)) {
    lines.push(
      `• Deposit / Advance Deducted: -${formatPeso(bill.depositApplied)}`
    );
  }
  if ((bill.securityDepositRemainingAfterBill || 0) > 0) {
    lines.push(
      `• Remaining Deposit Credit (For Further Bills): ${formatPeso(bill.securityDepositRemainingAfterBill || 0)}`
    );
  }

  lines.push(
    `• Total Amount Due: *${formatPeso(bill.totalAmountDue)}*`
  );

  if (bill.amountPaid > 0) {
    lines.push(`• Paid: ${formatPeso(bill.amountPaid)}${bill.paymentMethod ? ` (${bill.paymentMethod})` : ''}`);
    lines.push(`• Remaining Balance: *${formatPeso(bill.remainingBalance)}*`);
  }
  if (bill.overpaymentToAdvance > 0) {
    lines.push(
      `• Advance Credit (${nextCycleLabel}): +${formatPeso(
        bill.overpaymentToAdvance
      )}`
    );
  }

  lines.push(`• Status: ${statusLabel}`);
  lines.push(`Payment Window: Every 1st–10th Monthly • 4Rent v1.0.0`);
  return lines.join('\n');
}
