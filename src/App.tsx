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
  applyCloudSnapshotCleanly,
  clearPendingCloudApply,
  exportDatabaseSnapshot,
  importDatabaseSnapshot,
  isAppHydrated,
  loadBills,
  loadInquiries,
  loadRooms,
  loadSettings,
  loadTenantHistory,
  peekPendingCloudApply,
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
  getMobileCodeMonthlyLock,
  isCloudConfigured,
  mergeDatabaseSnapshots,
  normalizePropertyCode,
  pullSnapshotFromCloud,
  pushSnapshotToCloud,
  subscribeToRealtimeSync,
} from './services/firebaseSync';
import {
  applyPaymentWithOverpayment,
  clampDueDayOneToTen,
  formatMonthKeyLabel,
  getElectricRateForPeriod,
  isMobileDevice,
  isRunningInDesktopApp,
  isRunningInMobileApp,
  isStandaloneApp,
  normalizeMonthKey,
  recalculateActiveBillsForRates,
  roundCurrency,
} from './utils/billingCalculator';
import { requestAndVerifyNotifications } from './services/notificationService';
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
import { ConfirmActionModal } from './components/modals/ConfirmActionModal';
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
  const deferredInstallPromptRef = useRef<any>(null);

  useEffect(() => {
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      deferredInstallPromptRef.current = e;
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

  // Unified Confirmation & Security Auth States (Room Deletion, Archive, Tenant Vacated, Advance Payment)
  const [pendingAuthAction, setPendingAuthAction] = useState<{
    title: string;
    description: string;
    onConfirm: () => void;
  } | null>(null);
  const [pendingConfirmAction, setPendingConfirmAction] = useState<
    | { type: 'vacate'; room: Room; reason: string }
    | { type: 'archive_vacant'; room: Room }
    | { type: 'delete_room'; room: Room }
    | null
  >(null);

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
      let appliedPendingCloud = false;

      try {
        const pendingApply = peekPendingCloudApply();
        if (pendingApply) {
          const currentSettings = loadSettings();
          const appliedMonth = pendingApply.appliedMonth || normalizeMonthKey();
          const pendingSync = {
            ...currentSettings.cloudSync,
            enabled: true,
            provider: 'firebase' as const,
            propertyCode: pendingApply.propertyCode,
            mobileCodeAppliedMonth: appliedMonth,
            mobileCodeAppliedAt:
              currentSettings.cloudSync.mobileCodeAppliedAt ||
              new Date().toISOString(),
          };
          const res = await pullSnapshotFromCloud(pendingSync);
          if (!mounted) return;
          if (res.ok && res.snapshot) {
            await applyCloudSnapshotCleanly(res.snapshot, {
              ...pendingSync,
              lastSyncedAt: res.updatedAt || new Date().toISOString(),
            });
            clearPendingCloudApply();
            setRooms(loadRooms());
            setBills(loadBills());
            setInquiries(loadInquiries());
            setTenantHistory(loadTenantHistory());
            setSettings(loadSettings());
            appliedPendingCloud = true;

            const lockInfo = getMobileCodeMonthlyLock(pendingSync);
            triggerFeedback(
              'Property Space Code Applied',
              `Loaded all data for "${pendingApply.propertyCode}". Monthly mobile limit locked until ${lockInfo.nextEligibleMonthLabel}.`,
              'success'
            );
          } else {
            triggerFeedback(
              'Cloud Data Pending Sync',
              res.message ||
                `Could not download data for "${pendingApply.propertyCode}" after refresh. Tap Sync Now in Settings.`,
              'info'
            );
          }
        }

        if (!appliedPendingCloud) {
          const idbSnap = await loadSnapshotFromIndexedDb();
          if (!mounted || !idbSnap) return;
          const currentRooms = loadRooms();
          const currentBills = loadBills();
          const currentHistory = loadTenantHistory();
          const needsIdbRestore =
            (currentRooms.length === 0 && Boolean(idbSnap.rooms?.length)) ||
            (currentBills.length === 0 && Boolean(idbSnap.bills?.length)) ||
            (currentHistory.length === 0 && Boolean(idbSnap.tenantHistory?.length));

          if (needsIdbRestore) {
            const restored = mergeDatabaseSnapshots(exportDatabaseSnapshot(), idbSnap);
            importDatabaseSnapshot(restored);
            setRooms(loadRooms());
            setBills(loadBills());
            setInquiries(loadInquiries());
            setTenantHistory(loadTenantHistory());
            if (idbSnap.settings && !loadSettings().security?.isSetupComplete) {
              setSettings(idbSnap.settings);
              if (idbSnap.settings.security?.isSetupComplete) {
                setShowSecuritySetup(false);
                setIsLocked(idbSnap.settings.security.lockEnabled ?? true);
              }
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
            const rawSyncProp = urlParams.get('prop') || urlParams.get('propertyCode');
            const syncProp = rawSyncProp ? normalizePropertyCode(rawSyncProp) : '';
            const syncProj = urlParams.get('proj') || urlParams.get('projectId');
            const syncDbUrl = urlParams.get('dbUrl');
            if (syncProp) {
              // Clean query string from browser address bar immediately
              const cleanUrl = window.location.origin + window.location.pathname;
              window.history.replaceState({}, document.title, cleanUrl);

              const currentSettings = loadSettings();
              const mobileDevice = isMobileDevice();
              const mobileLock = getMobileCodeMonthlyLock(currentSettings.cloudSync);

              if (mobileDevice && mobileLock.isLockedThisMonth) {
                triggerFeedback(
                  'Monthly Code Limit Active',
                  `Mobile Property Space Code can only be applied once per month. Next change opens ${mobileLock.nextEligibleMonthLabel}.`,
                  'error'
                );
              } else {
                const nextSync = {
                  ...currentSettings.cloudSync,
                  enabled: true,
                  provider: 'firebase' as const,
                  propertyCode: syncProp,
                  ...(syncProj ? { firebaseProjectId: syncProj } : {}),
                  ...(syncDbUrl ? { firebaseDatabaseUrl: syncDbUrl } : {}),
                  ...(mobileDevice
                    ? {
                        mobileCodeAppliedMonth: mobileLock.currentMonthKey,
                        mobileCodeAppliedAt: new Date().toISOString(),
                      }
                    : {}),
                };

                pullSnapshotFromCloud(nextSync).then(async (res) => {
                  if (!mounted) return;
                  if (res.ok && res.snapshot) {
                    if (mobileDevice) {
                      await applyCloudSnapshotCleanly(res.snapshot, {
                        ...nextSync,
                        lastSyncedAt: res.updatedAt || new Date().toISOString(),
                      });
                    } else {
                      const updatedSettings: AppSettings = {
                        ...currentSettings,
                        cloudSync: nextSync,
                      };
                      saveSettings(updatedSettings);
                      const merged = mergeDatabaseSnapshots(
                        exportDatabaseSnapshot(),
                        res.snapshot
                      );
                      importDatabaseSnapshot(merged, { preserveLocalSecurity: true });
                    }
                    setSettings(loadSettings());
                    setRooms(loadRooms());
                    setBills(loadBills());
                    setInquiries(loadInquiries());
                    setTenantHistory(loadTenantHistory());
                    triggerFeedback(
                      'Mobile & Desktop Synced',
                      `Connected to Property "${syncProp}". All data updated from cloud.`,
                      'success'
                    );
                  } else if (!mobileDevice) {
                    const updatedSettings: AppSettings = {
                      ...currentSettings,
                      cloudSync: nextSync,
                    };
                    setSettings(updatedSettings);
                    saveSettings(updatedSettings);
                  } else {
                    triggerFeedback(
                      'Property Code Not Found',
                      res.message || `No cloud data found for "${syncProp}".`,
                      'error'
                    );
                  }
                });
              }
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
          const merged = mergeDatabaseSnapshots(
            exportDatabaseSnapshot(),
            remoteSnap
          );
          importDatabaseSnapshot(merged, { preserveLocalSecurity: true });
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
          const merged = mergeDatabaseSnapshots(
            exportDatabaseSnapshot(),
            res.snapshot
          );
          importDatabaseSnapshot(merged, { preserveLocalSecurity: true });
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
    settings.cloudSync.propertyCode,
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

        // If room is occupied and has available paid Required Deposit credit with active unpaid bills,
        // auto-deduct deposit synchronously before queuing state updates so room & bill balances stay aligned.
        const availablePaidDeposit =
          roomData.status === 'occupied'
            ? Math.max(0, roomData.securityDepositPaid || 0)
            : 0;
        let remainingDepositCredit = availablePaidDeposit;
        let depositUsedOnActiveBills = 0;
        const billUpdatesById = new Map<string, BillRecord>();

        if (remainingDepositCredit > 0) {
          const activeUnpaidBills = bills
            .filter(
              (b) =>
                !b.isArchived &&
                b.roomId === existingId &&
                b.remainingBalance > 0
            )
            .sort((a, b) =>
              a.id === roomData.activeReceiptId
                ? -1
                : b.id === roomData.activeReceiptId
                ? 1
                : 0
            );

          for (const targetBill of activeUnpaidBills) {
            if (remainingDepositCredit <= 0) break;
            const deductAmount = roundCurrency(
              Math.min(remainingDepositCredit, targetBill.remainingBalance)
            );
            if (deductAmount <= 0) continue;

            remainingDepositCredit = Math.max(
              0,
              roundCurrency(remainingDepositCredit - deductAmount)
            );
            depositUsedOnActiveBills = roundCurrency(
              depositUsedOnActiveBills + deductAmount
            );

            const nextSecDepApplied = roundCurrency(
              (targetBill.securityDepositApplied || 0) + deductAmount
            );
            const nextTotalApplied = roundCurrency(
              (targetBill.depositApplied || 0) + deductAmount
            );
            const nextTotalDue = Math.max(
              0,
              roundCurrency(targetBill.totalAmountDue - deductAmount)
            );
            const nextRemaining = Math.max(
              0,
              roundCurrency(targetBill.remainingBalance - deductAmount)
            );
            const nextStatus: BillRecord['status'] =
              nextRemaining <= 0.009
                ? 'paid'
                : targetBill.amountPaid > 0 || nextTotalApplied > 0
                ? 'partial'
                : 'unpaid';

            billUpdatesById.set(targetBill.id, {
              ...targetBill,
              securityDepositApplied: nextSecDepApplied,
              securityDepositRemainingAfterBill: remainingDepositCredit,
              depositApplied: nextTotalApplied,
              totalAmountDue: nextTotalDue,
              remainingBalance: nextRemaining,
              status: nextStatus,
              paidAt: nextStatus === 'paid' ? targetBill.paidAt || nowIso : targetBill.paidAt,
              updatedAt: nowIso,
            });
          }
        }

        const remainingRoomPaidDeposit = Math.max(
          0,
          roundCurrency(availablePaidDeposit - depositUsedOnActiveBills)
        );
        const finalRoomUnpaidBalance =
          depositUsedOnActiveBills > 0
            ? Math.max(
                0,
                roundCurrency(
                  (roomData.unpaidBalance || 0) - depositUsedOnActiveBills
                )
              )
            : roomData.unpaidBalance;

        if (billUpdatesById.size > 0) {
          setBills((prev) =>
            prev.map((b) => billUpdatesById.get(b.id) ?? b)
          );
        }

        setRooms((prev) =>
          prev.map((r) =>
            r.id === existingId
              ? {
                  ...roomData,
                  securityDepositPaid: remainingRoomPaidDeposit,
                  unpaidBalance: finalRoomUnpaidBalance,
                  id: existingId,
                  updatedAt: nowIso,
                }
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

  const executeDeleteRoomAfterPin = (targetRoom: Room) => {
    try {
      const targetId = targetRoom.id;
      const targetName = targetRoom.name;
      const nowIso = new Date().toISOString();

      // Layer 2 Engine Archival Fail-Safe: Archive active tenant to TenantHistoryEntry
      if (targetRoom.tenant) {
        const entry: TenantHistoryEntry = {
          id: `hist-${Date.now()}`,
          roomId: targetRoom.id,
          roomName: targetRoom.name,
          tenantName: targetRoom.tenant.fullName,
          phone: targetRoom.tenant.phone,
          messengerUsername: targetRoom.tenant.messengerUsername,
          moveInDate: targetRoom.tenant.moveInDate,
          moveOutDate: nowIso.slice(0, 10),
          reason: 'Permanent Room Deletion with Security Auth (Archived on Deletion)',
          finalMeterReading: targetRoom.lastMeterReading,
          depositHeld: targetRoom.securityDeposit,
          unpaidBalanceAtMoveOut: targetRoom.unpaidBalance,
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
      setSelectedRoomDetailsId((curr) => (curr === targetId ? null : curr));
      appendAuditLog(
        'Room Removed (Security Verified)',
        `${targetName} permanently removed.`,
        'security'
      );
      triggerFeedback(
        `${targetName} Removed`,
        'Room was permanently deleted after security verification.',
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

  const requestDeleteRoomConfirmation = (room: Room) => {
    if (!room.isArchived && (room.status === 'occupied' || Boolean(room.tenant))) {
      triggerFeedback(
        'Cannot Delete Occupied Room',
        `${room.name} is occupied by ${room.tenant?.fullName || 'a tenant'}. Mark tenant vacated or archive the room first to protect records.`,
        'warning',
        'View Room Ledger',
        () => setSelectedRoomDetailsId(room.id)
      );
      return;
    }
    setPendingConfirmAction({ type: 'delete_room', room });
  };

  const executeArchiveVacantRoom = (targetRoom: Room) => {
    try {
      setRooms((prev) =>
        prev.map((r) =>
          r.id === targetRoom.id
            ? {
                ...r,
                isArchived: true,
                archivedAt: new Date().toISOString(),
              }
            : r
        )
      );
      setSelectedRoomDetailsId((curr) =>
        curr === targetRoom.id ? null : curr
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

  const handleArchiveRoom = (roomId: string) => {
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

    setPendingConfirmAction({ type: 'archive_vacant', room: targetRoom });
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

  const requestMoveOutConfirmation = (
    room: Room,
    defaultReason = 'Stopped Paying Rent / Vacated (Moved to History)'
  ) => {
    if (!room.tenant) return;
    setPendingConfirmAction({ type: 'vacate', room, reason: defaultReason });
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
      setSelectedRoomDetailsId((curr) => (curr === room.id ? null : curr));
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
          const depUsed = Math.max(0, newBill.securityDepositApplied || 0);
          const nextPaidDeposit = Math.max(
            0,
            roundCurrency((r.securityDepositPaid || 0) - depUsed)
          );
          const advUsed = advanceDeductedFromRoom;
          const currentAdv = r.advanceRent || 0;
          const nextAdv = Math.max(
            0,
            roundCurrency(currentAdv - advUsed + overpaymentAddedToAdvance)
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
            securityDepositPaid: nextPaidDeposit,
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
      const targetBill = bills.find((b) => b.id === billId);
      if (!targetBill) return;

      const outcome = applyPaymentWithOverpayment(
        targetBill,
        amount,
        method,
        referenceNo
      );
      const updatedReceiptObj = outcome.updatedBill;
      const targetRoomId = updatedReceiptObj.roomId;
      const newRoomRemaining = updatedReceiptObj.remainingBalance;
      const overpaymentCredited = outcome.overpaymentCredited;
      const receiptNo = updatedReceiptObj.receiptNo;

      setBills((prev) =>
        prev.map((b) => (b.id === billId ? updatedReceiptObj : b))
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
                      note: `Excess payment from Receipt #${receiptNo} credited to Advance Balance (Applies Next Month / Refundable)`,
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
          ? `Paid via ${method}. Excess ₱${overpaymentCredited.toFixed(2)} auto-credited to Advance Balance for next month!`
          : `Paid via ${method} for Receipt #${receiptNo}. Remaining: ₱${newRoomRemaining.toFixed(2)}.`,
        'success',
        'View Official Receipt',
        () => setActiveReceiptBill(updatedReceiptObj)
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

  const requestRecordPayment = (
    billId: string,
    amount: number,
    method: 'Cash' | 'GCash' | 'Maya' | 'Bank Transfer',
    referenceNo?: string,
    onCommitted?: () => void
  ) => {
    const targetBill = bills.find((b) => b.id === billId);
    if (!targetBill) return;
    const excess = Math.max(
      0,
      Math.round((amount - (targetBill.remainingBalance || 0)) * 100) / 100
    );
    if (excess > 0) {
      const mobileAuth = isMobileDevice();
      setPendingAuthAction({
        title: `Authorize Overpayment & Advance Credit`,
        description: `${targetBill.roomName}: Excess ₱${excess.toLocaleString('en-PH', { minimumFractionDigits: 2 })} will credit to Next Month Advance Balance. ${
          mobileAuth ? 'Scan Fingerprint or enter 4-Digit PIN.' : 'Enter your 4-Digit Security PIN.'
        }`,
        onConfirm: () => {
          handleRecordPayment(billId, amount, method, referenceNo);
          onCommitted?.();
        },
      });
      return;
    }
    handleRecordPayment(billId, amount, method, referenceNo);
    onCommitted?.();
  };

  const requestWithdrawAdvance = (
    roomId: string,
    amount: number,
    note: string
  ) => {
    const targetRoom = rooms.find((r) => r.id === roomId);
    const mobileAuth = isMobileDevice();
    setPendingAuthAction({
      title: `Authorize Advance Refund / Withdrawal`,
      description: `Release ₱${amount.toLocaleString('en-PH', { minimumFractionDigits: 2 })} from ${
        targetRoom?.name || 'Room'
      } Advance Balance. ${
        mobileAuth ? 'Verify with Fingerprint or 4-Digit PIN.' : 'Enter your 4-Digit Security PIN.'
      }`,
      onConfirm: () => {
        handleWithdrawAdvance(roomId, amount, note);
        setAdvanceModalRoomId(null);
      },
    });
  };

  const requestAddAdvanceDeposit = (
    roomId: string,
    amount: number,
    note: string
  ) => {
    const targetRoom = rooms.find((r) => r.id === roomId);
    const mobileAuth = isMobileDevice();
    setPendingAuthAction({
      title: `Authorize Advance Payment`,
      description: `Record ₱${amount.toLocaleString('en-PH', { minimumFractionDigits: 2 })} advance credit for ${
        targetRoom?.name || 'Room'
      } (auto-applies to next month). ${
        mobileAuth ? 'Verify with Fingerprint or 4-Digit PIN.' : 'Enter your 4-Digit Security PIN.'
      }`,
      onConfirm: () => {
        handleAddAdvanceDeposit(roomId, amount, note);
        setAdvanceModalRoomId(null);
      },
    });
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

  // Whenever Electric Rates are updated in Settings, reflect instantly across active unpaid receipts
  // while leaving previously applied/archived receipts untouched.
  const applySettingsAndRecalculateBills = (nextSettings: AppSettings) => {
    setSettings(nextSettings);
    const { bills: nextBills, updatedCount, roomUnpaidMap } =
      recalculateActiveBillsForRates(bills, nextSettings);

    if (updatedCount > 0) {
      setBills(nextBills);
      setRooms((prev) =>
        prev.map((r) =>
          Object.prototype.hasOwnProperty.call(roomUnpaidMap, r.id)
            ? {
                ...r,
                unpaidBalance: roomUnpaidMap[r.id],
                updatedAt: new Date().toISOString(),
              }
            : r
        )
      );
    }
    return updatedCount;
  };

  const handleUpdateSettings = (nextSettings: AppSettings) => {
    try {
      const ratesChanged =
        nextSettings.defaultElectricRate !== settings.defaultElectricRate ||
        JSON.stringify(nextSettings.monthlyElectricRates || {}) !==
          JSON.stringify(settings.monthlyElectricRates || {});

      let updatedCount = 0;
      if (ratesChanged) {
        updatedCount = applySettingsAndRecalculateBills(nextSettings);
      } else {
        setSettings(nextSettings);
      }

      const activeMonthRate = getElectricRateForPeriod(
        nextSettings,
        new Date().toISOString()
      );
      triggerFeedback(
        'System Settings Saved',
        updatedCount > 0
          ? `Electric Rate ₱${activeMonthRate.toFixed(2)}/kWh applied to ${updatedCount} active receipt(s). Previous applied receipts remain unchanged.`
          : `Current Month Rate: ₱${activeMonthRate.toFixed(2)}/kWh • Default Rent: ₱${nextSettings.defaultMonthlyRent.toLocaleString('en-PH')}.`,
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

  const handleApplyMonthlyElectricRate = (monthOrPeriod: string, rate: number) => {
    const monthKey = normalizeMonthKey(monthOrPeriod);
    const cleanRate = roundCurrency(Math.max(0, rate));
    const currentKey = normalizeMonthKey();
    const nextSettings: AppSettings = {
      ...settings,
      defaultElectricRate:
        monthKey === currentKey ? cleanRate : settings.defaultElectricRate,
      monthlyElectricRates: {
        ...(settings.monthlyElectricRates || {}),
        [monthKey]: cleanRate,
      },
    };
    const updatedCount = applySettingsAndRecalculateBills(nextSettings);
    appendAuditLog(
      'Monthly Electric Rate Applied',
      `${formatMonthKeyLabel(monthKey, 'long')}: ₱${cleanRate.toFixed(2)}/kWh (${updatedCount} active receipt(s) updated)`,
      'billing'
    );
    triggerFeedback(
      `${formatMonthKeyLabel(monthKey, 'long')} Rate Applied`,
      `₱${cleanRate.toFixed(2)}/kWh reflected on active receipts immediately (previous applied receipts locked).`,
      'success'
    );
    triggerOptionalCloudSync();
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

  const getConfirmModalConfig = () => {
    if (!pendingConfirmAction) {
      return {
        title: '',
        description: '',
        details: [] as string[],
        variant: 'warning' as const,
        iconType: 'warning' as const,
        confirmLabel: 'Confirm',
      };
    }

    if (pendingConfirmAction.type === 'vacate') {
      const room = pendingConfirmAction.room;
      const details = [
        `Sub-meter reading preserved at ${room.lastMeterReading.toFixed(1)} kWh`,
        `Held Security Deposit: ₱${(room.securityDeposit || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`,
      ];
      if (room.advanceRent > 0) {
        details.push(
          `Advance Balance remaining: ₱${room.advanceRent.toFixed(2)} — refund via Advance / Refund if returning to tenant.`
        );
      }
      if (room.unpaidBalance > 0) {
        details.push(
          `Unpaid balance at move-out: ₱${room.unpaidBalance.toFixed(2)}`
        );
      }
      return {
        title: `Mark Tenant Vacated in ${room.name}?`,
        description: `This moves ${room.tenant?.fullName || 'the current tenant'} to Previous Tenants History and sets the room to Vacant.`,
        details,
        variant: 'warning' as const,
        iconType: 'vacate' as const,
        confirmLabel: 'Confirm Tenant Vacated',
        reasonLabel: 'Reason for Moving Out / Vacating',
        reasonOptions: [
          'Stopped Paying Rent / Vacated (Moved to History)',
          'Completed Lease (Moved Out)',
          'Transferred to Another Room',
        ],
        selectedReason: pendingConfirmAction.reason,
      };
    }

    if (pendingConfirmAction.type === 'archive_vacant') {
      return {
        title: `Archive ${pendingConfirmAction.room.name}?`,
        description:
          'Moves this room into the Archive Center. Receipts and tenant history stay safely stored and restorable anytime.',
        details: [] as string[],
        variant: 'info' as const,
        iconType: 'archive' as const,
        confirmLabel: 'Confirm Archive Room',
      };
    }

    const authMethod = isMobileDevice()
      ? 'Fingerprint (or 4-Digit PIN)'
      : '4-Digit Security PIN';
    return {
      title: `Remove ${pendingConfirmAction.room.name} Permanently?`,
      description:
        'Permanent removal deletes the room card after security verification. Historical tenant & bill records stay archived.',
      details: [
        `Final meter reading: ${pendingConfirmAction.room.lastMeterReading.toFixed(1)} kWh`,
        `Next step requires ${authMethod} verification.`,
      ],
      variant: 'danger' as const,
      iconType: 'delete' as const,
      confirmLabel: 'Continue to Security Check',
    };
  };

  const confirmModalConfig = getConfirmModalConfig();

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
            globalElectricRate={getElectricRateForPeriod(
              settings,
              new Date().toISOString()
            )}
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
            globalElectricRate={getElectricRateForPeriod(
              settings,
              new Date().toISOString()
            )}
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
            onRequestDeleteRoomWithPin={requestDeleteRoomConfirmation}
            onArchiveRoom={handleArchiveRoom}
            onMoveOutTenant={requestMoveOutConfirmation}
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
            rooms={rooms}
            privacyMaskEnabled={settings.privacyMaskEnabled}
            onBack={() => setActiveTab('dashboard')}
            onSelectBillForReceipt={(bill) => setActiveReceiptBill(bill)}
            onRecordPayment={requestRecordPayment}
            onOpenAdvanceModal={(room) => setAdvanceModalRoomId(room.id)}
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
            onRequestPermanentDeleteRoom={requestDeleteRoomConfirmation}
            onRestoreBill={handleRestoreBill}
            onSelectBillForReceipt={(bill) => setActiveReceiptBill(bill)}
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
        globalElectricRate={getElectricRateForPeriod(
          settings,
          new Date().toISOString()
        )}
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
        globalElectricRate={getElectricRateForPeriod(
          settings,
          new Date().toISOString()
        )}
        privacyMaskEnabled={settings.privacyMaskEnabled}
        onClose={() => setSelectedRoomDetailsId(null)}
        onEditRoom={(room) => {
          setEditingRoom(room);
          setIsRoomModalOpen(true);
        }}
        onOpenScannerForRoom={(room) => handleOpenScanForRoom(room)}
        onOpenReceipt={(bill) => setActiveReceiptBill(bill)}
        onOpenAdvanceModal={(room) => setAdvanceModalRoomId(room.id)}
        onRequestMoveOutTenant={(room) => requestMoveOutConfirmation(room)}
        onRequestArchiveRoom={handleArchiveRoom}
        onRequestDeleteRoom={requestDeleteRoomConfirmation}
      />

      {/* Dual Sub-Meter OCR Scanner & Bill Generator Modal */}
      <SubMeterScannerModal
        isOpen={isScannerOpen}
        rooms={rooms}
        initialRoom={scannerTargetRoom}
        globalElectricRate={getElectricRateForPeriod(
          settings,
          new Date().toISOString()
        )}
        monthlyElectricRates={settings.monthlyElectricRates}
        securityPin={settings.security?.pinCode || ''}
        onClose={() => setIsScannerOpen(false)}
        onGenerateBill={handleGenerateBill}
      />

      {/* Printable Receipt & Messenger Integration Modal */}
      <ReceiptModal
        bill={
          activeReceiptBill
            ? bills.find((b) => b.id === activeReceiptBill.id) ||
              activeReceiptBill
            : null
        }
        settings={settings}
        onApplyMonthlyRate={handleApplyMonthlyElectricRate}
        onClose={() => setActiveReceiptBill(null)}
      />

      {/* Withdrawable Advance Balance Manager Modal */}
      <AdvanceBalanceModal
        room={activeAdvanceModalRoom}
        onClose={() => setAdvanceModalRoomId(null)}
        onWithdrawAdvance={requestWithdrawAdvance}
        onAddAdvanceDeposit={requestAddAdvanceDeposit}
      />

      {/* Occupied Room Archive Guard & Notification Modal */}
      <OccupiedArchiveGuardModal
        room={roomPendingOccupiedArchive}
        onClose={() => setRoomPendingOccupiedArchive(null)}
        onConfirmArchiveWithReason={handleConfirmOccupiedArchiveWithReason}
      />

      {/* Explicit Action Confirmation Modal (Tenant Vacated, Archive Vacant Room, Remove Room) */}
      <ConfirmActionModal
        isOpen={Boolean(pendingConfirmAction)}
        title={confirmModalConfig.title}
        description={confirmModalConfig.description}
        details={confirmModalConfig.details}
        variant={confirmModalConfig.variant}
        iconType={confirmModalConfig.iconType}
        confirmLabel={confirmModalConfig.confirmLabel}
        reasonLabel={confirmModalConfig.reasonLabel}
        reasonOptions={confirmModalConfig.reasonOptions}
        selectedReason={confirmModalConfig.selectedReason}
        onChangeReason={(reason) => {
          setPendingConfirmAction((curr) =>
            curr && curr.type === 'vacate' ? { ...curr, reason } : curr
          );
        }}
        onCancel={() => setPendingConfirmAction(null)}
        onConfirm={() => {
          if (!pendingConfirmAction) return;
          const action = pendingConfirmAction;
          setPendingConfirmAction(null);

          if (action.type === 'vacate') {
            handleMoveOutTenant(action.room, action.reason);
          } else if (action.type === 'archive_vacant') {
            executeArchiveVacantRoom(action.room);
          } else if (action.type === 'delete_room') {
            const mobileAuth = isMobileDevice();
            setPendingAuthAction({
              title: `Remove ${action.room.name}?`,
              description: mobileAuth
                ? 'Verify with Fingerprint (or 4-Digit PIN) to permanently remove this room.'
                : 'Enter your 4-Digit Security PIN to permanently remove this room.',
              onConfirm: () => executeDeleteRoomAfterPin(action.room),
            });
          }
        }}
      />

      {/* Security Auth Modal (Mobile Fingerprint / Desktop 4-Digit PIN) for Room Removal, Advance Payments & Refunds */}
      <PinAuthModal
        isOpen={Boolean(pendingAuthAction)}
        title={pendingAuthAction?.title}
        description={pendingAuthAction?.description}
        security={settings.security}
        onClose={() => setPendingAuthAction(null)}
        onAuthorized={() => {
          const action = pendingAuthAction;
          setPendingAuthAction(null);
          if (action) action.onConfirm();
        }}
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
