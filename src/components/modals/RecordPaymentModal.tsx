import React, { useEffect, useState } from 'react';
import {
  Calendar,
  Camera,
  CheckCircle2,
  CreditCard,
  Info,
  ShieldCheck,
  X,
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
  getCurrentCalendarPeriodLabel,
  roundCurrency,
} from '../../utils/billingCalculator';
import {
  buildCustomSplitAllocation,
  computeBillComponentBalances,
  getAdvancePolicyAllowance,
  getRoomDepositStatus,
} from '../../utils/financialEngine';
import {
  getBillTabStatusMeta,
  getDepositStatusMeta,
} from '../../utils/depositStatusUi';

export type PaymentModalMode = 'current_month' | 'required_deposit';

interface RecordPaymentModalProps {
  isOpen: boolean;
  room: Room | null;
  activeBill: BillRecord | null;
  initialMode?: PaymentModalMode;
  advanceCapMode?: AdvanceCapPolicyMode;
  suppressEscapeClose?: boolean;
  onClose: () => void;
  onRecordBillPayment: (
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
  onRecordRequiredDepositPayment: (
    roomId: string,
    amount: number,
    method: 'Cash' | 'GCash' | 'Maya' | 'Bank Transfer',
    referenceNo?: string,
    options?: { applyToActiveBill?: boolean },
    onCommitted?: () => void
  ) => void;
  onOpenGenerateBill?: (room: Room) => void;
}

export const RecordPaymentModal: React.FC<RecordPaymentModalProps> = ({
  isOpen,
  room,
  activeBill,
  initialMode = 'current_month',
  advanceCapMode = 'unlimited',
  suppressEscapeClose = false,
  onClose,
  onRecordBillPayment,
  onRecordRequiredDepositPayment,
  onOpenGenerateBill,
}) => {
  const [mode, setMode] = useState<PaymentModalMode>(initialMode);
  const [payAmount, setPayAmount] = useState('');
  const [payAllocationTarget, setPayAllocationTarget] =
    useState<PaymentAllocationTarget>('auto');
  const [customRentPay, setCustomRentPay] = useState('');
  const [customElecPay, setCustomElecPay] = useState('');
  const [customPenaltyPay, setCustomPenaltyPay] = useState('');
  const [customCarryOverPay, setCustomCarryOverPay] = useState('');
  const [depositPayAmount, setDepositPayAmount] = useState('');
  const [applyDepositToActiveBill, setApplyDepositToActiveBill] = useState(false);
  const [payMethod, setPayMethod] = useState<
    'Cash' | 'GCash' | 'Maya' | 'Bank Transfer'
  >('GCash');
  const [payRef, setPayRef] = useState('');
  const [payError, setPayError] = useState<string | null>(null);

  const currentPeriodLabel = activeBill?.billingPeriod || getCurrentCalendarPeriodLabel();
  const depositStatus = room ? getRoomDepositStatus(room) : null;
  const billComponents = activeBill ? computeBillComponentBalances(activeBill) : null;

  useEffect(() => {
    if (!isOpen || !room) return;
    const dep = getRoomDepositStatus(room);
    let resolvedInitialMode: PaymentModalMode = 'current_month';
    if (initialMode === 'required_deposit') {
      resolvedInitialMode = 'required_deposit';
    } else if (!activeBill && dep.remaining > 0) {
      resolvedInitialMode = 'required_deposit';
    }

    setMode(resolvedInitialMode);
    setPayError(null);
    setPayMethod('GCash');
    setPayRef('');
    setApplyDepositToActiveBill(false);

    if (activeBill) {
      const comp = computeBillComponentBalances(activeBill);
      setPayAllocationTarget('auto');
      setPayAmount(
        activeBill.remainingBalance > 0
          ? String(activeBill.remainingBalance)
          : String(room.monthlyRent || 0)
      );
      setCustomRentPay(String(comp.rentRemaining));
      setCustomElecPay(String(comp.electricityRemaining));
      setCustomPenaltyPay(String(comp.latePenaltyRemaining));
      setCustomCarryOverPay(String(comp.carryOverRemaining));
    } else {
      setPayAmount('');
      setCustomRentPay('0');
      setCustomElecPay('0');
      setCustomPenaltyPay('0');
      setCustomCarryOverPay('0');
    }

    setDepositPayAmount(dep.remaining > 0 ? String(dep.remaining) : '');
  }, [isOpen, room?.id, activeBill?.id, initialMode]);

  useEffect(() => {
    if (!isOpen || suppressEscapeClose) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopImmediatePropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, suppressEscapeClose, onClose]);

  if (!isOpen || !room || !depositStatus) return null;

  const depositMeta = getDepositStatusMeta(depositStatus.status);
  const billTabMeta = getBillTabStatusMeta(activeBill, formatPeso);
  const advanceAllowanceInfo = getAdvancePolicyAllowance(
    room.monthlyRent,
    room.advanceRent || 0,
    advanceCapMode
  );
  const remainingAdvanceAllowance = advanceAllowanceInfo.remainingAllowance;
  const isAdvanceCapped = advanceAllowanceInfo.isCapped;

  const customSplitResult = buildCustomSplitAllocation({
    rent: customRentPay,
    electricity: customElecPay,
    latePenalty: customPenaltyPay,
    carryOver: customCarryOverPay,
  });

  const enteredBillPayNum =
    payAllocationTarget === 'custom'
      ? customSplitResult.totalAmount
      : parseFloat(payAmount) || 0;

  const excessBillOverpayment =
    activeBill && enteredBillPayNum > activeBill.remainingBalance
      ? roundCurrency(enteredBillPayNum - activeBill.remainingBalance)
      : 0;

  const enteredDepositPayNum = parseFloat(depositPayAmount) || 0;
  const excessDepositOverpayment =
    enteredDepositPayNum > depositStatus.remaining
      ? roundCurrency(enteredDepositPayNum - depositStatus.remaining)
      : 0;

  const maxBillPayableWithCap =
    activeBill && isAdvanceCapped
      ? roundCurrency((activeBill.remainingBalance || 0) + remainingAdvanceAllowance)
      : Number.POSITIVE_INFINITY;

  const maxDepositPayableWithCap = isAdvanceCapped
    ? roundCurrency(depositStatus.remaining + remainingAdvanceAllowance)
    : Number.POSITIVE_INFINITY;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPayError(null);

    if (mode === 'required_deposit') {
      if (enteredDepositPayNum <= 0) {
        setPayError('Enter a Required Deposit payment amount greater than ₱0.00.');
        return;
      }
      if (
        isAdvanceCapped &&
        excessDepositOverpayment > remainingAdvanceAllowance + 0.01
      ) {
        setPayError(
          `Advance credit is limited to 1 month of rent under active policy. Maximum deposit payment now: ${formatPeso(
            maxDepositPayableWithCap
          )}.`
        );
        return;
      }
      onRecordRequiredDepositPayment(
        room.id,
        enteredDepositPayNum,
        payMethod,
        payRef.trim() || undefined,
        { applyToActiveBill: applyDepositToActiveBill },
        onClose
      );
      return;
    }

    if (!activeBill) {
      setPayError(`Generate a ${currentPeriodLabel} receipt first before recording a monthly bill payment.`);
      return;
    }

    let amt = enteredBillPayNum;
    let customAllocation: Partial<ComponentPaymentAllocation> | undefined;
    if (payAllocationTarget === 'custom') {
      amt = customSplitResult.totalAmount;
      customAllocation = customSplitResult.customAllocation;
    }

    if (amt <= 0) {
      setPayError('Enter a payment amount greater than ₱0.00.');
      return;
    }
    const excess = roundCurrency(
      Math.max(0, amt - (activeBill.remainingBalance || 0))
    );
    if (isAdvanceCapped && excess > remainingAdvanceAllowance + 0.01) {
      setPayError(
        `Advance credit is limited to 1 month of rent under active policy. Maximum payable now: ${formatPeso(
          maxBillPayableWithCap
        )}.`
      );
      return;
    }

    onRecordBillPayment(
      activeBill.id,
      amt,
      payMethod,
      payRef.trim() || undefined,
      onClose,
      {
        allocationTarget: payAllocationTarget,
        customAllocation,
      }
    );
  };

  const roomDisplayTitle = /^\d+$/.test(room.name.trim())
    ? `Room ${room.name.trim()}`
    : room.name;

  return (
    <div
      className="fixed inset-0 z-[55] flex items-center justify-center bg-black/80 backdrop-blur-xs p-3 sm:p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-label={`Record Payment for ${roomDisplayTitle}`}
    >
      <div className="w-full max-w-lg rounded-3xl bg-[#161C28] border border-[#28334A] p-5 sm:p-7 shadow-2xl my-auto max-h-[92dvh] overflow-y-auto animate-modal-pop">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="min-w-0">
            <h3 className="text-base sm:text-lg font-extrabold text-white flex items-center gap-2">
              <CreditCard className="w-5 h-5 text-emerald-400 shrink-0" />
              <span className="truncate">Record Payment • {roomDisplayTitle}</span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              {room.tenant?.fullName || activeBill?.tenantName || 'Occupied Tenant'} • Choose payment type below
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close payment modal"
            className="w-9 h-9 rounded-xl bg-[#0F1522] border border-[#253148] text-slate-400 hover:text-white flex items-center justify-center cursor-pointer shrink-0 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Clear Payment Type Selector: Current Month Bill vs Required Deposit */}
        <div className="grid grid-cols-2 gap-2.5 mb-5" role="tablist" aria-label="Payment type">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'current_month'}
            onClick={() => {
              setMode('current_month');
              setPayError(null);
            }}
            className={`rounded-2xl p-3 text-left border transition cursor-pointer ${
              mode === 'current_month'
                ? 'bg-emerald-500/15 border-emerald-400/70 shadow-lg shadow-emerald-500/10'
                : 'bg-[#0D121B] border-[#243047] hover:border-slate-500'
            }`}
          >
            <div className="flex items-center justify-between gap-1.5">
              <span className="inline-flex items-center gap-1.5 text-xs font-extrabold text-white">
                <Calendar className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span>{currentPeriodLabel}</span>
              </span>
              <span
                className={`px-1.5 py-0.5 rounded-md text-[10px] font-extrabold ${billTabMeta.badgeClass}`}
              >
                {billTabMeta.label}
              </span>
            </div>
            <div className="text-[11px] font-semibold text-slate-300 mt-1">
              Current Month Bill
            </div>
            <div className="text-xs font-mono-num font-black text-amber-400 mt-0.5">
              {billTabMeta.summaryText}
            </div>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={mode === 'required_deposit'}
            onClick={() => {
              setMode('required_deposit');
              setPayError(null);
            }}
            className={`rounded-2xl p-3 text-left border transition cursor-pointer ${
              mode === 'required_deposit'
                ? 'bg-emerald-500/15 border-emerald-400/70 shadow-lg shadow-emerald-500/10'
                : 'bg-[#0D121B] border-[#243047] hover:border-slate-500'
            }`}
          >
            <div className="flex items-center justify-between gap-1.5">
              <span className="inline-flex items-center gap-1.5 text-xs font-extrabold text-white">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span>Req. Deposit</span>
              </span>
              <span
                className={`px-1.5 py-0.5 rounded-md text-[10px] font-extrabold ${depositMeta.compactBadgeClass}`}
              >
                {depositMeta.shortLabel}
              </span>
            </div>
            <div className="text-[11px] font-semibold text-slate-300 mt-1">
              Security Deposit
            </div>
            <div className="text-xs font-mono-num font-black text-emerald-400 mt-0.5">
              {depositStatus.remaining > 0
                ? `${formatPeso(depositStatus.remaining)} due`
                : `Paid (${formatPeso(depositStatus.paid)})`}
            </div>
          </button>
        </div>

        {/* Mode 1: Current Month Bill Payment */}
        {mode === 'current_month' && !activeBill ? (
          <div className="rounded-2xl bg-[#0D121B] border border-[#243047] p-5 text-center space-y-3">
            <p className="text-sm font-bold text-white">
              No active receipt yet for {currentPeriodLabel}
            </p>
            <p className="text-xs text-slate-400 leading-relaxed">
              Generate the {currentPeriodLabel} bill first to record monthly rent &amp; electricity payments, or switch to the <strong className="text-emerald-300">Req. Deposit</strong> tab above to collect the tenant&apos;s Required Deposit now.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
              {onOpenGenerateBill && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenGenerateBill(room);
                  }}
                  className="px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-xs inline-flex items-center gap-1.5 cursor-pointer transition"
                >
                  <Camera className="w-3.5 h-3.5" />
                  <span>Generate {currentPeriodLabel} Receipt</span>
                </button>
              )}
              {depositStatus.remaining > 0 && (
                <button
                  type="button"
                  onClick={() => setMode('required_deposit')}
                  className="px-4 py-2.5 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/40 text-emerald-300 font-bold text-xs inline-flex items-center gap-1.5 cursor-pointer transition"
                >
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>Pay Required Deposit</span>
                </button>
              )}
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'current_month' && activeBill && billComponents ? (
              <>
                <div className="rounded-2xl bg-[#0D121B] border border-[#222C3F] p-4 text-xs space-y-1.5">
                  <div className="flex items-center justify-between pb-1.5 border-b border-[#1E293D]">
                    <span className="font-extrabold text-amber-300">
                      Current Month: {activeBill.billingPeriod}
                    </span>
                    <span className="font-mono-num text-[11px] text-slate-400">
                      Receipt #{activeBill.receiptNo}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Unpaid Rent Balance:</span>
                    <span className="font-bold text-white font-mono-num">
                      {formatPeso(billComponents.rentRemaining)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Unpaid Electricity Balance:</span>
                    <span className="font-bold text-amber-400 font-mono-num">
                      {formatPeso(billComponents.electricityRemaining)}
                    </span>
                  </div>
                  {billComponents.latePenaltyRemaining > 0 && (
                    <div className="flex justify-between">
                      <span className="text-slate-400">Unpaid Late Charges:</span>
                      <span className="font-bold text-rose-400 font-mono-num">
                        {formatPeso(billComponents.latePenaltyRemaining)}
                      </span>
                    </div>
                  )}
                  {billComponents.carryOverRemaining > 0 && (
                    <div className="flex justify-between">
                      <span className="text-slate-400">Previous Month Carry-Over:</span>
                      <span className="font-bold text-rose-300 font-mono-num">
                        {formatPeso(billComponents.carryOverRemaining)}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between pt-1.5 border-t border-[#222C3F]">
                    <span className="text-slate-200 font-semibold">
                      Outstanding Balance ({activeBill.billingPeriod}):
                    </span>
                    <span className="font-extrabold text-amber-400 font-mono-num">
                      {formatPeso(activeBill.remainingBalance)}
                    </span>
                  </div>
                </div>

                {activeBill.remainingBalance > 0 && (
                  <div className="rounded-xl bg-blue-500/10 border border-blue-500/30 px-3 py-2 text-[11px] text-blue-200 flex items-start gap-2">
                    <Info className="w-3.5 h-3.5 text-blue-400 shrink-0 mt-0.5" />
                    <span>
                      Partial payments reduce <strong>{activeBill.billingPeriod}</strong> immediately. Any unpaid balance remaining next month automatically adds up into next month&apos;s receipt.
                    </span>
                  </div>
                )}

                {activeBill.remainingBalance > 0 && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                      Apply {activeBill.billingPeriod} Payment To
                    </label>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                      {(
                        [
                          { id: 'auto', label: 'All Due', preset: activeBill.remainingBalance },
                          { id: 'rent', label: 'Rent Only', preset: billComponents.rentRemaining },
                          {
                            id: 'electricity',
                            label: 'Electric Only',
                            preset: billComponents.electricityRemaining,
                          },
                          { id: 'custom', label: 'Custom Split', preset: activeBill.remainingBalance },
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
                      billComponents.electricityRemaining > 0 && (
                        <p className="mt-2 rounded-xl bg-amber-500/15 border border-amber-500/35 px-3 py-2 text-[11px] text-amber-200">
                          Paying Rent only keeps Electricity ({formatPeso(billComponents.electricityRemaining)}) unpaid. This receipt remains <strong>PARTIAL</strong> until electricity is settled.
                        </p>
                      )}
                  </div>
                )}

                {payAllocationTarget === 'custom' ? (
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
                    {billComponents.latePenaltyRemaining > 0 && (
                      <div className="col-span-2">
                        <label className="block text-[11px] font-semibold text-rose-300 mb-1">
                          Late Charges Payment (₱)
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
                    {billComponents.carryOverRemaining > 0 && (
                      <div className="col-span-2">
                        <label className="block text-[11px] font-semibold text-rose-300 mb-1">
                          Previous Month Carry-Over Payment (₱)
                        </label>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={customCarryOverPay}
                          onChange={(e) => {
                            const raw = e.target.value.replace(/,/g, '');
                            if (raw !== '' && !/^\d*\.?\d*$/.test(raw)) return;
                            setCustomCarryOverPay(raw);
                          }}
                          className="w-full h-10 rounded-xl bg-[#0D121B] border border-rose-500/40 px-3 text-sm font-bold text-rose-300 font-mono-num"
                        />
                      </div>
                    )}
                    <div className="col-span-2 flex items-center justify-between rounded-xl bg-[#0D121B] border border-[#253148] px-3 py-2 text-xs">
                      <span className="text-slate-400">Combined Payment Total</span>
                      <span className="font-mono-num font-extrabold text-emerald-400">
                        {formatPeso(enteredBillPayNum)}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                      Amount Paid for {activeBill.billingPeriod} (₱) *
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
                      className="w-full h-11 rounded-2xl bg-[#0D121B] border border-[#253148] px-4 text-base font-bold text-emerald-400 font-mono-num focus:border-emerald-400 focus:outline-none"
                    />
                    {excessBillOverpayment > 0 && (
                      <div className="mt-2 rounded-xl bg-emerald-500/10 border border-emerald-500/30 p-3 space-y-1 text-xs">
                        <p className="font-extrabold text-emerald-300">
                          Overpayment Breakdown (Requires Biometrics / 4-Digit PIN)
                        </p>
                        {activeBill.remainingBalance > 0 && (
                          <p className="text-slate-300">
                            • Clears {activeBill.billingPeriod} Balance:{' '}
                            <strong className="text-white font-mono-num">
                              {formatPeso(activeBill.remainingBalance)}
                            </strong>
                          </p>
                        )}
                        <p className="text-emerald-300">
                          • Credited to Advance Balance:{' '}
                          <strong className="font-mono-num">
                            +{formatPeso(excessBillOverpayment)}
                          </strong>
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </>
            ) : (
              /* Mode 2: Required Deposit Payment */
              <>
                <div className="rounded-2xl bg-[#0D121B] border border-emerald-500/25 p-4 text-xs space-y-1.5">
                  <div className="flex items-center justify-between pb-1.5 border-b border-[#1E293D]">
                    <span className="font-extrabold text-emerald-300">
                      Assigned Required Security Deposit
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase border ${depositMeta.pillBadgeClass}`}
                    >
                      {depositMeta.fullLabel}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Required Deposit Assigned:</span>
                    <span className="font-bold text-white font-mono-num">
                      {formatPeso(depositStatus.required)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Deposit Paid &amp; Held:</span>
                    <span className="font-bold text-emerald-400 font-mono-num">
                      {formatPeso(depositStatus.paid)}
                    </span>
                  </div>
                  <div className="flex justify-between pt-1.5 border-t border-[#222C3F]">
                    <span className="text-slate-200 font-semibold">
                      Remaining Required Deposit Due:
                    </span>
                    <span
                      className={`font-extrabold font-mono-num ${
                        depositStatus.remaining > 0 ? 'text-amber-400' : 'text-emerald-400'
                      }`}
                    >
                      {formatPeso(depositStatus.remaining)}
                    </span>
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <label className="block text-xs font-semibold text-slate-300">
                      Required Deposit Payment Amount (₱) *
                    </label>
                    {depositStatus.remaining > 0 && (
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            setDepositPayAmount(
                              String(roundCurrency(depositStatus.remaining / 2))
                            );
                            setPayError(null);
                          }}
                          className="text-[10px] font-bold px-2 py-0.5 rounded-lg bg-[#0D121B] hover:bg-[#1B2538] text-slate-300 border border-[#28354E] cursor-pointer"
                        >
                          50%
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setDepositPayAmount(String(depositStatus.remaining));
                            setPayError(null);
                          }}
                          className="text-[10px] font-bold px-2 py-0.5 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/35 cursor-pointer"
                        >
                          Full Due ({formatPeso(depositStatus.remaining)})
                        </button>
                      </div>
                    )}
                  </div>
                  <input
                    type="text"
                    inputMode="decimal"
                    required
                    placeholder={
                      depositStatus.remaining > 0
                        ? String(depositStatus.remaining)
                        : '0.00'
                    }
                    value={depositPayAmount}
                    onChange={(e) => {
                      const raw = e.target.value.replace(/,/g, '');
                      if (raw !== '' && !/^\d*\.?\d*$/.test(raw)) return;
                      setPayError(null);
                      setDepositPayAmount(raw);
                    }}
                    className="w-full h-11 rounded-2xl bg-[#0D121B] border border-emerald-500/40 px-4 text-base font-bold text-emerald-400 font-mono-num focus:border-emerald-400 focus:outline-none"
                  />
                  {excessDepositOverpayment > 0 ? (
                    <div className="mt-2 rounded-xl bg-emerald-500/10 border border-emerald-500/30 p-3 space-y-1 text-xs">
                      <p className="font-extrabold text-emerald-300">
                        Excess Deposit → Advance Credit (Requires Biometrics / PIN)
                      </p>
                      {depositStatus.remaining > 0 && (
                        <p className="text-slate-300">
                          • Completes Required Deposit:{' '}
                          <strong className="text-white font-mono-num">
                            {formatPeso(depositStatus.remaining)}
                          </strong>
                        </p>
                      )}
                      <p className="text-emerald-300">
                        • Excess Credited to Advance Balance:{' '}
                        <strong className="font-mono-num">
                          +{formatPeso(excessDepositOverpayment)}
                        </strong>
                      </p>
                    </div>
                  ) : (
                    <p className="text-[11px] text-slate-400 mt-1.5">
                      Held safely on the room as the tenant&apos;s paid Required Security Deposit (separate from monthly rent/electricity bills).
                    </p>
                  )}
                </div>

                {activeBill && activeBill.remainingBalance > 0 && depositStatus.remaining > 0 && (
                  <label className="flex items-start gap-2.5 rounded-xl bg-[#0D121B] border border-[#243047] px-3 py-2.5 text-[11px] text-slate-300 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={applyDepositToActiveBill}
                      onChange={(e) => setApplyDepositToActiveBill(e.target.checked)}
                      className="mt-0.5 rounded accent-emerald-500 cursor-pointer"
                    />
                    <span>
                      Also deduct this deposit credit against{' '}
                      <strong className="text-amber-300">{activeBill.billingPeriod}</strong> unpaid balance ({formatPeso(activeBill.remainingBalance)}) instead of holding it.
                    </span>
                  </label>
                )}

                {room.securityDepositHistory && room.securityDepositHistory.length > 0 && (
                  <div className="rounded-2xl bg-[#0D121B] border border-[#222C3F] p-3 space-y-1.5">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Recent Deposit Payments ({room.securityDepositHistory.length})
                    </div>
                    <div className="space-y-1 max-h-24 overflow-y-auto">
                      {room.securityDepositHistory.slice(0, 4).map((tx) => (
                        <div
                          key={tx.id}
                          className="flex items-center justify-between text-[11px] text-slate-300"
                        >
                          <span className="truncate">
                            {new Date(tx.paidAt).toLocaleDateString('en-PH', {
                              month: 'short',
                              day: 'numeric',
                            })}{' '}
                            • {tx.method}
                            {tx.referenceNo ? ` (${tx.referenceNo})` : ''}
                          </span>
                          <span className="font-mono-num font-bold text-emerald-400 shrink-0 ml-2">
                            {formatPeso(tx.amount)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}

            {payError && (
              <p className="rounded-xl bg-red-500/15 border border-red-500/30 p-2.5 text-xs text-red-300">
                {payError}
              </p>
            )}

            {/* Shared Payment Method & Reference # */}
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
                  className="w-full h-11 rounded-2xl bg-[#0D121B] border border-[#253148] px-3.5 text-xs font-bold text-white focus:border-emerald-400 focus:outline-none"
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
                  className="w-full h-11 rounded-2xl bg-[#0D121B] border border-[#253148] px-3.5 text-xs text-white focus:border-emerald-400 focus:outline-none"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2.5 pt-3 border-t border-[#222E44]">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 rounded-2xl bg-[#1F2738] hover:bg-[#273146] text-slate-300 text-xs font-bold cursor-pointer transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-5 py-2.5 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-extrabold flex items-center gap-1.5 cursor-pointer btn-fluid shadow-lg shadow-emerald-500/20"
              >
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>
                  {mode === 'required_deposit'
                    ? 'Save Required Deposit'
                    : `Pay ${activeBill?.billingPeriod || currentPeriodLabel}`}
                </span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
