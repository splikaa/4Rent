import React, { useState } from 'react';
import {
  ArrowDownLeft,
  ArrowUpRight,
  CalendarClock,
  Fingerprint,
  History,
  Lock,
  Wallet,
  X,
} from 'lucide-react';
import { Room } from '../../types/rental';
import {
  formatMonthKeyLabel,
  formatPeso,
  getAdjacentMonthKey,
  getRemainingAdvanceAllowance,
  normalizeMonthKey,
  roundCurrency,
} from '../../utils/billingCalculator';

interface AdvanceBalanceModalProps {
  room: Room | null;
  onClose: () => void;
  onWithdrawAdvance: (roomId: string, amount: number, note: string) => void;
  onAddAdvanceDeposit: (roomId: string, amount: number, note: string) => void;
  onApplyAdvanceToUnpaid?: (roomId: string, amount: number) => void;
}

export const AdvanceBalanceModal: React.FC<AdvanceBalanceModalProps> = ({
  room,
  onClose,
  onWithdrawAdvance,
  onAddAdvanceDeposit,
}) => {
  const [actionType, setActionType] = useState<'add' | 'withdraw'>('add');
  const [amount, setAmount] = useState('');
  const [targetCycleNote, setTargetCycleNote] = useState<string>('next_month');
  const [refundReason, setRefundReason] = useState<string>(
    'Tenant Moving Out — Advance Refund'
  );
  const [error, setError] = useState<string | null>(null);

  if (!room) return null;

  const currentAdvance = room.advanceRent || 0;
  const currentUnpaid = room.unpaidBalance || 0;
  const remainingAdvanceAllowance = getRemainingAdvanceAllowance(
    room.monthlyRent,
    currentAdvance
  );
  const maxPayableWithAdvanceCap = roundCurrency(
    currentUnpaid + remainingAdvanceAllowance
  );
  const baseKey = normalizeMonthKey(new Date());
  const nextMonthLabel = formatMonthKeyLabel(getAdjacentMonthKey(baseKey, 1), 'long');
  const enteredAmount = Math.max(0, Math.round((parseFloat(amount) || 0) * 100) / 100);
  const previewAppliedUnpaid =
    actionType === 'add'
      ? Math.round(Math.min(enteredAmount, currentUnpaid) * 100) / 100
      : 0;
  const previewAddedAdvance =
    actionType === 'add'
      ? Math.round(Math.max(0, enteredAmount - previewAppliedUnpaid) * 100) / 100
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
      if (val > currentAdvance) {
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
        refundReason.trim() || 'Tenant Moving Out — Advance Refund'
      );
      setAmount('');
    } else {
      if (previewAddedAdvance > remainingAdvanceAllowance + 0.01) {
        setError(
          remainingAdvanceAllowance <= 0
            ? `1-Month Advance Limit Reached: This unit already holds ${formatPeso(
                currentAdvance
              )} in Advance Balance (max 1 month rent: ${formatPeso(
                room.monthlyRent
              )}). Settle unpaid balances or use Refund / Withdraw first.`
            : `Tenants can only hold an advance for up to 1 month of rent (${formatPeso(
                room.monthlyRent
              )}). Maximum payable now: ${formatPeso(maxPayableWithAdvanceCap)}.`
        );
        return;
      }
      const depositNote =
        previewAppliedUnpaid > 0
          ? `Settled ${formatPeso(previewAppliedUnpaid)} unpaid bill; +${formatPeso(previewAddedAdvance)} Advance for ${nextMonthLabel}`
          : `Advance Payment for ${nextMonthLabel} (1-Month Cap • Auto-deducts next cycle)`;
      onAddAdvanceDeposit(room.id, val, depositNote);
      setAmount('');
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-3 sm:p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-label={`Advance Balance for ${room.name}`}
    >
      <div className="w-full max-w-lg rounded-2xl sm:rounded-3xl bg-[#151B26] border border-[#263147] shadow-2xl overflow-hidden my-auto max-h-[94vh] flex flex-col animate-modal-pop">
        <div className="flex items-center justify-between px-6 py-4 bg-[#192130] border-b border-[#263147]">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <Wallet className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-white">
                Advance Balance • {room.name}
              </h3>
              <p className="text-xs text-slate-400">
                Auto-applied to monthly room bills
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-[#10151F] text-slate-400 hover:text-white flex items-center justify-center cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 sm:p-6 space-y-5 overflow-y-auto">
          {/* Balance Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="rounded-2xl bg-[#0E131C] border border-emerald-500/30 p-3.5 sm:p-4">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">
                Available Advance Balance
              </span>
              <span className="text-xl sm:text-2xl font-black text-emerald-400 font-mono-num mt-1 block">
                {formatPeso(currentAdvance)}
              </span>
            </div>
            <div className="rounded-2xl bg-[#0E131C] border border-[#252F42] p-3.5 sm:p-4">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">
                Required Security Deposit Held
              </span>
              <span className="text-xl sm:text-2xl font-black text-amber-400 font-mono-num mt-1 block">
                {formatPeso(room.securityDeposit)}
              </span>
            </div>
          </div>

          {/* Landlord Quick Guide Banner */}
          <div className="rounded-2xl bg-emerald-500/10 border border-emerald-500/25 p-3.5 flex items-start gap-2.5 text-xs text-emerald-200">
            <CalendarClock className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <strong className="text-white block">
                How Advance Payment &amp; Refunds Work
              </strong>
              <ul className="text-slate-300 text-[11px] leading-relaxed space-y-0.5">
                <li>
                  • <strong className="text-white">Step 1:</strong> Credits any remaining unpaid rent + kWh balance first ({formatPeso(currentUnpaid)} due now).
                </li>
                <li>
                  • <strong className="text-white">Step 2:</strong> Excess goes to Advance Balance (capped at{' '}
                  <strong className="text-emerald-300">1 month rent: {formatPeso(room.monthlyRent)}</strong>{' '}
                  max for {nextMonthLabel}). Remaining allowance:{' '}
                  <strong className="text-white font-mono-num">{formatPeso(remainingAdvanceAllowance)}</strong>.
                </li>
                <li>
                  • <strong className="text-white">Step 3:</strong> Requires{' '}
                  <strong className="text-amber-300">Biometrics / PIN</strong> verification.
                  Use <strong className="text-amber-300">Refund / Withdraw</strong> if returning balance to tenant.
                </li>
              </ul>
            </div>
          </div>

          {/* 2-Tab Action Selector (Add Advance vs Withdraw Balance) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
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
              <ArrowDownLeft className="w-3.5 h-3.5" />
              <span>Advance for Next Month</span>
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
              <ArrowUpRight className="w-3.5 h-3.5" />
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
                    Apply Advance Balance Toward (1-Month Max Limit)
                  </label>
                  <select
                    value={targetCycleNote}
                    onChange={(e) => setTargetCycleNote(e.target.value)}
                    className="w-full h-10 rounded-xl bg-[#0E131C] border border-[#252F42] px-3 text-xs font-bold text-emerald-300 focus:border-emerald-500 focus:outline-none"
                  >
                    <option value="next_month">
                      Next Month Only ({nextMonthLabel} • Max 1 Month Rent)
                    </option>
                  </select>
                </div>

                {room.monthlyRent > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {remainingAdvanceAllowance > 0 ? (
                      <button
                        type="button"
                        onClick={() => setAmount(String(remainingAdvanceAllowance))}
                        className="px-3 py-1.5 rounded-lg bg-[#0E131C] hover:bg-[#192334] border border-emerald-500/30 text-[11px] font-bold text-emerald-300 cursor-pointer"
                      >
                        1-Month Max Advance ({formatPeso(remainingAdvanceAllowance)})
                      </button>
                    ) : (
                      <div className="w-full rounded-xl bg-amber-500/10 border border-amber-500/30 px-3 py-2 text-[11px] text-amber-300">
                        1-month advance cap reached ({formatPeso(currentAdvance)} held of {formatPeso(room.monthlyRent)} limit).
                      </div>
                    )}
                    {currentUnpaid > 0 && (
                      <button
                        type="button"
                        onClick={() =>
                          setAmount(String(maxPayableWithAdvanceCap))
                        }
                        className="px-3 py-1.5 rounded-lg bg-[#0E131C] hover:bg-[#192334] border border-amber-500/35 text-[11px] font-bold text-amber-300 cursor-pointer"
                      >
                        {remainingAdvanceAllowance > 0
                          ? `Pay Due + Max 1-Mo Advance (${formatPeso(maxPayableWithAdvanceCap)})`
                          : `Pay Unpaid Due Only (${formatPeso(currentUnpaid)})`}
                      </button>
                    )}
                  </div>
                )}
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
                  <option value="Tenant Moving Out — Advance Refund">
                    Tenant Moving Out — Advance Refund
                  </option>
                  <option value="Tenant Requested Overpayment Refund">
                    Tenant Requested Overpayment Refund
                  </option>
                  <option value="Lease Completed — Final Advance Return">
                    Lease Completed — Final Advance Return
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
                  <div className="flex justify-between text-slate-300">
                    <span>Applied to Current Unpaid Balance:</span>
                    <strong className="text-amber-300 font-mono-num">
                      {formatPeso(previewAppliedUnpaid)}
                    </strong>
                  </div>
                )}
                <div className="flex justify-between text-slate-300">
                  <span>Added to Advance Balance (Next Month):</span>
                  <strong className="text-emerald-400 font-mono-num">
                    +{formatPeso(previewAddedAdvance)}
                  </strong>
                </div>
                <div className="flex justify-between text-white pt-1 border-t border-[#1E2738]">
                  <span className="font-bold">New Advance Balance Total:</span>
                  <strong className="text-emerald-400 font-mono-num">
                    {formatPeso(currentAdvance + previewAddedAdvance)}
                  </strong>
                </div>
              </div>
            )}

            <button
              type="submit"
              className="w-full py-3 rounded-xl bg-[#F59E0B] hover:bg-[#FBBF24] text-slate-950 font-extrabold text-xs sm:text-sm flex items-center justify-center gap-2 transition cursor-pointer"
            >
              <Fingerprint className="w-4 h-4" />
              <span>
                {actionType === 'add'
                  ? 'Verify (Biometrics / PIN) & Save Advance'
                  : 'Verify (Biometrics / PIN) & Confirm Refund'}
              </span>
            </button>
          </form>

          {/* Transaction History */}
          {room.advanceHistory && room.advanceHistory.length > 0 && (
            <div className="pt-4 border-t border-[#222C3F]">
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5 mb-2.5">
                <History className="w-3.5 h-3.5" />
                Advance Payment Ledger
              </h4>
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {room.advanceHistory.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-xl bg-[#0E131C] border border-[#1E2738] px-3 py-2 flex items-center justify-between text-xs"
                  >
                    <div>
                      <span className="font-semibold text-slate-200 block">
                        {item.note}
                      </span>
                      <span className="text-[10px] text-slate-500">
                        {new Date(item.createdAt).toLocaleString('en-PH')}
                      </span>
                    </div>
                    <span
                      className={`font-mono-num font-bold ${
                        item.type === 'withdrawal' ||
                        item.type === 'applied_to_bill'
                          ? 'text-amber-400'
                          : 'text-emerald-400'
                      }`}
                    >
                      {item.type === 'withdrawal' ||
                      item.type === 'applied_to_bill'
                        ? '-'
                        : '+'}
                      {formatPeso(item.amount)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
