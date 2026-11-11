import React, { useEffect, useRef, useState } from 'react';
import {
  AdvanceBalanceTransaction,
  AppSettings,
  BillRecord,
  NavigationTab,
  Room,
  RoomInquiryBooking,
  SecurityConfig,
  TenantHistoryEntry,
} from './types/rental';
import {
  appendAuditLog,
  exportDatabaseSnapshot,
  importDatabaseSnapshot,
  isAppHydrated,
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
  appendReadingLog,
  setAppHydrated,
  subscribeToLocalCrossWindowSync,
} from './services/storageService';
import { loadSnapshotFromIndexedDb } from './services/idbDatabase';
import {
  isCloudConfigured,
  pullSnapshotFromCloud,
  pushSnapshotToCloud,
  subscribeToRealtimeSync,
} from './services/firebaseSync';
import {
  applyPaymentWithOverpayment,
  clampDueDayOneToTen,
  isRunningInDesktopApp,
  isRunningInMobileApp,
  isStandaloneApp,
} from './utils/billingCalculator';
import { requestAndVerifyNotifications } from './services/ocrService';
import { SecuritySetupScreen } from './components/security/SecuritySetupScreen';
import { LockScreen } from './components/security/LockScreen';
import { LoadingSplashScreen } from './components/common/LoadingSplashScreen';
import {
  FeedbackNotification,
  FeedbackToastBar,
  FeedbackVariant,
} from './components/common/FeedbackToastBar';
import { EasyWalkthroughModal } from './components/common/EasyWalkthroughModal';
import { EnableRemindersModal } from './components/modals/EnableRemindersModal';
import { PinAuthModal } from './components/modals/PinAuthModal';
import { AdvanceBalanceModal } from './components/modals/AdvanceBalanceModal';
import { OccupiedArchiveGuardModal } from './components/modals/OccupiedArchiveGuardModal';
import { NavigationDrawer } from './components/layout/NavigationDrawer';
import { MobileBottomNav } from './components/layout/MobileBottomNav';
import { DashboardView } from './components/dashboard/DashboardView';
import { ManageRoomsView } from './components/rooms/ManageRoomsView';
import { RoomFormModal } from './components/rooms/RoomFormModal';
import { RoomDetailsModal } from './components/rooms/RoomDetailsModal';
import { InquiriesBookingsView } from './components/inquiries/InquiriesBookingsView';
import { AllPaymentsView } from './components/payments/AllPaymentsView';
import { ArchiveCenterView } from './components/archive/ArchiveCenterView';
import { SubMeterScannerModal } from './components/ocr/SubMeterScannerModal';
import { ReceiptModal } from './components/receipt/ReceiptModal';
import { DueCalendarView } from './components/calendar/DueCalendarView';
import { SettingsView } from './components/settings/SettingsView';
import { DownloadAppsModal } from './components/modals/DownloadAppsModal';

const DEVICE_NOTIFICATION_PROMPTED_KEY = '4rent_notification_prompted_device';

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
  const [isHydrated, setIsHydrated] = useState<boolean>(() => isAppHydrated());

  const [activeTab, setActiveTab] = useState<NavigationTab>('dashboard');
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isDownloadModalOpen, setIsDownloadModalOpen] = useState(false);
  const [deferredInstallPrompt, setDeferredInstallPrompt] = useState<any>(null);

  useEffect(() => {
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredInstallPrompt(e);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  // Runtime environment detection (Desktop Launcher vs. Android Mobile APK vs. Web Browser)
  const isDesktop = isRunningInDesktopApp();
  const isMobile = isRunningInMobileApp();
  const isInstalledStandalone = isStandaloneApp();
  const [showBootSplash, setShowBootSplash] = useState<boolean>(true);
  const [showUnlockSplash, setShowUnlockSplash] = useState<boolean>(false);
  const [isLocked, setIsLocked] = useState<boolean>(
    () => loadSettings().security.isSetupComplete
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

  // Occupied Room Archive Guard State (Prevents accidental direct archive of occupied rooms)
  const [roomPendingOccupiedArchive, setRoomPendingOccupiedArchive] =
    useState<Room | null>(null);

  // Interactive Feedback Toast + Easy Go-Through Walkthrough State
  const [feedbackToast, setFeedbackToast] =
    useState<FeedbackNotification | null>(null);
  const [isWalkthroughOpen, setIsWalkthroughOpen] = useState<boolean>(false);

  const triggerFeedback = (
    title: string,
    message: string,
    variant: FeedbackVariant = 'success',
    actionLabel?: string,
    onAction?: () => void
  ) => {
    setFeedbackToast({
      id: `fb-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      title,
      message,
      variant,
      actionLabel,
      onAction,
    });
  };

  // Universal Tactile Ripple Animation on Every Interactive Click/Tap + Global Runtime Error Catch
  useEffect(() => {
    const handlePointerDownRipple = (e: PointerEvent) => {
      try {
        const target = e.target as HTMLElement | null;
        if (!target) return;
        const interactiveEl = target.closest(
          'button, a, [role="button"], .surface-card-interactive, input[type="checkbox"], select'
        );
        if (!interactiveEl) return;

        const dot = document.createElement('span');
        dot.className = 'interaction-ripple-dot';
        dot.style.left = `${e.clientX}px`;
        dot.style.top = `${e.clientY}px`;
        document.body.appendChild(dot);
        setTimeout(() => {
          dot.remove();
        }, 560);
      } catch {
        // Non-critical visual effect guard
      }
    };

    const handleGlobalError = (event: ErrorEvent) => {
      try {
        console.error('[4Rent Caught Runtime Error]:', event.error || event.message);
        appendAuditLog(
          'Runtime Error Caught',
          String(event.message || 'Handled unexpected runtime error'),
          'security'
        );
      } catch {
        // Ignore secondary logging error
      }
    };

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      try {
        console.warn('[4Rent Caught Async Rejection]:', event.reason);
      } catch {
        // Ignore secondary logging error
      }
    };

    window.addEventListener('pointerdown', handlePointerDownRipple, {
      passive: true,
    });
    window.addEventListener('error', handleGlobalError);
    window.addEventListener('unhandledrejection', handleUnhandledRejection);

    return () => {
      window.removeEventListener('pointerdown', handlePointerDownRipple);
      window.removeEventListener('error', handleGlobalError);
      window.removeEventListener(
        'unhandledrejection',
        handleUnhandledRejection
      );
    };
  }, []);

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

  // Auto-Lock Inactivity Timer for Landlord & Tenant Privacy Protection
  useEffect(() => {
    const idleMins = settings.security.autoLockMinutes ?? 15;
    if (!idleMins || idleMins <= 0 || isLocked || showSecuritySetup) {
      return;
    }

    let timeoutId: ReturnType<typeof setTimeout>;
    const resetIdleTimer = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        setIsLocked(true);
        appendAuditLog(
          'Idle Auto-Lock',
          `System locked automatically after ${idleMins} minutes of inactivity.`,
          'security'
        );
      }, idleMins * 60 * 1000);
    };

    const events = ['mousemove', 'keydown', 'pointerdown', 'touchstart'];
    events.forEach((ev) => window.addEventListener(ev, resetIdleTimer));
    resetIdleTimer();

    return () => {
      clearTimeout(timeoutId);
      events.forEach((ev) => window.removeEventListener(ev, resetIdleTimer));
    };
  }, [settings.security.autoLockMinutes, isLocked, showSecuritySetup]);

  // Check device recognition and notification permission once on startup
  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      try {
        const perm = Notification.permission;
        const promptedOnDevice =
          localStorage.getItem(DEVICE_NOTIFICATION_PROMPTED_KEY) === 'true';

        if (perm === 'granted') {
          setSettings((prev) => ({
            ...prev,
            remindersEnabled: true,
            notificationsVerified: true,
            remindersPromptShown: true,
          }));
          localStorage.setItem(DEVICE_NOTIFICATION_PROMPTED_KEY, 'true');
        } else if (perm === 'denied' || promptedOnDevice) {
          setSettings((prev) => ({
            ...prev,
            remindersPromptShown: true,
          }));
          localStorage.setItem(DEVICE_NOTIFICATION_PROMPTED_KEY, 'true');
        }
      } catch {
        // Safe fallback in restricted environments
      }
    }
  }, []);

  // Hydrate from Persistent IndexedDB if localStorage was cleared by an OS/browser update
  useEffect(() => {
    let mounted = true;
    const hydrate = async () => {
      try {
        const idbSnap = await loadSnapshotFromIndexedDb();
        if (!mounted || !idbSnap) return;
        const currentRooms = loadRooms();
        const hasIdbData =
          (idbSnap.rooms && idbSnap.rooms.length > 0) ||
          (idbSnap.bills && idbSnap.bills.length > 0) ||
          (idbSnap.tenantHistory && idbSnap.tenantHistory.length > 0);

        if (currentRooms.length === 0 && hasIdbData) {
          importDatabaseSnapshot(idbSnap);
          setRooms(idbSnap.rooms || []);
          setBills(idbSnap.bills || []);
          setInquiries(idbSnap.inquiries || []);
          setTenantHistory(idbSnap.tenantHistory || []);
          if (idbSnap.settings) {
            setSettings(idbSnap.settings);
            if (idbSnap.settings.security?.isSetupComplete) {
              setShowSecuritySetup(false);
              setIsLocked(idbSnap.settings.security.lockEnabled ?? true);
            }
          }
        }
      } catch (err) {
        console.warn('[4Rent] IndexedDB hydration error:', err);
      } finally {
        if (mounted) {
          setAppHydrated(true);
          setIsHydrated(true);

          // Check for 1-click Mobile/Desktop cloud pairing in URL query
          try {
            const urlParams = new URLSearchParams(window.location.search);
            const syncProp = urlParams.get('prop') || urlParams.get('propertyCode');
            const syncProj = urlParams.get('proj') || urlParams.get('projectId');
            const syncDbUrl = urlParams.get('dbUrl');
            if (syncProp) {
              const currentSettings = loadSettings();
              const nextSync = {
                ...currentSettings.cloudSync,
                enabled: true,
                provider: 'firebase' as const,
                propertyCode: syncProp,
                ...(syncProj ? { firebaseProjectId: syncProj } : {}),
                ...(syncDbUrl ? { firebaseDatabaseUrl: syncDbUrl } : {}),
              };
              const updatedSettings: AppSettings = {
                ...currentSettings,
                cloudSync: nextSync,
              };
              setSettings(updatedSettings);
              saveSettings(updatedSettings);

              // Clean query string from browser address bar
              const cleanUrl = window.location.origin + window.location.pathname;
              window.history.replaceState({}, document.title, cleanUrl);

              pullSnapshotFromCloud(nextSync).then((res) => {
                if (res.ok && res.snapshot) {
                  importDatabaseSnapshot(res.snapshot);
                  setRooms(loadRooms());
                  setBills(loadBills());
                  setInquiries(loadInquiries());
                  setTenantHistory(loadTenantHistory());
                  triggerFeedback(
                    '📱 Mobile & Desktop Synced',
                    `Connected to Property "${syncProp}". All data updated from cloud.`,
                    'success'
                  );
                }
              });
            }
          } catch {}
        }
      }
    };

    hydrate();
    return () => {
      mounted = false;
    };
  }, []);

  // Live Instant Realtime sync across Desktop & Mobile devices (Local BroadcastChannel + Storage + Firebase Cloud)
  useEffect(() => {
    const unsubscribeLocal = subscribeToLocalCrossWindowSync(() => {
      if (!isAppHydrated()) return;
      setRooms(loadRooms());
      setBills(loadBills());
      setInquiries(loadInquiries());
      setTenantHistory(loadTenantHistory());
      setSettings(loadSettings());
    });
    return () => {
      unsubscribeLocal();
    };
  }, []);

  useEffect(() => {
    if (isCloudConfigured(settings.cloudSync)) {
      const unsubscribe = subscribeToRealtimeSync(
        settings.cloudSync,
        (remoteSnap) => {
          importDatabaseSnapshot(remoteSnap);
          setRooms(loadRooms());
          setBills(loadBills());
          setInquiries(loadInquiries());
          setTenantHistory(loadTenantHistory());
        }
      );
      return () => {
        unsubscribe();
      };
    }
  }, [
    settings.cloudSync.enabled,
    settings.cloudSync.provider,
    settings.cloudSync.firebaseProjectId,
    settings.cloudSync.firebaseDatabaseUrl,
    settings.cloudSync.propertyCode,
  ]);

  // Automatic Desktop <-> Mobile Cloud Sync when window gains focus
  useEffect(() => {
    const syncFromCloudOnFocus = async () => {
      if (isCloudConfigured(settings.cloudSync)) {
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
    settings.cloudSync.provider,
    settings.cloudSync.firebaseProjectId,
    settings.cloudSync.firebaseDatabaseUrl,
  ]);

  useEffect(() => {
    if (!isHydrated) return;
    saveSettings(settings);
  }, [settings, isHydrated]);

  useEffect(() => {
    if (!isHydrated) return;
    saveRooms(rooms);
  }, [rooms, isHydrated]);

  useEffect(() => {
    if (!isHydrated) return;
    saveBills(bills);
  }, [bills, isHydrated]);

  useEffect(() => {
    if (!isHydrated) return;
    saveInquiries(inquiries);
  }, [inquiries, isHydrated]);

  useEffect(() => {
    if (!isHydrated) return;
    saveTenantHistory(tenantHistory);
  }, [tenantHistory, isHydrated]);

  const triggerOptionalCloudSync = () => {
    if (isCloudConfigured(settings.cloudSync)) {
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

  const handleTogglePrivacyMask = () => {
    try {
      const nextMask = !settings.privacyMaskEnabled;
      setSettings((prev) => ({
        ...prev,
        privacyMaskEnabled: nextMask,
      }));
      appendAuditLog(
        'Privacy Shield',
        nextMask
          ? 'Enabled screen privacy masking for tenant PII & revenue'
          : 'Disabled screen privacy masking',
        'privacy'
      );
      triggerFeedback(
        nextMask ? 'Privacy Shield Activated' : 'Privacy Shield Disabled',
        nextMask
          ? 'Tenant phone numbers & revenue figures are now masked on screen.'
          : 'Full tenant contact & revenue figures are now visible.',
        'info',
        'Security Settings',
        () => setActiveTab('settings')
      );
    } catch (err) {
      triggerFeedback(
        'Privacy Toggle Error',
        String(err instanceof Error ? err.message : 'Unable to toggle Privacy Shield.'),
        'error'
      );
    }
  };

  const handleCompleteSecuritySetup = (secConfig: SecurityConfig) => {
    try {
      const updated: AppSettings = {
        ...settings,
        security: {
          ...secConfig,
          isSetupComplete: true,
          lockEnabled: true,
        },
      };
      setSettings(updated);
      setShowSecuritySetup(false);
      setIsLocked(false);
      setShowUnlockSplash(true);
      appendAuditLog(
        'Security Configured',
        `Passcode PIN & security preferences updated.`,
        'security'
      );
      triggerFeedback(
        'Security Authenticated',
        'Landlord protection is active. Tap Easy Guide anytime to explore.',
        'success',
        'Open Easy Guide',
        () => setIsWalkthroughOpen(true)
      );
    } catch (err) {
      triggerFeedback(
        'Security Setup Error',
        String(err instanceof Error ? err.message : 'Failed to save security configuration.'),
        'error'
      );
    }
  };

  const handleAllowReminders = async () => {
    try {
      localStorage.setItem(DEVICE_NOTIFICATION_PROMPTED_KEY, 'true');
    } catch {}
    const res = await requestAndVerifyNotifications();
    setSettings((prev) => ({
      ...prev,
      remindersPromptShown: true,
      remindersEnabled: res.granted,
      notificationsVerified: res.verified,
    }));
    triggerFeedback(
      res.granted ? 'Reminders Verified ✓' : 'Permission Not Granted',
      res.message,
      res.granted ? 'success' : 'warning',
      'View Payments',
      () => setActiveTab('payments')
    );
  };

  const handleDenyReminders = () => {
    try {
      localStorage.setItem(DEVICE_NOTIFICATION_PROMPTED_KEY, 'true');
    } catch {}
    setSettings((prev) => ({
      ...prev,
      remindersPromptShown: true,
      remindersEnabled: false,
    }));
    triggerFeedback(
      'Reminders Muted',
      'You can re-enable Day 1–10 notifications anytime in Settings.',
      'info',
      'Open Settings',
      () => setActiveTab('settings')
    );
  };

  // Save Room (and if an occupied room is switched to vacant, automatically log tenant to Previous Tenant History!)
  const handleSaveRoom = (
    roomData: Omit<Room, 'id' | 'updatedAt'>,
    existingId?: string,
    vacatedReason?: string
  ) => {
    try {
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
        appendAuditLog(
          'Room Updated',
          `${roomData.name} (${roomData.status}) saved.`,
          'tenant'
        );
        triggerFeedback(
          `${roomData.name} Updated`,
          `Status: ${roomData.status.toUpperCase()} • Sub-meter baseline: ${roomData.lastMeterReading.toFixed(1)} kWh.`,
          'success',
          'Open Room Details',
          () => setSelectedRoomDetailsId(existingId)
        );
      } else {
        const createdId = `room-${Date.now()}`;
        const newRoom: Room = {
          ...roomData,
          id: createdId,
          updatedAt: nowIso,
        };
        setRooms((prev) => [...prev, newRoom]);
        appendAuditLog(
          'Room Created',
          `${roomData.name} added to system.`,
          'tenant'
        );
        triggerFeedback(
          `${roomData.name} Added`,
          `Ready for dual sub-meter billing (${roomData.lastMeterReading.toFixed(1)} kWh baseline).`,
          'success',
          'Scan Sub-Meter',
          () => {
            setScannerTargetRoom(newRoom);
            setIsScannerOpen(true);
          }
        );
      }
      triggerOptionalCloudSync();
    } catch (err) {
      triggerFeedback(
        'Failed to Save Room',
        String(err instanceof Error ? err.message : 'Please verify room details and try again.'),
        'error'
      );
    }
  };

  const handleConfirmDeleteRoomAfterPin = () => {
    try {
      if (!roomPendingPinDelete) return;
      const targetId = roomPendingPinDelete.id;
      const targetName = roomPendingPinDelete.name;
      const nowIso = new Date().toISOString();

      // Layer 2 Engine Archival Fail-Safe: Archive active tenant to TenantHistoryEntry
      if (roomPendingPinDelete.tenant) {
        const entry: TenantHistoryEntry = {
          id: `hist-${Date.now()}`,
          roomId: roomPendingPinDelete.id,
          roomName: roomPendingPinDelete.name,
          tenantName: roomPendingPinDelete.tenant.fullName,
          phone: roomPendingPinDelete.tenant.phone,
          messengerUsername: roomPendingPinDelete.tenant.messengerUsername,
          moveInDate: roomPendingPinDelete.tenant.moveInDate,
          moveOutDate: nowIso.slice(0, 10),
          reason: 'Permanent Room Deletion with Master PIN (Archived on Deletion)',
          finalMeterReading: roomPendingPinDelete.lastMeterReading,
          depositHeld: roomPendingPinDelete.securityDeposit,
          unpaidBalanceAtMoveOut: roomPendingPinDelete.unpaidBalance,
        };
        setTenantHistory((prev) => [entry, ...prev]);
      }

      // Layer 2 Engine Archival Fail-Safe: Archive associated active bills to prevent orphaned bills
      setBills((prev) =>
        prev.map((b) =>
          b.roomId === targetId && !b.isArchived
            ? { ...b, isArchived: true, archivedAt: nowIso }
            : b
        )
      );

      setRooms((prev) => prev.filter((r) => r.id !== targetId));
      setRoomPendingPinDelete(null);
      appendAuditLog(
        'Room Removed (PIN Verified)',
        `${targetName} permanently removed.`,
        'security'
      );
      triggerFeedback(
        `${targetName} Removed`,
        'Room was permanently deleted after Passcode PIN verification.',
        'warning',
        'View All Rooms',
        () => setActiveTab('rooms')
      );
      triggerOptionalCloudSync();
    } catch (err) {
      triggerFeedback(
        'Room Removal Failed',
        String(err instanceof Error ? err.message : 'Unable to delete room.'),
        'error'
      );
    }
  };

  const handleArchiveRoom = (roomId: string) => {
    try {
      const targetRoom = rooms.find((r) => r.id === roomId);
      if (!targetRoom) return;

      // Guard: If the room is currently Occupied, block direct archive and open the notification/reason modal
      if (targetRoom.status === 'occupied') {
        setRoomPendingOccupiedArchive(targetRoom);
        triggerFeedback(
          'Occupied Room Guard Active',
          `${targetRoom.name} is currently occupied by ${targetRoom.tenant?.fullName || 'a tenant'}. Provide an override reason to archive.`,
          'warning',
          'View Room Ledger',
          () => setSelectedRoomDetailsId(targetRoom.id)
        );
        return;
      }

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
      appendAuditLog(
        'Vacant Room Archived',
        `${targetRoom.name} moved to Archive Center.`,
        'tenant'
      );
      triggerFeedback(
        `${targetRoom.name} Archived`,
        'Room moved safely to Archive & History Center.',
        'info',
        'Open Archive',
        () => setActiveTab('archive')
      );
      triggerOptionalCloudSync();
    } catch (err) {
      triggerFeedback(
        'Archive Action Failed',
        String(err instanceof Error ? err.message : 'Could not archive room.'),
        'error'
      );
    }
  };

  const handleConfirmOccupiedArchiveWithReason = (
    room: Room,
    reason: string
  ) => {
    try {
      const nowIso = new Date().toISOString();

      if (room.tenant) {
        const entry: TenantHistoryEntry = {
          id: `hist-${Date.now()}`,
          roomId: room.id,
          roomName: room.name,
          tenantName: room.tenant.fullName,
          phone: room.tenant.phone,
          messengerUsername: room.tenant.messengerUsername,
          moveInDate: room.tenant.moveInDate,
          moveOutDate: nowIso.slice(0, 10),
          reason: `Archived while occupied: ${reason}`,
          finalMeterReading: room.lastMeterReading,
          depositHeld: room.securityDeposit,
          unpaidBalanceAtMoveOut: room.unpaidBalance,
        };
        setTenantHistory((prev) => [entry, ...prev]);
      }

      setRooms((prev) =>
        prev.map((r) =>
          r.id === room.id
            ? {
                ...r,
                isArchived: true,
                archivedAt: nowIso,
              }
            : r
        )
      );
      setRoomPendingOccupiedArchive(null);
      appendAuditLog(
        'Occupied Room Archived (Override)',
        `${room.name} (${room.tenant?.fullName || 'Occupied'}) archived — Reason: ${reason}`,
        'tenant'
      );
      triggerFeedback(
        `${room.name} Archived with Reason`,
        `Recorded reason: "${reason}". Tenant history logged in Archive.`,
        'warning',
        'Go to Archive',
        () => setActiveTab('archive')
      );
      triggerOptionalCloudSync();
    } catch (err) {
      triggerFeedback(
        'Occupied Archive Error',
        String(err instanceof Error ? err.message : 'Unable to archive occupied room.'),
        'error'
      );
    }
  };

  const handleRestoreRoom = (roomId: string) => {
    try {
      const target = rooms.find((r) => r.id === roomId);
      setRooms((prev) =>
        prev.map((r) =>
          r.id === roomId
            ? { ...r, isArchived: false, archivedAt: undefined }
            : r
        )
      );
      triggerFeedback(
        `${target?.name || 'Room'} Restored`,
        'Room is back in your active rooms list.',
        'success',
        'Go to Rooms',
        () => setActiveTab('rooms')
      );
      triggerOptionalCloudSync();
    } catch (err) {
      triggerFeedback(
        'Restore Error',
        String(err instanceof Error ? err.message : 'Could not restore room.'),
        'error'
      );
    }
  };

  // Move out tenant -> Goes to Previous Tenant History AND preserves continuous kWh meter reading
  const handleMoveOutTenant = (room: Room, reason: string) => {
    try {
      if (!room.tenant) return;
      const tenantName = room.tenant.fullName;
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
                updatedAt: new Date().toISOString(),
              }
            : r
        )
      );
      appendAuditLog(
        'Tenant Vacated',
        `${tenantName} moved out of ${room.name}.`,
        'tenant'
      );
      triggerFeedback(
        `${tenantName} Moved Out`,
        `${room.name} is now Vacant (Sub-Meter preserved at ${room.lastMeterReading.toFixed(1)} kWh).`,
        'info',
        'View Tenant History',
        () => setActiveTab('archive')
      );
      triggerOptionalCloudSync();
    } catch (err) {
      triggerFeedback(
        'Move-Out Error',
        String(err instanceof Error ? err.message : 'Unable to complete move-out.'),
        'error'
      );
    }
  };

  // Generate Bill -> Enforces 1 Active Receipt per Room (archives previous receipts for this room)
  const handleGenerateBill = (
    newBill: BillRecord,
    updatedRoomLastReading: number,
    updatedRoomLastPhotoUrl: string,
    updatedRoomUnpaidBalance: number,
    overpaymentAddedToAdvance: number,
    advanceDeductedFromRoom: number,
    updatedRoomLastCropUrl?: string
  ) => {
    try {
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
            lastMeterCropDataUrl: updatedRoomLastCropUrl || r.lastMeterCropDataUrl,
            lastReadingDate: newBill.createdAt,
            unpaidBalance: updatedRoomUnpaidBalance,
            advanceRent: nextAdv,
            advanceHistory: newAdvEntries,
            activeReceiptId: newBill.id,
            updatedAt: newBill.createdAt,
          };
        })
      );

      appendReadingLog({
        id: `meter-log-${newBill.id}-${Date.now()}`,
        roomId: newBill.roomId,
        roomName: newBill.roomName,
        tenantName: newBill.tenantName,
        readingDate: newBill.createdAt,
        readingKwh: newBill.currReading,
        consumptionDeltaKwh: newBill.consumptionKwh,
        source: newBill.notes?.includes('Rollover')
          ? 'rollover'
          : (newBill.ocrConfidence ? 'ocr_scan' : 'manual_entry'),
        photoDataUrl: newBill.meterPhotoDataUrl,
        cropDataUrl: newBill.currMeterCropDataUrl,
        billId: newBill.id,
        notes: newBill.notes,
      });

      appendAuditLog(
        'Official Receipt Generated',
        `Receipt #${newBill.receiptNo} issued for ${newBill.roomName}.`,
        'billing'
      );
      setActiveReceiptBill(newBill);
      triggerFeedback(
        `Receipt #${newBill.receiptNo} Generated`,
        `${newBill.roomName}: ${newBill.consumptionKwh.toFixed(1)} kWh used • Net Due ₱${newBill.remainingBalance.toLocaleString('en-PH', { minimumFractionDigits: 2 })}.`,
        'success',
        'Open Receipt',
        () => setActiveReceiptBill(newBill)
      );
      triggerOptionalCloudSync();
    } catch (err) {
      triggerFeedback(
        'Bill Generation Error',
        String(err instanceof Error ? err.message : 'Unable to generate receipt.'),
        'error'
      );
    }
  };

  // Record Payment -> Automatically credits any overpayment to the room's Withdrawable Advance Payment Balance
  const handleRecordPayment = (
    billId: string,
    amount: number,
    method: 'Cash' | 'GCash' | 'Maya' | 'Bank Transfer',
    referenceNo?: string
  ) => {
    try {
      let targetRoomId = '';
      let newRoomRemaining = 0;
      let overpaymentCredited = 0;
      let receiptNo = '';
      let updatedReceiptObj: BillRecord | null = null;

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
          updatedReceiptObj = outcome.updatedBill;
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
      appendAuditLog(
        'Payment Recorded',
        `₱${amount.toFixed(2)} via ${method} for Receipt #${receiptNo}.`,
        'billing'
      );
      triggerFeedback(
        `Payment Recorded (₱${amount.toLocaleString('en-PH', { minimumFractionDigits: 2 })})`,
        overpaymentCredited > 0
          ? `Paid via ${method}. Excess ₱${overpaymentCredited.toFixed(2)} auto-credited to Advance Balance!`
          : `Paid via ${method} for Receipt #${receiptNo}. Remaining: ₱${newRoomRemaining.toFixed(2)}.`,
        'success',
        'View Official Receipt',
        () => {
          if (updatedReceiptObj) setActiveReceiptBill(updatedReceiptObj);
        }
      );
      triggerOptionalCloudSync();
    } catch (err) {
      triggerFeedback(
        'Payment Recording Error',
        String(err instanceof Error ? err.message : 'Could not record payment.'),
        'error'
      );
    }
  };

  // Advance Balance Withdraw / Add Handlers
  const handleWithdrawAdvance = (
    roomId: string,
    amount: number,
    note: string
  ) => {
    try {
      const nowIso = new Date().toISOString();
      const targetRoom = rooms.find((r) => r.id === roomId);
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
      appendAuditLog(
        'Advance Balance Withdrawn',
        `₱${amount.toFixed(2)} withdrawn from room advance balance.`,
        'billing'
      );
      triggerFeedback(
        `Withdrew ₱${amount.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`,
        `Advance balance updated for ${targetRoom?.name || 'Room'}.`,
        'info',
        'Open Room Ledger',
        () => setSelectedRoomDetailsId(roomId)
      );
      triggerOptionalCloudSync();
    } catch (err) {
      triggerFeedback(
        'Advance Withdrawal Error',
        String(err instanceof Error ? err.message : 'Unable to withdraw advance balance.'),
        'error'
      );
    }
  };

  const handleAddAdvanceDeposit = (
    roomId: string,
    amount: number,
    note: string
  ) => {
    try {
      const nowIso = new Date().toISOString();
      const targetRoom = rooms.find((r) => r.id === roomId);
      const currentUnpaid = targetRoom?.unpaidBalance || 0;
      const autoAppliedToBill =
        currentUnpaid > 0
          ? Math.round(Math.min(amount, currentUnpaid) * 100) / 100
          : 0;
      const remainingToAdvance =
        Math.round(Math.max(0, amount - autoAppliedToBill) * 100) / 100;

      if (autoAppliedToBill > 0) {
        setBills((prev) =>
          prev.map((b) => {
            const isTargetActiveBill =
              (targetRoom?.activeReceiptId &&
                b.id === targetRoom.activeReceiptId) ||
              (b.roomId === roomId && !b.isArchived && b.remainingBalance > 0);
            if (!isTargetActiveBill) return b;

            const nextDepositApplied =
              Math.round(((b.depositApplied || 0) + autoAppliedToBill) * 100) /
              100;
            const nextTotalDue = Math.max(
              0,
              Math.round((b.totalAmountDue - autoAppliedToBill) * 100) / 100
            );
            const nextRemaining = Math.max(
              0,
              Math.round((b.remainingBalance - autoAppliedToBill) * 100) / 100
            );
            const nextStatus: BillRecord['status'] =
              nextRemaining <= 0
                ? 'paid'
                : b.amountPaid > 0 || nextDepositApplied > 0
                  ? 'partial'
                  : 'unpaid';

            return {
              ...b,
              depositApplied: nextDepositApplied,
              totalAmountDue: nextTotalDue,
              remainingBalance: nextRemaining,
              status: nextStatus,
              paidAt: nextRemaining <= 0 ? nowIso : b.paidAt,
            };
          })
        );
      }

      setRooms((prev) =>
        prev.map((r) => {
          if (r.id !== roomId) return r;
          const nextAdv =
            Math.round(((r.advanceRent || 0) + remainingToAdvance) * 100) / 100;
          const nextUnpaid = Math.max(
            0,
            Math.round(((r.unpaidBalance || 0) - autoAppliedToBill) * 100) / 100
          );
          const historyEntries: AdvanceBalanceTransaction[] = [
            {
              id: `adv-d-${Date.now()}`,
              type: 'manual_deposit',
              amount,
              createdAt: nowIso,
              note,
            },
          ];
          if (autoAppliedToBill > 0) {
            historyEntries.unshift({
              id: `adv-auto-${Date.now() + 1}`,
              type: 'applied_to_bill',
              amount: autoAppliedToBill,
              createdAt: nowIso,
              note: 'Automatically deducted toward active room bill',
            });
          }
          return {
            ...r,
            advanceRent: nextAdv,
            unpaidBalance: nextUnpaid,
            advanceHistory: [...historyEntries, ...(r.advanceHistory || [])],
            updatedAt: nowIso,
          };
        })
      );

      appendAuditLog(
        'Advance Payment Added',
        autoAppliedToBill > 0
          ? `₱${amount.toFixed(2)} added (₱${autoAppliedToBill.toFixed(2)} auto-deducted from active bill).`
          : `₱${amount.toFixed(2)} added to Advance Balance (will auto-deduct on billing day).`,
        'billing'
      );
      triggerFeedback(
        `Advance Added (+₱${amount.toLocaleString('en-PH', { minimumFractionDigits: 2 })})`,
        autoAppliedToBill > 0
          ? `₱${autoAppliedToBill.toFixed(2)} auto-deducted from current bill; ₱${remainingToAdvance.toFixed(2)} stored for next cycle.`
          : `Stored in ${targetRoom?.name || 'Room'} Advance Balance — will auto-deduct on billing day.`,
        'success',
        'View Room Ledger',
        () => setSelectedRoomDetailsId(roomId)
      );
      triggerOptionalCloudSync();
    } catch (err) {
      triggerFeedback(
        'Add Advance Error',
        String(err instanceof Error ? err.message : 'Unable to add advance deposit.'),
        'error'
      );
    }
  };

  // Inquiries & Room Bookings Handlers
  const handleCreateInquiry = (
    data: Omit<RoomInquiryBooking, 'id' | 'createdAt'>
  ) => {
    try {
      const newInq: RoomInquiryBooking = {
        ...data,
        id: `inq-${Date.now()}`,
        createdAt: new Date().toISOString(),
      };
      setInquiries((prev) => [newInq, ...prev]);
      triggerFeedback(
        `Inquiry Logged: ${data.prospectName}`,
        `Target unit: ${data.roomName} • Move-in: ${data.targetMoveInDate}.`,
        'success',
        'View Inquiries',
        () => setActiveTab('inquiries')
      );
      triggerOptionalCloudSync();
    } catch (err) {
      triggerFeedback(
        'Inquiry Save Error',
        String(err instanceof Error ? err.message : 'Unable to save inquiry.'),
        'error'
      );
    }
  };

  const handleApproveBookingMoveIn = (inquiry: RoomInquiryBooking) => {
    try {
      const nowIso = new Date().toISOString();
      const targetRoom = rooms.find((r) => r.id === inquiry.roomId);

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
          const reqDep =
            inquiry.requiredDeposit && inquiry.requiredDeposit > 0
              ? inquiry.requiredDeposit
              : r.securityDeposit || settings.defaultMonthlyRent;
          const excessAdvance = Math.max(
            0,
            Math.round(((inquiry.reservationFee || 0) - reqDep) * 100) / 100
          );

          const advanceTx: AdvanceBalanceTransaction | null =
            excessAdvance > 0
              ? {
                  id: `adv-inq-${Date.now()}`,
                  type: 'overpayment_credit',
                  amount: excessAdvance,
                  createdAt: nowIso,
                  note: `Booking reservation excess credited to advance rent (Reservation fee: ₱${(inquiry.reservationFee || 0).toFixed(2)}, Deposit: ₱${reqDep.toFixed(2)})`,
                }
              : null;

          if (excessAdvance > 0) {
            appendAuditLog(
              'Advance Rent Credited',
              `₱${excessAdvance.toFixed(2)} excess reservation fee credited as advance rent for ${inquiry.prospectName} in ${r.name}.`,
              'billing'
            );
          }

          const moveInDay = clampDueDayOneToTen(
            new Date(inquiry.targetMoveInDate).getDate() || 5
          );

          return {
            ...r,
            status: 'occupied',
            securityDeposit: reqDep,
            unpaidBalance: 0,
            advanceRent:
              Math.round(((r.advanceRent || 0) + excessAdvance) * 100) / 100,
            advanceHistory: advanceTx
              ? [advanceTx, ...(r.advanceHistory || [])]
              : r.advanceHistory || [],
            tenant: {
              id: `ten-${Date.now()}`,
              fullName: inquiry.prospectName,
              phone: inquiry.phone,
              messengerUsername: inquiry.messengerUsername,
              validIdVerified: true,
              privacyConsentSigned: true,
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
      triggerFeedback(
        `${inquiry.prospectName} Moved In!`,
        `${inquiry.roomName} is now Occupied with verified ID & lease consent.`,
        'success',
        'Open Room Details',
        () => setSelectedRoomDetailsId(inquiry.roomId)
      );
      triggerOptionalCloudSync();
    } catch (err) {
      triggerFeedback(
        'Move-In Approval Error',
        String(err instanceof Error ? err.message : 'Unable to approve move-in.'),
        'error'
      );
    }
  };

  const handleArchiveBill = (billId: string) => {
    try {
      const targetBill = bills.find((b) => b.id === billId);
      setBills((prev) =>
        prev.map((b) =>
          b.id === billId
            ? { ...b, isArchived: true, archivedAt: new Date().toISOString() }
            : b
        )
      );
      triggerFeedback(
        `Receipt #${targetBill?.receiptNo || ''} Archived`,
        'Moved to Archive & History Center.',
        'info',
        'View Archive',
        () => setActiveTab('archive')
      );
      triggerOptionalCloudSync();
    } catch (err) {
      triggerFeedback(
        'Bill Archive Error',
        String(err instanceof Error ? err.message : 'Unable to archive receipt.'),
        'error'
      );
    }
  };

  const handleRestoreBill = (billId: string) => {
    try {
      const targetBill = bills.find((b) => b.id === billId);
      setBills((prev) =>
        prev.map((b) =>
          b.id === billId
            ? { ...b, isArchived: false, archivedAt: undefined }
            : b
        )
      );
      triggerFeedback(
        `Receipt #${targetBill?.receiptNo || ''} Restored`,
        'Restored to active Payment History.',
        'success',
        'View Payments',
        () => setActiveTab('payments')
      );
      triggerOptionalCloudSync();
    } catch (err) {
      triggerFeedback(
        'Bill Restore Error',
        String(err instanceof Error ? err.message : 'Unable to restore receipt.'),
        'error'
      );
    }
  };

  const handleReloadAllData = () => {
    try {
      setRooms(loadRooms());
      setBills(loadBills());
      setInquiries(loadInquiries());
      setTenantHistory(loadTenantHistory());
      setSettings(loadSettings());
      triggerFeedback(
        'Database Synchronized',
        'All rooms, sub-meter readings, and receipts have been refreshed.',
        'success',
        'Go to Dashboard',
        () => setActiveTab('dashboard')
      );
    } catch (err) {
      triggerFeedback(
        'Database Reload Error',
        String(err instanceof Error ? err.message : 'Failed to reload database snapshot.'),
        'error'
      );
    }
  };

  // Whenever global Electric Rate is updated in Settings, reflect it across active unpaid bills
  const handleUpdateSettings = (nextSettings: AppSettings) => {
    try {
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
      triggerFeedback(
        'System Settings Saved',
        `Electric Rate: ₱${nextSettings.defaultElectricRate.toFixed(2)}/kWh • Default Rent: ₱${nextSettings.defaultMonthlyRent.toLocaleString('en-PH')}.`,
        'success',
        'Back to Dashboard',
        () => setActiveTab('dashboard')
      );
      triggerOptionalCloudSync();
    } catch (err) {
      triggerFeedback(
        'Settings Update Error',
        String(err instanceof Error ? err.message : 'Unable to save settings.'),
        'error'
      );
    }
  };

  const handleOpenScanForRoom = (room?: Room) => {
    const activeRooms = rooms.filter((r) => !r.isArchived);
    if (activeRooms.length === 0) {
      setEditingRoom(null);
      setIsRoomModalOpen(true);
      triggerFeedback(
        'Add Your First Room',
        'Create a room with an initial sub-meter reading before scanning.',
        'info'
      );
      return;
    }
    setScannerTargetRoom(room || activeRooms[0]);
    setIsScannerOpen(true);
  };

  const activeAdvanceModalRoom =
    rooms.find((r) => r.id === advanceModalRoomId) || null;

  const selectedRoomForDetails =
    rooms.find((r) => r.id === selectedRoomDetailsId) || null;

  // 0. Initial System Boot Loading Screen
  if (showBootSplash || !isHydrated) {
    return (
      <LoadingSplashScreen
        mode="boot"
        durationMs={1100}
        onFinished={() => setShowBootSplash(false)}
      />
    );
  }

  // 1. Setup Security Screen (Mandatory Landlord Authentication)
  if (showSecuritySetup) {
    return <SecuritySetupScreen onComplete={handleCompleteSecuritySetup} />;
  }

  // 2. Lock Screen (Mandatory Landlord Authentication)
  if (isLocked) {
    return (
      <LockScreen
        security={settings.security}
        onUnlock={() => {
          setIsLocked(false);
          setShowUnlockSplash(true);
        }}
      />
    );
  }

  // 2.5 Post-Authentication Workspace Loading Screen
  if (showUnlockSplash) {
    return (
      <LoadingSplashScreen
        mode="unlock"
        durationMs={850}
        onFinished={() => setShowUnlockSplash(false)}
      />
    );
  }

  // 3. Main Adaptive Application Shell (Desktop + Mobile App)
  return (
    <div className="min-h-screen w-full bg-transparent text-slate-100 flex">
      <NavigationDrawer
        activeTab={activeTab}
        isOpenMobile={isDrawerOpen}
        privacyMaskEnabled={settings.privacyMaskEnabled}
        onCloseMobile={() => setIsDrawerOpen(false)}
        onSelectTab={(tab) => setActiveTab(tab)}
        onTogglePrivacyMask={handleTogglePrivacyMask}
        onLockApp={() => setIsLocked(true)}
        hasRooms={rooms.filter((r) => !r.isArchived).length > 0}
        onOpenDownloadModal={() => setIsDownloadModalOpen(true)}
        isInstalledStandalone={isInstalledStandalone}
      />

      <main className="flex-1 min-w-0">
        {activeTab === 'dashboard' && (
          <DashboardView
            rooms={rooms}
            bills={bills}
            inquiries={inquiries}
            globalElectricRate={settings.defaultElectricRate}
            privacyMaskEnabled={settings.privacyMaskEnabled}
            onTogglePrivacyMask={handleTogglePrivacyMask}
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
            onOpenWalkthrough={() => setIsWalkthroughOpen(true)}
            onOpenDownloadModal={() => setIsDownloadModalOpen(true)}
            isInstalledStandalone={isInstalledStandalone}
          />
        )}

        {activeTab === 'rooms' && (
          <ManageRoomsView
            rooms={rooms}
            bills={bills}
            globalElectricRate={settings.defaultElectricRate}
            privacyMaskEnabled={settings.privacyMaskEnabled}
            onBack={() => setActiveTab('dashboard')}
            onOpenAddRoom={() => {
              setEditingRoom(null);
              setIsRoomModalOpen(true);
            }}
            onOpenEditRoom={(room) => {
              setEditingRoom(room);
              setIsRoomModalOpen(true);
            }}
            onRequestDeleteRoomWithPin={(room) => {
              if (room.status === 'occupied' || Boolean(room.tenant)) {
                triggerFeedback(
                  'Cannot Delete Occupied Room',
                  `${room.name} is occupied by ${room.tenant?.fullName || 'a tenant'}. Move out the tenant or archive the room first to protect tenant and billing records.`,
                  'warning',
                  'View Room Ledger',
                  () => setSelectedRoomDetailsId(room.id)
                );
                return;
              }
              setRoomPendingPinDelete(room);
            }}
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

        {activeTab === 'calendar' && (
          <DueCalendarView
            rooms={rooms}
            bills={bills}
            privacyMaskEnabled={settings.privacyMaskEnabled}
            onTogglePrivacyMask={handleTogglePrivacyMask}
            onBack={() => setActiveTab('dashboard')}
            onNavigate={(tab) => setActiveTab(tab)}
            onSelectRoomDetails={(room) => setSelectedRoomDetailsId(room.id)}
            onOpenScanMeter={(room) => handleOpenScanForRoom(room)}
            onSelectBillForReceipt={(bill) => setActiveReceiptBill(bill)}
          />
        )}

        {activeTab === 'inquiries' && (
          <InquiriesBookingsView
            rooms={rooms}
            inquiries={inquiries}
            defaultDeposit={settings.defaultMonthlyRent}
            privacyMaskEnabled={settings.privacyMaskEnabled}
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
            privacyMaskEnabled={settings.privacyMaskEnabled}
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
            onOpenSecuritySetup={() => setShowSecuritySetup(true)}
            onInstallDesktopApp={handleInstallDesktopApp}
            onOpenDownloadModal={() => setIsDownloadModalOpen(true)}
            isInstalledStandalone={isInstalledStandalone}
            isDesktop={isDesktop}
            isMobile={isMobile}
          />
        )}
      </main>

      {/* Mobile Bottom Navigation Bar for Native Mobile App Experience */}
      <MobileBottomNav
        activeTab={activeTab}
        onSelectTab={(tab) => setActiveTab(tab)}
        onOpenScanner={() => handleOpenScanForRoom()}
      />

      {/* Enable Reminders Modal (prompts once only per recognized device) */}
      <EnableRemindersModal
        isOpen={
          !settings.remindersPromptShown &&
          (typeof window === 'undefined' ||
            localStorage.getItem(DEVICE_NOTIFICATION_PROMPTED_KEY) !== 'true') &&
          activeTab === 'dashboard'
        }
        onAllow={handleAllowReminders}
        onDeny={handleDenyReminders}
      />

      {/* Room Add / Edit Modal */}
      <RoomFormModal
        isOpen={isRoomModalOpen}
        initialRoom={editingRoom}
        existingRooms={rooms}
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
        privacyMaskEnabled={settings.privacyMaskEnabled}
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
        securityPin={settings.security?.pinCode || '1234'}
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
      />

      {/* Occupied Room Archive Guard & Notification Modal */}
      <OccupiedArchiveGuardModal
        room={roomPendingOccupiedArchive}
        onClose={() => setRoomPendingOccupiedArchive(null)}
        onConfirmArchiveWithReason={handleConfirmOccupiedArchiveWithReason}
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

      {/* Interactive Easy Go-Through Guide Modal */}
      <EasyWalkthroughModal
        isOpen={isWalkthroughOpen}
        onClose={() => setIsWalkthroughOpen(false)}
        onOpenAddRoom={() => {
          setEditingRoom(null);
          setIsRoomModalOpen(true);
        }}
        onOpenScanner={() => handleOpenScanForRoom()}
        onNavigateTab={(tab) => setActiveTab(tab)}
      />

      {/* Global Interactive Feedback Toast Bar with Easy Go-Through Quick Action */}
      <FeedbackToastBar
        notification={feedbackToast}
        onDismiss={() => setFeedbackToast(null)}
      />

      {/* Official System Apps (Windows .EXE & Android .APK) Download Center Modal */}
      <DownloadAppsModal
        isOpen={isDownloadModalOpen}
        onClose={() => setIsDownloadModalOpen(false)}
        propertyCode={settings.cloudSync.propertyCode || '4RENT-MAIN'}
        canInstallPwa={Boolean(deferredInstallPrompt)}
        onInstallPwa={async () => {
          if (deferredInstallPrompt) {
            deferredInstallPrompt.prompt();
            const choiceResult = await deferredInstallPrompt.userChoice;
            if (choiceResult?.outcome === 'accepted') {
              triggerFeedback(
                '4Rent Desktop App Installed!',
                '4Rent was installed directly to your system with an official desktop shortcut.',
                'success'
              );
              setDeferredInstallPrompt(null);
            }
          }
        }}
      />
    </div>
  );
}
export default App;
