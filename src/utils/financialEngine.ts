import {
  AdvanceBalanceTransaction,
  AdvanceCapPolicyMode,
  AdvanceTransactionType,
  AppSettings,
  BillRecord,
  PaymentTransaction,
  Room,
} from '../types/rental';

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
  const carryOverCents = Math.max(0, toCentavos(input.previousBalanceCarryOver));
  const otherCents = Math.max(0, toCentavos(input.otherCharges));

  const grossChargesCents =
    baseRentCents + electricCents + carryOverCents + otherCents;

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

  // Itemize how the advance credit paid down each component after deposit deduction
  const componentQueue: Array<{
    category: AdvanceComponentAllocation['category'];
    label: string;
    cents: number;
  }> = [
    { category: 'carryover', label: 'Previous Unpaid Balance', cents: carryOverCents },
    { category: 'rent', label: 'Monthly Rent', cents: baseRentCents },
    { category: 'electricity', label: 'Electricity Charges', cents: electricCents },
    { category: 'other', label: 'Other Charges', cents: otherCents },
  ];

  let secOffsetRemaining = securityDepositAppliedCents;
  let advOffsetRemaining = advanceAppliedCents;
  const advanceBreakdown: AdvanceComponentAllocation[] = [];

  for (const item of componentQueue) {
    if (item.cents <= 0) continue;
    const secCovered = Math.min(item.cents, secOffsetRemaining);
    secOffsetRemaining -= secCovered;
    const netComponentCents = item.cents - secCovered;
    if (netComponentCents <= 0 || advOffsetRemaining <= 0) continue;

    const advCovered = Math.min(netComponentCents, advOffsetRemaining);
    advOffsetRemaining -= advCovered;
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
 * 1. Prevents duplicate issuance for matching idempotencyKey.
 * 2. Computes grossCharges, deposit deduction, advance application, and netAmountDue.
 * 3. Keeps unused advance credit intact in room.advanceRent.
 * 4. Keeps advance credit consumption strictly separate from cash amountPaid.
 * 5. Emits itemized Advance Ledger entries with balanceBefore/balanceAfter/refNo.
 */
export function executeGenerateBillTransaction(
  input: GenerateBillTransactionInput
): GenerateBillTransactionResult {
  const { room, existingBills, billDraft, advanceCapMode = 'unlimited', idempotencyKey } =
    input;

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

  const nowIso = billDraft.createdAt || new Date().toISOString();
  const availSecDep = Math.max(0, roundCurrencyCentavos(room.securityDepositPaid || 0));
  const availAdv = Math.max(0, roundCurrencyCentavos(room.advanceRent || 0));

  const allocation = allocateChargesAndCredits({
    baseRent: billDraft.baseRent,
    electricTotal: billDraft.electricTotal,
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
  const overpaymentCents = Math.max(0, upfrontCashCents - netDueCents);
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

  const remainingBalanceCents = Math.max(0, netDueCents - upfrontCashCents);
  const billStatus: BillRecord['status'] =
    remainingBalanceCents === 0
      ? 'paid'
      : upfrontCashCents > 0 || allocation.totalCreditsApplied > 0
        ? 'partial'
        : 'unpaid';

  // Wait: if zero cash paid and only partial credit/deposit applied, keep status precise:
  // If advance + deposit cover 100%, remainingBalance === 0 -> 'paid'.
  // If cash paid > 0 OR credits applied > 0 with balance remaining -> 'partial'.
  // If neither cash nor credits -> 'unpaid'.
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

  const createdBill: BillRecord = {
    ...billDraft,
    baseRent: allocation.baseRent,
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
              note:
                overpaymentCents > 0
                  ? `Cash payment at billing (${overpaymentPeso.toFixed(2)} credited to Advance Balance)`
                  : 'Initial cash payment recorded with bill generation',
            },
          ]
        : billDraft.paymentHistory || [],
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
}

/**
 * Processes a cash or e-wallet payment against a bill using integer centavos.
 * Keeps cash payments strictly separate from advance credit consumption.
 * Only sets `paidAt` when status transitions to 'paid'.
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
  const currentRemainingCents = Math.max(0, netDueCents - prevPaidCents);
  const overpaymentCents = Math.max(0, paymentCents - currentRemainingCents);
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
  const newRemainingCents = Math.max(0, netDueCents - newPaidCents);
  const nextStatus: BillRecord['status'] =
    newRemainingCents === 0
      ? 'paid'
      : newPaidCents > 0 || (bill.depositApplied || 0) > 0
        ? 'partial'
        : 'unpaid';

  const newPaymentTx: PaymentTransaction = {
    id: idempotencyKey || createUniqueId('tx'),
    amount: fromCentavos(paymentCents),
    overpaymentCredited: overpaymentCents > 0 ? overpaymentPeso : undefined,
    method,
    paidAt: nowIso,
    referenceNo: referenceNo?.trim() || undefined,
    note:
      overpaymentCents > 0
        ? `Excess ₱${overpaymentPeso.toFixed(2)} credited to Advance Payment Balance`
        : note,
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
  const targetActiveBill = activeBills.find(
    (b) =>
      (room.activeReceiptId && b.id === room.activeReceiptId && !b.isArchived && b.remainingBalance > 0) ||
      (b.roomId === room.id && !b.isArchived && b.remainingBalance > 0)
  );

  const unpaidCents = Math.max(
    0,
    targetActiveBill
      ? toCentavos(targetActiveBill.remainingBalance)
      : toCentavos(room.unpaidBalance)
  );
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
    const applyTimestamp = new Date(new Date(nowIso).getTime() + 1).toISOString();
    const appliedEntry: AdvanceBalanceTransaction = {
      id: createUniqueId('adv-apply'),
      type: 'applied_to_bill',
      category: 'rent',
      amount: fromCentavos(autoAppliedCents),
      createdAt: applyTimestamp,
      description: targetActiveBill
        ? `${targetActiveBill.billingPeriod} Bill Settlement (Auto-Applied)`
        : 'Applied to Outstanding Room Balance',
      note: targetActiveBill
        ? `Auto-applied toward Receipt #${targetActiveBill.receiptNo}`
        : 'Automatically applied toward active unpaid balance',
      referenceNo: generateFinancialRefNo('BILL', nowIso, targetActiveBill?.receiptNo.slice(-4)),
      balanceBefore: fromCentavos(afterDepositCents),
      balanceAfter: fromCentavos(finalWalletCents),
      status: 'completed',
      billingPeriod: targetActiveBill?.billingPeriod || billingPeriod,
      billId: targetActiveBill?.id,
      receiptNo: targetActiveBill?.receiptNo,
      idempotencyKey: idempotencyKey ? `${idempotencyKey}:autoapply` : undefined,
    };
    newEntriesNewestFirst.unshift(appliedEntry);

    if (targetActiveBill) {
      updatedBills = activeBills.map((b) => {
        if (b.id !== targetActiveBill.id) return b;
        const nextAdvApplied = fromCentavos(
          toCentavos(b.advanceApplied) + autoAppliedCents
        );
        const nextDepApplied = fromCentavos(
          Math.max(
            toCentavos(b.securityDepositApplied) + toCentavos(nextAdvApplied),
            toCentavos(b.depositApplied) + autoAppliedCents
          )
        );
        const nextTotalDue = fromCentavos(
          Math.max(0, toCentavos(b.totalAmountDue) - autoAppliedCents)
        );
        const nextRemaining = fromCentavos(
          Math.max(0, toCentavos(b.remainingBalance) - autoAppliedCents)
        );
        const nextStatus: BillRecord['status'] =
          nextRemaining <= 0
            ? 'paid'
            : b.amountPaid > 0 || nextDepApplied > 0
              ? 'partial'
              : 'unpaid';

        return {
          ...b,
          advanceApplied: nextAdvApplied,
          depositApplied: nextDepApplied,
          advanceBalanceAfter: fromCentavos(finalWalletCents),
          totalAmountDue: nextTotalDue,
          remainingBalance: nextRemaining,
          status: nextStatus,
          paidAt: nextStatus === 'paid' ? b.paidAt || nowIso : b.paidAt,
          isLocked: nextStatus === 'paid' ? true : b.isLocked,
          updatedAt: nowIso,
        };
      });
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
    const carryOverCents = Math.max(0, toCentavos(b.previousBalanceCarryOver));
    const otherCents = Math.max(0, toCentavos(b.otherCharges));
    const nextGrossCents =
      baseRentCents + nextElecCents + carryOverCents + otherCents;

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
      return {
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
