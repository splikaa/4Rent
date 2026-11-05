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
    <div className="min-h-screen flex flex-col bg-[#0B0E14] pb-24">
      <header className="sticky top-0 z-20 bg-[#141923] border-b border-[#222B3C] px-4 sm:px-6 h-16 flex items-center justify-between">
        <button
          type="button"
          onClick={onBack}
          className="w-10 h-10 rounded-xl hover:bg-[#1E2636] flex items-center justify-center text-slate-200 transition cursor-pointer"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-lg sm:text-xl font-bold text-white tracking-tight">
          Archive & Previous Tenants History
        </h1>
        <div className="w-10" />
      </header>

      <div className="w-full max-w-5xl mx-auto px-4 sm:px-6 pt-6 space-y-5">
        {/* 3 Category Pills */}
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => setTab('tenants')}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 border transition cursor-pointer ${
              tab === 'tenants'
                ? 'bg-[#F59E0B] text-slate-950 border-amber-500'
                : 'bg-[#151B26] text-slate-300 border-[#252F42]'
            }`}
          >
            <History className="w-4 h-4" />
            <span>Previous Tenants History ({tenantHistory.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setTab('receipts')}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 border transition cursor-pointer ${
              tab === 'receipts'
                ? 'bg-[#F59E0B] text-slate-950 border-amber-500'
                : 'bg-[#151B26] text-slate-300 border-[#252F42]'
            }`}
          >
            <ReceiptText className="w-4 h-4" />
            <span>Archived Room Receipts ({archivedBills.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setTab('rooms')}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 border transition cursor-pointer ${
              tab === 'rooms'
                ? 'bg-[#F59E0B] text-slate-950 border-amber-500'
                : 'bg-[#151B26] text-slate-300 border-[#252F42]'
            }`}
          >
            <DoorOpen className="w-4 h-4" />
            <span>Archived Rooms ({archivedRooms.length})</span>
          </button>
        </div>

        {/* Tab 1: Previous Tenants History */}
        {tab === 'tenants' && (
          <div className="space-y-4">
            {tenantHistory.length === 0 ? (
              <div className="rounded-3xl bg-[#141A25] border border-[#222C3F] p-12 text-center">
                <History className="w-10 h-10 text-slate-500 mx-auto mb-3" />
                <p className="text-base font-bold text-white">
                  No previous tenants recorded yet
                </p>
                <p className="text-xs text-slate-400 mt-1">
                  Whenever a tenant vacates or stops paying rent and a room
                  turns Vacant, their record and final kWh reading are stored
                  here automatically.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {tenantHistory.map((h) => (
                  <div
                    key={h.id}
                    className="rounded-2xl bg-[#151B26] border border-[#232D40] p-5 space-y-2.5"
                  >
                    <div className="flex items-center justify-between">
                      <span className="px-2.5 py-0.5 rounded-md bg-amber-500/15 text-amber-400 font-bold text-xs">
                        {h.roomName}
                      </span>
                      <span className="text-xs text-slate-400 font-mono-num">
                        {h.moveInDate} → {h.moveOutDate}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <h3 className="text-base font-extrabold text-white">
                        {h.tenantName}
                      </h3>
                      <span className="text-xs font-semibold text-slate-400">
                        {h.reason || 'Vacated'}
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 pt-1 text-xs">
                      <div className="rounded-lg bg-[#0E131C] p-2 border border-[#1E2738]">
                        <span className="text-[10px] text-slate-400 block">
                          Final Sub-Meter
                        </span>
                        <span className="font-mono-num font-bold text-amber-400">
                          {h.finalMeterReading.toFixed(1)} kWh
                        </span>
                      </div>
                      <div className="rounded-lg bg-[#0E131C] p-2 border border-[#1E2738]">
                        <span className="text-[10px] text-slate-400 block">
                          Deposit Held
                        </span>
                        <span className="font-mono-num font-bold text-emerald-400">
                          {formatPeso(h.depositHeld || 0)}
                        </span>
                      </div>
                      <div className="rounded-lg bg-[#0E131C] p-2 border border-[#1E2738]">
                        <span className="text-[10px] text-slate-400 block">
                          Unpaid at Exit
                        </span>
                        <span
                          className={`font-mono-num font-bold ${
                            (h.unpaidBalanceAtMoveOut || 0) > 0
                              ? 'text-red-400'
                              : 'text-slate-300'
                          }`}
                        >
                          {formatPeso(h.unpaidBalanceAtMoveOut || 0)}
                        </span>
                      </div>
                    </div>
                    {h.notes && (
                      <p className="text-xs text-slate-400 italic">
                        “{h.notes}”
                      </p>
                    )}
                    <div className="flex justify-end pt-1">
                      <button
                        type="button"
                        onClick={() => onDeleteHistoryEntry(h.id)}
                        className="text-xs text-slate-500 hover:text-red-400 flex items-center gap-1 cursor-pointer"
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
          <div className="space-y-3">
            {archivedBills.length === 0 ? (
              <div className="rounded-3xl bg-[#141A25] border border-[#222C3F] p-12 text-center">
                <Archive className="w-10 h-10 text-slate-500 mx-auto mb-3" />
                <p className="text-base font-bold text-white">
                  No archived receipts yet
                </p>
                <p className="text-xs text-slate-400 mt-1">
                  Each room keeps 1 active receipt for quick lookup; older
                  receipts are automatically archived here.
                </p>
              </div>
            ) : (
              archivedBills.map((b) => (
                <div
                  key={b.id}
                  className="rounded-2xl bg-[#151B26] border border-[#232D40] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-extrabold text-white">
                        {b.roomName}
                      </span>
                      <span className="text-xs font-mono-num text-amber-400">
                        {b.receiptNo}
                      </span>
                      <span className="text-xs text-slate-400">
                        • {b.billingPeriod}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Tenant: {b.tenantName} • Sub-Meter:{' '}
                      {b.prevReading.toFixed(1)} → {b.currReading.toFixed(1)}{' '}
                      kWh (Δ {b.consumptionKwh.toFixed(1)} kWh)
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-sm font-extrabold text-white font-mono-num mr-2">
                      {formatPeso(b.totalAmountDue)}
                    </span>
                    <button
                      type="button"
                      onClick={() => onSelectBillForReceipt(b)}
                      className="px-3 py-1.5 rounded-xl bg-amber-500 text-slate-950 font-bold text-xs flex items-center gap-1 cursor-pointer"
                    >
                      <Printer className="w-3.5 h-3.5" />
                      <span>View Receipt</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onRestoreBill(b.id)}
                      className="px-3 py-1.5 rounded-xl bg-[#1E2636] text-slate-200 font-semibold text-xs flex items-center gap-1 cursor-pointer"
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
          <div className="space-y-3">
            {archivedRooms.length === 0 ? (
              <div className="rounded-3xl bg-[#141A25] border border-[#222C3F] p-12 text-center">
                <DoorOpen className="w-10 h-10 text-slate-500 mx-auto mb-3" />
                <p className="text-base font-bold text-white">
                  No archived rooms
                </p>
                <p className="text-xs text-slate-400 mt-1">
                  Archived rooms can be restored anytime or permanently removed
                  with your 4-digit PIN.
                </p>
              </div>
            ) : (
              archivedRooms.map((r) => (
                <div
                  key={r.id}
                  className="rounded-2xl bg-[#151B26] border border-[#232D40] p-4 flex items-center justify-between gap-3"
                >
                  <div>
                    <h3 className="text-base font-extrabold text-white">
                      {r.name}
                    </h3>
                    <p className="text-xs text-slate-400">
                      Rent: {formatPeso(r.monthlyRent)} • Continuous Sub-Meter:{' '}
                      {r.lastMeterReading.toFixed(1)} kWh
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onRestoreRoom(r.id)}
                      className="px-3.5 py-2 rounded-xl bg-emerald-500 text-slate-950 font-bold text-xs flex items-center gap-1.5 cursor-pointer"
                    >
                      <ArchiveRestore className="w-4 h-4" />
                      <span>Restore Room</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onRequestPermanentDeleteRoom(r)}
                      className="px-3.5 py-2 rounded-xl bg-red-500/15 hover:bg-red-500/25 border border-red-500/30 text-red-400 font-bold text-xs flex items-center gap-1.5 cursor-pointer"
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
