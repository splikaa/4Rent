import React, { useState } from 'react';
import {
  ArrowDownLeft,
  ArrowUpRight,
  CalendarClock,
  Fingerprint,
  Wallet,
  X,
} from 'lucide-react';
import { AdvanceCapPolicyMode, Room } from '../../types/rental';
import {
  formatMonthKeyLabel,
  formatPeso,
  getAdjacentMonthKey,
  normalizeMonthKey,
  roundCurrency,
} from '../../utils/billingCalculator';
import {
  fromCentavos,
  getAdvancePolicyAllowance,
  toCentavos,
} from '../../utils/financialEngine';
import { AdvanceLedgerList } from '../advance/AdvanceLedgerList';
import { ModalPortal } from '../common/ModalPortal';

interface AdvanceBalanceModalProps {
  room: Room | null;
  advanceCapMode?: AdvanceCapPolicyMode;
  onClose: () => void;
  onWithdrawAdvance: (roomId: string, amount: number, note: string) => void;
  onAddAdvanceDeposit: (roomId: string, amount: number, note: string) => void;
}

export const AdvanceBalanceModal: React.FC<AdvanceBalanceModalProps> = ({
  room,
  advanceCapMode = 'unlimited',
  onClose,
  onWithdrawAdvance,
  onAddAdvanceDeposit,
}) => {
  const [actionType, setActionType] = useState<'add' | 'withdraw'>('add');
  const [amount, setAmount] = useState('');
  const [targetCycleNote, setTargetCycleNote] = useState<string>('prepaid_wallet');
  const [refundReason, setRefundReason] = useState<string>(
    'Tenant Moving Out | Advance Refund'
  );
  const [error, setError] = useState<string | null>(null);

  if (!room) return null;

  const currentAdvance = Math.max(0, roundCurrency(room.advanceRent || 0));
  const currentUnpaid = Math.max(0, roundCurrency(room.unpaidBalance || 0));
  const allowanceInfo = getAdvancePolicyAllowance(
    room.monthlyRent,
    currentAdvance,
    advanceCapMode
  );
  const isCapped = allowanceInfo.isCapped;
  const remainingAdvanceAllowance = allowanceInfo.remainingAllowance;
  const maxPayableWithAdvanceCap = isCapped
    ? roundCurrency(currentUnpaid + remainingAdvanceAllowance)
    : Number.POSITIVE_INFINITY;

  const baseKey = normalizeMonthKey(new Date());
  const nextMonthLabel = formatMonthKeyLabel(getAdjacentMonthKey(baseKey, 1), 'long');
  const enteredAmount = fromCentavos(Math.max(0, toCentavos(amount)));
  const previewAppliedUnpaid =
    actionType === 'add'
      ? fromCentavos(Math.min(toCentavos(enteredAmount), toCentavos(currentUnpaid)))
      : 0;
  const previewAddedAdvance =
    actionType === 'add'
      ? fromCentavos(Math.max(0, toCentavos(enteredAmount) - toCentavos(previewAppliedUnpaid)))
      : 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const val = enteredAmount;
    if (val <= 0) {
      setError('Please enter a valid amount greater than ₱0.00.');
      return;
    }

    if (actionType === 'withdraw') {
      if (toCentavos(val) > toCentavos(currentAdvance)) {
        setError(
          `Cannot refund/withdraw more than available Advance Balance (${formatPeso(
            currentAdvance
          )}).`
        );
        return;
      }
      onWithdrawAdvance(
        room.id,
        val,
        refundReason.trim() || 'Tenant Moving Out | Advance Refund'
      );
      setAmount('');
      return;
    }

    if (
      isCapped &&
      toCentavos(previewAddedAdvance) > toCentavos(remainingAdvanceAllowance) + 1
    ) {
      setError(
        remainingAdvanceAllowance <= 0
          ? `1-Month Advance Policy Cap Reached: This unit holds ${formatPeso(
              currentAdvance
            )} (limit: ${formatPeso(room.monthlyRent)}). Settle unpaid dues, refund balance, or switch to Prepaid Wallet in Settings.`
          : `1-Month Cap Policy allows up to ${formatPeso(
              remainingAdvanceAllowance
            )} more. Maximum payable now: ${formatPeso(maxPayableWithAdvanceCap)}.`
      );
      return;
    }

    const cycleTag =
      targetCycleNote === 'next_month' ? `for ${nextMonthLabel}` : 'Prepaid Wallet';
    const depositNote =
      previewAppliedUnpaid > 0
        ? `Settled ${formatPeso(previewAppliedUnpaid)} unpaid bill; +${formatPeso(
            previewAddedAdvance
          )} stored (${cycleTag})`
        : isCapped
          ? `Advance Payment ${cycleTag} (1-Month Cap)`
          : `Advance Credit Added (${cycleTag} | Carries forward across bills)`;

    onAddAdvanceDeposit(room.id, val, depositNote);
    setAmount('');
  };

  return (
    <ModalPortal isOpen={Boolean(room)} onRequestClose={onClose}>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-3 sm:p-4 overflow-hidden overscroll-none"
        role="dialog"
        aria-modal="true"
        aria-label={`Advance Balance | ${room.name}`}
      >
        <div className="w-full max-w-xl max-h-[calc(100dvh-32px)] rounded-2xl sm:rounded-3xl bg-[#151B26] border border-[#263147] shadow-2xl overflow-hidden flex flex-col min-w-0 animate-modal-pop">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-4 sm:px-6 py-4 bg-[#192130] border-b border-[#263147] shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
              <Wallet className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-extrabold text-white truncate">
                Advance Balance | {room.name}
              </h3>
              <p className="text-xs text-slate-400 truncate">
                {room.tenant?.fullName
                  ? `${room.tenant.fullName} • Auto-applies to bills`
                  : 'Prepaid Rental Wallet'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close advance balance modal"
            className="w-9 h-9 rounded-xl bg-[#10151F] text-slate-400 hover:text-white flex items-center justify-center cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 min-h-0 p-4 sm:p-6 space-y-5 overflow-y-auto overscroll-contain min-w-0">
          {/* Balance Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="rounded-2xl bg-[#0E131C] border border-emerald-500/35 p-3.5 sm:p-4 min-w-0">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">
                Remaining Advance Credit
              </span>
              <span className="text-xl sm:text-2xl font-black text-emerald-400 font-mono-num mt-1 block break-words">
                {formatPeso(currentAdvance)}
              </span>
              <span className="text-[10px] text-emerald-300/80 font-semibold mt-0.5 block">
                {isCapped ? 'Policy: 1-Month Rent Cap' : 'Policy: Prepaid Wallet'}
              </span>
            </div>
            <div className="rounded-2xl bg-[#0E131C] border border-[#252F42] p-3.5 sm:p-4 min-w-0">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">
                Security Deposit Held
              </span>
              <span className="text-xl sm:text-2xl font-black text-amber-400 font-mono-num mt-1 block break-words">
                {formatPeso(room.securityDeposit)}
              </span>
              {currentUnpaid > 0 ? (
                <span className="text-[10px] text-rose-400 font-semibold mt-0.5 block">
                  Unpaid Bill Due: {formatPeso(currentUnpaid)}
                </span>
              ) : (
                <span className="text-[10px] text-slate-400 font-semibold mt-0.5 block">
                  Paid Deposit Credit: {formatPeso(room.securityDepositPaid || 0)}
                </span>
              )}
            </div>
          </div>

          {/* Guide Banner */}
          <div className="rounded-2xl bg-emerald-500/10 border border-emerald-500/25 p-3.5 flex items-start gap-2.5 text-xs text-emerald-200">
            <CalendarClock className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <div className="space-y-1 min-w-0">
              <strong className="text-white block">
                Prepaid Advance Wallet Rules
              </strong>
              <ul className="text-slate-300 text-[11px] leading-relaxed space-y-0.5">
                <li>
                  • <strong className="text-white">Step 1:</strong> Settles active unpaid charges first ({formatPeso(currentUnpaid)} due now).
                </li>
                <li>
                  • <strong className="text-white">Step 2:</strong> Unused advance remains in the tenant wallet and automatically carries forward to future rent + electricity bills.
                </li>
                <li>
                  • <strong className="text-white">Step 3:</strong> Deposits and refunds require <strong className="text-amber-300">Biometrics / PIN</strong> verification and never drop below ₱0.00.
                </li>
              </ul>
            </div>
          </div>

          {/* 2-Tab Action Selector (Add Advance vs Refund / Withdraw) */}
          <div className="grid grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={() => {
                setActionType('add');
                setAmount('');
                setError(null);
              }}
              className={`py-2.5 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 border transition cursor-pointer ${
                actionType === 'add'
                  ? 'bg-emerald-500 text-slate-950 border-emerald-500'
                  : 'bg-[#0E131C] text-slate-300 border-[#252F42]'
              }`}
            >
              <ArrowDownLeft className="w-3.5 h-3.5 shrink-0" />
              <span>Add Advance</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setActionType('withdraw');
                setAmount(currentAdvance > 0 ? String(currentAdvance) : '');
                setError(null);
              }}
              className={`py-2.5 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 border transition cursor-pointer ${
                actionType === 'withdraw'
                  ? 'bg-amber-500 text-slate-950 border-amber-500'
                  : 'bg-[#0E131C] text-slate-300 border-[#252F42]'
              }`}
            >
              <ArrowUpRight className="w-3.5 h-3.5 shrink-0" />
              <span>Refund / Withdraw</span>
            </button>
          </div>

          {error && (
            <div className="rounded-xl bg-red-500/15 border border-red-500/30 p-3 text-xs text-red-300">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-3">
            {actionType === 'add' ? (
              <div className="space-y-2.5">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Advance Credit Purpose
                  </label>
                  <select
                    value={targetCycleNote}
                    onChange={(e) => setTargetCycleNote(e.target.value)}
                    className="w-full h-10 rounded-xl bg-[#0E131C] border border-[#252F42] px-3 text-xs font-bold text-emerald-300 focus:border-emerald-500 focus:outline-none"
                  >
                    <option value="prepaid_wallet">
                      Prepaid Wallet (Carries Forward to Upcoming Bills)
                    </option>
                    <option value="next_month">
                      Designated for Next Cycle ({nextMonthLabel})
                    </option>
                  </select>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {room.monthlyRent > 0 && (
                    <button
                      type="button"
                      onClick={() => setAmount(String(room.monthlyRent))}
                      className="px-3 py-1.5 rounded-lg bg-[#0E131C] hover:bg-[#192334] border border-emerald-500/30 text-[11px] font-bold text-emerald-300 cursor-pointer"
                    >
                      1-Month Rent ({formatPeso(room.monthlyRent)})
                    </button>
                  )}
                  {!isCapped && room.monthlyRent > 0 && (
                    <button
                      type="button"
                      onClick={() => setAmount(String(roundCurrency(room.monthlyRent * 2)))}
                      className="px-3 py-1.5 rounded-lg bg-[#0E131C] hover:bg-[#192334] border border-emerald-500/30 text-[11px] font-bold text-emerald-300 cursor-pointer"
                    >
                      2 Months ({formatPeso(roundCurrency(room.monthlyRent * 2))})
                    </button>
                  )}
                  {isCapped && remainingAdvanceAllowance <= 0 && (
                    <div className="w-full rounded-xl bg-amber-500/10 border border-amber-500/30 px-3 py-2 text-[11px] text-amber-300">
                      1-month advance cap reached ({formatPeso(currentAdvance)} held of {formatPeso(room.monthlyRent)} limit).
                    </div>
                  )}
                  {currentUnpaid > 0 && (
                    <button
                      type="button"
                      onClick={() =>
                        setAmount(
                          isCapped
                            ? String(maxPayableWithAdvanceCap)
                            : String(roundCurrency(currentUnpaid + room.monthlyRent))
                        )
                      }
                      className="px-3 py-1.5 rounded-lg bg-[#0E131C] hover:bg-[#192334] border border-amber-500/35 text-[11px] font-bold text-amber-300 cursor-pointer"
                    >
                      Pay Due ({formatPeso(currentUnpaid)}) + Rent
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Refund / Withdrawal Reason *
                </label>
                <select
                  value={refundReason}
                  onChange={(e) => setRefundReason(e.target.value)}
                  className="w-full h-10 rounded-xl bg-[#0E131C] border border-[#252F42] px-3 text-xs font-bold text-amber-300 focus:border-amber-500 focus:outline-none"
                >
                  <option value="Tenant Moving Out | Advance Refund">
                    Tenant Moving Out | Advance Refund
                  </option>
                  <option value="Tenant Requested Overpayment Refund">
                    Tenant Requested Overpayment Refund
                  </option>
                  <option value="Lease Completed | Final Advance Return">
                    Lease Completed | Final Advance Return
                  </option>
                </select>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                {actionType === 'add'
                  ? 'Advance Payment Amount to Credit (₱) *'
                  : 'Refund / Withdrawal Amount to Release to Tenant (₱) *'}
              </label>
              <input
                type="number"
                step="0.01"
                required
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full h-11 rounded-xl bg-[#0E131C] border border-[#252F42] px-3.5 text-base font-bold text-white font-mono-num focus:border-amber-500 focus:outline-none"
              />
            </div>

            {enteredAmount > 0 && actionType === 'add' && (
              <div className="rounded-xl bg-[#0E131C] border border-emerald-500/25 p-3 text-[11px] space-y-1">
                {previewAppliedUnpaid > 0 && (
                  <div className="flex justify-between gap-2 text-slate-300">
                    <span>Applied to Current Unpaid Balance:</span>
                    <strong className="text-amber-300 font-mono-num">
                      {formatPeso(previewAppliedUnpaid)}
                    </strong>
                  </div>
                )}
                <div className="flex justify-between gap-2 text-slate-300">
                  <span>Added to Advance Wallet:</span>
                  <strong className="text-emerald-400 font-mono-num">
                    +{formatPeso(previewAddedAdvance)}
                  </strong>
                </div>
                <div className="flex justify-between gap-2 text-white pt-1 border-t border-[#1E2738]">
                  <span className="font-bold">Projected Remaining Advance:</span>
                  <strong className="text-emerald-400 font-mono-num">
                    {formatPeso(roundCurrency(currentAdvance + previewAddedAdvance))}
                  </strong>
                </div>
              </div>
            )}

            {enteredAmount > 0 && actionType === 'withdraw' && (
              <div className="rounded-xl bg-[#0E131C] border border-amber-500/25 p-3 text-[11px] space-y-1">
                <div className="flex justify-between gap-2 text-slate-300">
                  <span>Available Balance Before Refund:</span>
                  <strong className="text-white font-mono-num">
                    {formatPeso(currentAdvance)}
                  </strong>
                </div>
                <div className="flex justify-between gap-2 text-red-300">
                  <span>Refund / Withdrawal:</span>
                  <strong className="font-mono-num">-{formatPeso(enteredAmount)}</strong>
                </div>
                <div className="flex justify-between gap-2 text-white pt-1 border-t border-[#1E2738]">
                  <span className="font-bold">Balance After Refund:</span>
                  <strong
                    className={`font-mono-num ${
                      enteredAmount > currentAdvance ? 'text-red-400' : 'text-emerald-400'
                    }`}
                  >
                    {enteredAmount > currentAdvance
                      ? 'Exceeds Balance'
                      : formatPeso(
                          fromCentavos(Math.max(0, toCentavos(currentAdvance) - toCentavos(enteredAmount)))
                        )}
                  </strong>
                </div>
              </div>
            )}

            <button
              type="submit"
              className="w-full py-3 rounded-xl bg-[#F59E0B] hover:bg-[#FBBF24] text-slate-950 font-extrabold text-xs sm:text-sm flex items-center justify-center gap-2 transition cursor-pointer"
            >
              <Fingerprint className="w-4 h-4 shrink-0" />
              <span>
                {actionType === 'add'
                  ? 'Verify (Biometrics / PIN) & Save Advance'
                  : 'Verify (Biometrics / PIN) & Confirm Refund'}
              </span>
            </button>
          </form>

          {/* Mobile-First Advance Payment Ledger */}
          <div className="pt-4 border-t border-[#222C3F]">
            <AdvanceLedgerList room={room} pageSize={5} />
          </div>
        </div>
      </div>
      </div>
    </ModalPortal>
  );
};
