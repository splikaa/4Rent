import test from 'node:test';
import assert from 'node:assert/strict';
import {
  allocateChargesAndCredits,
  applyRoomSecurityDepositToActiveBills,
  buildRoomSaveAdvanceHistory,
  computeBillComponentBalances,
  executeAdvanceDepositTransaction,
  executeAdvanceRefundTransaction,
  executeGenerateBillTransaction,
  executeRecordPaymentTransaction,
  formatKwhReading,
  fromCentavos,
  getAdvancePolicyAllowance,
  recalculateUnlockedBillsForRates,
  reconcileRoomAdvanceLedger,
  roundKwh,
  toCentavos,
} from '../src/utils/financialEngine';
import {
  calculateBillBreakdown,
  getElectricRateForPeriod,
  recalculateActiveBillsForRates,
} from '../src/utils/billingCalculator';
import type { BillRecord, Room } from '../src/types/rental';

function makeRoom(overrides: Partial<Room> = {}): Room {
  return {
    id: 'room-3',
    name: 'Room 3',
    monthlyRent: 4500,
    lastMeterReading: 3312.0,
    status: 'occupied',
    tenant: {
      id: 'ten-3',
      fullName: 'Mikel Santos',
      phone: '0917-555-0103',
      moveInDate: '2026-10-01',
      dueDayOfMonth: 5,
    },
    unpaidBalance: 0,
    securityDeposit: 4500,
    securityDepositPaid: 0,
    advanceRent: 0,
    advanceHistory: [],
    updatedAt: '2026-11-01T08:00:00.000Z',
    ...overrides,
  };
}

function makeBillDraft(overrides: Partial<BillRecord> = {}): BillRecord {
  return {
    id: 'bill-nov-2026',
    receiptNo: '4R-202611-001',
    roomId: 'room-3',
    roomName: 'Room 3',
    tenantName: 'Mikel Santos',
    billingPeriod: 'Nov 2026',
    createdAt: '2026-11-11T10:00:00.000Z',
    dueDate: '2026-12-05',
    prevReading: 3000,
    currReading: 3950,
    consumptionKwh: 950,
    electricRate: 10,
    electricTotal: 9500,
    baseRent: 4500,
    securityDepositRequired: 4500,
    previousBalanceCarryOver: 0,
    depositApplied: 0,
    totalAmountDue: 14000,
    amountPaid: 0,
    overpaymentToAdvance: 0,
    remainingBalance: 14000,
    status: 'unpaid',
    paymentHistory: [],
    updatedAt: '2026-11-11T10:00:00.000Z',
    ...overrides,
  };
}

test('Integer centavo and kWh helpers eliminate binary float drift', () => {
  assert.equal(toCentavos(0.1) + toCentavos(0.2), 30);
  assert.equal(fromCentavos(toCentavos(0.1) + toCentavos(0.2)), 0.3);
  assert.equal(roundKwh(5520.0 - 5000.0), 520);
  assert.equal(roundKwh(3020.75), 3020.75);
  assert.equal(formatKwhReading(3020.7), '3020.7');
  assert.equal(formatKwhReading(3020.75), '3020.75');

  const calc = calculateBillBreakdown({
    baseRent: 4500,
    prevReading: 0,
    currReading: 3020.7,
    electricRate: 11.84,
    previousBalanceCarryOver: 0,
    depositApplied: 0,
  });
  assert.equal(calc.consumptionKwh, 3020.7);
  assert.equal(calc.electricTotal, 35765.09);
});

test('Scenario A: Advance Credit Surplus (₱20,000 initial vs ₱14,000 charges leaves ₱6,000, Amount Due ₱0)', () => {
  const initialRoom = makeRoom({ advanceRent: 20000, advanceHistory: [] });
  const result = executeGenerateBillTransaction({
    room: initialRoom,
    existingBills: [],
    billDraft: makeBillDraft({
      baseRent: 4500,
      electricTotal: 9500,
    }),
    advanceCapMode: 'unlimited',
    idempotencyKey: 'gen-nov-2026',
  });

  assert.equal(result.ok, true);
  assert.ok(result.createdBill);
  assert.ok(result.updatedRoom);

  const bill = result.createdBill!;
  const room = result.updatedRoom!;

  assert.equal(bill.grossCharges, 14000);
  assert.equal(bill.advanceApplied, 14000);
  assert.equal(bill.totalAmountDue, 0);
  assert.equal(bill.amountPaid, 0); // Must NOT fake cash payment when advance paid the bill
  assert.equal(bill.remainingBalance, 0);
  assert.equal(bill.status, 'paid');
  assert.equal(bill.advanceBalanceBefore, 20000);
  assert.equal(bill.advanceBalanceAfter, 6000);
  assert.equal(room.advanceRent, 6000);
  assert.equal(room.unpaidBalance, 0);

  // Itemized ledger: Nov Rent (-4500: 20000 -> 15500) + Nov Electricity (-9500: 15500 -> 6000)
  assert.equal(result.ledgerEntries.length, 2);
  const newest = result.ledgerEntries[0]; // electricity (applied second)
  const older = result.ledgerEntries[1]; // rent (applied first)
  assert.equal(older.amount, 4500);
  assert.equal(older.balanceBefore, 20000);
  assert.equal(older.balanceAfter, 15500);
  assert.equal(newest.amount, 9500);
  assert.equal(newest.balanceBefore, 15500);
  assert.equal(newest.balanceAfter, 6000);

  // Idempotency guard blocks double-application of same operation key
  const duplicateAttempt = executeGenerateBillTransaction({
    room,
    existingBills: result.archivedPreviousBills,
    billDraft: makeBillDraft({ id: 'bill-nov-2026-retry', baseRent: 4500, electricTotal: 9500 }),
    idempotencyKey: 'gen-nov-2026',
  });
  assert.equal(duplicateAttempt.ok, false);
  assert.equal(duplicateAttempt.duplicate, true);
});

test('Scenario B: Partial Coverage (₱6,000 Advance vs ₱8,500 Charges -> ₱2,500 Net Due -> ₱2,500 Cash Paid)', () => {
  const decRoom = makeRoom({ advanceRent: 6000 });
  const decDraft = makeBillDraft({
    id: 'bill-dec-2026',
    receiptNo: '4R-202612-001',
    billingPeriod: 'Dec 2026',
    baseRent: 4500,
    electricTotal: 4000,
  });

  const genRes = executeGenerateBillTransaction({
    room: decRoom,
    existingBills: [],
    billDraft: decDraft,
    advanceCapMode: 'unlimited',
  });

  assert.equal(genRes.ok, true);
  assert.equal(genRes.createdBill!.grossCharges, 8500);
  assert.equal(genRes.createdBill!.advanceApplied, 6000);
  assert.equal(genRes.createdBill!.totalAmountDue, 2500);
  assert.equal(genRes.createdBill!.remainingBalance, 2500);
  assert.equal(genRes.createdBill!.status, 'partial');
  assert.equal(genRes.createdBill!.paidAt, undefined); // Must NOT set paidAt until fully paid
  assert.equal(genRes.updatedRoom!.advanceRent, 0);

  // Pay remaining ₱2,500 cash
  const payRes = executeRecordPaymentTransaction({
    bill: genRes.createdBill!,
    room: genRes.updatedRoom!,
    paymentAmount: 2500,
    method: 'Cash',
    referenceNo: 'OR-CASH-01',
    idempotencyKey: 'pay-dec-2500',
  });

  assert.equal(payRes.ok, true);
  assert.equal(payRes.overpaymentCredited, 0);
  assert.equal(payRes.updatedBill!.amountPaid, 2500);
  assert.equal(payRes.updatedBill!.remainingBalance, 0);
  assert.equal(payRes.updatedBill!.status, 'paid');
  assert.ok(payRes.updatedBill!.paidAt);
  assert.equal(payRes.updatedRoom!.advanceRent, 0);
  assert.equal(payRes.updatedRoom!.unpaidBalance, 0);
});

test('Scenario C: Cash Overpayment Added to Advance (₱5,000 due, ₱7,000 paid -> +₱2,000 Advance)', () => {
  const room = makeRoom({ advanceRent: 0, unpaidBalance: 5000 });
  const bill = makeBillDraft({
    baseRent: 4500,
    electricTotal: 500,
    grossCharges: 5000,
    totalAmountDue: 5000,
    remainingBalance: 5000,
    amountPaid: 0,
    status: 'unpaid',
  });

  const payRes = executeRecordPaymentTransaction({
    bill,
    room,
    paymentAmount: 7000,
    method: 'GCash',
    referenceNo: 'GCASH-8821',
    advanceCapMode: 'unlimited',
  });

  assert.equal(payRes.ok, true);
  assert.equal(payRes.overpaymentCredited, 2000);
  assert.equal(payRes.updatedBill!.remainingBalance, 0);
  assert.equal(payRes.updatedBill!.overpaymentToAdvance, 2000);
  assert.equal(payRes.updatedBill!.advanceBalanceAfter, 2000);
  assert.equal(payRes.updatedRoom!.advanceRent, 2000);
  assert.equal(payRes.ledgerEntry!.type, 'overpayment_credit');
  assert.equal(payRes.ledgerEntry!.balanceBefore, 0);
  assert.equal(payRes.ledgerEntry!.balanceAfter, 2000);
});

test('Scenario D: Multiple Billing Cycles Carry-Forward Conservation & Idempotent Advance Deposit', () => {
  // Month 0: Tenant deposits ₱20,000 advance wallet credit
  let room = makeRoom({ advanceRent: 0 });
  const depRes = executeAdvanceDepositTransaction({
    room,
    activeBills: [],
    amount: 20000,
    note: 'Prepaid 4-month advance wallet deposit',
    referenceNo: 'DEP-202611-01',
    billingPeriod: 'Nov 2026',
    advanceCapMode: 'unlimited',
    nowIso: '2026-11-01T09:00:00.000Z',
    idempotencyKey: 'dep-20k',
  });
  assert.equal(depRes.ok, true);
  room = depRes.updatedRoom!;
  assert.equal(room.advanceRent, 20000);

  // Month 1 (Nov): Rent 4500 + Elec 9500 = 14000 -> Advance drops to 6000
  const m1 = executeGenerateBillTransaction({
    room,
    existingBills: [],
    billDraft: makeBillDraft({
      id: 'b-m1',
      receiptNo: '4R-202611-001',
      billingPeriod: 'Nov 2026',
      createdAt: '2026-11-11T10:00:00.000Z',
      baseRent: 4500,
      electricTotal: 9500,
    }),
  });
  assert.equal(m1.ok, true);
  room = m1.updatedRoom!;
  assert.equal(room.advanceRent, 6000);

  // Month 2 (Dec): Rent 4500 + Elec 1500 = 6000 -> Advance drops to 0
  const m2 = executeGenerateBillTransaction({
    room,
    existingBills: m1.archivedPreviousBills,
    billDraft: makeBillDraft({
      id: 'b-m2',
      receiptNo: '4R-202612-001',
      billingPeriod: 'Dec 2026',
      createdAt: '2026-12-11T10:00:00.000Z',
      baseRent: 4500,
      electricTotal: 1500,
    }),
  });
  assert.equal(m2.ok, true);
  room = m2.updatedRoom!;
  assert.equal(room.advanceRent, 0);
  assert.equal(m2.createdBill!.remainingBalance, 0);
  assert.equal(m2.createdBill!.status, 'paid');

  // Verify running ledger consistency: every balanceBefore/balanceAfter links seamlessly
  const reconciled = reconcileRoomAdvanceLedger(room);
  const chronological = [...(reconciled.advanceHistory || [])].reverse();
  assert.equal(chronological[0].balanceBefore, 0);
  for (let i = 1; i < chronological.length; i++) {
    assert.equal(chronological[i].balanceBefore, chronological[i - 1].balanceAfter);
  }
  assert.equal(chronological[chronological.length - 1].balanceAfter, 0);
});

test('Scenario E: Advance Refund / Withdrawal Validation Prevents Negative Balance', () => {
  const room = makeRoom({ advanceRent: 6000 });

  // Attempt to withdraw more than available -> blocked
  const overRefund = executeAdvanceRefundTransaction({
    room,
    amount: 7500,
    note: 'Excess refund attempt',
  });
  assert.equal(overRefund.ok, false);
  assert.equal(overRefund.errorCode, 'INSUFFICIENT_ADVANCE_BALANCE');

  // Valid refund of ₱2,000 -> remaining ₱4,000
  const validRefund = executeAdvanceRefundTransaction({
    room,
    amount: 2000,
    note: 'Partial Advance Withdrawal Requested',
    referenceNo: 'REF-202611-01',
    idempotencyKey: 'ref-2k',
  });
  assert.equal(validRefund.ok, true);
  assert.equal(validRefund.updatedRoom!.advanceRent, 4000);
  assert.equal(validRefund.ledgerEntry!.balanceBefore, 6000);
  assert.equal(validRefund.ledgerEntry!.balanceAfter, 4000);

  // Duplicate idempotency key cannot withdraw twice
  const dupRefund = executeAdvanceRefundTransaction({
    room: validRefund.updatedRoom!,
    amount: 2000,
    note: 'Partial Advance Withdrawal Requested',
    idempotencyKey: 'ref-2k',
  });
  assert.equal(dupRefund.ok, false);
  assert.equal(dupRefund.duplicate, true);
  assert.equal(validRefund.updatedRoom!.advanceRent, 4000);
});

test('Policy Audit: Configurable Advance Cap Mode supports both Prepaid Wallet & Optional 1-Month Cap', () => {
  const unlimited = getAdvancePolicyAllowance(4500, 20000, 'unlimited');
  assert.equal(unlimited.isCapped, false);
  assert.equal(unlimited.remainingAllowance, Number.POSITIVE_INFINITY);

  const capped = getAdvancePolicyAllowance(4500, 2000, '1_month');
  assert.equal(capped.isCapped, true);
  assert.equal(capped.maxAllowed, 4500);
  assert.equal(capped.remainingAllowance, 2500);

  const rejectedDeposit = executeAdvanceDepositTransaction({
    room: makeRoom({ monthlyRent: 4500, advanceRent: 2000 }),
    amount: 3000,
    note: 'Too big for 1-month cap',
    advanceCapMode: '1_month',
  });
  assert.equal(rejectedDeposit.ok, false);
  assert.equal(rejectedDeposit.errorCode, 'ADVANCE_CAP_EXCEEDED');
});

test('Receipt Locking & Rate Recalculation preserves settled/locked receipts and restores unused advance', () => {
  const room = makeRoom({ advanceRent: 1000, monthlyRent: 4500 });
  const lockedPaidBill = makeBillDraft({
    id: 'b-locked',
    status: 'paid',
    isLocked: true,
    consumptionKwh: 100,
    electricRate: 11.84,
    electricTotal: 1184,
    totalAmountDue: 5684,
    amountPaid: 5684,
    remainingBalance: 0,
  });
  const activeUnpaidBill = makeBillDraft({
    id: 'b-active',
    receiptNo: '4R-202611-002',
    billingPeriod: 'Nov 2026',
    status: 'partial',
    isLocked: false,
    consumptionKwh: 100,
    electricRate: 20,
    electricTotal: 2000,
    baseRent: 4500,
    grossCharges: 6500,
    advanceApplied: 6000,
    depositApplied: 6000,
    totalAmountDue: 500,
    amountPaid: 0,
    remainingBalance: 500,
  });

  // Rate drops sharply from ₱20 -> ₱10/kWh so grossCharges drops from 6500 -> 5500!
  // Previously 6000 advance was applied; excess 500 must be restored to room wallet!
  const res = recalculateActiveBillsForRates(
    [lockedPaidBill, activeUnpaidBill],
    {
      defaultElectricRate: 10,
      monthlyElectricRates: { '2026-11': 10 },
    },
    [room]
  );

  assert.equal(res.bills[0].electricRate, 11.84); // Locked paid receipt untouched!
  assert.equal(res.bills[0].totalAmountDue, 5684);

  assert.equal(res.bills[1].electricRate, 10);
  assert.equal(res.bills[1].electricTotal, 1000);
  assert.equal(res.bills[1].grossCharges, 5500);
  assert.equal(res.bills[1].advanceApplied, 5500);
  assert.equal(res.bills[1].remainingBalance, 0);
  assert.equal(res.rooms[0].advanceRent, 1500); // 1000 + 500 restored cleanly
});

test('Legacy Ledger Reconciliation backfills missing balanceBefore/balanceAfter/ref/status', () => {
  const legacyRoom = makeRoom({
    advanceRent: 6000,
    advanceHistory: [
      {
        id: 'legacy-use-1',
        type: 'applied_to_bill',
        amount: 14000,
        createdAt: '2026-11-11T10:00:00.000Z',
        note: 'Applied to Receipt #4R-202611-001',
      },
      {
        id: 'legacy-dep-1',
        type: 'manual_deposit',
        amount: 20000,
        createdAt: '2026-11-01T09:00:00.000Z',
        note: 'Advance cash received',
      },
    ],
  });

  const migrated = reconcileRoomAdvanceLedger(legacyRoom);
  const newest = migrated.advanceHistory![0];
  const older = migrated.advanceHistory![1];

  assert.equal(newest.balanceBefore, 20000);
  assert.equal(newest.balanceAfter, 6000);
  assert.equal(newest.status, 'completed');
  assert.ok(newest.referenceNo?.startsWith('BILL-'));

  assert.equal(older.balanceBefore, 0);
  assert.equal(older.balanceAfter, 20000);
  assert.equal(older.status, 'completed');
  assert.ok(older.referenceNo?.startsWith('ADV-'));
});

test('Charge Allocation cleanly separates securityDepositApplied, advanceApplied, and netTotalAmountDue', () => {
  const alloc = allocateChargesAndCredits({
    baseRent: 4500,
    electricTotal: 9500,
    availableSecurityDeposit: 2500,
    availableAdvanceCredit: 20000,
  });
  assert.equal(alloc.grossCharges, 14000);
  assert.equal(alloc.securityDepositApplied, 2500);
  assert.equal(alloc.remainingSecurityDeposit, 0);
  assert.equal(alloc.advanceApplied, 11500);
  assert.equal(alloc.remainingAdvanceCredit, 8500);
  assert.equal(alloc.netTotalAmountDue, 0);
});

test('Partial cash payment keeps paidAt undefined until balance reaches zero', () => {
  const room = makeRoom({ advanceRent: 0, unpaidBalance: 5000 });
  const bill = makeBillDraft({
    id: 'bill-partial-paidat',
    baseRent: 4500,
    electricTotal: 500,
    grossCharges: 5000,
    totalAmountDue: 5000,
    remainingBalance: 5000,
    amountPaid: 0,
    status: 'unpaid',
    paidAt: undefined,
  });

  const partialPay = executeRecordPaymentTransaction({
    bill,
    room,
    paymentAmount: 2000,
    method: 'Cash',
    referenceNo: 'OR-PART-1',
    idempotencyKey: 'pay-partial-1',
  });
  assert.equal(partialPay.ok, true);
  assert.equal(partialPay.updatedBill!.status, 'partial');
  assert.equal(partialPay.updatedBill!.remainingBalance, 3000);
  assert.equal(partialPay.updatedBill!.paidAt, undefined);

  const finalPay = executeRecordPaymentTransaction({
    bill: partialPay.updatedBill!,
    room: partialPay.updatedRoom!,
    paymentAmount: 3000,
    method: 'Cash',
    referenceNo: 'OR-PART-2',
    idempotencyKey: 'pay-partial-2',
  });
  assert.equal(finalPay.ok, true);
  assert.equal(finalPay.updatedBill!.status, 'paid');
  assert.equal(finalPay.updatedBill!.remainingBalance, 0);
  assert.ok(finalPay.updatedBill!.paidAt);
});

test('Advance Deposit auto-apply preserves legacy depositApplied across single and repeated deposits', () => {
  const room = makeRoom({ id: 'room-legacy', advanceRent: 0, unpaidBalance: 4000 });
  const legacyBill = makeBillDraft({
    id: 'bill-legacy-dep',
    roomId: 'room-legacy',
    baseRent: 4500,
    electricTotal: 500,
    grossCharges: 5000,
    securityDepositApplied: undefined,
    advanceApplied: undefined,
    depositApplied: 1000,
    totalAmountDue: 4000,
    remainingBalance: 4000,
    amountPaid: 0,
    status: 'partial',
    isArchived: false,
  });

  const firstDep = executeAdvanceDepositTransaction({
    room,
    activeBills: [legacyBill],
    amount: 1500,
    note: 'First advance top-up',
    idempotencyKey: 'leg-dep-1',
  });
  assert.equal(firstDep.ok, true);
  assert.equal(firstDep.autoAppliedToBill, 1500);
  assert.equal(firstDep.updatedBills[0].advanceApplied, 1500);
  assert.equal(firstDep.updatedBills[0].depositApplied, 2500); // 1000 legacy + 1500 advance
  assert.equal(firstDep.updatedBills[0].totalAmountDue, 2500);
  assert.equal(firstDep.updatedBills[0].remainingBalance, 2500);

  const secondDep = executeAdvanceDepositTransaction({
    room: firstDep.updatedRoom!,
    activeBills: firstDep.updatedBills,
    amount: 500,
    note: 'Second advance top-up',
    idempotencyKey: 'leg-dep-2',
  });
  assert.equal(secondDep.ok, true);
  assert.equal(secondDep.updatedBills[0].advanceApplied, 2000);
  assert.equal(secondDep.updatedBills[0].depositApplied, 3000); // Preserves 1000 legacy + 2000 advance!
  assert.equal(secondDep.updatedBills[0].remainingBalance, 2000);
});

test('Rate Recalculation updates advanceBalanceAfter, credits excess cash overpayment, and accumulates roomUnpaidMap', () => {
  const room = makeRoom({ id: 'room-recalc', advanceRent: 1000, monthlyRent: 4500 });
  const lockedUnpaidBill = makeBillDraft({
    id: 'b-locked-unpaid',
    roomId: 'room-recalc',
    billingPeriod: 'Oct 2026',
    status: 'unpaid',
    isLocked: true,
    isArchived: false,
    remainingBalance: 1200,
    totalAmountDue: 1200,
    electricRate: 12,
  });
  const unlockedBill = makeBillDraft({
    id: 'b-unlocked-overpaid',
    roomId: 'room-recalc',
    receiptNo: '4R-202611-009',
    billingPeriod: 'Nov 2026',
    status: 'partial',
    isLocked: false,
    isArchived: false,
    consumptionKwh: 100,
    electricRate: 20,
    electricTotal: 2000,
    baseRent: 4500,
    grossCharges: 6500,
    advanceApplied: 5000,
    depositApplied: 5000,
    totalAmountDue: 1500,
    amountPaid: 1000, // Cash paid ₱1,000; remaining ₱500
    remainingBalance: 500,
    advanceBalanceBefore: 6000,
    advanceBalanceAfter: 1000,
  });

  // Rate drops from 20 -> 5/kWh -> elec drops 2000 -> 500 -> gross drops 6500 -> 5000.
  // Advance stays 5000 applied, totalDue drops 1500 -> 0, so already-paid ₱1,000 cash becomes ₱1,000 advance credit!
  const res = recalculateActiveBillsForRates(
    [lockedUnpaidBill, unlockedBill],
    {
      defaultElectricRate: 5,
      monthlyElectricRates: { '2026-11': 5 },
    },
    [room]
  );

  assert.equal(res.bills[1].totalAmountDue, 0);
  assert.equal(res.bills[1].remainingBalance, 0);
  assert.equal(res.bills[1].status, 'paid');
  assert.equal(res.bills[1].overpaymentToAdvance, 1000);
  assert.equal(res.bills[1].advanceBalanceAfter, 2000); // 1000 initial + 1000 excess cash credit
  assert.equal(res.rooms[0].advanceRent, 2000);
  // Locked Oct bill (1200) + recalculated Nov bill (0) accumulated accurately in roomUnpaidMap!
  assert.equal(res.roomUnpaidMap['room-recalc'], 1200);

  // Also verify advanceBalanceAfter updates when advRestoredCents > 0
  const room2 = makeRoom({ id: 'room-restore', advanceRent: 500, monthlyRent: 4500 });
  const advRestoreBill = makeBillDraft({
    id: 'b-adv-restore',
    roomId: 'room-restore',
    receiptNo: '4R-202611-010',
    billingPeriod: 'Nov 2026',
    status: 'partial',
    isLocked: false,
    consumptionKwh: 100,
    electricRate: 20,
    electricTotal: 2000,
    baseRent: 4500,
    grossCharges: 6500,
    advanceApplied: 6000,
    depositApplied: 6000,
    totalAmountDue: 500,
    amountPaid: 0,
    remainingBalance: 500,
    advanceBalanceAfter: 500,
  });
  const res2 = recalculateActiveBillsForRates(
    [advRestoreBill],
    {
      defaultElectricRate: 10,
      monthlyElectricRates: { '2026-11': 10 },
    },
    [room2]
  );
  assert.equal(res2.bills[0].advanceApplied, 5500);
  assert.equal(res2.bills[0].advanceBalanceAfter, 1000); // 500 + 500 restored
  assert.equal(res2.rooms[0].advanceRent, 1000);
});

test('Advance Deposit prioritizes activeReceiptId, spans multiple unpaid bills, and falls back to room.unpaidBalance', () => {
  const olderBill = makeBillDraft({
    id: 'bill-old',
    roomId: 'room-multi',
    receiptNo: '4R-202610-001',
    billingPeriod: 'Oct 2026',
    totalAmountDue: 1000,
    remainingBalance: 1000,
    status: 'unpaid',
    isArchived: false,
  });
  const primaryActiveBill = makeBillDraft({
    id: 'bill-active',
    roomId: 'room-multi',
    receiptNo: '4R-202611-001',
    billingPeriod: 'Nov 2026',
    totalAmountDue: 1500,
    remainingBalance: 1500,
    status: 'unpaid',
    isArchived: false,
  });

  const room = makeRoom({
    id: 'room-multi',
    activeReceiptId: 'bill-active',
    unpaidBalance: 2500,
    advanceRent: 0,
  });

  // olderBill sits first in array, but activeReceiptId ('bill-active') must settle before olderBill
  const res = executeAdvanceDepositTransaction({
    room,
    activeBills: [olderBill, primaryActiveBill],
    amount: 2000,
    note: 'Multi-bill settlement deposit',
    nowIso: '2026-11-12T10:00:00.000Z',
    idempotencyKey: 'multi-dep-1',
  });

  assert.equal(res.ok, true);
  assert.equal(res.autoAppliedToBill, 2000);
  const updatedOld = res.updatedBills.find((b) => b.id === 'bill-old')!;
  const updatedPrimary = res.updatedBills.find((b) => b.id === 'bill-active')!;
  assert.equal(updatedPrimary.remainingBalance, 0);
  assert.equal(updatedPrimary.status, 'paid');
  assert.equal(updatedOld.remainingBalance, 500);
  assert.equal(updatedOld.status, 'partial');
  assert.equal(res.updatedRoom!.unpaidBalance, 500);
  assert.equal(res.updatedRoom!.advanceRent, 0);

  // Fallback when activeBills has no matching bill records for the room
  const roomFallback = makeRoom({
    id: 'room-fallback',
    unpaidBalance: 1200,
    advanceRent: 0,
  });
  const fallbackRes = executeAdvanceDepositTransaction({
    room: roomFallback,
    activeBills: [],
    amount: 2000,
    note: 'Deposit against room unpaid fallback',
    nowIso: '2026-11-12T10:05:00.000Z',
    idempotencyKey: 'fallback-dep-1',
  });
  assert.equal(fallbackRes.ok, true);
  assert.equal(fallbackRes.autoAppliedToBill, 1200);
  assert.equal(fallbackRes.updatedRoom!.unpaidBalance, 0);
  assert.equal(fallbackRes.updatedRoom!.advanceRent, 800);
});

test('buildRoomSaveAdvanceHistory records opening, vacant-to-occupied move-in, occupied edits, and vacating', () => {
  const nowIso = '2026-11-15T10:00:00.000Z';

  // Case 1: Existing vacant room moves in an occupied tenant with ₱3,000 advance
  const vacantToOccupied = buildRoomSaveAdvanceHistory({
    roomName: 'Room 2',
    nextStatus: 'occupied',
    previousStatus: 'vacant',
    previousAdvanceRent: 0,
    nextBaseAdvance: 3000,
    excessDepositToAdvance: 0,
    paidSecurityDeposit: 4500,
    requiredSecurityDeposit: 4500,
    previousHistory: [],
    nowIso,
  });
  assert.equal(vacantToOccupied.length, 1);
  assert.equal(vacantToOccupied[0].type, 'manual_deposit');
  assert.equal(vacantToOccupied[0].balanceBefore, 0);
  assert.equal(vacantToOccupied[0].balanceAfter, 3000);

  // Case 2: Occupied room edited upward (+1500 manual edit + 500 excess deposit)
  const editedUp = buildRoomSaveAdvanceHistory({
    roomName: 'Room 2',
    nextStatus: 'occupied',
    previousStatus: 'occupied',
    previousAdvanceRent: 2000,
    nextBaseAdvance: 3500,
    excessDepositToAdvance: 500,
    paidSecurityDeposit: 5000,
    requiredSecurityDeposit: 4500,
    previousHistory: vacantToOccupied,
    nowIso,
  });
  assert.equal(editedUp.length, vacantToOccupied.length + 2);
  assert.equal(editedUp[0].type, 'overpayment_credit');
  assert.equal(editedUp[0].balanceBefore, 3500);
  assert.equal(editedUp[0].balanceAfter, 4000);
  assert.equal(editedUp[1].type, 'adjustment');
  assert.equal(editedUp[1].amount, 1500);
  assert.equal(editedUp[1].balanceBefore, 2000);
  assert.equal(editedUp[1].balanceAfter, 3500);

  // Case 3: Occupied room edited downward (2000 -> 1200) and reconciled
  const editedDown = buildRoomSaveAdvanceHistory({
    roomName: 'Room 2',
    nextStatus: 'occupied',
    previousStatus: 'occupied',
    previousAdvanceRent: 2000,
    nextBaseAdvance: 1200,
    excessDepositToAdvance: 0,
    paidSecurityDeposit: 4500,
    requiredSecurityDeposit: 4500,
    previousHistory: [
      {
        id: 'adv-prev-1',
        type: 'manual_deposit',
        amount: 2000,
        createdAt: '2026-10-01T00:00:00.000Z',
        note: 'Initial deposit',
      },
    ],
    nowIso,
  });
  assert.equal(editedDown[0].type, 'adjustment');
  assert.equal(editedDown[0].amount, 800);
  assert.equal(editedDown[0].balanceBefore, 2000);
  assert.equal(editedDown[0].balanceAfter, 1200);
  const reconciled = reconcileRoomAdvanceLedger(
    makeRoom({ advanceRent: 1200, advanceHistory: editedDown })
  );
  assert.equal(reconciled.advanceRent, 1200);
  assert.equal(reconciled.advanceHistory![1].balanceAfter, 2000);

  // Case 4: Setting status to vacant clears advance ledger
  const vacated = buildRoomSaveAdvanceHistory({
    roomName: 'Room 2',
    nextStatus: 'vacant',
    previousStatus: 'occupied',
    previousAdvanceRent: 1200,
    nextBaseAdvance: 0,
    excessDepositToAdvance: 0,
    paidSecurityDeposit: 0,
    requiredSecurityDeposit: 4500,
    previousHistory: editedDown,
    nowIso,
  });
  assert.deepEqual(vacated, []);
});

test('applyRoomSecurityDepositToActiveBills deducts paid deposit across active bills in centavos', () => {
  const bOther = makeBillDraft({
    id: 'b-sec-other',
    roomId: 'room-sec',
    receiptNo: '4R-202610-001',
    totalAmountDue: 1000,
    remainingBalance: 1000,
    status: 'unpaid',
    isArchived: false,
  });
  const bActive = makeBillDraft({
    id: 'b-sec-active',
    roomId: 'room-sec',
    receiptNo: '4R-202611-001',
    totalAmountDue: 2500,
    remainingBalance: 2500,
    status: 'unpaid',
    isArchived: false,
  });

  const res = applyRoomSecurityDepositToActiveBills({
    roomId: 'room-sec',
    status: 'occupied',
    activeReceiptId: 'b-sec-active',
    availableSecurityDepositPaid: 3000,
    roomUnpaidBalance: 3500,
    bills: [bOther, bActive],
    nowIso: '2026-11-15T10:00:00.000Z',
  });

  assert.equal(res.depositUsedOnActiveBills, 3000);
  assert.equal(res.remainingSecurityDepositPaid, 0);
  assert.equal(res.finalRoomUnpaidBalance, 500);
  const updatedActive = res.bills.find((b) => b.id === 'b-sec-active')!;
  const updatedOther = res.bills.find((b) => b.id === 'b-sec-other')!;
  assert.equal(updatedActive.remainingBalance, 0);
  assert.equal(updatedActive.status, 'paid');
  assert.equal(updatedActive.securityDepositApplied, 2500);
  assert.ok(updatedActive.paidAt);
  assert.equal(updatedOther.remainingBalance, 500);
  assert.equal(updatedOther.status, 'partial');
  assert.equal(updatedOther.securityDepositApplied, 500);
});

test('Component balances sync when Advance or Security Deposit credits auto-apply to active bills with explicit component fields', () => {
  const room = makeRoom({ id: 'room-comp-sync', advanceRent: 0, securityDepositPaid: 0 });
  const genRes = executeGenerateBillTransaction({
    room,
    existingBills: [],
    billDraft: makeBillDraft({
      id: 'b-comp-sync',
      roomId: 'room-comp-sync',
      baseRent: 4500,
      electricTotal: 1500,
      amountPaid: 0,
    }),
  });
  assert.equal(genRes.ok, true);
  const issuedBill = genRes.createdBill!;
  assert.equal(issuedBill.rentRemaining, 4500);
  assert.equal(issuedBill.electricityRemaining, 1500);

  // 1. Auto-apply ₱5,000 advance deposit (covers all ₱4,500 rent + ₱500 of electricity; ₱1,000 electricity remains)
  const partialAdvRes = executeAdvanceDepositTransaction({
    room: genRes.updatedRoom!,
    activeBills: [issuedBill],
    amount: 5000,
    note: 'Partial advance auto-apply',
  });
  assert.equal(partialAdvRes.ok, true);
  const afterPartialAdv = partialAdvRes.updatedBills[0];
  assert.equal(afterPartialAdv.remainingBalance, 1000);
  assert.equal(afterPartialAdv.rentRemaining, 0);
  assert.equal(afterPartialAdv.electricityRemaining, 1000);
  const compPartial = computeBillComponentBalances(afterPartialAdv);
  assert.equal(compPartial.rentRemaining, 0);
  assert.equal(compPartial.electricityRemaining, 1000);
  assert.equal(compPartial.outstandingBalance, 1000);
  assert.equal(compPartial.hasUnpaidElectricity, true);

  // 2. Apply ₱1,000 security deposit to settle the remaining ₱1,000 electricity charge
  const secRes = applyRoomSecurityDepositToActiveBills({
    roomId: 'room-comp-sync',
    status: 'occupied',
    activeReceiptId: afterPartialAdv.id,
    availableSecurityDepositPaid: 1000,
    roomUnpaidBalance: 1000,
    bills: [afterPartialAdv],
  });
  const settledBill = secRes.bills[0];
  assert.equal(settledBill.status, 'paid');
  assert.equal(settledBill.remainingBalance, 0);
  assert.equal(settledBill.rentRemaining, 0);
  assert.equal(settledBill.electricityRemaining, 0);
  const compSettled = computeBillComponentBalances(settledBill);
  assert.equal(compSettled.outstandingBalance, 0);
  assert.equal(compSettled.hasUnpaidElectricity, false);
  assert.equal(compSettled.isRentPaid, true);
  assert.equal(compSettled.isElectricityPaid, true);
});

