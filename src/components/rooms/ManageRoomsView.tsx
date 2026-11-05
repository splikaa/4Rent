import React, { useState } from 'react';
import {
  ArrowLeft,
  Camera,
  Edit3,
  History,
  Home,
  MessageCircle,
  Phone,
  ShieldCheck,
  Trash2,
  UserMinus,
  Zap,
} from 'lucide-react';
import { Room, TenantHistoryEntry } from '../../types/rental';
import { formatPeso } from '../../utils/billingCalculator';

interface ManageRoomsViewProps {
  rooms: Room[];
  tenantHistory: TenantHistoryEntry[];
  onBack: () => void;
  onOpenAddRoom: () => void;
  onOpenEditRoom: (room: Room) => void;
  onDeleteRoom: (roomId: string) => void;
  onMoveOutTenant: (room: Room) => void;
  onOpenScanMeter: (room: Room) => void;
}

export const ManageRoomsView: React.FC<ManageRoomsViewProps> = ({
  rooms,
  tenantHistory,
  onBack,
  onOpenAddRoom,
  onOpenEditRoom,
  onDeleteRoom,
  onMoveOutTenant,
  onOpenScanMeter,
}) => {
  const [subTab, setSubTab] = useState<'rooms' | 'history'>('rooms');

  return (
    <div className="min-h-screen flex flex-col bg-[#0B0E14] pb-28">
      {/* Top Bar (Matches Screenshot 4) */}
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

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() =>
              setSubTab((prev) => (prev === 'rooms' ? 'history' : 'rooms'))
            }
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 border transition cursor-pointer ${
              subTab === 'history'
                ? 'bg-amber-500 text-slate-950 border-amber-500 font-bold'
                : 'bg-[#1B2230] text-slate-300 border-[#283246] hover:text-white'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">
              {subTab === 'history' ? 'Back to Rooms' : 'Lease History'}
            </span>
          </button>
        </div>
      </header>

      <div className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 flex flex-col">
        {subTab === 'history' ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-white">
                  Tenant Contract & Move-Out History
                </h2>
                <p className="text-xs text-slate-400">
                  Archived tenant leases and final sub-meter readings
                </p>
              </div>
              <span className="text-xs font-mono-num text-slate-400">
                {tenantHistory.length} records
              </span>
            </div>

            {tenantHistory.length === 0 ? (
              <div className="rounded-3xl bg-[#141A25] border border-[#222C3F] p-12 text-center">
                <History className="w-10 h-10 text-slate-500 mx-auto mb-3" />
                <p className="text-base font-bold text-white">
                  No archived tenant history yet
                </p>
                <p className="text-xs text-slate-400 mt-1">
                  When a tenant moves out of a room, their contract dates and
                  final kWh reading are logged here.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {tenantHistory.map((h) => (
                  <div
                    key={h.id}
                    className="rounded-2xl bg-[#151B26] border border-[#232D40] p-5 space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-bold text-amber-400">
                        {h.roomName}
                      </span>
                      <span className="text-xs text-slate-400 font-mono-num">
                        {h.moveInDate} → {h.moveOutDate}
                      </span>
                    </div>
                    <div className="text-base font-bold text-white">
                      {h.tenantName}
                    </div>
                    <div className="text-xs text-slate-400">
                      Phone: {h.phone || 'N/A'} • Final Sub-Meter:{' '}
                      <strong className="text-slate-200 font-mono-num">
                        {h.finalMeterReading.toFixed(1)} kWh
                      </strong>
                    </div>
                    {h.notes && (
                      <p className="text-xs text-slate-400 italic pt-1">
                        “{h.notes}”
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : rooms.length === 0 ? (
          /* Exact Empty State from Screenshot 4 */
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
            {rooms.map((room) => {
              const isOccupied = room.status === 'occupied';
              return (
                <div
                  key={room.id}
                  className="rounded-2xl bg-[#151B26] border border-[#232D40] p-5 flex flex-col justify-between shadow-lg"
                >
                  <div>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h2 className="text-xl font-extrabold text-white">
                          {room.name}
                        </h2>
                        <p className="text-xs text-slate-400 mt-0.5">
                          {room.floorOrUnit || 'Standard Apartment Unit'}
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
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mt-4">
                      <div className="rounded-xl bg-[#0F141D] border border-[#1E2738] p-2.5">
                        <span className="text-[10px] uppercase text-slate-400 block">
                          Monthly Rent
                        </span>
                        <span className="text-sm font-bold text-white font-mono-num">
                          {formatPeso(room.monthlyRent)}
                        </span>
                      </div>
                      <div className="rounded-xl bg-[#0F141D] border border-[#1E2738] p-2.5">
                        <span className="text-[10px] uppercase text-slate-400 block">
                          Sub-Meter
                        </span>
                        <span className="text-sm font-bold text-amber-400 font-mono-num">
                          {room.lastMeterReading.toFixed(1)} kWh
                        </span>
                      </div>
                      <div className="rounded-xl bg-[#0F141D] border border-[#1E2738] p-2.5">
                        <span className="text-[10px] uppercase text-slate-400 block">
                          Deposit Held
                        </span>
                        <span className="text-sm font-bold text-emerald-400 font-mono-num">
                          {formatPeso(room.securityDeposit)}
                        </span>
                      </div>
                      <div className="rounded-xl bg-[#0F141D] border border-[#1E2738] p-2.5">
                        <span className="text-[10px] uppercase text-slate-400 block">
                          Unpaid Due
                        </span>
                        <span
                          className={`text-sm font-bold font-mono-num ${
                            room.unpaidBalance > 0
                              ? 'text-red-400'
                              : 'text-slate-400'
                          }`}
                        >
                          {formatPeso(room.unpaidBalance)}
                        </span>
                      </div>
                    </div>

                    {/* Tenant Information */}
                    {isOccupied && room.tenant ? (
                      <div className="mt-4 rounded-xl bg-[#101520] border border-[#1E2738] p-3.5 space-y-1.5 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-white text-sm">
                            {room.tenant.fullName}
                          </span>
                          <span className="text-amber-400 font-semibold">
                            Due every day {room.tenant.dueDayOfMonth}
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-3 text-slate-400">
                          {room.tenant.phone && (
                            <span className="inline-flex items-center gap-1">
                              <Phone className="w-3.5 h-3.5 text-slate-500" />
                              {room.tenant.phone}
                            </span>
                          )}
                          {room.tenant.messengerUsername && (
                            <a
                              href={`https://m.me/${room.tenant.messengerUsername}`}
                              target="_blank"
                              rel="noreferrer"
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
                      <div className="mt-4 rounded-xl bg-[#101520] border border-dashed border-[#243044] p-3.5 text-xs text-slate-400 text-center">
                        Room is currently vacant. Edit room to assign a new
                        tenant.
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="mt-4 pt-3.5 border-t border-[#20293A] flex flex-wrap items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => onOpenScanMeter(room)}
                      className="px-4 py-2 rounded-xl bg-[#F59E0B] hover:bg-[#FBBF24] text-slate-950 font-bold text-xs flex items-center gap-1.5 transition cursor-pointer shadow-md shadow-amber-500/10"
                    >
                      <Camera className="w-3.5 h-3.5" />
                      <span>Scan Sub-Meter / Bill</span>
                    </button>

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
                          onClick={() => onMoveOutTenant(room)}
                          className="p-2 rounded-xl bg-[#1D2535] hover:bg-amber-500/20 text-amber-400 transition cursor-pointer"
                          title="Archive Tenant Move-Out"
                        >
                          <UserMinus className="w-4 h-4" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => onDeleteRoom(room.id)}
                        className="p-2 rounded-xl bg-[#1D2535] hover:bg-red-500/20 text-red-400 transition cursor-pointer"
                        title="Delete Room"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Bottom-Right Circular Amber FAB (Matches Screenshot 4) */}
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

