import React, { useState } from 'react';
import {
  Archive,
  ArrowLeft,
  Camera,
  CheckCircle2,
  CreditCard,
  MessageCircle,
  Printer,
  ReceiptText,
  X,
  Zap,
} from 'lucide-react';
import {
  AdvanceCapPolicyMode,
  BillRecord,
  ComponentPaymentAllocation,
  PaymentAllocationTarget,
  Room,
} from '../../types/rental';
import {
  formatPeso,
  formatPesoPrivacy,
  getCurrentCalendarPeriodLabel,
  getRoomMonthlyPaymentStatus,
  normalizeMonthKey,
  roundCurrency,
} from '../../utils/billingCalculator';
import {
  computeBillComponentBalances,
  formatKwhReading,
  getAdvancePolicyAllowance,
} from '../../utils/financialEngine';

interface AllPaymentsViewProps {
  bills: BillRecord[];
  rooms?: Room[];
  advanceCapMode?: AdvanceCapPolicyMode;
  privacyMaskEnabled?: boolean;
  onBack: () => void;
  onSelectBillForReceipt: (bill: BillRecord) => void;
  onRecordPayment: (
    billId: string,
    amount: number,
    method: 'Cash' | 'GCash' | 'Maya' | 'Bank Transfer',
    referenceNo?: string,
    onCommitted?: () => void,
    paymentOptions?: {
      allocationTarget?: PaymentAllocationTarget;
      customAllocation?: Partial<ComponentPaymentAllocation>;
    }
  ) => void;
  onOpenAdvanceModal?: (room: Room) => void;
  onArchiveBill: (billId: string) => void;
  onOpenNewBillScanner: () => void;
  onOpenArchiveCenter: () => void;
}

export const AllPaymentsView: React.FC<AllPaymentsViewProps> = ({
  bills,
  rooms = [],
  advanceCapMode = 'unlimited',
  privacyMaskEnabled = false,
  onBack,
  onSelectBillForReceipt,
  onRecordPayment,
  onOpenAdvanceModal,
  onArchiveBill,
  onOpenNewBillScanner,
  onOpenArchiveCenter,
}) => {
  const [filter, setFilter] = useState<'all' | 'this_month' | 'paid' | 'unpaid'>('all');
  const [payingBill, setPayingBill] = useState<BillRecord | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [payAllocationTarget, setPayAllocationTarget] =
    useState<PaymentAllocationTarget>('auto');
  const [customRentPay, setCustomRentPay] = useState('');
  const [customElecPay, setCustomElecPay] = useState('');
  const [customPenaltyPay, setCustomPenaltyPay] = useState('');
  const [payError, setPayError] = useState<string | null>(null);
  const [payMethod, setPayMethod] = useState<
    'Cash' | 'GCash' | 'Maya' | 'Bank Transfer'
  >('GCash');
  const [payRef, setPayRef] = useState('');

  const currentPeriodLabel = getCurrentCalendarPeriodLabel();
  const currentMonthKey = normalizeMonthKey(currentPeriodLabel);
  const occupiedRooms = rooms.filter((r) => !r.isArchived && r.status === 'occupied');
  const monthlyRoomStatuses = occupiedRooms.map((room) => ({
    room,
    summary: getRoomMonthlyPaymentStatus(room, bills, currentMonthKey),
  }));
  const paidThisMonthCount = monthlyRoomStatuses.filter(
    (item) => item.summary.status === 'paid'
  ).length;

  // Active receipts (1 per room)
  const activeBills = bills.filter((b) => !b.isArchived);

  const filteredBills = activeBills.filter((b) => {
    if (filter === 'this_month') {
      return normalizeMonthKey(b.billingPeriod) === currentMonthKey;
    }
    if (filter === 'paid') return b.status === 'paid';
    if (filter === 'unpaid')
      return b.status === 'unpaid' || b.status === 'partial';
    return true;
  });

  const totalPaidRevenue = bills.reduce(
    (sum, b) => sum + (Number(b.amountPaid) || 0),
    0
  );
  const totalUnpaidDue = activeBills.reduce(
    (sum, b) => sum + (Number(b.remainingBalance) || 0),
    0
  );

  const openPaymentDialog = (bill: BillRecord) => {
    const comp = computeBillComponentBalances(bill);
    setPayingBill(bill);
    setPayAllocationTarget('auto');
    setPayAmount(String(bill.remainingBalance));
    setCustomRentPay(String(comp.rentRemaining));
    setCustomElecPay(String(comp.electricityRemaining));
    setCustomPenaltyPay(String(comp.latePenaltyRemaining));
    setPayError(null);
    setPayMethod('GCash');
    setPayRef('');
  };

  const payingBillComponents = payingBill
    ? computeBillComponentBalances(payingBill)
    : null;

  const payingRoom = payingBill
    ? rooms.find((r) => r.id === payingBill.roomId)
    : undefined;
  const advanceAllowanceInfo = payingRoom
    ? getAdvancePolicyAllowance(
        payingRoom.monthlyRent,
        payingRoom.advanceRent || 0,
        advanceCapMode
      )
    : getAdvancePolicyAllowance(
        payingBill?.baseRent || 0,
        0,
        advanceCapMode
      );
  const remainingAdvanceAllowance = advanceAllowanceInfo.remainingAllowance;
  const isAdvanceCapped = advanceAllowanceInfo.isCapped;
  const maxPayableWithAdvanceCap =
    payingBill && isAdvanceCapped
      ? roundCurrency((payingBill.remainingBalance || 0) + remainingAdvanceAllowance)
      : Number.POSITIVE_INFINITY;

  const handleConfirmPayment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!payingBill) return;
    setPayError(null);

    let amt = parseFloat(payAmount) || 0;
    let customAllocation: Partial<ComponentPaymentAllocation> | undefined;
    if (payAllocationTarget === 'custom') {
      const rAmt = Math.max(0, parseFloat(customRentPay) || 0);
      const eAmt = Math.max(0, parseFloat(customElecPay) || 0);
      const pAmt = Math.max(0, parseFloat(customPenaltyPay) || 0);
      amt = roundCurrency(rAmt + eAmt + pAmt);
      customAllocation = {
        rentPaid: rAmt,
        electricityPaid: eAmt,
        latePenaltyPaid: pAmt,
      };
    }

    if (amt <= 0) {
      setPayError('Enter a payment amount greater than ₱0.00.');
      return;
    }
    const excess = roundCurrency(
      Math.max(0, amt - (payingBill.remainingBalance || 0))
    );
    if (isAdvanceCapped && excess > remainingAdvanceAllowance + 0.01) {
      setPayError(
        `Advance credit is limited to 1 month of rent under active policy. Maximum payable now: ${formatPeso(
          maxPayableWithAdvanceCap
        )}.`
      );
      return;
    }
    onRecordPayment(
      payingBill.id,
      amt,
      payMethod,
      payRef.trim() || undefined,
      () => setPayingBill(null),
      {
        allocationTarget: payAllocationTarget,
        customAllocation,
      }
    );
  };

  const enteredPayNum =
    payAllocationTarget === 'custom'
      ? roundCurrency(
          Math.max(0, parseFloat(customRentPay) || 0) +
            Math.max(0, parseFloat(customElecPay) || 0) +
            Math.max(0, parseFloat(customPenaltyPay) || 0)
        )
      : parseFloat(payAmount) || 0;
  const excessOverpayment =
    payingBill && enteredPayNum > payingBill.remainingBalance
      ? Math.round((enteredPayNum - payingBill.remainingBalance) * 100) / 100
      : 0;

  return (
    <div className="min-h-screen flex flex-col bg-transparent pb-32 animate-view-enter">
      {/* Top Bar */}
      <header className="sticky top-0 z-20 bg-[#111722]/90 backdrop-blur-xl border-b border-[#232E42] px-5 sm:px-8 h-18 flex items-center justify-between">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to Dashboard"
          className="w-11 h-11 rounded-2xl bg-[#172030] hover:bg-[#1E293D] border border-[#26334B] flex items-center justify-center text-slate-200 transition cursor-pointer btn-fluid"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>

        <div className="text-center">
          <h1 className="text-lg sm:text-xl font-extrabold text-white tracking-tight">
            Payment History
          </h1>
          <p className="text-[11px] text-slate-400 hidden sm:block">
            1 room = 1 active receipt
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={onOpenArchiveCenter}
            className="px-3.5 py-2.5 rounded-2xl bg-[#172030] hover:bg-[#1E293D] border border-[#28354E] text-xs font-bold text-slate-300 flex items-center gap-1.5 cursor-pointer btn-fluid"
          >
            <Archive className="w-3.5 h-3.5 text-amber-400" />
            <span className="hidden sm:inline">Archived Receipts</span>
          </button>
          <button
            type="button"
            onClick={onOpenNewBillScanner}
            className="px-4 py-2.5 rounded-2xl bg-[#F59E0B] hover:bg-[#FBBF24] text-slate-950 font-extrabold text-xs flex items-center gap-1.5 transition cursor-pointer btn-fluid"
          >
            <Camera className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Generate Bill</span>
          </button>
        </div>
      </header>

      <div className="flex-1 w-full max-w-5xl mx-auto px-5 sm:px-8 pt-8 flex flex-col">
        {/* Filter Pills + Record Count Row */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <div className="flex flex-wrap items-center gap-2">
            {(
              [
                { id: 'all', label: 'All' },
                { id: 'this_month', label: `This Month (${currentPeriodLabel})` },
                { id: 'paid', label: 'Paid' },
                { id: 'unpaid', label: 'Unpaid' },
              ] as const
            ).map((pill) => {
              const active = filter === pill.id;
              return (
                <button
                  key={pill.id}
                  type="button"
                  onClick={() => setFilter(pill.id)}
                  className={`px-4 py-2 rounded-full text-xs sm:text-sm font-extrabold transition cursor-pointer btn-fluid ${
                    active
                      ? 'bg-[#F59E0B] text-slate-950 shadow-lg shadow-amber-500/20'
                      : 'bg-[#161E2E] text-slate-400 hover:text-white border border-[#26324A]'
                  }`}
                >
                  {pill.label}
                </button>
              );
            })}
          </div>

          <span className="text-xs sm:text-sm font-semibold text-slate-400 font-mono-num">
            {filteredBills.length}{' '}
            {filteredBills.length === 1 ? 'record' : 'records'}
          </span>
        </div>

        {/* Current Month Tenant Payment Tracker */}
        {monthlyRoomStatuses.length > 0 && (
          <div className="surface-card rounded-3xl p-5 sm:p-6 mb-6 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-sm sm:text-base font-extrabold text-white">
                  {currentPeriodLabel} Payment Status
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Rooms paid for {currentPeriodLabel}
                </p>
              </div>
              <span className="px-3 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/35 text-xs font-extrabold text-emerald-300 font-mono-num">
                {paidThisMonthCount} of {monthlyRoomStatuses.length} Paid
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {monthlyRoomStatuses.map(({ room, summary }) => (
                <button
                  key={room.id}
                  type="button"
                  onClick={() =>
                    summary.matchingBill
                      ? onSelectBillForReceipt(summary.matchingBill)
                      : onOpenNewBillScanner()
                  }
                  className="rounded-2xl bg-[#0D121B] hover:bg-[#151E2E] border border-[#222E44] p-3 text-left flex items-center justify-between gap-2.5 transition cursor-pointer"
                >
                  <div className="min-w-0">
                    <div className="text-xs font-extrabold text-white leading-snug">
                      {room.name} • {room.tenant?.fullName || 'Occupied'}
                    </div>
                    <div className="text-[11px] text-slate-400 mt-0.5 leading-snug">
                      {summary.detailText}
                    </div>
                  </div>
                  <span
                    className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold shrink-0 border ${
                      summary.status === 'paid'
                        ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/35'
                        : summary.status === 'partial'
                        ? 'bg-amber-500/15 text-amber-300 border-amber-500/35'
                        : summary.status === 'unpaid'
                        ? 'bg-rose-500/15 text-rose-300 border-rose-500/35'
                        : 'bg-slate-800/80 text-slate-300 border-slate-700'
                    }`}
                  >
                    {summary.status === 'paid'
                      ? 'Paid ✓'
                      : summary.status === 'partial'
                      ? 'Partial'
                      : summary.status === 'unpaid'
                      ? 'Unpaid'
                      : 'Not Billed'}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Summary Card: TOTAL PAID (REVENUE) & TOTAL UNPAID (DUE) */}
        <div className="surface-card rounded-3xl p-5 sm:p-7 grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6 mb-8">
          <div>
            <div className="text-[11px] sm:text-xs font-bold uppercase tracking-wider text-slate-400">
              TOTAL PAID (REVENUE)
            </div>
            <div className="text-2xl sm:text-3xl font-extrabold text-[#22C55E] font-mono-num mt-1.5 break-words">
              {formatPesoPrivacy(totalPaidRevenue, privacyMaskEnabled)}
            </div>
          </div>

          <div className="border-t sm:border-t-0 sm:border-l border-[#26334D] pt-4 sm:pt-0 sm:pl-6">
            <div className="text-[11px] sm:text-xs font-bold uppercase tracking-wider text-slate-400">
              TOTAL UNPAID (DUE)
            </div>
            <div
              className={`text-2xl sm:text-3xl font-extrabold font-mono-num mt-1.5 break-words ${
                totalUnpaidDue > 0 ? 'text-amber-400' : 'text-slate-400'
              }`}
            >
              {formatPesoPrivacy(totalUnpaidDue, privacyMaskEnabled)}
            </div>
          </div>
        </div>

        {/* Empty State OR Active Room Receipts List */}
        {filteredBills.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center py-20 select-none">
            <div className="w-20 h-20 rounded-[24px] bg-[#1A2232] border border-[#28334A] flex items-center justify-center mb-5">
              <ReceiptText className="w-10 h-10 text-slate-500" />
            </div>
            <h2 className="text-xl font-extrabold text-white">
              No payments yet
            </h2>
            <p className="text-sm text-slate-400 mt-1.5">
              Generate a bill to see records here
            </p>
          </div>
        ) : (
          <div className="space-y-5">
            {filteredBills.map((bill) => {
              const isPaid = bill.status === 'paid';
              const isPartial = bill.status === 'partial';
              const comp = computeBillComponentBalances(bill);
              const rentPaidWhileElecUnpaid =
                comp.rentRemaining <= 0.005 && comp.electricityRemaining > 0.005;

              return (
                <div
                  key={bill.id}
                  className="surface-card surface-card-interactive rounded-3xl p-6"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#222E44]">
                    <div>
                      <div className="flex flex-wrap items-center gap-2.5">
                        <span className="text-lg sm:text-xl font-extrabold text-white">
                          {bill.roomName}
                        </span>
                        <span className="text-xs font-mono-num px-3 py-1 rounded-xl bg-[#0D121B] text-amber-400 border border-[#243047]">
                          Room Receipt #{bill.receiptNo}
                        </span>
                        <span
                          className={`px-3 py-1 rounded-full text-xs font-bold uppercase ${
                            isPaid
                              ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/35'
                              : isPartial
                              ? 'bg-amber-500/15 text-amber-400 border border-amber-500/35'
                              : 'bg-red-500/15 text-red-400 border border-red-500/35'
                          }`}
                        >
                          {isPaid
                            ? `Paid for ${bill.billingPeriod}`
                            : isPartial
                            ? `Partial • ${bill.billingPeriod}`
                            : `Unpaid • ${bill.billingPeriod}`}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 mt-1.5">
                        Tenant:{' '}
                        <strong className="text-slate-200">
                          {bill.tenantName}
                        </strong>{' '}
                        • Period: {bill.billingPeriod} • Payment Period: 1st-10th (Due:{' '}
                        {new Date(bill.dueDate).toLocaleDateString('en-PH')} • Late from 11th)
                      </p>
                      {rentPaidWhileElecUnpaid && (
                        <div className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-amber-500/15 border border-amber-500/40 text-[11px] font-bold text-amber-300">
                          <Zap className="w-3.5 h-3.5 shrink-0" />
                          <span>
                            Rent Paid • Electricity Balance Still Unpaid ({formatPeso(comp.electricityRemaining)}) • Bill Not Completed
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="text-left sm:text-right">
                      <div className="text-xs text-slate-400">
                        Total Amount Due
                      </div>
                      <div className="text-xl font-extrabold text-white font-mono-num">
                        {formatPesoPrivacy(
                          bill.totalAmountDue,
                          privacyMaskEnabled
                        )}
                      </div>
                      {bill.remainingBalance > 0 ? (
                        <div className="text-xs font-bold text-amber-400 font-mono-num mt-0.5">
                          Outstanding Balance:{' '}
                          {formatPesoPrivacy(
                            bill.remainingBalance,
                            privacyMaskEnabled
                          )}
                        </div>
                      ) : (
                        <div className="text-xs font-bold text-emerald-400 font-mono-num mt-0.5">
                          Paid in Full ({bill.paymentMethod || 'Cash'})
                        </div>
                      )}
                      {bill.overpaymentToAdvance > 0 && (
                        <div className="text-[11px] font-bold text-emerald-300 font-mono-num mt-0.5">
                          +{formatPeso(bill.overpaymentToAdvance)} Credited to
                          Advance Balance
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Dual Sub-Meter & Separate Payment Component Breakdown Row */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5 py-4 text-xs">
                    <div className="rounded-2xl bg-[#0D121B] p-3 border border-[#202B40]">
                      <span className="text-slate-400 block text-[11px]">
                        Sub-Meter (Prev → Curr)
                      </span>
                      <span className="font-mono-num font-bold text-slate-200 mt-0.5 block">
                        {formatKwhReading(bill.prevReading)} →{' '}
                        {formatKwhReading(bill.currReading)} kWh
                      </span>
                      <span className="text-[10px] text-amber-400 font-mono-num block mt-0.5">
                        Δ {formatKwhReading(bill.consumptionKwh)} kWh @ {formatPeso(bill.electricRate)}/kWh
                      </span>
                    </div>
                    <div className="rounded-2xl bg-[#0D121B] p-3 border border-[#202B40]">
                      <span className="text-slate-400 block text-[11px]">
                        Rent Payment{bill.isProrated ? ` (${bill.occupiedDays}/${bill.daysInBillingMonth}d)` : ''}
                      </span>
                      <span className="font-mono-num font-bold text-white mt-0.5 block">
                        {formatPesoPrivacy(bill.baseRent, privacyMaskEnabled)}
                      </span>
                      <span
                        className={`text-[10px] font-bold block mt-0.5 ${
                          comp.rentRemaining > 0 ? 'text-amber-300' : 'text-emerald-400'
                        }`}
                      >
                        {comp.rentRemaining > 0
                          ? `Paid ${formatPeso(comp.rentPaid)} • Due ${formatPeso(comp.rentRemaining)}`
                          : 'Rent Paid ✓'}
                      </span>
                    </div>
                    <div className="rounded-2xl bg-[#0D121B] p-3 border border-[#202B40]">
                      <span className="text-slate-400 block text-[11px]">
                        Electricity Payment
                      </span>
                      <span className="font-mono-num font-bold text-amber-400 flex items-center gap-1 mt-0.5">
                        <Zap className="w-3 h-3" />
                        {formatPeso(bill.electricTotal)}
                      </span>
                      <span
                        className={`text-[10px] font-bold block mt-0.5 ${
                          comp.electricityRemaining > 0 ? 'text-rose-400' : 'text-emerald-400'
                        }`}
                      >
                        {comp.electricityRemaining > 0
                          ? `Paid ${formatPeso(comp.electricityPaid)} • Unpaid ${formatPeso(comp.electricityRemaining)}`
                          : 'Electricity Paid ✓'}
                      </span>
                    </div>
                    <div className="rounded-2xl bg-[#0D121B] p-3 border border-[#202B40]">
                      <span className="text-slate-400 block text-[11px]">
                        {(bill.latePenalty || 0) > 0
                          ? 'Late Charges / Collected'
                          : 'Total Collected'}
                      </span>
                      <span className="font-mono-num font-bold text-emerald-400 mt-0.5 block">
                        {formatPesoPrivacy(bill.amountPaid, privacyMaskEnabled)}
                      </span>
                      {(bill.latePenalty || 0) > 0 && (
                        <span className="text-[10px] font-bold text-rose-300 block mt-0.5">
                          Late Charges: {formatPeso(bill.latePenalty || 0)}
                          {comp.latePenaltyRemaining > 0
                            ? ` (${formatPeso(comp.latePenaltyRemaining)} due)`
                            : ' (Paid)'}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="pt-4 border-t border-[#222E44] flex flex-wrap items-center justify-between gap-2.5">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <button
                        type="button"
                        onClick={() => onSelectBillForReceipt(bill)}
                        className="px-4 py-2.5 rounded-2xl bg-[#F59E0B] hover:bg-[#FBBF24] text-slate-950 font-extrabold text-xs flex items-center gap-1.5 transition cursor-pointer btn-fluid"
                      >
                        <Printer className="w-3.5 h-3.5" />
                        <span>Official Receipt (2 Sub-Meter Proofs)</span>
                      </button>

                      {(() => {
                        const targetRoom = rooms.find(
                          (r) => r.id === bill.roomId && !r.isArchived
                        );
                        const hasPaidOverallBalance =
                          bill.status === 'paid' &&
                          (bill.remainingBalance || 0) <= 0 &&
                          Boolean(targetRoom && (targetRoom.unpaidBalance || 0) <= 0);

                        return (
                          <>
                            {(bill.remainingBalance > 0 || hasPaidOverallBalance) && (
                              <button
                                type="button"
                                onClick={() => openPaymentDialog(bill)}
                                className="px-4 py-2.5 rounded-2xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/35 text-emerald-300 font-bold text-xs flex items-center gap-1.5 transition cursor-pointer btn-fluid"
                              >
                                <CreditCard className="w-3.5 h-3.5" />
                                <span>
                                  {bill.remainingBalance > 0
                                    ? 'Record Payment / Overpayment'
                                    : 'Pay Advance for Next Month'}
                                </span>
                              </button>
                            )}

                            {onOpenAdvanceModal && hasPaidOverallBalance && targetRoom && (
                              <button
                                type="button"
                                onClick={() => onOpenAdvanceModal(targetRoom)}
                                className="px-3.5 py-2.5 rounded-2xl bg-[#1A2334] hover:bg-[#243046] border border-[#2C3A52] text-amber-300 font-bold text-xs flex items-center gap-1.5 transition cursor-pointer btn-fluid"
                              >
                                <span>Advance / Refund</span>
                              </button>
                            )}
                          </>
                        );
                      })()}
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => onSelectBillForReceipt(bill)}
                        className="p-2.5 rounded-2xl bg-[#1A2334] hover:bg-blue-500/20 text-blue-400 transition cursor-pointer btn-fluid"
                        title="Open Receipt (Copy PNG / Share)"
                      >
                        <MessageCircle className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onArchiveBill(bill.id)}
                        className="p-2.5 rounded-2xl bg-[#1A2334] hover:bg-amber-500/20 text-amber-400 transition cursor-pointer btn-fluid"
                        title="Archive Receipt"
                      >
                        <Archive className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Record Payment / Overpayment Modal */}
      {payingBill && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-3xl bg-[#161C28] border border-[#28334A] p-6 sm:p-7 shadow-2xl animate-modal-pop">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-extrabold text-white">
                Record Payment • {payingBill.roomName}
              </h3>
              <button
                type="button"
                onClick={() => setPayingBill(null)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleConfirmPayment} className="space-y-4">
              <div className="rounded-2xl bg-[#0D121B] border border-[#222C3F] p-4 text-xs space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-slate-400">Tenant:</span>
                  <span className="font-bold text-white">
                    {payingBill.tenantName}
                  </span>
                </div>
                {payingBillComponents && (
                  <>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Unpaid Rent Balance:</span>
                      <span className="font-bold text-white font-mono-num">
                        {formatPeso(payingBillComponents.rentRemaining)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Unpaid Electricity Balance:</span>
                      <span className="font-bold text-amber-400 font-mono-num">
                        {formatPeso(payingBillComponents.electricityRemaining)}
                      </span>
                    </div>
                    {payingBillComponents.latePenaltyRemaining > 0 && (
                      <div className="flex justify-between">
                        <span className="text-slate-400">Unpaid Late Charges:</span>
                        <span className="font-bold text-rose-400 font-mono-num">
                          {formatPeso(payingBillComponents.latePenaltyRemaining)}
                        </span>
                      </div>
                    )}
                    {payingBillComponents.carryOverRemaining > 0 && (
                      <div className="flex justify-between">
                        <span className="text-slate-400">Carry-Over Balance:</span>
                        <span className="font-bold text-rose-300 font-mono-num">
                          {formatPeso(payingBillComponents.carryOverRemaining)}
                        </span>
                      </div>
                    )}
                  </>
                )}
                <div className="flex justify-between pt-1.5 border-t border-[#222C3F]">
                  <span className="text-slate-300 font-semibold">Total Outstanding Balance:</span>
                  <span className="font-extrabold text-amber-400 font-mono-num">
                    {formatPeso(payingBill.remainingBalance)}
                  </span>
                </div>
              </div>

              {payingBill.remainingBalance > 0 && payingBillComponents && (
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Apply Payment Component
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                    {(
                      [
                        { id: 'auto', label: 'All Due', preset: payingBill.remainingBalance },
                        { id: 'rent', label: 'Rent Only', preset: payingBillComponents.rentRemaining },
                        { id: 'electricity', label: 'Electric Only', preset: payingBillComponents.electricityRemaining },
                        { id: 'custom', label: 'Custom Split', preset: payingBill.remainingBalance },
                      ] as const
                    ).map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => {
                          setPayAllocationTarget(opt.id);
                          setPayError(null);
                          if (opt.id !== 'custom') {
                            setPayAmount(String(opt.preset));
                          }
                        }}
                        className={`py-2 px-2 rounded-xl border text-[11px] font-bold transition cursor-pointer ${
                          payAllocationTarget === opt.id
                            ? 'bg-amber-500 text-slate-950 border-amber-500'
                            : 'bg-[#0D121B] text-slate-300 border-[#253148] hover:border-slate-500'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                  {payAllocationTarget === 'rent' &&
                    payingBillComponents.electricityRemaining > 0 && (
                      <p className="mt-2 rounded-xl bg-amber-500/15 border border-amber-500/35 px-3 py-2 text-[11px] text-amber-200">
                        Paying Rent only keeps Electricity balance ({formatPeso(payingBillComponents.electricityRemaining)}) unpaid. This bill will remain <strong>PARTIAL</strong> (never marked completed) until electricity is paid.
                      </p>
                    )}
                </div>
              )}

              {payAllocationTarget === 'custom' && payingBillComponents ? (
                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                      Rent Payment (₱)
                    </label>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={customRentPay}
                      onChange={(e) => {
                        const raw = e.target.value.replace(/,/g, '');
                        if (raw !== '' && !/^\d*\.?\d*$/.test(raw)) return;
                        setCustomRentPay(raw);
                      }}
                      className="w-full h-10 rounded-xl bg-[#0D121B] border border-[#253148] px-3 text-sm font-bold text-white font-mono-num"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-amber-300 mb-1">
                      Electricity Payment (₱)
                    </label>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={customElecPay}
                      onChange={(e) => {
                        const raw = e.target.value.replace(/,/g, '');
                        if (raw !== '' && !/^\d*\.?\d*$/.test(raw)) return;
                        setCustomElecPay(raw);
                      }}
                      className="w-full h-10 rounded-xl bg-[#0D121B] border border-amber-500/40 px-3 text-sm font-bold text-amber-400 font-mono-num"
                    />
                  </div>
                  {payingBillComponents.latePenaltyRemaining > 0 && (
                    <div className="col-span-2">
                      <label className="block text-[11px] font-semibold text-rose-300 mb-1">
                        Late Penalty Payment (₱)
                      </label>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={customPenaltyPay}
                        onChange={(e) => {
                          const raw = e.target.value.replace(/,/g, '');
                          if (raw !== '' && !/^\d*\.?\d*$/.test(raw)) return;
                          setCustomPenaltyPay(raw);
                        }}
                        className="w-full h-10 rounded-xl bg-[#0D121B] border border-rose-500/40 px-3 text-sm font-bold text-rose-300 font-mono-num"
                      />
                    </div>
                  )}
                  <div className="col-span-2 flex items-center justify-between rounded-xl bg-[#0D121B] border border-[#253148] px-3 py-2 text-xs">
                    <span className="text-slate-400">Combined Payment Total</span>
                    <span className="font-mono-num font-extrabold text-emerald-400">
                      {formatPeso(enteredPayNum)}
                    </span>
                  </div>
                  {payError && (
                    <p className="col-span-2 rounded-xl bg-red-500/15 border border-red-500/30 p-2.5 text-xs text-red-300">
                      {payError}
                    </p>
                  )}
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Amount Paid by Tenant (₱) *
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    required
                    value={payAmount}
                    onChange={(e) => {
                      const raw = e.target.value.replace(/,/g, '');
                      if (raw !== '' && !/^\d*\.?\d*$/.test(raw)) return;
                      setPayError(null);
                      setPayAmount(raw);
                    }}
                    className="w-full h-11 rounded-2xl bg-[#0D121B] border border-[#253148] px-4 text-base font-bold text-emerald-400 font-mono-num"
                  />
                  {payError && (
                    <p className="mt-2 rounded-xl bg-red-500/15 border border-red-500/30 p-2.5 text-xs text-red-300">
                      {payError}
                    </p>
                  )}
                  {excessOverpayment > 0 ? (
                    <div className="mt-2 rounded-xl bg-emerald-500/10 border border-emerald-500/30 p-3 space-y-1 text-xs">
                      <p className="font-extrabold text-emerald-300">
                        Overpayment Breakdown (Requires Biometrics / 4-Digit PIN)
                      </p>
                      {payingBill.remainingBalance > 0 && (
                        <p className="text-slate-300">
                          • Applied to Current Remaining Balance:{' '}
                          <strong className="text-white font-mono-num">
                            {formatPeso(payingBill.remainingBalance)}
                          </strong>{' '}
                          (Bill Remaining → ₱0.00)
                        </p>
                      )}
                      <p className="text-emerald-300">
                        • Credited to Advance Balance
                        {isAdvanceCapped
                          ? ` (1-Month Max Allowance: ${formatPeso(remainingAdvanceAllowance)})`
                          : ' (Prepaid Wallet)'}
                        :{' '}
                        <strong className="font-mono-num">
                          +{formatPeso(excessOverpayment)}
                        </strong>
                      </p>
                      <p className="text-[11px] text-slate-400">
                        Recorded as a tracked Advance Transaction | Refundable anytime via Advance / Refund if tenant moves out.
                      </p>
                    </div>
                  ) : (
                    <p className="text-[11px] text-slate-400 mt-1.5">
                      {isAdvanceCapped
                        ? `Credits against Remaining Balance first. Excess up to 1 month's rent advance (${formatPeso(remainingAdvanceAllowance)} remaining allowance) stores in Advance Balance.`
                        : 'Credits against Remaining Balance first. Any excess automatically rolls into Prepaid Advance Credit.'}
                    </p>
                  )}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Payment Method
                  </label>
                  <select
                    value={payMethod}
                    onChange={(e) =>
                      setPayMethod(
                        e.target.value as
                          | 'Cash'
                          | 'GCash'
                          | 'Maya'
                          | 'Bank Transfer'
                      )
                    }
                    className="w-full h-11 rounded-2xl bg-[#0D121B] border border-[#253148] px-3.5 text-xs font-bold text-white"
                  >
                    <option value="GCash">GCash</option>
                    <option value="Cash">Cash</option>
                    <option value="Maya">Maya</option>
                    <option value="Bank Transfer">Bank Transfer</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Reference # (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g., GCash Ref #"
                    value={payRef}
                    onChange={(e) => setPayRef(e.target.value)}
                    className="w-full h-11 rounded-2xl bg-[#0D121B] border border-[#253148] px-3.5 text-xs text-white"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2.5 pt-3">
                <button
                  type="button"
                  onClick={() => setPayingBill(null)}
                  className="px-4 py-2.5 rounded-2xl bg-[#1F2738] text-slate-300 text-xs font-bold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-extrabold flex items-center gap-1.5 cursor-pointer btn-fluid"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Save Payment</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
