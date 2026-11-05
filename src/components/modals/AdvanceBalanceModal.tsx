import React, { useState } from 'react';
import {
  ArrowDownLeft,
  ArrowUpRight,
  CheckCircle2,
  History,
  Wallet,
  X,
} from 'lucide-react';
import { Room } from '../../types/rental';
import { formatPeso } from '../../utils/billingCalculator';

interface AdvanceBalanceModalProps {
  room: Room | null;
  onClose: () => void;
  onWithdrawAdvance: (roomId: string, amount: number, note: string) => void;
  onAddAdvanceDeposit: (roomId: string, amount: number, note: string) => void;
  onApplyAdvanceToUnpaid: (roomId: string, amount: number) => void;
}

export const AdvanceBalanceModal: React.FC<AdvanceBalanceModalProps> = ({
  room,
  onClose,
  onWithdrawAdvance,
  onAddAdvanceDeposit,
  onApplyAdvanceToUnpaid,
}) => {
  const [actionType, setActionType] = useState<'withdraw' | 'add' | 'apply'>(
    'withdraw'
  );
  const [amount, setAmount] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (!room) return null;

  const currentAdvance = room.advanceRent || 0;
  const currentUnpaid = room.unpaidBalance || 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const val = Math.round((parseFloat(amount) || 0) * 100) / 100;
    if (val <= 0) {
      setError('Please enter a valid amount greater than ₱0.00.');
      return;
    }

    if (actionType === 'withdraw') {
      if (val > currentAdvance) {
        setError(
          `Cannot withdraw more than available Advance Balance (${formatPeso(
            currentAdvance
          )}).`
        );
        return;
      }
      onWithdrawAdvance(
        room.id,
        val,
        'Advance Payment Balance Withdrawal'
      );
      setAmount('');
      onClose();
    } else if (actionType === 'add') {
      onAddAdvanceDeposit(
        room.id,
        val,
        'Added Deposit / Advance Payment Balance'
      );
      setAmount('');
      onClose();
    } else {
      const maxApplicable = Math.min(currentAdvance, currentUnpaid);
      if (val > maxApplicable) {
        setError(
          `Maximum applicable amount is ${formatPeso(maxApplicable)}.`
        );
        return;
      }
      onApplyAdvanceToUnpaid(room.id, val);
      setAmount('');
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="w-full max-w-lg rounded-3xl bg-[#151B26] border border-[#263147] shadow-2xl overflow-hidden my-6">
        <div className="flex items-center justify-between px-6 py-4 bg-[#192130] border-b border-[#263147]">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <Wallet className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-white">
                Advance Payment Balance • {room.name}
              </h3>
              <p className="text-xs text-slate-400">
                Manage withdrawable advance balance and security deposit credits
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

        <div className="p-6 space-y-5 max-h-[80vh] overflow-y-auto">
          {/* Balance Summary Cards */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-[#0E131C] border border-emerald-500/30 p-4">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">
                Withdrawable Advance Balance
              </span>
              <span className="text-2xl font-black text-emerald-400 font-mono-num mt-1 block">
                {formatPeso(currentAdvance)}
              </span>
            </div>
            <div className="rounded-2xl bg-[#0E131C] border border-[#252F42] p-4">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">
                Required Security Deposit Held
              </span>
              <span className="text-2xl font-black text-amber-400 font-mono-num mt-1 block">
                {formatPeso(room.securityDeposit)}
              </span>
            </div>
          </div>

          {/* Action Selector */}
          <div className="grid grid-cols-3 gap-2">
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
              <span>Withdraw Balance</span>
            </button>

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
              <span>Add Advance</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setActionType('apply');
                setAmount(
                  String(Math.min(currentAdvance, currentUnpaid) || '')
                );
                setError(null);
              }}
              className={`py-2.5 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 border transition cursor-pointer ${
                actionType === 'apply'
                  ? 'bg-blue-500 text-white border-blue-500'
                  : 'bg-[#0E131C] text-slate-300 border-[#252F42]'
              }`}
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Apply to Bill</span>
            </button>
          </div>

          {error && (
            <div className="rounded-xl bg-red-500/15 border border-red-500/30 p-3 text-xs text-red-300">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                {actionType === 'withdraw'
                  ? 'Withdrawal Amount to Release to Tenant (₱) *'
                  : actionType === 'add'
                  ? 'Excess Payment / Advance Deposit Amount (₱) *'
                  : `Amount to Deduct from Unpaid Balance (${formatPeso(
                      currentUnpaid
                    )}) *`}
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

            <button
              type="submit"
              className="w-full py-3 rounded-xl bg-[#F59E0B] hover:bg-[#FBBF24] text-slate-950 font-extrabold text-xs sm:text-sm transition cursor-pointer"
            >
              {actionType === 'withdraw'
                ? 'Confirm Tenant Advance Withdrawal'
                : actionType === 'add'
                ? 'Credit to Advance Payment Balance'
                : 'Apply Advance Balance to Unpaid Bill'}
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
