import React from 'react';
import {
  Camera,
  DoorOpen,
  LayoutGrid,
  ReceiptText,
  Settings,
} from 'lucide-react';
import { NavigationTab } from '../../types/rental';

interface MobileBottomNavProps {
  activeTab: NavigationTab;
  onSelectTab: (tab: NavigationTab) => void;
  onOpenScanner: () => void;
}

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({
  activeTab,
  onSelectTab,
  onOpenScanner,
}) => {
  return (
    <nav
      aria-label="Mobile bottom navigation"
      className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-[#101622]/95 backdrop-blur-xl border-t border-[#243047] px-3 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] shadow-[0_-10px_30px_rgba(0,0,0,0.6)]"
    >
      <div className="max-w-md mx-auto grid grid-cols-5 items-center gap-1">
        <button
          type="button"
          onClick={() => onSelectTab('dashboard')}
          className={`flex flex-col items-center justify-center py-1.5 rounded-2xl transition cursor-pointer ${
            activeTab === 'dashboard'
              ? 'text-amber-400 font-bold'
              : 'text-slate-400 hover:text-slate-200 font-medium'
          }`}
        >
          <LayoutGrid className="w-5 h-5" />
          <span className="text-[10px] mt-1">Home</span>
        </button>

        <button
          type="button"
          onClick={() => onSelectTab('rooms')}
          className={`flex flex-col items-center justify-center py-1.5 rounded-2xl transition cursor-pointer ${
            activeTab === 'rooms'
              ? 'text-amber-400 font-bold'
              : 'text-slate-400 hover:text-slate-200 font-medium'
          }`}
        >
          <DoorOpen className="w-5 h-5" />
          <span className="text-[10px] mt-1">Rooms</span>
        </button>

        <div className="flex items-center justify-center -mt-5">
          <button
            type="button"
            onClick={onOpenScanner}
            aria-label="Scan Sub-Meter"
            className="w-13 h-13 rounded-2xl bg-gradient-to-br from-[#F59E0B] to-[#D97706] text-slate-950 shadow-[0_8px_22px_rgba(245,158,11,0.45)] border-2 border-[#101622] flex flex-col items-center justify-center active:scale-95 transition cursor-pointer"
          >
            <Camera className="w-5 h-5 stroke-[2.4]" />
            <span className="text-[9px] font-black uppercase leading-none mt-0.5">
              OCR
            </span>
          </button>
        </div>

        <button
          type="button"
          onClick={() => onSelectTab('payments')}
          className={`flex flex-col items-center justify-center py-1.5 rounded-2xl transition cursor-pointer ${
            activeTab === 'payments'
              ? 'text-amber-400 font-bold'
              : 'text-slate-400 hover:text-slate-200 font-medium'
          }`}
        >
          <ReceiptText className="w-5 h-5" />
          <span className="text-[10px] mt-1">Bills</span>
        </button>

        <button
          type="button"
          onClick={() => onSelectTab('settings')}
          className={`flex flex-col items-center justify-center py-1.5 rounded-2xl transition cursor-pointer ${
            activeTab === 'settings'
              ? 'text-amber-400 font-bold'
              : 'text-slate-400 hover:text-slate-200 font-medium'
          }`}
        >
          <Settings className="w-5 h-5" />
          <span className="text-[10px] mt-1">Settings</span>
        </button>
      </div>
    </nav>
  );
};
