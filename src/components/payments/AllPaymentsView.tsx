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
import { BillRecord } from '../../types/rental';
import { formatPeso } from '../../utils/billingCalculator';

interface AllPaymentsViewProps {
  bills: BillRecord[];
  onBack: () => void;
  onSelectBillForReceipt: (bill: BillRecord) => void;
  onRecordPayment: (
    billId: string,
    amount: number,
    method: 'Cash' | 'GCash' | 'Maya' | 'Bank Transfer',
    referenceNo?: string
  ) => void;
  onArchiveBill: (billId: string) => void;
  onOpenNewBillScanner: () => void;
  onOpenArchiveCenter: () => void;
}

export const AllPaymentsView: React.FC<AllPaymentsViewProps> = ({
  bills,
  onBack,
  onSelectBillForReceipt,
  onRecordPayment,
  onArchiveBill,
  onOpenNewBillScanner,
  onOpenArchiveCenter,
}) => {
  const [filter, setFilter] = useState<'all' | 'paid' | 'unpaid'>('all');
  const [payingBill, setPayingBill] = useState<BillRecord | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState<
    'Cash' | 'GCash' | 'Maya' | 'Bank Transfer'
  >('GCash');
  const [payRef, setPayRef] = useState('');

  // Active receipts (1 per room)
  const activeBills = bills.filter((b) => !b.isArchived);

  const filteredBills = activeBills.filter((b) => {
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
    setPayingBill(bill);
    setPayAmount(String(bill.remainingBalance));
    setPayMethod('GCash');
    setPayRef('');
  };

  const handleConfirmPayment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!payingBill) return;
    const amt = parseFloat(payAmount) || 0;
    if (amt <= 0) return;
    onRecordPayment(payingBill.id, amt, payMethod, payRef.trim() || undefined);
    setPayingBill(null);
  };

  const enteredPayNum = parseFloat(payAmount) || 0;
  const excessOverpayment =
    payingBill && enteredPayNum > payingBill.remainingBalance
      ? Math.round((enteredPayNum - payingBill.remainingBalance) * 100) / 100
      : 0;

  return (
    <div className="min-h-screen flex flex-col bg-[#0B0E14] pb-24">
      {/* Top Bar (Matches Screenshot 5) */}
      <header className="sticky top-0 z-20 bg-[#141923] border-b border-[#222B3C] px-4 sm:px-6 h-16 flex items-center justify-between">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to Dashboard"
          className="w-10 h-10 rounded-xl hover:bg-[#1E2636] flex items-center justify-center text-slate-200 transition cursor-pointer"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>

        <h1 className="text-lg sm:text-xl font-bold text-white tracking-tight">
          All Payments
        </h1>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onOpenArchiveCenter}
            className="px-3 py-1.5 rounded-xl bg-[#1B2230] hover:bg-[#232D40] border border-[#283246] text-xs font-semibold text-slate-300 flex items-center gap-1.5 cursor-pointer"
          >
            <Archive className="w-3.5 h-3.5 text-amber-400" />
            <span className="hidden sm:inline">Archived Receipts</span>
          </button>
          <button
            type="button"
            onClick={onOpenNewBillScanner}
            className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 transition cursor-pointer"
          >
            <Camera className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Generate Bill</span>
          </button>
        </div>
      </header>

      <div className="flex-1 w-full max-w-5xl mx-auto px-4 sm:px-6 pt-5 flex flex-col">
        {/* Filter Pills + Record Count Row (Matches Screenshot 5) */}
        <div className="flex items-center justify-between gap-2 mb-5">
          <div className="flex items-center gap-2.5">
            {(
              [
                { id: 'all', label: 'All' },
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
                  className={`px-5 py-2 rounded-full text-xs sm:text-sm font-bold transition cursor-pointer ${
                    active
                      ? 'bg-[#F59E0B] text-slate-950 shadow-md shadow-amber-500/20'
                      : 'bg-[#171E2C] text-slate-400 hover:text-white border border-[#263147]'
                  }`}
                >
                  {pill.label}
                </button>
              );
            })}
          </div>

          <span className="text-xs sm:text-sm font-medium text-slate-500 font-mono-num">
            {filteredBills.length}{' '}
            {filteredBills.length === 1 ? 'record' : 'records'}
          </span>
        </div>

        {/* Summary Card: TOTAL PAID (REVENUE) & TOTAL UNPAID (DUE) (Matches Screenshot 5) */}
        <div className="rounded-[22px] bg-[#182030] border border-[#26324A] p-5 sm:p-6 grid grid-cols-2 gap-4 mb-6 shadow-lg">
          <div>
            <div className="text-[11px] sm:text-xs font-bold uppercase tracking-wider text-slate-400">
              TOTAL PAID (REVENUE)
            </div>
            <div className="text-xl sm:text-2xl font-extrabold text-[#22C55E] font-mono-num mt-1.5">
              {formatPeso(totalPaidRevenue)}
            </div>
          </div>

          <div className="border-l border-[#28354E] pl-4 sm:pl-6">
            <div className="text-[11px] sm:text-xs font-bold uppercase tracking-wider text-slate-400">
              TOTAL UNPAID (DUE)
            </div>
            <div
              className={`text-xl sm:text-2xl font-extrabold font-mono-num mt-1.5 ${
                totalUnpaidDue > 0 ? 'text-amber-400' : 'text-slate-400'
              }`}
            >
              {formatPeso(totalUnpaidDue)}
            </div>
          </div>
        </div>

        {/* Empty State (Matches Screenshot 5) OR Active Room Receipts List */}
        {filteredBills.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center py-20 select-none">
            <div className="w-20 h-20 rounded-[24px] bg-[#1A2232] border border-[#28334A] flex items-center justify-center mb-5">
              <ReceiptText className="w-10 h-10 text-slate-500" />
            </div>
            <h2 className="text-xl font-bold text-white">No payments yet</h2>
            <p className="text-sm text-slate-400 mt-1.5">
              Generate a bill to see records here
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredBills.map((bill) => {
              const isPaid = bill.status === 'paid';
              const isPartial = bill.status === 'partial';

              return (
                <div
                  key={bill.id}
                  className="rounded-2xl bg-[#151B26] border border-[#232D40] p-5 shadow-lg transition hover:border-[#313F5A]"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-[#20293A]">
                    <div>
                      <div className="flex items-center gap-2.5">
                        <span className="text-lg font-extrabold text-white">
                          {bill.roomName}
                        </span>
                        <span className="text-xs font-mono-num px-2.5 py-0.5 rounded-md bg-[#0E131C] text-amber-400 border border-[#222C3F]">
                          Room Receipt #{bill.receiptNo}
                        </span>
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-xs font-bold uppercase ${
                            isPaid
                              ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                              : isPartial
                              ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                              : 'bg-red-500/15 text-red-400 border border-red-500/30'
                          }`}
                        >
                          {isPaid ? 'Paid' : isPartial ? 'Partial' : 'Unpaid'}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 mt-1">
                        Tenant:{' '}
                        <strong className="text-slate-200">
                          {bill.tenantName}
                        </strong>{' '}
                        • Period: {bill.billingPeriod} • Pay Window: Every
                        1st–10th (Due:{' '}
                        {new Date(bill.dueDate).toLocaleDateString('en-PH')})
                      </p>
                    </div>

                    <div className="text-left sm:text-right">
                      <div className="text-xs text-slate-400">
                        Total Bill Amount
                      </div>
                      <div className="text-xl font-extrabold text-white font-mono-num">
                        {formatPeso(bill.totalAmountDue)}
                      </div>
                      {bill.remainingBalance > 0 ? (
                        <div className="text-xs font-bold text-amber-400 font-mono-num">
                          Balance Due: {formatPeso(bill.remainingBalance)}
                        </div>
                      ) : (
                        <div className="text-xs font-bold text-emerald-400 font-mono-num">
                          Paid in Full ({bill.paymentMethod || 'Cash'})
                        </div>
                      )}
                      {bill.overpaymentToAdvance > 0 && (
                        <div className="text-[11px] font-bold text-emerald-300 font-mono-num">
                          +{formatPeso(bill.overpaymentToAdvance)} Credited to
                          Advance Balance
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Dual Sub-Meter & Breakdown Row */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 py-3.5 text-xs">
                    <div className="rounded-xl bg-[#0F141D] p-2.5 border border-[#1E2738]">
                      <span className="text-slate-400 block text-[11px]">
                        2 Sub-Meters (Prev → Curr)
                      </span>
                      <span className="font-mono-num font-bold text-slate-200">
                        {bill.prevReading.toFixed(1)} →{' '}
                        {bill.currReading.toFixed(1)} kWh
                      </span>
                    </div>
                    <div className="rounded-xl bg-[#0F141D] p-2.5 border border-[#1E2738]">
                      <span className="text-slate-400 block text-[11px]">
                        Difference (Δ kWh)
                      </span>
                      <span className="font-mono-num font-bold text-amber-400 flex items-center gap-1">
                        <Zap className="w-3 h-3" />
                        {bill.consumptionKwh.toFixed(1)} kWh (
                        {formatPeso(bill.electricTotal)})
                      </span>
                    </div>
                    <div className="rounded-xl bg-[#0F141D] p-2.5 border border-[#1E2738]">
                      <span className="text-slate-400 block text-[11px]">
                        Base Rent + Carry-Over
                      </span>
                      <span className="font-mono-num font-bold text-white">
                        {formatPeso(
                          bill.baseRent + bill.previousBalanceCarryOver
                        )}
                      </span>
                    </div>
                    <div className="rounded-xl bg-[#0F141D] p-2.5 border border-[#1E2738]">
                      <span className="text-slate-400 block text-[11px]">
                        Amount Collected
                      </span>
                      <span className="font-mono-num font-bold text-emerald-400">
                        {formatPeso(bill.amountPaid)}
                      </span>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="pt-3 border-t border-[#20293A] flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => onSelectBillForReceipt(bill)}
                        className="px-4 py-2 rounded-xl bg-[#F59E0B] hover:bg-[#FBBF24] text-slate-950 font-bold text-xs flex items-center gap-1.5 transition cursor-pointer"
                      >
                        <Printer className="w-3.5 h-3.5" />
                        <span>Official Receipt (2 Sub-Meter Proofs)</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => openPaymentDialog(bill)}
                        className="px-3.5 py-2 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-300 font-bold text-xs flex items-center gap-1.5 transition cursor-pointer"
                      >
                        <CreditCard className="w-3.5 h-3.5" />
                        <span>
                          {bill.remainingBalance > 0
                            ? 'Record Payment / Overpayment'
                            : 'Add Extra Advance Payment'}
                        </span>
                      </button>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => onSelectBillForReceipt(bill)}
                        className="p-2 rounded-xl bg-[#1D2535] hover:bg-blue-500/20 text-blue-400 transition cursor-pointer"
                        title="Share via Messenger"
                      >
                        <MessageCircle className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onArchiveBill(bill.id)}
                        className="p-2 rounded-xl bg-[#1D2535] hover:bg-amber-500/20 text-amber-400 transition cursor-pointer"
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
          <div className="w-full max-w-md rounded-3xl bg-[#161C28] border border-[#28334A] p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-white">
                Record Payment — {payingBill.roomName}
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
              <div className="rounded-xl bg-[#0E131C] border border-[#222C3F] p-3.5 text-xs space-y-1">
                <div className="flex justify-between">
                  <span className="text-slate-400">Tenant:</span>
                  <span className="font-bold text-white">
                    {payingBill.tenantName}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Remaining Bill Due:</span>
                  <span className="font-bold text-amber-400 font-mono-num">
                    {formatPeso(payingBill.remainingBalance)}
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Amount Paid by Tenant (₱) *
                </label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                  className="w-full rounded-xl bg-[#0E131C] border border-[#252F42] px-3.5 py-2.5 text-base font-bold text-emerald-400 font-mono-num"
                />
                {excessOverpayment > 0 ? (
                  <p className="text-xs font-bold text-emerald-400 mt-1.5">
                    +{formatPeso(excessOverpayment)} excess payment will be
                    credited to {payingBill.roomName}’s Withdrawable Advance
                    Payment Balance!
                  </p>
                ) : (
                  <p className="text-[11px] text-slate-400 mt-1">
                    If tenant pays less than the due amount, the balance carries
                    over. If tenant pays more, the excess goes to their
                    withdrawable Advance Balance.
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
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
                    className="w-full rounded-xl bg-[#0E131C] border border-[#252F42] px-3 py-2.5 text-xs font-bold text-white"
                  >
                    <option value="GCash">GCash</option>
                    <option value="Cash">Cash</option>
                    <option value="Maya">Maya</option>
                    <option value="Bank Transfer">Bank Transfer</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Reference # (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g., GCash Ref #"
                    value={payRef}
                    onChange={(e) => setPayRef(e.target.value)}
                    className="w-full rounded-xl bg-[#0E131C] border border-[#252F42] px-3 py-2.5 text-xs text-white"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setPayingBill(null)}
                  className="px-4 py-2.5 rounded-xl bg-[#1F2738] text-slate-300 text-xs font-bold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-extrabold flex items-center gap-1.5 cursor-pointer"
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
