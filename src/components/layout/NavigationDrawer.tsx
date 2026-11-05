import React from 'react';
import {
  Archive,
  CalendarCheck,
  DoorOpen,
  LayoutGrid,
  LogOut,
  ReceiptText,
  Settings,
  Sparkles,
  X,
} from 'lucide-react';
import { BrandLogo } from '../BrandLogo';
import { NavigationTab } from '../../types/rental';

interface NavigationDrawerProps {
  activeTab: NavigationTab;
  isOpenMobile: boolean;
  onCloseMobile: () => void;
  onSelectTab: (tab: NavigationTab) => void;
  onLockApp: () => void;
  onLoadSampleData?: () => void;
  hasRooms: boolean;
}

export const NavigationDrawer: React.FC<NavigationDrawerProps> = ({
  activeTab,
  isOpenMobile,
  onCloseMobile,
  onSelectTab,
  onLockApp,
  onLoadSampleData,
  hasRooms,
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
    <div className="flex flex-col h-full w-full bg-[#141923] text-slate-100 select-none border-r border-[#222B3C]">
      {/* Warm Orange/Amber Header Gradient (Matches Screenshot 2) */}
      <div className="relative bg-gradient-to-br from-[#F59E0B] via-[#EA8C06] to-[#D97706] px-6 pt-9 pb-6 shadow-md">
        <button
          type="button"
          onClick={onCloseMobile}
          aria-label="Close navigation drawer"
          className="lg:hidden absolute top-4 right-4 w-9 h-9 rounded-xl bg-black/20 text-white flex items-center justify-center hover:bg-black/30 transition cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        <BrandLogo size="md" className="mb-3.5 shadow-xl" />
        <div className="text-2xl font-extrabold text-white tracking-tight">
          4Rent
        </div>
        <div className="text-sm font-medium text-amber-100/90 mt-0.5">
          Rooms Management
        </div>
      </div>

      {/* Menu Links */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => handleNavClick(item.id)}
              className={`w-full flex items-center gap-4 px-4 py-3 rounded-xl text-[15px] font-semibold transition cursor-pointer ${
                isActive
                  ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                  : 'text-slate-200 hover:bg-[#1D2535] hover:text-white'
              }`}
            >
              <span className={isActive ? 'text-amber-400' : 'text-slate-400'}>
                {item.icon}
              </span>
              <span>{item.label}</span>
            </button>
          );
        })}

        <button
          type="button"
          onClick={() => {
            onCloseMobile();
            onLockApp();
          }}
          className="w-full flex items-center gap-4 px-4 py-3 rounded-xl text-[15px] font-semibold text-slate-200 hover:bg-red-500/10 hover:text-red-400 transition cursor-pointer mt-2"
        >
          <span className="text-slate-400">
            <LogOut className="w-5 h-5" />
          </span>
          <span>Exit App</span>
        </button>

        {!hasRooms && onLoadSampleData && (
          <div className="pt-4 px-2">
            <div className="rounded-2xl bg-amber-500/10 border border-amber-500/25 p-3.5">
              <p className="text-xs text-amber-200/90 font-medium leading-relaxed">
                Want to explore 4Rent with sample apartments, dual sub-meter
                proofs & bookings?
              </p>
              <button
                type="button"
                onClick={() => {
                  onLoadSampleData();
                  onCloseMobile();
                }}
                className="mt-2.5 w-full py-2 px-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5" />
                Load Demo Rooms & Bills
              </button>
            </div>
          </div>
        )}
      </nav>

      {/* Version & Developer Footer */}
      <div className="py-4 px-3 text-center text-xs font-medium text-slate-400 border-t border-[#1E2636] space-y-0.5">
        <div className="font-bold text-amber-400">4Rent v1.2.0</div>
        <div className="text-[11px] text-slate-500">Developed by splikaa</div>
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
            className="fixed inset-0 bg-black/70 backdrop-blur-xs transition-opacity"
            onClick={onCloseMobile}
            aria-hidden="true"
          />
          <div className="relative w-[82%] max-w-[310px] h-full z-10 shadow-2xl">
            {drawerContent}
          </div>
        </div>
      )}
    </>
  );
};
