import type { BillRecord } from '../types/rental';
import type { RoomDepositStatus } from './financialEngine';

export interface DepositStatusUiMeta {
  shortLabel: string;
  fullLabel: string;
  compactBadgeClass: string;
  pillBadgeClass: string;
  subtextClass: string;
}

export function getDepositStatusMeta(
  status: RoomDepositStatus['status']
): DepositStatusUiMeta {
  switch (status) {
    case 'paid':
      return {
        shortLabel: 'Paid',
        fullLabel: 'Paid in Full',
        compactBadgeClass: 'bg-emerald-500/20 text-emerald-300',
        pillBadgeClass:
          'bg-emerald-500/15 text-emerald-300 border-emerald-500/35',
        subtextClass: 'text-emerald-300',
      };
    case 'partial':
      return {
        shortLabel: 'Partial',
        fullLabel: 'Partially Paid',
        compactBadgeClass: 'bg-amber-500/20 text-amber-300',
        pillBadgeClass: 'bg-amber-500/15 text-amber-300 border-amber-500/35',
        subtextClass: 'text-amber-300',
      };
    default:
      return {
        shortLabel: 'Unpaid',
        fullLabel: 'Unpaid',
        compactBadgeClass: 'bg-rose-500/20 text-rose-300',
        pillBadgeClass: 'bg-rose-500/15 text-rose-300 border-rose-500/35',
        subtextClass: 'text-amber-300',
      };
  }
}

export interface BillTabStatusUiMeta {
  label: string;
  badgeClass: string;
  summaryText: string;
}

export function getBillTabStatusMeta(
  activeBill: BillRecord | null,
  formatAmount: (amount: number) => string
): BillTabStatusUiMeta {
  if (!activeBill) {
    return {
      label: 'No Bill',
      badgeClass: 'bg-slate-800 text-slate-300',
      summaryText: 'Generate receipt first',
    };
  }
  if (activeBill.remainingBalance > 0) {
    return {
      label: 'Due',
      badgeClass: 'bg-amber-500/20 text-amber-300',
      summaryText: `${formatAmount(activeBill.remainingBalance)} left`,
    };
  }
  return {
    label: 'Paid',
    badgeClass: 'bg-emerald-500/20 text-emerald-300',
    summaryText: 'Settled (₱0.00)',
  };
}

export function getReceiptDepositLabel(
  required: number,
  unpaid: number,
  formatAmount: (amount: number) => string
): string {
  if (required <= 0) {
    return 'Required Security Deposit Held';
  }
  if (unpaid <= 0) {
    return 'Required Security Deposit (Paid & Held)';
  }
  return `Required Security Deposit (${formatAmount(unpaid)} Unpaid)`;
}
