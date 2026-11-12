import React from 'react';
import {
  Archive,
  ArrowLeft,
  Calendar,
  Camera,
  CheckCircle2,
  Edit3,
  History,
  Home,
  Lock,
  MessageCircle,
  Phone,
  ReceiptText,
  ShieldCheck,
  Trash2,
  UserMinus,
  UserPlus,
  Wallet,
} from 'lucide-react';
import { BillRecord, Room } from '../../types/rental';
import {
  formatPeso,
  formatPesoPrivacy,
  getNextDueDateInOneToTenWindow,
  getRoomMonthlyPaymentStatus,
  maskPhoneNumber,
} from '../../utils/billingCalculator';

interface ManageRoomsViewProps {
  rooms: Room[];
  bills: BillRecord[];
  globalElectricRate: number;
  privacyMaskEnabled?: boolean;
  onBack: () => void;
  onOpenAddRoom: () => void;
  onOpenEditRoom: (room: Room) => void;
  onRequestDeleteRoomWithPin: (room: Room) => void;
  onArchiveRoom: (roomId: string) => void;
  onMoveOutTenant: (room: Room, reason: string) => void;
  onOpenScanMeter: (room: Room) => void;
  onOpenRoomReceipt: (bill: BillRecord) => void;
  onOpenAdvanceBalanceModal: (room: Room) => void;
  onSelectRoomDetails: (room: Room) => void;
  onOpenArchiveCenter: () => void;
}

export const ManageRoomsView: React.FC<ManageRoomsViewProps> = ({
  rooms,
  bills,
  globalElectricRate,
  privacyMaskEnabled = false,
  onBack,
  onOpenAddRoom,
  onOpenEditRoom,
  onRequestDeleteRoomWithPin,
  onArchiveRoom,
  onMoveOutTenant,
  onOpenScanMeter,
  onOpenRoomReceipt,
  onOpenAdvanceBalanceModal,
  onSelectRoomDetails,
  onOpenArchiveCenter,
}) => {
  const activeRooms = rooms.filter((r) => !r.isArchived);

  const getRoomActiveReceipt = (room: Room): BillRecord | undefined => {
    if (room.status === 'vacant') return undefined;
    if (room.activeReceiptId) {
      const match = bills.find((b) => b.id === room.activeReceiptId);
      if (match) return match;
    }
    return bills.find((b) => b.roomId === room.id && !b.isArchived);
  };

  return (
    <div className="min-h-screen flex flex-col bg-transparent pb-32 animate-view-enter">
      {/* Top Bar */}
      <header className="sticky top-0 z-20 bg-[#111722]/90 backdrop-blur-xl border-b border-[#232E42] px-5 sm:px-8 h-18 flex items-center justify-between">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to Dashboard"
          className="w-11 h-11 rounded-2xl bg-[#172030] hover:bg-[#1E293D] border border-[#26334B] flex items-center justify-center text-slate-200 transition cursor-pointer btn-fluid"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>

        <div className="text-center">
          <h1 className="text-lg sm:text-xl font-extrabold text-white tracking-tight">
            Manage Rooms
          </h1>
          <p className="text-[11px] text-slate-400 hidden sm:block">
            {activeRooms.length} Active{' '}
            {activeRooms.length === 1 ? 'Unit' : 'Units'} • Continuous Sub-Meter
          </p>
        </div>

        <button
          type="button"
          onClick={onOpenArchiveCenter}
          className="px-4 py-2.5 rounded-2xl bg-[#172030] hover:bg-[#1E293D] border border-[#28354E] text-xs font-bold text-slate-200 flex items-center gap-2 transition cursor-pointer btn-fluid"
        >
          <History className="w-4 h-4 text-amber-400" />
          <span className="hidden sm:inline">Previous Tenants & Archive</span>
        </button>
      </header>

      <div className="flex-1 w-full max-w-6xl mx-auto px-5 sm:px-8 lg:px-12 pt-8 flex flex-col">
        {activeRooms.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center py-24 select-none">
            <button
              type="button"
              onClick={onOpenAddRoom}
              className="w-24 h-24 rounded-[28px] bg-[#282218] hover:bg-[#332B1E] border border-amber-500/25 flex items-center justify-center mb-6 transition cursor-pointer shadow-xl btn-fluid"
            >
              <div className="relative">
                <Home className="w-11 h-11 text-amber-500 fill-amber-500" />
                <div className="absolute -bottom-1 -right-1.5 w-6 h-6 rounded-full bg-amber-500 border-2 border-[#282218] text-slate-950 flex items-center justify-center font-extrabold text-sm leading-none">
                  +
                </div>
              </div>
            </button>
            <h2 className="text-xl sm:text-2xl font-extrabold text-white">
              No rooms yet
            </h2>
            <p className="text-sm text-slate-400 mt-2">
              Tap + to add your first room
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 sm:gap-7">
            {activeRooms.map((room) => {
              const isOccupied = room.status === 'occupied';
              const activeReceipt = getRoomActiveReceipt(room);
              const monthPayStatus = isOccupied
                ? getRoomMonthlyPaymentStatus(room, bills)
                : null;
              const paidDepositCredit = isOccupied
                ? Math.max(0, room.securityDepositPaid || 0)
                : 0;
              const roomBillsCount = bills.filter(
                (b) => b.roomId === room.id
              ).length;
              const nextDueIso = getNextDueDateInOneToTenWindow(
                room.tenant?.dueDayOfMonth || 5,
                room.tenant?.moveInDate
              );
              const nextDueFormatted = new Date(nextDueIso).toLocaleDateString(
                'en-US',
                {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                }
              );

              return (
                <div
                  key={room.id}
                  onClick={() => onSelectRoomDetails(room)}
                  className="surface-card surface-card-interactive rounded-3xl p-6 sm:p-7 flex flex-col justify-between cursor-pointer"
                >
                  <div className="space-y-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h2 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight">
                          {/^\d+$/.test(room.name.trim()) ? `Room ${room.name.trim()}` : room.name}
                        </h2>
                        <p className="text-xs text-slate-400 mt-1">
                          Global Rate:{' '}
                          <strong className="text-amber-400 font-mono-num">
                            {formatPeso(globalElectricRate)}/kWh
                          </strong>{' '}
                          • {roomBillsCount}{' '}
                          {roomBillsCount === 1
                            ? 'Transaction'
                            : 'Transactions'}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center justify-end gap-1.5">
                        {monthPayStatus && (
                          <span
                            className={`px-2.5 py-1 rounded-full text-[11px] font-extrabold inline-flex items-center gap-1 border ${
                              monthPayStatus.status === 'paid'
                                ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/35'
                                : monthPayStatus.status === 'partial'
                                ? 'bg-amber-500/15 text-amber-300 border-amber-500/35'
                                : monthPayStatus.status === 'unpaid'
                                ? 'bg-rose-500/15 text-rose-300 border-rose-500/35'
                                : 'bg-slate-800/80 text-slate-300 border-slate-700'
                            }`}
                          >
                            {monthPayStatus.status === 'paid' && (
                              <CheckCircle2 className="w-3 h-3 shrink-0" />
                            )}
                            <span>{monthPayStatus.badgeText}</span>
                          </span>
                        )}
                        <span
                          className={`px-3.5 py-1 rounded-full text-xs font-bold ${
                            isOccupied
                              ? 'bg-amber-500/15 text-amber-400 border border-amber-500/35'
                              : 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/35'
                          }`}
                        >
                          {isOccupied ? 'Occupied' : 'Vacant'}
                        </span>
                      </div>
                    </div>

                    {/* Financial & Sub-Meter Grid */}
                    <div
                      className={`grid grid-cols-2 ${
                        isOccupied ? 'sm:grid-cols-4' : 'sm:grid-cols-3'
                      } gap-3`}
                    >
                      <div className="rounded-2xl bg-[#0D121B] border border-[#202B40] p-3">
                        <span className="text-[10px] uppercase text-slate-400 font-semibold block">
                          Monthly Rent
                        </span>
                        <span className="text-sm font-extrabold text-white font-mono-num mt-1 block">
                          {formatPesoPrivacy(
                            room.monthlyRent,
                            privacyMaskEnabled
                          )}
                        </span>
                      </div>
                      <div
                        className="rounded-2xl bg-[#0D121B] border border-[#202B40] p-3"
                        title="Sub-Meter kWh continues even when tenant changes"
                      >
                        <span className="text-[10px] uppercase text-slate-400 font-semibold block">
                          Sub-Meter (Cont.)
                        </span>
                        <span className="text-sm font-extrabold text-amber-400 font-mono-num mt-1 block">
                          {room.lastMeterReading.toFixed(1)} kWh
                        </span>
                      </div>
                      <div className="rounded-2xl bg-[#0D121B] border border-[#202B40] p-3">
                        <span className="text-[10px] uppercase text-slate-400 font-semibold block">
                          Req. Deposit
                        </span>
                        <span className="text-sm font-extrabold text-emerald-400 font-mono-num mt-1 block">
                          {formatPesoPrivacy(
                            room.securityDeposit > 0
                              ? room.securityDeposit
                              : room.monthlyRent,
                            privacyMaskEnabled
                          )}
                        </span>
                        {isOccupied && paidDepositCredit > 0 && (
                          <span className="text-[10px] text-emerald-300 font-semibold block mt-0.5 leading-snug">
                            Credit: {formatPesoPrivacy(paidDepositCredit, privacyMaskEnabled)}
                          </span>
                        )}
                      </div>
                      {isOccupied && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onOpenAdvanceBalanceModal(room);
                          }}
                          className="rounded-2xl bg-[#0D121B] hover:bg-[#172234] border border-emerald-500/35 p-3 text-left transition cursor-pointer"
                          title="Click to Withdraw or Manage Tenant Advance Balance"
                        >
                          <span className="text-[10px] uppercase text-emerald-400 font-bold flex items-center justify-between">
                            <span>Advance Bal.</span>
                            <Wallet className="w-3 h-3" />
                          </span>
                          <span className="text-sm font-extrabold text-emerald-400 font-mono-num mt-1 block">
                            {formatPesoPrivacy(
                              room.advanceRent || 0,
                              privacyMaskEnabled
                            )}
                          </span>
                        </button>
                      )}
                    </div>

                    {/* 1 Room = 1 Active Official Receipt Quick Bar */}
                    <div
                      className="rounded-2xl bg-[#0E1522] border border-[#22304A] px-4 py-3 flex items-center justify-between gap-2"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="flex items-start gap-2.5 min-w-0">
                        <ReceiptText className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                        {activeReceipt ? (
                          <div className="text-xs leading-snug break-words">
                            <span className="font-bold text-white">
                              Room Receipt #{activeReceipt.receiptNo}
                            </span>
                            <span className="text-slate-400 ml-1.5">
                              ({activeReceipt.billingPeriod} •{' '}
                              {formatPesoPrivacy(
                                activeReceipt.totalAmountDue,
                                privacyMaskEnabled
                              )}
                              )
                            </span>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400">
                            No active receipt generated yet for {room.name}
                          </span>
                        )}
                      </div>
                      {activeReceipt && (
                        <button
                          type="button"
                          onClick={() => onOpenRoomReceipt(activeReceipt)}
                          className="px-3 py-1.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 text-amber-400 font-bold text-xs shrink-0 transition cursor-pointer"
                        >
                          Open Receipt →
                        </button>
                      )}
                    </div>

                    {/* Tenant Information & Privacy Verification */}
                    {isOccupied && room.tenant ? (
                      <div className="rounded-2xl bg-[#0D121B] border border-[#202B40] p-4 space-y-2 text-xs">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-white text-sm">
                              {room.tenant.fullName}
                            </span>
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-[10px] font-bold text-emerald-400">
                              <ShieldCheck className="w-3 h-3" />
                              ID & Privacy Verified
                            </span>
                          </div>
                          <span className="text-amber-400 font-semibold flex items-center gap-1">
                            <Calendar className="w-3.5 h-3.5" />
                            Next Due: {nextDueFormatted} (Day{' '}
                            {room.tenant.dueDayOfMonth})
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-3.5 text-slate-300 pt-0.5">
                          {room.tenant.phone && (
                            <span className="inline-flex items-center gap-1.5 font-mono-num">
                              <Phone className="w-3.5 h-3.5 text-slate-400" />
                              {maskPhoneNumber(
                                room.tenant.phone,
                                privacyMaskEnabled
                              )}
                            </span>
                          )}
                          {room.tenant.messengerUsername &&
                            !privacyMaskEnabled && (
                              <a
                                href={`https://m.me/${room.tenant.messengerUsername}`}
                                target="_blank"
                                rel="noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="inline-flex items-center gap-1 text-blue-400 hover:underline"
                              >
                                <MessageCircle className="w-3.5 h-3.5" />
                                m.me/{room.tenant.messengerUsername}
                              </a>
                            )}
                          <span className="inline-flex items-center gap-1 text-slate-400">
                            Move-in: {room.tenant.moveInDate}
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div className="rounded-2xl bg-[#0D121B] border border-dashed border-[#243044] p-4 text-xs text-slate-400 text-center">
                        Available for Booking • Continuous Sub-Meter at{' '}
                        <strong className="text-amber-400 font-mono-num">
                          {room.lastMeterReading.toFixed(1)} kWh
                        </strong>
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div
                    className="mt-5 pt-4 border-t border-[#222E44] flex flex-wrap items-center justify-between gap-2.5"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="flex items-center gap-2">
                      {isOccupied ? (
                        <button
                          type="button"
                          onClick={() => onOpenScanMeter(room)}
                          className="px-4 py-2.5 rounded-2xl bg-[#F59E0B] hover:bg-[#FBBF24] text-slate-950 font-extrabold text-xs flex items-center gap-1.5 transition cursor-pointer shadow-md shadow-amber-500/15 btn-fluid"
                        >
                          <Camera className="w-3.5 h-3.5" />
                          <span>Scan Meter & Bill</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => onOpenEditRoom(room)}
                          className="px-4 py-2.5 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs flex items-center gap-1.5 transition cursor-pointer shadow-md shadow-emerald-500/20 btn-fluid"
                          title="Assign a tenant to this vacant room"
                        >
                          <UserPlus className="w-3.5 h-3.5" />
                          <span>Assign Tenant / Occupy</span>
                        </button>
                      )}

                      {isOccupied && (
                        <button
                          type="button"
                          onClick={() => onOpenAdvanceBalanceModal(room)}
                          className="px-3.5 py-2.5 rounded-2xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/35 text-emerald-300 font-bold text-xs flex items-center gap-1.5 transition cursor-pointer btn-fluid"
                          title="Withdraw or Manage Advance Balance"
                        >
                          <Wallet className="w-3.5 h-3.5" />
                          <span>Advance</span>
                        </button>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => onOpenEditRoom(room)}
                        className="px-3 py-2 rounded-2xl bg-[#1A2334] hover:bg-[#243046] border border-[#2A3750] text-slate-200 text-xs font-bold flex items-center gap-1.5 transition cursor-pointer btn-fluid"
                        title="Edit Room & Tenant"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        <span>Edit</span>
                      </button>
                      {isOccupied && (
                        <button
                          type="button"
                          onClick={() =>
                            onMoveOutTenant(
                              room,
                              'Stopped Paying Rent / Vacated (Moved to History)'
                            )
                          }
                          className="px-3 py-2 rounded-2xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/35 text-amber-300 text-xs font-bold flex items-center gap-1.5 transition cursor-pointer btn-fluid"
                          title="Tenant Vacated / Move Out -> Move to Previous Tenant History (Requires Confirmation)"
                        >
                          <UserMinus className="w-3.5 h-3.5" />
                          <span>Tenant Vacated</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => onArchiveRoom(room.id)}
                        className="px-3 py-2 rounded-2xl bg-blue-500/15 hover:bg-blue-500/25 border border-blue-500/35 text-blue-300 text-xs font-bold flex items-center gap-1.5 transition cursor-pointer btn-fluid"
                        title="Archive Room (Requires Confirmation)"
                      >
                        <Archive className="w-3.5 h-3.5" />
                        <span>Archive</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onRequestDeleteRoomWithPin(room)}
                        className="px-3 py-2 rounded-2xl bg-red-500/15 hover:bg-red-500/25 border border-red-500/35 text-red-300 text-xs font-bold flex items-center gap-1.5 transition cursor-pointer btn-fluid"
                        title="Remove Room Permanently (Requires Confirmation & Security Auth)"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <Lock className="w-3 h-3" />
                        <span>Remove Room</span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Bottom-Right Circular Amber FAB */}
      <button
        type="button"
        onClick={onOpenAddRoom}
        aria-label="Add new room"
        className="fixed bottom-22 lg:bottom-8 right-6 z-30 w-15 h-15 sm:w-16 sm:h-16 rounded-full bg-[#F59E0B] hover:bg-[#FBBF24] active:scale-95 text-slate-950 shadow-[0_8px_28px_rgba(245,158,11,0.45)] flex items-center justify-center transition cursor-pointer btn-fluid"
      >
        <div className="relative">
          <Home className="w-7 h-7 text-slate-950 fill-slate-950" />
          <div className="absolute -bottom-1 -right-1.5 w-4 h-4 rounded-full bg-[#F59E0B] border-2 border-slate-950 text-slate-950 flex items-center justify-center font-black text-xs leading-none">
            +
          </div>
        </div>
      </button>
    </div>
  );
};
