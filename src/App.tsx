import React, { useEffect, useState } from 'react';
import {
  AppSettings,
  BillRecord,
  NavigationTab,
  Room,
  SecurityConfig,
  TenantHistoryEntry,
} from './types/rental';
import {
  createSampleDemoData,
  DEFAULT_SETTINGS,
  exportDatabaseSnapshot,
  loadBills,
  loadRooms,
  loadSettings,
  loadTenantHistory,
  saveBills,
  saveRooms,
  saveSettings,
  saveTenantHistory,
} from './services/storageService';
import { pushSnapshotToCloud } from './services/supabaseSync';
import { applyPaymentToBill } from './utils/billingCalculator';
import { SecuritySetupScreen } from './components/security/SecuritySetupScreen';
import { LockScreen } from './components/security/LockScreen';
import { EnableRemindersModal } from './components/modals/EnableRemindersModal';
import { NavigationDrawer } from './components/layout/NavigationDrawer';
import { DashboardView } from './components/dashboard/DashboardView';
import { ManageRoomsView } from './components/rooms/ManageRoomsView';
import { RoomFormModal } from './components/rooms/RoomFormModal';
import { AllPaymentsView } from './components/payments/AllPaymentsView';
import { SubMeterScannerModal } from './components/ocr/SubMeterScannerModal';
import { ReceiptModal } from './components/receipt/ReceiptModal';
import { SettingsView } from './components/settings/SettingsView';

export function App() {
  const [settings, setSettings] = useState<AppSettings>(() => loadSettings());
  const [rooms, setRooms] = useState<Room[]>(() => loadRooms());
  const [bills, setBills] = useState<BillRecord[]>(() => loadBills());
  const [tenantHistory, setTenantHistory] = useState<TenantHistoryEntry[]>(() =>
    loadTenantHistory()
  );

  const [activeTab, setActiveTab] = useState<NavigationTab>('dashboard');
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isLocked, setIsLocked] = useState<boolean>(
    () => loadSettings().security.lockEnabled
  );
  const [showSecuritySetup, setShowSecuritySetup] = useState<boolean>(
    () => !loadSettings().security.isSetupComplete
  );

  // Modals
  const [isRoomModalOpen, setIsRoomModalOpen] = useState(false);
  const [editingRoom, setEditingRoom] = useState<Room | null>(null);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [scannerTargetRoom, setScannerTargetRoom] = useState<Room | null>(null);
  const [activeReceiptBill, setActiveReceiptBill] = useState<BillRecord | null>(
    null
  );

  // Save state changes to localStorage & trigger optional background cloud sync
  useEffect(() => {
    saveSettings(settings);
  }, [settings]);

  useEffect(() => {
    saveRooms(rooms);
  }, [rooms]);

  useEffect(() => {
    saveBills(bills);
  }, [bills]);

  useEffect(() => {
    saveTenantHistory(tenantHistory);
  }, [tenantHistory]);

  const triggerOptionalCloudSync = () => {
    if (
      settings.cloudSync.enabled &&
      settings.cloudSync.supabaseUrl &&
      settings.cloudSync.supabaseAnonKey
    ) {
      setTimeout(() => {
        pushSnapshotToCloud(settings.cloudSync, exportDatabaseSnapshot());
      }, 200);
    }
  };

  const handleCompleteSecuritySetup = (secConfig: SecurityConfig) => {
    const updated: AppSettings = {
      ...settings,
      security: secConfig,
    };
    setSettings(updated);
    setShowSecuritySetup(false);
    setIsLocked(false);
  };

  const handleAllowReminders = async () => {
    if ('Notification' in window && Notification.permission === 'default') {
      try {
        await Notification.requestPermission();
      } catch {
        // ignore browser permission prompt error
      }
    }
    setSettings((prev) => ({
      ...prev,
      remindersPromptShown: true,
      remindersEnabled: true,
    }));
  };

  const handleDenyReminders = () => {
    setSettings((prev) => ({
      ...prev,
      remindersPromptShown: true,
      remindersEnabled: false,
    }));
  };

  const handleSaveRoom = (
    roomData: Omit<Room, 'id' | 'updatedAt'>,
    existingId?: string
  ) => {
    const nowIso = new Date().toISOString();
    if (existingId) {
      setRooms((prev) =>
        prev.map((r) =>
          r.id === existingId ? { ...roomData, id: existingId, updatedAt: nowIso } : r
        )
      );
    } else {
      const newRoom: Room = {
        ...roomData,
        id: `room-${Date.now()}`,
        updatedAt: nowIso,
      };
      setRooms((prev) => [...prev, newRoom]);
    }
    triggerOptionalCloudSync();
  };

  const handleDeleteRoom = (roomId: string) => {
    setRooms((prev) => prev.filter((r) => r.id !== roomId));
    triggerOptionalCloudSync();
  };

  const handleMoveOutTenant = (room: Room) => {
    if (!room.tenant) return;
    const entry: TenantHistoryEntry = {
      id: `hist-${Date.now()}`,
      roomId: room.id,
      roomName: room.name,
      tenantName: room.tenant.fullName,
      phone: room.tenant.phone,
      moveInDate: room.tenant.moveInDate,
      moveOutDate: new Date().toISOString().slice(0, 10),
      finalMeterReading: room.lastMeterReading,
      notes: room.tenant.notes,
    };
    setTenantHistory((prev) => [entry, ...prev]);
    setRooms((prev) =>
      prev.map((r) =>
        r.id === room.id
          ? {
              ...r,
              status: 'vacant',
              tenant: undefined,
              unpaidBalance: 0,
              securityDeposit: 0,
              advanceRent: 0,
              updatedAt: new Date().toISOString(),
            }
          : r
      )
    );
    triggerOptionalCloudSync();
  };

  const handleGenerateBill = (
    newBill: BillRecord,
    updatedRoomLastReading: number,
    updatedRoomUnpaidBalance: number
  ) => {
    setBills((prev) => [newBill, ...prev]);
    setRooms((prev) =>
      prev.map((r) =>
        r.id === newBill.roomId
          ? {
              ...r,
              lastMeterReading: updatedRoomLastReading,
              lastReadingDate: newBill.createdAt,
              unpaidBalance: updatedRoomUnpaidBalance,
              updatedAt: newBill.createdAt,
            }
          : r
      )
    );
    setActiveReceiptBill(newBill);
    triggerOptionalCloudSync();
  };

  const handleRecordPayment = (
    billId: string,
    amount: number,
    method: 'Cash' | 'GCash' | 'Maya' | 'Bank Transfer',
    referenceNo?: string
  ) => {
    let targetRoomId = '';
    let newRoomRemaining = 0;

    setBills((prev) =>
      prev.map((b) => {
        if (b.id !== billId) return b;
        const updated = applyPaymentToBill(b, amount, method, referenceNo);
        targetRoomId = updated.roomId;
        newRoomRemaining = updated.remainingBalance;
        return updated;
      })
    );

    if (targetRoomId) {
      setRooms((prev) =>
        prev.map((r) =>
          r.id === targetRoomId
            ? {
                ...r,
                unpaidBalance: newRoomRemaining,
                updatedAt: new Date().toISOString(),
              }
            : r
        )
      );
    }
    triggerOptionalCloudSync();
  };

  const handleDeleteBill = (billId: string) => {
    setBills((prev) => prev.filter((b) => b.id !== billId));
    triggerOptionalCloudSync();
  };

  const handleLoadSampleData = () => {
    const demo = createSampleDemoData();
    setRooms(demo.rooms);
    setBills(demo.bills);
    setTenantHistory(demo.history);
    triggerOptionalCloudSync();
  };

  const handleResetAllData = () => {
    setRooms([]);
    setBills([]);
    setTenantHistory([]);
    setSettings({
      ...DEFAULT_SETTINGS,
      security: {
        isSetupComplete: true,
        lockEnabled: false,
        authMethod: 'none',
      },
      remindersPromptShown: true,
    });
    setActiveTab('dashboard');
  };

  const handleReloadAllData = () => {
    setRooms(loadRooms());
    setBills(loadBills());
    setTenantHistory(loadTenantHistory());
    setSettings(loadSettings());
  };

  const handleOpenScanForRoom = (room?: Room) => {
    if (rooms.length === 0) {
      setEditingRoom(null);
      setIsRoomModalOpen(true);
      return;
    }
    setScannerTargetRoom(room || rooms[0]);
    setIsScannerOpen(true);
  };

  // 1. Setup Security Screen (Screenshot 1)
  if (showSecuritySetup) {
    return <SecuritySetupScreen onComplete={handleCompleteSecuritySetup} />;
  }

  // 2. Lock Screen (PIN or Biometric Fingerprint)
  if (isLocked) {
    return (
      <LockScreen
        security={settings.security}
        onUnlock={() => setIsLocked(false)}
      />
    );
  }

  // 3. Main Adaptive Application Shell
  return (
    <div className="min-h-screen w-full bg-[#0B0E14] text-slate-100 flex">
      {/* Navigation Drawer (Mobile Slide-Out / Desktop Persistent Sidebar — Screenshot 2) */}
      <NavigationDrawer
        activeTab={activeTab}
        isOpenMobile={isDrawerOpen}
        onCloseMobile={() => setIsDrawerOpen(false)}
        onSelectTab={(tab) => setActiveTab(tab)}
        onLockApp={() => setIsLocked(true)}
        onLoadSampleData={handleLoadSampleData}
        hasRooms={rooms.length > 0}
      />

      {/* Primary View Content */}
      <main className="flex-1 min-w-0">
        {activeTab === 'dashboard' && (
          <DashboardView
            rooms={rooms}
            bills={bills}
            onOpenDrawer={() => setIsDrawerOpen(true)}
            onNavigate={(tab) => setActiveTab(tab)}
            onOpenAddRoom={() => {
              setEditingRoom(null);
              setIsRoomModalOpen(true);
            }}
            onOpenScanMeter={(room) => handleOpenScanForRoom(room)}
            onSelectBillForReceipt={(bill) => setActiveReceiptBill(bill)}
            onLoadSampleData={handleLoadSampleData}
          />
        )}

        {activeTab === 'rooms' && (
          <ManageRoomsView
            rooms={rooms}
            tenantHistory={tenantHistory}
            onBack={() => setActiveTab('dashboard')}
            onOpenAddRoom={() => {
              setEditingRoom(null);
              setIsRoomModalOpen(true);
            }}
            onOpenEditRoom={(room) => {
              setEditingRoom(room);
              setIsRoomModalOpen(true);
            }}
            onDeleteRoom={handleDeleteRoom}
            onMoveOutTenant={handleMoveOutTenant}
            onOpenScanMeter={(room) => handleOpenScanForRoom(room)}
          />
        )}

        {activeTab === 'payments' && (
          <AllPaymentsView
            bills={bills}
            onBack={() => setActiveTab('dashboard')}
            onSelectBillForReceipt={(bill) => setActiveReceiptBill(bill)}
            onRecordPayment={handleRecordPayment}
            onDeleteBill={handleDeleteBill}
            onOpenNewBillScanner={() => handleOpenScanForRoom()}
          />
        )}

        {activeTab === 'settings' && (
          <SettingsView
            settings={settings}
            onBack={() => setActiveTab('dashboard')}
            onUpdateSettings={(next) => setSettings(next)}
            onReloadAllData={handleReloadAllData}
            onLoadSampleData={handleLoadSampleData}
            onResetAllData={handleResetAllData}
            onOpenSecuritySetup={() => setShowSecuritySetup(true)}
          />
        )}
      </main>

      {/* Enable Reminders Modal (Screenshot 3) */}
      <EnableRemindersModal
        isOpen={!settings.remindersPromptShown && activeTab === 'dashboard'}
        onAllow={handleAllowReminders}
        onDeny={handleDenyReminders}
      />

      {/* Room Add / Edit Modal */}
      <RoomFormModal
        isOpen={isRoomModalOpen}
        initialRoom={editingRoom}
        defaultRent={settings.defaultMonthlyRent}
        defaultElectricRate={settings.defaultElectricRate}
        onClose={() => {
          setIsRoomModalOpen(false);
          setEditingRoom(null);
        }}
        onSave={handleSaveRoom}
      />

      {/* OCR Sub-Meter Scanner & Bill Generator Modal */}
      <SubMeterScannerModal
        isOpen={isScannerOpen}
        rooms={rooms}
        initialRoom={scannerTargetRoom}
        onClose={() => setIsScannerOpen(false)}
        onGenerateBill={handleGenerateBill}
      />

      {/* Printable Receipt & Messenger Integration Modal */}
      <ReceiptModal
        bill={activeReceiptBill}
        settings={settings}
        onClose={() => setActiveReceiptBill(null)}
      />
    </div>
  );
}
export default App;

