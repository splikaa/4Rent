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
  ChevronRight,
  Sparkles,
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
import { loadReadingLogs } from '../../services/storageService';

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
  const meterLogs = loadReadingLogs(room.id);

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
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 md:p-6 overflow-y-auto">
      <div className="w-full max-w-4xl bg-[#101622] border border-[#232F46] rounded-3xl shadow-2xl overflow-hidden my-auto max-h-[92vh] flex flex-col animate-modal-pop">
        {/* Header — Aligned & Wrapped-Proof for All Screen Sizes */}
        <div className="flex items-center justify-between gap-3 px-4 sm:px-6 py-4 border-b border-[#202B3F] bg-[#141C2B] shrink-0">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
              <DoorOpen className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-base sm:text-lg md:text-xl font-black text-white tracking-tight whitespace-nowrap">
                  {roomTitle}
                </h3>
                <span
                  className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider border shrink-0 ${
                    isOccupied
                      ? 'bg-amber-500/15 text-amber-400 border-amber-500/30'
                      : 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      isOccupied ? 'bg-amber-400' : 'bg-emerald-400'
                    }`}
                  />
                  {isOccupied ? 'Occupied' : 'Vacant'}
                </span>
              </div>
              <p className="text-[11px] sm:text-xs text-slate-400 truncate mt-0.5">
                Room Overview • Continuous Sub-Meter • Official Receipt & History
              </p>
            </div>
          </div>

          {/* Header Action Controls */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => {
                onClose();
                onEditRoom(room);
              }}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#1A2335] hover:bg-[#24314A] text-xs font-bold text-slate-200 border border-[#2A3955] cursor-pointer transition btn-fluid"
              title="Edit room configuration"
            >
              <Edit2 className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span className="hidden sm:inline">Edit Room</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close Modal"
              className="w-9 h-9 rounded-xl bg-[#1A2335] hover:bg-[#24314A] flex items-center justify-center text-slate-400 hover:text-white border border-[#2A3955] cursor-pointer transition btn-fluid"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Scrollable Content Container */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-4 sm:space-y-5">
          {/* Summary Statistics Grid — Symmetrical on Both Mobile & Desktop (No Orphan Slots) */}
          <div
            className={`grid ${
              isOccupied
                ? 'grid-cols-2 sm:grid-cols-4'
                : 'grid-cols-3'
            } gap-2.5 sm:gap-3.5`}
          >
            {/* Monthly Rent */}
            <div className="bg-[#0B0F17] border border-[#1E293D] rounded-2xl p-3 sm:p-4 flex flex-col justify-between">
              <span className="text-[10px] sm:text-[11px] uppercase tracking-wider text-slate-400 font-bold">
                Monthly Rent
              </span>
              <p className="text-sm sm:text-base md:text-lg font-black text-white font-mono-num mt-1 truncate">
                {formatPesoPrivacy(room.monthlyRent, privacyMaskEnabled)}
              </p>
            </div>

            {/* Continuous Sub-Meter */}
            <div className="bg-[#0B0F17] border border-[#1E293D] rounded-2xl p-3 sm:p-4 flex flex-col justify-between">
              <span className="text-[10px] sm:text-[11px] uppercase tracking-wider text-slate-400 font-bold flex items-center gap-1">
                Continuous Meter
              </span>
              <p className="text-sm sm:text-base md:text-lg font-black text-amber-400 font-mono-num mt-1 flex items-center gap-1 truncate">
                <Zap className="w-3.5 h-3.5 shrink-0" />
                <span>{room.lastMeterReading.toFixed(1)} kWh</span>
              </p>
            </div>

            {/* Security Deposit */}
            <div className="bg-[#0B0F17] border border-[#1E293D] rounded-2xl p-3 sm:p-4 flex flex-col justify-between">
              <span className="text-[10px] sm:text-[11px] uppercase tracking-wider text-slate-400 font-bold truncate">
                {isOccupied ? 'Security Deposit' : 'Req. Deposit'}
              </span>
              <p className="text-sm sm:text-base md:text-lg font-black text-emerald-400 font-mono-num mt-1 flex items-center gap-1 truncate">
                <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                <span>{formatPesoPrivacy(safeDeposit, privacyMaskEnabled)}</span>
              </p>
            </div>

            {/* Advance Balance (Occupied Only) */}
            {isOccupied && (
              <div className="bg-[#0B0F17] border border-[#1E293D] rounded-2xl p-3 sm:p-4 flex flex-col justify-between">
                <span className="text-[10px] sm:text-[11px] uppercase tracking-wider text-slate-400 font-bold truncate">
                  Advance Bal.
                </span>
                <p className="text-sm sm:text-base md:text-lg font-black text-emerald-400 font-mono-num mt-1 flex items-center gap-1 truncate">
                  <Wallet className="w-3.5 h-3.5 shrink-0" />
                  <span>{formatPesoPrivacy(safeAdvance, privacyMaskEnabled)}</span>
                </p>
              </div>
            )}
          </div>

          {/* Current Tenant & Billing Schedule — Cohesive Structured Panel */}
          <div className="bg-[#0B0F17] border border-[#1E293D] rounded-2xl p-4 sm:p-5">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
              {/* Left Column: Tenant Status & Rates (7 cols on Desktop) */}
              <div className="lg:col-span-7 flex flex-col justify-between space-y-3">
                <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-blue-400">
                  <User className="w-3.5 h-3.5 shrink-0" />
                  <span>Current Tenant & Billing Rate</span>
                </div>

                {isOccupied && room.tenant ? (
                  <div className="space-y-2.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-base sm:text-lg font-black text-white">
                        {room.tenant.fullName}
                      </span>
                      {room.tenant.validIdVerified !== false && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold">
                          <ShieldCheck className="w-3 h-3" />
                          ID Verified
                        </span>
                      )}
                      {room.tenant.privacyConsentSigned !== false && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-300 border border-blue-500/30 text-[10px] font-bold">
                          RA 10173 Signed
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-slate-300">
                      <div className="flex items-center gap-1.5 font-mono-num">
                        <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span>
                          {room.tenant.phone
                            ? privacyMaskEnabled
                              ? maskPhoneNumber(room.tenant.phone)
                              : formatPhoneNumber(room.tenant.phone)
                            : 'No phone registered'}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span>Move-In: {room.tenant.moveInDate}</span>
                      </div>
                      {room.tenant.messengerUsername && (
                        <div className="flex items-center gap-1.5 text-blue-400">
                          <MessageCircle className="w-3.5 h-3.5 shrink-0" />
                          <span>m.me/{room.tenant.messengerUsername}</span>
                        </div>
                      )}
                      <div className="flex items-center gap-1.5 text-amber-400 font-bold font-mono-num">
                        <Zap className="w-3.5 h-3.5 shrink-0" />
                        <span>Rate: {formatPeso(activeElectricRate)}/kWh</span>
                      </div>
                    </div>

                    {room.tenant.emergencyContact && (
                      <div className="text-[11px] text-slate-400 pt-1 border-t border-[#1C263A] flex items-center gap-1.5">
                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
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
                  <div className="rounded-xl bg-[#111724] border border-emerald-500/30 p-3.5">
                    <p className="text-xs sm:text-sm font-extrabold text-emerald-400 flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4 shrink-0" />
                      <span>Vacant • Available for Inquiry & Booking</span>
                    </p>
                    <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                      No active tenant or advance balance. Continuous sub-meter stands at{' '}
                      <strong className="text-amber-400 font-mono-num">
                        {room.lastMeterReading.toFixed(1)} kWh
                      </strong>{' '}
                      (@ {formatPeso(globalElectricRate)}/kWh). Ready for immediate booking.
                    </p>
                  </div>
                )}
              </div>

              {/* Right Column: Next-Month Due Schedule Card (5 cols on Desktop) */}
              <div className="lg:col-span-5 bg-[#121927] border border-amber-500/25 rounded-2xl p-4 flex flex-col justify-center">
                <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span>Auto Next-Month Due</span>
                </span>
                <p className="text-base sm:text-lg font-black text-amber-400 mt-1 font-mono-num">
                  {isOccupied ? formattedDueDate : 'Day 1 to 10 Window'}
                </p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  {isOccupied
                    ? `Scheduled Day ${safeDueDay} (1st–10th Payment Window)`
                    : 'Auto-schedules Day 1–10 upon tenant move-in'}
                </p>
              </div>
            </div>

            {/* Primary Action Buttons Row — Strong Hierarchy & Responsive Alignment */}
            <div
              className={`mt-4 pt-4 border-t border-[#1C263A] grid grid-cols-1 ${
                isOccupied && activeBill
                  ? 'sm:grid-cols-3'
                  : isOccupied || activeBill
                  ? 'sm:grid-cols-2'
                  : 'sm:grid-cols-1'
              } gap-2 sm:gap-2.5`}
            >
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenScannerForRoom(room);
                }}
                className="w-full h-11 flex items-center justify-center gap-2 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-xs cursor-pointer shadow-lg shadow-amber-500/20 transition btn-fluid"
              >
                <Camera className="w-4 h-4 shrink-0" />
                <span>Scan Sub-Meter / Bill</span>
              </button>

              {activeBill && (
                <button
                  type="button"
                  onClick={() => onOpenReceipt(activeBill)}
                  className="w-full h-11 flex items-center justify-center gap-2 px-4 rounded-xl bg-[#182133] hover:bg-[#212E46] text-white font-bold text-xs border border-[#2B3B59] cursor-pointer transition btn-fluid"
                >
                  <Receipt className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>Receipt (#{activeBill.receiptNo})</span>
                </button>
              )}

              {isOccupied && (
                <button
                  type="button"
                  onClick={() => onOpenAdvanceModal(room)}
                  className="w-full h-11 flex items-center justify-center gap-2 px-4 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 font-bold text-xs border border-emerald-500/30 cursor-pointer transition btn-fluid"
                >
                  <Wallet className="w-4 h-4 shrink-0" />
                  <span>Add / Withdraw Advance</span>
                </button>
              )}
            </div>
          </div>

          {/* Sub-Meter Usage History & Reading Logs (Feature 19) */}
          <div className="bg-[#0B0F17] border border-[#1E293D] rounded-2xl p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3.5">
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-amber-400" />
                <h4 className="text-xs font-black uppercase tracking-wider text-white">
                  Sub-Meter Usage History & Reading Logs ({meterLogs.length})
                </h4>
              </div>
              <span className="text-[11px] text-slate-400">
                Persistent kWh readings & verification history
              </span>
            </div>

            {meterLogs.length === 0 ? (
              <div className="text-center py-6 text-xs text-slate-500">
                No sub-meter reading logs recorded for {roomTitle} yet. Readings will automatically appear here when scanned.
              </div>
            ) : (
              <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                {meterLogs.map((log) => (
                  <div
                    key={log.id}
                    className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-xl bg-[#111724] border border-[#1E293D] text-xs hover:border-amber-500/40 transition"
                  >
                    <div className="flex items-center gap-3">
                      {log.cropDataUrl || log.photoDataUrl ? (
                        <img
                          src={log.cropDataUrl || log.photoDataUrl}
                          alt="Meter Proof"
                          className="w-10 h-10 object-cover rounded-lg border border-[#2B3B59] shrink-0"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0">
                          <Zap className="w-4 h-4 text-amber-400" />
                        </div>
                      )}
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono-num font-black text-amber-400 text-sm">
                            {log.readingKwh.toFixed(1)} kWh
                          </span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 font-bold font-mono-num">
                            +{log.consumptionDeltaKwh.toFixed(1)} kWh
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-400 font-mono-num mt-0.5">
                          {new Date(log.readingDate).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                          })}
                          {log.tenantName ? ` • ${log.tenantName}` : ''}
                        </p>
                      </div>
                    </div>
                    <span className="px-2 py-0.5 rounded-lg bg-[#182133] text-slate-300 text-[10px] font-semibold uppercase tracking-wider">
                      {log.source === 'ocr_scan' ? 'OCR Verified' : log.source === 'rollover' ? 'Dial Rollover' : 'Manual'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Room Receipts & Previous Transactions Ledger */}
          <div className="bg-[#0B0F17] border border-[#1E293D] rounded-2xl p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3.5">
              <div className="flex items-center gap-2">
                <Receipt className="w-4 h-4 text-amber-400" />
                <h4 className="text-xs font-black uppercase tracking-wider text-white">
                  Room Receipts & Previous Transactions ({roomBills.length})
                </h4>
              </div>
              <span className="text-[11px] text-slate-400">
                Tap any transaction to view official receipt
              </span>
            </div>

            {roomBills.length === 0 ? (
              <div className="text-center py-8 text-xs text-slate-500">
                No billing statements generated for {roomTitle} yet.
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
                          cls: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
                          icon: CheckCircle2,
                        }
                      : bill.status === 'partial'
                      ? {
                          label: 'PARTIAL',
                          cls: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
                          icon: Clock,
                        }
                      : {
                          label: 'UNPAID',
                          cls: 'bg-red-500/15 text-red-400 border-red-500/30',
                          icon: AlertCircle,
                        };
                  const StatusIcon = statusBadge.icon;

                  return (
                    <div
                      key={bill.id}
                      onClick={() => onOpenReceipt(bill)}
                      className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-2xl border transition-all cursor-pointer group ${
                        isCurrentActiveReceipt
                          ? 'bg-[#151D2C] border-amber-500/40 hover:border-amber-500 shadow-md'
                          : 'bg-[#111724] border-[#1E293D] hover:border-[#2D3E5D]'
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs font-black text-white">
                            {bill.billingPeriod}
                          </span>
                          <span className="text-[11px] font-mono-num text-slate-400 font-semibold">
                            #{bill.receiptNo}
                          </span>
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold border ${statusBadge.cls}`}
                          >
                            <StatusIcon className="w-3 h-3" />
                            {statusBadge.label}
                          </span>
                          {isCurrentActiveReceipt && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                              Active Receipt
                            </span>
                          )}
                        </div>

                        <p className="text-[11px] text-slate-400 mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span>
                            Tenant:{' '}
                            <strong className="text-slate-200">
                              {bill.tenantName}
                            </strong>
                          </span>
                          <span>•</span>
                          <span className="font-mono-num text-amber-400">
                            Meter: {bill.prevReading.toFixed(1)} →{' '}
                            {bill.currReading.toFixed(1)} kWh (
                            {bill.consumptionKwh.toFixed(1)} kWh)
                          </span>
                        </p>
                      </div>

                      <div className="flex items-center justify-between sm:justify-end gap-3 font-mono-num shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-[#1E293D]">
                        <div className="text-left sm:text-right">
                          <p className="text-sm sm:text-base font-black text-white">
                            {formatPeso(bill.totalAmountDue)}
                          </p>
                          <div className="flex items-center gap-2 text-[11px] font-bold">
                            <span className="text-emerald-400">
                              Paid: {formatPeso(bill.amountPaid)}
                            </span>
                            {bill.remainingBalance > 0 && (
                              <span className="text-red-400">
                                Due: {formatPeso(bill.remainingBalance)}
                              </span>
                            )}
                          </div>
                        </div>
                        <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-amber-400 group-hover:translate-x-0.5 transition" />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Advance Payment Ledger (Occupied & Has Ledger History) */}
          {isOccupied && advanceHistory.length > 0 && (
            <div className="bg-[#0B0F17] border border-[#1E293D] rounded-2xl p-4 sm:p-5">
              <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-emerald-400 mb-3">
                <Wallet className="w-4 h-4" />
                <span>Advance Payment & Withdrawal Ledger ({advanceHistory.length})</span>
              </div>
              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {advanceHistory.map((tx) => {
                  const isCredit =
                    tx.type === 'overpayment_credit' ||
                    tx.type === 'manual_deposit';
                  return (
                    <div
                      key={tx.id}
                      className="flex items-center justify-between p-2.5 rounded-xl bg-[#111724] border border-[#1E293D] text-xs"
                    >
                      <div className="flex items-center gap-2">
                        {isCredit ? (
                          <ArrowDownLeft className="w-4 h-4 text-emerald-400 shrink-0" />
                        ) : (
                          <ArrowUpRight className="w-4 h-4 text-amber-400 shrink-0" />
                        )}
                        <div>
                          <p className="font-bold text-white">
                            {tx.type === 'withdrawal'
                              ? 'Advance Withdrawal'
                              : tx.type === 'applied_to_bill'
                              ? 'Applied to Room Bill'
                              : 'Advance Credit'}
                          </p>
                          <p className="text-[10px] text-slate-400 font-mono-num">
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
                          className={`font-black ${
                            isCredit ? 'text-emerald-400' : 'text-amber-400'
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
            <div className="bg-[#0B0F17] border border-[#1E293D] rounded-2xl p-4 sm:p-5">
              <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-300 mb-3">
                <History className="w-4 h-4 text-amber-400" />
                <span>Previous Tenants in {roomTitle} ({previousTenants.length})</span>
              </div>
              <div className="space-y-2">
                {previousTenants.map((pt) => (
                  <div
                    key={pt.id}
                    className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-xl bg-[#111724] border border-[#1E293D] text-xs"
                  >
                    <div>
                      <p className="font-extrabold text-white">{pt.tenantName}</p>
                      <p className="text-[11px] text-slate-400">
                        Stayed: {pt.moveInDate} to {pt.moveOutDate} • Final Meter:{' '}
                        <span className="font-mono-num text-amber-400 font-bold">
                          {pt.finalMeterReading.toFixed(1)} kWh
                        </span>
                      </p>
                    </div>
                    <span className="px-2.5 py-1 rounded-lg bg-[#182133] text-slate-300 text-[11px] font-semibold">
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
