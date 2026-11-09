import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Info,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react';

export type FeedbackVariant = 'success' | 'info' | 'warning' | 'security' | 'error';

export interface FeedbackNotification {
  id: string;
  title: string;
  message: string;
  variant?: FeedbackVariant;
  actionLabel?: string;
  onAction?: () => void;
  durationMs?: number;
}

export interface FeedbackToastBarProps {
  feedback?: FeedbackNotification | null;
  notification?: FeedbackNotification | null;
  onDismiss: () => void;
}

export const FeedbackToastBar: React.FC<FeedbackToastBarProps> = ({
  feedback,
  notification,
  onDismiss,
}) => {
  const activeItem = feedback || notification || null;
  const [progress, setProgress] = useState(100);

  useEffect(() => {
    if (!activeItem) return;
    setProgress(100);
    const totalMs = activeItem.durationMs || 3800;
    const start = Date.now();

    const interval = setInterval(() => {
      const elapsed = Date.now() - start;
      const remainingPct = Math.max(0, 100 - (elapsed / totalMs) * 100);
      setProgress(remainingPct);
      if (elapsed >= totalMs) {
        clearInterval(interval);
        onDismiss();
      }
    }, 40);

    return () => clearInterval(interval);
  }, [activeItem, onDismiss]);

  if (!activeItem) return null;

  const variantStyles = {
    success: {
      border: 'border-emerald-500/45',
      bg: 'from-[#11241E]/95 via-[#131C2B]/95 to-[#111826]/95',
      iconBg: 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400',
      bar: 'bg-gradient-to-r from-emerald-400 to-amber-400',
      actionBtn:
        'bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-emerald-500/20',
      icon: <CheckCircle2 className="w-5 h-5" />,
    },
    info: {
      border: 'border-amber-500/45',
      bg: 'from-[#241D11]/95 via-[#131C2B]/95 to-[#111826]/95',
      iconBg: 'bg-amber-500/20 border-amber-500/40 text-amber-400',
      bar: 'bg-gradient-to-r from-amber-400 to-yellow-300',
      actionBtn:
        'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-amber-500/20',
      icon: <Sparkles className="w-5 h-5" />,
    },
    warning: {
      border: 'border-amber-500/55',
      bg: 'from-[#281A11]/95 via-[#161D2B]/95 to-[#111826]/95',
      iconBg: 'bg-amber-500/20 border-amber-500/40 text-amber-300',
      bar: 'bg-gradient-to-r from-amber-500 to-red-400',
      actionBtn:
        'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-amber-500/20',
      icon: <AlertTriangle className="w-5 h-5" />,
    },
    security: {
      border: 'border-blue-500/45',
      bg: 'from-[#111D30]/95 via-[#131C2B]/95 to-[#111826]/95',
      iconBg: 'bg-blue-500/20 border-blue-500/40 text-blue-400',
      bar: 'bg-gradient-to-r from-blue-400 to-emerald-400',
      actionBtn:
        'bg-blue-500 hover:bg-blue-400 text-white shadow-blue-500/20',
      icon: <ShieldCheck className="w-5 h-5" />,
    },
    error: {
      border: 'border-red-500/55',
      bg: 'from-[#281111]/95 via-[#161D2B]/95 to-[#111826]/95',
      iconBg: 'bg-red-500/20 border-red-500/40 text-red-400',
      bar: 'bg-gradient-to-r from-red-500 to-rose-400',
      actionBtn:
        'bg-red-500 hover:bg-red-400 text-white shadow-red-500/20',
      icon: <AlertTriangle className="w-5 h-5" />,
    },
  }[activeItem.variant || 'success'] || {
    border: 'border-emerald-500/45',
    bg: 'from-[#11241E]/95 via-[#131C2B]/95 to-[#111826]/95',
    iconBg: 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400',
    bar: 'bg-gradient-to-r from-emerald-400 to-amber-400',
    actionBtn:
      'bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-emerald-500/20',
    icon: <CheckCircle2 className="w-5 h-5" />,
  };

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed top-4 inset-x-0 z-[70] flex justify-center px-4 pointer-events-none no-print"
    >
      <div
        key={activeItem.id}
        className={`pointer-events-auto w-full max-w-lg rounded-2xl bg-gradient-to-r ${variantStyles.bg} border ${variantStyles.border} backdrop-blur-xl shadow-[0_18px_45px_rgba(0,0,0,0.65)] overflow-hidden animate-feedback-toast`}
      >
        <div className="p-3.5 sm:p-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className={`w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 animate-feedback-icon ${variantStyles.iconBg}`}
            >
              {variantStyles.icon}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <h4 className="text-xs sm:text-sm font-extrabold text-white truncate">
                  {activeItem.title}
                </h4>
              </div>
              <p className="text-[11px] sm:text-xs text-slate-300 line-clamp-2 mt-0.5 leading-snug">
                {activeItem.message}
              </p>
            </div>
          </div>

          {/* Easy Go-Through Quick Action + 1-Tap Pass-Through */}
          <div className="flex items-center gap-2 shrink-0">
            {activeItem.actionLabel && activeItem.onAction && (
              <button
                type="button"
                onClick={() => {
                  activeItem.onAction?.();
                  onDismiss();
                }}
                className={`px-3 py-2 rounded-xl font-extrabold text-[11px] inline-flex items-center gap-1 shadow-md transition cursor-pointer btn-fluid ${variantStyles.actionBtn}`}
              >
                <span>{activeItem.actionLabel}</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
            <button
              type="button"
              onClick={onDismiss}
              aria-label="Dismiss notification"
              className="px-2.5 py-2 rounded-xl bg-white/8 hover:bg-white/15 border border-white/10 text-[11px] font-bold text-slate-200 hover:text-white flex items-center gap-1 transition cursor-pointer btn-fluid"
              title="Got it / Dismiss"
            >
              <span className="hidden sm:inline">Got It</span>
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Smooth Auto-Dismiss Progress Bar */}
        <div className="w-full h-1 bg-black/40 overflow-hidden">
          <div
            className={`h-full transition-all duration-75 ${variantStyles.bar}`}
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    </div>
  );
};
