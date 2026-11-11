import React, { useMemo, useState } from 'react';
import {
  ArrowLeft,
  Calendar,
  CalendarDays,
  Camera,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  DoorOpen,
  Eye,
  EyeOff,
  Filter,
  ListFilter,
  MessageCircle,
  Phone,
  ReceiptText,
  Share2,
  Sparkles,
  User,
  Zap,
} from 'lucide-react';
import { BillRecord, NavigationTab, Room } from '../../types/rental';
import {
  formatPeso,
  formatPesoPrivacy,
  maskPhoneNumber,
} from '../../utils/billingCalculator';
import { openMessengerAppWithReceipt } from '../../services/ocrService';

interface DueCalendarViewProps {
  rooms: Room[];
  bills: BillRecord[];
  privacyMaskEnabled?: boolean;
  onTogglePrivacyMask?: () => void;
  onBack: () => void;
  onNavigate: (tab: NavigationTab) => void;
  onSelectRoomDetails: (room: Room) => void;
  onOpenScanMeter: (room: Room) => void;
  onSelectBillForReceipt: (bill: BillRecord) => void;
}

export const DueCalendarView: React.FC<DueCalendarViewProps> = ({
  rooms,
  bills,
  privacyMaskEnabled = false,
  onTogglePrivacyMask,
  onBack,
  onNavigate,
  onSelectRoomDetails,
  onOpenScanMeter,
  onSelectBillForReceipt,
}) => {
  const today = useMemo(() => new Date(), []);
  const [currentYear, setCurrentYear] = useState<number>(today.getFullYear());
  const [currentMonth, setCurrentMonth] = useState<number>(today.getMonth()); // 0-indexed
  const [selectedDay, setSelectedDay] = useState<number | null>(today.getDate());
  const [viewMode, setViewMode] = useState<'calendar' | 'agenda'>('calendar');
  const [statusFilter, setStatusFilter] = useState<'all' | 'unpaid' | 'paid'>('all');

  // Month navigation
  const handlePrevMonth = () => {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear((y) => y - 1);
    } else {
      setCurrentMonth((m) => m - 1);
    }
    setSelectedDay(null);
  };

  const handleNextMonth = () => {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear((y) => y + 1);
    } else {
      setCurrentMonth((m) => m + 1);
    }
    setSelectedDay(null);
  };

  const handleJumpToToday = () => {
    setCurrentYear(today.getFullYear());
    setCurrentMonth(today.getMonth());
    setSelectedDay(today.getDate());
  };

  // Occupied rooms
  const occupiedRooms = useMemo(
    () => rooms.filter((r) => r.status === 'occupied' && Boolean(r.tenant)),
    [rooms]
  );

  // Month label (e.g., "November 2026")
  const monthName = useMemo(() => {
    const d = new Date(currentYear, currentMonth, 1);
    return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  }, [currentYear, currentMonth]);

  // Calendar dates calculation
  const daysInMonth = useMemo(() => {
    return new Date(currentYear, currentMonth + 1, 0).getDate();
  }, [currentYear, currentMonth]);

  const firstDayOfWeek = useMemo(() => {
    return new Date(currentYear, currentMonth, 1).getDay(); // 0 = Sun, 1 = Mon ...
  }, [currentYear, currentMonth]);

  // Map each room to its due status for the selected month
  const roomDueMap = useMemo(() => {
    const monthShort = new Date(currentYear, currentMonth, 1).toLocaleDateString('en-US', {
      month: 'short',
      year: 'numeric',
    });

    return occupiedRooms.map((room) => {
      // Due day is usually 1 - 10, defaults to 5 if unset
      const dueDay = room.tenant?.dueDayOfMonth
        ? Math.min(Math.max(room.tenant.dueDayOfMonth, 1), daysInMonth)
        : 5;

      // Find matching bill for this month & room
      const bill = bills.find(
        (b) =>
          b.roomId === room.id &&
          !b.isArchived &&
          (b.billingPeriod === monthShort ||
            (b.createdAt &&
              new Date(b.createdAt).getMonth() === currentMonth &&
              new Date(b.createdAt).getFullYear() === currentYear))
      );

      const status = bill ? bill.status : 'unpaid';
      const totalDue = bill ? bill.totalAmountDue : room.monthlyRent;
      const balanceDue = bill ? bill.remainingBalance : room.monthlyRent;

      return {
        room,
        dueDay,
        bill,
        status,
        totalDue,
        balanceDue,
      };
    });
  }, [occupiedRooms, bills, currentYear, currentMonth, daysInMonth]);

  // Group rooms by due day
  const roomsByDay = useMemo(() => {
    const map: Record<number, typeof roomDueMap> = {};
    for (let d = 1; d <= daysInMonth; d++) {
      map[d] = [];
    }
    roomDueMap.forEach((item) => {
      if (!map[item.dueDay]) map[item.dueDay] = [];
      map[item.dueDay].push(item);
    });
    return map;
  }, [roomDueMap, daysInMonth]);

  // Summary Metrics
  const summary = useMemo(() => {
    let totalExpected = 0;
    let totalCollected = 0;
    let totalPending = 0;
    let paidCount = 0;
    let unpaidCount = 0;

    roomDueMap.forEach((item) => {
      totalExpected += item.totalDue;
      if (item.status === 'paid') {
        paidCount++;
        totalCollected += item.totalDue;
      } else {
        unpaidCount++;
        totalPending += item.balanceDue;
      }
    });

    return {
      totalExpected,
      totalCollected,
      totalPending,
      paidCount,
      unpaidCount,
      totalRooms: occupiedRooms.length,
    };
  }, [roomDueMap, occupiedRooms.length]);

  // Filtered rooms for the bottom list
  const filteredDueList = useMemo(() => {
    let list = roomDueMap;

    // Filter by selected day
    if (selectedDay !== null) {
      list = list.filter((item) => item.dueDay === selectedDay);
    }

    // Filter by payment status
    if (statusFilter === 'paid') {
      list = list.filter((item) => item.status === 'paid');
    } else if (statusFilter === 'unpaid') {
      list = list.filter((item) => item.status === 'unpaid' || item.status === 'partial');
    }

    // Sort by day ascending
    return list.sort((a, b) => a.dueDay - b.dueDay);
  }, [roomDueMap, selectedDay, statusFilter]);

  const isCurrentActiveMonth =
    currentYear === today.getFullYear() && currentMonth === today.getMonth();

  return (
    <div className="space-y-6 pb-20 animate-fade-in text-slate-100">
      {/* 1. Header & Controls */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="w-10 h-10 rounded-2xl bg-[#141C2B] hover:bg-[#1D283E] border border-[#25324A] text-slate-300 hover:text-white flex items-center justify-center transition cursor-pointer"
            aria-label="Back to dashboard"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight flex items-center gap-2.5">
                <CalendarDays className="w-6 h-6 text-amber-400" />
                <span>Due Date &amp; Rent Schedule Calendar</span>
              </h1>
              <span className="hidden sm:inline-block px-2.5 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300 font-mono text-xs font-bold">
                Day 1–10 Grace Window
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Track room rent due dates, payment collection states, and 1-tap receipt forwarding.
            </p>
          </div>
        </div>

        {/* Action Controls & Navigation */}
        <div className="flex flex-wrap items-center gap-2.5">
          {onTogglePrivacyMask && (
            <button
              type="button"
              onClick={onTogglePrivacyMask}
              className={`h-10 px-3.5 rounded-2xl text-xs font-bold flex items-center gap-2 transition cursor-pointer border ${
                privacyMaskEnabled
                  ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                  : 'bg-[#141C2B] border-[#25324A] text-slate-300 hover:text-white'
              }`}
            >
              {privacyMaskEnabled ? <EyeOff className="w-4 h-4 text-emerald-400" /> : <Eye className="w-4 h-4" />}
              <span className="hidden sm:inline">{privacyMaskEnabled ? 'Privacy Shield On' : 'Privacy Shield'}</span>
            </button>
          )}

          {/* View Mode Toggle */}
          <div className="flex rounded-2xl bg-[#101622] p-1 border border-[#243147]">
            <button
              type="button"
              onClick={() => setViewMode('calendar')}
              className={`px-3 py-1.5 rounded-xl text-xs font-extrabold flex items-center gap-1.5 transition cursor-pointer ${
                viewMode === 'calendar'
                  ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Calendar className="w-3.5 h-3.5" />
              <span>Calendar</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('agenda')}
              className={`px-3 py-1.5 rounded-xl text-xs font-extrabold flex items-center gap-1.5 transition cursor-pointer ${
                viewMode === 'agenda'
                  ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <ListFilter className="w-3.5 h-3.5" />
              <span>Agenda</span>
            </button>
          </div>

          {/* Month Stepper */}
          <div className="flex items-center gap-1.5 rounded-2xl bg-[#141C2B] border border-[#25324A] p-1">
            <button
              type="button"
              onClick={handlePrevMonth}
              className="w-8 h-8 rounded-xl hover:bg-[#1E2B40] flex items-center justify-center text-slate-300 hover:text-white transition cursor-pointer"
              aria-label="Previous month"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="px-2 font-bold text-xs text-white min-w-[110px] text-center">
              {monthName}
            </span>
            <button
              type="button"
              onClick={handleNextMonth}
              className="w-8 h-8 rounded-xl hover:bg-[#1E2B40] flex items-center justify-center text-slate-300 hover:text-white transition cursor-pointer"
              aria-label="Next month"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {!isCurrentActiveMonth && (
            <button
              type="button"
              onClick={handleJumpToToday}
              className="h-10 px-3.5 rounded-2xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/35 text-amber-300 text-xs font-bold transition cursor-pointer"
            >
              Current Month
            </button>
          )}
        </div>
      </div>

      {/* 2. Month Overview Metrics Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Total Rent Due */}
        <div className="surface-card rounded-2xl p-4 sm:p-5 border border-[#243147] flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Total Expected Rent</span>
            <Sparkles className="w-4 h-4 text-amber-400" />
          </div>
          <div className="mt-2">
            <div className="text-lg sm:text-2xl font-black text-white font-mono">
              {formatPesoPrivacy(summary.totalExpected, privacyMaskEnabled)}
            </div>
            <div className="text-[11px] text-slate-400 mt-1">
              Across {summary.totalRooms} occupied rooms
            </div>
          </div>
        </div>

        {/* Collected */}
        <div className="surface-card rounded-2xl p-4 sm:p-5 border border-[#243147] flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Collected / Paid</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="mt-2">
            <div className="text-lg sm:text-2xl font-black text-emerald-400 font-mono">
              {formatPesoPrivacy(summary.totalCollected, privacyMaskEnabled)}
            </div>
            <div className="text-[11px] text-emerald-300/80 mt-1 font-semibold">
              ✓ {summary.paidCount} room{summary.paidCount === 1 ? '' : 's'} paid in full
            </div>
          </div>
        </div>

        {/* Pending / Overdue */}
        <div className="surface-card rounded-2xl p-4 sm:p-5 border border-[#243147] flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Pending Balance</span>
            <Clock className="w-4 h-4 text-rose-400" />
          </div>
          <div className="mt-2">
            <div className="text-lg sm:text-2xl font-black text-rose-400 font-mono">
              {formatPesoPrivacy(summary.totalPending, privacyMaskEnabled)}
            </div>
            <div className="text-[11px] text-rose-300/80 mt-1 font-semibold">
              ● {summary.unpaidCount} room{summary.unpaidCount === 1 ? '' : 's'} pending/due
            </div>
          </div>
        </div>

        {/* Payment Grace Window Pill */}
        <div className="surface-card rounded-2xl p-4 sm:p-5 border border-amber-500/35 bg-gradient-to-br from-amber-500/10 to-[#121927] flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-amber-300 font-bold">
            <span>Grace Window</span>
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
          </div>
          <div className="mt-2">
            <div className="text-base sm:text-lg font-black text-white">
              Day 1 – 10 Window
            </div>
            <div className="text-[11px] text-amber-200/80 mt-1">
              Compliant with Rent Control grace window policy
            </div>
          </div>
        </div>
      </div>

      {/* 3. Main Calendar Month Grid (Desktop & Tablet) */}
      {viewMode === 'calendar' && (
        <div className="surface-card rounded-3xl p-4 sm:p-6 border border-[#243147] space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[#232F44]">
            <div className="flex items-center gap-3">
              <span className="text-sm font-extrabold text-white">
                {monthName} Calendar Grid
              </span>
              <span className="text-xs text-slate-400">
                (Click any day to view rooms due)
              </span>
            </div>

            {selectedDay !== null && (
              <button
                type="button"
                onClick={() => setSelectedDay(null)}
                className="px-3 py-1 rounded-xl bg-[#1C263A] hover:bg-[#25334D] text-xs font-bold text-amber-300 transition cursor-pointer flex items-center gap-1.5"
              >
                <span>Clear Day Filter</span>
                <span className="text-[11px] text-slate-400 font-mono">
                  (Showing All)
                </span>
              </button>
            )}
          </div>

          {/* Day of Week Headers */}
          <div className="grid grid-cols-7 gap-1.5 sm:gap-2 text-center text-xs font-extrabold text-slate-400 uppercase tracking-wider">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
              <div key={d} className="py-1">
                {d}
              </div>
            ))}
          </div>

          {/* Calendar Grid Cells */}
          <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
            {/* Blank leading cells */}
            {Array.from({ length: firstDayOfWeek }).map((_, i) => (
              <div
                key={`empty-${i}`}
                className="min-h-[70px] sm:min-h-[96px] rounded-2xl bg-[#0B1019]/40 border border-dashed border-[#1C2536]"
              />
            ))}

            {/* Actual day cells */}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const isToday =
                isCurrentActiveMonth && today.getDate() === day;
              const isSelected = selectedDay === day;
              const isGraceWindow = day >= 1 && day <= 10;
              const dayRooms = roomsByDay[day] || [];
              const hasDue = dayRooms.length > 0;

              return (
                <button
                  key={day}
                  type="button"
                  onClick={() =>
                    setSelectedDay(selectedDay === day ? null : day)
                  }
                  className={`min-h-[70px] sm:min-h-[96px] rounded-2xl p-1.5 sm:p-2 text-left flex flex-col justify-between transition cursor-pointer border relative overflow-hidden group ${
                    isSelected
                      ? 'bg-amber-500/20 border-amber-500 shadow-lg shadow-amber-500/25 ring-2 ring-amber-500/50'
                      : isGraceWindow
                      ? 'bg-[#131B2A] border-amber-500/25 hover:border-amber-500/60'
                      : 'bg-[#0E1420] border-[#202C3F] hover:border-slate-500'
                  }`}
                >
                  {/* Grace Window Tag indicator on Days 1 to 10 */}
                  {isGraceWindow && (
                    <div className="absolute top-0 right-0 w-8 h-8 pointer-events-none overflow-hidden">
                      <div className="absolute top-0 right-0 transform translate-x-3 -translate-y-3 w-8 h-8 bg-amber-500/25 rotate-45" />
                    </div>
                  )}

                  {/* Day Number Header */}
                  <div className="flex items-center justify-between">
                    <span
                      className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-black ${
                        isToday
                          ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/40'
                          : isSelected
                          ? 'text-amber-300 font-extrabold'
                          : isGraceWindow
                          ? 'text-amber-200'
                          : 'text-slate-300'
                      }`}
                    >
                      {day}
                    </span>

                    {hasDue && (
                      <span className="text-[10px] font-mono font-black px-1.5 py-0.2 rounded-full bg-slate-800 text-amber-300 border border-[#2D3C55]">
                        {dayRooms.length}
                      </span>
                    )}
                  </div>

                  {/* Room Badges in Day Cell */}
                  <div className="space-y-1 mt-1">
                    {dayRooms.slice(0, 2).map((item) => (
                      <div
                        key={item.room.id}
                        className={`truncate text-[10px] font-semibold px-1.5 py-0.5 rounded-md flex items-center justify-between ${
                          item.status === 'paid'
                            ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-300'
                            : item.status === 'partial'
                            ? 'bg-amber-500/15 border border-amber-500/30 text-amber-300'
                            : 'bg-rose-500/15 border border-rose-500/30 text-rose-300'
                        }`}
                        title={`${item.room.name} (${item.room.tenant?.fullName}): ${item.status.toUpperCase()}`}
                      >
                        <span className="truncate">{item.room.name}</span>
                        <span className="text-[9px] font-mono shrink-0 ml-1">
                          {item.status === 'paid' ? '✓' : '₱'}
                        </span>
                      </div>
                    ))}

                    {dayRooms.length > 2 && (
                      <div className="text-[9px] font-bold text-slate-400 pl-1">
                        +{dayRooms.length - 2} more
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-3 text-xs text-slate-400 border-t border-[#1F293D]">
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-full bg-emerald-500/20 border border-emerald-500/50 inline-block" />
                <span>Paid</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-full bg-amber-500/20 border border-amber-500/50 inline-block" />
                <span>Partial</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-full bg-rose-500/20 border border-rose-500/50 inline-block" />
                <span>Unpaid / Due</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-md bg-amber-500/25 border border-amber-500/40 inline-block" />
                <span>Day 1–10 Window</span>
              </span>
            </div>

            <span className="text-[11px] text-slate-400">
              Showing active occupied rooms only
            </span>
          </div>
        </div>
      )}

      {/* 4. Filter Bar & Rooms Due Details List */}
      <div className="surface-card rounded-3xl p-4 sm:p-6 border border-[#243147] space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#232F44]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
              <DoorOpen className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-extrabold text-white">
                {selectedDay !== null
                  ? `Rooms Due on Day ${selectedDay} (${monthName.split(' ')[0]} ${selectedDay})`
                  : `All Scheduled Rooms Due in ${monthName}`}
              </h2>
              <p className="text-xs text-slate-400">
                {filteredDueList.length} room{filteredDueList.length === 1 ? '' : 's'} matching criteria
              </p>
            </div>
          </div>

          {/* Payment Status Filter Buttons */}
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setStatusFilter('all')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                statusFilter === 'all'
                  ? 'bg-amber-500 text-slate-950 font-black'
                  : 'bg-[#151D2C] text-slate-400 hover:text-white'
              }`}
            >
              All ({roomDueMap.length})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('unpaid')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                statusFilter === 'unpaid'
                  ? 'bg-rose-500 text-white font-black'
                  : 'bg-[#151D2C] text-rose-400 hover:text-rose-200'
              }`}
            >
              Pending ({summary.unpaidCount})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('paid')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                statusFilter === 'paid'
                  ? 'bg-emerald-500 text-slate-950 font-black'
                  : 'bg-[#151D2C] text-emerald-400 hover:text-emerald-200'
              }`}
            >
              Paid ({summary.paidCount})
            </button>
          </div>
        </div>

        {/* Room Due Cards List */}
        {filteredDueList.length === 0 ? (
          <div className="text-center py-12 px-4 rounded-2xl bg-[#0D121B] border border-[#202C3F] space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-slate-800/80 text-slate-400 flex items-center justify-center mx-auto">
              <Calendar className="w-6 h-6" />
            </div>
            <h3 className="font-extrabold text-white text-base">
              No Rooms Due for this Selection
            </h3>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">
              {selectedDay !== null
                ? `No occupied rooms have rent due on day ${selectedDay}. Try selecting another day or clearing the day filter.`
                : 'There are no active occupied rooms for this billing cycle.'}
            </p>
            {selectedDay !== null && (
              <button
                type="button"
                onClick={() => setSelectedDay(null)}
                className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs transition cursor-pointer shadow-md shadow-amber-500/20"
              >
                Show All Days
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredDueList.map((item) => {
              const { room, dueDay, bill, status, totalDue, balanceDue } = item;
              const tenant = room.tenant;

              return (
                <div
                  key={room.id}
                  className={`rounded-2xl bg-[#0D121B] border p-4.5 flex flex-col justify-between gap-4 transition duration-200 hover:border-amber-500/40 ${
                    status === 'paid'
                      ? 'border-emerald-500/25'
                      : status === 'partial'
                      ? 'border-amber-500/35'
                      : 'border-[#243147]'
                  }`}
                >
                  <div className="space-y-3">
                    {/* Header Row: Room Name & Status */}
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => onSelectRoomDetails(room)}
                            className="font-black text-base text-white hover:text-amber-400 transition text-left cursor-pointer"
                          >
                            {room.name}
                          </button>
                          <span className="px-2 py-0.5 rounded-md bg-[#1C263A] text-amber-300 font-mono text-[10px] font-extrabold">
                            Due: Day {dueDay}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-slate-400 mt-1">
                          <User className="w-3.5 h-3.5 text-slate-500" />
                          <span className="font-semibold text-slate-300">
                            {tenant?.fullName || 'Occupied'}
                          </span>
                          {tenant?.phone && (
                            <span className="font-mono text-slate-400 text-[11px]">
                              • {maskPhoneNumber(tenant.phone, privacyMaskEnabled)}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Status Badge */}
                      <span
                        className={`px-2.5 py-1 rounded-full text-xs font-black shrink-0 flex items-center gap-1 ${
                          status === 'paid'
                            ? 'bg-emerald-500/15 border border-emerald-500/35 text-emerald-400'
                            : status === 'partial'
                            ? 'bg-amber-500/15 border border-amber-500/35 text-amber-300'
                            : 'bg-rose-500/15 border border-rose-500/35 text-rose-400'
                        }`}
                      >
                        {status === 'paid' && <Check className="w-3.5 h-3.5" />}
                        {status === 'paid'
                          ? 'PAID'
                          : status === 'partial'
                          ? 'PARTIAL'
                          : 'DUE / UNPAID'}
                      </span>
                    </div>

                    {/* Financial Figures */}
                    <div className="grid grid-cols-2 gap-2 pt-2 border-t border-[#1C2536] text-xs">
                      <div className="bg-[#121927] rounded-xl p-2.5 border border-[#1F2B3E]">
                        <span className="text-[11px] text-slate-400 block">Total Due:</span>
                        <span className="font-mono font-extrabold text-white text-sm">
                          {formatPesoPrivacy(totalDue, privacyMaskEnabled)}
                        </span>
                      </div>
                      <div className="bg-[#121927] rounded-xl p-2.5 border border-[#1F2B3E]">
                        <span className="text-[11px] text-slate-400 block">Balance Due:</span>
                        <span
                          className={`font-mono font-extrabold text-sm ${
                            balanceDue === 0 ? 'text-emerald-400' : 'text-rose-400'
                          }`}
                        >
                          {formatPesoPrivacy(balanceDue, privacyMaskEnabled)}
                        </span>
                      </div>
                    </div>

                    {/* Sub-Meter Electricity Reading Info */}
                    <div className="flex items-center justify-between text-[11px] text-slate-400 px-1">
                      <span className="flex items-center gap-1.5">
                        <Zap className="w-3 h-3 text-amber-400" />
                        <span>Sub-Meter: {room.lastMeterReading.toFixed(1)} kWh</span>
                      </span>
                      {room.advanceRent > 0 && (
                        <span className="text-emerald-400 font-semibold font-mono">
                          Advance: {formatPesoPrivacy(room.advanceRent, privacyMaskEnabled)}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* 1-Tap Action Row */}
                  <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-[#1C2536]">
                    {/* Scan Meter Button */}
                    <button
                      type="button"
                      onClick={() => onOpenScanMeter(room)}
                      className="flex-1 min-w-[120px] py-2 px-3 rounded-xl bg-[#172233] hover:bg-[#202E45] border border-[#2B3C56] text-amber-300 text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer"
                    >
                      <Camera className="w-3.5 h-3.5 text-amber-400" />
                      <span>Scan Meter</span>
                    </button>

                    {/* View Receipt / Statement */}
                    {bill ? (
                      <button
                        type="button"
                        onClick={() => onSelectBillForReceipt(bill)}
                        className="flex-1 min-w-[120px] py-2 px-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs flex items-center justify-center gap-1.5 transition cursor-pointer shadow-md shadow-amber-500/20"
                      >
                        <ReceiptText className="w-3.5 h-3.5" />
                        <span>Receipt</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onSelectRoomDetails(room)}
                        className="flex-1 min-w-[120px] py-2 px-3 rounded-xl bg-[#172233] hover:bg-[#202E45] border border-[#2B3C56] text-slate-300 text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer"
                      >
                        <span>Room Details</span>
                      </button>
                    )}

                    {/* Messenger Share Quick Button */}
                    {bill && (
                      <button
                        type="button"
                        onClick={() => {
                          openMessengerAppWithReceipt({
                            receiptNo: bill.receiptNo,
                            tenantName: bill.tenantName,
                            roomName: bill.roomName,
                            messengerHandle: bill.tenantMessenger,
                            shareUrl: window.location.href,
                          });
                        }}
                        className="py-2 px-3 rounded-xl bg-[#172233] hover:bg-[#202E45] border border-blue-500/35 text-blue-400 text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
                        title="Forward Receipt to Messenger"
                      >
                        <MessageCircle className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">Messenger</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
