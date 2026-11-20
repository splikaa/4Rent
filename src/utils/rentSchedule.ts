import {
  AppSettings,
  LatePenaltyConfig,
  MonthlyMeterReading,
} from '../types/rental';
import {
  fromCentavos,
  roundCurrencyCentavos,
  roundKwh,
  toCentavos,
} from './financialEngine';

export interface BillingMonthSchedule {
  billingMonthKey: string; // "YYYY-MM"
  billingPeriodLabel: string; // e.g., "Nov 2026"
  billingPeriodLongLabel: string; // e.g., "November 2026"
  year: number;
  month: number; // 1-12
  daysInMonth: number;
  paymentPeriodStart: string; // "YYYY-MM-01"
  paymentDueDate: string; // "YYYY-MM-10"
  latePenaltyStartDate: string; // "YYYY-MM-11"
  paymentPeriodLabel: string; // e.g., "Nov 1 - Nov 10, 2026"
  dueDateLabel: string; // e.g., "Nov 10, 2026"
  lateStartLabel: string; // e.g., "Nov 11, 2026"
  isBeforeWindow: boolean;
  isWithinPaymentWindow: boolean;
  isPastDue: boolean;
  daysPastDue: number;
}

export interface RentProrationInput {
  monthlyRent: number;
  billingPeriod: string; // "Nov 2026" or "YYYY-MM"
  occupancyStartDate?: string; // "YYYY-MM-DD"
  occupancyEndDate?: string; // "YYYY-MM-DD"
}

export interface RentProrationResult {
  monthlyRent: number;
  billingMonthKey: string;
  daysInMonth: number;
  occupiedDays: number;
  dailyRate: number;
  isProrated: boolean;
  proratedRent: number;
  chargeableRent: number;
  effectiveStartDate: string | null;
  effectiveEndDate: string | null;
  occupancyRangeLabel: string;
}

export interface LatePenaltyEvaluationInput {
  chargeableRent: number;
  billingPeriod: string;
  latePenaltyConfig?: LatePenaltyConfig;
  referenceDate?: Date | string;
  paidAt?: string;
}

export interface LatePenaltyEvaluationResult {
  isLate: boolean;
  daysPastDue: number;
  isConfigured: boolean;
  penaltyAmount: number;
  label: string;
  dueDate: string;
  lateStartDate: string;
}

export interface MonthlyRentBreakdown {
  billingMonthKey: string;
  billingPeriodLabel: string;
  monthlyRent: number;
  proratedRent: number;
  chargeableRent: number;
  isProrated: boolean;
  occupiedDays: number;
  daysInMonth: number;
  dailyRate: number;
  occupancyRangeLabel: string;
  paymentPeriodStart: string;
  paymentDueDate: string;
  paymentPeriodLabel: string;
  dueDateLabel: string;
  latePenaltyStartDate: string;
  lateStartLabel: string;
  isWithinPaymentWindow: boolean;
  isLate: boolean;
  daysPastDue: number;
  isPenaltyConfigured: boolean;
  latePenalty: number;
  latePenaltyLabel: string;
  totalRentDue: number;
}

export interface MonthlyMeterValidationInput {
  roomId: string;
  roomName: string;
  tenantName?: string;
  billingPeriod: string;
  previousReadingKwh: number | string | null | undefined;
  currentReadingKwh: number | string | null | undefined;
  electricRate: number;
  existingMonthlyReadings?: MonthlyMeterReading[];
  editingReadingId?: string;
  meterResetOrReplacement?: boolean;
  meterResetType?: 'dial_rollover' | 'meter_reset';
  meterResetDocumentedReason?: string;
  dialDigits?: number;
  isVerified: boolean;
  source?: MonthlyMeterReading['source'];
  ocrExtractedReadingKwh?: number | null;
  ocrConfidence?: number;
  correctionAuthorized?: boolean;
  correctionNote?: string;
  prevPhotoDataUrl?: string;
  prevCropDataUrl?: string;
  currPhotoDataUrl?: string;
  currCropDataUrl?: string;
  billId?: string;
  nowIso?: string;
}

export interface MonthlyMeterValidationResult {
  isValid: boolean;
  errorCode?:
    | 'MISSING_PREVIOUS_READING'
    | 'MISSING_CURRENT_READING'
    | 'NEGATIVE_READING_VALUE'
    | 'NEGATIVE_CONSUMPTION_UNAUTHORIZED'
    | 'DUPLICATE_MONTHLY_METER_RECORD'
    | 'UNVERIFIED_ELECTRICITY_READING'
    | 'INVALID_ELECTRIC_RATE';
  errorMessage?: string;
  billingMonthKey: string;
  consumptionKwh: number;
  electricCharge: number;
  record?: MonthlyMeterReading;
}

function pad2(n: number): string {
  return String(Math.trunc(n)).padStart(2, '0');
}

/**
 * Formats a local Date or YYYY-MM-DD / ISO string into a canonical local YYYY-MM-DD date string.
 */
export function toLocalCalendarDateString(input?: Date | string | null): string | null {
  if (!input) return null;
  if (input instanceof Date) {
    if (Number.isNaN(input.getTime())) return null;
    return `${input.getFullYear()}-${pad2(input.getMonth() + 1)}-${pad2(input.getDate())}`;
  }

  const trimmed = String(input).trim();
  if (!trimmed) return null;

  const exactMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (exactMatch) {
    const y = Number(exactMatch[1]);
    const m = Number(exactMatch[2]);
    const d = Number(exactMatch[3]);
    const check = new Date(y, m - 1, d);
    if (
      check.getFullYear() === y &&
      check.getMonth() === m - 1 &&
      check.getDate() === d
    ) {
      return `${exactMatch[1]}-${exactMatch[2]}-${exactMatch[3]}`;
    }
    return null;
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return null;
  return `${parsed.getFullYear()}-${pad2(parsed.getMonth() + 1)}-${pad2(parsed.getDate())}`;
}

/**
 * Normalizes a billing period ("Nov 2026", "November 2026", "2026-11", Date, or ISO timestamp)
 * into a canonical "YYYY-MM" month key without UTC-midnight drift.
 */
export function normalizeBillingMonthKey(periodOrDate?: string | Date): string {
  if (periodOrDate instanceof Date) {
    const safe = Number.isNaN(periodOrDate.getTime()) ? new Date() : periodOrDate;
    return `${safe.getFullYear()}-${pad2(safe.getMonth() + 1)}`;
  }

  const trimmed = (periodOrDate || '').trim();
  const ymExact = trimmed.match(/^(\d{4})-(\d{2})$/);
  if (ymExact) {
    return `${ymExact[1]}-${ymExact[2]}`;
  }

  if (trimmed) {
    if (/^\d{4}-\d{2}-\d{2}T/.test(trimmed)) {
      const parsedIso = new Date(trimmed);
      if (!Number.isNaN(parsedIso.getTime())) {
        return `${parsedIso.getFullYear()}-${pad2(parsedIso.getMonth() + 1)}`;
      }
    }

    const ymPrefix = trimmed.match(/^(\d{4})-(\d{2})/);
    if (ymPrefix) {
      return `${ymPrefix[1]}-${ymPrefix[2]}`;
    }

    const parsedFromLabel = new Date(`1 ${trimmed}`);
    if (!Number.isNaN(parsedFromLabel.getTime())) {
      return `${parsedFromLabel.getFullYear()}-${pad2(parsedFromLabel.getMonth() + 1)}`;
    }

    const parsedAny = new Date(trimmed);
    if (!Number.isNaN(parsedAny.getTime())) {
      return `${parsedAny.getFullYear()}-${pad2(parsedAny.getMonth() + 1)}`;
    }
  }

  const now = new Date();
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}`;
}

export function getCurrentBillingMonthKey(referenceDate: Date = new Date()): string {
  return normalizeBillingMonthKey(referenceDate);
}

/**
 * Returns the exact number of calendar days in the given billing month (28, 29, 30, or 31),
 * properly accounting for leap years (divisible by 4, century rule 100/400).
 */
export function getDaysInBillingMonth(monthKeyOrPeriod: string | Date): number {
  const key = normalizeBillingMonthKey(monthKeyOrPeriod);
  const [yStr, mStr] = key.split('-');
  const year = Number(yStr);
  const month = Number(mStr);
  return new Date(year, month, 0).getDate();
}

function diffCalendarDays(startYmd: string, endYmd: string): number {
  const [sy, sm, sd] = startYmd.split('-').map(Number);
  const [ey, em, ed] = endYmd.split('-').map(Number);
  const utcStart = Date.UTC(sy, sm - 1, sd);
  const utcEnd = Date.UTC(ey, em - 1, ed);
  return Math.round((utcEnd - utcStart) / 86400000);
}

function formatYmdShort(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatYmdMonthDay(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Computes the official monthly rent payment schedule anchored strictly to the billing month:
 * - Payment Period: 1st to 10th day of the billing month.
 * - Payment Due Date: 10th day of the billing month.
 * - Late Payment Penalty Window: starts strictly on the 11th day of the billing month.
 */
export function getBillingMonthSchedule(
  billingPeriodOrKey?: string | Date,
  referenceDate: Date | string = new Date()
): BillingMonthSchedule {
  const billingMonthKey = normalizeBillingMonthKey(billingPeriodOrKey);
  const [yStr, mStr] = billingMonthKey.split('-');
  const year = Number(yStr);
  const month = Number(mStr);
  const daysInMonth = getDaysInBillingMonth(billingMonthKey);

  const monthAnchor = new Date(year, month - 1, 1, 12, 0, 0);
  const billingPeriodLabel = monthAnchor.toLocaleDateString('en-US', {
    month: 'short',
    year: 'numeric',
  });
  const billingPeriodLongLabel = monthAnchor.toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });

  const paymentPeriodStart = `${year}-${pad2(month)}-01`;
  const paymentDueDate = `${year}-${pad2(month)}-10`;
  const latePenaltyStartDate = `${year}-${pad2(month)}-11`;

  const refYmd =
    toLocalCalendarDateString(referenceDate) ||
    toLocalCalendarDateString(new Date())!;

  const isBeforeWindow = refYmd < paymentPeriodStart;
  const isWithinPaymentWindow =
    refYmd >= paymentPeriodStart && refYmd <= paymentDueDate;
  const isPastDue = refYmd >= latePenaltyStartDate;
  const daysPastDue = isPastDue
    ? Math.max(1, diffCalendarDays(paymentDueDate, refYmd))
    : 0;

  return {
    billingMonthKey,
    billingPeriodLabel,
    billingPeriodLongLabel,
    year,
    month,
    daysInMonth,
    paymentPeriodStart,
    paymentDueDate,
    latePenaltyStartDate,
    paymentPeriodLabel: `${formatYmdMonthDay(paymentPeriodStart)} - ${formatYmdShort(paymentDueDate)}`,
    dueDateLabel: formatYmdShort(paymentDueDate),
    lateStartLabel: formatYmdShort(latePenaltyStartDate),
    isBeforeWindow,
    isWithinPaymentWindow,
    isPastDue,
    daysPastDue,
  };
}

/**
 * Calculates monthly rent proration based on actual chargeable occupancy days within the billing month:
 *   Daily Rent = Monthly Rent / Calendar Days in Billing Month
 *   Prorated Rent = Daily Rent * Chargeable Occupancy Days
 * Accounts for 28, 29 (leap year), 30, and 31-day months, plus mid-month move-in and mid-month move-out.
 */
export function calculateMonthlyRentProration(
  input: RentProrationInput
): RentProrationResult {
  const monthlyRent = Math.max(0, roundCurrencyCentavos(input.monthlyRent));
  const billingMonthKey = normalizeBillingMonthKey(input.billingPeriod);
  const [yStr, mStr] = billingMonthKey.split('-');
  const year = Number(yStr);
  const month = Number(mStr);
  const daysInMonth = getDaysInBillingMonth(billingMonthKey);

  const monthStart = `${year}-${pad2(month)}-01`;
  const monthEnd = `${year}-${pad2(month)}-${pad2(daysInMonth)}`;

  const startYmd = toLocalCalendarDateString(input.occupancyStartDate);
  const endYmd = toLocalCalendarDateString(input.occupancyEndDate);

  const effectiveStart =
    startYmd && startYmd > monthStart ? startYmd : monthStart;
  const effectiveEnd = endYmd && endYmd < monthEnd ? endYmd : monthEnd;

  let occupiedDays = daysInMonth;
  if (effectiveStart > monthEnd || effectiveEnd < monthStart || effectiveStart > effectiveEnd) {
    occupiedDays = 0;
  } else {
    occupiedDays = Math.min(
      daysInMonth,
      Math.max(0, diffCalendarDays(effectiveStart, effectiveEnd) + 1)
    );
  }

  const isProrated = occupiedDays !== daysInMonth;
  const monthlyCents = toCentavos(monthlyRent);
  const dailyRateCents =
    daysInMonth > 0 ? Math.floor(monthlyCents / daysInMonth) : 0;
  const displayDailyRate = fromCentavos(dailyRateCents);

  const chargeableCents =
    occupiedDays === daysInMonth
      ? monthlyCents
      : occupiedDays <= 0
        ? 0
        : dailyRateCents * occupiedDays;
  const chargeableRent = fromCentavos(chargeableCents);

  const occupancyRangeLabel =
    occupiedDays <= 0
      ? `0 of ${daysInMonth} days occupied in ${formatYmdMonthDay(monthStart).split(' ')[0]} ${year}`
      : isProrated
        ? `${formatYmdMonthDay(effectiveStart)} - ${formatYmdShort(effectiveEnd)} (${occupiedDays} of ${daysInMonth} days)`
        : `${formatYmdMonthDay(monthStart)} - ${formatYmdShort(monthEnd)} (Full ${daysInMonth} days)`;

  return {
    monthlyRent,
    billingMonthKey,
    daysInMonth,
    occupiedDays,
    dailyRate: displayDailyRate,
    isProrated,
    proratedRent: chargeableRent,
    chargeableRent,
    effectiveStartDate: occupiedDays > 0 ? effectiveStart : null,
    effectiveEndDate: occupiedDays > 0 ? effectiveEnd : null,
    occupancyRangeLabel,
  };
}

/**
 * Evaluates Late Charges starting strictly on Day 11 of the billing month:
 * - Days 1-10 of the billing month: late charges are always ₱0.00.
 * - Starting Day 11 of the billing month:
 *   - 'daily_rent' (default): exact divided daily rent value (Math.floor(chargeableCents / daysInMonth))
 *     accumulating per late day (e.g. ₱5,000 / 30 = ₱166.66 on Day 11, ₱333.32 on Day 12, etc.).
 *   - 'fixed' or 'percentage': applies configured Fixed (₱) or Percentage (%) late charges.
 * - If disabled or custom mode has no value configured: late charges are ₱0.00.
 */
export function calculateLatePaymentPenalty(
  input: LatePenaltyEvaluationInput
): LatePenaltyEvaluationResult {
  const effectiveEvalDate = input.paidAt || input.referenceDate || new Date();
  const schedule = getBillingMonthSchedule(input.billingPeriod, effectiveEvalDate);
  const config = input.latePenaltyConfig;
  const chargeableCents = Math.max(0, toCentavos(input.chargeableRent));
  const isDailyRentMode =
    Boolean(config && config.enabled) &&
    (config?.mode === 'daily_rent' ||
      (config?.mode !== 'fixed' && config?.mode !== 'percentage'));
  const hasCustomValue = Boolean(
    config &&
      config.enabled &&
      typeof config.value === 'number' &&
      Number.isFinite(config.value) &&
      config.value > 0
  );
  const isConfigured = isDailyRentMode
    ? chargeableCents > 0 && schedule.daysInMonth > 0
    : hasCustomValue;

  if (!schedule.isPastDue) {
    return {
      isLate: false,
      daysPastDue: 0,
      isConfigured,
      penaltyAmount: 0,
      label: `On Time (Payment Period: ${schedule.paymentPeriodLabel})`,
      dueDate: schedule.paymentDueDate,
      lateStartDate: schedule.latePenaltyStartDate,
    };
  }

  if (!isConfigured || !config) {
    return {
      isLate: true,
      daysPastDue: schedule.daysPastDue,
      isConfigured: false,
      penaltyAmount: 0,
      label: `Past Due (${schedule.daysPastDue}d past ${schedule.dueDateLabel} | No Late Charges Configured in Settings)`,
      dueDate: schedule.paymentDueDate,
      lateStartDate: schedule.latePenaltyStartDate,
    };
  }

  let penaltyCents = 0;
  let descriptor = '';

  if (isDailyRentMode) {
    const dailyChargeCents =
      schedule.daysInMonth > 0
        ? Math.floor(chargeableCents / schedule.daysInMonth)
        : 0;
    const perDay = config.applyPerDay !== false;
    const multiplier = perDay ? schedule.daysPastDue : 1;
    penaltyCents = dailyChargeCents * multiplier;
    descriptor = perDay
      ? `₱${fromCentavos(dailyChargeCents).toFixed(2)}/day x ${schedule.daysPastDue}d late (from ${schedule.lateStartLabel})`
      : `₱${fromCentavos(dailyChargeCents).toFixed(2)} late charges (starting ${schedule.lateStartLabel})`;
  } else if (config.mode === 'percentage' && config.value !== null) {
    const multiplier = config.applyPerDay ? schedule.daysPastDue : 1;
    penaltyCents = Math.round(((chargeableCents * config.value) / 100) * multiplier);
    descriptor = config.applyPerDay
      ? `${config.value}%/day x ${schedule.daysPastDue}d late (from ${schedule.lateStartLabel})`
      : `${config.value}% late charges (starting ${schedule.lateStartLabel})`;
  } else if (config.value !== null) {
    const multiplier = config.applyPerDay ? schedule.daysPastDue : 1;
    penaltyCents = Math.round(toCentavos(config.value) * multiplier);
    descriptor = config.applyPerDay
      ? `₱${roundCurrencyCentavos(config.value).toFixed(2)}/day x ${schedule.daysPastDue}d late (from ${schedule.lateStartLabel})`
      : `Fixed ₱${roundCurrencyCentavos(config.value).toFixed(2)} late charges (starting ${schedule.lateStartLabel})`;
  }

  return {
    isLate: true,
    daysPastDue: schedule.daysPastDue,
    isConfigured: true,
    penaltyAmount: fromCentavos(Math.max(0, penaltyCents)),
    label: descriptor,
    dueDate: schedule.paymentDueDate,
    lateStartDate: schedule.latePenaltyStartDate,
  };
}

/**
 * Produces a complete, transparent Monthly Rent Breakdown:
 * Monthly Rent, Prorated Rent (if applicable), Payment Due Date, Late Payment Penalty, and Total Rent Due.
 */
export function calculateMonthlyRentSummary(params: {
  monthlyRent: number;
  billingPeriod: string;
  occupancyStartDate?: string;
  occupancyEndDate?: string;
  latePenaltyConfig?: LatePenaltyConfig;
  referenceDate?: Date | string;
  paidAt?: string;
}): MonthlyRentBreakdown {
  const schedule = getBillingMonthSchedule(
    params.billingPeriod,
    params.referenceDate || new Date()
  );
  const proration = calculateMonthlyRentProration({
    monthlyRent: params.monthlyRent,
    billingPeriod: schedule.billingMonthKey,
    occupancyStartDate: params.occupancyStartDate,
    occupancyEndDate: params.occupancyEndDate,
  });
  const penalty = calculateLatePaymentPenalty({
    chargeableRent: proration.chargeableRent,
    billingPeriod: schedule.billingMonthKey,
    latePenaltyConfig: params.latePenaltyConfig,
    referenceDate: params.referenceDate,
    paidAt: params.paidAt,
  });

  const totalRentDue = fromCentavos(
    toCentavos(proration.chargeableRent) + toCentavos(penalty.penaltyAmount)
  );

  return {
    billingMonthKey: schedule.billingMonthKey,
    billingPeriodLabel: schedule.billingPeriodLabel,
    monthlyRent: proration.monthlyRent,
    proratedRent: proration.proratedRent,
    chargeableRent: proration.chargeableRent,
    isProrated: proration.isProrated,
    occupiedDays: proration.occupiedDays,
    daysInMonth: proration.daysInMonth,
    dailyRate: proration.dailyRate,
    occupancyRangeLabel: proration.occupancyRangeLabel,
    paymentPeriodStart: schedule.paymentPeriodStart,
    paymentDueDate: schedule.paymentDueDate,
    paymentPeriodLabel: schedule.paymentPeriodLabel,
    dueDateLabel: schedule.dueDateLabel,
    latePenaltyStartDate: schedule.latePenaltyStartDate,
    lateStartLabel: schedule.lateStartLabel,
    isWithinPaymentWindow: schedule.isWithinPaymentWindow,
    isLate: penalty.isLate,
    daysPastDue: penalty.daysPastDue,
    isPenaltyConfigured: penalty.isConfigured,
    latePenalty: penalty.penaltyAmount,
    latePenaltyLabel: penalty.label,
    totalRentDue,
  };
}

/**
 * Resolves an independent monthly electricity rate without mutating or leaking into other months.
 */
export function updateIndependentMonthlyElectricRate(
  settings: Pick<AppSettings, 'defaultElectricRate' | 'monthlyElectricRates'>,
  monthKeyOrPeriod: string,
  nextRate: number,
  preserveVisibleMonthKeys: string[] = []
): Record<string, number> {
  const targetKey = normalizeBillingMonthKey(monthKeyOrPeriod);
  const cleanRate = roundCurrencyCentavos(Math.max(0, nextRate));
  const nextRates: Record<string, number> = {
    ...(settings.monthlyElectricRates || {}),
  };

  // Materialize existing unconfigured visible months at their previous effective rate
  // so every month retains its own independent historical value.
  for (const mk of preserveVisibleMonthKeys) {
    const normalized = normalizeBillingMonthKey(mk);
    if (normalized !== targetKey && nextRates[normalized] === undefined) {
      nextRates[normalized] = roundCurrencyCentavos(
        Math.max(0, settings.defaultElectricRate || 0)
      );
    }
  }

  nextRates[targetKey] = cleanRate;
  return nextRates;
}

/**
 * Validates and constructs a verified MonthlyMeterReading record enforcing:
 * - Both previous & current readings present and non-negative.
 * - Verified reading required for billing.
 * - Negative consumption rejected unless authorized meter replacement / rollover is documented.
 * - Duplicate or conflicting monthly meter records rejected for the same room & billing month.
 * - Exact electricity charge calculation using the billing month's electricity rate.
 */
export function validateMonthlyMeterReading(
  input: MonthlyMeterValidationInput
): MonthlyMeterValidationResult {
  const billingMonthKey = normalizeBillingMonthKey(input.billingPeriod);
  const prevRaw =
    typeof input.previousReadingKwh === 'string'
      ? input.previousReadingKwh.trim()
      : input.previousReadingKwh;
  const currRaw =
    typeof input.currentReadingKwh === 'string'
      ? input.currentReadingKwh.trim()
      : input.currentReadingKwh;

  if (prevRaw === '' || prevRaw === null || prevRaw === undefined) {
    return {
      isValid: false,
      errorCode: 'MISSING_PREVIOUS_READING',
      errorMessage:
        'Previous electricity meter reading is required before billing.',
      billingMonthKey,
      consumptionKwh: 0,
      electricCharge: 0,
    };
  }

  if (currRaw === '' || currRaw === null || currRaw === undefined) {
    return {
      isValid: false,
      errorCode: 'MISSING_CURRENT_READING',
      errorMessage:
        'Current electricity meter reading is required before billing.',
      billingMonthKey,
      consumptionKwh: 0,
      electricCharge: 0,
    };
  }

  const prev = Number(prevRaw);
  const curr = Number(currRaw);

  if (!Number.isFinite(prev) || !Number.isFinite(curr) || prev < 0 || curr < 0) {
    return {
      isValid: false,
      errorCode: 'NEGATIVE_READING_VALUE',
      errorMessage: 'Meter readings must be valid non-negative numbers.',
      billingMonthKey,
      consumptionKwh: 0,
      electricCharge: 0,
    };
  }

  const rate = Number(input.electricRate);
  if (!Number.isFinite(rate) || rate < 0) {
    return {
      isValid: false,
      errorCode: 'INVALID_ELECTRIC_RATE',
      errorMessage:
        'Applicable monthly electricity rate must be a valid non-negative number.',
      billingMonthKey,
      consumptionKwh: 0,
      electricCharge: 0,
    };
  }

  if (!input.isVerified) {
    return {
      isValid: false,
      errorCode: 'UNVERIFIED_ELECTRICITY_READING',
      errorMessage:
        'Verify the OCR-extracted or authorized electricity sub-meter reading before saving or generating the monthly bill.',
      billingMonthKey,
      consumptionKwh: 0,
      electricCharge: 0,
    };
  }

  let consumptionKwh = 0;
  if (curr >= prev) {
    consumptionKwh = roundKwh(curr - prev);
  } else {
    const documentedReason = (input.meterResetDocumentedReason || '').trim();
    if (!input.meterResetOrReplacement || !documentedReason) {
      return {
        isValid: false,
        errorCode: 'NEGATIVE_CONSUMPTION_UNAUTHORIZED',
        errorMessage: `Negative consumption rejected: Current reading (${curr.toFixed(1)} kWh) is lower than Previous (${prev.toFixed(1)} kWh). Document an authorized meter replacement or dial rollover reason to proceed.`,
        billingMonthKey,
        consumptionKwh: 0,
        electricCharge: 0,
      };
    }

    if (input.meterResetType === 'meter_reset') {
      consumptionKwh = roundKwh(curr);
    } else {
      const safeDigits = Math.max(3, Math.min(8, Number(input.dialDigits) || 5));
      let modulus = 10 ** safeDigits;
      while (modulus <= prev) {
        modulus *= 10;
      }
      consumptionKwh = roundKwh(modulus - prev + curr);
    }
  }

  const existing = (input.existingMonthlyReadings || []).find(
    (r) =>
      r.roomId === input.roomId &&
      normalizeBillingMonthKey(r.billingMonthKey || r.billingPeriod) ===
        billingMonthKey &&
      r.id !== input.editingReadingId
  );

  if (existing) {
    const readingsMatch =
      roundKwh(existing.previousReadingKwh) === roundKwh(prev) &&
      roundKwh(existing.currentReadingKwh) === roundKwh(curr);
    const alreadyBilled = Boolean(existing.billId);
    if (alreadyBilled || !readingsMatch) {
      return {
        isValid: false,
        errorCode: 'DUPLICATE_MONTHLY_METER_RECORD',
        errorMessage: `A monthly meter reading already exists for ${input.roomName} (${input.billingPeriod}: ${existing.previousReadingKwh.toFixed(1)} -> ${existing.currentReadingKwh.toFixed(1)} kWh). Duplicate or conflicting monthly meter records are not allowed.`,
        billingMonthKey,
        consumptionKwh: 0,
        electricCharge: 0,
      };
    }
  }

  const cleanRate = roundCurrencyCentavos(rate);
  const electricCharge = fromCentavos(
    Math.round(consumptionKwh * toCentavos(cleanRate))
  );
  const nowIso = input.nowIso || new Date().toISOString();

  const record: MonthlyMeterReading = {
    id:
      input.editingReadingId ||
      `mread-${input.roomId}-${billingMonthKey}`,
    roomId: input.roomId,
    roomName: input.roomName,
    tenantName: input.tenantName,
    billingPeriod: input.billingPeriod,
    billingMonthKey,
    previousReadingKwh: roundKwh(prev),
    currentReadingKwh: roundKwh(curr),
    consumptionKwh,
    electricRate: cleanRate,
    electricCharge,
    source: input.source || 'ocr_verified',
    ocrExtractedReadingKwh: input.ocrExtractedReadingKwh ?? null,
    ocrConfidence: input.ocrConfidence,
    isVerified: true,
    verifiedAt: nowIso,
    correctionAuthorized: input.correctionAuthorized,
    correctionNote: input.correctionNote?.trim() || undefined,
    meterResetOrReplacement: input.meterResetOrReplacement,
    meterResetType: input.meterResetOrReplacement
      ? input.meterResetType || 'dial_rollover'
      : undefined,
    meterResetDocumentedReason: input.meterResetOrReplacement
      ? input.meterResetDocumentedReason?.trim()
      : undefined,
    dialDigits: input.dialDigits,
    prevPhotoDataUrl: input.prevPhotoDataUrl,
    prevCropDataUrl: input.prevCropDataUrl,
    currPhotoDataUrl: input.currPhotoDataUrl,
    currCropDataUrl: input.currCropDataUrl,
    billId: input.billId,
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  return {
    isValid: true,
    billingMonthKey,
    consumptionKwh,
    electricCharge,
    record,
  };
}
