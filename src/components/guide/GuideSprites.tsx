import React, { useId } from 'react';
import {
  Archive,
  Camera,
  CheckCircle2,
  DoorOpen,
  Download,
  Fingerprint,
  History,
  Laptop,
  Lock,
  MessageCircle,
  ReceiptText,
  ShieldCheck,
  Smartphone,
  Wallet,
  WifiOff,
  Zap,
} from 'lucide-react';
import { BuddyMood, GuideFlowId } from '../../data/guideFlows';

interface GuideBuddySpriteProps {
  mood: BuddyMood;
  tip: string;
  isPlaying: boolean;
}

const MOOD_BADGE_MAP: Record<
  BuddyMood,
  { accent: string; ring: string; icon: React.ReactNode }
> = {
  point: {
    accent: 'text-amber-300 bg-amber-500/20 border-amber-500/45',
    ring: 'bg-amber-500/20',
    icon: <DoorOpen className="w-3.5 h-3.5 text-amber-300" />,
  },
  scan: {
    accent: 'text-amber-300 bg-amber-500/20 border-amber-500/45',
    ring: 'bg-amber-500/20',
    icon: <Camera className="w-3.5 h-3.5 text-amber-300" />,
  },
  lock: {
    accent: 'text-blue-300 bg-blue-500/20 border-blue-500/45',
    ring: 'bg-blue-500/20',
    icon: <Lock className="w-3.5 h-3.5 text-blue-300" />,
  },
  receipt: {
    accent: 'text-emerald-300 bg-emerald-500/20 border-emerald-500/45',
    ring: 'bg-emerald-500/20',
    icon: <ReceiptText className="w-3.5 h-3.5 text-emerald-300" />,
  },
  wallet: {
    accent: 'text-emerald-300 bg-emerald-500/20 border-emerald-500/45',
    ring: 'bg-emerald-500/20',
    icon: <Wallet className="w-3.5 h-3.5 text-emerald-300" />,
  },
  archive: {
    accent: 'text-amber-300 bg-amber-500/20 border-amber-500/45',
    ring: 'bg-amber-500/20',
    icon: <Archive className="w-3.5 h-3.5 text-amber-300" />,
  },
  sync: {
    accent: 'text-blue-300 bg-blue-500/20 border-blue-500/45',
    ring: 'bg-blue-500/20',
    icon: <Smartphone className="w-3.5 h-3.5 text-blue-300" />,
  },
};

/**
 * Geometric 4Rent Buddy vector mascot modeled on BrandLogo's golden '4' roof & 4-pane window face.
 */
export const GuideBuddySprite: React.FC<GuideBuddySpriteProps> = ({
  mood,
  tip,
  isPlaying,
}) => {
  const uid = useId();
  const roofGradId = `buddyRoof-${uid}`;
  const bodyGradId = `buddyBody-${uid}`;
  const badge = MOOD_BADGE_MAP[mood];

  return (
    <div className="flex items-center gap-3.5 rounded-2xl bg-[#0D131E]/95 border border-[#24324B] px-3.5 py-2.5">
      <div className="relative shrink-0 w-13 h-13 flex items-center justify-center">
        <div
          className={`absolute inset-1 rounded-full blur-md ${badge.ring} ${
            isPlaying ? 'sprite-pulse-beacon' : ''
          }`}
          aria-hidden="true"
        />
        <div
          className={`relative w-12 h-12 flex items-center justify-center ${
            isPlaying ? 'sprite-mascot-bob' : ''
          }`}
        >
          <svg
            viewBox="0 0 80 80"
            className="w-12 h-12 drop-shadow-[0_6px_12px_rgba(245,158,11,0.28)]"
            fill="none"
            aria-hidden="true"
          >
            <defs>
              <linearGradient
                id={roofGradId}
                x1="14"
                y1="10"
                x2="66"
                y2="54"
                gradientUnits="userSpaceOnUse"
              >
                <stop offset="0%" stopColor="#FDE047" />
                <stop offset="55%" stopColor="#F59E0B" />
                <stop offset="100%" stopColor="#D97706" />
              </linearGradient>
              <linearGradient
                id={bodyGradId}
                x1="20"
                y1="30"
                x2="60"
                y2="68"
                gradientUnits="userSpaceOnUse"
              >
                <stop offset="0%" stopColor="#1E293B" />
                <stop offset="100%" stopColor="#0F172A" />
              </linearGradient>
            </defs>
            {/* Golden 4-shaped Pitched Roof */}
            <path
              d="M40 10 L13 38 H56"
              stroke={`url(#${roofGradId})`}
              strokeWidth="6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M42 10 L65 34"
              stroke="#E2E8F0"
              strokeWidth="4.5"
              strokeLinecap="round"
            />
            {/* Mascot Rounded Home Body */}
            <rect
              x="21"
              y="34"
              width="38"
              height="32"
              rx="10"
              fill={`url(#${bodyGradId})`}
              stroke="#334155"
              strokeWidth="2.5"
            />
            {/* Glowing 4-Pane Window Eyes */}
            <rect x="31" y="42" width="7" height="7" rx="1.8" fill="#F59E0B" />
            <rect x="42" y="42" width="7" height="7" rx="1.8" fill="#F59E0B" />
            <rect x="31" y="51" width="7" height="7" rx="1.8" fill="#FBBF24" />
            <rect x="42" y="51" width="7" height="7" rx="1.8" fill="#10B981" />
          </svg>
          <span
            className={`absolute -bottom-0.5 -right-0.5 w-6 h-6 rounded-xl border flex items-center justify-center shadow-md ${badge.accent}`}
          >
            {badge.icon}
          </span>
        </div>
      </div>

      <div className="min-w-0 flex-1">
        <div className="text-[10px] font-black uppercase tracking-wider text-amber-400">
          4Rent Guide Buddy
        </div>
        <p className="text-xs text-slate-200 font-medium leading-snug mt-0.5">
          {tip}
        </p>
      </div>
    </div>
  );
};

interface SceneProps {
  activeSubStep: 0 | 1 | 2;
  isPlaying: boolean;
}

const RoomSetupScene: React.FC<SceneProps> = ({ activeSubStep, isPlaying }) => {
  const step0 = activeSubStep === 0;
  const step1 = activeSubStep === 1;
  const step2 = activeSubStep === 2;

  return (
    <div className="w-full grid grid-cols-1 sm:grid-cols-3 gap-2.5 items-stretch">
      <div
        className={`rounded-2xl p-3 border transition-all duration-300 ${
          step0
            ? 'bg-amber-500/12 border-amber-400/70 shadow-lg shadow-amber-500/15 scale-[1.02]'
            : 'bg-[#0C121D] border-[#202B3F] opacity-65'
        }`}
      >
        <div className="flex items-center justify-between text-[10px] font-extrabold text-amber-300">
          <span>ROOM 101</span>
          <Zap className={`w-3.5 h-3.5 ${step0 && isPlaying ? 'sprite-pulse-beacon' : ''}`} />
        </div>
        <div className="mt-2 font-mono-num text-sm font-black text-white">
          3020.7 kWh
        </div>
        <div className="text-[10px] text-slate-400 mt-0.5">
          Continuous Baseline
        </div>
      </div>

      <div
        className={`rounded-2xl p-3 border transition-all duration-300 ${
          step1
            ? 'bg-emerald-500/12 border-emerald-400/70 shadow-lg shadow-emerald-500/15 scale-[1.02]'
            : 'bg-[#0C121D] border-[#202B3F] opacity-65'
        }`}
      >
        <div className="flex items-center justify-between text-[10px] font-extrabold text-emerald-300">
          <span>OCCUPIED</span>
          <CheckCircle2
            className={`w-3.5 h-3.5 ${step1 && isPlaying ? 'sprite-pulse-beacon' : ''}`}
          />
        </div>
        <div className="mt-2 text-xs font-extrabold text-white truncate">
          Due Every 5th (1–10)
        </div>
        <div className="text-[10px] text-emerald-300/90 mt-0.5">
          Valid ID + Consent OK
        </div>
      </div>

      <div
        className={`rounded-2xl p-3 border transition-all duration-300 ${
          step2
            ? 'bg-red-500/12 border-red-400/70 shadow-lg shadow-red-500/15 scale-[1.02]'
            : 'bg-[#0C121D] border-[#202B3F] opacity-65'
        }`}
      >
        <div className="flex items-center justify-between text-[10px] font-extrabold text-red-300">
          <span>SAFE ACTIONS</span>
          <ShieldCheck
            className={`w-3.5 h-3.5 ${step2 && isPlaying ? 'sprite-hand-tap' : ''}`}
          />
        </div>
        <div className="mt-2 flex flex-wrap gap-1 text-[9px] font-bold">
          <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300">
            Vacate Confirm
          </span>
          <span className="px-1.5 py-0.5 rounded bg-red-500/20 text-red-300">
            Delete PIN
          </span>
        </div>
      </div>
    </div>
  );
};

const SubMeterOcrScene: React.FC<SceneProps> = ({ activeSubStep, isPlaying }) => {
  const step0 = activeSubStep === 0;
  const step1 = activeSubStep === 1;
  const step2 = activeSubStep === 2;

  return (
    <div className="w-full grid grid-cols-1 sm:grid-cols-3 gap-2.5 items-center">
      {/* Sub-Meter Dial with Animated Laser Sweep */}
      <div
        className={`relative overflow-hidden rounded-2xl p-3 border transition-all duration-300 ${
          step0
            ? 'bg-amber-500/12 border-amber-400/75 shadow-lg shadow-amber-500/15'
            : 'bg-[#0C121D] border-[#202B3F] opacity-70'
        }`}
      >
        <div className="text-[10px] font-bold text-amber-300 flex items-center justify-between">
          <span>SLOT #2 CURRENT</span>
          <Camera className="w-3.5 h-3.5" />
        </div>
        <div className="relative mt-2 rounded-lg bg-[#070B12] border border-[#24324B] px-2.5 py-2 font-mono-num text-base font-black tracking-widest text-white text-center">
          003045.2
          {step0 && isPlaying && (
            <div
              className="sprite-laser-sweep absolute inset-x-1 top-1/2 h-0.5 bg-gradient-to-r from-transparent via-amber-400 to-transparent shadow-[0_0_10px_#F59E0B]"
              aria-hidden="true"
            />
          )}
        </div>
      </div>

      {/* HD Crop Verification */}
      <div
        className={`rounded-2xl p-3 border transition-all duration-300 ${
          step1
            ? 'bg-emerald-500/12 border-emerald-400/75 shadow-lg shadow-emerald-500/15'
            : 'bg-[#0C121D] border-[#202B3F] opacity-70'
        }`}
      >
        <div className="flex items-center justify-between text-[10px] font-extrabold text-emerald-300">
          <span>HD CROP</span>
          <span className="px-1.5 py-0.5 rounded bg-emerald-500 text-slate-950 font-black text-[9px]">
            Verified
          </span>
        </div>
        <div className="mt-2 rounded-lg bg-[#091522] border border-emerald-500/40 px-2 py-1.5 font-mono-num text-xs font-extrabold text-emerald-300 text-center">
          3020.7 → 3045.2 kWh
        </div>
      </div>

      {/* Bill & Auto-Rollover */}
      <div
        className={`rounded-2xl p-3 border transition-all duration-300 ${
          step2
            ? 'bg-blue-500/12 border-blue-400/75 shadow-lg shadow-blue-500/15'
            : 'bg-[#0C121D] border-[#202B3F] opacity-70'
        }`}
      >
        <div className="text-[10px] font-extrabold text-blue-300 flex items-center justify-between">
          <span>AUTO-ROLLOVER</span>
          <Zap className={`w-3.5 h-3.5 ${step2 && isPlaying ? 'sprite-pulse-beacon' : ''}`} />
        </div>
        <div className="mt-2 font-mono-num text-xs font-extrabold text-white">
          Delta: 24.5 kWh
        </div>
        <div className="text-[10px] text-slate-300 mt-0.5">
          Next #1 starts at 3045.2
        </div>
      </div>
    </div>
  );
};

const CalendarGuardScene: React.FC<SceneProps> = ({ activeSubStep, isPlaying }) => {
  const step0 = activeSubStep === 0;
  const step1 = activeSubStep === 1;
  const step2 = activeSubStep === 2;

  return (
    <div className="w-full grid grid-cols-1 sm:grid-cols-3 gap-2.5 items-stretch">
      <div
        className={`rounded-2xl p-3 border transition-all duration-300 ${
          step0
            ? 'bg-amber-500/12 border-amber-400/75 shadow-lg shadow-amber-500/15'
            : 'bg-[#0C121D] border-[#202B3F] opacity-70'
        }`}
      >
        <div className="text-[10px] font-extrabold text-amber-300 mb-1.5">
          PAY WINDOW: DAY 1–10
        </div>
        <div className="grid grid-cols-5 gap-1 font-mono-num text-[10px] font-bold text-center">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((d) => (
            <span
              key={d}
              className={`py-0.5 rounded ${
                d === 5
                  ? `bg-amber-500 text-slate-950 font-black ${
                      step0 && isPlaying ? 'sprite-pulse-beacon' : ''
                    }`
                  : 'bg-[#172133] text-amber-200'
              }`}
            >
              {d}
            </span>
          ))}
        </div>
      </div>

      <div
        className={`rounded-2xl p-3 border transition-all duration-300 ${
          step1
            ? 'bg-slate-800/70 border-amber-400/65 shadow-lg shadow-amber-500/10'
            : 'bg-[#0C121D] border-[#202B3F] opacity-70'
        }`}
      >
        <div className="flex items-center justify-between text-[10px] font-extrabold text-slate-300">
          <span>DEC / PAID GUARD</span>
          <Lock className={`w-3.5 h-3.5 text-amber-400 ${step1 && isPlaying ? 'sprite-pulse-beacon' : ''}`} />
        </div>
        <div className="mt-2 px-2.5 py-1.5 rounded-xl bg-[#070B12] border border-[#24324B] text-[11px] font-bold text-slate-400 flex items-center justify-between">
          <span>Scan Meter</span>
          <span className="text-[9px] font-black text-amber-400 uppercase">Locked</span>
        </div>
      </div>

      <div
        className={`rounded-2xl p-3 border transition-all duration-300 ${
          step2
            ? 'bg-emerald-500/12 border-emerald-400/75 shadow-lg shadow-emerald-500/15'
            : 'bg-[#0C121D] border-[#202B3F] opacity-70'
        }`}
      >
        <div className="flex items-center justify-between text-[10px] font-extrabold text-emerald-300">
          <span>ALWAYS OPEN</span>
          <DoorOpen className={`w-3.5 h-3.5 ${step2 && isPlaying ? 'sprite-hand-tap' : ''}`} />
        </div>
        <div className="mt-2 space-y-1 text-[10px] font-bold">
          <div className="px-2 py-1 rounded bg-emerald-500/15 text-emerald-200">
            View Room Details
          </div>
          <div className="px-2 py-1 rounded bg-blue-500/15 text-blue-200">
            Prepay Next Month
          </div>
        </div>
      </div>
    </div>
  );
};

const ReceiptShareScene: React.FC<SceneProps> = ({ activeSubStep, isPlaying }) => {
  const step0 = activeSubStep === 0;
  const step1 = activeSubStep === 1;
  const step2 = activeSubStep === 2;

  return (
    <div className="w-full grid grid-cols-1 sm:grid-cols-3 gap-2.5 items-stretch">
      <div
        className={`rounded-2xl p-3 border transition-all duration-300 ${
          step0
            ? 'bg-white text-slate-900 border-amber-400 shadow-lg'
            : 'bg-slate-100/90 text-slate-800 border-slate-300 opacity-75'
        }`}
      >
        <div className="flex items-center justify-between text-[10px] font-black">
          <span>4RENT STATEMENT</span>
          <ReceiptText className="w-3.5 h-3.5 text-amber-600" />
        </div>
        <div className="mt-1.5 text-[10px] font-semibold text-slate-600">
          Rent + Electric • Dual Crops
        </div>
        <div className="mt-1.5 grid grid-cols-2 gap-1">
          <div className="h-4 rounded bg-slate-200 text-[8px] font-mono font-bold flex items-center justify-center">
            #1 Crop
          </div>
          <div className="h-4 rounded bg-slate-200 text-[8px] font-mono font-bold flex items-center justify-center">
            #2 Crop
          </div>
        </div>
      </div>

      <div
        className={`rounded-2xl p-3 border transition-all duration-300 ${
          step1
            ? 'bg-amber-500/12 border-amber-400/75 shadow-lg shadow-amber-500/15'
            : 'bg-[#0C121D] border-[#202B3F] opacity-70'
        }`}
      >
        <div className="flex items-center justify-between text-[10px] font-extrabold text-amber-300">
          <span>INSTANT EXPORT</span>
          <Download className={`w-3.5 h-3.5 ${step1 && isPlaying ? 'sprite-hand-tap' : ''}`} />
        </div>
        <div className="mt-2 flex gap-1.5 text-[10px] font-extrabold">
          <span className="flex-1 text-center py-1.5 rounded-lg bg-[#192335] text-white border border-[#2D3E5E]">
            A4 PDF
          </span>
          <span className="flex-1 text-center py-1.5 rounded-lg bg-amber-500 text-slate-950">
            PNG
          </span>
        </div>
      </div>

      <div
        className={`rounded-2xl p-3 border transition-all duration-300 ${
          step2
            ? 'bg-blue-500/15 border-blue-400/75 shadow-lg shadow-blue-500/15'
            : 'bg-[#0C121D] border-[#202B3F] opacity-70'
        }`}
      >
        <div className="flex items-center justify-between text-[10px] font-extrabold text-blue-300">
          <span>MESSENGER</span>
          <MessageCircle className={`w-3.5 h-3.5 ${step2 && isPlaying ? 'sprite-pulse-beacon' : ''}`} />
        </div>
        <div className="mt-2 text-[11px] font-bold text-white">
          Auto-Copies Proof
        </div>
        <div className="text-[10px] text-blue-200/80 mt-0.5">
          Opens Tenant Thread
        </div>
      </div>
    </div>
  );
};

const AdvanceVaultScene: React.FC<SceneProps> = ({ activeSubStep, isPlaying }) => {
  const step0 = activeSubStep === 0;
  const step1 = activeSubStep === 1;
  const step2 = activeSubStep === 2;

  return (
    <div className="w-full grid grid-cols-1 sm:grid-cols-3 gap-2.5 items-stretch">
      <div
        className={`relative rounded-2xl p-3 border transition-all duration-300 ${
          step0
            ? 'bg-amber-500/12 border-amber-400/75 shadow-lg shadow-amber-500/15'
            : 'bg-[#0C121D] border-[#202B3F] opacity-70'
        }`}
      >
        <div className="text-[10px] font-extrabold text-amber-300">
          EXCESS PAYMENT
        </div>
        <div className="mt-1.5 font-mono-num text-xs font-bold text-white">
          Due ₱4,500 → Paid ₱5,000
        </div>
        <div className="mt-1.5 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-black">
          <span className="relative w-3.5 h-3.5 rounded-full bg-amber-400/20 border border-amber-400/50 inline-flex items-center justify-center overflow-hidden text-[8px] text-amber-300">
            <span className={step0 && isPlaying ? 'sprite-coin-drop inline-block' : ''}>
              ₱
            </span>
          </span>
          <span>+₱500.00 Advance</span>
        </div>
      </div>

      <div
        className={`rounded-2xl p-3 border transition-all duration-300 ${
          step1
            ? 'bg-blue-500/15 border-blue-400/75 shadow-lg shadow-blue-500/15'
            : 'bg-[#0C121D] border-[#202B3F] opacity-70'
        }`}
      >
        <div className="flex items-center justify-between text-[10px] font-extrabold text-blue-300">
          <span>SECURITY GATE</span>
          <Fingerprint className={`w-4 h-4 ${step1 && isPlaying ? 'sprite-pulse-beacon' : ''}`} />
        </div>
        <div className="mt-2 text-[11px] font-bold text-white">
          Mobile: Fingerprint
        </div>
        <div className="text-[10px] text-slate-300 mt-0.5">
          Desktop: 4-Digit PIN
        </div>
      </div>

      <div
        className={`rounded-2xl p-3 border transition-all duration-300 ${
          step2
            ? 'bg-emerald-500/12 border-emerald-400/75 shadow-lg shadow-emerald-500/15'
            : 'bg-[#0C121D] border-[#202B3F] opacity-70'
        }`}
      >
        <div className="flex items-center justify-between text-[10px] font-extrabold text-emerald-300">
          <span>NEXT BILL / REFUND</span>
          <Wallet className={`w-3.5 h-3.5 ${step2 && isPlaying ? 'sprite-hand-tap' : ''}`} />
        </div>
        <div className="mt-2 text-[11px] font-bold text-white">
          Auto-Deducts Next Cycle
        </div>
        <div className="text-[10px] text-emerald-300/90 mt-0.5">
          Refundable on Vacate
        </div>
      </div>
    </div>
  );
};

const ArchiveLogScene: React.FC<SceneProps> = ({ activeSubStep, isPlaying }) => {
  const step0 = activeSubStep === 0;
  const step1 = activeSubStep === 1;
  const step2 = activeSubStep === 2;

  return (
    <div className="w-full grid grid-cols-1 sm:grid-cols-3 gap-2.5 items-stretch">
      <div
        className={`rounded-2xl p-3 border transition-all duration-300 ${
          step0
            ? 'bg-amber-500/12 border-amber-400/75 shadow-lg shadow-amber-500/15'
            : 'bg-[#0C121D] border-[#202B3F] opacity-70'
        }`}
      >
        <div className="text-[10px] font-extrabold text-amber-300">
          RESERVATION FLOW
        </div>
        <div className="mt-2 text-xs font-extrabold text-white">
          Booking → 1-Tap Move-In
        </div>
        <div className="text-[10px] text-slate-300 mt-0.5">
          Applies Reservation Fee
        </div>
      </div>

      <div
        className={`rounded-2xl p-3 border transition-all duration-300 ${
          step1
            ? 'bg-blue-500/12 border-blue-400/75 shadow-lg shadow-blue-500/15'
            : 'bg-[#0C121D] border-[#202B3F] opacity-70'
        }`}
      >
        <div className="flex items-center justify-between text-[10px] font-extrabold text-blue-300">
          <span>ARCHIVE CENTER</span>
          <History className="w-3.5 h-3.5" />
        </div>
        <div className="mt-2 text-xs font-extrabold text-white">
          Restore Units & Receipts
        </div>
        <div className="text-[10px] text-slate-300 mt-0.5">
          Past Tenants Preserved
        </div>
      </div>

      <div
        className={`rounded-2xl p-3 border transition-all duration-300 ${
          step2
            ? 'bg-emerald-500/12 border-emerald-400/75 shadow-lg shadow-emerald-500/15'
            : 'bg-[#0C121D] border-[#202B3F] opacity-70'
        }`}
      >
        <div className="flex items-center justify-between text-[10px] font-extrabold text-emerald-300">
          <span>IMMUTABLE LOGS</span>
          <Lock className={`w-3.5 h-3.5 ${step2 && isPlaying ? 'sprite-pulse-beacon' : ''}`} />
        </div>
        <div className="mt-2 text-xs font-extrabold text-white">
          Protected kWh Trail
        </div>
        <div className="text-[10px] text-emerald-300/90 mt-0.5">
          Log Removal Disabled
        </div>
      </div>
    </div>
  );
};

const CloudSyncScene: React.FC<SceneProps> = ({ activeSubStep, isPlaying }) => {
  const step0 = activeSubStep === 0;
  const step1 = activeSubStep === 1;
  const step2 = activeSubStep === 2;

  return (
    <div className="w-full grid grid-cols-1 sm:grid-cols-3 gap-2.5 items-stretch">
      <div
        className={`rounded-2xl p-3 border transition-all duration-300 ${
          step0
            ? 'bg-emerald-500/12 border-emerald-400/75 shadow-lg shadow-emerald-500/15'
            : 'bg-[#0C121D] border-[#202B3F] opacity-70'
        }`}
      >
        <div className="flex items-center justify-between text-[10px] font-extrabold text-emerald-300">
          <span>OFFLINE SAFE</span>
          <WifiOff className="w-3.5 h-3.5" />
        </div>
        <div className="mt-2 text-xs font-extrabold text-white">
          Local IndexedDB
        </div>
        <div className="text-[10px] text-emerald-300/90 mt-0.5">
          Works Without Wi-Fi
        </div>
      </div>

      <div
        className={`rounded-2xl p-3 border transition-all duration-300 ${
          step1
            ? 'bg-amber-500/12 border-amber-400/75 shadow-lg shadow-amber-500/15'
            : 'bg-[#0C121D] border-[#202B3F] opacity-70'
        }`}
      >
        <div className="flex items-center justify-between text-[10px] font-extrabold text-amber-300">
          <span>DESKTOP HOST</span>
          <Laptop className="w-3.5 h-3.5" />
        </div>
        <div className="mt-2 font-mono-num text-xs font-black text-white">
          4RENT-MAIN
        </div>
        <div className="text-[10px] text-amber-300/90 mt-0.5">
          Keep Code Private
        </div>
      </div>

      <div
        className={`relative overflow-hidden rounded-2xl p-3 border transition-all duration-300 ${
          step2
            ? 'bg-blue-500/15 border-blue-400/75 shadow-lg shadow-blue-500/15'
            : 'bg-[#0C121D] border-[#202B3F] opacity-70'
        }`}
      >
        <div className="flex items-center justify-between text-[10px] font-extrabold text-blue-300">
          <span>MOBILE APPLY</span>
          <Smartphone className="w-3.5 h-3.5" />
        </div>
        <div className="mt-2 text-xs font-extrabold text-white flex items-center gap-2">
          <span>1x / Month Limit</span>
          {step2 && isPlaying && (
            <span
              className="relative w-10 h-2 rounded-full bg-[#070B12] border border-blue-500/30 overflow-hidden inline-flex items-center justify-center shrink-0"
              aria-hidden="true"
            >
              <span className="sprite-packet-travel inline-block w-2 h-2 rounded-full bg-blue-400 shadow-[0_0_8px_#60A5FA]" />
            </span>
          )}
        </div>
        <div className="text-[10px] text-blue-200/80 mt-0.5">
          Auto-Reload &amp; Apply
        </div>
      </div>
    </div>
  );
};

const FLOW_SCENE_MAP: Record<GuideFlowId, React.FC<SceneProps>> = {
  'room-lifecycle': RoomSetupScene,
  'submeter-ocr': SubMeterOcrScene,
  'calendar-window': CalendarGuardScene,
  'official-receipt': ReceiptShareScene,
  'advance-vault': AdvanceVaultScene,
  'archive-bookings': ArchiveLogScene,
  'offline-sync': CloudSyncScene,
};

interface FlowSpriteStageProps {
  flowId: GuideFlowId;
  activeSubStep: 0 | 1 | 2;
  isPlaying: boolean;
}

export const FlowSpriteStage: React.FC<FlowSpriteStageProps> = ({
  flowId,
  activeSubStep,
  isPlaying,
}) => {
  const Scene = FLOW_SCENE_MAP[flowId];

  return (
    <div className="rounded-2xl bg-[#080C14] border border-[#22304A] p-3.5 sm:p-4 shadow-inner">
      <Scene activeSubStep={activeSubStep} isPlaying={isPlaying} />
    </div>
  );
};
