import React from 'react';
import {
  Archive,
  CalendarCheck,
  DoorOpen,
  Eye,
  EyeOff,
  LayoutGrid,
  LogOut,
  ReceiptText,
  Settings,
  ShieldCheck,
  X,
} from 'lucide-react';
import { BrandLogo } from '../BrandLogo';
import { NavigationTab } from '../../types/rental';

interface NavigationDrawerProps {
  activeTab: NavigationTab;
  isOpenMobile: boolean;
  privacyMaskEnabled?: boolean;
  onCloseMobile: () => void;
  onSelectTab: (tab: NavigationTab) => void;
  onTogglePrivacyMask?: () => void;
  onLockApp: () => void;
  hasRooms: boolean;
}

export const NavigationDrawer: React.FC<NavigationDrawerProps> = ({
  activeTab,
  isOpenMobile,
  privacyMaskEnabled = false,
  onCloseMobile,
  onSelectTab,
  onTogglePrivacyMask,
  onLockApp,
}) => {
  const navItems: {
    id: NavigationTab;
    label: string;
    icon: React.ReactNode;
  }[] = [
    {
      id: 'dashboard',
      label: 'Dashboard',
      icon: <LayoutGrid className="w-5 h-5" />,
    },
    {
      id: 'rooms',
      label: 'Rooms',
      icon: <DoorOpen className="w-5 h-5" />,
    },
    {
      id: 'inquiries',
      label: 'Inquiries & Bookings',
      icon: <CalendarCheck className="w-5 h-5" />,
    },
    {
      id: 'payments',
      label: 'Payment History',
      icon: <ReceiptText className="w-5 h-5" />,
    },
    {
      id: 'archive',
      label: 'Archive & History',
      icon: <Archive className="w-5 h-5" />,
    },
    {
      id: 'settings',
      label: 'Settings',
      icon: <Settings className="w-5 h-5" />,
    },
  ];

  const handleNavClick = (tab: NavigationTab) => {
    onSelectTab(tab);
    onCloseMobile();
  };

  const drawerContent = (
    <div className="flex flex-col h-full w-full bg-[#111722] text-slate-100 select-none border-r border-[#232E42]">
      {/* Warm Orange/Amber Header Gradient with Generous Breathing Room */}
      <div className="relative bg-gradient-to-br from-[#F59E0B] via-[#EA8C06] to-[#D97706] px-7 pt-9 pb-7 shadow-lg">
        <button
          type="button"
          onClick={onCloseMobile}
          aria-label="Close navigation drawer"
          className="lg:hidden absolute top-4 right-4 w-10 h-10 rounded-2xl bg-black/20 text-white flex items-center justify-center hover:bg-black/35 transition cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        <BrandLogo size="md" className="mb-4 shadow-xl" />
        <div className="text-2xl font-extrabold text-white tracking-tight leading-tight">
          4Rent
        </div>
        <div className="text-sm font-semibold text-amber-50/95 mt-1">
          Management System
        </div>
      </div>

      {/* Menu Links with Spacious Vertical Rhythm */}
      <nav className="flex-1 px-4 py-6 space-y-2 overflow-y-auto">
        {navItems.map((item) => {
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => handleNavClick(item.id)}
              className={`group w-full flex items-center gap-4 px-4 py-3.5 rounded-2xl text-[15px] font-semibold transition-all duration-300 cursor-pointer ${
                isActive
                  ? 'bg-amber-500/15 text-amber-400 border border-amber-500/35 shadow-[0_6px_20px_-6px_rgba(245,158,11,0.28)]'
                  : 'text-slate-200 hover:bg-[#1A2333] hover:text-white hover:translate-x-1 border border-transparent'
              }`}
            >
              <span
                className={`transition-transform duration-300 group-hover:scale-110 ${
                  isActive ? 'text-amber-400' : 'text-slate-400 group-hover:text-amber-400'
                }`}
              >
                {item.icon}
              </span>
              <span className="tracking-tight">{item.label}</span>
            </button>
          );
        })}

        {/* Landlord & Tenant Privacy Shield Quick Toggle */}
        {onTogglePrivacyMask && (
          <div className="pt-4 mt-4 border-t border-[#1F293B]">
            <button
              type="button"
              onClick={onTogglePrivacyMask}
              className={`w-full flex items-center justify-between gap-3 px-4 py-3.5 rounded-2xl text-xs font-bold transition-all duration-300 cursor-pointer border ${
                privacyMaskEnabled
                  ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/35 shadow-[0_6px_18px_-6px_rgba(16,185,129,0.25)]'
                  : 'bg-[#161E2E] text-slate-300 hover:bg-[#1D273B] border-[#253147]'
              }`}
              title="Mask sensitive tenant phone numbers & landlord revenue on screen"
            >
              <span className="flex items-center gap-3">
                {privacyMaskEnabled ? (
                  <EyeOff className="w-4 h-4 text-emerald-400 shrink-0" />
                ) : (
                  <Eye className="w-4 h-4 text-amber-400 shrink-0" />
                )}
                <span>Privacy Shield</span>
              </span>
              <span
                className={`px-2.5 py-0.5 rounded-full text-[10px] uppercase tracking-wider font-extrabold ${
                  privacyMaskEnabled
                    ? 'bg-emerald-500 text-slate-950'
                    : 'bg-[#0E131C] text-slate-400'
                }`}
              >
                {privacyMaskEnabled ? 'Masked' : 'Visible'}
              </span>
            </button>
          </div>
        )}

        <button
          type="button"
          onClick={() => {
            onCloseMobile();
            onLockApp();
          }}
          className="w-full flex items-center gap-4 px-4 py-3.5 rounded-2xl text-[15px] font-semibold text-slate-300 hover:bg-red-500/10 hover:text-red-400 transition-all duration-300 cursor-pointer mt-2"
        >
          <span className="text-slate-400">
            <LogOut className="w-5 h-5" />
          </span>
          <span>Lock / Exit App</span>
        </button>
      </nav>

      {/* Version & Developer Footer */}
      <div className="py-5 px-5 text-center text-xs font-medium text-slate-400 border-t border-[#1E2636] space-y-1 bg-[#0E131D]/60">
        <div className="inline-flex items-center gap-1.5 font-extrabold text-amber-400">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
          <span>4Rent v1.0.0</span>
        </div>
        <div className="text-[11px] text-slate-400">
          4Rent Management System • by splikaa
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Persistent Sidebar */}
      <aside className="hidden lg:block w-72 shrink-0 h-screen sticky top-0 z-30">
        {drawerContent}
      </aside>

      {/* Mobile Slide-Over Drawer */}
      {isOpenMobile && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-black/75 backdrop-blur-xs transition-opacity"
            onClick={onCloseMobile}
            aria-hidden="true"
          />
          <div className="relative w-[84%] max-w-[320px] h-full z-10 shadow-2xl animate-view-enter">
            {drawerContent}
          </div>
        </div>
      )}
    </>
  );
};
