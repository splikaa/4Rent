import React from 'react';
import { AlertTriangle, Archive, CheckCircle2, Trash2, UserMinus, X } from 'lucide-react';

interface ConfirmActionModalProps {
  isOpen: boolean;
  title: string;
  description: string;
  details?: string[];
  confirmLabel: string;
  variant?: 'warning' | 'danger' | 'info';
  iconType?: 'archive' | 'delete' | 'vacate' | 'warning';
  reasonLabel?: string;
  reasonOptions?: string[];
  selectedReason?: string;
  onChangeReason?: (reason: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}

const VARIANT_STYLES: Record<
  NonNullable<ConfirmActionModalProps['variant']>,
  { badge: string; button: string }
> = {
  danger: {
    badge: 'bg-red-500/15 border-red-500/35 text-red-400',
    button: 'bg-red-500 hover:bg-red-400 text-white shadow-red-500/20',
  },
  info: {
    badge: 'bg-blue-500/15 border-blue-500/35 text-blue-400',
    button: 'bg-blue-500 hover:bg-blue-400 text-slate-950 shadow-blue-500/20',
  },
  warning: {
    badge: 'bg-amber-500/15 border-amber-500/35 text-amber-400',
    button: 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-amber-500/20',
  },
};

const ICON_MAP: Record<
  NonNullable<ConfirmActionModalProps['iconType']>,
  React.ComponentType<{ className?: string }>
> = {
  archive: Archive,
  delete: Trash2,
  vacate: UserMinus,
  warning: AlertTriangle,
};

export const ConfirmActionModal: React.FC<ConfirmActionModalProps> = ({
  isOpen,
  title,
  description,
  details = [],
  confirmLabel,
  variant = 'warning',
  iconType = 'warning',
  reasonLabel,
  reasonOptions,
  selectedReason,
  onChangeReason,
  onCancel,
  onConfirm,
}) => {
  if (!isOpen) return null;

  const { badge: badgeStyle, button: buttonStyle } = VARIANT_STYLES[variant];
  const Icon = ICON_MAP[iconType];

  return (
    <div className="fixed inset-0 z-[55] flex items-center justify-center bg-black/80 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="w-full max-w-md rounded-3xl bg-[#151B26] border border-[#28334A] p-6 shadow-2xl animate-modal-pop">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex items-center gap-3">
            <div
              className={`w-10 h-10 rounded-2xl border flex items-center justify-center shrink-0 ${badgeStyle}`}
            >
              <Icon className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-white">{title}</h3>
              <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">
                {description}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="w-8 h-8 rounded-xl bg-[#0E131C] text-slate-400 hover:text-white flex items-center justify-center cursor-pointer shrink-0"
            aria-label="Cancel confirmation"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {details.length > 0 && (
          <ul className="mb-4 rounded-2xl bg-[#0E131C] border border-[#222C3F] p-3.5 space-y-1.5 text-xs text-slate-300">
            {details.map((line, idx) => (
              <li key={idx} className="flex items-start gap-2">
                <span className="text-amber-400 font-bold">•</span>
                <span>{line}</span>
              </li>
            ))}
          </ul>
        )}

        {reasonOptions && reasonOptions.length > 0 && onChangeReason && (
          <div className="mb-4">
            <label className="block text-xs font-bold text-slate-300 mb-1.5">
              {reasonLabel || 'Select Reason'}
            </label>
            <select
              value={selectedReason || reasonOptions[0]}
              onChange={(e) => onChangeReason(e.target.value)}
              className="w-full h-11 rounded-xl bg-[#0E131C] border border-[#253148] px-3 text-xs font-semibold text-white focus:border-amber-500 focus:outline-none"
            >
              {reasonOptions.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="flex items-center justify-end gap-2.5 pt-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2.5 rounded-2xl bg-[#1F2738] hover:bg-[#28334A] text-slate-200 text-xs font-bold cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`px-5 py-2.5 rounded-2xl font-extrabold text-xs flex items-center gap-1.5 shadow-lg transition cursor-pointer ${buttonStyle}`}
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>{confirmLabel}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
