import React, { useEffect, useRef, useState } from 'react';
import {
  AppSettings,
  BillRecord,
  NavigationTab,
  Room,
  RoomInquiryBooking,
  SecurityConfig,
  TenantHistoryEntry,
} from './types/rental';
import {
  createSampleDemoData,
  DEFAULT_SETTINGS,
  exportDatabaseSnapshot,
  importDatabaseSnapshot,
  loadBills,
  loadInquiries,
  loadRooms,
  loadSettings,
  loadTenantHistory,
  saveBills,
  saveInquiries,
  saveRooms,
  saveSettings,
  saveTenantHistory,
} from './services/storageService';
import { loadSnapshotFromIndexedDb } from './services/idbDatabase';
import {
  pullSnapshotFromCloud,
  pushSnapshotToCloud,
} from './services/supabaseSync';
import {
  applyPaymentWithOverpayment,
  clampDueDayOneToTen,
} from './utils/billingCalculator';
import { SecuritySetupScreen } from './components/security/SecuritySetupScreen';
import { LockScreen } from './components/security/LockScreen';
import { EnableRemindersModal } from './components/modals/EnableRemindersModal';
import { PinAuthModal } from './components/modals/PinAuthModal';
import { AdvanceBalanceModal } from './components/modals/AdvanceBalanceModal';
import { NavigationDrawer } from './components/layout/NavigationDrawer';
import { DashboardView } from './components/dashboard/DashboardView';
import { ManageRoomsView } from './components/rooms/ManageRoomsView';
import { RoomFormModal } from './components/rooms/RoomFormModal';
import { RoomDetailsModal } from './components/rooms/RoomDetailsModal';
import { InquiriesBookingsView } from './components/inquiries/InquiriesBookingsView';
import { AllPaymentsView } from './components/payments/AllPaymentsView';
import { ArchiveCenterView } from './components/archive/ArchiveCenterView';
import { SubMeterScannerModal } from './components/ocr/SubMeterScannerModal';
import { ReceiptModal } from './components/receipt/ReceiptModal';
import { SettingsView } from './components/settings/SettingsView';

export function App() {
  const [settings, setSettings] = useState<AppSettings>(() => loadSettings());
  const [rooms, setRooms] = useState<Room[]>(() => loadRooms());
  const [bills, setBills] = useState<BillRecord[]>(() => loadBills());
  const [inquiries, setInquiries] = useState<RoomInquiryBooking[]>(() =>
    loadInquiries()
  );
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
  const [selectedRoomDetailsId, setSelectedRoomDetailsId] = useState<
    string | null
  >(null);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [scannerTargetRoom, setScannerTargetRoom] = useState<Room | null>(null);
  const [activeReceiptBill, setActiveReceiptBill] = useState<BillRecord | null>(
    null
  );
  const [advanceModalRoomId, setAdvanceModalRoomId] = useState<string | null>(
    null
  );

  // PIN-Authenticated Room Deletion State
  const [roomPendingPinDelete, setRoomPendingPinDelete] = useState<Room | null>(
    null
  );

  // PWA Install Prompt Reference
  const deferredInstallPromptRef = useRef<any>(null);

  useEffect(() => {
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      deferredInstallPromptRef.current = e;
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    return () =>
      window.removeEventListener(
        'beforeinstallprompt',
        handleBeforeInstallPrompt
      );
  }, []);

  // Hydrate from Persistent IndexedDB if localStorage was cleared by an OS/browser update
  useEffect(() => {
    let mounted = true;
    loadSnapshotFromIndexedDb().then((idbSnap) => {
      if (!mounted || !idbSnap) return;
      const currentRooms = loadRooms();
      if (currentRooms.length === 0 && idbSnap.rooms?.length > 0) {
        importDatabaseSnapshot(idbSnap);
        setRooms(idbSnap.rooms);
        setBills(idbSnap.bills || []);
        setInquiries(idbSnap.inquiries || []);
        setTenantHistory(idbSnap.tenantHistory || []);
        if (idbSnap.settings) {
          setSettings(idbSnap.settings);
        }
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  // Automatic Desktop <-> Mobile Cloud Sync when window gains focus
  useEffect(() => {
    const syncFromCloudOnFocus = async () => {
      if (
        settings.cloudSync.enabled &&
        settings.cloudSync.supabaseUrl &&
        settings.cloudSync.supabaseAnonKey
      ) {
        const res = await pullSnapshotFromCloud(settings.cloudSync);
        if (res.ok && res.snapshot) {
          importDatabaseSnapshot(res.snapshot);
          setRooms(loadRooms());
          setBills(loadBills());
          setInquiries(loadInquiries());
          setTenantHistory(loadTenantHistory());
        }
      }
    };

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        syncFromCloudOnFocus();
      }
    };
    window.addEventListener('visibilitychange', handleVisibility);
    return () =>
      window.removeEventListener('visibilitychange', handleVisibility);
  }, [
    settings.cloudSync.enabled,
    settings.cloudSync.supabaseUrl,
    settings.cloudSync.supabaseAnonKey,
  ]);

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
    saveInquiries(inquiries);
  }, [inquiries]);

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

  const handleInstallDesktopApp = async () => {
    if (deferredInstallPromptRef.current) {
      try {
        deferredInstallPromptRef.current.prompt();
        await deferredInstallPromptRef.current.userChoice;
        deferredInstallPromptRef.current = null;
      } catch {
        // fallback handled by SettingsView .bat download
      }
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

  // Save Room (and if an occupied room is switched to vacant, automatically log tenant to Previous Tenant History!)
  const handleSaveRoom = (
    roomData: Omit<Room, 'id' | 'updatedAt'>,
    existingId?: string,
    vacatedReason?: string
  ) => {
    const nowIso = new Date().toISOString();
    if (existingId) {
      const prevRoom = rooms.find((r) => r.id === existingId);
      if (
        prevRoom &&
        prevRoom.status === 'occupied' &&
        prevRoom.tenant &&
        roomData.status === 'vacant'
      ) {
        const entry: TenantHistoryEntry = {
          id: `hist-${Date.now()}`,
          roomId: prevRoom.id,
          roomName: prevRoom.name,
          tenantName: prevRoom.tenant.fullName,
          phone: prevRoom.tenant.phone,
          messengerUsername: prevRoom.tenant.messengerUsername,
          moveInDate: prevRoom.tenant.moveInDate,
          moveOutDate: nowIso.slice(0, 10),
          reason: vacatedReason || 'Stopped Paying Rent / Vacated',
          finalMeterReading: roomData.lastMeterReading,
          depositHeld: prevRoom.securityDeposit,
          unpaidBalanceAtMoveOut: prevRoom.unpaidBalance,
        };
        setTenantHistory((prev) => [entry, ...prev]);
      }

      setRooms((prev) =>
        prev.map((r) =>
          r.id === existingId
            ? { ...roomData, id: existingId, updatedAt: nowIso }
            : r
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

  const handleConfirmDeleteRoomAfterPin = () => {
    if (!roomPendingPinDelete) return;
    const targetId = roomPendingPinDelete.id;
    setRooms((prev) => prev.filter((r) => r.id !== targetId));
    setRoomPendingPinDelete(null);
    triggerOptionalCloudSync();
  };

  const handleArchiveRoom = (roomId: string) => {
    setRooms((prev) =>
      prev.map((r) =>
        r.id === roomId
          ? {
              ...r,
              isArchived: true,
              archivedAt: new Date().toISOString(),
            }
          : r
      )
    );
    triggerOptionalCloudSync();
  };

  const handleRestoreRoom = (roomId: string) => {
    setRooms((prev) =>
      prev.map((r) =>
        r.id === roomId
          ? { ...r, isArchived: false, archivedAt: undefined }
          : r
      )
    );
    triggerOptionalCloudSync();
  };

  // Move out tenant -> Goes to Previous Tenant History AND preserves continuous kWh meter reading
  const handleMoveOutTenant = (room: Room, reason: string) => {
    if (!room.tenant) return;
    const entry: TenantHistoryEntry = {
      id: `hist-${Date.now()}`,
      roomId: room.id,
      roomName: room.name,
      tenantName: room.tenant.fullName,
      phone: room.tenant.phone,
      messengerUsername: room.tenant.messengerUsername,
      moveInDate: room.tenant.moveInDate,
      moveOutDate: new Date().toISOString().slice(0, 10),
      reason,
      finalMeterReading: room.lastMeterReading,
      depositHeld: room.securityDeposit,
      unpaidBalanceAtMoveOut: room.unpaidBalance,
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
              advanceRent: 0,
              // Note: lastMeterReading & securityDeposit requirement remain intact for the room!
              updatedAt: new Date().toISOString(),
            }
          : r
      )
    );
    triggerOptionalCloudSync();
  };

  // Generate Bill -> Enforces 1 Active Receipt per Room (archives previous receipts for this room)
  const handleGenerateBill = (
    newBill: BillRecord,
    updatedRoomLastReading: number,
    updatedRoomLastPhotoUrl: string,
    updatedRoomUnpaidBalance: number,
    overpaymentAddedToAdvance: number,
    advanceDeductedFromRoom: number
  ) => {
    setBills((prev) => {
      const archivedOlderForSameRoom = prev.map((b) =>
        b.roomId === newBill.roomId && !b.isArchived
          ? {
              ...b,
              isArchived: true,
              archivedAt: newBill.createdAt,
            }
          : b
      );
      return [newBill, ...archivedOlderForSameRoom];
    });

    setRooms((prev) =>
      prev.map((r) => {
        if (r.id !== newBill.roomId) return r;
        const currentAdv = r.advanceRent || 0;
        const nextAdv = Math.max(
          0,
          Math.round(
            (currentAdv -
              advanceDeductedFromRoom +
              overpaymentAddedToAdvance) *
              100
          ) / 100
        );

        const newAdvEntries = [...(r.advanceHistory || [])];
        if (advanceDeductedFromRoom > 0) {
          newAdvEntries.unshift({
            id: `adv-use-${Date.now()}`,
            type: 'applied_to_bill',
            amount: advanceDeductedFromRoom,
            createdAt: newBill.createdAt,
            note: `Applied to Receipt #${newBill.receiptNo}`,
          });
        }
        if (overpaymentAddedToAdvance > 0) {
          newAdvEntries.unshift({
            id: `adv-over-${Date.now()}`,
            type: 'overpayment_credit',
            amount: overpaymentAddedToAdvance,
            createdAt: newBill.createdAt,
            note: `Overpayment from Receipt #${newBill.receiptNo}`,
          });
        }

        return {
          ...r,
          lastMeterReading: updatedRoomLastReading,
          lastMeterPhotoDataUrl: updatedRoomLastPhotoUrl,
          lastReadingDate: newBill.createdAt,
          unpaidBalance: updatedRoomUnpaidBalance,
          advanceRent: nextAdv,
          advanceHistory: newAdvEntries,
          activeReceiptId: newBill.id,
          updatedAt: newBill.createdAt,
        };
      })
    );

    setActiveReceiptBill(newBill);
    triggerOptionalCloudSync();
  };

  // Record Payment -> Automatically credits any overpayment to the room's Withdrawable Advance Payment Balance
  const handleRecordPayment = (
    billId: string,
    amount: number,
    method: 'Cash' | 'GCash' | 'Maya' | 'Bank Transfer',
    referenceNo?: string
  ) => {
    let targetRoomId = '';
    let newRoomRemaining = 0;
    let overpaymentCredited = 0;
    let receiptNo = '';

    setBills((prev) =>
      prev.map((b) => {
        if (b.id !== billId) return b;
        const outcome = applyPaymentWithOverpayment(
          b,
          amount,
          method,
          referenceNo
        );
        targetRoomId = outcome.updatedBill.roomId;
        newRoomRemaining = outcome.updatedBill.remainingBalance;
        overpaymentCredited = outcome.overpaymentCredited;
        receiptNo = outcome.updatedBill.receiptNo;
        return outcome.updatedBill;
      })
    );

    if (targetRoomId) {
      setRooms((prev) =>
        prev.map((r) => {
          if (r.id !== targetRoomId) return r;
          const nextAdv =
            Math.round(((r.advanceRent || 0) + overpaymentCredited) * 100) /
            100;
          const nextHistory =
            overpaymentCredited > 0
              ? [
                  {
                    id: `adv-${Date.now()}`,
                    type: 'overpayment_credit' as const,
                    amount: overpaymentCredited,
                    createdAt: new Date().toISOString(),
                    note: `Excess payment from Receipt #${receiptNo} credited to Advance Balance`,
                  },
                  ...(r.advanceHistory || []),
                ]
              : r.advanceHistory;

          return {
            ...r,
            unpaidBalance: newRoomRemaining,
            advanceRent: nextAdv,
            advanceHistory: nextHistory,
            updatedAt: new Date().toISOString(),
          };
        })
      );
    }
    triggerOptionalCloudSync();
  };

  // Advance Balance Withdraw / Add / Apply Handlers
  const handleWithdrawAdvance = (
    roomId: string,
    amount: number,
    note: string
  ) => {
    const nowIso = new Date().toISOString();
    setRooms((prev) =>
      prev.map((r) => {
        if (r.id !== roomId) return r;
        const nextAdv = Math.max(
          0,
          Math.round(((r.advanceRent || 0) - amount) * 100) / 100
        );
        return {
          ...r,
          advanceRent: nextAdv,
          advanceHistory: [
            {
              id: `adv-w-${Date.now()}`,
              type: 'withdrawal',
              amount,
              createdAt: nowIso,
              note,
            },
            ...(r.advanceHistory || []),
          ],
          updatedAt: nowIso,
        };
      })
    );
    triggerOptionalCloudSync();
  };

  const handleAddAdvanceDeposit = (
    roomId: string,
    amount: number,
    note: string
  ) => {
    const nowIso = new Date().toISOString();
    setRooms((prev) =>
      prev.map((r) => {
        if (r.id !== roomId) return r;
        const nextAdv =
          Math.round(((r.advanceRent || 0) + amount) * 100) / 100;
        return {
          ...r,
          advanceRent: nextAdv,
          advanceHistory: [
            {
              id: `adv-d-${Date.now()}`,
              type: 'manual_deposit',
              amount,
              createdAt: nowIso,
              note,
            },
            ...(r.advanceHistory || []),
          ],
          updatedAt: nowIso,
        };
      })
    );
    triggerOptionalCloudSync();
  };

  const handleApplyAdvanceToUnpaid = (roomId: string, amount: number) => {
    const nowIso = new Date().toISOString();
    setRooms((prev) =>
      prev.map((r) => {
        if (r.id !== roomId) return r;
        const nextAdv = Math.max(
          0,
          Math.round(((r.advanceRent || 0) - amount) * 100) / 100
        );
        const nextUnpaid = Math.max(
          0,
          Math.round(((r.unpaidBalance || 0) - amount) * 100) / 100
        );
        return {
          ...r,
          advanceRent: nextAdv,
          unpaidBalance: nextUnpaid,
          advanceHistory: [
            {
              id: `adv-a-${Date.now()}`,
              type: 'applied_to_bill',
              amount,
              createdAt: nowIso,
              note: 'Applied Advance Balance toward room unpaid balance',
            },
            ...(r.advanceHistory || []),
          ],
          updatedAt: nowIso,
        };
      })
    );
    triggerOptionalCloudSync();
  };

  // Inquiries & Room Bookings Handlers
  const handleCreateInquiry = (
    data: Omit<RoomInquiryBooking, 'id' | 'createdAt'>
  ) => {
    const newInq: RoomInquiryBooking = {
      ...data,
      id: `inq-${Date.now()}`,
      createdAt: new Date().toISOString(),
    };
    setInquiries((prev) => [newInq, ...prev]);
    triggerOptionalCloudSync();
  };

  const handleApproveBookingMoveIn = (inquiry: RoomInquiryBooking) => {
    const nowIso = new Date().toISOString();
    const targetRoom = rooms.find((r) => r.id === inquiry.roomId);

    // If room had a previous tenant, archive them to Previous Tenant History first
    if (targetRoom && targetRoom.status === 'occupied' && targetRoom.tenant) {
      const entry: TenantHistoryEntry = {
        id: `hist-${Date.now()}`,
        roomId: targetRoom.id,
        roomName: targetRoom.name,
        tenantName: targetRoom.tenant.fullName,
        phone: targetRoom.tenant.phone,
        messengerUsername: targetRoom.tenant.messengerUsername,
        moveInDate: targetRoom.tenant.moveInDate,
        moveOutDate: nowIso.slice(0, 10),
        reason: 'Replaced by New Booked Tenant',
        finalMeterReading: targetRoom.lastMeterReading,
        depositHeld: targetRoom.securityDeposit,
        unpaidBalanceAtMoveOut: targetRoom.unpaidBalance,
      };
      setTenantHistory((prev) => [entry, ...prev]);
    }

    setRooms((prev) =>
      prev.map((r) => {
        if (r.id !== inquiry.roomId) return r;
        const reqDep = r.securityDeposit || settings.defaultMonthlyRent;
        const excessAdvance =
          inquiry.reservationFee > reqDep
            ? Math.round((inquiry.reservationFee - reqDep) * 100) / 100
            : inquiry.reservationFee;

        const moveInDay = clampDueDayOneToTen(
          new Date(inquiry.targetMoveInDate).getDate() || 5
        );

        return {
          ...r,
          status: 'occupied',
          securityDeposit: reqDep,
          advanceRent:
            Math.round(((r.advanceRent || 0) + excessAdvance) * 100) / 100,
          // Continuous kWh reading is strictly preserved!
          tenant: {
            id: `ten-${Date.now()}`,
            fullName: inquiry.prospectName,
            phone: inquiry.phone,
            messengerUsername: inquiry.messengerUsername,
            moveInDate: inquiry.targetMoveInDate,
            dueDayOfMonth: moveInDay,
          },
          updatedAt: nowIso,
        };
      })
    );

    setInquiries((prev) =>
      prev.map((i) =>
        i.id === inquiry.id ? { ...i, status: 'converted' } : i
      )
    );
    setActiveTab('rooms');
    triggerOptionalCloudSync();
  };

  const handleArchiveBill = (billId: string) => {
    setBills((prev) =>
      prev.map((b) =>
        b.id === billId
          ? { ...b, isArchived: true, archivedAt: new Date().toISOString() }
          : b
      )
    );
    triggerOptionalCloudSync();
  };

  const handleRestoreBill = (billId: string) => {
    setBills((prev) =>
      prev.map((b) =>
        b.id === billId
          ? { ...b, isArchived: false, archivedAt: undefined }
          : b
      )
    );
    triggerOptionalCloudSync();
  };

  const handleLoadSampleData = () => {
    const demo = createSampleDemoData(settings.defaultElectricRate);
    setRooms(demo.rooms);
    setBills(demo.bills);
    setInquiries(demo.inquiries);
    setTenantHistory(demo.history);
    triggerOptionalCloudSync();
  };

  const handleResetAllData = () => {
    setRooms([]);
    setBills([]);
    setInquiries([]);
    setTenantHistory([]);
    setSettings({
      ...DEFAULT_SETTINGS,
      security: {
        isSetupComplete: true,
        lockEnabled: false,
        authMethod: 'none',
        pinCode: settings.security.pinCode || '1234',
      },
      remindersPromptShown: true,
    });
    setActiveTab('dashboard');
  };

  const handleReloadAllData = () => {
    setRooms(loadRooms());
    setBills(loadBills());
    setInquiries(loadInquiries());
    setTenantHistory(loadTenantHistory());
    setSettings(loadSettings());
  };

  // Whenever global Electric Rate is updated in Settings, reflect it across active unpaid bills
  const handleUpdateSettings = (nextSettings: AppSettings) => {
    const rateChanged =
      nextSettings.defaultElectricRate !== settings.defaultElectricRate;
    setSettings(nextSettings);

    if (rateChanged) {
      const newRate = nextSettings.defaultElectricRate;
      setBills((prev) =>
        prev.map((b) => {
          if (b.status === 'paid' || b.isArchived) return b;
          const newElecTotal =
            Math.round(b.consumptionKwh * newRate * 100) / 100;
          const newTotalDue = Math.max(
            0,
            Math.round(
              (b.baseRent +
                newElecTotal +
                b.previousBalanceCarryOver -
                b.depositApplied) *
                100
            ) / 100
          );
          const newRemaining = Math.max(
            0,
            Math.round((newTotalDue - b.amountPaid) * 100) / 100
          );
          return {
            ...b,
            electricRate: newRate,
            electricTotal: newElecTotal,
            totalAmountDue: newTotalDue,
            remainingBalance: newRemaining,
          };
        })
      );
    }
    triggerOptionalCloudSync();
  };

  const handleOpenScanForRoom = (room?: Room) => {
    const activeRooms = rooms.filter((r) => !r.isArchived);
    if (activeRooms.length === 0) {
      setEditingRoom(null);
      setIsRoomModalOpen(true);
      return;
    }
    setScannerTargetRoom(room || activeRooms[0]);
    setIsScannerOpen(true);
  };

  const activeAdvanceModalRoom =
    rooms.find((r) => r.id === advanceModalRoomId) || null;

  const selectedRoomForDetails =
    rooms.find((r) => r.id === selectedRoomDetailsId) || null;

  // 1. Setup Security Screen
  if (showSecuritySetup) {
    return <SecuritySetupScreen onComplete={handleCompleteSecuritySetup} />;
  }

  // 2. Lock Screen
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
      <NavigationDrawer
        activeTab={activeTab}
        isOpenMobile={isDrawerOpen}
        onCloseMobile={() => setIsDrawerOpen(false)}
        onSelectTab={(tab) => setActiveTab(tab)}
        onLockApp={() => setIsLocked(true)}
        onLoadSampleData={handleLoadSampleData}
        hasRooms={rooms.filter((r) => !r.isArchived).length > 0}
      />

      <main className="flex-1 min-w-0">
        {activeTab === 'dashboard' && (
          <DashboardView
            rooms={rooms}
            bills={bills}
            inquiries={inquiries}
            globalElectricRate={settings.defaultElectricRate}
            onOpenDrawer={() => setIsDrawerOpen(true)}
            onNavigate={(tab) => setActiveTab(tab)}
            onOpenAddRoom={() => {
              setEditingRoom(null);
              setIsRoomModalOpen(true);
            }}
            onOpenScanMeter={(room) => handleOpenScanForRoom(room)}
            onSelectBillForReceipt={(bill) => setActiveReceiptBill(bill)}
            onOpenAdvanceBalanceModal={(room) =>
              setAdvanceModalRoomId(room.id)
            }
            onSelectRoomDetails={(room) => setSelectedRoomDetailsId(room.id)}
            onLoadSampleData={handleLoadSampleData}
          />
        )}

        {activeTab === 'rooms' && (
          <ManageRoomsView
            rooms={rooms}
            bills={bills}
            globalElectricRate={settings.defaultElectricRate}
            onBack={() => setActiveTab('dashboard')}
            onOpenAddRoom={() => {
              setEditingRoom(null);
              setIsRoomModalOpen(true);
            }}
            onOpenEditRoom={(room) => {
              setEditingRoom(room);
              setIsRoomModalOpen(true);
            }}
            onRequestDeleteRoomWithPin={(room) =>
              setRoomPendingPinDelete(room)
            }
            onArchiveRoom={handleArchiveRoom}
            onMoveOutTenant={handleMoveOutTenant}
            onOpenScanMeter={(room) => handleOpenScanForRoom(room)}
            onOpenRoomReceipt={(bill) => setActiveReceiptBill(bill)}
            onOpenAdvanceBalanceModal={(room) =>
              setAdvanceModalRoomId(room.id)
            }
            onSelectRoomDetails={(room) => setSelectedRoomDetailsId(room.id)}
            onOpenArchiveCenter={() => setActiveTab('archive')}
          />
        )}

        {activeTab === 'inquiries' && (
          <InquiriesBookingsView
            rooms={rooms}
            inquiries={inquiries}
            defaultDeposit={settings.defaultMonthlyRent}
            onBack={() => setActiveTab('dashboard')}
            onCreateInquiry={handleCreateInquiry}
            onApproveBookingMoveIn={handleApproveBookingMoveIn}
            onDeleteInquiry={(id) =>
              setInquiries((prev) => prev.filter((i) => i.id !== id))
            }
          />
        )}

        {activeTab === 'payments' && (
          <AllPaymentsView
            bills={bills}
            onBack={() => setActiveTab('dashboard')}
            onSelectBillForReceipt={(bill) => setActiveReceiptBill(bill)}
            onRecordPayment={handleRecordPayment}
            onArchiveBill={handleArchiveBill}
            onOpenNewBillScanner={() => handleOpenScanForRoom()}
            onOpenArchiveCenter={() => setActiveTab('archive')}
          />
        )}

        {activeTab === 'archive' && (
          <ArchiveCenterView
            archivedRooms={rooms.filter((r) => r.isArchived)}
            archivedBills={bills.filter((b) => b.isArchived)}
            tenantHistory={tenantHistory}
            onBack={() => setActiveTab('dashboard')}
            onRestoreRoom={handleRestoreRoom}
            onRequestPermanentDeleteRoom={(room) =>
              setRoomPendingPinDelete(room)
            }
            onRestoreBill={handleRestoreBill}
            onSelectBillForReceipt={(bill) => setActiveReceiptBill(bill)}
            onDeleteHistoryEntry={(id) =>
              setTenantHistory((prev) => prev.filter((h) => h.id !== id))
            }
          />
        )}

        {activeTab === 'settings' && (
          <SettingsView
            settings={settings}
            onBack={() => setActiveTab('dashboard')}
            onUpdateSettings={handleUpdateSettings}
            onReloadAllData={handleReloadAllData}
            onLoadSampleData={handleLoadSampleData}
            onResetAllData={handleResetAllData}
            onOpenSecuritySetup={() => setShowSecuritySetup(true)}
            onInstallDesktopApp={handleInstallDesktopApp}
          />
        )}
      </main>

      {/* Enable Reminders Modal */}
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
        globalElectricRate={settings.defaultElectricRate}
        onClose={() => {
          setIsRoomModalOpen(false);
          setEditingRoom(null);
        }}
        onSave={handleSaveRoom}
      />

      {/* Clickable Room Details & Previous Transactions Modal */}
      <RoomDetailsModal
        room={selectedRoomForDetails}
        activeBill={
          selectedRoomForDetails
            ? bills.find(
                (b) =>
                  b.id === selectedRoomForDetails.activeReceiptId ||
                  (b.roomId === selectedRoomForDetails.id && !b.isArchived)
              ) || null
            : null
        }
        roomBills={
          selectedRoomForDetails
            ? bills.filter((b) => b.roomId === selectedRoomForDetails.id)
            : []
        }
        previousTenants={
          selectedRoomForDetails
            ? tenantHistory.filter(
                (h) => h.roomId === selectedRoomForDetails.id
              )
            : []
        }
        globalElectricRate={settings.defaultElectricRate}
        onClose={() => setSelectedRoomDetailsId(null)}
        onEditRoom={(room) => {
          setEditingRoom(room);
          setIsRoomModalOpen(true);
        }}
        onOpenScannerForRoom={(room) => handleOpenScanForRoom(room)}
        onOpenReceipt={(bill) => setActiveReceiptBill(bill)}
        onOpenAdvanceModal={(room) => setAdvanceModalRoomId(room.id)}
      />

      {/* Dual Sub-Meter OCR Scanner & Bill Generator Modal */}
      <SubMeterScannerModal
        isOpen={isScannerOpen}
        rooms={rooms}
        initialRoom={scannerTargetRoom}
        globalElectricRate={settings.defaultElectricRate}
        onClose={() => setIsScannerOpen(false)}
        onGenerateBill={handleGenerateBill}
      />

      {/* Printable Receipt & Messenger Integration Modal */}
      <ReceiptModal
        bill={activeReceiptBill}
        settings={settings}
        onClose={() => setActiveReceiptBill(null)}
      />

      {/* Withdrawable Advance Balance Manager Modal */}
      <AdvanceBalanceModal
        room={activeAdvanceModalRoom}
        onClose={() => setAdvanceModalRoomId(null)}
        onWithdrawAdvance={handleWithdrawAdvance}
        onAddAdvanceDeposit={handleAddAdvanceDeposit}
        onApplyAdvanceToUnpaid={handleApplyAdvanceToUnpaid}
      />

      {/* PIN Authentication Modal for Removing a Room */}
      <PinAuthModal
        isOpen={Boolean(roomPendingPinDelete)}
        title={`Remove ${roomPendingPinDelete?.name || 'Room'}?`}
        description="Removing a room requires your 4-digit security PIN."
        security={settings.security}
        onClose={() => setRoomPendingPinDelete(null)}
        onAuthorized={handleConfirmDeleteRoomAfterPin}
      />
    </div>
  );
}
export default App;
