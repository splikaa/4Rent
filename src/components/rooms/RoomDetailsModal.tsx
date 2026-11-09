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
  MessageCircle,
} from 'lucide-react';
import {
  Room,
  BillRecord,
  TenantHistoryEntry,
} from '../../types/rental';
import {
  clampDueDayOneToTen,
  formatPeso,
  formatPesoPrivacy,
  formatPhoneNumber,
  maskPhoneNumber,
  getNextDueDateInOneToTenWindow,
} from '../../utils/billingCalculator';

interface RoomDetailsModalProps {
  room: Room | null;
  activeBill: BillRecord | null;
  roomBills: BillRecord[];
  previousTenants: TenantHistoryEntry[];
  globalElectricRate: number;
  privacyMaskEnabled?: boolean;
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
  privacyMaskEnabled = false,
  onClose,
  onEditRoom,
  onOpenScannerForRoom,
  onOpenReceipt,
  onOpenAdvanceModal,
}) => {
  if (!room) return null;

  const isOccupied = room.status === 'occupied';
  const safeDeposit =
    room.securityDeposit > 0 ? room.securityDeposit : room.monthlyRent;
  const safeAdvance = isOccupied ? Math.max(0, room.advanceRent || 0) : 0;

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

  const advanceHistory = isOccupied ? room.advanceHistory || [] : [];
  const roomTitle = /^\d+$/.test(room.name.trim())
    ? `Room ${room.name.trim()}`
    : room.name;
  const activeElectricRate = activeBill?.electricRate ?? globalElectricRate;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
      <div className="w-full max-w-2xl bg-[#111622] border border-[#1E2638] rounded-3xl shadow-2xl overflow-hidden my-auto max-h-[90vh] flex flex-col animate-modal-pop">
        {/* Header */}
        <div className="flex items-center justify-between px-6 sm:px-7 py-5 border-b border-[#1E2638] bg-[#131926] shrink-0">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-2xl bg-[#F59E0B]/15 border border-[#F59E0B]/30 flex items-center justify-center text-[#F59E0B] shrink-0">
              <DoorOpen className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h3 className="text-lg font-extrabold text-white leading-tight">
                  {roomTitle}
                </h3>
                <span
                  className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
                    isOccupied
                      ? 'bg-[#F59E0B]/15 text-[#F59E0B] border-[#F59E0B]/30'
                      : 'bg-[#10B981]/15 text-[#10B981] border-[#10B981]/30'
                  }`}
                >
                  {isOccupied ? 'Occupied' : 'Vacant'}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Room Details & Billing Summary
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
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#1A2234] hover:bg-slate-800 text-xs font-bold text-slate-200 border border-[#242F46] cursor-pointer transition-colors"
            >
              <Edit2 className="w-3.5 h-3.5 text-[#F59E0B]" />
              Edit Room
            </button>
            <button
              type="button"
              onClick={onClose}
              className="w-9 h-9 rounded-xl bg-[#1A2234] hover:bg-slate-800 flex items-center justify-center text-slate-400 hover:text-white cursor-pointer transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="p-6 sm:p-7 overflow-y-auto space-y-6">
          {/* Top Metrics Grid — 4 columns when Occupied, 3 columns when Vacant */}
          <div
            className={`grid grid-cols-2 ${
              isOccupied ? 'sm:grid-cols-4' : 'sm:grid-cols-3'
            } gap-3 sm:gap-4`}
          >
            <div className="bg-[#0B0F17] border border-[#1E2638] rounded-2xl p-4 flex flex-col justify-between">
              <p className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">
                Monthly Rent
              </p>
              <p className="text-base font-extrabold text-white font-mono-num mt-1.5">
                {formatPesoPrivacy(room.monthlyRent, privacyMaskEnabled)}
              </p>
            </div>

            <div className="bg-[#0B0F17] border border-[#1E2638] rounded-2xl p-4 flex flex-col justify-between">
              <p className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">
                Continuous Meter
              </p>
              <p className="text-base font-extrabold text-[#F59E0B] font-mono-num mt-1.5 flex items-center gap-1">
                <Zap className="w-3.5 h-3.5 shrink-0" />
                <span>{room.lastMeterReading.toFixed(1)} kWh</span>
              </p>
            </div>

            <div className="bg-[#0B0F17] border border-[#1E2638] rounded-2xl p-4 flex flex-col justify-between">
              <p className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">
                {isOccupied ? 'Security Deposit' : 'Required Deposit'}
              </p>
              <p className="text-base font-extrabold text-[#10B981] font-mono-num mt-1.5 flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                <span>{formatPesoPrivacy(safeDeposit, privacyMaskEnabled)}</span>
              </p>
            </div>

            {isOccupied && (
              <div className="bg-[#0B0F17] border border-[#1E2638] rounded-2xl p-4 flex flex-col justify-between">
                <p className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">
                  Advance Balance
                </p>
                <p className="text-base font-extrabold text-[#10B981] font-mono-num mt-1.5 flex items-center gap-1">
                  <Wallet className="w-3.5 h-3.5 shrink-0" />
                  <span>{formatPesoPrivacy(safeAdvance, privacyMaskEnabled)}</span>
                </p>
              </div>
            )}
          </div>

          {/* Current Tenant & Auto Next-Month Due Date — Symmetrical 12-Column Grid */}
          <div className="bg-[#0B0F17] border border-[#1E2638] rounded-2xl p-5 sm:p-6">
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-5 items-stretch">
              {/* Left 7 Columns: Tenant Details */}
              <div className="sm:col-span-7 flex flex-col justify-center">
                <p className="text-[11px] font-bold uppercase tracking-wider text-[#3B82F6] mb-2.5 flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5" />
                  Current Tenant & Billing Rate
                </p>

                {isOccupied && room.tenant ? (
                  <div className="space-y-2.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-lg font-extrabold text-white leading-snug">
                        {room.tenant.fullName}
                      </p>
                      {room.tenant.validIdVerified !== false && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#10B981]/15 text-[#10B981] border border-[#10B981]/30 text-[10px] font-bold">
                          <ShieldCheck className="w-3 h-3" />
                          ID Verified
                        </span>
                      )}
                      {room.tenant.privacyConsentSigned !== false && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-400 border border-blue-500/30 text-[10px] font-bold">
                          RA 10173 Signed
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-slate-300">
                      <span className="inline-flex items-center gap-1.5 font-mono-num">
                        <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        {room.tenant.phone
                          ? privacyMaskEnabled
                            ? maskPhoneNumber(room.tenant.phone)
                            : formatPhoneNumber(room.tenant.phone)
                          : 'No mobile number'}
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        Move-In: {room.tenant.moveInDate}
                      </span>
                      {room.tenant.messengerUsername && (
                        <span className="inline-flex items-center gap-1.5 text-blue-400">
                          <MessageCircle className="w-3.5 h-3.5 shrink-0" />
                          m.me/{room.tenant.messengerUsername}
                        </span>
                      )}
                      <span className="inline-flex items-center gap-1.5 text-[#F59E0B] font-bold font-mono-num">
                        <Zap className="w-3.5 h-3.5 shrink-0" />
                        Rate: {formatPeso(activeElectricRate)}/kWh
                      </span>
                    </div>
                    {room.tenant.emergencyContact && (
                      <div className="pt-1.5 text-[11px] text-slate-400 flex items-center gap-1.5">
                        <ShieldCheck className="w-3.5 h-3.5 text-[#10B981] shrink-0" />
                        <span>
                          Emergency Contact:{' '}
                          <strong className="text-slate-200">
                            {room.tenant.emergencyContact}
                          </strong>
                        </span>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="rounded-xl bg-[#111622] border border-[#10B981]/30 px-3.5 py-3">
                    <p className="text-sm font-bold text-[#10B981]">
                      Vacant • Available for Inquiry & Booking
                    </p>
                    <p className="text-xs text-slate-400 mt-1">
                      No active tenant or advance balance. Continuous sub-meter
                      stands at{' '}
                      <strong className="text-[#F59E0B] font-mono-num">
                        {room.lastMeterReading.toFixed(1)} kWh
                      </strong>{' '}
                      (@ {formatPeso(globalElectricRate)}/kWh).
                    </p>
                  </div>
                )}
              </div>

              {/* Right 5 Columns: Auto Next-Month Due Box */}
              <div className="sm:col-span-5 bg-[#111622] border border-[#F59E0B]/30 rounded-2xl p-3.5 flex flex-col justify-center sm:text-right">
                <p className="text-[10px] uppercase tracking-wider text-slate-400 font-bold flex items-center sm:justify-end gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-[#F59E0B] shrink-0" />
                  <span>Auto Next-Month Due</span>
                </p>
                <p className="text-base font-extrabold text-[#F59E0B] mt-1">
                  {isOccupied ? formattedDueDate : 'Day 1 to 10 Window'}
                </p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  {isOccupied
                    ? `Scheduled Day ${safeDueDay} (1st–10th Window)`
                    : 'Auto-schedules upon tenant move-in'}
                </p>
              </div>
            </div>

            {/* Aligned Equal-Width Action Buttons Row */}
            <div
              className={`mt-4 pt-4 border-t border-[#1E2638] grid grid-cols-1 ${
                isOccupied && activeBill
                  ? 'sm:grid-cols-3'
                  : isOccupied || activeBill
                  ? 'sm:grid-cols-2'
                  : 'sm:grid-cols-1'
              } gap-2.5`}
            >
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenScannerForRoom(room);
                }}
                className="w-full flex items-center justify-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-[#F59E0B] hover:bg-[#D97706] text-slate-950 font-extrabold text-xs cursor-pointer transition-colors"
              >
                <Camera className="w-3.5 h-3.5 shrink-0" />
                <span>Scan Sub-Meter / Bill</span>
              </button>

              {activeBill && (
                <button
                  type="button"
                  onClick={() => onOpenReceipt(activeBill)}
                  className="w-full flex items-center justify-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-[#1A2234] hover:bg-slate-800 text-white font-bold text-xs border border-[#242F46] cursor-pointer transition-colors"
                >
                  <Receipt className="w-3.5 h-3.5 text-[#F59E0B] shrink-0" />
                  <span>Receipt (#{activeBill.receiptNo})</span>
                </button>
              )}

              {isOccupied && (
                <button
                  type="button"
                  onClick={() => onOpenAdvanceModal(room)}
                  className="w-full flex items-center justify-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-[#10B981]/15 hover:bg-[#10B981]/25 text-[#10B981] font-bold text-xs border border-[#10B981]/30 cursor-pointer transition-colors"
                >
                  <Wallet className="w-3.5 h-3.5 shrink-0" />
                  <span>Add / Withdraw Advance</span>
                </button>
              )}
            </div>
          </div>

          {/* Previous Transactions / Billing History for This Room */}
          <div className="bg-[#0B0F17] border border-[#1E2638] rounded-2xl p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3.5">
              <p className="text-xs font-bold uppercase tracking-wider text-white flex items-center gap-1.5">
                <Receipt className="w-4 h-4 text-[#F59E0B]" />
                Room Receipts & Previous Transactions ({roomBills.length})
              </p>
              <span className="text-[11px] text-slate-400">
                Click any transaction to open receipt
              </span>
            </div>

            {roomBills.length === 0 ? (
              <div className="text-center py-6 text-xs text-slate-500">
                No billing transactions generated for {room.name} yet.
              </div>
            ) : (
              <div className="space-y-2.5">
                {roomBills.map((bill) => {
                  const isCurrentActiveReceipt =
                    activeBill && bill.id === activeBill.id;

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
                      className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl bg-[#111622] hover:bg-[#161D2C] border border-[#1E2638] hover:border-[#F59E0B]/40 cursor-pointer transition-all"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs font-extrabold text-white">
                            {bill.billingPeriod}
                          </span>
                          <span className="text-[11px] font-mono-num text-slate-400">
                            #{bill.receiptNo}
                          </span>
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${statusBadge.cls}`}
                          >
                            <StatusIcon className="w-3 h-3" />
                            {statusBadge.label}
                          </span>
                          {isCurrentActiveReceipt ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#F59E0B]/15 text-[#F59E0B] border border-[#F59E0B]/30">
                              Active Receipt
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-800 text-slate-400">
                              Previous Transaction
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-400 mt-1.5">
                          Tenant:{' '}
                          <span className="text-slate-200 font-semibold">
                            {bill.tenantName}
                          </span>{' '}
                          • Meter:{' '}
                          <span className="font-mono-num text-[#F59E0B] font-semibold">
                            {bill.prevReading.toFixed(1)} →{' '}
                            {bill.currReading.toFixed(1)} kWh (
                            {bill.consumptionKwh.toFixed(1)} kWh)
                          </span>
                        </p>
                      </div>

                      <div className="text-left sm:text-right font-mono-num shrink-0">
                        <p className="text-sm font-extrabold text-white">
                          {formatPeso(bill.totalAmountDue)}
                        </p>
                        <p className="text-[11px] text-[#10B981] font-semibold">
                          Paid: {formatPeso(bill.amountPaid)}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Advance Payment Ledger for This Room (Only when Occupied & has history) */}
          {isOccupied && advanceHistory.length > 0 && (
            <div className="bg-[#0B0F17] border border-[#1E2638] rounded-2xl p-4 sm:p-5">
              <p className="text-xs font-bold uppercase tracking-wider text-[#10B981] flex items-center gap-1.5 mb-3">
                <Wallet className="w-4 h-4" />
                Advance Payment & Withdrawal Ledger ({advanceHistory.length})
              </p>
              <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                {advanceHistory.map((tx) => {
                  const isCredit =
                    tx.type === 'overpayment_credit' ||
                    tx.type === 'manual_deposit';
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
                            {new Date(tx.createdAt).toLocaleDateString(
                              'en-US',
                              {
                                month: 'short',
                                day: 'numeric',
                                year: 'numeric',
                              }
                            )}
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
            <div className="bg-[#0B0F17] border border-[#1E2638] rounded-2xl p-4 sm:p-5">
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
                        Stayed: {pt.moveInDate} to {pt.moveOutDate} • Exit
                        Meter:{' '}
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
