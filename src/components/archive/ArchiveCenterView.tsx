import React, { useState } from 'react';
import {
  Archive,
  ArchiveRestore,
  ArrowLeft,
  DoorOpen,
  History,
  Printer,
  ReceiptText,
  Trash2,
} from 'lucide-react';
import { BillRecord, Room, TenantHistoryEntry } from '../../types/rental';
import { formatPeso } from '../../utils/billingCalculator';

interface ArchiveCenterViewProps {
  archivedRooms: Room[];
  archivedBills: BillRecord[];
  tenantHistory: TenantHistoryEntry[];
  onBack: () => void;
  onRestoreRoom: (roomId: string) => void;
  onRequestPermanentDeleteRoom: (room: Room) => void;
  onRestoreBill: (billId: string) => void;
  onSelectBillForReceipt: (bill: BillRecord) => void;
  onDeleteHistoryEntry: (id: string) => void;
}

export const ArchiveCenterView: React.FC<ArchiveCenterViewProps> = ({
  archivedRooms,
  archivedBills,
  tenantHistory,
  onBack,
  onRestoreRoom,
  onRequestPermanentDeleteRoom,
  onRestoreBill,
  onSelectBillForReceipt,
  onDeleteHistoryEntry,
}) => {
  const [tab, setTab] = useState<'tenants' | 'receipts' | 'rooms'>('tenants');

  return (
    <div className="min-h-screen flex flex-col bg-transparent pb-32 animate-view-enter">
      <header className="sticky top-0 z-20 bg-[#111722]/90 backdrop-blur-xl border-b border-[#232E42] px-5 sm:px-8 h-18 flex items-center justify-between">
        <button
          type="button"
          onClick={onBack}
          className="w-11 h-11 rounded-2xl bg-[#172030] hover:bg-[#1E293D] border border-[#26334B] flex items-center justify-center text-slate-200 transition cursor-pointer btn-fluid"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="text-center">
          <h1 className="text-lg sm:text-xl font-extrabold text-white tracking-tight">
            Archive & Previous Tenants
          </h1>
          <p className="text-[11px] text-slate-400 hidden sm:block">
            Historical Tenant Records, Receipts & Archived Units
          </p>
        </div>
        <div className="w-11" />
      </header>

      <div className="w-full max-w-5xl mx-auto px-5 sm:px-8 pt-8 space-y-6">
        {/* 3 Category Pills */}
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => setTab('tenants')}
            className={`px-5 py-3 rounded-2xl text-xs font-extrabold flex items-center gap-2 border transition cursor-pointer btn-fluid ${
              tab === 'tenants'
                ? 'bg-[#F59E0B] text-slate-950 border-amber-500 shadow-lg shadow-amber-500/20'
                : 'bg-[#151D2C] text-slate-300 border-[#253148]'
            }`}
          >
            <History className="w-4 h-4" />
            <span>Previous Tenants History ({tenantHistory.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setTab('receipts')}
            className={`px-5 py-3 rounded-2xl text-xs font-extrabold flex items-center gap-2 border transition cursor-pointer btn-fluid ${
              tab === 'receipts'
                ? 'bg-[#F59E0B] text-slate-950 border-amber-500 shadow-lg shadow-amber-500/20'
                : 'bg-[#151D2C] text-slate-300 border-[#253148]'
            }`}
          >
            <ReceiptText className="w-4 h-4" />
            <span>Archived Room Receipts ({archivedBills.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setTab('rooms')}
            className={`px-5 py-3 rounded-2xl text-xs font-extrabold flex items-center gap-2 border transition cursor-pointer btn-fluid ${
              tab === 'rooms'
                ? 'bg-[#F59E0B] text-slate-950 border-amber-500 shadow-lg shadow-amber-500/20'
                : 'bg-[#151D2C] text-slate-300 border-[#253148]'
            }`}
          >
            <DoorOpen className="w-4 h-4" />
            <span>Archived Rooms ({archivedRooms.length})</span>
          </button>
        </div>

        {/* Tab 1: Previous Tenants History */}
        {tab === 'tenants' && (
          <div className="space-y-5">
            {tenantHistory.length === 0 ? (
              <div className="surface-card rounded-3xl p-14 text-center">
                <History className="w-11 h-11 text-slate-500 mx-auto mb-3.5" />
                <p className="text-base sm:text-lg font-extrabold text-white">
                  No previous tenants recorded yet
                </p>
                <p className="text-xs sm:text-sm text-slate-400 mt-1.5 max-w-md mx-auto">
                  Whenever a tenant vacates or stops paying rent and a room
                  turns Vacant, their record and final kWh reading are stored
                  here automatically.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {tenantHistory.map((h) => (
                  <div
                    key={h.id}
                    className="surface-card rounded-3xl p-6 space-y-3.5"
                  >
                    <div className="flex items-center justify-between">
                      <span className="px-3 py-1 rounded-xl bg-amber-500/15 text-amber-400 font-bold text-xs">
                        {h.roomName}
                      </span>
                      <span className="text-xs text-slate-400 font-mono-num">
                        {h.moveInDate} → {h.moveOutDate}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <h3 className="text-base sm:text-lg font-extrabold text-white">
                        {h.tenantName}
                      </h3>
                      <span className="text-xs font-semibold text-slate-400">
                        {h.reason || 'Vacated'}
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-2.5 pt-1 text-xs">
                      <div className="rounded-2xl bg-[#0D121B] p-3 border border-[#202B40]">
                        <span className="text-[10px] text-slate-400 block">
                          Final Sub-Meter
                        </span>
                        <span className="font-mono-num font-bold text-amber-400 mt-0.5 block">
                          {h.finalMeterReading.toFixed(1)} kWh
                        </span>
                      </div>
                      <div className="rounded-2xl bg-[#0D121B] p-3 border border-[#202B40]">
                        <span className="text-[10px] text-slate-400 block">
                          Deposit Held
                        </span>
                        <span className="font-mono-num font-bold text-emerald-400 mt-0.5 block">
                          {formatPeso(h.depositHeld || 0)}
                        </span>
                      </div>
                      <div className="rounded-2xl bg-[#0D121B] p-3 border border-[#202B40]">
                        <span className="text-[10px] text-slate-400 block">
                          Unpaid at Exit
                        </span>
                        <span
                          className={`font-mono-num font-bold mt-0.5 block ${
                            (h.unpaidBalanceAtMoveOut || 0) > 0
                              ? 'text-red-400'
                              : 'text-slate-300'
                          }`}
                        >
                          {formatPeso(h.unpaidBalanceAtMoveOut || 0)}
                        </span>
                      </div>
                    </div>
                    <div className="flex justify-end pt-1">
                      <button
                        type="button"
                        onClick={() => onDeleteHistoryEntry(h.id)}
                        className="text-xs text-slate-400 hover:text-red-400 flex items-center gap-1 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Remove Log
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Archived Receipts */}
        {tab === 'receipts' && (
          <div className="space-y-4">
            {archivedBills.length === 0 ? (
              <div className="surface-card rounded-3xl p-14 text-center">
                <Archive className="w-11 h-11 text-slate-500 mx-auto mb-3.5" />
                <p className="text-base sm:text-lg font-extrabold text-white">
                  No archived receipts yet
                </p>
                <p className="text-xs sm:text-sm text-slate-400 mt-1.5 max-w-md mx-auto">
                  Each room keeps 1 active receipt for quick lookup; older
                  receipts are automatically archived here.
                </p>
              </div>
            ) : (
              archivedBills.map((b) => (
                <div
                  key={b.id}
                  className="surface-card rounded-3xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                >
                  <div>
                    <div className="flex items-center gap-2.5">
                      <span className="text-sm sm:text-base font-extrabold text-white">
                        {b.roomName}
                      </span>
                      <span className="text-xs font-mono-num text-amber-400">
                        {b.receiptNo}
                      </span>
                      <span className="text-xs text-slate-400">
                        • {b.billingPeriod}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-1">
                      Tenant: {b.tenantName} • Sub-Meter:{' '}
                      {b.prevReading.toFixed(1)} → {b.currReading.toFixed(1)}{' '}
                      kWh (Δ {b.consumptionKwh.toFixed(1)} kWh)
                    </p>
                  </div>

                  <div className="flex items-center gap-2.5">
                    <span className="text-sm font-extrabold text-white font-mono-num mr-2">
                      {formatPeso(b.totalAmountDue)}
                    </span>
                    <button
                      type="button"
                      onClick={() => onSelectBillForReceipt(b)}
                      className="px-3.5 py-2 rounded-2xl bg-amber-500 text-slate-950 font-extrabold text-xs flex items-center gap-1.5 cursor-pointer btn-fluid"
                    >
                      <Printer className="w-3.5 h-3.5" />
                      <span>View Receipt</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onRestoreBill(b.id)}
                      className="px-3.5 py-2 rounded-2xl bg-[#1E2636] text-slate-200 font-semibold text-xs flex items-center gap-1.5 cursor-pointer btn-fluid"
                    >
                      <ArchiveRestore className="w-3.5 h-3.5" />
                      <span>Restore</span>
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* Tab 3: Archived Rooms */}
        {tab === 'rooms' && (
          <div className="space-y-4">
            {archivedRooms.length === 0 ? (
              <div className="surface-card rounded-3xl p-14 text-center">
                <DoorOpen className="w-11 h-11 text-slate-500 mx-auto mb-3.5" />
                <p className="text-base sm:text-lg font-extrabold text-white">
                  No archived rooms
                </p>
                <p className="text-xs sm:text-sm text-slate-400 mt-1.5 max-w-md mx-auto">
                  Archived rooms can be restored anytime or permanently removed
                  with your 4-digit PIN.
                </p>
              </div>
            ) : (
              archivedRooms.map((r) => (
                <div
                  key={r.id}
                  className="surface-card rounded-3xl p-5 flex items-center justify-between gap-4"
                >
                  <div>
                    <h3 className="text-base sm:text-lg font-extrabold text-white">
                      {r.name}
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Rent: {formatPeso(r.monthlyRent)} • Continuous Sub-Meter:{' '}
                      {r.lastMeterReading.toFixed(1)} kWh
                    </p>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <button
                      type="button"
                      onClick={() => onRestoreRoom(r.id)}
                      className="px-4 py-2.5 rounded-2xl bg-emerald-500 text-slate-950 font-extrabold text-xs flex items-center gap-1.5 cursor-pointer btn-fluid"
                    >
                      <ArchiveRestore className="w-4 h-4" />
                      <span>Restore Room</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onRequestPermanentDeleteRoom(r)}
                      className="px-4 py-2.5 rounded-2xl bg-red-500/15 hover:bg-red-500/25 border border-red-500/35 text-red-400 font-bold text-xs flex items-center gap-1.5 cursor-pointer btn-fluid"
                    >
                      <Trash2 className="w-4 h-4" />
                      <span>Delete (PIN)</span>
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
};
