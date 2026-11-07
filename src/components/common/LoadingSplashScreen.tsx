import React, { useEffect, useState } from 'react';
import { CheckCircle2, Cloud, Cpu, ShieldCheck, Zap } from 'lucide-react';
import { BrandLogo } from '../BrandLogo';

interface LoadingSplashScreenProps {
  mode?: 'boot' | 'unlock';
  durationMs?: number;
  onFinished: () => void;
}

export const LoadingSplashScreen: React.FC<LoadingSplashScreenProps> = ({
  mode = 'boot',
  durationMs = 1150,
  onFinished,
}) => {
  const [progress, setProgress] = useState(8);

  const steps =
    mode === 'unlock'
      ? [
          'Landlord Security Credentials Verified...',
          'Synchronizing Rooms, Receipts & Sub-Meters...',
          'Launching 4Rent Management System...',
        ]
      : [
          'Initializing Encrypted Property Database...',
          'Calibrating Dual Sub-Meter OCR Inspector...',
          'Verifying Landlord Security & Privacy Gate...',
        ];

  useEffect(() => {
    const start = Date.now();
    const interval = setInterval(() => {
      const elapsed = Date.now() - start;
      const pct = Math.min(100, Math.round((elapsed / durationMs) * 100));
      setProgress(Math.max(12, pct));
      if (elapsed >= durationMs) {
        clearInterval(interval);
        onFinished();
      }
    }, 35);

    return () => clearInterval(interval);
  }, [durationMs, onFinished]);

  const currentStepIndex = progress < 40 ? 0 : progress < 80 ? 1 : 2;

  return (
    <div className="min-h-screen w-full bg-[#090D14] text-slate-100 flex flex-col items-center justify-between px-6 py-12 select-none overflow-hidden relative">
      {/* Ambient Background Glows */}
      <div className="pointer-events-none absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-80 h-80 rounded-full bg-amber-500/10 blur-3xl" />
      <div className="pointer-events-none absolute bottom-1/4 left-1/2 -translate-x-1/2 w-72 h-72 rounded-full bg-blue-500/8 blur-3xl" />

      <div className="w-full max-w-sm flex items-center justify-center pt-2">
        <span className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full bg-[#131B2B] border border-[#24324B] text-[11px] font-bold text-amber-400 tracking-wide">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
          <span>4Rent Management System • v1.0.0</span>
        </span>
      </div>

      {/* Center Animated Emblem & Progress */}
      <div className="w-full max-w-sm flex flex-col items-center text-center my-auto z-10">
        <div className="relative mb-8 flex items-center justify-center">
          {/* Outer Rotating Ring */}
          <div className="absolute -inset-3.5 rounded-[34px] border-2 border-amber-500/20 border-t-amber-400 animate-spin" />
          {/* Secondary Subtle Ring */}
          <div className="absolute -inset-1.5 rounded-[30px] border border-amber-500/30" />
          <BrandLogo size="xl" withGlow />
        </div>

        <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
          4Rent Management System
        </h1>
        <p className="text-xs sm:text-sm text-slate-400 mt-1.5">
          {mode === 'unlock'
            ? 'Authenticated • Preparing Your Property Dashboard'
            : 'Apartment Rooms, Deposits & Dual Sub-Meter Billing'}
        </p>

        {/* Progress Bar */}
        <div className="w-full mt-8 space-y-2.5">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-amber-300 truncate pr-2">
              {steps[currentStepIndex]}
            </span>
            <span className="font-mono-num font-extrabold text-amber-400 shrink-0">
              {progress}%
            </span>
          </div>

          <div className="w-full h-2.5 rounded-full bg-[#121824] border border-[#222E44] overflow-hidden p-0.5">
            <div
              className="h-full rounded-full bg-gradient-to-r from-[#F59E0B] via-[#FBBF24] to-[#10B981] transition-all duration-75"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Status Pills */}
        <div className="grid grid-cols-3 gap-2 w-full mt-6">
          <div
            className={`rounded-xl px-2.5 py-2 border text-[10px] font-bold flex items-center justify-center gap-1 transition-all ${
              progress >= 25
                ? 'bg-emerald-500/12 border-emerald-500/35 text-emerald-300'
                : 'bg-[#111723] border-[#1F2A3E] text-slate-500'
            }`}
          >
            <Cpu className="w-3 h-3 shrink-0" />
            <span>OCR Ready</span>
          </div>
          <div
            className={`rounded-xl px-2.5 py-2 border text-[10px] font-bold flex items-center justify-center gap-1 transition-all ${
              progress >= 55
                ? 'bg-amber-500/12 border-amber-500/35 text-amber-300'
                : 'bg-[#111723] border-[#1F2A3E] text-slate-500'
            }`}
          >
            <Zap className="w-3 h-3 shrink-0" />
            <span>Sub-Meters</span>
          </div>
          <div
            className={`rounded-xl px-2.5 py-2 border text-[10px] font-bold flex items-center justify-center gap-1 transition-all ${
              progress >= 85
                ? 'bg-blue-500/12 border-blue-500/35 text-blue-300'
                : 'bg-[#111723] border-[#1F2A3E] text-slate-500'
            }`}
          >
            {progress >= 90 ? (
              <CheckCircle2 className="w-3 h-3 shrink-0 text-emerald-400" />
            ) : (
              <Cloud className="w-3 h-3 shrink-0" />
            )}
            <span>Live Sync</span>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="text-center text-[11px] text-slate-500">
        Protected by Landlord Biometric &amp; Passcode Security • by{' '}
        <strong className="text-slate-300">splikaa</strong>
      </div>
    </div>
  );
};
