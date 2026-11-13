import React, { useEffect, useState } from 'react';
import {
  Archive,
  BarChart3,
  BellRing,
  Building2,
  Calendar,
  CalendarCheck,
  Camera,
  CheckCircle2,
  ChevronRight,
  DoorOpen,
  Download,
  Home,
  Laptop,
  Menu,
  Plus,
  ReceiptText,
  Settings,
  ShieldCheck,
  Smartphone,
  Sparkles,
  TrendingUp,
  User,
  UserPlus,
  Wallet,
  Zap,
} from 'lucide-react';
import {
  BillRecord,
  NavigationTab,
  Room,
  RoomInquiryBooking,
} from '../../types/rental';
import {
  formatPeso,
  formatPesoPrivacy,
  getRoomMonthlyPaymentStatus,
  isMobileDevice,
} from '../../utils/billingCalculator';
import { loadReadingLogs } from '../../services/storageService';

interface DashboardViewProps {
  rooms: Room[];
  bills: BillRecord[];
  inquiries: RoomInquiryBooking[];
  globalElectricRate: number;
  privacyMaskEnabled?: boolean;
  onTogglePrivacyMask?: () => void;
  onOpenWalkthrough?: () => void;
  onOpenDrawer: () => void;
  onNavigate: (tab: NavigationTab) => void;
  onOpenAddRoom: () => void;
  onOpenScanMeter: (room: Room) => void;
  onSelectBillForReceipt: (bill: BillRecord) => void;
  onOpenAdvanceBalanceModal: (room: Room) => void;
  onSelectRoomDetails: (room: Room) => void;
  onOpenDownloadModal?: () => void;
  isInstalledStandalone?: boolean;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  rooms,
  bills,
  inquiries,
  globalElectricRate,
  privacyMaskEnabled = false,
  onTogglePrivacyMask,
  onOpenWalkthrough,
  onOpenDrawer,
  onNavigate,
  onOpenAddRoom,
  onOpenScanMeter,
  onSelectBillForReceipt,
  onOpenAdvanceBalanceModal,
  onSelectRoomDetails,
  onOpenDownloadModal,
  isInstalledStandalone = false,
}) => {
  const [now, setNow] = useState(new Date());
  const isMobile = isMobileDevice();

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
  const persistentLogs = loadReadingLogs();
  const persistentTotalKwh = persistentLogs.reduce(
    (sum, l) => sum + (Number(l.consumptionDeltaKwh) || 0),
    0
  );
  const totalKwhBilled = Math.max(
    persistentTotalKwh,
    bills.reduce((sum, b) => sum + (Number(b.consumptionKwh) || 0), 0)
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
    <div className="w-full max-w-6xl mx-auto px-5 sm:px-8 lg:px-12 pt-7 pb-32 space-y-8 animate-view-enter">
      {/* Top Header - Organized, Clean & Responsive Layout */}
      <header className="space-y-4">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
          <div className="flex items-center justify-between gap-3 min-w-0">
            <div className="flex items-center gap-3 min-w-0">
              <button
                type="button"
                onClick={onOpenDrawer}
                aria-label="Open navigation menu"
                className="lg:hidden w-11 h-11 rounded-2xl bg-[#141C2B] hover:bg-[#1C273C] border border-[#24314A] flex items-center justify-center text-slate-200 hover:text-white transition shrink-0 cursor-pointer btn-fluid shadow-sm"
              >
                <Menu className="w-5 h-5" />
              </button>

              <div className="min-w-0">
                <p className="text-[11px] sm:text-xs font-bold text-amber-400/90 tracking-wider uppercase">
                  {greeting} • 4Rent
                </p>
                <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-white tracking-tight leading-tight">
                  Dashboard
                </h1>
              </div>
            </div>

            {onOpenWalkthrough && (
              <button
                type="button"
                onClick={onOpenWalkthrough}
                className="sm:hidden inline-flex items-center gap-1.5 h-10 px-3.5 rounded-2xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 text-amber-300 text-xs font-extrabold transition cursor-pointer btn-fluid shrink-0"
                title="Open Interactive Visual Guide"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                <span>Guide</span>
              </button>
            )}
          </div>

          {/* Action Toolbar */}
          <div className="hidden sm:flex flex-wrap items-center gap-2.5">
            {/* Desktop-Only Full Actions */}
            {!isInstalledStandalone && onOpenDownloadModal && (
              <button
                type="button"
                onClick={onOpenDownloadModal}
                className="inline-flex items-center gap-1.5 h-11 px-4 rounded-2xl bg-[#141C2B] hover:bg-[#1C273C] border border-amber-500/35 text-amber-300 text-xs font-bold transition cursor-pointer btn-fluid shadow-sm"
                title="Download Desktop (.exe) & Mobile App (.apk)"
              >
                <Download className="w-4 h-4 text-amber-400" />
                <span>Get Apps</span>
              </button>
            )}

            {onOpenWalkthrough && (
              <button
                type="button"
                onClick={onOpenWalkthrough}
                className="inline-flex items-center gap-1.5 h-11 px-4 rounded-2xl bg-amber-500/12 hover:bg-amber-500/20 border border-amber-500/35 text-amber-300 text-xs font-extrabold transition cursor-pointer btn-fluid"
                title="Open quick guide"
              >
                <Sparkles className="w-4 h-4 text-amber-400" />
                <span>Guide</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => onNavigate('inquiries')}
              className="inline-flex items-center gap-2 h-11 px-4 rounded-2xl bg-[#141C2B] hover:bg-[#1C273C] border border-[#24314A] text-slate-200 font-bold text-xs transition cursor-pointer btn-fluid"
            >
              <CalendarCheck className="w-4 h-4 text-amber-400" />
              <span>Bookings ({pendingBookings.length})</span>
            </button>

            {activeRooms.length > 0 && (
              <button
                type="button"
                onClick={() => onOpenScanMeter(activeRooms[0])}
                className="inline-flex items-center gap-2 h-11 px-5 rounded-2xl bg-[#F59E0B] hover:bg-[#FBBF24] text-slate-950 font-extrabold text-xs sm:text-sm shadow-lg shadow-amber-500/20 transition cursor-pointer btn-fluid"
              >
                <Camera className="w-4 h-4" />
                <span>Scan Meter</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => onNavigate('settings')}
              aria-label="Open Settings"
              className="flex w-11 h-11 rounded-2xl bg-[#141C2B] hover:bg-[#1C273C] border border-[#24314A] items-center justify-center text-slate-300 hover:text-white transition shrink-0 cursor-pointer btn-fluid"
            >
              <Settings className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Compact Status & Metric Pills Strip */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300 font-bold font-mono-num">
            <Zap className="w-3.5 h-3.5 text-amber-400" />
            <span>Rate: {formatPeso(globalElectricRate)}/kWh</span>
          </span>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-500/15 border border-blue-500/30 text-blue-300 font-semibold">
            <Calendar className="w-3.5 h-3.5 text-blue-400" />
            <span>Pay Window: Day 1–10</span>
          </span>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#141B29] border border-[#243047] text-slate-300">
            <span>{formattedDateTime}</span>
          </span>
        </div>
      </header>

      {/* 3 Primary KPI Summary Cards with Spacious Gaps */}
      <section
        aria-label="Room occupancy summary"
        className="grid grid-cols-3 gap-2.5 sm:gap-6"
      >
        <button
          type="button"
          onClick={() => onNavigate('rooms')}
          className="surface-card surface-card-interactive rounded-2xl sm:rounded-3xl p-3.5 sm:p-7 flex flex-col items-center justify-center text-center cursor-pointer"
        >
          <div className="w-10 h-10 sm:w-14 sm:h-14 rounded-xl sm:rounded-2xl bg-[#15233C] border border-blue-500/25 flex items-center justify-center mb-2 sm:mb-3.5 shadow-inner">
            <Building2 className="w-5 h-5 sm:w-7 sm:h-7 text-blue-400" />
          </div>
          <div className="text-xl sm:text-3xl lg:text-4xl font-extrabold text-white font-mono-num">
            {totalRooms}
          </div>
          <div className="text-[11px] sm:text-sm font-semibold text-slate-300 mt-1 sm:mt-1.5">
            Total Rooms
          </div>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('rooms')}
          className="surface-card surface-card-interactive rounded-2xl sm:rounded-3xl p-3.5 sm:p-7 flex flex-col items-center justify-center text-center cursor-pointer"
        >
          <div className="w-10 h-10 sm:w-14 sm:h-14 rounded-xl sm:rounded-2xl bg-[#2A2018] border border-amber-500/25 flex items-center justify-center mb-2 sm:mb-3.5 shadow-inner">
            <User className="w-5 h-5 sm:w-7 sm:h-7 text-amber-400" />
          </div>
          <div className="text-xl sm:text-3xl lg:text-4xl font-extrabold text-white font-mono-num">
            {occupiedRooms}
          </div>
          <div className="text-[11px] sm:text-sm font-semibold text-slate-300 mt-1 sm:mt-1.5">
            Occupied
          </div>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('rooms')}
          className="surface-card surface-card-interactive rounded-2xl sm:rounded-3xl p-3.5 sm:p-7 flex flex-col items-center justify-center text-center cursor-pointer"
        >
          <div className="w-10 h-10 sm:w-14 sm:h-14 rounded-xl sm:rounded-2xl bg-[#122822] border border-emerald-500/25 flex items-center justify-center mb-2 sm:mb-3.5 shadow-inner">
            <DoorOpen className="w-5 h-5 sm:w-7 sm:h-7 text-emerald-400" />
          </div>
          <div className="text-xl sm:text-3xl lg:text-4xl font-extrabold text-white font-mono-num">
            {vacantRooms}
          </div>
          <div className="text-[11px] sm:text-sm font-semibold text-slate-300 mt-1 sm:mt-1.5">
            Vacant
          </div>
        </button>
      </section>

      {/* Due Balance Reminder Banner */}
      {roomsWithDueBalance.length > 0 && (
        <section className="rounded-3xl bg-gradient-to-r from-amber-500/15 via-amber-500/10 to-transparent border border-amber-500/35 p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-lg">
          <div className="flex items-start sm:items-center gap-4">
            <div className="w-11 h-11 rounded-2xl bg-amber-500/20 flex items-center justify-center shrink-0">
              <BellRing className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-extrabold text-amber-300">
                Payment Due ({roomsWithDueBalance.length}{' '}
                {roomsWithDueBalance.length === 1 ? 'room' : 'rooms'})
              </h2>
              <p className="text-xs sm:text-sm text-slate-300 mt-1">
                {roomsWithDueBalance
                  .map(
                    (r) =>
                      `${r.name} (${formatPesoPrivacy(
                        r.unpaidBalance,
                        privacyMaskEnabled
                      )})`
                  )
                  .join(' • ')}{' '}
                • Due Day 1–10.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
            <button
              type="button"
              onClick={() => onNavigate('calendar')}
              className="px-3.5 py-2.5 rounded-2xl bg-[#141C2B] hover:bg-[#1D283E] border border-amber-500/35 text-amber-300 font-bold text-xs transition cursor-pointer btn-fluid flex items-center gap-1.5"
            >
              <Calendar className="w-3.5 h-3.5" />
              <span>Calendar</span>
            </button>
            <button
              type="button"
              onClick={() => onNavigate('payments')}
              className="px-4 py-2.5 rounded-2xl bg-amber-500 text-slate-950 font-extrabold text-xs hover:bg-amber-400 transition cursor-pointer btn-fluid"
            >
              Review Balances
            </button>
          </div>
        </section>
      )}

      {/* 4Rent System Apps Direct Download Banner (Only for web browser visitors) */}
      {!isInstalledStandalone && onOpenDownloadModal && (
        <section className="rounded-3xl bg-gradient-to-r from-[#141C2B] via-[#162133] to-[#121A28] border border-[#26354D] p-5 sm:p-6 flex flex-col md:flex-row md:items-center justify-between gap-5 shadow-xl">
          <div className="flex items-start sm:items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center shrink-0 shadow-inner">
              <Download className="w-6 h-6 text-amber-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm sm:text-base font-extrabold text-white">
                  {isMobile ? 'Get 4Rent Mobile App' : 'Get 4Rent Desktop & Mobile Apps'}
                </h3>
                <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-mono text-[10px] font-bold">
                  {isMobile ? '.APK' : 'v1.1.0'}
                </span>
              </div>
              <p className="text-xs sm:text-sm text-slate-300 mt-1">
                {isMobile
                  ? 'Offline Mobile App with live Sub-Meter camera.'
                  : 'Desktop Launcher (.exe) & offline Mobile App (.apk).'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={onOpenDownloadModal}
              className="px-4 py-2.5 rounded-2xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black text-xs flex items-center gap-2 shadow-lg shadow-amber-500/25 transition cursor-pointer active:scale-95"
            >
              <Download className="w-4 h-4" />
              <span>{isMobile ? 'Download Mobile App' : 'Download Desktop / Mobile'}</span>
            </button>
          </div>
        </section>
      )}

      {/* Your Rooms Section Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 pt-1">
        <div>
          <h2 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight">
            Your Rooms
          </h2>
          <p className="text-xs sm:text-sm text-slate-400 mt-0.5">
            Select a room for details, billing, and meter logs.
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-start sm:justify-end gap-2.5">
          <button
            type="button"
            onClick={onOpenAddRoom}
            className="px-4 py-2 rounded-full bg-[#151D2C] hover:bg-[#1E293E] border border-amber-500/35 text-xs font-bold text-amber-400 flex items-center gap-1.5 transition cursor-pointer btn-fluid shadow-sm"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Room</span>
          </button>
          <button
            type="button"
            onClick={() => onNavigate('inquiries')}
            className="hidden sm:inline-flex px-4 py-2 rounded-full bg-[#151D2C] hover:bg-[#1E293E] border border-[#28354E] text-xs font-bold text-blue-300 hover:text-white transition cursor-pointer btn-fluid"
          >
            Bookings ({pendingBookings.length})
          </button>
          <button
            type="button"
            onClick={() => onNavigate('archive')}
            className="hidden sm:inline-flex px-4 py-2 rounded-full bg-[#151D2C] hover:bg-[#1E293E] border border-[#28354E] text-xs font-bold text-slate-300 hover:text-white flex items-center gap-1.5 transition cursor-pointer btn-fluid"
          >
            <Archive className="w-3.5 h-3.5" />
            <span>Archive</span>
          </button>
          <button
            type="button"
            onClick={() => onNavigate('rooms')}
            className="hidden sm:inline-flex px-4 py-2 rounded-full bg-[#151D2C] hover:bg-[#1E293E] border border-[#28354E] text-xs font-bold text-slate-200 hover:text-white transition cursor-pointer btn-fluid"
          >
            Manage Rooms
          </button>
        </div>
      </div>

      {/* Empty State OR Active Rooms Grid */}
      {activeRooms.length === 0 ? (
        <div className="surface-card rounded-3xl px-6 py-16 flex flex-col items-center text-center my-4">
          <div className="w-22 h-22 rounded-[28px] bg-[#241E14] border border-amber-500/25 flex items-center justify-center mb-6 shadow-inner">
            <div className="relative">
              <Home className="w-11 h-11 text-amber-500 fill-amber-500/20" />
              <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-amber-500 text-slate-950 flex items-center justify-center font-bold text-xs">
                +
              </div>
            </div>
          </div>
          <h3 className="text-xl sm:text-2xl font-extrabold text-white">
            No rooms created yet
          </h3>
          <p className="text-sm text-slate-400 mt-2 max-w-sm leading-relaxed">
            Create your first apartment room to track continuous electric
            sub-meters, deposits, and official receipts.
          </p>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={onOpenAddRoom}
              className="px-7 py-4 rounded-2xl bg-[#F59E0B] hover:bg-[#FBBF24] text-slate-950 font-extrabold text-sm flex items-center gap-2.5 shadow-xl shadow-amber-500/20 transition cursor-pointer btn-fluid"
            >
              <Plus className="w-4 h-4 stroke-[2.5]" />
              <span>Create First Room</span>
            </button>
            {onOpenWalkthrough && (
              <button
                type="button"
                onClick={onOpenWalkthrough}
                className="px-6 py-4 rounded-2xl bg-[#172133] hover:bg-[#1F2D45] border border-amber-500/35 text-amber-300 font-extrabold text-sm flex items-center gap-2 transition cursor-pointer btn-fluid"
              >
                <Sparkles className="w-4 h-4 text-amber-400" />
                <span>Watch Visual Guide</span>
              </button>
            )}
          </div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {activeRooms.map((room) => {
              const isOccupied = room.status === 'occupied';
              const activeReceipt = getRoomActiveReceipt(room);
              const monthStatus = isOccupied
                ? getRoomMonthlyPaymentStatus(room, bills)
                : null;
              const safeDeposit =
                room.securityDeposit > 0
                  ? room.securityDeposit
                  : room.monthlyRent;
              const paidDepositCredit = isOccupied
                ? Math.max(0, room.securityDepositPaid || 0)
                : 0;
              const safeAdvance = isOccupied
                ? Math.max(0, room.advanceRent || 0)
                : 0;

              return (
                <div
                  key={room.id}
                  onClick={() => onSelectRoomDetails(room)}
                  className="surface-card surface-card-interactive rounded-3xl p-5 sm:p-6 flex flex-col justify-between cursor-pointer"
                >
                  <div className="space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-lg sm:text-xl font-extrabold text-white tracking-tight">
                        {/^\d+$/.test(room.name.trim()) ? `Room ${room.name.trim()}` : room.name}
                      </span>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {monthStatus && (
                          <span
                            className={`px-2.5 py-1 rounded-full text-[11px] font-extrabold inline-flex items-center gap-1 border ${
                              monthStatus.status === 'paid'
                                ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/35'
                                : monthStatus.status === 'partial'
                                ? 'bg-amber-500/15 text-amber-300 border-amber-500/35'
                                : monthStatus.status === 'unpaid'
                                ? 'bg-rose-500/15 text-rose-300 border-rose-500/35'
                                : 'bg-slate-800/80 text-slate-300 border-slate-700'
                            }`}
                          >
                            {monthStatus.status === 'paid' && (
                              <CheckCircle2 className="w-3 h-3 shrink-0" />
                            )}
                            <span>{monthStatus.badgeText}</span>
                          </span>
                        )}
                        <span
                          className={`px-3 py-1 rounded-full text-xs font-bold ${
                            isOccupied
                              ? 'bg-amber-500/15 text-amber-400 border border-amber-500/35'
                              : 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/35'
                          }`}
                        >
                          {isOccupied ? 'Occupied' : 'Vacant'}
                        </span>
                      </div>
                    </div>

                    {/* Tenant & Privacy Verification Bar */}
                    <div className="rounded-2xl bg-[#0D121B] border border-[#202B40] px-3.5 py-2.5 flex items-center justify-between gap-2 text-xs">
                      <span className="text-slate-400 font-medium shrink-0">Tenant</span>
                      {isOccupied && room.tenant?.fullName ? (
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="font-bold text-slate-100 break-words text-right">
                            {room.tenant.fullName}
                          </span>
                          <span title="Tenant Privacy & Verification Protected">
                            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                          </span>
                        </div>
                      ) : (
                        <span className="px-2.5 py-0.5 rounded-lg bg-emerald-500/15 text-emerald-400 font-bold text-[11px]">
                          Available for Booking
                        </span>
                      )}
                    </div>

                    {/* Clean 2x2 Metric Grid with Generous Spacing */}
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div className="rounded-2xl bg-[#0D121B] border border-[#202B40] p-3">
                        <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold block">
                          Monthly Rent
                        </span>
                        <span className="text-sm font-extrabold text-white font-mono-num mt-1 block break-words">
                          {formatPesoPrivacy(
                            room.monthlyRent,
                            privacyMaskEnabled
                          )}
                        </span>
                      </div>

                      <div className="rounded-2xl bg-[#0D121B] border border-[#202B40] p-3">
                        <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold block">
                          Req. Deposit
                        </span>
                        <span className="text-sm font-extrabold text-emerald-400 font-mono-num mt-1 block break-words">
                          {formatPesoPrivacy(safeDeposit, privacyMaskEnabled)}
                        </span>
                        {isOccupied && paidDepositCredit > 0 && (
                          <span className="text-[10px] text-emerald-300 font-semibold block mt-0.5 leading-snug">
                            Credit: {formatPesoPrivacy(paidDepositCredit, privacyMaskEnabled)}
                          </span>
                        )}
                      </div>

                      <div
                        className={`rounded-2xl bg-[#0D121B] border border-[#202B40] p-3 flex flex-col justify-between ${
                          isOccupied ? '' : 'col-span-2'
                        }`}
                      >
                        <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold block leading-snug">
                          Continuous Sub-Meter
                        </span>
                        <div className="mt-1">
                          <div className="text-sm font-extrabold text-amber-400 font-mono-num leading-tight break-words">
                            {room.lastMeterReading.toFixed(1)}{' '}
                            <span className="text-[11px] font-bold text-amber-400/80">
                              kWh
                            </span>
                          </div>
                          <div className="text-[10px] text-slate-400 font-mono-num mt-0.5 leading-snug">
                            @{formatPeso(globalElectricRate)}/kWh
                          </div>
                        </div>
                      </div>

                      {isOccupied && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onOpenAdvanceBalanceModal(room);
                          }}
                          className="rounded-2xl bg-[#0D121B] hover:bg-[#162235] border border-emerald-500/35 p-3 text-left transition cursor-pointer"
                          title="Manage or withdraw tenant advance balance"
                        >
                          <span className="text-[10px] uppercase tracking-wider text-emerald-400 font-bold flex items-center justify-between">
                            <span>Advance Bal.</span>
                            <Wallet className="w-3 h-3" />
                          </span>
                          <span className="text-sm font-extrabold text-emerald-400 font-mono-num mt-1 block">
                            {formatPesoPrivacy(safeAdvance, privacyMaskEnabled)}
                          </span>
                        </button>
                      )}
                    </div>

                    {isOccupied && room.unpaidBalance > 0 && (
                      <div className="rounded-2xl bg-red-500/10 border border-red-500/30 px-3.5 py-2 flex items-center justify-between text-xs text-red-400">
                        <span className="font-semibold">Unpaid Balance Due</span>
                        <span className="font-extrabold font-mono-num">
                          {formatPesoPrivacy(
                            room.unpaidBalance,
                            privacyMaskEnabled
                          )}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Room Card Action Footer */}
                  <div
                    className="mt-4 pt-3.5 border-t border-[#202B40] flex flex-col gap-2"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="flex items-center gap-2">
                      {isOccupied ? (
                        <>
                          <button
                            type="button"
                            onClick={() => onOpenScanMeter(room)}
                            className="flex-1 py-2.5 px-3 rounded-2xl bg-[#F59E0B] hover:bg-[#FBBF24] text-slate-950 font-extrabold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer btn-fluid shadow-md shadow-amber-500/15"
                          >
                            <Camera className="w-3.5 h-3.5" />
                            <span>OCR Sub-Meter</span>
                          </button>
                          {activeReceipt ? (
                            <button
                              type="button"
                              onClick={() => onSelectBillForReceipt(activeReceipt)}
                              className="py-2.5 px-3 rounded-2xl bg-[#1A2334] hover:bg-[#233047] border border-[#2B3A56] text-amber-400 font-bold text-xs flex items-center gap-1.5 transition cursor-pointer btn-fluid"
                              title="Open receipt"
                            >
                              <ReceiptText className="w-3.5 h-3.5" />
                              <span className="hidden sm:inline">Receipt</span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => onSelectRoomDetails(room)}
                              className="py-2.5 px-3 rounded-2xl bg-[#1A2334] hover:bg-[#233047] border border-[#2B3A56] text-slate-300 font-bold text-xs transition cursor-pointer btn-fluid"
                            >
                              Details
                            </button>
                          )}
                        </>
                      ) : (
                        <button
                          type="button"
                          onClick={() => onSelectRoomDetails(room)}
                          className="flex-1 py-2.5 px-3 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs flex items-center justify-center gap-1.5 transition cursor-pointer btn-fluid shadow-md shadow-emerald-500/20"
                          title="Room is vacant. Assign an active tenant."
                        >
                          <UserPlus className="w-3.5 h-3.5" />
                          <span>Assign Tenant / Occupy</span>
                        </button>
                      )}
                    </div>

                    <div className="text-[10px] text-slate-400 text-center font-medium sm:hidden flex items-center justify-center gap-1">
                      <span>Tap card for details &amp; logs</span>
                      <ChevronRight className="w-3 h-3 text-slate-400" />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Analytics Section with Generous Gaps */}
          <section className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-2">
            <div className="surface-card rounded-3xl p-5 sm:p-7">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center shrink-0">
                    <TrendingUp className="w-5 h-5 text-emerald-400" />
                  </div>
                  <div>
                    <h3 className="text-base font-extrabold text-white leading-snug">
                      Revenue Overview
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5 leading-snug">
                      Active collections &amp; sub-meter billing
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onNavigate('payments')}
                  className="px-3.5 py-2 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 text-xs font-black text-amber-300 inline-flex items-center gap-1.5 cursor-pointer shadow-sm transition active:scale-95 shrink-0"
                  title="View All Payment History & Records"
                >
                  <ReceiptText className="w-3.5 h-3.5 text-amber-400" />
                  <span>All Payments</span>
                  <ChevronRight className="w-3.5 h-3.5 text-amber-400" />
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 mb-5">
                <div className="rounded-2xl bg-[#0D121B] border border-[#202B40] p-3.5 sm:p-4">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 block leading-snug">
                    Total Paid (Revenue)
                  </span>
                  <div className="text-lg sm:text-xl lg:text-2xl font-extrabold text-emerald-400 font-mono-num mt-1 break-words">
                    {formatPesoPrivacy(totalRevenuePaid, privacyMaskEnabled)}
                  </div>
                </div>
                <div className="rounded-2xl bg-[#0D121B] border border-[#202B40] p-3.5 sm:p-4">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 block leading-snug">
                    Total Unpaid (Due)
                  </span>
                  <div className="text-lg sm:text-xl lg:text-2xl font-extrabold text-amber-400 font-mono-num mt-1 break-words">
                    {formatPesoPrivacy(totalUnpaidDue, privacyMaskEnabled)}
                  </div>
                </div>
              </div>

              {activeBills.length > 0 && (
                <div className="mt-5 pt-4 border-t border-[#222E44]">
                  <div className="text-xs font-semibold text-slate-400 mb-2.5">
                    Active Room Receipts
                  </div>
                  <div className="space-y-2.5">
                    {activeBills.slice(0, 4).map((b) => (
                      <button
                        key={b.id}
                        type="button"
                        onClick={() => onSelectBillForReceipt(b)}
                        className="w-full rounded-2xl bg-[#0D121B] hover:bg-[#172133] border border-[#202B40] px-3.5 py-3 sm:px-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-left transition cursor-pointer"
                      >
                        <div className="flex items-start gap-2.5 min-w-0">
                          <ReceiptText className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                          <div className="min-w-0">
                            <span className="text-xs sm:text-sm font-bold text-white block leading-snug break-words">
                              {b.roomName} • {b.tenantName}
                            </span>
                            <span className="block text-[11px] text-slate-400 mt-0.5 leading-snug break-words">
                              {b.prevReading.toFixed(1)} → {b.currReading.toFixed(1)} kWh (Δ {b.consumptionKwh.toFixed(1)} kWh @ {formatPeso(b.electricRate)})
                            </span>
                          </div>
                        </div>
                        <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-center shrink-0 pt-1.5 sm:pt-0 border-t sm:border-t-0 border-[#1B2538]">
                          <span className="text-xs sm:text-sm font-extrabold text-white font-mono-num block">
                            {formatPesoPrivacy(
                              b.totalAmountDue,
                              privacyMaskEnabled
                            )}
                          </span>
                          <span
                            className={`text-[10px] font-extrabold uppercase ${
                              b.status === 'paid'
                                ? 'text-emerald-400'
                                : b.status === 'partial'
                                ? 'text-amber-400'
                                : 'text-red-400'
                            }`}
                          >
                            {b.status === 'paid'
                              ? `Paid (${b.billingPeriod})`
                              : `${b.status} (${b.billingPeriod})`}
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="surface-card rounded-3xl p-5 sm:p-7 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-5">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center shrink-0">
                      <Zap className="w-5 h-5 text-amber-400" />
                    </div>
                    <div>
                      <h3 className="text-base font-extrabold text-white">
                        Sub-Meter Consumption
                      </h3>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Total: {totalKwhBilled.toFixed(1)} kWh @ {formatPeso(globalElectricRate)}/kWh
                      </p>
                    </div>
                  </div>
                  <BarChart3 className="w-5 h-5 text-slate-500" />
                </div>

                <div className="space-y-4 mt-4">
                  {activeRooms.map((r) => {
                    const roomLogs = persistentLogs.filter((l) => l.roomId === r.id);
                    const roomLogsKwh = roomLogs.reduce(
                      (s, l) => s + (Number(l.consumptionDeltaKwh) || 0),
                      0
                    );
                    const roomBills = bills.filter((b) => b.roomId === r.id);
                    const roomBillsKwh = roomBills.reduce(
                      (s, b) => s + (Number(b.consumptionKwh) || 0),
                      0
                    );
                    const roomKwh = Math.max(roomLogsKwh, roomBillsKwh);
                    const maxKwh = Math.max(100, totalKwhBilled);
                    const pct = Math.min(
                      100,
                      Math.round((roomKwh / maxKwh) * 100)
                    );

                    return (
                      <div
                        key={r.id}
                        onClick={() => onSelectRoomDetails(r)}
                        className="space-y-1.5 cursor-pointer group"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                          <span className="font-bold text-slate-200 group-hover:text-amber-400 transition">
                            {r.name}{' '}
                            <span className="text-slate-400 font-normal">
                              (Meter: {r.lastMeterReading.toFixed(1)} kWh)
                            </span>
                          </span>
                          <span className="font-mono-num font-bold text-amber-400 shrink-0">
                            {roomKwh.toFixed(1)} kWh billed
                          </span>
                        </div>
                        <div className="w-full h-3 rounded-full bg-[#0D121B] border border-[#202B40] overflow-hidden">
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

              <div className="mt-7 pt-4 border-t border-[#222E44] flex flex-wrap items-center justify-between gap-3 text-xs text-slate-300">
                <span className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>Paid Deposit Auto-Deducts • Overpay → Advance</span>
                </span>
                <button
                  type="button"
                  onClick={() => onOpenScanMeter(activeRooms[0])}
                  className="px-3.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs inline-flex items-center gap-1.5 cursor-pointer shadow transition active:scale-95 shrink-0"
                >
                  <Camera className="w-3.5 h-3.5" />
                  <span>Open OCR Reader</span>
                </button>
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  );
};
