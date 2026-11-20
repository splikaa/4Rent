import {
  AdvanceBalanceTransaction,
  AdvanceCapPolicyMode,
  AdvanceTransactionType,
  AppSettings,
  BillRecord,
  ComponentPaymentAllocation,
  MonthlyMeterReading,
  PaymentAllocationTarget,
  PaymentTransaction,
  Room,
} from '../types/rental';
import { normalizeBillingMonthKey } from './rentSchedule';

export const CENTAVOS_PER_PESO = 100;

/**
 * Converts a currency amount in PHP pesos to exact integer centavos.
 */
export function toCentavos(amount: number | string | undefined | null): number {
  const num = typeof amount === 'string' ? parseFloat(amount) : Number(amount);
  if (!Number.isFinite(num)) return 0;
  return Math.round(num * CENTAVOS_PER_PESO);
}

/**
 * Converts integer centavos back into PHP pesos with 2-decimal exactness.
 */
export function fromCentavos(centavos: number): number {
  if (!Number.isFinite(centavos)) return 0;
  return Math.round(centavos) / CENTAVOS_PER_PESO;
}

/**
 * Rounds any Peso amount using exact integer centavos.
 */
export function roundCurrencyCentavos(amount: number | string | undefined | null): number {
  return fromCentavos(toCentavos(amount));
}

/**
 * Rounds electric sub-meter kWh readings safely up to 2 decimal places without binary float drift.
 */
export function roundKwh(kwh: number | string | undefined | null): number {
  const num = typeof kwh === 'string' ? parseFloat(kwh) : Number(kwh);
  if (!Number.isFinite(num)) return 0;
  return Math.round(num * 100) / 100;
}

/**
 * Formats kWh preserving tenth precision (e.g. 5520.0) and hundredth decimals if present (e.g. 3020.75).
 */
export function formatKwhReading(kwh: number | undefined | null): string {
  const safe = roundKwh(kwh);
  const hasHundredths = Math.abs(Math.round(safe * 100) % 10) > 0;
  return safe.toFixed(hasHundredths ? 2 : 1);
}

/**
 * Generates a compact, human-readable financial reference number.
 */
export function generateFinancialRefNo(
  prefix: 'ADV' | 'PAY' | 'REF' | 'ADJ' | 'BILL',
  isoDate?: string,
  suffixSeed?: string
): string {
  const dateObj = isoDate ? new Date(isoDate) : new Date();
  const validDate = Number.isNaN(dateObj.getTime()) ? new Date() : dateObj;
  const yyyy = validDate.getFullYear();
  const mm = String(validDate.getMonth() + 1).padStart(2, '0');
  const dd = String(validDate.getDate()).padStart(2, '0');
  const suffix = (
    suffixSeed ||
    Math.random().toString(36).slice(2, 6)
  )
    .replace(/[^a-zA-Z0-9]/g, '')
    .toUpperCase()
    .slice(0, 4)
    .padEnd(4, '0');
  return `${prefix}-${yyyy}${mm}${dd}-${suffix}`;
}

export function createUniqueId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export interface AdvanceAllowanceResult {
  policyMode: AdvanceCapPolicyMode;
  isCapped: boolean;
  maxAllowed: number;
  currentAdvance: number;
  remainingAllowance: number;
}

/**
 * Evaluates advance credit policy allowance.
 * Default 'unlimited' enables a full Prepaid Rental Wallet (multi-month & utility advances).
 * Legacy '1_month' enforces a strict 1-month rent ceiling when explicitly selected in Settings.
 */
export function getAdvancePolicyAllowance(
  monthlyRent: number,
  currentAdvance: number,
  policyMode: AdvanceCapPolicyMode = 'unlimited'
): AdvanceAllowanceResult {
  const currentCents = Math.max(0, toCentavos(currentAdvance));
  if (policyMode === 'unlimited') {
    return {
      policyMode,
      isCapped: false,
      maxAllowed: Number.POSITIVE_INFINITY,
      currentAdvance: fromCentavos(currentCents),
      remainingAllowance: Number.POSITIVE_INFINITY,
    };
  }

  const capCents = Math.max(0, toCentavos(monthlyRent));
  const remCents = Math.max(0, capCents - currentCents);
  return {
    policyMode,
    isCapped: true,
    maxAllowed: fromCentavos(capCents),
    currentAdvance: fromCentavos(currentCents),
    remainingAllowance: fromCentavos(remCents),
  };
}

export interface ChargeAllocationInput {
  baseRent: number;
  electricTotal: number;
  latePenalty?: number;
  previousBalanceCarryOver?: number;
  otherCharges?: number;
  availableSecurityDeposit?: number;
  availableAdvanceCredit?: number;
  requestedSecurityDepositDeduction?: number;
  requestedAdvanceApplication?: number;
}

export interface AdvanceComponentAllocation {
  category: 'carryover' | 'rent' | 'electricity' | 'other';
  label: string;
  amount: number;
}

export interface ChargeAllocationResult {
  baseRent: number;
  electricTotal: number;
  latePenalty: number;
  previousBalanceCarryOver: number;
  otherCharges: number;
  grossCharges: number;
  securityDepositApplied: number;
  remainingSecurityDeposit: number;
  advanceApplied: number;
  remainingAdvanceCredit: number;
  totalCreditsApplied: number;
  netTotalAmountDue: number;
  advanceBreakdown: AdvanceComponentAllocation[];
  componentNetDue: {
    carryOverCents: number;
    rentCents: number;
    latePenaltyCents: number;
    electricityCents: number;
    otherCents: number;
  };
}

/**
 * Allocates charges, security deposit deductions, and prepaid advance wallet credits
 * using exact integer centavos. Unused advance credit strictly remains in the tenant wallet.
 */
export function allocateChargesAndCredits(
  input: ChargeAllocationInput
): ChargeAllocationResult {
  const baseRentCents = Math.max(0, toCentavos(input.baseRent));
  const electricCents = Math.max(0, toCentavos(input.electricTotal));
  const latePenaltyCents = Math.max(0, toCentavos(input.latePenalty));
  const carryOverCents = Math.max(0, toCentavos(input.previousBalanceCarryOver));
  const otherCents = Math.max(0, toCentavos(input.otherCharges));

  const grossChargesCents =
    baseRentCents + electricCents + latePenaltyCents + carryOverCents + otherCents;

  const secAvailCents = Math.max(0, toCentavos(input.availableSecurityDeposit));
  const maxSecAllowedCents =
    input.requestedSecurityDepositDeduction !== undefined
      ? Math.max(0, toCentavos(input.requestedSecurityDepositDeduction))
      : secAvailCents;
  const securityDepositAppliedCents = Math.min(
    secAvailCents,
    maxSecAllowedCents,
    grossChargesCents
  );
  const remainingSecurityDepositCents =
    secAvailCents - securityDepositAppliedCents;

  const dueAfterSecurityDepositCents = Math.max(
    0,
    grossChargesCents - securityDepositAppliedCents
  );

  const advAvailCents = Math.max(0, toCentavos(input.availableAdvanceCredit));
  const maxAdvAllowedCents =
    input.requestedAdvanceApplication !== undefined
      ? Math.max(0, toCentavos(input.requestedAdvanceApplication))
      : advAvailCents;
  const advanceAppliedCents = Math.min(
    advAvailCents,
    maxAdvAllowedCents,
    dueAfterSecurityDepositCents
  );
  const remainingAdvanceCents = advAvailCents - advanceAppliedCents;

  const netTotalDueCents = Math.max(
    0,
    dueAfterSecurityDepositCents - advanceAppliedCents
  );

  // Itemize how security deposit and advance credits offset each component
  const componentQueue: Array<{
    key: 'carryOverCents' | 'rentCents' | 'latePenaltyCents' | 'electricityCents' | 'otherCents';
    category: AdvanceComponentAllocation['category'];
    label: string;
    cents: number;
  }> = [
    { key: 'carryOverCents', category: 'carryover', label: 'Previous Unpaid Balance', cents: carryOverCents },
    { key: 'rentCents', category: 'rent', label: 'Monthly Rent', cents: baseRentCents },
    { key: 'latePenaltyCents', category: 'other', label: 'Late Charges', cents: latePenaltyCents },
    { key: 'electricityCents', category: 'electricity', label: 'Electricity Charges', cents: electricCents },
    { key: 'otherCents', category: 'other', label: 'Other Charges', cents: otherCents },
  ];

  let secOffsetRemaining = securityDepositAppliedCents;
  let advOffsetRemaining = advanceAppliedCents;
  const advanceBreakdown: AdvanceComponentAllocation[] = [];
  const componentNetDue = {
    carryOverCents: 0,
    rentCents: 0,
    latePenaltyCents: 0,
    electricityCents: 0,
    otherCents: 0,
  };

  for (const item of componentQueue) {
    if (item.cents <= 0) continue;
    const secCovered = Math.min(item.cents, secOffsetRemaining);
    secOffsetRemaining -= secCovered;
    const afterSecCents = item.cents - secCovered;
    const advCovered = Math.min(afterSecCents, advOffsetRemaining);
    advOffsetRemaining -= advCovered;
    componentNetDue[item.key] = Math.max(0, afterSecCents - advCovered);

    if (advCovered > 0) {
      advanceBreakdown.push({
        category: item.category,
        label: item.label,
        amount: fromCentavos(advCovered),
      });
    }
  }

  return {
    baseRent: fromCentavos(baseRentCents),
    electricTotal: fromCentavos(electricCents),
    latePenalty: fromCentavos(latePenaltyCents),
    previousBalanceCarryOver: fromCentavos(carryOverCents),
    otherCharges: fromCentavos(otherCents),
    grossCharges: fromCentavos(grossChargesCents),
    securityDepositApplied: fromCentavos(securityDepositAppliedCents),
    remainingSecurityDeposit: fromCentavos(remainingSecurityDepositCents),
    advanceApplied: fromCentavos(advanceAppliedCents),
    remainingAdvanceCredit: fromCentavos(remainingAdvanceCents),
    totalCreditsApplied: fromCentavos(
      securityDepositAppliedCents + advanceAppliedCents
    ),
    netTotalAmountDue: fromCentavos(netTotalDueCents),
    advanceBreakdown,
    componentNetDue,
  };
}

export interface BillComponentBalances {
  rentDue: number;
  rentPaid: number;
  rentRemaining: number;
  electricityDue: number;
  electricityPaid: number;
  electricityRemaining: number;
  latePenaltyDue: number;
  latePenaltyPaid: number;
  latePenaltyRemaining: number;
  carryOverDue: number;
  carryOverPaid: number;
  carryOverRemaining: number;
  otherDue: number;
  otherPaid: number;
  otherRemaining: number;
  totalAmountDue: number;
  totalPaid: number;
  outstandingBalance: number;
  hasUnpaidElectricity: boolean;
  isRentPaid: boolean;
  isElectricityPaid: boolean;
}

function normalizeMonthKeyInternal(periodOrDate?: string): string {
  return normalizeBillingMonthKey(periodOrDate);
}

/**
 * Computes exact separate component payment balances (Rent, Electricity, Late Penalty, Carry-Over)
 * for both new bills with explicit component tracking and legacy bills.
 */
export function computeBillComponentBalances(
  bill: Pick<
    BillRecord,
    | 'baseRent'
    | 'electricTotal'
    | 'latePenalty'
    | 'previousBalanceCarryOver'
    | 'otherCharges'
    | 'securityDepositApplied'
    | 'advanceApplied'
    | 'depositApplied'
    | 'totalAmountDue'
    | 'amountPaid'
    | 'remainingBalance'
    | 'rentPaid'
    | 'rentRemaining'
    | 'electricityPaid'
    | 'electricityRemaining'
    | 'latePenaltyPaid'
    | 'latePenaltyRemaining'
    | 'carryOverPaid'
    | 'carryOverRemaining'
  >
): BillComponentBalances {
  const secCredits = Math.max(0, toCentavos(bill.securityDepositApplied));
  const advCredits = Math.max(0, toCentavos(bill.advanceApplied));
  const totalCredits =
    secCredits + advCredits > 0
      ? secCredits + advCredits
      : Math.max(0, toCentavos(bill.depositApplied));

  const alloc = allocateChargesAndCredits({
    baseRent: bill.baseRent,
    electricTotal: bill.electricTotal,
    latePenalty: bill.latePenalty || 0,
    previousBalanceCarryOver: bill.previousBalanceCarryOver,
    otherCharges: bill.otherCharges || 0,
    availableSecurityDeposit: fromCentavos(secCredits),
    availableAdvanceCredit: fromCentavos(
      secCredits + advCredits > 0 ? advCredits : totalCredits
    ),
  });

  const rentDueCents = alloc.componentNetDue.rentCents;
  const elecDueCents = alloc.componentNetDue.electricityCents;
  const penDueCents = alloc.componentNetDue.latePenaltyCents;
  const carryDueCents = alloc.componentNetDue.carryOverCents;
  const otherDueCents = alloc.componentNetDue.otherCents;

  const hasExplicitTracking =
    typeof bill.rentPaid === 'number' &&
    typeof bill.electricityPaid === 'number';

  let rentPaidCents = 0;
  let elecPaidCents = 0;
  let penPaidCents = 0;
  let carryPaidCents = 0;
  let otherPaidCents = 0;

  if (hasExplicitTracking) {
    rentPaidCents = Math.min(rentDueCents, Math.max(0, toCentavos(bill.rentPaid)));
    elecPaidCents = Math.min(elecDueCents, Math.max(0, toCentavos(bill.electricityPaid)));
    penPaidCents = Math.min(penDueCents, Math.max(0, toCentavos(bill.latePenaltyPaid)));
    carryPaidCents = Math.min(carryDueCents, Math.max(0, toCentavos(bill.carryOverPaid)));
    const assigned = rentPaidCents + elecPaidCents + penPaidCents + carryPaidCents;
    const leftoverPaid = Math.max(0, toCentavos(bill.amountPaid) - assigned);
    otherPaidCents = Math.min(otherDueCents, leftoverPaid);
  } else {
    // Reconstruct component allocation deterministically for legacy bills:
    // Carry-over -> Late Penalty -> Rent -> Electricity -> Other
    let remCash = Math.max(0, toCentavos(bill.amountPaid));
    carryPaidCents = Math.min(carryDueCents, remCash);
    remCash -= carryPaidCents;
    penPaidCents = Math.min(penDueCents, remCash);
    remCash -= penPaidCents;
    rentPaidCents = Math.min(rentDueCents, remCash);
    remCash -= rentPaidCents;
    elecPaidCents = Math.min(elecDueCents, remCash);
    remCash -= elecPaidCents;
    otherPaidCents = Math.min(otherDueCents, remCash);
  }

  const rentRemCents = Math.max(0, rentDueCents - rentPaidCents);
  const elecRemCents = Math.max(0, elecDueCents - elecPaidCents);
  const penRemCents = Math.max(0, penDueCents - penPaidCents);
  const carryRemCents = Math.max(0, carryDueCents - carryPaidCents);
  const otherRemCents = Math.max(0, otherDueCents - otherPaidCents);

  const componentSumRemCents =
    rentRemCents + elecRemCents + penRemCents + carryRemCents + otherRemCents;
  const fallbackRemCents = Math.max(
    0,
    toCentavos(bill.totalAmountDue) - Math.max(0, toCentavos(bill.amountPaid))
  );
  const outstandingCents = Math.max(componentSumRemCents, fallbackRemCents);

  return {
    rentDue: fromCentavos(rentDueCents),
    rentPaid: fromCentavos(rentPaidCents),
    rentRemaining: fromCentavos(rentRemCents),
    electricityDue: fromCentavos(elecDueCents),
    electricityPaid: fromCentavos(elecPaidCents),
    electricityRemaining: fromCentavos(elecRemCents),
    latePenaltyDue: fromCentavos(penDueCents),
    latePenaltyPaid: fromCentavos(penPaidCents),
    latePenaltyRemaining: fromCentavos(penRemCents),
    carryOverDue: fromCentavos(carryDueCents),
    carryOverPaid: fromCentavos(carryPaidCents),
    carryOverRemaining: fromCentavos(carryRemCents),
    otherDue: fromCentavos(otherDueCents),
    otherPaid: fromCentavos(otherPaidCents),
    otherRemaining: fromCentavos(otherRemCents),
    totalAmountDue: fromCentavos(Math.max(0, toCentavos(bill.totalAmountDue))),
    totalPaid: fromCentavos(Math.max(0, toCentavos(bill.amountPaid))),
    outstandingBalance: fromCentavos(outstandingCents),
    hasUnpaidElectricity: elecRemCents > 0,
    isRentPaid: rentRemCents === 0,
    isElectricityPaid: elecRemCents === 0,
  };
}

function distributeCashAcrossComponents(params: {
  paymentCents: number;
  currentBalances: BillComponentBalances;
  allocationTarget?: PaymentAllocationTarget;
  customAllocation?: Partial<ComponentPaymentAllocation>;
}): {
  appliedToBillCents: number;
  overpaymentCents: number;
  txAllocation: ComponentPaymentAllocation;
  nextPaid: {
    rentPaidCents: number;
    elecPaidCents: number;
    penPaidCents: number;
    carryPaidCents: number;
    otherPaidCents: number;
  };
  nextRemaining: {
    rentRemCents: number;
    elecRemCents: number;
    penRemCents: number;
    carryRemCents: number;
    otherRemCents: number;
  };
} {
  const { paymentCents, currentBalances, allocationTarget = 'auto', customAllocation } =
    params;

  let remRent = toCentavos(currentBalances.rentRemaining);
  let remElec = toCentavos(currentBalances.electricityRemaining);
  let remPen = toCentavos(currentBalances.latePenaltyRemaining);
  let remCarry = toCentavos(currentBalances.carryOverRemaining);
  let remOther = toCentavos(currentBalances.otherRemaining);

  let addRent = 0;
  let addElec = 0;
  let addPen = 0;
  let addCarry = 0;
  let addOther = 0;
  let cashLeft = Math.max(0, paymentCents);

  const take = (targetRem: number, maxCap?: number): number => {
    const cap = maxCap !== undefined ? Math.min(targetRem, Math.max(0, maxCap)) : targetRem;
    const used = Math.min(cashLeft, cap);
    cashLeft -= used;
    return used;
  };

  if (allocationTarget === 'custom' && customAllocation) {
    const r = take(remRent, toCentavos(customAllocation.rentPaid));
    addRent += r;
    remRent -= r;

    const e = take(remElec, toCentavos(customAllocation.electricityPaid));
    addElec += e;
    remElec -= e;

    const p = take(remPen, toCentavos(customAllocation.latePenaltyPaid));
    addPen += p;
    remPen -= p;

    const c = take(remCarry, toCentavos(customAllocation.carryOverPaid));
    addCarry += c;
    remCarry -= c;

    const o = take(remOther, toCentavos(customAllocation.otherChargesPaid));
    addOther += o;
    remOther -= o;
  }

  // Primary targeted component first, then any leftover applies to remaining unpaid charges
  // so money NEVER overflows into Advance Credit while Electricity, Rent, or Penalty stays unpaid.
  const order: Array<'carry' | 'penalty' | 'rent' | 'electricity' | 'other'> =
    allocationTarget === 'rent'
      ? ['rent', 'carry', 'penalty', 'electricity', 'other']
      : allocationTarget === 'electricity'
        ? ['electricity', 'penalty', 'rent', 'carry', 'other']
        : allocationTarget === 'penalty'
          ? ['penalty', 'rent', 'electricity', 'carry', 'other']
          : ['carry', 'penalty', 'rent', 'electricity', 'other'];

  for (const key of order) {
    if (cashLeft <= 0) break;
    if (key === 'carry' && remCarry > 0) {
      const used = take(remCarry);
      addCarry += used;
      remCarry -= used;
    } else if (key === 'penalty' && remPen > 0) {
      const used = take(remPen);
      addPen += used;
      remPen -= used;
    } else if (key === 'rent' && remRent > 0) {
      const used = take(remRent);
      addRent += used;
      remRent -= used;
    } else if (key === 'electricity' && remElec > 0) {
      const used = take(remElec);
      addElec += used;
      remElec -= used;
    } else if (key === 'other' && remOther > 0) {
      const used = take(remOther);
      addOther += used;
      remOther -= used;
    }
  }

  const appliedToBillCents = addRent + addElec + addPen + addCarry + addOther;
  const overpaymentCents = Math.max(0, cashLeft);

  return {
    appliedToBillCents,
    overpaymentCents,
    txAllocation: {
      rentPaid: fromCentavos(addRent),
      electricityPaid: fromCentavos(addElec),
      latePenaltyPaid: fromCentavos(addPen),
      carryOverPaid: fromCentavos(addCarry),
      otherChargesPaid: fromCentavos(addOther),
    },
    nextPaid: {
      rentPaidCents: toCentavos(currentBalances.rentPaid) + addRent,
      elecPaidCents: toCentavos(currentBalances.electricityPaid) + addElec,
      penPaidCents: toCentavos(currentBalances.latePenaltyPaid) + addPen,
      carryPaidCents: toCentavos(currentBalances.carryOverPaid) + addCarry,
      otherPaidCents: toCentavos(currentBalances.otherPaid) + addOther,
    },
    nextRemaining: {
      rentRemCents: remRent,
      elecRemCents: remElec,
      penRemCents: remPen,
      carryRemCents: remCarry,
      otherRemCents: remOther,
    },
  };
}

export function isCreditAdvanceTransactionType(
  type: AdvanceTransactionType
): boolean {
  return type === 'manual_deposit' || type === 'overpayment_credit';
}

export function getAdvanceTransactionSignedDeltaCents(
  tx: Pick<AdvanceBalanceTransaction, 'type' | 'amount' | 'status' | 'note' | 'description'>
): number {
  if (tx.status === 'reversed') return 0;
  const amountCents = Math.abs(toCentavos(tx.amount));
  if (isCreditAdvanceTransactionType(tx.type)) {
    return amountCents;
  }
  if (tx.type === 'adjustment') {
    const rawCents = toCentavos(tx.amount);
    if (rawCents < 0) return rawCents;
    const text = `${tx.description || ''} ${tx.note || ''}`.toLowerCase();
    return text.includes('restore') || text.includes('credit') || text.includes('refund reversal')
      ? amountCents
      : -amountCents;
  }
  return -amountCents;
}

/**
 * Reconciles and enriches legacy and modern advance wallet ledger entries on a Room.
 * Backfills missing balanceBefore, balanceAfter, referenceNo, status, and description
 * by reverse-anchoring against the room's current stored `advanceRent` without losing balances.
 */
export function reconcileRoomAdvanceLedger(room: Room): Room {
  const safeAdvanceRent = Math.max(0, roundCurrencyCentavos(room.advanceRent || 0));
  const rawHistory = Array.isArray(room.advanceHistory) ? room.advanceHistory : [];

  if (rawHistory.length === 0) {
    if (safeAdvanceRent === (room.advanceRent || 0) && Array.isArray(room.advanceHistory)) {
      return room;
    }
    return {
      ...room,
      advanceRent: safeAdvanceRent,
      advanceHistory: [],
    };
  }

  let cursorCents = toCentavos(safeAdvanceRent);
  let changed = safeAdvanceRent !== room.advanceRent;

  // Walk newest-to-oldest (standard storage order of advanceHistory)
  const enrichedHistory: AdvanceBalanceTransaction[] = rawHistory.map((tx, idx) => {
    const hasExplicitBalances =
      typeof tx.balanceBefore === 'number' &&
      Number.isFinite(tx.balanceBefore) &&
      typeof tx.balanceAfter === 'number' &&
      Number.isFinite(tx.balanceAfter);

    const status = tx.status || 'completed';
    const referenceNo =
      tx.referenceNo ||
      generateFinancialRefNo(
        isCreditAdvanceTransactionType(tx.type)
          ? 'ADV'
          : tx.type === 'withdrawal'
            ? 'REF'
            : tx.type === 'adjustment'
              ? 'ADJ'
              : 'BILL',
        tx.createdAt,
        tx.id.replace(/[^a-zA-Z0-9]/g, '').slice(-4) || String(idx + 1).padStart(4, '0')
      );

    let description = tx.description;
    if (!description) {
      if (tx.type === 'manual_deposit') description = 'Advance Credit Added';
      else if (tx.type === 'overpayment_credit') description = 'Overpayment Added to Advance Credit';
      else if (tx.type === 'applied_to_bill') description = 'Advance Credit Applied to Bill';
      else if (tx.type === 'withdrawal') description = 'Advance Credit Refund / Withdrawal';
      else description = 'Advance Credit Adjustment';
    }

    if (hasExplicitBalances) {
      cursorCents = toCentavos(tx.balanceBefore);
      if (tx.status && tx.referenceNo && tx.description) {
        return tx;
      }
      changed = true;
      return {
        ...tx,
        status,
        referenceNo,
        description,
      };
    }

    changed = true;
    const signedDelta = getAdvanceTransactionSignedDeltaCents({
      ...tx,
      status,
      description,
    });
    const balanceAfterCents = cursorCents;
    const balanceBeforeCents = Math.max(0, cursorCents - signedDelta);
    cursorCents = balanceBeforeCents;

    return {
      ...tx,
      amount: Math.abs(roundCurrencyCentavos(tx.amount)),
      status,
      referenceNo,
      description,
      balanceBefore: fromCentavos(balanceBeforeCents),
      balanceAfter: fromCentavos(balanceAfterCents),
    };
  });

  if (!changed) {
    return room;
  }

  return {
    ...room,
    advanceRent: safeAdvanceRent,
    advanceHistory: enrichedHistory,
  };
}

export interface GenerateBillTransactionInput {
  room: Room;
  existingBills: BillRecord[];
  billDraft: BillRecord;
  advanceCapMode?: AdvanceCapPolicyMode;
  idempotencyKey?: string;
  advanceNote?: string;
  requireVerifiedElectricity?: boolean;
  meterReading?: MonthlyMeterReading;
  initialAllocationTarget?: PaymentAllocationTarget;
  initialCustomAllocation?: Partial<ComponentPaymentAllocation>;
}

export interface GenerateBillTransactionResult {
  ok: boolean;
  duplicate?: boolean;
  errorCode?: string;
  errorMessage?: string;
  createdBill?: BillRecord;
  archivedPreviousBills: BillRecord[];
  updatedRoom?: Room;
  ledgerEntries: AdvanceBalanceTransaction[];
}

/**
 * Executes bill issuance atomically using integer centavo math:
 * 1. Prevents duplicate issuance for matching idempotencyKey OR duplicate active (roomId, billingMonthKey).
 * 2. Enforces mandatory electricity meter validation (non-negative readings, no unauthorized negative delta, verified reading).
 * 3. Computes grossCharges (including prorated rent, electricity, late penalty, carryover), deposit/advance credits, and netAmountDue.
 * 4. Tracks Rent, Electricity, Late Penalty, and Carry-Over separately so unpaid electricity never marks a bill paid.
 * 5. Keeps unused advance credit intact in room.advanceRent and emits itemized Advance Ledger entries.
 */
export function executeGenerateBillTransaction(
  input: GenerateBillTransactionInput
): GenerateBillTransactionResult {
  const {
    room,
    existingBills,
    billDraft,
    advanceCapMode = 'unlimited',
    idempotencyKey,
    requireVerifiedElectricity = false,
    meterReading,
    initialAllocationTarget = 'auto',
    initialCustomAllocation,
  } = input;

  if (idempotencyKey) {
    const existingDup = existingBills.find((b) => b.idempotencyKey === idempotencyKey);
    if (existingDup) {
      return {
        ok: false,
        duplicate: true,
        errorCode: 'DUPLICATE_BILL_OPERATION',
        errorMessage: `Receipt #${existingDup.receiptNo} was already generated for this operation.`,
        createdBill: existingDup,
        archivedPreviousBills: existingBills,
        ledgerEntries: [],
      };
    }
  }

  const billingMonthKey = normalizeMonthKeyInternal(
    billDraft.billingMonthKey || billDraft.billingPeriod
  );

  // Prevent duplicate active monthly bill for the same room & billing month
  const existingPeriodBill = existingBills.find(
    (b) =>
      !b.isArchived &&
      b.roomId === room.id &&
      normalizeMonthKeyInternal(b.billingMonthKey || b.billingPeriod) ===
        billingMonthKey
  );
  if (existingPeriodBill) {
    return {
      ok: false,
      duplicate: true,
      errorCode: 'DUPLICATE_BILLING_PERIOD',
      errorMessage: `An active monthly bill (Receipt #${existingPeriodBill.receiptNo}) already exists for ${room.name} in ${billDraft.billingPeriod}. Archive or view the existing receipt instead of issuing a duplicate.`,
      createdBill: existingPeriodBill,
      archivedPreviousBills: existingBills,
      ledgerEntries: [],
    };
  }

  // Validate mandatory electricity sub-meter readings
  const prevVal = Number(billDraft.prevReading);
  const currVal = Number(billDraft.currReading);
  if (
    !Number.isFinite(prevVal) ||
    !Number.isFinite(currVal) ||
    prevVal < 0 ||
    currVal < 0
  ) {
    return {
      ok: false,
      errorCode: 'MISSING_ELECTRICITY_READING',
      errorMessage:
        'Both previous and current electricity meter readings are required before generating a monthly bill.',
      archivedPreviousBills: existingBills,
      ledgerEntries: [],
    };
  }

  if (currVal < prevVal) {
    const hasAuthorizedReset =
      Boolean(
        meterReading?.meterResetOrReplacement &&
          meterReading.meterResetDocumentedReason?.trim()
      ) ||
      Boolean(
        billDraft.notes &&
          /(Meter Reset Baseline Verified|Dial Rollover Verified)/i.test(
            billDraft.notes
          )
      );
    if (!hasAuthorizedReset) {
      return {
        ok: false,
        errorCode: 'NEGATIVE_CONSUMPTION_UNAUTHORIZED',
        errorMessage: `Negative electricity consumption (${currVal.toFixed(1)} < ${prevVal.toFixed(1)} kWh) is not allowed unless an authorized meter replacement or dial rollover is documented.`,
        archivedPreviousBills: existingBills,
        ledgerEntries: [],
      };
    }
  }

  const isElectricityVerified =
    billDraft.electricityVerified === true || Boolean(meterReading?.isVerified);
  if (
    (requireVerifiedElectricity || billDraft.electricityVerified === false) &&
    !isElectricityVerified
  ) {
    return {
      ok: false,
      errorCode: 'MISSING_VERIFIED_ELECTRICITY_READING',
      errorMessage:
        'Cannot generate monthly bill without a verified electricity sub-meter reading for this billing period.',
      archivedPreviousBills: existingBills,
      ledgerEntries: [],
    };
  }

  const nowIso = billDraft.createdAt || new Date().toISOString();
  const availSecDep = Math.max(0, roundCurrencyCentavos(room.securityDepositPaid || 0));
  const availAdv = Math.max(0, roundCurrencyCentavos(room.advanceRent || 0));

  const allocation = allocateChargesAndCredits({
    baseRent: billDraft.baseRent,
    electricTotal: billDraft.electricTotal,
    latePenalty: billDraft.latePenalty || 0,
    previousBalanceCarryOver: billDraft.previousBalanceCarryOver,
    otherCharges: billDraft.otherCharges || 0,
    availableSecurityDeposit: availSecDep,
    availableAdvanceCredit: availAdv,
    requestedSecurityDepositDeduction: billDraft.securityDepositApplied,
    requestedAdvanceApplication: billDraft.advanceApplied,
  });

  // Upfront cash/transfer payment provided at generation time (never counts advance as cash)
  const upfrontCashCents = Math.max(0, toCentavos(billDraft.amountPaid));
  const netDueCents = toCentavos(allocation.netTotalAmountDue);

  // Separate component balances before upfront cash payment
  const preCashBalances: BillComponentBalances = {
    rentDue: fromCentavos(allocation.componentNetDue.rentCents),
    rentPaid: 0,
    rentRemaining: fromCentavos(allocation.componentNetDue.rentCents),
    electricityDue: fromCentavos(allocation.componentNetDue.electricityCents),
    electricityPaid: 0,
    electricityRemaining: fromCentavos(allocation.componentNetDue.electricityCents),
    latePenaltyDue: fromCentavos(allocation.componentNetDue.latePenaltyCents),
    latePenaltyPaid: 0,
    latePenaltyRemaining: fromCentavos(allocation.componentNetDue.latePenaltyCents),
    carryOverDue: fromCentavos(allocation.componentNetDue.carryOverCents),
    carryOverPaid: 0,
    carryOverRemaining: fromCentavos(allocation.componentNetDue.carryOverCents),
    otherDue: fromCentavos(allocation.componentNetDue.otherCents),
    otherPaid: 0,
    otherRemaining: fromCentavos(allocation.componentNetDue.otherCents),
    totalAmountDue: allocation.netTotalAmountDue,
    totalPaid: 0,
    outstandingBalance: allocation.netTotalAmountDue,
    hasUnpaidElectricity: allocation.componentNetDue.electricityCents > 0,
    isRentPaid: allocation.componentNetDue.rentCents === 0,
    isElectricityPaid: allocation.componentNetDue.electricityCents === 0,
  };

  const cashSplit = distributeCashAcrossComponents({
    paymentCents: upfrontCashCents,
    currentBalances: preCashBalances,
    allocationTarget: initialAllocationTarget,
    customAllocation: initialCustomAllocation,
  });

  const overpaymentCents = Math.max(
    cashSplit.overpaymentCents,
    Math.max(0, upfrontCashCents - netDueCents)
  );
  const overpaymentPeso = fromCentavos(overpaymentCents);

  if (overpaymentCents > 0) {
    const allowance = getAdvancePolicyAllowance(
      room.monthlyRent,
      allocation.remainingAdvanceCredit,
      advanceCapMode
    );
    if (allowance.isCapped && overpaymentCents > toCentavos(allowance.remainingAllowance)) {
      return {
        ok: false,
        errorCode: 'ADVANCE_CAP_EXCEEDED',
        errorMessage: `Overpayment (${overpaymentPeso.toFixed(2)}) exceeds the active 1-Month Advance Policy allowance (${allowance.remainingAllowance.toFixed(2)} remaining).`,
        archivedPreviousBills: existingBills,
        ledgerEntries: [],
      };
    }
  }

  const remainingFromComponentsCents =
    cashSplit.nextRemaining.rentRemCents +
    cashSplit.nextRemaining.elecRemCents +
    cashSplit.nextRemaining.penRemCents +
    cashSplit.nextRemaining.carryRemCents +
    cashSplit.nextRemaining.otherRemCents;
  const remainingBalanceCents = Math.max(
    remainingFromComponentsCents,
    Math.max(0, netDueCents - upfrontCashCents)
  );
  const hasAnyUnpaidComponent =
    cashSplit.nextRemaining.elecRemCents > 0 ||
    cashSplit.nextRemaining.rentRemCents > 0 ||
    cashSplit.nextRemaining.penRemCents > 0 ||
    cashSplit.nextRemaining.carryRemCents > 0 ||
    cashSplit.nextRemaining.otherRemCents > 0;

  // Strict rule: bill CANNOT be marked 'paid' if electricity or any other component remains unpaid.
  const billStatus: BillRecord['status'] =
    remainingBalanceCents === 0 && !hasAnyUnpaidComponent
      ? 'paid'
      : upfrontCashCents > 0 || allocation.totalCreditsApplied > 0
        ? 'partial'
        : 'unpaid';

  const paidAt =
    billStatus === 'paid'
      ? billDraft.paidAt || nowIso
      : undefined;

  let runningAdvCents = toCentavos(availAdv);
  const ledgerEntriesNewestFirst: AdvanceBalanceTransaction[] = [];

  for (const item of allocation.advanceBreakdown) {
    const debitCents = toCentavos(item.amount);
    if (debitCents <= 0) continue;
    const beforeCents = runningAdvCents;
    const afterCents = Math.max(0, beforeCents - debitCents);
    runningAdvCents = afterCents;

    const entry: AdvanceBalanceTransaction = {
      id: createUniqueId(`adv-${item.category}`),
      type: 'applied_to_bill',
      category: item.category,
      amount: fromCentavos(debitCents),
      createdAt: nowIso,
      description: `${billDraft.billingPeriod} ${item.label}`,
      note:
        input.advanceNote ||
        `Applied to Receipt #${billDraft.receiptNo} (${billDraft.billingPeriod})`,
      referenceNo: generateFinancialRefNo('BILL', nowIso, billDraft.receiptNo.slice(-4)),
      balanceBefore: fromCentavos(beforeCents),
      balanceAfter: fromCentavos(afterCents),
      status: 'completed',
      billingPeriod: billDraft.billingPeriod,
      billId: billDraft.id,
      receiptNo: billDraft.receiptNo,
      idempotencyKey: idempotencyKey
        ? `${idempotencyKey}:apply:${item.category}`
        : `bill:${billDraft.id}:apply:${item.category}`,
    };
    ledgerEntriesNewestFirst.unshift(entry);
  }

  if (overpaymentCents > 0) {
    const beforeCents = runningAdvCents;
    const afterCents = beforeCents + overpaymentCents;
    runningAdvCents = afterCents;
    const overEntry: AdvanceBalanceTransaction = {
      id: createUniqueId('adv-over'),
      type: 'overpayment_credit',
      category: 'advance_credit',
      amount: overpaymentPeso,
      createdAt: nowIso,
      description: `Cash Overpayment from Receipt #${billDraft.receiptNo}`,
      note: `Excess cash payment from Receipt #${billDraft.receiptNo} added to Advance Credit`,
      referenceNo: generateFinancialRefNo('ADV', nowIso, billDraft.receiptNo.slice(-4)),
      balanceBefore: fromCentavos(beforeCents),
      balanceAfter: fromCentavos(afterCents),
      status: 'completed',
      billingPeriod: billDraft.billingPeriod,
      billId: billDraft.id,
      receiptNo: billDraft.receiptNo,
      idempotencyKey: idempotencyKey
        ? `${idempotencyKey}:overpay`
        : `bill:${billDraft.id}:overpay`,
    };
    ledgerEntriesNewestFirst.unshift(overEntry);
  }

  const finalAdvanceBalance = fromCentavos(runningAdvCents);
  const totalRentDue = fromCentavos(
    toCentavos(allocation.baseRent) + toCentavos(allocation.latePenalty)
  );

  const createdBill: BillRecord = {
    ...billDraft,
    billingMonthKey,
    electricityVerified: isElectricityVerified,
    meterReadingId: billDraft.meterReadingId || meterReading?.id,
    baseRent: allocation.baseRent,
    latePenalty: allocation.latePenalty,
    totalRentDue,
    electricTotal: allocation.electricTotal,
    previousBalanceCarryOver: allocation.previousBalanceCarryOver,
    otherCharges: allocation.otherCharges,
    grossCharges: allocation.grossCharges,
    securityDepositApplied: allocation.securityDepositApplied,
    securityDepositRemainingAfterBill: allocation.remainingSecurityDeposit,
    advanceApplied: allocation.advanceApplied,
    advanceBalanceBefore: availAdv,
    advanceBalanceAfter: finalAdvanceBalance,
    depositApplied: allocation.totalCreditsApplied,
    totalAmountDue: allocation.netTotalAmountDue,
    amountPaid: fromCentavos(upfrontCashCents),
    overpaymentToAdvance: overpaymentPeso,
    remainingBalance: fromCentavos(remainingBalanceCents),
    rentPaid: fromCentavos(cashSplit.nextPaid.rentPaidCents),
    rentRemaining: fromCentavos(cashSplit.nextRemaining.rentRemCents),
    electricityPaid: fromCentavos(cashSplit.nextPaid.elecPaidCents),
    electricityRemaining: fromCentavos(cashSplit.nextRemaining.elecRemCents),
    latePenaltyPaid: fromCentavos(cashSplit.nextPaid.penPaidCents),
    latePenaltyRemaining: fromCentavos(cashSplit.nextRemaining.penRemCents),
    carryOverPaid: fromCentavos(cashSplit.nextPaid.carryPaidCents),
    carryOverRemaining: fromCentavos(cashSplit.nextRemaining.carryRemCents),
    status: billStatus,
    paidAt,
    isLocked: billStatus === 'paid',
    idempotencyKey,
    paymentHistory:
      upfrontCashCents > 0 && (!billDraft.paymentHistory || billDraft.paymentHistory.length === 0)
        ? [
            {
              id: createUniqueId('tx-init'),
              amount: fromCentavos(upfrontCashCents),
              overpaymentCredited: overpaymentCents > 0 ? overpaymentPeso : undefined,
              method: billDraft.paymentMethod || 'Cash',
              paidAt: nowIso,
              allocationTarget: initialAllocationTarget,
              componentAllocation: cashSplit.txAllocation,
              note:
                overpaymentCents > 0
                  ? `Cash payment at billing (${overpaymentPeso.toFixed(2)} credited to Advance Balance)`
                  : cashSplit.nextRemaining.elecRemCents > 0 && cashSplit.nextRemaining.rentRemCents === 0
                    ? `Rent paid; Electricity balance ₱${fromCentavos(cashSplit.nextRemaining.elecRemCents).toFixed(2)} still unpaid`
                    : 'Initial cash payment recorded with bill generation',
            },
          ]
        : (billDraft.paymentHistory || []).map((tx, idx) =>
            idx === 0 && !tx.componentAllocation
              ? {
                  ...tx,
                  allocationTarget: tx.allocationTarget || initialAllocationTarget,
                  componentAllocation: cashSplit.txAllocation,
                }
              : tx
          ),
    updatedAt: nowIso,
  };

  const archivedPreviousBills = existingBills.map((b) =>
    b.roomId === room.id && !b.isArchived
      ? {
          ...b,
          isArchived: true,
          isLocked: true,
          archivedAt: nowIso,
        }
      : b
  );

  const updatedRoom: Room = {
    ...room,
    lastMeterReading: roundKwh(createdBill.currReading),
    lastMeterPhotoDataUrl: createdBill.meterPhotoDataUrl || room.lastMeterPhotoDataUrl,
    lastMeterCropDataUrl: createdBill.currMeterCropDataUrl || room.lastMeterCropDataUrl,
    lastReadingDate: nowIso,
    unpaidBalance: createdBill.remainingBalance,
    securityDepositPaid: allocation.remainingSecurityDeposit,
    advanceRent: finalAdvanceBalance,
    advanceHistory: [
      ...ledgerEntriesNewestFirst,
      ...(room.advanceHistory || []),
    ],
    activeReceiptId: createdBill.id,
    updatedAt: nowIso,
  };

  return {
    ok: true,
    createdBill,
    archivedPreviousBills: [createdBill, ...archivedPreviousBills],
    updatedRoom,
    ledgerEntries: ledgerEntriesNewestFirst,
  };
}

export interface RecordPaymentTransactionInput {
  bill: BillRecord;
  room?: Room;
  paymentAmount: number;
  method: PaymentTransaction['method'];
  referenceNo?: string;
  note?: string;
  advanceCapMode?: AdvanceCapPolicyMode;
  nowIso?: string;
  idempotencyKey?: string;
  allocationTarget?: PaymentAllocationTarget;
  customAllocation?: Partial<ComponentPaymentAllocation>;
}

export interface RecordPaymentTransactionResult {
  ok: boolean;
  duplicate?: boolean;
  errorCode?: string;
  errorMessage?: string;
  updatedBill?: BillRecord;
  updatedRoom?: Room;
  overpaymentCredited: number;
  ledgerEntry?: AdvanceBalanceTransaction;
  componentAllocation?: ComponentPaymentAllocation;
}

/**
 * Processes a cash or e-wallet payment against a bill using integer centavos.
 * Keeps Rent, Electricity, Late Penalty, and Carry-Over separately tracked.
 * Never marks a bill 'paid' if electricity charges (or any other component) remain unpaid.
 */
export function executeRecordPaymentTransaction(
  input: RecordPaymentTransactionInput
): RecordPaymentTransactionResult {
  const {
    bill,
    room,
    paymentAmount,
    method,
    referenceNo,
    note,
    advanceCapMode = 'unlimited',
    idempotencyKey,
    allocationTarget = 'auto',
    customAllocation,
  } = input;

  const paymentCents = Math.max(0, toCentavos(paymentAmount));
  if (paymentCents <= 0) {
    return {
      ok: false,
      errorCode: 'INVALID_PAYMENT_AMOUNT',
      errorMessage: 'Payment amount must be greater than ₱0.00.',
      overpaymentCredited: 0,
    };
  }

  if (
    idempotencyKey &&
    (bill.paymentHistory?.some((tx) => tx.id === idempotencyKey || tx.referenceNo === idempotencyKey) ||
      room?.advanceHistory?.some((tx) => tx.idempotencyKey === idempotencyKey))
  ) {
    return {
      ok: false,
      duplicate: true,
      errorCode: 'DUPLICATE_PAYMENT_OPERATION',
      errorMessage: 'This payment operation was already recorded.',
      overpaymentCredited: 0,
      updatedBill: bill,
      updatedRoom: room,
    };
  }

  const nowIso = input.nowIso || new Date().toISOString();
  const prevPaidCents = Math.max(0, toCentavos(bill.amountPaid));
  const netDueCents = Math.max(0, toCentavos(bill.totalAmountDue));
  const currentBalances = computeBillComponentBalances(bill);

  const split = distributeCashAcrossComponents({
    paymentCents,
    currentBalances,
    allocationTarget,
    customAllocation,
  });

  const currentRemainingCents = Math.max(0, netDueCents - prevPaidCents);
  const overpaymentCents = Math.max(
    0,
    Math.min(split.overpaymentCents, Math.max(0, paymentCents - currentRemainingCents))
  );
  const overpaymentPeso = fromCentavos(overpaymentCents);

  const currentAdvCents = Math.max(0, toCentavos(room?.advanceRent ?? bill.advanceBalanceAfter ?? 0));

  if (overpaymentCents > 0 && room) {
    const allowance = getAdvancePolicyAllowance(
      room.monthlyRent,
      fromCentavos(currentAdvCents),
      advanceCapMode
    );
    if (allowance.isCapped && overpaymentCents > toCentavos(allowance.remainingAllowance)) {
      return {
        ok: false,
        errorCode: 'ADVANCE_CAP_EXCEEDED',
        errorMessage: `Excess payment (${overpaymentPeso.toFixed(2)}) exceeds the 1-Month Advance Policy allowance (${allowance.remainingAllowance.toFixed(2)} remaining).`,
        overpaymentCredited: 0,
      };
    }
  }

  const newPaidCents = prevPaidCents + paymentCents;
  const remainingFromComponentsCents =
    split.nextRemaining.rentRemCents +
    split.nextRemaining.elecRemCents +
    split.nextRemaining.penRemCents +
    split.nextRemaining.carryRemCents +
    split.nextRemaining.otherRemCents;
  const newRemainingCents = Math.max(
    remainingFromComponentsCents,
    Math.max(0, netDueCents - newPaidCents)
  );
  const hasAnyUnpaidComponent =
    split.nextRemaining.elecRemCents > 0 ||
    split.nextRemaining.rentRemCents > 0 ||
    split.nextRemaining.penRemCents > 0 ||
    split.nextRemaining.carryRemCents > 0 ||
    split.nextRemaining.otherRemCents > 0;

  // Strict loophole guard: NEVER mark monthly bill as 'paid' while electricity (or rent/penalty) remains unpaid
  const nextStatus: BillRecord['status'] =
    newRemainingCents === 0 && !hasAnyUnpaidComponent
      ? 'paid'
      : newPaidCents > 0 || (bill.depositApplied || 0) > 0
        ? 'partial'
        : 'unpaid';

  const autoNoteParts: string[] = [];
  if (split.txAllocation.rentPaid > 0) {
    autoNoteParts.push(`Rent ₱${split.txAllocation.rentPaid.toFixed(2)}`);
  }
  if (split.txAllocation.electricityPaid > 0) {
    autoNoteParts.push(`Electricity ₱${split.txAllocation.electricityPaid.toFixed(2)}`);
  }
  if (split.txAllocation.latePenaltyPaid > 0) {
    autoNoteParts.push(`Penalty ₱${split.txAllocation.latePenaltyPaid.toFixed(2)}`);
  }
  if (split.txAllocation.carryOverPaid > 0) {
    autoNoteParts.push(`Carry-Over ₱${split.txAllocation.carryOverPaid.toFixed(2)}`);
  }
  const allocationSummaryNote =
    autoNoteParts.length > 0 ? `Applied to: ${autoNoteParts.join(', ')}` : undefined;

  const newPaymentTx: PaymentTransaction = {
    id: idempotencyKey || createUniqueId('tx'),
    amount: fromCentavos(paymentCents),
    overpaymentCredited: overpaymentCents > 0 ? overpaymentPeso : undefined,
    method,
    paidAt: nowIso,
    referenceNo: referenceNo?.trim() || undefined,
    allocationTarget,
    componentAllocation: split.txAllocation,
    note:
      overpaymentCents > 0
        ? `Excess ₱${overpaymentPeso.toFixed(2)} credited to Advance Payment Balance`
        : note || allocationSummaryNote,
  };

  const nextAdvCents = currentAdvCents + overpaymentCents;
  const nextAdvanceBalance = fromCentavos(nextAdvCents);

  const updatedBill: BillRecord = {
    ...bill,
    amountPaid: fromCentavos(newPaidCents),
    overpaymentToAdvance: fromCentavos(
      toCentavos(bill.overpaymentToAdvance) + overpaymentCents
    ),
    advanceBalanceAfter: nextAdvanceBalance,
    remainingBalance: fromCentavos(newRemainingCents),
    rentPaid: fromCentavos(split.nextPaid.rentPaidCents),
    rentRemaining: fromCentavos(split.nextRemaining.rentRemCents),
    electricityPaid: fromCentavos(split.nextPaid.elecPaidCents),
    electricityRemaining: fromCentavos(split.nextRemaining.elecRemCents),
    latePenaltyPaid: fromCentavos(split.nextPaid.penPaidCents),
    latePenaltyRemaining: fromCentavos(split.nextRemaining.penRemCents),
    carryOverPaid: fromCentavos(split.nextPaid.carryPaidCents),
    carryOverRemaining: fromCentavos(split.nextRemaining.carryRemCents),
    status: nextStatus,
    paymentMethod: method,
    paidAt: nextStatus === 'paid' ? bill.paidAt || nowIso : bill.paidAt,
    isLocked: nextStatus === 'paid' ? true : bill.isLocked,
    paymentHistory: [...(bill.paymentHistory || []), newPaymentTx],
    updatedAt: nowIso,
  };

  let ledgerEntry: AdvanceBalanceTransaction | undefined;
  let updatedRoom = room;

  if (room) {
    if (overpaymentCents > 0) {
      ledgerEntry = {
        id: createUniqueId('adv-over'),
        type: 'overpayment_credit',
        category: 'advance_credit',
        amount: overpaymentPeso,
        createdAt: nowIso,
        description: `Overpayment Credit from Receipt #${bill.receiptNo}`,
        note: `Excess payment (${method}${referenceNo ? ` Ref ${referenceNo}` : ''}) from Receipt #${bill.receiptNo} added to Advance Credit`,
        referenceNo:
          referenceNo?.trim() || generateFinancialRefNo('ADV', nowIso, bill.receiptNo.slice(-4)),
        balanceBefore: fromCentavos(currentAdvCents),
        balanceAfter: nextAdvanceBalance,
        status: 'completed',
        billingPeriod: bill.billingPeriod,
        billId: bill.id,
        receiptNo: bill.receiptNo,
        idempotencyKey,
      };
    }

    updatedRoom = {
      ...room,
      unpaidBalance: updatedBill.remainingBalance,
      advanceRent: nextAdvanceBalance,
      advanceHistory: ledgerEntry
        ? [ledgerEntry, ...(room.advanceHistory || [])]
        : room.advanceHistory,
      updatedAt: nowIso,
    };
  }

  return {
    ok: true,
    updatedBill,
    updatedRoom,
    overpaymentCredited: overpaymentPeso,
    ledgerEntry,
    componentAllocation: split.txAllocation,
  };
}

export interface AdvanceDepositTransactionInput {
  room: Room;
  activeBills?: BillRecord[];
  amount: number;
  note: string;
  referenceNo?: string;
  billingPeriod?: string;
  advanceCapMode?: AdvanceCapPolicyMode;
  nowIso?: string;
  idempotencyKey?: string;
}

export interface AdvanceDepositTransactionResult {
  ok: boolean;
  duplicate?: boolean;
  errorCode?: string;
  errorMessage?: string;
  updatedRoom?: Room;
  updatedBills: BillRecord[];
  autoAppliedToBill: number;
  addedToWallet: number;
  ledgerEntries: AdvanceBalanceTransaction[];
}

/**
 * Adds a prepaid advance credit deposit to a tenant wallet, optionally auto-applying
 * toward any active unpaid balance first while keeping exact Balance Before / After
 * audit conservation in integer centavos.
 */
export function executeAdvanceDepositTransaction(
  input: AdvanceDepositTransactionInput
): AdvanceDepositTransactionResult {
  const {
    room,
    activeBills = [],
    amount,
    note,
    referenceNo,
    billingPeriod,
    advanceCapMode = 'unlimited',
    idempotencyKey,
  } = input;

  const depositCents = Math.max(0, toCentavos(amount));
  if (depositCents <= 0) {
    return {
      ok: false,
      errorCode: 'INVALID_DEPOSIT_AMOUNT',
      errorMessage: 'Deposit amount must be greater than ₱0.00.',
      updatedBills: activeBills,
      autoAppliedToBill: 0,
      addedToWallet: 0,
      ledgerEntries: [],
    };
  }

  if (
    idempotencyKey &&
    room.advanceHistory?.some(
      (tx) => tx.idempotencyKey === idempotencyKey || tx.idempotencyKey === `${idempotencyKey}:deposit`
    )
  ) {
    return {
      ok: false,
      duplicate: true,
      errorCode: 'DUPLICATE_DEPOSIT_OPERATION',
      errorMessage: 'This advance deposit was already recorded.',
      updatedRoom: room,
      updatedBills: activeBills,
      autoAppliedToBill: 0,
      addedToWallet: 0,
      ledgerEntries: [],
    };
  }

  const nowIso = input.nowIso || new Date().toISOString();
  const baseTimeMs = Number.isNaN(new Date(nowIso).getTime())
    ? Date.now()
    : new Date(nowIso).getTime();

  const activeUnpaidBills = activeBills
    .filter(
      (b) =>
        b.roomId === room.id &&
        !b.isArchived &&
        toCentavos(b.remainingBalance) > 0
    )
    .sort((a, b) =>
      a.id === room.activeReceiptId
        ? -1
        : b.id === room.activeReceiptId
          ? 1
          : 0
    );

  const totalBillUnpaidCents = activeUnpaidBills.reduce(
    (sum, b) => sum + toCentavos(b.remainingBalance),
    0
  );
  const unpaidCents =
    activeUnpaidBills.length > 0
      ? totalBillUnpaidCents
      : Math.max(0, toCentavos(room.unpaidBalance));

  const autoAppliedCents = Math.min(depositCents, unpaidCents);
  const netIncreaseToWalletCents = depositCents - autoAppliedCents;

  const startingWalletCents = Math.max(0, toCentavos(room.advanceRent));

  if (netIncreaseToWalletCents > 0) {
    const allowance = getAdvancePolicyAllowance(
      room.monthlyRent,
      fromCentavos(startingWalletCents),
      advanceCapMode
    );
    if (allowance.isCapped && netIncreaseToWalletCents > toCentavos(allowance.remainingAllowance)) {
      return {
        ok: false,
        errorCode: 'ADVANCE_CAP_EXCEEDED',
        errorMessage: `Deposit exceeds active 1-Month Advance Policy (${allowance.remainingAllowance.toFixed(2)} remaining allowance). Switch Advance Policy in Settings to Prepaid Wallet (Unlimited) for multi-month advances.`,
        updatedBills: activeBills,
        autoAppliedToBill: 0,
        addedToWallet: 0,
        ledgerEntries: [],
      };
    }
  }

  const afterDepositCents = startingWalletCents + depositCents;
  const finalWalletCents = Math.max(0, afterDepositCents - autoAppliedCents);
  const sharedRef = referenceNo?.trim() || generateFinancialRefNo('ADV', nowIso);

  const depositEntry: AdvanceBalanceTransaction = {
    id: createUniqueId('adv-dep'),
    type: 'manual_deposit',
    category: 'advance_credit',
    amount: fromCentavos(depositCents),
    createdAt: nowIso,
    description: 'Advance Credit Added',
    note: note.trim() || 'Prepaid advance rental wallet deposit',
    referenceNo: sharedRef,
    balanceBefore: fromCentavos(startingWalletCents),
    balanceAfter: fromCentavos(afterDepositCents),
    status: 'completed',
    billingPeriod,
    idempotencyKey: idempotencyKey ? `${idempotencyKey}:deposit` : undefined,
  };

  const newEntriesNewestFirst: AdvanceBalanceTransaction[] = [depositEntry];
  let updatedBills = activeBills;

  if (autoAppliedCents > 0) {
    if (activeUnpaidBills.length > 0) {
      let remainingAutoApplyCents = autoAppliedCents;
      let walletCursorCents = afterDepositCents;
      const billUpdatesById = new Map<string, BillRecord>();
      let applySeq = 0;

      for (const targetBill of activeUnpaidBills) {
        if (remainingAutoApplyCents <= 0) break;
        const billRemCents = Math.max(0, toCentavos(targetBill.remainingBalance));
        const deductCents = Math.min(remainingAutoApplyCents, billRemCents);
        if (deductCents <= 0) continue;

        remainingAutoApplyCents -= deductCents;
        const beforeBillApplyCents = walletCursorCents;
        walletCursorCents = Math.max(0, walletCursorCents - deductCents);

        const applyTimestamp = new Date(baseTimeMs + 1 + applySeq).toISOString();
        const appliedEntry: AdvanceBalanceTransaction = {
          id: createUniqueId('adv-apply'),
          type: 'applied_to_bill',
          category: 'rent',
          amount: fromCentavos(deductCents),
          createdAt: applyTimestamp,
          description: `${targetBill.billingPeriod} Bill Settlement (Auto-Applied)`,
          note: `Auto-applied toward Receipt #${targetBill.receiptNo}`,
          referenceNo: generateFinancialRefNo('BILL', nowIso, targetBill.receiptNo.slice(-4)),
          balanceBefore: fromCentavos(beforeBillApplyCents),
          balanceAfter: fromCentavos(walletCursorCents),
          status: 'completed',
          billingPeriod: targetBill.billingPeriod || billingPeriod,
          billId: targetBill.id,
          receiptNo: targetBill.receiptNo,
          idempotencyKey: idempotencyKey
            ? applySeq === 0
              ? `${idempotencyKey}:autoapply`
              : `${idempotencyKey}:autoapply:${applySeq}`
            : undefined,
        };
        newEntriesNewestFirst.unshift(appliedEntry);
        applySeq += 1;

        const nextAdvApplied = fromCentavos(
          toCentavos(targetBill.advanceApplied) + deductCents
        );
        const nextDepApplied = fromCentavos(
          Math.max(
            toCentavos(targetBill.securityDepositApplied) + toCentavos(nextAdvApplied),
            toCentavos(targetBill.depositApplied) + deductCents
          )
        );
        const nextTotalDue = fromCentavos(
          Math.max(0, toCentavos(targetBill.totalAmountDue) - deductCents)
        );
        const nextRemaining = fromCentavos(
          Math.max(0, billRemCents - deductCents)
        );
        const nextStatus: BillRecord['status'] =
          nextRemaining <= 0
            ? 'paid'
            : targetBill.amountPaid > 0 || nextDepApplied > 0
              ? 'partial'
              : 'unpaid';

        const draftUpdated: BillRecord = {
          ...targetBill,
          advanceApplied: nextAdvApplied,
          depositApplied: nextDepApplied,
          advanceBalanceAfter: fromCentavos(finalWalletCents),
          totalAmountDue: nextTotalDue,
          remainingBalance: nextRemaining,
          status: nextStatus,
          paidAt: nextStatus === 'paid' ? targetBill.paidAt || nowIso : targetBill.paidAt,
          isLocked: nextStatus === 'paid' ? true : targetBill.isLocked,
          updatedAt: nowIso,
        };
        const recomputedComp = computeBillComponentBalances({
          ...draftUpdated,
          rentPaid: undefined,
          electricityPaid: undefined,
        });

        billUpdatesById.set(targetBill.id, {
          ...draftUpdated,
          rentPaid: recomputedComp.rentPaid,
          rentRemaining: nextRemaining <= 0 ? 0 : recomputedComp.rentRemaining,
          electricityPaid: recomputedComp.electricityPaid,
          electricityRemaining: nextRemaining <= 0 ? 0 : recomputedComp.electricityRemaining,
          latePenaltyPaid: recomputedComp.latePenaltyPaid,
          latePenaltyRemaining: nextRemaining <= 0 ? 0 : recomputedComp.latePenaltyRemaining,
          carryOverPaid: recomputedComp.carryOverPaid,
          carryOverRemaining: nextRemaining <= 0 ? 0 : recomputedComp.carryOverRemaining,
        });
      }

      if (billUpdatesById.size > 0) {
        updatedBills = activeBills.map((b) => billUpdatesById.get(b.id) ?? b);
      }
    } else {
      const applyTimestamp = new Date(baseTimeMs + 1).toISOString();
      const appliedEntry: AdvanceBalanceTransaction = {
        id: createUniqueId('adv-apply'),
        type: 'applied_to_bill',
        category: 'rent',
        amount: fromCentavos(autoAppliedCents),
        createdAt: applyTimestamp,
        description: 'Applied to Outstanding Room Balance',
        note: 'Automatically applied toward active unpaid balance',
        referenceNo: generateFinancialRefNo('BILL', nowIso),
        balanceBefore: fromCentavos(afterDepositCents),
        balanceAfter: fromCentavos(finalWalletCents),
        status: 'completed',
        billingPeriod,
        idempotencyKey: idempotencyKey ? `${idempotencyKey}:autoapply` : undefined,
      };
      newEntriesNewestFirst.unshift(appliedEntry);
    }
  }

  const nextRoomUnpaid = fromCentavos(Math.max(0, unpaidCents - autoAppliedCents));
  const updatedRoom: Room = {
    ...room,
    advanceRent: fromCentavos(finalWalletCents),
    unpaidBalance: nextRoomUnpaid,
    advanceHistory: [...newEntriesNewestFirst, ...(room.advanceHistory || [])],
    updatedAt: nowIso,
  };

  return {
    ok: true,
    updatedRoom,
    updatedBills,
    autoAppliedToBill: fromCentavos(autoAppliedCents),
    addedToWallet: fromCentavos(finalWalletCents - startingWalletCents),
    ledgerEntries: newEntriesNewestFirst,
  };
}

export interface AdvanceRefundTransactionInput {
  room: Room;
  amount: number;
  note: string;
  referenceNo?: string;
  billingPeriod?: string;
  nowIso?: string;
  idempotencyKey?: string;
}

export interface AdvanceRefundTransactionResult {
  ok: boolean;
  duplicate?: boolean;
  errorCode?: string;
  errorMessage?: string;
  updatedRoom?: Room;
  ledgerEntry?: AdvanceBalanceTransaction;
}

/**
 * Processes an advance credit refund / withdrawal safely in integer centavos.
 * Never allows advance balance to become negative.
 */
export function executeAdvanceRefundTransaction(
  input: AdvanceRefundTransactionInput
): AdvanceRefundTransactionResult {
  const { room, amount, note, referenceNo, billingPeriod, idempotencyKey } = input;
  const refundCents = Math.max(0, toCentavos(amount));

  if (refundCents <= 0) {
    return {
      ok: false,
      errorCode: 'INVALID_REFUND_AMOUNT',
      errorMessage: 'Refund / withdrawal amount must be greater than ₱0.00.',
    };
  }

  if (
    idempotencyKey &&
    room.advanceHistory?.some((tx) => tx.idempotencyKey === idempotencyKey)
  ) {
    return {
      ok: false,
      duplicate: true,
      errorCode: 'DUPLICATE_REFUND_OPERATION',
      errorMessage: 'This refund / withdrawal was already processed.',
      updatedRoom: room,
    };
  }

  const currentAdvCents = Math.max(0, toCentavos(room.advanceRent));
  if (refundCents > currentAdvCents) {
    return {
      ok: false,
      errorCode: 'INSUFFICIENT_ADVANCE_BALANCE',
      errorMessage: `Requested refund (₱${fromCentavos(refundCents).toFixed(2)}) exceeds available advance credit (₱${fromCentavos(currentAdvCents).toFixed(2)}).`,
    };
  }

  const nowIso = input.nowIso || new Date().toISOString();
  const afterCents = currentAdvCents - refundCents;
  const ledgerEntry: AdvanceBalanceTransaction = {
    id: createUniqueId('adv-ref'),
    type: 'withdrawal',
    category: 'refund',
    amount: fromCentavos(refundCents),
    createdAt: nowIso,
    description: 'Advance Credit Refund / Withdrawal',
    note: note.trim() || 'Tenant refund / withdrawal from Advance Balance',
    referenceNo: referenceNo?.trim() || generateFinancialRefNo('REF', nowIso),
    balanceBefore: fromCentavos(currentAdvCents),
    balanceAfter: fromCentavos(afterCents),
    status: 'completed',
    billingPeriod,
    idempotencyKey,
  };

  const updatedRoom: Room = {
    ...room,
    advanceRent: fromCentavos(afterCents),
    advanceHistory: [ledgerEntry, ...(room.advanceHistory || [])],
    updatedAt: nowIso,
  };

  return {
    ok: true,
    updatedRoom,
    ledgerEntry,
  };
}

/**
 * Safely recalculates ONLY unlocked, unpaid/partial active bills when electric rates change.
 * Locked, archived, or settled receipts strictly preserve their exact historical amounts.
 * Restores over-applied advance credit back into room wallet if charges drop below applied credits.
 */
export function recalculateUnlockedBillsForRates(
  bills: BillRecord[],
  rooms: Room[],
  settings: Pick<AppSettings, 'defaultElectricRate' | 'monthlyElectricRates'>,
  resolveRateFn: (
    s: Pick<AppSettings, 'defaultElectricRate' | 'monthlyElectricRates'>,
    periodOrDate?: string
  ) => number
): {
  bills: BillRecord[];
  rooms: Room[];
  updatedCount: number;
  roomUnpaidMap: Record<string, number>;
} {
  let updatedCount = 0;
  const nowIso = new Date().toISOString();
  const roomUnpaidMap: Record<string, number> = {};
  const roomAdjustments = new Map<
    string,
    { restoreAdvCents: number; restoreSecCents: number; entries: AdvanceBalanceTransaction[] }
  >();
  const roomById = new Map<string, Room>(rooms.map((r) => [r.id, r]));

  const updatedBills = bills.map((b) => {
    // Preserve finalized/archived/settled receipts verbatim
    if (b.isLocked || b.isArchived || b.status === 'paid') {
      if (!b.isArchived && b.status !== 'paid') {
        roomUnpaidMap[b.roomId] = fromCentavos(
          toCentavos(roomUnpaidMap[b.roomId] || 0) +
            Math.max(0, toCentavos(b.remainingBalance))
        );
      }
      return b;
    }

    const nextRate = resolveRateFn(settings, b.billingPeriod);
    const nextElecCents = Math.round(b.consumptionKwh * toCentavos(nextRate));
    const baseRentCents = Math.max(0, toCentavos(b.baseRent));
    const latePenaltyCents = Math.max(0, toCentavos(b.latePenalty));
    const carryOverCents = Math.max(0, toCentavos(b.previousBalanceCarryOver));
    const otherCents = Math.max(0, toCentavos(b.otherCharges));
    const nextGrossCents =
      baseRentCents + latePenaltyCents + nextElecCents + carryOverCents + otherCents;

    const prevSecCents = Math.max(0, toCentavos(b.securityDepositApplied));
    const prevAdvCents = Math.max(0, toCentavos(b.advanceApplied));
    const legacyUnseparatedDepCents =
      prevSecCents === 0 && prevAdvCents === 0
        ? Math.max(0, toCentavos(b.depositApplied))
        : 0;

    const nextSecCents = Math.min(prevSecCents, nextGrossCents);
    const secRestoredCents = Math.max(0, prevSecCents - nextSecCents);

    const remAfterSecCents = Math.max(0, nextGrossCents - nextSecCents);
    const nextAdvCents = Math.min(prevAdvCents, remAfterSecCents);
    const advRestoredCents = Math.max(0, prevAdvCents - nextAdvCents);

    const totalCreditsCents =
      legacyUnseparatedDepCents > 0
        ? Math.min(legacyUnseparatedDepCents, nextGrossCents)
        : nextSecCents + nextAdvCents;

    const nextTotalDueCents = Math.max(0, nextGrossCents - totalCreditsCents);
    const paidCents = Math.max(0, toCentavos(b.amountPaid));
    const cashOverpayCents = Math.max(0, paidCents - nextTotalDueCents);
    const nextRemainingCents = Math.max(0, nextTotalDueCents - paidCents);
    const nextStatus: BillRecord['status'] =
      nextRemainingCents === 0
        ? 'paid'
        : paidCents > 0 || totalCreditsCents > 0
          ? 'partial'
          : 'unpaid';

    const nextRateRounded = roundCurrencyCentavos(nextRate);
    const nextElecTotal = fromCentavos(nextElecCents);
    const nextTotalDue = fromCentavos(nextTotalDueCents);
    const nextRemaining = fromCentavos(nextRemainingCents);

    roomUnpaidMap[b.roomId] = fromCentavos(
      toCentavos(roomUnpaidMap[b.roomId] || 0) + nextRemainingCents
    );

    let nextBillAdvanceAfter: number | undefined = b.advanceBalanceAfter;
    if (secRestoredCents > 0 || advRestoredCents > 0 || cashOverpayCents > 0) {
      const currentRoom = roomById.get(b.roomId);
      const existingAdj = roomAdjustments.get(b.roomId) || {
        restoreAdvCents: 0,
        restoreSecCents: 0,
        entries: [],
      };
      let runningWalletCents = currentRoom
        ? toCentavos(currentRoom.advanceRent) + existingAdj.restoreAdvCents
        : 0;
      if (advRestoredCents > 0 && currentRoom) {
        const beforeCents = runningWalletCents;
        const afterCents = beforeCents + advRestoredCents;
        runningWalletCents = afterCents;
        nextBillAdvanceAfter = fromCentavos(afterCents);
        existingAdj.entries.unshift({
          id: createUniqueId('adv-adj'),
          type: 'adjustment',
          category: 'adjustment',
          amount: fromCentavos(advRestoredCents),
          createdAt: nowIso,
          description: `Unused Advance Credit Restored (${b.billingPeriod})`,
          note: `Rate update lowered charges on Receipt #${b.receiptNo}; restored excess advance to wallet`,
          referenceNo: generateFinancialRefNo('ADJ', nowIso, b.receiptNo.slice(-4)),
          balanceBefore: fromCentavos(beforeCents),
          balanceAfter: fromCentavos(afterCents),
          status: 'completed',
          billingPeriod: b.billingPeriod,
          billId: b.id,
          receiptNo: b.receiptNo,
        });
      }
      if (cashOverpayCents > 0 && currentRoom) {
        const beforeCents = runningWalletCents;
        const afterCents = beforeCents + cashOverpayCents;
        runningWalletCents = afterCents;
        nextBillAdvanceAfter = fromCentavos(afterCents);
        existingAdj.entries.unshift({
          id: createUniqueId('adv-ovp'),
          type: 'overpayment_credit',
          category: 'advance_credit',
          amount: fromCentavos(cashOverpayCents),
          createdAt: nowIso,
          description: `Excess Cash Credited from Rate Recalculation (${b.billingPeriod})`,
          note: `Rate update lowered charges below cash already paid on Receipt #${b.receiptNo}`,
          referenceNo: generateFinancialRefNo('ADV', nowIso, b.receiptNo.slice(-4)),
          balanceBefore: fromCentavos(beforeCents),
          balanceAfter: fromCentavos(afterCents),
          status: 'completed',
          billingPeriod: b.billingPeriod,
          billId: b.id,
          receiptNo: b.receiptNo,
        });
      }
      existingAdj.restoreAdvCents += advRestoredCents + cashOverpayCents;
      existingAdj.restoreSecCents += secRestoredCents;
      roomAdjustments.set(b.roomId, existingAdj);
    }

    if (
      nextRateRounded !== b.electricRate ||
      nextElecTotal !== b.electricTotal ||
      nextTotalDue !== b.totalAmountDue ||
      nextRemaining !== b.remainingBalance ||
      nextBillAdvanceAfter !== b.advanceBalanceAfter
    ) {
      updatedCount += 1;
      const draftUpdated: BillRecord = {
        ...b,
        electricRate: nextRateRounded,
        electricTotal: nextElecTotal,
        grossCharges: fromCentavos(nextGrossCents),
        securityDepositApplied:
          legacyUnseparatedDepCents > 0 ? b.securityDepositApplied : fromCentavos(nextSecCents),
        advanceApplied:
          legacyUnseparatedDepCents > 0 ? b.advanceApplied : fromCentavos(nextAdvCents),
        depositApplied: fromCentavos(totalCreditsCents),
        totalAmountDue: nextTotalDue,
        remainingBalance: nextRemaining,
        overpaymentToAdvance:
          cashOverpayCents > 0
            ? fromCentavos(toCentavos(b.overpaymentToAdvance) + cashOverpayCents)
            : b.overpaymentToAdvance,
        advanceBalanceAfter: nextBillAdvanceAfter,
        status: nextStatus,
        paidAt: nextStatus === 'paid' ? b.paidAt || nowIso : b.paidAt,
        isLocked: nextStatus === 'paid' ? true : b.isLocked,
        updatedAt: nowIso,
      };
      const recomputedComp = computeBillComponentBalances({
        ...draftUpdated,
        rentPaid: undefined,
        electricityPaid: undefined,
      });
      return {
        ...draftUpdated,
        rentPaid: recomputedComp.rentPaid,
        rentRemaining: recomputedComp.rentRemaining,
        electricityPaid: recomputedComp.electricityPaid,
        electricityRemaining: recomputedComp.electricityRemaining,
        latePenaltyPaid: recomputedComp.latePenaltyPaid,
        latePenaltyRemaining: recomputedComp.latePenaltyRemaining,
        carryOverPaid: recomputedComp.carryOverPaid,
        carryOverRemaining: recomputedComp.carryOverRemaining,
      };
    }

    return b;
  });

  const updatedRooms =
    roomAdjustments.size === 0
      ? rooms
      : rooms.map((r) => {
          const adj = roomAdjustments.get(r.id);
          if (!adj) return r;
          return {
            ...r,
            advanceRent: fromCentavos(
              toCentavos(r.advanceRent) + adj.restoreAdvCents
            ),
            securityDepositPaid: fromCentavos(
              toCentavos(r.securityDepositPaid) + adj.restoreSecCents
            ),
            advanceHistory: [...adj.entries, ...(r.advanceHistory || [])],
            updatedAt: nowIso,
          };
        });

  return { bills: updatedBills, rooms: updatedRooms, updatedCount, roomUnpaidMap };
}

export interface RoomSaveAdvanceHistoryInput {
  roomName: string;
  nextStatus: 'occupied' | 'vacant';
  previousStatus?: 'occupied' | 'vacant';
  previousAdvanceRent?: number;
  nextBaseAdvance: number;
  excessDepositToAdvance?: number;
  paidSecurityDeposit?: number;
  requiredSecurityDeposit?: number;
  previousHistory?: AdvanceBalanceTransaction[];
  nowIso?: string;
}

/**
 * Computes the updated newest-first advance wallet ledger when saving a room,
 * covering new occupancy, vacant-to-occupied move-in, occupied edits, and excess deposits.
 */
export function buildRoomSaveAdvanceHistory(
  input: RoomSaveAdvanceHistoryInput
): AdvanceBalanceTransaction[] {
  if (input.nextStatus !== 'occupied') {
    return [];
  }

  const nowIso = input.nowIso || new Date().toISOString();
  const baseMs = Number.isNaN(new Date(nowIso).getTime())
    ? Date.now()
    : new Date(nowIso).getTime();

  const prevHistory = Array.isArray(input.previousHistory) ? input.previousHistory : [];
  const prevAdvCents = Math.max(0, toCentavos(input.previousAdvanceRent));
  const nextBaseCents = Math.max(0, toCentavos(input.nextBaseAdvance));
  const excessCents = Math.max(0, toCentavos(input.excessDepositToAdvance));

  const entriesToPrepend: AdvanceBalanceTransaction[] = [];

  if (!input.previousStatus || input.previousStatus === 'vacant') {
    if (nextBaseCents > 0) {
      entriesToPrepend.unshift({
        id: createUniqueId('adv-init'),
        type: 'manual_deposit',
        category: 'advance_credit',
        amount: fromCentavos(nextBaseCents),
        createdAt: nowIso,
        description: 'Opening Advance Credit Balance',
        note: `Opening Advance Balance on ${input.roomName} move-in`,
        referenceNo: generateFinancialRefNo('ADV', nowIso),
        balanceBefore: 0,
        balanceAfter: fromCentavos(nextBaseCents),
        status: 'completed',
      });
    }
  } else if (nextBaseCents !== prevAdvCents) {
    const diffCents = nextBaseCents - prevAdvCents;
    const isIncrease = diffCents > 0;
    entriesToPrepend.unshift({
      id: createUniqueId('adv-adj'),
      type: 'adjustment',
      category: 'adjustment',
      amount: fromCentavos(Math.abs(diffCents)),
      createdAt: nowIso,
      description: isIncrease
        ? 'Manual Advance Credit Adjustment (Added)'
        : 'Manual Advance Balance Adjustment (Reduced)',
      note: `${input.roomName} advance balance updated via Room Settings (₱${fromCentavos(prevAdvCents).toFixed(2)} -> ₱${fromCentavos(nextBaseCents).toFixed(2)})`,
      referenceNo: generateFinancialRefNo('ADJ', nowIso),
      balanceBefore: fromCentavos(prevAdvCents),
      balanceAfter: fromCentavos(nextBaseCents),
      status: 'completed',
    });
  }

  if (excessCents > 0) {
    const paidSec = roundCurrencyCentavos(input.paidSecurityDeposit || 0);
    const reqSec = roundCurrencyCentavos(input.requiredSecurityDeposit || 0);
    const afterCents = nextBaseCents + excessCents;
    entriesToPrepend.unshift({
      id: createUniqueId('adv-exdep'),
      type: 'overpayment_credit',
      category: 'advance_credit',
      amount: fromCentavos(excessCents),
      createdAt: new Date(baseMs + 1).toISOString(),
      description: 'Excess Security Deposit Credited to Advance',
      note: `Tenant paid ₱${paidSec.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} for required deposit ₱${reqSec.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (+₱${fromCentavos(excessCents).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} to Advance Balance)`,
      referenceNo: generateFinancialRefNo('ADV', nowIso),
      balanceBefore: fromCentavos(nextBaseCents),
      balanceAfter: fromCentavos(afterCents),
      status: 'completed',
    });
  }

  return entriesToPrepend.length > 0
    ? [...entriesToPrepend, ...prevHistory]
    : prevHistory;
}

export interface RoomSecurityDepositApplicationInput {
  roomId: string;
  status: 'occupied' | 'vacant';
  activeReceiptId?: string;
  availableSecurityDepositPaid: number;
  roomUnpaidBalance: number;
  bills: BillRecord[];
  nowIso?: string;
}

export interface RoomSecurityDepositApplicationResult {
  bills: BillRecord[];
  updatedCount: number;
  depositUsedOnActiveBills: number;
  remainingSecurityDepositPaid: number;
  finalRoomUnpaidBalance: number;
}

/**
 * Synchronously deducts an occupied room's paid security deposit across active unpaid bills
 * in integer centavos, prioritizing `activeReceiptId` so room and bill balances stay aligned.
 */
export function applyRoomSecurityDepositToActiveBills(
  input: RoomSecurityDepositApplicationInput
): RoomSecurityDepositApplicationResult {
  const nowIso = input.nowIso || new Date().toISOString();
  const initialCreditCents =
    input.status === 'occupied'
      ? Math.max(0, toCentavos(input.availableSecurityDepositPaid))
      : 0;
  let remainingCreditCents = initialCreditCents;
  let usedCents = 0;
  const billUpdatesById = new Map<string, BillRecord>();

  if (remainingCreditCents > 0) {
    const activeUnpaidBills = input.bills
      .filter(
        (b) =>
          !b.isArchived &&
          b.roomId === input.roomId &&
          toCentavos(b.remainingBalance) > 0
      )
      .sort((a, b) =>
        a.id === input.activeReceiptId
          ? -1
          : b.id === input.activeReceiptId
            ? 1
            : 0
      );

    for (const targetBill of activeUnpaidBills) {
      if (remainingCreditCents <= 0) break;
      const billRemCents = Math.max(0, toCentavos(targetBill.remainingBalance));
      const deductCents = Math.min(remainingCreditCents, billRemCents);
      if (deductCents <= 0) continue;

      remainingCreditCents -= deductCents;
      usedCents += deductCents;

      const nextSecDepAppliedCents =
        Math.max(0, toCentavos(targetBill.securityDepositApplied)) + deductCents;
      const nextTotalAppliedCents = Math.max(
        nextSecDepAppliedCents + Math.max(0, toCentavos(targetBill.advanceApplied)),
        Math.max(0, toCentavos(targetBill.depositApplied)) + deductCents
      );
      const nextTotalDueCents = Math.max(
        0,
        toCentavos(targetBill.totalAmountDue) - deductCents
      );
      const nextRemainingCents = Math.max(0, billRemCents - deductCents);
      const nextStatus: BillRecord['status'] =
        nextRemainingCents === 0
          ? 'paid'
          : toCentavos(targetBill.amountPaid) > 0 || nextTotalAppliedCents > 0
            ? 'partial'
            : 'unpaid';

      const draftUpdated: BillRecord = {
        ...targetBill,
        securityDepositApplied: fromCentavos(nextSecDepAppliedCents),
        securityDepositRemainingAfterBill: fromCentavos(remainingCreditCents),
        depositApplied: fromCentavos(nextTotalAppliedCents),
        totalAmountDue: fromCentavos(nextTotalDueCents),
        remainingBalance: fromCentavos(nextRemainingCents),
        status: nextStatus,
        paidAt: nextStatus === 'paid' ? targetBill.paidAt || nowIso : targetBill.paidAt,
        updatedAt: nowIso,
      };
      const recomputedComp = computeBillComponentBalances({
        ...draftUpdated,
        rentPaid: undefined,
        electricityPaid: undefined,
      });

      billUpdatesById.set(targetBill.id, {
        ...draftUpdated,
        rentPaid: recomputedComp.rentPaid,
        rentRemaining: nextRemainingCents === 0 ? 0 : recomputedComp.rentRemaining,
        electricityPaid: recomputedComp.electricityPaid,
        electricityRemaining: nextRemainingCents === 0 ? 0 : recomputedComp.electricityRemaining,
        latePenaltyPaid: recomputedComp.latePenaltyPaid,
        latePenaltyRemaining: nextRemainingCents === 0 ? 0 : recomputedComp.latePenaltyRemaining,
        carryOverPaid: recomputedComp.carryOverPaid,
        carryOverRemaining: nextRemainingCents === 0 ? 0 : recomputedComp.carryOverRemaining,
      });
    }
  }

  const nextBills =
    billUpdatesById.size > 0
      ? input.bills.map((b) => billUpdatesById.get(b.id) ?? b)
      : input.bills;

  const baseRoomUnpaidCents = Math.max(0, toCentavos(input.roomUnpaidBalance));
  const finalRoomUnpaidBalance =
    usedCents > 0
      ? fromCentavos(Math.max(0, baseRoomUnpaidCents - usedCents))
      : fromCentavos(baseRoomUnpaidCents);

  return {
    bills: nextBills,
    updatedCount: billUpdatesById.size,
    depositUsedOnActiveBills: fromCentavos(usedCents),
    remainingSecurityDepositPaid: fromCentavos(remainingCreditCents),
    finalRoomUnpaidBalance,
  };
}
