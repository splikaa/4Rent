import React, { useState } from 'react';
import {
  Archive,
  ArrowRight,
  Camera,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  DoorOpen,
  ReceiptText,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Wallet,
  X,
} from 'lucide-react';
import { NavigationTab } from '../../types/rental';

interface EasyWalkthroughModalProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigateTab: (tab: NavigationTab) => void;
  onOpenAddRoom: () => void;
  onOpenScanner: () => void;
}

export const EasyWalkthroughModal: React.FC<EasyWalkthroughModalProps> = ({
  isOpen,
  onClose,
  onNavigateTab,
  onOpenAddRoom,
  onOpenScanner,
}) => {
  const [stepIdx, setStepIdx] = useState(0);

  if (!isOpen) return null;

  const steps = [
    {
      badge: 'Step 1 of 5 • Room & Tenant Setup',
      title: 'Create Rooms & Verify Tenant Lease Privacy',
      description:
        'Each apartment room tracks its own continuous electric sub-meter kWh reading (never resets when tenants change), required security deposit, and RA 10173 Data Privacy / Contract of Lease status.',
      highlights: [
        'Continuous Sub-Meter kWh persists across tenant move-outs',
        'Occupied rooms are protected from accidental archiving without a reason',
        '1-tap Privacy Shield masks tenant phone numbers & revenue on screen',
      ],
      icon: <DoorOpen className="w-6 h-6 text-amber-400" />,
      actionLabel: 'Go to Rooms & Add Room',
      onAction: () => {
        onNavigateTab('rooms');
        onOpenAddRoom();
        onClose();
      },
    },
    {
      badge: 'Step 2 of 5 • Calibrated Sub-Meter OCR',
      title: 'Scan Previous & Current Sub-Meters Accurately',
      description:
        'Upload or capture photos of mechanical roller meters (Safari SY-168, Static TYPE-SP1) or digital LCD meters (GE kV2c, Cirtech MT-60i). The system inspects the 5 black integer + 1 red decimal tenths drums and calculates exact kWh consumption.',
      highlights: [
        'Filters out faceplate serial numbers, barcodes & 240V/60Hz specs',
        'Embeds both Previous (#1) and Current (#2) meter photo proofs',
        'Automatically deducts any available Room Advance Balance on billing day',
      ],
      icon: <Camera className="w-6 h-6 text-amber-400" />,
      actionLabel: 'Open Sub-Meter OCR Scanner',
      onAction: () => {
        onOpenScanner();
        onClose();
      },
    },
    {
      badge: 'Step 3 of 5 • White-Paper Official Receipt',
      title: 'Formal Statement of Account & Printable Receipt',
      description:
        'Every generated bill produces a formal, crisp White-Paper Statement of Account & Official Receipt with bordered tables, dual sub-meter photo proofs, itemized charges, and Landlord/Tenant signature lines.',
      highlights: [
        'Single-page A4 Print / PDF output & High-DPI PNG image download',
        '1-click Copy & Share directly to Tenant Facebook Messenger',
        '1 Room = 1 Active Official Receipt (older receipts auto-archive)',
      ],
      icon: <ReceiptText className="w-6 h-6 text-emerald-400" />,
      actionLabel: 'Go to Payment & Receipts',
      onAction: () => {
        onNavigateTab('payments');
        onClose();
      },
    },
    {
      badge: 'Step 4 of 5 • Auto-Deducting Advance Balance',
      title: 'Add Advance Payment & Automatic Bill Deduction',
      description:
        'When a tenant pays in advance or overpays a bill, the credit is stored in their Advance Balance. If an unpaid bill exists, it deducts automatically right away—or automatically deducts when the next billing day arrives.',
      highlights: [
        'No manual "Apply to Bill" step needed—deductions happen automatically',
        'Landlord can also record Withdrawals / Refunds at move-out',
        'Full transaction ledger recorded per room',
      ],
      icon: <Wallet className="w-6 h-6 text-emerald-400" />,
      actionLabel: 'Manage Room Advance Balances',
      onAction: () => {
        onNavigateTab('rooms');
        onClose();
      },
    },
    {
      badge: 'Step 5 of 5 • Archive Guard & Desktop ↔ Mobile Sync',
      title: 'Occupied Archive Protection & Real-Time Mobile Sync',
      description:
        'Occupied rooms with remaining stay days cannot be archived directly without selecting a mandatory reason (e.g., missing Contract of Lease). All rooms and bills sync live between Desktop and the Android Mobile APK.',
      highlights: [
        'Mobile Biometric Fingerprint unlock + Desktop 4-Digit Passcode PIN',
        'Real-Time Cloud & Local Sync using Property Code 4RENT-MAIN',
        'Full JSON Database Backup & Restore in Settings',
      ],
      icon: <Smartphone className="w-6 h-6 text-blue-400" />,
      actionLabel: 'Open Sync & Security Settings',
      onAction: () => {
        onNavigateTab('settings');
        onClose();
      },
    },
  ];

  const current = steps[stepIdx];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto no-print">
      <div className="w-full max-w-lg rounded-3xl bg-[#131A28] border border-amber-500/35 shadow-2xl overflow-hidden my-auto animate-modal-pop">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-[#182234] border-b border-[#26344E]">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-500/35 flex items-center justify-center text-amber-400">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-extrabold text-white">
                4Rent Easy Go-Through Guide
              </h3>
              <p className="text-[11px] text-slate-400">
                Interactive step-by-step walkthrough with 1-click actions
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-[#0E1420] text-slate-400 hover:text-white flex items-center justify-center cursor-pointer btn-fluid"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Step Indicator Dots */}
        <div className="px-6 pt-5 flex items-center justify-between gap-2">
          <span className="px-3 py-1 rounded-full bg-amber-500/15 border border-amber-500/30 text-[11px] font-extrabold text-amber-300">
            {current.badge}
          </span>
          <div className="flex items-center gap-1.5">
            {steps.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setStepIdx(i)}
                aria-label={`Go to step ${i + 1}`}
                className={`h-2 rounded-full transition-all cursor-pointer ${
                  i === stepIdx
                    ? 'w-6 bg-amber-400'
                    : 'w-2 bg-slate-700 hover:bg-slate-500'
                }`}
              />
            ))}
          </div>
        </div>

        {/* Step Body */}
        <div key={stepIdx} className="p-6 space-y-4 animate-view-enter">
          <div className="flex items-start gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-[#0E1420] border border-[#25334D] flex items-center justify-center shrink-0">
              {current.icon}
            </div>
            <div>
              <h4 className="text-base sm:text-lg font-extrabold text-white leading-snug">
                {current.title}
              </h4>
              <p className="text-xs sm:text-sm text-slate-300 mt-1.5 leading-relaxed">
                {current.description}
              </p>
            </div>
          </div>

          <div className="rounded-2xl bg-[#0D121C] border border-[#223049] p-4 space-y-2">
            {current.highlights.map((item) => (
              <div
                key={item}
                className="flex items-start gap-2 text-xs text-slate-200"
              >
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <span>{item}</span>
              </div>
            ))}
          </div>

          {/* Direct Action Button for Current Step */}
          <button
            type="button"
            onClick={current.onAction}
            className="w-full py-3.5 px-4 rounded-2xl bg-[#F59E0B] hover:bg-[#FBBF24] text-slate-950 font-extrabold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20 cursor-pointer btn-fluid"
          >
            <span>{current.actionLabel}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>

        {/* Footer Navigation */}
        <div className="px-6 py-4 bg-[#0E1420] border-t border-[#222F46] flex items-center justify-between gap-3">
          <button
            type="button"
            disabled={stepIdx === 0}
            onClick={() => setStepIdx((p) => Math.max(0, p - 1))}
            className="px-3.5 py-2 rounded-xl bg-[#172133] hover:bg-[#202E47] disabled:opacity-40 text-xs font-bold text-slate-200 flex items-center gap-1 cursor-pointer btn-fluid"
          >
            <ChevronLeft className="w-4 h-4" />
            <span>Previous</span>
          </button>

          <div className="flex items-center gap-2">
            {stepIdx < steps.length - 1 ? (
              <button
                type="button"
                onClick={() =>
                  setStepIdx((p) => Math.min(steps.length - 1, p + 1))
                }
                className="px-4 py-2 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 text-xs font-extrabold flex items-center gap-1 cursor-pointer btn-fluid"
              >
                <span>Next Step</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-extrabold flex items-center gap-1 cursor-pointer btn-fluid"
              >
                <ShieldCheck className="w-4 h-4" />
                <span>Finish Guide</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
