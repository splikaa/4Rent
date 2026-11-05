import React from 'react';
import { Bell } from 'lucide-react';

interface EnableRemindersModalProps {
  isOpen: boolean;
  onAllow: () => void;
  onDeny: () => void;
}

export const EnableRemindersModal: React.FC<EnableRemindersModalProps> = ({
  isOpen,
  onAllow,
  onDeny,
}) => {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs px-6 animate-fadeIn"
      role="dialog"
      aria-modal="true"
      aria-labelledby="reminders-modal-title"
    >
      <div className="w-full max-w-sm rounded-[24px] bg-[#1A2130] border border-[#2A344B] p-6 shadow-2xl">
        <div className="flex items-center gap-3 mb-3.5">
          <div className="w-8 h-8 rounded-full bg-amber-500/15 flex items-center justify-center shrink-0">
            <Bell className="w-5 h-5 text-amber-400 fill-amber-400" />
          </div>
          <h2
            id="reminders-modal-title"
            className="text-xl font-bold text-white tracking-tight"
          >
            Enable Reminders?
          </h2>
        </div>

        <p className="text-sm sm:text-[15px] text-slate-400 leading-relaxed mb-7">
          Allow 4Rent to send you device notifications and reminders about unpaid
          bills and tenant balances?
        </p>

        <div className="flex items-center justify-end gap-4">
          <button
            type="button"
            onClick={onDeny}
            className="px-4 py-2.5 rounded-xl text-sm font-semibold text-slate-400 hover:text-white hover:bg-slate-800/60 transition cursor-pointer"
          >
            Deny
          </button>
          <button
            type="button"
            onClick={onAllow}
            className="px-6 py-2.5 rounded-xl bg-[#F59E0B] hover:bg-[#FBBF24] active:scale-[0.98] text-slate-950 font-bold text-sm shadow-lg shadow-amber-500/20 transition cursor-pointer"
          >
            Allow
          </button>
        </div>
      </div>
    </div>
  );
};

