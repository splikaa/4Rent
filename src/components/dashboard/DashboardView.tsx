import React, { useEffect, useState } from 'react';
import {
  Archive,
  BarChart3,
  BellRing,
  Building2,
  Calendar,
  CalendarCheck,
  Camera,
  DoorOpen,
  Home,
  Menu,
  Plus,
  ReceiptText,
  Settings,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  User,
  Wallet,
  Zap,
} from 'lucide-react';
import {
  BillRecord,
  NavigationTab,
  Room,
  RoomInquiryBooking,
} from '../../types/rental';
import { formatPeso } from '../../utils/billingCalculator';

interface DashboardViewProps {
  rooms: Room[];
  bills: BillRecord[];
  inquiries: RoomInquiryBooking[];
  globalElectricRate: number;
  onOpenDrawer: () => void;
  onNavigate: (tab: NavigationTab) => void;
  onOpenAddRoom: () => void;
  onOpenScanMeter: (room: Room) => void;
  onSelectBillForReceipt: (bill: BillRecord) => void;
  onOpenAdvanceBalanceModal: (room: Room) => void;
  onSelectRoomDetails: (room: Room) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  rooms,
  bills,
  inquiries,
  globalElectricRate,
  onOpenDrawer,
  onNavigate,
  onOpenAddRoom,
  onOpenScanMeter,
  onSelectBillForReceipt,
  onOpenAdvanceBalanceModal,
  onSelectRoomDetails,
}) => {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(timer);
  }, []);

  const hour = now.getHours();
  const greeting =
    hour < 12 ? 'Good Morning' : hour < 18 ? 'Good Afternoon' : 'Good Evening';

  const formattedDateTime = `${now.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })} • ${now.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })}`;

  const activeRooms = rooms.filter((r) => !r.isArchived);
  const activeBills = bills.filter((b) => !b.isArchived);

  const totalRooms = activeRooms.length;
  const occupiedRooms = activeRooms.filter(
    (r) => r.status === 'occupied'
  ).length;
  const vacantRooms = activeRooms.filter((r) => r.status === 'vacant').length;

  const totalRevenuePaid = bills.reduce(
    (sum, b) => sum + (Number(b.amountPaid) || 0),
    0
  );
  const totalUnpaidDue = activeBills.reduce(
    (sum, b) => sum + (Number(b.remainingBalance) || 0),
    0
  );
  const totalKwhBilled = bills.reduce(
    (sum, b) => sum + (Number(b.consumptionKwh) || 0),
    0
  );

  const roomsWithDueBalance = activeRooms.filter((r) => r.unpaidBalance > 0);
  const pendingBookings = inquiries.filter(
    (i) => i.status === 'booked' || i.status === 'inquiry'
  );

  const getRoomActiveReceipt = (room: Room): BillRecord | undefined => {
    if (room.status === 'vacant') return undefined;
    if (room.activeReceiptId) {
      const match = bills.find((b) => b.id === room.activeReceiptId);
      if (match) return match;
    }
    return activeBills.find((b) => b.roomId === room.id);
  };

  return (
    <div className="w-full max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-5 pb-24">
      {/* Top Header */}
      <header className="flex items-start justify-between gap-4 mb-6">
        <div className="flex items-start gap-3.5">
          <button
            type="button"
            onClick={onOpenDrawer}
            aria-label="Open navigation menu"
            className="lg:hidden mt-1 w-11 h-11 rounded-2xl bg-[#161C28] hover:bg-[#1E2636] border border-[#252F42] flex items-center justify-center text-slate-300 hover:text-white transition shrink-0 cursor-pointer"
          >
            <Menu className="w-5 h-5" />
          </button>

          <div>
            <p className="text-xs sm:text-sm font-medium text-slate-400">
              {greeting}
            </p>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight mt-0.5">
              Dashboard
            </h1>
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400 mt-1.5">
              <span className="inline-flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-slate-500" />
                {formattedDateTime}
              </span>
              <span className="px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 font-bold font-mono-num">
                Global Rate: {formatPeso(globalElectricRate)}/kWh
              </span>
              <span className="px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-300 font-semibold">
                Pay Schedule: Day 1 to 10
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onNavigate('inquiries')}
            className="hidden md:inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-2xl bg-[#161C28] hover:bg-[#1E2636] border border-[#252F42] text-slate-200 font-bold text-xs transition cursor-pointer"
          >
            <CalendarCheck className="w-4 h-4 text-amber-400" />
            <span>Inquiries & Bookings ({pendingBookings.length})</span>
          </button>
          {activeRooms.length > 0 && (
            <button
              type="button"
              onClick={() => onOpenScanMeter(activeRooms[0])}
              className="hidden sm:inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs sm:text-sm shadow-lg shadow-amber-500/20 transition cursor-pointer"
            >
              <Camera className="w-4 h-4" />
              <span>OCR Sub-Meter Reader</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => onNavigate('settings')}
            aria-label="Open Settings"
            className="mt-1 w-11 h-11 rounded-2xl bg-[#161C28] hover:bg-[#1E2636] border border-[#252F42] flex items-center justify-center text-slate-300 hover:text-white transition shrink-0 cursor-pointer"
          >
            <Settings className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* 3 Primary KPI Summary Cards */}
      <section
        aria-label="Room occupancy summary"
        className="grid grid-cols-3 gap-3 sm:gap-5 mb-7"
      >
        <button
          type="button"
          onClick={() => onNavigate('rooms')}
          className="rounded-[22px] bg-[#141A25] hover:bg-[#192130] border border-[#222C3F] p-4 sm:p-6 flex flex-col items-center justify-center text-center transition cursor-pointer shadow-lg"
        >
          <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-[#16233B] border border-blue-500/20 flex items-center justify-center mb-3">
            <Building2 className="w-6 h-6 text-blue-400" />
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-white font-mono-num">
            {totalRooms}
          </div>
          <div className="text-xs sm:text-sm font-medium text-slate-400 mt-1">
            Total
          </div>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('rooms')}
          className="rounded-[22px] bg-[#141A25] hover:bg-[#192130] border border-[#222C3F] p-4 sm:p-6 flex flex-col items-center justify-center text-center transition cursor-pointer shadow-lg"
        >
          <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-[#2A211B] border border-amber-500/20 flex items-center justify-center mb-3">
            <User className="w-6 h-6 text-amber-500" />
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-white font-mono-num">
            {occupiedRooms}
          </div>
          <div className="text-xs sm:text-sm font-medium text-slate-400 mt-1">
            Occupied
          </div>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('rooms')}
          className="rounded-[22px] bg-[#141A25] hover:bg-[#192130] border border-[#222C3F] p-4 sm:p-6 flex flex-col items-center justify-center text-center transition cursor-pointer shadow-lg"
        >
          <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-[#132822] border border-emerald-500/20 flex items-center justify-center mb-3">
            <DoorOpen className="w-6 h-6 text-emerald-500" />
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-white font-mono-num">
            {vacantRooms}
          </div>
          <div className="text-xs sm:text-sm font-medium text-slate-400 mt-1">
            Vacant
          </div>
        </button>
      </section>

      {/* Due Balance Reminder Banner */}
      {roomsWithDueBalance.length > 0 && (
        <section className="mb-6 rounded-2xl bg-gradient-to-r from-amber-500/15 via-amber-500/10 to-transparent border border-amber-500/30 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start sm:items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center shrink-0">
              <BellRing className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-amber-300">
                1st to 10th Monthly Payment Reminder ({roomsWithDueBalance.length}{' '}
                {roomsWithDueBalance.length === 1 ? 'room' : 'rooms'})
              </h2>
              <p className="text-xs text-slate-300 mt-0.5">
                {roomsWithDueBalance
                  .map((r) => `${r.name} (${formatPeso(r.unpaidBalance)})`)
                  .join(' • ')}{' '}
                have unpaid balances due between Day 1 and Day 10 of the month.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('payments')}
            className="self-start sm:self-auto px-3.5 py-2 rounded-xl bg-amber-500 text-slate-950 font-bold text-xs hover:bg-amber-400 transition shrink-0 cursor-pointer"
          >
            Review Balances
          </button>
        </section>
      )}

      {/* Your Rooms Section Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <div>
          <h2 className="text-lg sm:text-xl font-bold text-white tracking-tight">
            Your Rooms
          </h2>
          <p className="text-xs text-slate-400">
            Click any room card to view full details & previous transactions
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onOpenAddRoom}
            className="px-3.5 py-1.5 rounded-full bg-[#161C28] hover:bg-[#1F2839] border border-[#28334A] text-xs font-semibold text-amber-400 flex items-center gap-1.5 transition cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Room</span>
          </button>
          <button
            type="button"
            onClick={() => onNavigate('inquiries')}
            className="px-3.5 py-1.5 rounded-full bg-[#161C28] hover:bg-[#1F2839] border border-[#28334A] text-xs font-semibold text-blue-300 hover:text-white transition cursor-pointer"
          >
            Inquiries & Book ({pendingBookings.length})
          </button>
          <button
            type="button"
            onClick={() => onNavigate('archive')}
            className="px-3.5 py-1.5 rounded-full bg-[#161C28] hover:bg-[#1F2839] border border-[#28334A] text-xs font-semibold text-slate-300 hover:text-white flex items-center gap-1 transition cursor-pointer"
          >
            <Archive className="w-3 h-3" />
            <span>Archive</span>
          </button>
          <button
            type="button"
            onClick={() => onNavigate('rooms')}
            className="px-3.5 py-1.5 rounded-full bg-[#161C28] hover:bg-[#1F2839] border border-[#28334A] text-xs font-semibold text-slate-300 hover:text-white transition cursor-pointer"
          >
            Manage Rooms
          </button>
        </div>
      </div>

      {/* Empty State OR Active Rooms Grid */}
      {activeRooms.length === 0 ? (
        <div className="rounded-3xl bg-[#121722]/70 border border-[#1E2636] px-6 py-14 flex flex-col items-center text-center my-4">
          <div className="w-20 h-20 rounded-[24px] bg-[#241E14] border border-amber-500/20 flex items-center justify-center mb-5 shadow-inner">
            <div className="relative">
              <Home className="w-10 h-10 text-amber-500 fill-amber-500/20" />
              <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-amber-500 text-slate-950 flex items-center justify-center font-bold text-xs">
                +
              </div>
            </div>
          </div>
          <h3 className="text-xl font-bold text-white">No rooms yet</h3>
          <p className="text-sm text-slate-400 mt-1.5 max-w-xs">
            Create a room using the buttons below to get started
          </p>

          <div className="mt-7 flex items-center justify-center">
            <button
              type="button"
              onClick={onOpenAddRoom}
              className="px-6 py-3.5 rounded-2xl bg-[#F59E0B] hover:bg-[#FBBF24] text-slate-950 font-extrabold text-sm flex items-center gap-2 shadow-lg shadow-amber-500/20 transition cursor-pointer"
            >
              <Plus className="w-4 h-4 stroke-[2.5]" />
              <span>Create First Room</span>
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-10">
            {activeRooms.map((room) => {
              const isOccupied = room.status === 'occupied';
              const activeReceipt = getRoomActiveReceipt(room);
              const safeDeposit =
                room.securityDeposit > 0
                  ? room.securityDeposit
                  : room.monthlyRent;
              const safeAdvance = isOccupied
                ? Math.max(0, room.advanceRent || 0)
                : 0;

              return (
                <div
                  key={room.id}
                  onClick={() => onSelectRoomDetails(room)}
                  className="rounded-2xl bg-[#151B26] hover:bg-[#19202E] border border-[#232D40] hover:border-amber-500/40 p-5 flex flex-col justify-between transition shadow-lg cursor-pointer"
                >
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-lg font-extrabold text-white">
                        {room.name}
                      </span>
                      <span
                        className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                          isOccupied
                            ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                            : 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                        }`}
                      >
                        {isOccupied ? 'Occupied' : 'Vacant'}
                      </span>
                    </div>

                    {/* Tenant Bar */}
                    <div className="mt-3.5 rounded-xl bg-[#0F141D] border border-[#1E2738] px-3 py-2 flex items-center justify-between gap-2 text-xs">
                      <span className="text-slate-400 font-medium">Tenant</span>
                      {isOccupied && room.tenant?.fullName ? (
                        <span className="font-bold text-slate-100 truncate">
                          {room.tenant.fullName}
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-400 font-bold text-[11px]">
                          Available for Booking
                        </span>
                      )}
                    </div>

                    {/* Clean 2x2 Metric Grid (No overlapping text & No Advance Balance when Vacant) */}
                    <div className="mt-2.5 grid grid-cols-2 gap-2 text-xs">
                      <div className="rounded-xl bg-[#0F141D] border border-[#1E2738] p-2.5">
                        <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold block">
                          Monthly Rent
                        </span>
                        <span className="text-sm font-extrabold text-white font-mono-num mt-0.5 block">
                          {formatPeso(room.monthlyRent)}
                        </span>
                      </div>

                      <div className="rounded-xl bg-[#0F141D] border border-[#1E2738] p-2.5">
                        <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold block">
                          Req. Deposit
                        </span>
                        <span className="text-sm font-extrabold text-emerald-400 font-mono-num mt-0.5 block">
                          {formatPeso(safeDeposit)}
                        </span>
                      </div>

                      <div
                        className={`rounded-xl bg-[#0F141D] border border-[#1E2738] p-2.5 ${
                          isOccupied ? '' : 'col-span-2'
                        }`}
                      >
                        <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold block">
                          Continuous Sub-Meter
                        </span>
                        <div className="flex items-center justify-between gap-1 mt-0.5">
                          <span className="text-sm font-extrabold text-amber-400 font-mono-num">
                            {room.lastMeterReading.toFixed(1)} kWh
                          </span>
                          <span className="text-[10px] text-slate-400 font-mono-num">
                            @{formatPeso(globalElectricRate)}/kWh
                          </span>
                        </div>
                      </div>

                      {isOccupied && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onOpenAdvanceBalanceModal(room);
                          }}
                          className="rounded-xl bg-[#0F141D] hover:bg-[#172234] border border-emerald-500/30 p-2.5 text-left transition cursor-pointer"
                          title="Manage or withdraw tenant advance balance"
                        >
                          <span className="text-[10px] uppercase tracking-wider text-emerald-400 font-bold flex items-center justify-between">
                            <span>Advance Bal.</span>
                            <Wallet className="w-3 h-3" />
                          </span>
                          <span className="text-sm font-extrabold text-emerald-400 font-mono-num mt-0.5 block">
                            {formatPeso(safeAdvance)}
                          </span>
                        </button>
                      )}
                    </div>

                    {isOccupied && room.unpaidBalance > 0 && (
                      <div className="mt-2 rounded-xl bg-red-500/10 border border-red-500/30 px-3 py-1.5 flex items-center justify-between text-xs text-red-400">
                        <span className="font-semibold">Unpaid Balance Due</span>
                        <span className="font-extrabold font-mono-num">
                          {formatPeso(room.unpaidBalance)}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* 1 Room = 1 Receipt Direct Access + Scan Button */}
                  <div
                    className="mt-4 pt-3 border-t border-[#20293A] flex flex-col gap-2"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => onOpenScanMeter(room)}
                        className="flex-1 py-2.5 px-3 rounded-xl bg-[#F59E0B] hover:bg-[#FBBF24] text-slate-950 font-bold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer"
                      >
                        <Camera className="w-3.5 h-3.5" />
                        <span>OCR Sub-Meter & Bill</span>
                      </button>

                      {isOccupied && activeReceipt ? (
                        <button
                          type="button"
                          onClick={() => onSelectBillForReceipt(activeReceipt)}
                          className="py-2.5 px-3 rounded-xl bg-[#1E2636] hover:bg-[#273146] text-amber-400 font-bold text-xs flex items-center gap-1 transition cursor-pointer"
                          title="Open this room's official receipt"
                        >
                          <ReceiptText className="w-3.5 h-3.5" />
                          <span>Receipt</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => onSelectRoomDetails(room)}
                          className="py-2.5 px-3 rounded-xl bg-[#1E2636] hover:bg-[#273146] text-slate-200 font-semibold text-xs transition cursor-pointer"
                        >
                          Details
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Analytics Section */}
          <section className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="rounded-2xl bg-[#151B26] border border-[#232D40] p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-emerald-500/15 flex items-center justify-center">
                    <TrendingUp className="w-5 h-5 text-emerald-400" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white">
                      Revenue & Collection Overview
                    </h3>
                    <p className="text-xs text-slate-400">
                      1 Room = 1 Active Receipt • 2 Sub-Meter Proofs Included
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onNavigate('payments')}
                  className="text-xs font-semibold text-amber-400 hover:underline cursor-pointer"
                >
                  All Payments →
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="rounded-xl bg-[#10151F] border border-[#1E2738] p-3.5">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    Total Paid (Revenue)
                  </span>
                  <div className="text-xl font-extrabold text-emerald-400 font-mono-num mt-1">
                    {formatPeso(totalRevenuePaid)}
                  </div>
                </div>
                <div className="rounded-xl bg-[#10151F] border border-[#1E2738] p-3.5">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    Total Unpaid (Due)
                  </span>
                  <div className="text-xl font-extrabold text-amber-400 font-mono-num mt-1">
                    {formatPeso(totalUnpaidDue)}
                  </div>
                </div>
              </div>

              {activeBills.length > 0 && (
                <div className="mt-4 pt-3 border-t border-[#20293A]">
                  <div className="text-xs font-semibold text-slate-400 mb-2">
                    Active Room Receipts (Tap to Print / Share Dual Sub-Meter
                    Proof)
                  </div>
                  <div className="space-y-2">
                    {activeBills.slice(0, 4).map((b) => (
                      <button
                        key={b.id}
                        type="button"
                        onClick={() => onSelectBillForReceipt(b)}
                        className="w-full rounded-xl bg-[#10151F] hover:bg-[#1A2232] border border-[#1E2738] px-3.5 py-2.5 flex items-center justify-between text-left transition cursor-pointer"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <ReceiptText className="w-4 h-4 text-amber-400 shrink-0" />
                          <div className="truncate">
                            <span className="text-xs font-bold text-white">
                              {b.roomName} • {b.tenantName}
                            </span>
                            <span className="block text-[11px] text-slate-400">
                              {b.prevReading.toFixed(1)} →{' '}
                              {b.currReading.toFixed(1)} kWh (Δ{' '}
                              {b.consumptionKwh.toFixed(1)} kWh)
                            </span>
                          </div>
                        </div>
                        <div className="text-right shrink-0 ml-2">
                          <span className="text-xs font-extrabold text-white font-mono-num block">
                            {formatPeso(b.totalAmountDue)}
                          </span>
                          <span
                            className={`text-[10px] font-bold uppercase ${
                              b.status === 'paid'
                                ? 'text-emerald-400'
                                : b.status === 'partial'
                                ? 'text-amber-400'
                                : 'text-red-400'
                            }`}
                          >
                            {b.status}
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="rounded-2xl bg-[#151B26] border border-[#232D40] p-5 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-amber-500/15 flex items-center justify-center">
                      <Zap className="w-5 h-5 text-amber-400" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-white">
                        Continuous Sub-Meter Readings (kWh)
                      </h3>
                      <p className="text-xs text-slate-400">
                        Total billed usage: {totalKwhBilled.toFixed(1)} kWh @{' '}
                        {formatPeso(globalElectricRate)}/kWh
                      </p>
                    </div>
                  </div>
                  <BarChart3 className="w-4 h-4 text-slate-500" />
                </div>

                <div className="space-y-3.5 mt-3">
                  {activeRooms.map((r) => {
                    const roomBills = bills.filter((b) => b.roomId === r.id);
                    const roomKwh = roomBills.reduce(
                      (s, b) => s + b.consumptionKwh,
                      0
                    );
                    const maxKwh = Math.max(100, totalKwhBilled);
                    const pct = Math.min(
                      100,
                      Math.round((roomKwh / maxKwh) * 100)
                    );

                    return (
                      <div
                        key={r.id}
                        onClick={() => onSelectRoomDetails(r)}
                        className="space-y-1 cursor-pointer group"
                      >
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-semibold text-slate-200 group-hover:text-amber-400 transition">
                            {r.name}{' '}
                            <span className="text-slate-500 font-normal">
                              (Current Meter: {r.lastMeterReading.toFixed(1)}{' '}
                              kWh)
                            </span>
                          </span>
                          <span className="font-mono-num font-bold text-amber-400">
                            {roomKwh.toFixed(1)} kWh billed
                          </span>
                        </div>
                        <div className="w-full h-2.5 rounded-full bg-[#0E131C] overflow-hidden">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-amber-500 to-yellow-400 transition-all duration-500"
                            style={{ width: `${Math.max(6, pct)}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="mt-6 pt-4 border-t border-[#20293A] flex items-center justify-between text-xs text-slate-400">
                <span className="flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  Deposit Required • Overpayments → Advance Balance
                </span>
                <button
                  type="button"
                  onClick={() => onOpenScanMeter(activeRooms[0])}
                  className="font-bold text-amber-400 hover:underline cursor-pointer"
                >
                  Open OCR Reader →
                </button>
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  );
};
