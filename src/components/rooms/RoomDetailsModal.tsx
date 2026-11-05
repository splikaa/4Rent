import React from 'react';
import {
  X,
  DoorOpen,
  User,
  Phone,
  Zap,
  ShieldCheck,
  Wallet,
  Receipt,
  Calendar,
  History,
  Edit2,
  Camera,
  CheckCircle2,
  AlertCircle,
  Clock,
  ArrowDownLeft,
  ArrowUpRight,
} from 'lucide-react';
import {
  Room,
  BillRecord,
  TenantHistoryEntry,
} from '../../types/rental';
import {
  clampDueDayOneToTen,
  formatPeso,
  formatPhoneNumber,
  getNextDueDateInOneToTenWindow,
} from '../../utils/billingCalculator';

interface RoomDetailsModalProps {
  room: Room | null;
  activeBill: BillRecord | null;
  roomBills: BillRecord[];
  previousTenants: TenantHistoryEntry[];
  globalElectricRate: number;
  onClose: () => void;
  onEditRoom: (room: Room) => void;
  onOpenScannerForRoom: (room: Room) => void;
  onOpenReceipt: (bill: BillRecord) => void;
  onOpenAdvanceModal: (room: Room) => void;
}

export const RoomDetailsModal: React.FC<RoomDetailsModalProps> = ({
  room,
  activeBill,
  roomBills,
  previousTenants,
  globalElectricRate,
  onClose,
  onEditRoom,
  onOpenScannerForRoom,
  onOpenReceipt,
  onOpenAdvanceModal,
}) => {
  if (!room) return null;

  const safeDueDay = clampDueDayOneToTen(room.tenant?.dueDayOfMonth || 5);
  const nextDueIso = getNextDueDateInOneToTenWindow(
    safeDueDay,
    room.tenant?.moveInDate
  );
  const formattedDueDate = new Date(nextDueIso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  const advanceHistory = room.advanceHistory || [];

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="w-full max-w-2xl bg-[#111622] border border-[#1E2638] rounded-3xl shadow-2xl overflow-hidden my-auto max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#1E2638] bg-[#131926] shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#F59E0B]/15 border border-[#F59E0B]/30 flex items-center justify-center text-[#F59E0B]">
              <DoorOpen className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h3 className="text-lg font-bold text-white leading-tight">{room.name}</h3>
                <span
                  className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
                    room.status === 'occupied'
                      ? 'bg-[#F59E0B]/15 text-[#F59E0B] border-[#F59E0B]/30'
                      : 'bg-[#10B981]/15 text-[#10B981] border-[#10B981]/30'
                  }`}
                >
                  {room.status}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Room Details, Continuous Sub-Meter & Previous Transactions
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                onClose();
                onEditRoom(room);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#1A2234] hover:bg-slate-800 text-xs font-semibold text-slate-200 border border-[#242F46] cursor-pointer transition-colors"
            >
              <Edit2 className="w-3.5 h-3.5 text-[#F59E0B]" />
              Edit Room
            </button>
            <button
              type="button"
              onClick={onClose}
              className="w-9 h-9 rounded-xl bg-[#1A2234] hover:bg-slate-800 flex items-center justify-center text-slate-400 hover:text-white cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="p-6 overflow-y-auto space-y-5">
          {/* Top Metrics Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-[#0B0F17] border border-[#1E2638] rounded-xl p-3">
              <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">
                Monthly Rent
              </p>
              <p className="text-sm font-bold text-white font-mono-num mt-1">
                {formatPeso(room.monthlyRent)}
              </p>
            </div>
            <div className="bg-[#0B0F17] border border-[#1E2638] rounded-xl p-3">
              <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">
                Continuous Meter
              </p>
              <p className="text-sm font-bold text-[#F59E0B] font-mono-num mt-1 flex items-center gap-1">
                <Zap className="w-3.5 h-3.5" />
                {room.lastMeterReading.toFixed(1)} kWh
              </p>
            </div>
            <div className="bg-[#0B0F17] border border-[#1E2638] rounded-xl p-3">
              <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">
                Security Deposit
              </p>
              <p className="text-sm font-bold text-[#10B981] font-mono-num mt-1 flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5" />
                {formatPeso(room.securityDeposit)}
              </p>
            </div>
            <div className="bg-[#0B0F17] border border-[#1E2638] rounded-xl p-3">
              <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">
                Advance Balance
              </p>
              <p className="text-sm font-bold text-[#10B981] font-mono-num mt-1 flex items-center gap-1">
                <Wallet className="w-3.5 h-3.5" />
                {formatPeso(room.advanceRent || 0)}
              </p>
            </div>
          </div>

          {/* Current Tenant & Auto Next-Month Due Date */}
          <div className="bg-[#0B0F17] border border-[#1E2638] rounded-2xl p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-[#3B82F6] mb-1.5 flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5" />
                  Current Tenant & Payment Schedule
                </p>
                {room.status === 'occupied' && room.tenant ? (
                  <div className="space-y-1">
                    <p className="text-base font-bold text-white">{room.tenant.fullName}</p>
                    <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400">
                      <span className="flex items-center gap-1 font-mono-num">
                        <Phone className="w-3.5 h-3.5 text-slate-500" />
                        {room.tenant.phone
                          ? formatPhoneNumber(room.tenant.phone)
                          : 'No mobile number'}
                      </span>
                      <span>•</span>
                      <span>Move-In: {room.tenant.moveInDate}</span>
                      <span>•</span>
                      <span className="text-[#F59E0B] font-semibold">
                        Global Rate: ₱{globalElectricRate.toFixed(2)}/kWh
                      </span>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm font-semibold text-[#10B981]">
                    Available for Booking • Ready for Tenant Move-In
                  </p>
                )}
              </div>

              <div className="bg-[#111622] border border-[#F59E0B]/30 rounded-xl px-3.5 py-2.5 text-right">
                <p className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold flex items-center justify-end gap-1">
                  <Calendar className="w-3 h-3 text-[#F59E0B]" />
                  Auto Next-Month Due (Day 1 to 10)
                </p>
                <p className="text-sm font-bold text-[#F59E0B] mt-0.5">
                  {formattedDueDate}
                </p>
                <p className="text-[10px] text-slate-500">
                  Day {safeDueDay} of Next Month
                </p>
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-[#1E2638] flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenScannerForRoom(room);
                }}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#F59E0B] hover:bg-[#D97706] text-slate-950 font-bold text-xs cursor-pointer transition-colors"
              >
                <Camera className="w-3.5 h-3.5" />
                Scan Dual Sub-Meter / Update Receipt
              </button>
              {activeBill && (
                <button
                  type="button"
                  onClick={() => onOpenReceipt(activeBill)}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#1A2234] hover:bg-slate-800 text-white font-semibold text-xs border border-[#242F46] cursor-pointer transition-colors"
                >
                  <Receipt className="w-3.5 h-3.5 text-[#F59E0B]" />
                  View Official Receipt (#{activeBill.receiptNo})
                </button>
              )}
              <button
                type="button"
                onClick={() => onOpenAdvanceModal(room)}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#10B981]/15 hover:bg-[#10B981]/25 text-[#10B981] font-semibold text-xs border border-[#10B981]/30 cursor-pointer transition-colors"
              >
                <Wallet className="w-3.5 h-3.5" />
                Add / Withdraw Advance
              </button>
            </div>
          </div>

          {/* Previous Transactions / Billing History for This Room */}
          <div className="bg-[#0B0F17] border border-[#1E2638] rounded-2xl p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-bold uppercase tracking-wider text-white flex items-center gap-1.5">
                <Receipt className="w-4 h-4 text-[#F59E0B]" />
                Room Receipts & Previous Transactions ({roomBills.length})
              </p>
              <span className="text-[11px] text-slate-500">Click any transaction to open receipt</span>
            </div>

            {roomBills.length === 0 ? (
              <div className="text-center py-6 text-xs text-slate-500">
                No billing transactions generated for {room.name} yet.
              </div>
            ) : (
              <div className="space-y-2">
                {roomBills.map((bill) => {
                  const statusBadge =
                    bill.status === 'paid'
                      ? {
                          label: 'PAID',
                          cls: 'bg-[#10B981]/15 text-[#10B981] border-[#10B981]/30',
                          icon: CheckCircle2,
                        }
                      : bill.status === 'partial'
                      ? {
                          label: 'PARTIAL',
                          cls: 'bg-[#F59E0B]/15 text-[#F59E0B] border-[#F59E0B]/30',
                          icon: Clock,
                        }
                      : {
                          label: 'UNPAID',
                          cls: 'bg-[#EF4444]/15 text-[#EF4444] border-[#EF4444]/30',
                          icon: AlertCircle,
                        };
                  const StatusIcon = statusBadge.icon;

                  return (
                    <div
                      key={bill.id}
                      onClick={() => onOpenReceipt(bill)}
                      className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-xl bg-[#111622] hover:bg-[#161D2C] border border-[#1E2638] hover:border-[#F59E0B]/40 cursor-pointer transition-all"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-white">{bill.billingPeriod}</span>
                          <span className="text-[11px] font-mono-num text-slate-400">
                            #{bill.receiptNo}
                          </span>
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${statusBadge.cls}`}
                          >
                            <StatusIcon className="w-3 h-3" />
                            {statusBadge.label}
                          </span>
                          {!bill.isArchived && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#F59E0B]/15 text-[#F59E0B]">
                              Active Receipt
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-400 mt-1">
                          Tenant: <span className="text-slate-200 font-medium">{bill.tenantName}</span> • Meter:{' '}
                          <span className="font-mono-num text-[#F59E0B]">
                            {bill.prevReading.toFixed(1)} → {bill.currReading.toFixed(1)} kWh (
                            {bill.consumptionKwh.toFixed(1)} kWh)
                          </span>
                        </p>
                      </div>

                      <div className="text-left sm:text-right font-mono-num">
                        <p className="text-sm font-bold text-white">
                          {formatPeso(bill.totalAmountDue)}
                        </p>
                        <p className="text-[11px] text-[#10B981]">
                          Paid: {formatPeso(bill.amountPaid)}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Advance Payment Ledger for This Room */}
          {advanceHistory.length > 0 && (
            <div className="bg-[#0B0F17] border border-[#1E2638] rounded-2xl p-4">
              <p className="text-xs font-bold uppercase tracking-wider text-[#10B981] flex items-center gap-1.5 mb-3">
                <Wallet className="w-4 h-4" />
                Advance Payment & Withdrawal Ledger ({advanceHistory.length})
              </p>
              <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                {advanceHistory.map((tx) => {
                  const isCredit =
                    tx.type === 'overpayment_credit' || tx.type === 'manual_deposit';
                  return (
                    <div
                      key={tx.id}
                      className="flex items-center justify-between p-2.5 rounded-xl bg-[#111622] border border-[#1E2638] text-xs"
                    >
                      <div className="flex items-center gap-2">
                        {isCredit ? (
                          <ArrowDownLeft className="w-4 h-4 text-[#10B981]" />
                        ) : (
                          <ArrowUpRight className="w-4 h-4 text-[#F59E0B]" />
                        )}
                        <div>
                          <p className="font-semibold text-white">
                            {tx.type === 'withdrawal'
                              ? 'Advance Withdrawal'
                              : tx.type === 'applied_to_bill'
                              ? 'Applied to Room Bill'
                              : 'Advance Credit'}
                          </p>
                          <p className="text-[11px] text-slate-400">
                            {new Date(tx.createdAt).toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric',
                            })}
                          </p>
                        </div>
                      </div>
                      <div className="text-right font-mono-num">
                        <p
                          className={`font-bold ${
                            isCredit ? 'text-[#10B981]' : 'text-[#F59E0B]'
                          }`}
                        >
                          {isCredit ? '+' : '-'}
                          {formatPeso(tx.amount)}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Previous Tenants History for This Room */}
          {previousTenants.length > 0 && (
            <div className="bg-[#0B0F17] border border-[#1E2638] rounded-2xl p-4">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5 mb-3">
                <History className="w-4 h-4 text-[#F59E0B]" />
                Previous Tenants in {room.name} ({previousTenants.length})
              </p>
              <div className="space-y-2">
                {previousTenants.map((pt) => (
                  <div
                    key={pt.id}
                    className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-xl bg-[#111622] border border-[#1E2638] text-xs"
                  >
                    <div>
                      <p className="font-bold text-white">{pt.tenantName}</p>
                      <p className="text-[11px] text-slate-400">
                        Stayed: {pt.moveInDate} to {pt.moveOutDate} • Exit Meter:{' '}
                        <span className="font-mono-num text-[#F59E0B]">
                          {pt.finalMeterReading.toFixed(1)} kWh
                        </span>
                      </p>
                    </div>
                    <span className="px-2.5 py-1 rounded-lg bg-[#1A2234] text-slate-300 text-[11px] font-medium">
                      {pt.reason || 'Moved Out'}
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
