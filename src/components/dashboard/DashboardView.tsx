import React, { useEffect, useState } from 'react';
import {
  BarChart3,
  BellRing,
  Building2,
  Calendar,
  Camera,
  DoorOpen,
  FileSpreadsheet,
  Home,
  Menu,
  Plus,
  ReceiptText,
  Settings,
  Sparkles,
  TrendingUp,
  User,
  Zap,
} from 'lucide-react';
import { BillRecord, NavigationTab, Room } from '../../types/rental';
import { formatPeso } from '../../utils/billingCalculator';

interface DashboardViewProps {
  rooms: Room[];
  bills: BillRecord[];
  onOpenDrawer: () => void;
  onNavigate: (tab: NavigationTab) => void;
  onOpenAddRoom: () => void;
  onOpenScanMeter: (room: Room) => void;
  onSelectBillForReceipt: (bill: BillRecord) => void;
  onLoadSampleData: () => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  rooms,
  bills,
  onOpenDrawer,
  onNavigate,
  onOpenAddRoom,
  onOpenScanMeter,
  onSelectBillForReceipt,
  onLoadSampleData,
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

  const totalRooms = rooms.length;
  const occupiedRooms = rooms.filter((r) => r.status === 'occupied').length;
  const vacantRooms = rooms.filter((r) => r.status === 'vacant').length;

  const totalRevenuePaid = bills.reduce(
    (sum, b) => sum + (Number(b.amountPaid) || 0),
    0
  );
  const totalUnpaidDue = bills.reduce(
    (sum, b) => sum + (Number(b.remainingBalance) || 0),
    0
  );
  const totalKwhBilled = bills.reduce(
    (sum, b) => sum + (Number(b.consumptionKwh) || 0),
    0
  );

  // Rooms with unpaid balances or upcoming due dates
  const roomsWithDueBalance = rooms.filter((r) => r.unpaidBalance > 0);

  return (
    <div className="w-full max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-5 pb-24">
      {/* Top Header (Matches Screenshot 3) */}
      <header className="flex items-start justify-between gap-4 mb-7">
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
            <div className="flex items-center gap-1.5 text-xs text-slate-400 mt-1.5">
              <Calendar className="w-3.5 h-3.5 text-slate-500" />
              <span>{formattedDateTime}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          {rooms.length > 0 && (
            <button
              type="button"
              onClick={() => onOpenScanMeter(rooms[0])}
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

      {/* 3 Primary KPI Summary Cards (Matches Screenshot 3) */}
      <section
        aria-label="Room occupancy summary"
        className="grid grid-cols-3 gap-3 sm:gap-5 mb-8"
      >
        {/* Total Card */}
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

        {/* Occupied Card */}
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

        {/* Vacant Card */}
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

      {/* Due Balance Reminder Banner (when unpaid balances exist) */}
      {roomsWithDueBalance.length > 0 && (
        <section className="mb-7 rounded-2xl bg-gradient-to-r from-amber-500/15 via-amber-500/10 to-transparent border border-amber-500/30 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start sm:items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center shrink-0">
              <BellRing className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-amber-300">
                Active Balance Reminders ({roomsWithDueBalance.length}{' '}
                {roomsWithDueBalance.length === 1 ? 'room' : 'rooms'})
              </h2>
              <p className="text-xs text-slate-300 mt-0.5">
                {roomsWithDueBalance
                  .map((r) => `${r.name} (${formatPeso(r.unpaidBalance)})`)
                  .join(' • ')}{' '}
                currently have unpaid carried-over balances.
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

      {/* Your Rooms Section Header (Matches Screenshot 3) */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg sm:text-xl font-bold text-white tracking-tight">
          Your Rooms
        </h2>
        <div className="flex items-center gap-2">
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
            onClick={() => onNavigate('rooms')}
            className="px-3.5 py-1.5 rounded-full bg-[#161C28] hover:bg-[#1F2839] border border-[#28334A] text-xs font-semibold text-slate-300 hover:text-white transition cursor-pointer"
          >
            Manage Rooms
          </button>
        </div>
      </div>

      {/* Empty State (Matches Screenshot 3) OR Active Rooms Grid */}
      {rooms.length === 0 ? (
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

          <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={onOpenAddRoom}
              className="px-5 py-3 rounded-2xl bg-[#F59E0B] hover:bg-[#FBBF24] text-slate-950 font-bold text-sm flex items-center gap-2 shadow-lg shadow-amber-500/20 transition cursor-pointer"
            >
              <Plus className="w-4 h-4 stroke-[2.5]" />
              <span>Create First Room</span>
            </button>
            <button
              type="button"
              onClick={onLoadSampleData}
              className="px-5 py-3 rounded-2xl bg-[#182030] hover:bg-[#222D42] border border-[#2B3852] text-slate-200 font-semibold text-sm flex items-center gap-2 transition cursor-pointer"
            >
              <Sparkles className="w-4 h-4 text-amber-400" />
              <span>Load Demo Apartment</span>
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* Rooms Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-10">
            {rooms.map((room) => {
              const isOccupied = room.status === 'occupied';
              return (
                <div
                  key={room.id}
                  className="rounded-2xl bg-[#151B26] hover:bg-[#19202E] border border-[#232D40] p-5 flex flex-col justify-between transition shadow-lg"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="text-lg font-extrabold text-white">
                          {room.name}
                        </span>
                        {room.floorOrUnit && (
                          <p className="text-xs text-slate-400 mt-0.5">
                            {room.floorOrUnit}
                          </p>
                        )}
                      </div>
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

                    <div className="mt-4 pt-3.5 border-t border-[#20293A] space-y-2 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400">Tenant</span>
                        <span className="font-semibold text-slate-200">
                          {room.tenant?.fullName || '— No Tenant Assigned —'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400">Monthly Rent</span>
                        <span className="font-bold text-white font-mono-num">
                          {formatPeso(room.monthlyRent)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400">
                          Last Sub-Meter Reading
                        </span>
                        <span className="font-bold text-amber-400 font-mono-num">
                          {room.lastMeterReading.toFixed(1)} kWh (@{' '}
                          {formatPeso(room.electricRatePerKwh)}/kWh)
                        </span>
                      </div>
                      {room.unpaidBalance > 0 && (
                        <div className="flex items-center justify-between text-red-400 pt-1">
                          <span className="font-medium">
                            Unpaid Carry-Over
                          </span>
                          <span className="font-extrabold font-mono-num">
                            {formatPeso(room.unpaidBalance)}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="mt-5 pt-3 border-t border-[#20293A] flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onOpenScanMeter(room)}
                      className="flex-1 py-2.5 px-3 rounded-xl bg-[#F59E0B] hover:bg-[#FBBF24] text-slate-950 font-bold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer"
                    >
                      <Camera className="w-3.5 h-3.5" />
                      <span>OCR Sub-Meter & Bill</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onNavigate('rooms')}
                      className="py-2.5 px-3 rounded-xl bg-[#1E2636] hover:bg-[#273146] text-slate-200 font-semibold text-xs transition cursor-pointer"
                    >
                      Details
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Revenue & Sub-Meter Consumption Analytics Section */}
          <section className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Revenue Card */}
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
                      Paid revenue vs. unpaid carry-over balances
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

              {/* Collection Progress Bar */}
              <div>
                <div className="flex justify-between text-xs text-slate-400 mb-1.5">
                  <span>Collection Efficiency</span>
                  <span className="font-mono-num font-bold text-slate-200">
                    {totalRevenuePaid + totalUnpaidDue > 0
                      ? `${Math.round(
                          (totalRevenuePaid /
                            (totalRevenuePaid + totalUnpaidDue)) *
                            100
                        )}%`
                      : '100%'}
                  </span>
                </div>
                <div className="w-full h-3 rounded-full bg-[#0E131C] overflow-hidden flex">
                  <div
                    className="bg-emerald-500 h-full transition-all duration-500"
                    style={{
                      width: `${
                        totalRevenuePaid + totalUnpaidDue > 0
                          ? (totalRevenuePaid /
                              (totalRevenuePaid + totalUnpaidDue)) *
                            100
                          : 100
                      }%`,
                    }}
                  />
                </div>
              </div>

              {/* Recent Receipts Quick List */}
              {bills.length > 0 && (
                <div className="mt-5 pt-4 border-t border-[#20293A]">
                  <div className="text-xs font-semibold text-slate-400 mb-2.5">
                    Recent Official Receipts (Tap to Print / Share to Messenger)
                  </div>
                  <div className="space-y-2">
                    {bills.slice(0, 3).map((b) => (
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
                              {b.receiptNo} • Δ {b.consumptionKwh.toFixed(1)} kWh
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

            {/* Electric Sub-Meter kWh Analytics Card */}
            <div className="rounded-2xl bg-[#151B26] border border-[#232D40] p-5 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-amber-500/15 flex items-center justify-center">
                      <Zap className="w-5 h-5 text-amber-400" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-white">
                        Sub-Meter Electric Consumption (kWh)
                      </h3>
                      <p className="text-xs text-slate-400">
                        Total billed usage: {totalKwhBilled.toFixed(1)} kWh
                      </p>
                    </div>
                  </div>
                  <BarChart3 className="w-4 h-4 text-slate-500" />
                </div>

                <div className="space-y-3.5 mt-3">
                  {rooms.map((r) => {
                    const roomBills = bills.filter((b) => b.roomId === r.id);
                    const roomKwh = roomBills.reduce(
                      (s, b) => s + b.consumptionKwh,
                      0
                    );
                    const maxKwh = Math.max(100, totalKwhBilled);
                    const pct = Math.min(100, Math.round((roomKwh / maxKwh) * 100));

                    return (
                      <div key={r.id} className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-semibold text-slate-200">
                            {r.name}{' '}
                            <span className="text-slate-500 font-normal">
                              (Meter: {r.lastMeterReading.toFixed(1)} kWh)
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
                  <FileSpreadsheet className="w-4 h-4 text-amber-400" />
                  Formula: (Current kWh − Previous kWh) × Rate
                </span>
                <button
                  type="button"
                  onClick={() => onOpenScanMeter(rooms[0])}
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

