import React, { useState } from 'react';
import {
  AlertTriangle,
  Archive,
  CalendarClock,
  FileWarning,
  ShieldCheck,
  UserCheck,
  X,
} from 'lucide-react';
import { Room } from '../../types/rental';
import {
  clampDueDayOneToTen,
  getNextDueDateInOneToTenWindow,
} from '../../utils/billingCalculator';

interface OccupiedArchiveGuardModalProps {
  room: Room | null;
  onClose: () => void;
  onConfirmArchiveWithReason: (room: Room, reason: string) => void;
}

const PRESET_OVERRIDE_REASONS = [
  'Tenant has not yet provided a Contract of Lease / Incomplete Requirements',
  'Early Move-Out / Mutual Termination of Lease Agreement',
  'Emergency Unit Maintenance / Tenant Relocated to Another Room',
  'Lease Agreement Violation / Unsettled Account',
  'Custom Reason (Specify below)',
];

export const OccupiedArchiveGuardModal: React.FC<
  OccupiedArchiveGuardModalProps
> = ({ room, onClose, onConfirmArchiveWithReason }) => {
  const [selectedPreset, setSelectedPreset] = useState<string>('');
  const [customReason, setCustomReason] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  if (!room) return null;

  const tenant = room.tenant;
  const dueDay = clampDueDayOneToTen(tenant?.dueDayOfMonth || 5);
  const nextDueIso = getNextDueDateInOneToTenWindow(dueDay, tenant?.moveInDate);
  const nextDueDate = new Date(nextDueIso);
  const now = new Date();
  const diffMs = nextDueDate.getTime() - now.getTime();
  const remainingDays = Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));

  const formattedDue = nextDueDate.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  const hasContractSigned = tenant?.privacyConsentSigned !== false;
  const hasValidId = tenant?.validIdVerified !== false;

  const finalReason =
    selectedPreset === 'Custom Reason (Specify below)'
      ? customReason.trim()
      : selectedPreset.trim();

  const handleConfirm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!finalReason) {
      setError(
        'Cannot archive an occupied room directly. Please select or specify a valid override reason first.'
      );
      return;
    }
    onConfirmArchiveWithReason(room, finalReason);
    setSelectedPreset('');
    setCustomReason('');
    setError(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="w-full max-w-lg rounded-3xl bg-[#151B26] border border-amber-500/40 shadow-2xl overflow-hidden my-6 animate-modal-pop">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-6 py-4 bg-[#1B2232] border-b border-[#28334A]">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-amber-500/15 border border-amber-500/35 flex items-center justify-center text-amber-400 shrink-0">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-white">
                Occupied Room • Direct Archive Blocked
              </h3>
              <p className="text-xs text-amber-300 mt-0.5">
                {room.name} is currently occupied and still has active stay availability
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-[#0E131C] text-slate-400 hover:text-white flex items-center justify-center cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleConfirm} className="p-6 space-y-4">
          {/* Active Tenant & Remaining Days Alert */}
          <div className="rounded-2xl bg-amber-500/10 border border-amber-500/30 p-4 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-extrabold uppercase tracking-wider text-amber-300 flex items-center gap-1.5">
                <UserCheck className="w-4 h-4" />
                Active Tenant: {tenant?.fullName || 'Current Occupant'}
              </span>
              <span className="px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[11px] font-extrabold font-mono-num">
                {remainingDays} Days Remaining
              </span>
            </div>

            <p className="text-xs text-slate-200 leading-relaxed">
              <strong>{tenant?.fullName || 'The tenant'}</strong> still has active
              availability in <strong>{room.name}</strong> with{' '}
              <strong className="text-amber-300">
                {remainingDays} days remaining
              </strong>{' '}
              until the next scheduled billing due date ({formattedDue}). An
              occupied room cannot be moved to Archive directly unless an
              authorized reason is recorded.
            </p>

            {/* Contract of Lease & ID Status */}
            <div className="pt-2 border-t border-amber-500/20 flex flex-wrap items-center gap-2 text-[11px]">
              {!hasContractSigned ? (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-red-500/20 text-red-300 border border-red-500/30 font-bold">
                  <FileWarning className="w-3.5 h-3.5" />
                  Contract of Lease Not Yet Provided
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-semibold">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  Contract of Lease & Consent On File
                </span>
              )}

              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#0E131C] text-slate-300 border border-[#253047]">
                <CalendarClock className="w-3.5 h-3.5 text-amber-400" />
                Move-In: {tenant?.moveInDate || 'Recorded'}
              </span>
            </div>
          </div>

          {/* Mandatory Reason Selection */}
          <div className="space-y-2">
            <label className="block text-xs font-bold text-white">
              Select Mandatory Reason to Archive Occupied Room *
            </label>
            <div className="space-y-2">
              {PRESET_OVERRIDE_REASONS.map((preset) => {
                const isSelected = selectedPreset === preset;
                return (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => {
                      setSelectedPreset(preset);
                      setError(null);
                    }}
                    className={`w-full text-left px-3.5 py-2.5 rounded-xl border text-xs font-semibold transition cursor-pointer flex items-center justify-between ${
                      isSelected
                        ? 'bg-amber-500/20 border-amber-500 text-white'
                        : 'bg-[#0E131C] border-[#252F42] text-slate-300 hover:border-slate-500'
                    }`}
                  >
                    <span>{preset}</span>
                    <span
                      className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${
                        isSelected
                          ? 'border-amber-400 bg-amber-400 text-slate-950'
                          : 'border-slate-600'
                      }`}
                    >
                      {isSelected && <span className="w-1.5 h-1.5 rounded-full bg-slate-950" />}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {selectedPreset === 'Custom Reason (Specify below)' && (
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Enter Specific Archive / Lease Reason *
              </label>
              <input
                type="text"
                required
                placeholder="e.g., Tenant did not submit signed Contract of Lease within grace period..."
                value={customReason}
                onChange={(e) => {
                  setCustomReason(e.target.value);
                  setError(null);
                }}
                className="w-full h-11 rounded-xl bg-[#0E131C] border border-[#252F42] px-3.5 text-xs text-white focus:border-amber-500 focus:outline-none"
              />
            </div>
          )}

          {error && (
            <div className="rounded-xl bg-red-500/15 border border-red-500/30 p-3 text-xs text-red-300">
              {error}
            </div>
          )}

          <div className="flex items-center justify-end gap-2.5 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl bg-[#0E131C] hover:bg-[#192232] border border-[#252F42] text-xs font-bold text-slate-300 cursor-pointer"
            >
              Keep Room Active
            </button>
            <button
              type="submit"
              className="px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-extrabold flex items-center gap-1.5 cursor-pointer"
            >
              <Archive className="w-3.5 h-3.5" />
              <span>Confirm Archive with Reason</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
