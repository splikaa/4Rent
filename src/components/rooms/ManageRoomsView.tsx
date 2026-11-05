import React from 'react';
import {
  Archive,
  ArrowLeft,
  Calendar,
  Camera,
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
  Wallet,
} from 'lucide-react';
import { BillRecord, Room } from '../../types/rental';
import {
  formatPeso,
  formatPhoneNumber,
  getNextDueDateInOneToTenWindow,
} from '../../utils/billingCalculator';

interface ManageRoomsViewProps {
  rooms: Room[];
  bills: BillRecord[];
  globalElectricRate: number;
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
    <div className="min-h-screen flex flex-col bg-[#0B0E14] pb-28">
      {/* Top Bar */}
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
          Manage Rooms
        </h1>

        <button
          type="button"
          onClick={onOpenArchiveCenter}
          className="px-3 py-1.5 rounded-xl bg-[#1B2230] hover:bg-[#232D40] border border-[#283246] text-xs font-semibold text-slate-200 flex items-center gap-1.5 transition cursor-pointer"
        >
          <History className="w-3.5 h-3.5 text-amber-400" />
          <span className="hidden sm:inline">Previous Tenants & Archive</span>
        </button>
      </header>

      <div className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 flex flex-col">
        {activeRooms.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center py-20 select-none">
            <button
              type="button"
              onClick={onOpenAddRoom}
              className="w-24 h-24 rounded-[26px] bg-[#282218] hover:bg-[#332B1E] border border-amber-500/20 flex items-center justify-center mb-6 transition cursor-pointer shadow-lg"
            >
              <div className="relative">
                <Home className="w-11 h-11 text-amber-500 fill-amber-500" />
                <div className="absolute -bottom-1 -right-1.5 w-6 h-6 rounded-full bg-amber-500 border-2 border-[#282218] text-slate-950 flex items-center justify-center font-extrabold text-sm leading-none">
                  +
                </div>
              </div>
            </button>
            <h2 className="text-xl font-bold text-white">No rooms yet</h2>
            <p className="text-sm text-slate-400 mt-2">
              Tap + to add your first room
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {activeRooms.map((room) => {
              const isOccupied = room.status === 'occupied';
              const activeReceipt = getRoomActiveReceipt(room);
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
                  className="rounded-2xl bg-[#151B26] hover:bg-[#19202E] border border-[#232D40] hover:border-amber-500/40 p-5 flex flex-col justify-between shadow-lg transition cursor-pointer"
                >
                  <div>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h2 className="text-xl font-extrabold text-white">
                          {room.name}
                        </h2>
                        <p className="text-xs text-slate-400 mt-0.5">
                          Global Rate:{' '}
                          <strong className="text-amber-400 font-mono-num">
                            {formatPeso(globalElectricRate)}/kWh
                          </strong>{' '}
                          • {roomBillsCount}{' '}
                          {roomBillsCount === 1 ? 'Transaction' : 'Transactions'}
                        </p>
                      </div>
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-bold ${
                          isOccupied
                            ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                            : 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                        }`}
                      >
                        {isOccupied ? 'Occupied' : 'Vacant'}
                      </span>
                    </div>

                    {/* Financial & Sub-Meter Grid */}
                    <div
                      className={`grid grid-cols-1 ${
                        isOccupied ? 'sm:grid-cols-4' : 'sm:grid-cols-3'
                      } gap-2.5 mt-4`}
                    >
                      <div className="rounded-xl bg-[#0F141D] border border-[#1E2738] p-2.5">
                        <span className="text-[10px] uppercase text-slate-400 block">
                          Monthly Rent
                        </span>
                        <span className="text-sm font-bold text-white font-mono-num">
                          {formatPeso(room.monthlyRent)}
                        </span>
                      </div>
                      <div
                        className="rounded-xl bg-[#0F141D] border border-[#1E2738] p-2.5"
                        title="Sub-Meter kWh continues even when tenant changes"
                      >
                        <span className="text-[10px] uppercase text-slate-400 block">
                          Sub-Meter (Cont.)
                        </span>
                        <span className="text-sm font-bold text-amber-400 font-mono-num">
                          {room.lastMeterReading.toFixed(1)} kWh
                        </span>
                      </div>
                      <div className="rounded-xl bg-[#0F141D] border border-[#1E2738] p-2.5">
                        <span className="text-[10px] uppercase text-slate-400 block">
                          Req. Deposit
                        </span>
                        <span className="text-sm font-bold text-emerald-400 font-mono-num">
                          {formatPeso(
                            room.securityDeposit > 0
                              ? room.securityDeposit
                              : room.monthlyRent
                          )}
                        </span>
                      </div>
                      {isOccupied && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onOpenAdvanceBalanceModal(room);
                          }}
                          className="rounded-xl bg-[#0F141D] hover:bg-[#172234] border border-emerald-500/30 p-2.5 text-left transition cursor-pointer"
                          title="Click to Withdraw or Manage Tenant Advance Balance"
                        >
                          <span className="text-[10px] uppercase text-emerald-400 font-bold flex items-center justify-between">
                            <span>Advance Bal.</span>
                            <Wallet className="w-3 h-3" />
                          </span>
                          <span className="text-sm font-extrabold text-emerald-400 font-mono-num block">
                            {formatPeso(room.advanceRent || 0)}
                          </span>
                        </button>
                      )}
                    </div>

                    {/* 1 Room = 1 Active Official Receipt Quick Bar */}
                    <div
                      className="mt-3 rounded-xl bg-[#101622] border border-[#222F46] px-3.5 py-2.5 flex items-center justify-between gap-2"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <ReceiptText className="w-4 h-4 text-amber-400 shrink-0" />
                        {activeReceipt ? (
                          <div className="text-xs truncate">
                            <span className="font-bold text-white">
                              Room Receipt #{activeReceipt.receiptNo}
                            </span>
                            <span className="text-slate-400 ml-1.5">
                              ({activeReceipt.billingPeriod} •{' '}
                              {formatPeso(activeReceipt.totalAmountDue)})
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
                          className="px-2.5 py-1 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 text-amber-400 font-bold text-xs shrink-0 transition cursor-pointer"
                        >
                          Open Receipt →
                        </button>
                      )}
                    </div>

                    {/* Tenant Information */}
                    {isOccupied && room.tenant ? (
                      <div className="mt-3 rounded-xl bg-[#101520] border border-[#1E2738] p-3.5 space-y-1.5 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-white text-sm">
                            {room.tenant.fullName}
                          </span>
                          <span className="text-amber-400 font-semibold flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            Next Due: {nextDueFormatted} (Day{' '}
                            {room.tenant.dueDayOfMonth})
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-3 text-slate-400">
                          {room.tenant.phone && (
                            <span className="inline-flex items-center gap-1 font-mono-num">
                              <Phone className="w-3.5 h-3.5 text-slate-500" />
                              {formatPhoneNumber(room.tenant.phone)}
                            </span>
                          )}
                          {room.tenant.messengerUsername && (
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
                          <span className="inline-flex items-center gap-1">
                            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                            Move-in: {room.tenant.moveInDate}
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-3 rounded-xl bg-[#101520] border border-dashed border-[#243044] p-3 text-xs text-slate-400 text-center">
                        Available for Booking • Continuous Sub-Meter at{' '}
                        <strong className="text-amber-400 font-mono-num">
                          {room.lastMeterReading.toFixed(1)} kWh
                        </strong>
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div
                    className="mt-4 pt-3.5 border-t border-[#20293A] flex flex-wrap items-center justify-between gap-2"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => onOpenScanMeter(room)}
                        className="px-3.5 py-2 rounded-xl bg-[#F59E0B] hover:bg-[#FBBF24] text-slate-950 font-bold text-xs flex items-center gap-1.5 transition cursor-pointer shadow-md shadow-amber-500/10"
                      >
                        <Camera className="w-3.5 h-3.5" />
                        <span>Scan Meter & Bill</span>
                      </button>

                      {isOccupied && (
                        <button
                          type="button"
                          onClick={() => onOpenAdvanceBalanceModal(room)}
                          className="px-3 py-2 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-300 font-bold text-xs flex items-center gap-1 transition cursor-pointer"
                          title="Withdraw or Manage Advance Balance"
                        >
                          <Wallet className="w-3.5 h-3.5" />
                          <span>Advance</span>
                        </button>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => onOpenEditRoom(room)}
                        className="p-2 rounded-xl bg-[#1D2535] hover:bg-[#263044] text-slate-200 transition cursor-pointer"
                        title="Edit Room & Tenant"
                      >
                        <Edit3 className="w-4 h-4" />
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
                          className="p-2 rounded-xl bg-[#1D2535] hover:bg-amber-500/20 text-amber-400 transition cursor-pointer"
                          title="Tenant Vacated / Stopped Paying Rent -> Move to Previous Tenant History"
                        >
                          <UserMinus className="w-4 h-4" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => onArchiveRoom(room.id)}
                        className="p-2 rounded-xl bg-[#1D2535] hover:bg-blue-500/20 text-blue-400 transition cursor-pointer"
                        title="Archive Room"
                      >
                        <Archive className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onRequestDeleteRoomWithPin(room)}
                        className="p-2 rounded-xl bg-[#1D2535] hover:bg-red-500/20 text-red-400 transition cursor-pointer flex items-center gap-0.5"
                        title="Remove Room (Requires 4-Digit Security PIN)"
                      >
                        <Trash2 className="w-4 h-4" />
                        <Lock className="w-2.5 h-2.5" />
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
        className="fixed bottom-6 right-6 z-30 w-16 h-16 rounded-full bg-[#F59E0B] hover:bg-[#FBBF24] active:scale-95 text-slate-950 shadow-[0_8px_28px_rgba(245,158,11,0.45)] flex items-center justify-center transition cursor-pointer"
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
