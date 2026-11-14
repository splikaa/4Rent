import React, { useMemo, useState } from 'react';
import {
  ArrowDownLeft,
  ArrowUpRight,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  History,
  RefreshCw,
  Search,
  SlidersHorizontal,
} from 'lucide-react';
import {
  AdvanceBalanceTransaction,
  Room,
} from '../../types/rental';
import { formatPeso } from '../../utils/billingCalculator';
import {
  getAdvanceTransactionSignedDeltaCents,
  isCreditAdvanceTransactionType,
  reconcileRoomAdvanceLedger,
} from '../../utils/financialEngine';

interface AdvanceLedgerListProps {
  room: Room;
  compact?: boolean;
  pageSize?: number;
}

type TypeFilter = 'all' | 'credit' | 'applied' | 'refund' | 'adjustment';

function getVisualTone(tx: AdvanceBalanceTransaction) {
  if (tx.status === 'pending') {
    return {
      border: 'border-amber-500/35',
      bg: 'bg-[#121928]',
      badgeBg: 'bg-amber-500/15 text-amber-300 border-amber-500/35',
      amountText: 'text-amber-300',
      typeLabel: 'Pending Action',
      tone: 'orange' as const,
    };
  }
  if (tx.status === 'reversed') {
    return {
      border: 'border-slate-700',
      bg: 'bg-[#101622]',
      badgeBg: 'bg-slate-700/40 text-slate-300 border-slate-600/50',
      amountText: 'text-slate-400 line-through',
      typeLabel: 'Reversed Entry',
      tone: 'gray' as const,
    };
  }

  if (isCreditAdvanceTransactionType(tx.type)) {
    return {
      border: 'border-emerald-500/30',
      bg: 'bg-[#0F1B1D]',
      badgeBg: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/35',
      amountText: 'text-emerald-400',
      typeLabel:
        tx.type === 'overpayment_credit' ? 'Overpayment Credit' : 'Advance Credit',
      tone: 'green' as const,
    };
  }

  if (tx.type === 'applied_to_bill') {
    return {
      border: 'border-amber-500/30',
      bg: 'bg-[#191714]',
      badgeBg: 'bg-amber-500/15 text-amber-300 border-amber-500/35',
      amountText: 'text-amber-400',
      typeLabel: 'Advance Applied',
      tone: 'orange' as const,
    };
  }

  if (tx.type === 'withdrawal') {
    return {
      border: 'border-red-500/30',
      bg: 'bg-[#1C1418]',
      badgeBg: 'bg-red-500/15 text-red-300 border-red-500/35',
      amountText: 'text-red-400',
      typeLabel: 'Refund / Withdrawal',
      tone: 'red' as const,
    };
  }

  const signed = getAdvanceTransactionSignedDeltaCents(tx);
  if (signed < 0) {
    return {
      border: 'border-red-500/30',
      bg: 'bg-[#191418]',
      badgeBg: 'bg-red-500/15 text-red-300 border-red-500/35',
      amountText: 'text-red-400',
      typeLabel: 'Negative Adjustment',
      tone: 'red' as const,
    };
  }
  if (signed > 0) {
    return {
      border: 'border-emerald-500/30',
      bg: 'bg-[#0F1B1D]',
      badgeBg: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/35',
      amountText: 'text-emerald-400',
      typeLabel: 'Credit Adjustment',
      tone: 'green' as const,
    };
  }

  return {
    border: 'border-slate-700',
    bg: 'bg-[#111724]',
    badgeBg: 'bg-slate-700/40 text-slate-300 border-slate-600/40',
    amountText: 'text-slate-300',
    typeLabel: 'Ledger Info',
    tone: 'gray' as const,
  };
}

function getBillingPeriodLabel(tx: AdvanceBalanceTransaction): string {
  if (tx.billingPeriod) return tx.billingPeriod;
  const d = new Date(tx.createdAt);
  if (Number.isNaN(d.getTime())) return 'Unspecified';
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

export const AdvanceLedgerList: React.FC<AdvanceLedgerListProps> = ({
  room,
  compact = false,
  pageSize = 6,
}) => {
  const reconciledRoom = useMemo(() => reconcileRoomAdvanceLedger(room), [room]);
  const allEntries = reconciledRoom.advanceHistory || [];

  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [periodFilter, setPeriodFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState<number>(1);

  const periodOptions = useMemo(() => {
    const unique = new Set<string>();
    for (const tx of allEntries) {
      unique.add(getBillingPeriodLabel(tx));
    }
    return Array.from(unique);
  }, [allEntries]);

  const filteredEntries = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list = allEntries.filter((tx) => {
      if (typeFilter === 'credit' && !isCreditAdvanceTransactionType(tx.type)) {
        return false;
      }
      if (typeFilter === 'applied' && tx.type !== 'applied_to_bill') {
        return false;
      }
      if (typeFilter === 'refund' && tx.type !== 'withdrawal') {
        return false;
      }
      if (typeFilter === 'adjustment' && tx.type !== 'adjustment') {
        return false;
      }

      if (periodFilter !== 'all' && getBillingPeriodLabel(tx) !== periodFilter) {
        return false;
      }

      if (q) {
        const haystack = [
          tx.referenceNo || '',
          tx.receiptNo || '',
          tx.description || '',
          tx.note || '',
          tx.billingPeriod || '',
        ]
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }

      return true;
    });

    if (sortOrder === 'oldest') {
      return [...list].reverse();
    }
    return list;
  }, [allEntries, typeFilter, periodFilter, searchQuery, sortOrder]);

  const totalPages = Math.max(1, Math.ceil(filteredEntries.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const pagedEntries = filteredEntries.slice(
    (safePage - 1) * pageSize,
    safePage * pageSize
  );

  const handleFilterChange = (next: TypeFilter) => {
    setTypeFilter(next);
    setCurrentPage(1);
  };

  if (allEntries.length === 0) {
    return (
      <div className="rounded-2xl bg-[#0D121B] border border-[#222E44] p-4 text-center space-y-1.5">
        <div className="w-9 h-9 rounded-xl bg-slate-800/80 border border-slate-700 flex items-center justify-center mx-auto text-slate-400">
          <History className="w-4 h-4" />
        </div>
        <p className="text-xs font-bold text-slate-300">
          No advance payment ledger entries yet
        </p>
        <p className="text-[11px] text-slate-400">
          Deposits, bill applications, excess payments, and refunds will appear here with running balances.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3 min-w-0">
      {/* Header & Sort Order Toggle */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
          <History className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          <span>
            Advance Payment Ledger ({filteredEntries.length}
            {filteredEntries.length !== allEntries.length ? ` of ${allEntries.length}` : ''})
          </span>
        </p>
        <button
          type="button"
          onClick={() => {
            setSortOrder((prev) => (prev === 'newest' ? 'oldest' : 'newest'));
            setCurrentPage(1);
          }}
          className="px-2.5 py-1 rounded-lg bg-[#0D121B] hover:bg-[#172030] border border-[#243047] text-[10px] font-bold text-slate-300 flex items-center gap-1 cursor-pointer transition"
        >
          <SlidersHorizontal className="w-3 h-3 text-amber-400" />
          <span>{sortOrder === 'newest' ? 'Newest First' : 'Chronological'}</span>
        </button>
      </div>

      {/* Filter & Search Controls */}
      <div className="space-y-2 rounded-2xl bg-[#0D121B] border border-[#202B40] p-2.5 sm:p-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div className="relative min-w-0">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              placeholder="Search ref #, receipt, or note..."
              className="w-full h-9 rounded-xl bg-[#131B29] border border-[#263248] pl-8 pr-3 text-xs text-white placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none"
            />
          </div>

          <select
            value={periodFilter}
            onChange={(e) => {
              setPeriodFilter(e.target.value);
              setCurrentPage(1);
            }}
            aria-label="Filter ledger by billing period"
            className="w-full h-9 rounded-xl bg-[#131B29] border border-[#263248] px-3 text-xs font-semibold text-white focus:border-emerald-500 focus:outline-none"
          >
            <option value="all">All Billing Periods</option>
            {periodOptions.map((period) => (
              <option key={period} value={period}>
                Period: {period}
              </option>
            ))}
          </select>
        </div>

        {/* Transaction Type Filter Pills */}
        <div className="flex flex-wrap items-center gap-1.5">
          {(
            [
              { id: 'all', label: 'All' },
              { id: 'credit', label: 'Credits' },
              { id: 'applied', label: 'Applied' },
              { id: 'refund', label: 'Refunds' },
              { id: 'adjustment', label: 'Adjustments' },
            ] as const
          ).map((pill) => {
            const active = typeFilter === pill.id;
            return (
              <button
                key={pill.id}
                type="button"
                onClick={() => handleFilterChange(pill.id)}
                className={`px-2.5 py-1 rounded-full text-[11px] font-bold transition cursor-pointer ${
                  active
                    ? 'bg-emerald-500 text-slate-950'
                    : 'bg-[#131B29] border border-[#243047] text-slate-300 hover:text-white'
                }`}
              >
                {pill.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Vertical Mobile-First Card Transaction List */}
      {pagedEntries.length === 0 ? (
        <div className="rounded-2xl bg-[#0D121B] border border-[#222E44] p-4 text-center text-xs text-slate-400">
          No matching transactions for the active filter.
        </div>
      ) : (
        <div className="space-y-2.5">
          {pagedEntries.map((tx) => {
            const visual = getVisualTone(tx);
            const signedCents = getAdvanceTransactionSignedDeltaCents(tx);
            const isPositive = signedCents > 0;
            const isExpanded = expandedId === tx.id;
            const dateObj = new Date(tx.createdAt);
            const formattedDateTime = Number.isNaN(dateObj.getTime())
              ? tx.createdAt
              : `${dateObj.toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })} | ${dateObj.toLocaleTimeString('en-US', {
                  hour: 'numeric',
                  minute: '2-digit',
                  hour12: true,
                })}`;
            const statusLabel =
              tx.status === 'pending'
                ? 'Pending'
                : tx.status === 'reversed'
                  ? 'Reversed'
                  : 'Completed';

            return (
              <div
                key={tx.id}
                className={`rounded-2xl border ${visual.border} ${visual.bg} p-3 sm:p-3.5 space-y-2.5 transition min-w-0`}
              >
                {/* Row 1: Type Pill + Status + Amount */}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold border ${visual.badgeBg}`}
                    >
                      {isPositive ? (
                        <ArrowDownLeft className="w-3 h-3 shrink-0" />
                      ) : tx.type === 'adjustment' && signedCents === 0 ? (
                        <RefreshCw className="w-3 h-3 shrink-0" />
                      ) : (
                        <ArrowUpRight className="w-3 h-3 shrink-0" />
                      )}
                      <span>{visual.typeLabel}</span>
                    </span>

                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                        tx.status === 'pending'
                          ? 'bg-amber-500/15 text-amber-300 border-amber-500/35'
                          : tx.status === 'reversed'
                            ? 'bg-slate-700/50 text-slate-300 border-slate-600'
                            : 'bg-emerald-500/10 text-emerald-300 border-emerald-500/25'
                      }`}
                    >
                      {statusLabel}
                    </span>
                  </div>

                  <span
                    className={`font-mono-num text-sm sm:text-base font-black shrink-0 ${visual.amountText}`}
                  >
                    {signedCents > 0 ? '+' : signedCents < 0 ? '-' : ''}
                    {formatPeso(Math.abs(tx.amount))}
                  </span>
                </div>

                {/* Row 2: Description & Reference / Date */}
                <div className="space-y-1 min-w-0">
                  <p className="text-xs sm:text-sm font-extrabold text-white break-words leading-snug">
                    {tx.description || tx.note}
                  </p>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-400">
                    <span className="font-mono-num">{formattedDateTime}</span>
                    {tx.referenceNo && (
                      <span className="font-mono-num text-slate-300">
                        Ref: {tx.referenceNo}
                      </span>
                    )}
                  </div>
                </div>

                {/* Row 3: Balance Before -> Balance After (clean 2-column vertical-friendly boxes) */}
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <div className="rounded-xl bg-[#0A0F18]/90 border border-[#1E293D] px-2.5 py-1.5 min-w-0">
                    <span className="text-[10px] uppercase tracking-wider text-slate-400 block">
                      Balance Before
                    </span>
                    <span className="text-xs font-bold text-slate-200 font-mono-num break-words">
                      {typeof tx.balanceBefore === 'number'
                        ? formatPeso(tx.balanceBefore)
                        : 'N/A'}
                    </span>
                  </div>
                  <div className="rounded-xl bg-[#0A0F18]/90 border border-[#1E293D] px-2.5 py-1.5 min-w-0">
                    <span className="text-[10px] uppercase tracking-wider text-slate-400 block">
                      Balance After
                    </span>
                    <span
                      className={`text-xs font-extrabold font-mono-num break-words ${
                        (tx.balanceAfter ?? 0) > 0
                          ? 'text-emerald-400'
                          : 'text-slate-200'
                      }`}
                    >
                      {typeof tx.balanceAfter === 'number'
                        ? formatPeso(tx.balanceAfter)
                        : 'N/A'}
                    </span>
                  </div>
                </div>

                {/* Expandable Details Toggle */}
                <div className="pt-0.5">
                  <button
                    type="button"
                    onClick={() =>
                      setExpandedId((curr) => (curr === tx.id ? null : tx.id))
                    }
                    className="w-full flex items-center justify-between text-[11px] font-semibold text-slate-400 hover:text-white pt-1 border-t border-[#1D283B] cursor-pointer transition"
                  >
                    <span>
                      {isExpanded ? 'Hide transaction details' : 'View transaction details'}
                    </span>
                    {isExpanded ? (
                      <ChevronUp className="w-3.5 h-3.5 shrink-0" />
                    ) : (
                      <ChevronDown className="w-3.5 h-3.5 shrink-0" />
                    )}
                  </button>

                  {isExpanded && (
                    <div className="mt-2 rounded-xl bg-[#0A0F18] border border-[#1E293D] p-2.5 space-y-1.5 text-[11px] text-slate-300 break-words">
                      <div>
                        <span className="text-slate-400 font-semibold">Notes: </span>
                        <span>{tx.note || tx.description || 'None recorded'}</span>
                      </div>
                      <div className="flex flex-wrap gap-x-4 gap-y-1">
                        <span>
                          <strong className="text-slate-400">Period: </strong>
                          {getBillingPeriodLabel(tx)}
                        </span>
                        {tx.receiptNo && (
                          <span>
                            <strong className="text-slate-400">Receipt: </strong>#
                            {tx.receiptNo}
                          </span>
                        )}
                        {tx.category && (
                          <span>
                            <strong className="text-slate-400">Category: </strong>
                            {tx.category}
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-slate-500 font-mono-num">
                        ID: {tx.id}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div
          className={`flex items-center justify-between gap-2 pt-1 ${
            compact ? 'text-[11px]' : 'text-xs'
          }`}
        >
          <button
            type="button"
            disabled={safePage <= 1}
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            className="px-3 py-1.5 rounded-xl bg-[#111724] hover:bg-[#192235] border border-[#243047] text-slate-300 font-bold flex items-center gap-1 disabled:opacity-40 cursor-pointer transition"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            <span>Prev</span>
          </button>

          <span className="text-slate-400 font-mono-num">
            Page {safePage} of {totalPages}
          </span>

          <button
            type="button"
            disabled={safePage >= totalPages}
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            className="px-3 py-1.5 rounded-xl bg-[#111724] hover:bg-[#192235] border border-[#243047] text-slate-300 font-bold flex items-center gap-1 disabled:opacity-40 cursor-pointer transition"
          >
            <span>Next</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
};
