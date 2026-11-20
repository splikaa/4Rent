import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  Bell,
  Calendar,
  Check,
  Cloud,
  Copy,
  Database,
  Download,
  Eye,
  EyeOff,
  FileCheck2,
  Fingerprint,
  Laptop,
  Loader2,
  Lock,
  Plus,
  RefreshCw,
  Save,
  Share2,
  Shield,
  ShieldCheck,
  Smartphone,
  Upload,
  Wifi,
  WifiOff,
  Zap,
} from 'lucide-react';
import {
  AppDatabaseSnapshot,
  AppSettings,
  SecurityAuditEntry,
} from '../../types/rental';
import {
  exportDatabaseSnapshot,
  importDatabaseSnapshot,
  loadAuditLogs,
  saveSettings,
} from '../../services/storageService';
import {
  generatePropertyCode,
  getMobileCodeMonthlyLock,
  getNetworkStatus,
  normalizePropertyCode,
  FIREBASE_RULES_JSON,
} from '../../services/firebaseSync';
import { requestAndVerifyNotifications } from '../../services/notificationService';
import {
  isDeviceBiometricsAvailable,
  registerDeviceBiometrics,
} from '../../services/authService';
import {
  formatMonthKeyLabel,
  formatPhoneNumber,
  getScheduledMonthKeys,
  isMobileDevice,
  normalizeMonthKey,
  roundCurrency,
} from '../../utils/billingCalculator';
import {
  getBillingMonthSchedule,
  getCurrentBillingMonthKey,
  updateIndependentMonthlyElectricRate,
} from '../../utils/rentSchedule';
import { resolveConfiguredPropertyCode } from '../../utils/propertyCode';
import { applyPropertyCodeAndSync } from '../../services/propertySpaceSwitch';

const DECIMAL_INPUT_REGEX = /^\d*\.?\d*$/;

function sanitizeDecimalInput(raw: string): string | null {
  const cleaned = raw.replace(/,/g, '').trim();
  if (cleaned === '') return '';
  if (!DECIMAL_INPUT_REGEX.test(cleaned)) return null;
  return cleaned;
}

function buildVisibleMonthKeys(
  monthlyRates?: Record<string, number>
): string[] {
  const ytdKeys = getScheduledMonthKeys(new Date(), 0, monthlyRates);
  const currentKey = normalizeMonthKey();
  const keySet = new Set<string>(ytdKeys);
  if (monthlyRates) {
    Object.keys(monthlyRates).forEach((k) => {
      if (/^\d{4}-\d{2}$/.test(k) && k <= currentKey) {
        keySet.add(k);
      }
    });
  }
  return Array.from(keySet).sort();
}

function buildInitialMonthlyDrafts(
  settings: AppSettings,
  monthKeys: string[]
): Record<string, string> {
  const drafts: Record<string, string> = {};
  for (const mk of monthKeys) {
    const explicit = settings.monthlyElectricRates?.[mk];
    drafts[mk] =
      typeof explicit === 'number' && Number.isFinite(explicit)
        ? String(explicit)
        : String(settings.defaultElectricRate);
  }
  return drafts;
}

export interface ReloadAllDataOptions {
  switchToDashboard?: boolean;
  title?: string;
  message?: string;
}

interface SettingsViewProps {
  settings: AppSettings;
  onBack: () => void;
  onUpdateSettings: (newSettings: AppSettings) => void;
  onReloadAllData: (options?: ReloadAllDataOptions) => void;
  onOpenSecuritySetup: () => void;
  onInstallDesktopApp?: () => void;
  onOpenDownloadModal?: () => void;
  isInstalledStandalone?: boolean;
  isDesktop?: boolean;
  isMobile?: boolean;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  settings,
  onBack,
  onUpdateSettings,
  onReloadAllData,
  onOpenSecuritySetup,
  onOpenDownloadModal,
  isInstalledStandalone = false,
  isDesktop = false,
  isMobile = isMobileDevice(),
}) => {
  const [form, setForm] = useState<AppSettings>(settings);
  const [defaultRateDraft, setDefaultRateDraft] = useState<string>(() =>
    String(settings.defaultElectricRate)
  );
  const [defaultRentDraft, setDefaultRentDraft] = useState<string>(() =>
    String(settings.defaultMonthlyRent)
  );
  const [monthlyRateDrafts, setMonthlyRateDrafts] = useState<
    Record<string, string>
  >(() =>
    buildInitialMonthlyDrafts(
      settings,
      buildVisibleMonthKeys(settings.monthlyElectricRates)
    )
  );
  const [editedMonthKeys, setEditedMonthKeys] = useState<Record<string, boolean>>(
    {}
  );
  const [latePenaltyValueDraft, setLatePenaltyValueDraft] = useState<string>(() =>
    settings.latePenalty?.value !== null &&
    settings.latePenalty?.value !== undefined
      ? String(settings.latePenalty.value)
      : ''
  );
  const [validationErrors, setValidationErrors] = useState<
    Record<string, string>
  >({});
  const [customRateError, setCustomRateError] = useState<string | null>(null);

  const [mobileCodeDraft, setMobileCodeDraft] = useState<string>(
    () => resolveConfiguredPropertyCode(settings.cloudSync.propertyCode)
  );
  const [isApplyingMobileCode, setIsApplyingMobileCode] = useState(false);
  const [customMonthInput, setCustomMonthInput] = useState(() =>
    normalizeMonthKey()
  );
  const [customRateInput, setCustomRateInput] = useState('');
  const [statusBanner, setStatusBanner] = useState<string | null>(null);

  useEffect(() => {
    setForm(settings);
    setDefaultRateDraft(String(settings.defaultElectricRate));
    setDefaultRentDraft(String(settings.defaultMonthlyRent));
    const keys = buildVisibleMonthKeys(settings.monthlyElectricRates);
    setMonthlyRateDrafts(buildInitialMonthlyDrafts(settings, keys));
    setEditedMonthKeys({});
    setLatePenaltyValueDraft(
      settings.latePenalty?.value !== null &&
        settings.latePenalty?.value !== undefined
        ? String(settings.latePenalty.value)
        : ''
    );
    setValidationErrors({});
    setMobileCodeDraft(resolveConfiguredPropertyCode(settings.cloudSync.propertyCode));
  }, [settings]);

  const visibleMonthKeys = buildVisibleMonthKeys(form.monthlyElectricRates);
  const currentBillingSchedule = getBillingMonthSchedule(
    getCurrentBillingMonthKey()
  );

  const mobileLock = getMobileCodeMonthlyLock(form.cloudSync);
  const committedPropertyCode = resolveConfiguredPropertyCode(
    settings.cloudSync?.propertyCode
  );
  const draftPropertyCode = resolveConfiguredPropertyCode(
    isMobile ? mobileCodeDraft : form.cloudSync?.propertyCode
  );
  const isPropertyCodeChanged =
    draftPropertyCode !== committedPropertyCode &&
    (!isMobile || !mobileLock.isLockedThisMonth);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isVerifyingNotification, setIsVerifyingNotification] = useState(false);
  const [isEnrollingBiometrics, setIsEnrollingBiometrics] = useState(false);
  const [bioSupportReason, setBioSupportReason] = useState<string | null>(null);

  useEffect(() => {
    isDeviceBiometricsAvailable().then((info) => {
      if (!info.supported && info.reason) setBioSupportReason(info.reason);
    });
  }, []);
  const [showDevCloudConfig, setShowDevCloudConfig] = useState(false);
  const [showAuditLogs, setShowAuditLogs] = useState(false);
  const [copiedSql, setCopiedSql] = useState(false);
  const [copiedSyncCode, setCopiedSyncCode] = useState(false);
  const [copiedMobileLink, setCopiedMobileLink] = useState(false);
  const [copiedExeDirect, setCopiedExeDirect] = useState(false);
  const [copiedApkDirect, setCopiedApkDirect] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [networkInfo, setNetworkInfo] = useState(() => getNetworkStatus());

  useEffect(() => {
    const updateNet = () => setNetworkInfo(getNetworkStatus());
    window.addEventListener('online', updateNet);
    window.addEventListener('offline', updateNet);
    const interval = setInterval(updateNet, 5000);
    return () => {
      window.removeEventListener('online', updateNet);
      window.removeEventListener('offline', updateNet);
      clearInterval(interval);
    };
  }, []);

  const auditLogs: SecurityAuditEntry[] = loadAuditLogs();

  const executePropertyCodeAndSync = async (
    targetCode: string,
    mobileInitiated = false
  ) => {
    const net = getNetworkStatus();
    if (mobileInitiated) {
      setIsApplyingMobileCode(true);
    } else {
      setIsSyncing(true);
    }
    setStatusBanner(null);

    try {
      // Only stamp a fresh updatedAt and persist form before syncing if the user edited configuration fields in Settings
      const stripVolatileSettings = (s: AppSettings) => ({
        apartmentName: s.apartmentName,
        landlordName: s.landlordName,
        landlordPhone: s.landlordPhone,
        landlordMessenger: s.landlordMessenger,
        paymentInstructions: s.paymentInstructions,
        defaultElectricRate: s.defaultElectricRate,
        monthlyElectricRates: s.monthlyElectricRates || {},
        defaultMonthlyRent: s.defaultMonthlyRent,
        defaultSecurityDeposit: s.defaultSecurityDeposit,
        latePenalty: s.latePenalty,
        advanceCapMode: s.advanceCapMode,
        receiptPrintFormat: s.receiptPrintFormat,
        maskReceiptContacts: s.maskReceiptContacts,
      });
      const hasUnsavedConfigEdits =
        JSON.stringify(stripVolatileSettings(form)) !==
        JSON.stringify(stripVolatileSettings(settings));
      if (hasUnsavedConfigEdits) {
        saveSettings({
          ...form,
          updatedAt: new Date().toISOString(),
        });
      }

      // Manual Sync button click should always attempt the cloud request even if the browser/WebView
      // online indicator lags right after turning on Wi-Fi or Mobile Data.
      const result = await applyPropertyCodeAndSync({
        previousCode: committedPropertyCode,
        targetCloudSync: {
          ...form.cloudSync,
          enabled: true,
          provider: 'firebase',
          propertyCode: targetCode,
        },
        isOnline: true,
        networkLabel: net.isOnline ? net.label : 'Wi-Fi / Mobile Data',
        isMobile,
        mobileLock,
      });

      if (!result.ok) {
        setStatusBanner(result.message);
        return;
      }

      const nextSettings: AppSettings = {
        ...form,
        cloudSync: result.appliedCloudSync,
      };

      if (result.mode === 'switched-existing' || result.mode === 'switched-new') {
        onReloadAllData({
          switchToDashboard: true,
          title:
            result.mode === 'switched-existing'
              ? `Property Space "${result.appliedCloudSync.propertyCode}" Loaded`
              : `New Property Space "${result.appliedCloudSync.propertyCode}" Reset & Synced`,
          message: result.message,
        });
        return;
      }

      if (result.requiresReload) {
        onReloadAllData({
          title: 'Cloud Database Synced',
          message: result.message,
        });
      } else {
        setForm(nextSettings);
        onUpdateSettings(nextSettings);
      }
      setStatusBanner(result.message);
    } catch {
      setStatusBanner('Could not complete cloud sync. Current local data was kept safe.');
    } finally {
      if (mobileInitiated) {
        setIsApplyingMobileCode(false);
      } else {
        setIsSyncing(false);
      }
    }
  };

  const handleSaveGeneral = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isPropertyCodeChanged) {
      await executePropertyCodeAndSync(draftPropertyCode, false);
      return;
    }

    const nextErrors: Record<string, string> = {};

    const trimmedDefaultRate = defaultRateDraft.trim();
    const parsedDefaultRate =
      trimmedDefaultRate === '' ? Number.NaN : Number(trimmedDefaultRate);
    if (
      trimmedDefaultRate === '' ||
      !Number.isFinite(parsedDefaultRate) ||
      parsedDefaultRate < 0
    ) {
      nextErrors.defaultElectricRate =
        'Enter a valid non-negative default electric rate (e.g., 12.50).';
    }

    const trimmedDefaultRent = defaultRentDraft.trim();
    const parsedDefaultRent =
      trimmedDefaultRent === '' ? Number.NaN : Number(trimmedDefaultRent);
    if (
      trimmedDefaultRent === '' ||
      !Number.isFinite(parsedDefaultRent) ||
      parsedDefaultRent < 0
    ) {
      nextErrors.defaultMonthlyRent =
        'Enter a valid non-negative default monthly rent.';
    }

    // Preserve all existing historical monthly rates, and update each edited/explicit month independently
    let nextMonthlyRates: Record<string, number> = {
      ...(form.monthlyElectricRates || {}),
    };
    for (const monthKey of visibleMonthKeys) {
      const hasExistingExplicit =
        form.monthlyElectricRates !== undefined &&
        Object.prototype.hasOwnProperty.call(form.monthlyElectricRates, monthKey);
      const wasEdited = Boolean(editedMonthKeys[monthKey]);
      const draftRaw = (monthlyRateDrafts[monthKey] ?? '').trim();

      if (draftRaw === '') {
        nextErrors[`month:${monthKey}`] = 'Enter a valid rate before saving.';
        continue;
      }
      const parsedMonthRate = Number(draftRaw);
      if (!Number.isFinite(parsedMonthRate) || parsedMonthRate < 0) {
        nextErrors[`month:${monthKey}`] = 'Rate must be a valid non-negative number.';
        continue;
      }

      if (wasEdited || hasExistingExplicit) {
        nextMonthlyRates = updateIndependentMonthlyElectricRate(
          {
            defaultElectricRate: form.defaultElectricRate,
            monthlyElectricRates: nextMonthlyRates,
          },
          monthKey,
          parsedMonthRate
        );
      }
    }

    // Validate configurable late charges (supports automatic daily_rent or custom fixed/percentage)
    const currentPenalty = form.latePenalty || {
      enabled: true,
      mode: 'daily_rent' as const,
      value: null,
      applyPerDay: true,
    };
    const trimmedPenalty = latePenaltyValueDraft.trim();
    let parsedPenaltyValue: number | null = null;
    if (currentPenalty.mode !== 'daily_rent' && trimmedPenalty !== '') {
      const num = Number(trimmedPenalty);
      if (!Number.isFinite(num) || num < 0) {
        nextErrors.latePenaltyValue = 'Enter a valid non-negative late charges value.';
      } else if (currentPenalty.mode === 'percentage' && num > 100) {
        nextErrors.latePenaltyValue = 'Percentage late charges cannot exceed 100%.';
      } else {
        parsedPenaltyValue = roundCurrency(num);
      }
    }

    if (currentPenalty.enabled && currentPenalty.mode !== 'daily_rent') {
      if (parsedPenaltyValue === null || parsedPenaltyValue <= 0) {
        nextErrors.latePenaltyValue =
          currentPenalty.mode === 'percentage'
            ? 'Enter a late charges percentage greater than 0 (e.g., 5) or switch to Daily Divided Rent.'
            : 'Enter a fixed late charges amount greater than ₱0 (e.g., 200) or switch to Daily Divided Rent.';
      }
    }

    if (Object.keys(nextErrors).length > 0) {
      setValidationErrors(nextErrors);
      setStatusBanner(
        'Please fix the highlighted rate or late charges fields before saving.'
      );
      return;
    }

    setValidationErrors({});
    const normalizedForm: AppSettings = {
      ...form,
      defaultElectricRate: roundCurrency(parsedDefaultRate),
      defaultMonthlyRent: roundCurrency(parsedDefaultRent),
      monthlyElectricRates: nextMonthlyRates,
      latePenalty: {
        ...currentPenalty,
        value: currentPenalty.mode === 'daily_rent' ? null : parsedPenaltyValue,
      },
      updatedAt: new Date().toISOString(),
      cloudSync: {
        ...form.cloudSync,
        propertyCode: resolveConfiguredPropertyCode(form.cloudSync?.propertyCode),
      },
    };
    setForm(normalizedForm);
    setEditedMonthKeys({});
    onUpdateSettings(normalizedForm);
    setStatusBanner('Settings saved successfully.');
    setTimeout(() => setStatusBanner(null), 3000);
  };

  /**
   * Applies any changed Property Space Code (loading existing cloud data or resetting cleanly
   * for a brand-new code) and syncs with Firebase.
   */
  const handleSmartSync = async () => {
    const targetCode =
      isMobile && mobileLock.isLockedThisMonth
        ? committedPropertyCode
        : draftPropertyCode;
    await executePropertyCodeAndSync(targetCode, false);
  };

  /**
   * Mobile Property Space Code application (once per month on Mobile).
   * Loads existing cloud space or resets & initializes a brand-new space cleanly.
   */
  const handleApplyMobilePropertyCode = async () => {
    if (!isMobile) return;
    const nextCode = normalizePropertyCode(mobileCodeDraft);
    if (nextCode.length < 4) {
      setStatusBanner('Enter a valid Property Space Code (at least 4 characters).');
      return;
    }
    if (mobileLock.isLockedThisMonth && nextCode !== committedPropertyCode) {
      setStatusBanner(
        `Monthly limit reached: code already applied this month. Next change opens ${mobileLock.nextEligibleMonthLabel}.`
      );
      return;
    }

    await executePropertyCodeAndSync(nextCode, true);
  };

  /**
   * Requires and verifies notification permission on the OS
   */
  const handleVerifyNotificationPermission = async () => {
    setIsVerifyingNotification(true);
    setStatusBanner(null);
    try {
      const res = await requestAndVerifyNotifications();
      setIsVerifyingNotification(false);

      const nextSettings: AppSettings = {
        ...form,
        remindersEnabled: res.granted,
        notificationsVerified: res.verified,
        remindersPromptShown: true,
      };
      setForm(nextSettings);
      onUpdateSettings(nextSettings);
      setStatusBanner(res.message);
    } catch {
      setIsVerifyingNotification(false);
      setStatusBanner('Could not verify notifications. Check phone/browser settings.');
    }
  };

  const handleExportBackup = () => {
    const snapshot = exportDatabaseSnapshot();
    const dataStr =
      'data:text/json;charset=utf-8,' +
      encodeURIComponent(JSON.stringify(snapshot, null, 2));
    const a = document.createElement('a');
    a.href = dataStr;
    a.download = `4Rent-Database-Backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setStatusBanner('Database backup downloaded.');
  };

  const handleImportBackup = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const parsed: AppDatabaseSnapshot = JSON.parse(
          evt.target?.result as string
        );
        if (Array.isArray(parsed.rooms)) {
          importDatabaseSnapshot(parsed);
          onReloadAllData();
          setStatusBanner('Database restored successfully.');
        } else {
          setStatusBanner('Invalid backup file format.');
        }
      } catch {
        setStatusBanner('Invalid backup file.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const toggleInstantSetting = (patch: Partial<AppSettings>) => {
    const next: AppSettings = {
      ...form,
      ...patch,
    };
    setForm(next);
    onUpdateSettings(next);
  };

  const getPropertyCodeHint = (): string => {
    if (isPropertyCodeChanged) {
      return `Code changed (${committedPropertyCode} -> ${draftPropertyCode}). Tap "Apply Code & Sync Push" to load its cloud data, or reset the dashboard cleanly if this is a brand-new code.`;
    }
    if (!isMobile) {
      return 'Enter any Property Space Code and tap Apply Code & Sync Push: existing cloud codes load their saved records cleanly, while brand-new codes reset the dashboard and initialize a fresh space.';
    }
    if (mobileLock.isLockedThisMonth) {
      return `Active code (${committedPropertyCode}) applied for ${formatMonthKeyLabel(mobileLock.currentMonthKey, 'long')}. Code changes are limited to once per month on mobile.`;
    }
    return 'Enter a code from Desktop/Web or a new code and tap Apply Code & Sync Push. Existing codes load their cloud records; new codes reset this device cleanly (allowed once per month on mobile).';
  };

  return (
    <div className="min-h-screen flex flex-col bg-transparent pb-32 animate-view-enter">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-[#111722]/90 backdrop-blur-xl border-b border-[#232E42] px-4 sm:px-8 h-16 flex items-center justify-between">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to Dashboard"
          className="w-10 h-10 rounded-2xl bg-[#172030] hover:bg-[#1E293D] border border-[#26334B] flex items-center justify-center text-slate-200 transition cursor-pointer btn-fluid"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="text-center">
          <h1 className="text-base sm:text-lg font-extrabold text-white tracking-tight">
            Settings & Sync
          </h1>
          <p className="text-[11px] text-slate-400">
            {networkInfo.label} • v1.0.1
          </p>
        </div>
        <div className="w-10" />
      </header>

      {/* Main Container */}
      <div className="w-full max-w-4xl mx-auto px-4 sm:px-8 pt-6 space-y-6">
        {statusBanner && (
          <div className="rounded-2xl bg-amber-500/15 border border-amber-500/35 px-4 py-3 text-xs sm:text-sm font-semibold text-amber-300 shadow-lg animate-view-enter">
            {statusBanner}
          </div>
        )}

        {/* 1. Property & Sub-Meter Rate */}
        <form
          onSubmit={handleSaveGeneral}
          className="surface-card rounded-3xl p-5 sm:p-7 space-y-5"
        >
          <div className="flex items-center gap-3 pb-3 border-b border-[#232F44]">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-extrabold text-white">
                Property & Rates
              </h2>
              <p className="text-xs text-slate-400">
                Centralized rate for all room meters and bills
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Property Name
              </label>
              <input
                type="text"
                value={form.apartmentName}
                onChange={(e) =>
                  setForm({ ...form, apartmentName: e.target.value })
                }
                className="w-full h-10 rounded-xl bg-[#0D121B] border border-[#263248] px-3.5 text-xs sm:text-sm text-white focus:border-amber-500 focus:outline-none transition"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Admin Mobile Number
              </label>
              <input
                type="tel"
                value={form.landlordPhone}
                onChange={(e) =>
                  setForm({
                    ...form,
                    landlordPhone: formatPhoneNumber(e.target.value),
                  })
                }
                className="w-full h-10 rounded-xl bg-[#0D121B] border border-[#263248] px-3.5 text-xs sm:text-sm text-white font-mono-num focus:border-amber-500 focus:outline-none transition"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-amber-400 mb-1.5">
                Default Electric Rate Fallback (₱ / kWh)
              </label>
              <input
                type="text"
                inputMode="decimal"
                placeholder="e.g., 12.50"
                value={defaultRateDraft}
                onChange={(e) => {
                  const next = sanitizeDecimalInput(e.target.value);
                  if (next === null) return;
                  setDefaultRateDraft(next);
                  setValidationErrors((prev) => {
                    if (!prev.defaultElectricRate) return prev;
                    const copy = { ...prev };
                    delete copy.defaultElectricRate;
                    return copy;
                  });
                }}
                className={`w-full h-10 rounded-xl bg-[#0D121B] border px-3.5 text-xs sm:text-sm font-bold text-amber-400 font-mono-num focus:outline-none transition ${
                  validationErrors.defaultElectricRate
                    ? 'border-red-500/80 focus:border-red-400'
                    : 'border-amber-500/40 focus:border-amber-500'
                }`}
              />
              {validationErrors.defaultElectricRate ? (
                <p className="text-[11px] text-red-400 mt-1">
                  {validationErrors.defaultElectricRate}
                </p>
              ) : (
                <p className="text-[10px] text-slate-500 mt-1">
                  Used only for months without their own independent rate.
                </p>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Default Monthly Unit Rent (₱)
              </label>
              <input
                type="text"
                inputMode="decimal"
                placeholder="e.g., 4500"
                value={defaultRentDraft}
                onChange={(e) => {
                  const next = sanitizeDecimalInput(e.target.value);
                  if (next === null) return;
                  setDefaultRentDraft(next);
                  setValidationErrors((prev) => {
                    if (!prev.defaultMonthlyRent) return prev;
                    const copy = { ...prev };
                    delete copy.defaultMonthlyRent;
                    return copy;
                  });
                }}
                className={`w-full h-10 rounded-xl bg-[#0D121B] border px-3.5 text-xs sm:text-sm font-bold text-white font-mono-num focus:outline-none transition ${
                  validationErrors.defaultMonthlyRent
                    ? 'border-red-500/80 focus:border-red-400'
                    : 'border-[#263248] focus:border-amber-500'
                }`}
              />
              {validationErrors.defaultMonthlyRent && (
                <p className="text-[11px] text-red-400 mt-1">
                  {validationErrors.defaultMonthlyRent}
                </p>
              )}
            </div>
          </div>

          {/* Monthly Electric Rate Schedule (Independent per month) */}
          <div className="pt-4 border-t border-[#232F44] space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-xs sm:text-sm font-extrabold text-white flex items-center gap-1.5">
                  <Zap className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>Monthly Electric Rate Schedule (₱ / kWh)</span>
                </h3>
                <p className="text-[11px] text-slate-400 mt-0.5 leading-snug">
                  Each month stores its own independent rate. Editing one month never alters other months or historical finalized bills.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5 sm:gap-3">
              {visibleMonthKeys.map((monthKey) => {
                const draftVal = monthlyRateDrafts[monthKey] ?? '';
                const currentKey = normalizeMonthKey();
                const isCurrent = monthKey === currentKey;
                const hasCustomRate =
                  form.monthlyElectricRates !== undefined &&
                  Object.prototype.hasOwnProperty.call(
                    form.monthlyElectricRates,
                    monthKey
                  );
                const monthError = validationErrors[`month:${monthKey}`];
                return (
                  <div
                    key={monthKey}
                    className={`rounded-2xl bg-[#0D121B] border p-3 ${
                      monthError
                        ? 'border-red-500/70'
                        : isCurrent
                        ? 'border-amber-500/45'
                        : 'border-[#263248]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1.5 mb-1.5">
                      <label
                        htmlFor={`month-rate-${monthKey}`}
                        className="text-xs font-bold text-white flex items-center gap-1 min-w-0 truncate"
                      >
                        <Calendar className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                        <span className="truncate">
                          {formatMonthKeyLabel(monthKey, 'short')}
                        </span>
                      </label>
                      {isCurrent ? (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 shrink-0">
                          Current
                        </span>
                      ) : hasCustomRate ? (
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-slate-800 text-slate-300 shrink-0">
                          Custom
                        </span>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-bold text-amber-400">₱</span>
                      <input
                        id={`month-rate-${monthKey}`}
                        data-month-key={monthKey}
                        type="text"
                        inputMode="decimal"
                        placeholder="0.00"
                        value={draftVal}
                        onChange={(e) => {
                          const next = sanitizeDecimalInput(e.target.value);
                          if (next === null) return;
                          setMonthlyRateDrafts((prev) => ({
                            ...prev,
                            [monthKey]: next,
                          }));
                          setEditedMonthKeys((prev) => ({
                            ...prev,
                            [monthKey]: true,
                          }));
                          setValidationErrors((prev) => {
                            const errKey = `month:${monthKey}`;
                            if (!prev[errKey]) return prev;
                            const copy = { ...prev };
                            delete copy[errKey];
                            return copy;
                          });
                        }}
                        className={`w-full h-9 rounded-xl bg-[#131B29] border px-2.5 text-sm font-bold text-amber-400 font-mono-num focus:outline-none ${
                          monthError
                            ? 'border-red-500/80 focus:border-red-400'
                            : 'border-[#263248] focus:border-amber-500'
                        }`}
                      />
                      <span className="text-[11px] text-slate-400 shrink-0">
                        /kWh
                      </span>
                    </div>
                    {monthError && (
                      <p className="text-[10px] text-red-400 mt-1 leading-tight">
                        {monthError}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Add / Override Any Custom Month */}
            <div className="rounded-2xl bg-[#0D121B] border border-[#232F44] p-3 space-y-2">
              <div className="flex flex-col sm:flex-row sm:items-end gap-2.5">
                <div className="flex-1 min-w-0">
                  <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                    Add / Edit Specific Month
                  </label>
                  <input
                    type="month"
                    max={normalizeMonthKey()}
                    value={customMonthInput}
                    onChange={(e) => {
                      setCustomMonthInput(e.target.value);
                      setCustomRateError(null);
                    }}
                    className="w-full h-9 rounded-xl bg-[#131B29] border border-[#263248] px-3 text-xs text-white focus:border-amber-500 focus:outline-none"
                  />
                </div>
                <div className="w-full sm:w-40">
                  <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                    Rate (₱/kWh)
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder="e.g., 12.50"
                    value={customRateInput}
                    onChange={(e) => {
                      const next = sanitizeDecimalInput(e.target.value);
                      if (next === null) return;
                      setCustomRateInput(next);
                      setCustomRateError(null);
                    }}
                    className={`w-full h-9 rounded-xl bg-[#131B29] border px-3 text-xs font-bold text-amber-400 font-mono-num focus:outline-none ${
                      customRateError
                        ? 'border-red-500/80 focus:border-red-400'
                        : 'border-[#263248] focus:border-amber-500'
                    }`}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const key = normalizeMonthKey(customMonthInput);
                    const currentKey = normalizeMonthKey();
                    if (key > currentKey) {
                      setCustomRateError(
                        `Future months (${formatMonthKeyLabel(key, 'long')}) are not available yet.`
                      );
                      return;
                    }
                    const trimmed = customRateInput.trim();
                    const rate = trimmed === '' ? Number.NaN : Number(trimmed);
                    if (!key || !Number.isFinite(rate) || rate < 0) {
                      setCustomRateError(
                        'Enter a valid non-negative electricity rate (e.g., 12.50).'
                      );
                      return;
                    }
                    const nextRates = updateIndependentMonthlyElectricRate(
                      form,
                      key,
                      rate,
                      visibleMonthKeys
                    );
                    const nextSettings: AppSettings = {
                      ...form,
                      monthlyElectricRates: nextRates,
                    };
                    setForm(nextSettings);
                    setMonthlyRateDrafts((prev) => ({
                      ...prev,
                      [key]: String(nextRates[key]),
                    }));
                    setCustomRateInput('');
                    setCustomRateError(null);
                    onUpdateSettings(nextSettings);
                    setStatusBanner(
                      `Saved independent rate for ${formatMonthKeyLabel(key, 'long')}: ₱${nextRates[key].toFixed(2)}/kWh (other months unchanged).`
                    );
                  }}
                  className="h-9 px-3.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 text-xs font-bold text-amber-300 flex items-center justify-center gap-1.5 cursor-pointer shrink-0"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Apply Month Rate</span>
                </button>
              </div>
              {customRateError && (
                <p className="text-[11px] text-red-400">{customRateError}</p>
              )}
            </div>
          </div>

          {/* Monthly Payment Schedule & Configurable Late Charges */}
          <div className="pt-4 border-t border-[#232F44] space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-xs sm:text-sm font-extrabold text-white flex items-center gap-1.5">
                  <Calendar className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>Monthly Rent Payment Schedule &amp; Late Charges</span>
                </h3>
                <p className="text-[11px] text-slate-400 mt-0.5 leading-snug">
                  Payment Period: <span className="text-slate-200 font-semibold">1st - 10th of each billing month</span>. Late charges start on the <span className="text-amber-300 font-semibold">11th day</span>. Active cycle: {currentBillingSchedule.billingPeriodLabel} (Due {currentBillingSchedule.dueDateLabel}).
                </p>
              </div>
              <label className="inline-flex items-center gap-2 cursor-pointer select-none px-3 py-1.5 rounded-xl bg-[#0D121B] border border-[#263248]">
                <input
                  type="checkbox"
                  checked={Boolean(form.latePenalty?.enabled)}
                  onChange={(e) => {
                    const enabled = e.target.checked;
                    setForm((prev) => ({
                      ...prev,
                      latePenalty: {
                        mode: prev.latePenalty?.mode || 'daily_rent',
                        value: prev.latePenalty?.value ?? null,
                        applyPerDay: prev.latePenalty?.applyPerDay ?? true,
                        enabled,
                      },
                    }));
                    setValidationErrors((prev) => {
                      if (!prev.latePenaltyValue) return prev;
                      const copy = { ...prev };
                      delete copy.latePenaltyValue;
                      return copy;
                    });
                  }}
                  className="w-4 h-4 rounded accent-amber-500 cursor-pointer"
                />
                <span className="text-xs font-bold text-white">
                  {form.latePenalty?.enabled
                    ? 'Late Charges Enabled'
                    : 'Late Charges Off'}
                </span>
              </label>
            </div>

            <div className="rounded-2xl bg-[#0D121B] border border-[#263248] p-3.5 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                    Late Charges Type
                  </label>
                  <select
                    value={form.latePenalty?.mode || 'daily_rent'}
                    onChange={(e) => {
                      const mode =
                        e.target.value === 'percentage'
                          ? 'percentage'
                          : e.target.value === 'fixed'
                          ? 'fixed'
                          : 'daily_rent';
                      setForm((prev) => ({
                        ...prev,
                        latePenalty: {
                          enabled: Boolean(prev.latePenalty?.enabled),
                          value: mode === 'daily_rent' ? null : (prev.latePenalty?.value ?? null),
                          applyPerDay:
                            mode === 'daily_rent'
                              ? true
                              : Boolean(prev.latePenalty?.applyPerDay),
                          mode,
                        },
                      }));
                    }}
                    className="w-full h-9 rounded-xl bg-[#131B29] border border-[#263248] px-3 text-xs font-semibold text-white focus:border-amber-500 focus:outline-none"
                  >
                    <option value="daily_rent">Daily Divided Rent (Rent ÷ Days)</option>
                    <option value="fixed">Fixed Amount (₱)</option>
                    <option value="percentage">Percentage of Rent (%)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                    {(form.latePenalty?.mode || 'daily_rent') === 'daily_rent'
                      ? 'Daily Divided Formula'
                      : (form.latePenalty?.mode || 'fixed') === 'percentage'
                      ? 'Late Charges Percentage (%)'
                      : 'Late Charges Amount (₱)'}
                  </label>
                  {(form.latePenalty?.mode || 'daily_rent') === 'daily_rent' ? (
                    <div className="w-full h-9 rounded-xl bg-[#131B29] border border-[#263248] px-3 flex items-center text-xs font-bold text-amber-400 font-mono-num">
                      Rent ÷ Days in Month / day
                    </div>
                  ) : (
                    <input
                      type="text"
                      inputMode="decimal"
                      placeholder={
                        (form.latePenalty?.mode || 'fixed') === 'percentage'
                          ? 'Set % (e.g., 5)'
                          : 'Set ₱ (e.g., 200)'
                      }
                      value={latePenaltyValueDraft}
                      onChange={(e) => {
                        const next = sanitizeDecimalInput(e.target.value);
                        if (next === null) return;
                        setLatePenaltyValueDraft(next);
                        setValidationErrors((prev) => {
                          if (!prev.latePenaltyValue) return prev;
                          const copy = { ...prev };
                          delete copy.latePenaltyValue;
                          return copy;
                        });
                      }}
                      className={`w-full h-9 rounded-xl bg-[#131B29] border px-3 text-xs font-bold text-amber-400 font-mono-num focus:outline-none ${
                        validationErrors.latePenaltyValue
                          ? 'border-red-500/80 focus:border-red-400'
                          : 'border-[#263248] focus:border-amber-500'
                      }`}
                    />
                  )}
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                    Charging Frequency (From Day 11)
                  </label>
                  <select
                    value={form.latePenalty?.applyPerDay !== false ? 'per_day' : 'flat'}
                    onChange={(e) => {
                      const applyPerDay = e.target.value === 'per_day';
                      setForm((prev) => ({
                        ...prev,
                        latePenalty: {
                          enabled: Boolean(prev.latePenalty?.enabled),
                          mode: prev.latePenalty?.mode || 'daily_rent',
                          value: prev.latePenalty?.value ?? null,
                          applyPerDay,
                        },
                      }));
                    }}
                    className="w-full h-9 rounded-xl bg-[#131B29] border border-[#263248] px-3 text-xs font-semibold text-white focus:border-amber-500 focus:outline-none"
                  >
                    <option value="per_day">Per Late Day (starting Day 11)</option>
                    <option value="flat">One-Time Charge (Day 11+)</option>
                  </select>
                </div>
              </div>

              {validationErrors.latePenaltyValue ? (
                <p className="text-[11px] text-red-400">
                  {validationErrors.latePenaltyValue}
                </p>
              ) : (
                <p className="text-[11px] text-slate-400 leading-snug">
                  {form.latePenalty?.enabled
                    ? (form.latePenalty?.mode || 'daily_rent') === 'daily_rent'
                      ? 'Starting on Day 11 of the billing month, each late day adds the exact divided daily rent value (e.g. ₱5,000 ÷ 30 days = ₱166.66 on Day 11, ₱333.32 on Day 12).'
                      : latePenaltyValueDraft.trim()
                      ? `Starting on the 11th of the billing month, late rent incurs ${
                          (form.latePenalty?.mode || 'fixed') === 'percentage'
                            ? `${latePenaltyValueDraft}% of chargeable rent`
                            : `₱${latePenaltyValueDraft}`
                        }${form.latePenalty?.applyPerDay ? ' per late day' : ' (one-time)'}.`
                      : 'Configure your late charges value above.'
                    : 'Late charges are currently turned off.'}
                </p>
              )}
            </div>
          </div>

          {/* Advance Credit Policy Mode */}
          <div className="pt-4 border-t border-[#232F44] space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-xs sm:text-sm font-extrabold text-white">
                  Advance Payment Policy
                </h3>
                <p className="text-[11px] text-slate-400 mt-0.5 leading-snug">
                  Controls how tenant prepaid balances and cash overpayments are held across billing cycles.
                </p>
              </div>
              <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/35 text-[10px] font-bold text-emerald-300">
                {(form.advanceCapMode || 'unlimited') === 'unlimited'
                  ? 'Prepaid Wallet Active'
                  : '1-Month Cap Active'}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() =>
                  setForm((prev) => ({ ...prev, advanceCapMode: 'unlimited' }))
                }
                className={`rounded-2xl p-3 text-left border transition cursor-pointer ${
                  (form.advanceCapMode || 'unlimited') === 'unlimited'
                    ? 'bg-emerald-500/15 border-emerald-500/50 text-white'
                    : 'bg-[#0D121B] border-[#263248] text-slate-300 hover:border-slate-500'
                }`}
              >
                <div className="text-xs font-extrabold text-emerald-300">
                  Prepaid Wallet (Recommended)
                </div>
                <p className="text-[11px] text-slate-400 mt-1 leading-snug">
                  Supports multi-month advances and large electricity deposits (e.g., ₱20,000 advance covering rent + utilities with remaining balance carried forward).
                </p>
              </button>

              <button
                type="button"
                onClick={() =>
                  setForm((prev) => ({ ...prev, advanceCapMode: '1_month' }))
                }
                className={`rounded-2xl p-3 text-left border transition cursor-pointer ${
                  form.advanceCapMode === '1_month'
                    ? 'bg-amber-500/15 border-amber-500/50 text-white'
                    : 'bg-[#0D121B] border-[#263248] text-slate-300 hover:border-slate-500'
                }`}
              >
                <div className="text-xs font-extrabold text-amber-300">
                  Legacy 1-Month Rent Cap
                </div>
                <p className="text-[11px] text-slate-400 mt-1 leading-snug">
                  Restricts stored advance credit to a maximum of 1 month base rent. Existing larger balances remain refundable or usable.
                </p>
              </button>
            </div>
          </div>

          <div className="flex justify-end pt-1">
            <button
              type="submit"
              className="px-5 py-2.5 rounded-xl bg-[#F59E0B] hover:bg-[#FBBF24] text-slate-950 font-extrabold text-xs sm:text-sm flex items-center gap-2 cursor-pointer btn-fluid shadow-lg shadow-amber-500/20"
            >
              <Save className="w-4 h-4" />
              <span>Save &amp; Apply Rates</span>
            </button>
          </div>
        </form>

        {/* 2. Security & Notifications */}
        <div className="surface-card rounded-3xl p-5 sm:p-7 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#232F44]">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
                <Lock className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-extrabold text-white">
                  Security &amp; Notifications
                </h2>
                <p className="text-xs text-slate-400">
                  Biometrics / PIN authentication &amp; verified due reminders
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={isEnrollingBiometrics}
                onClick={async () => {
                  setIsEnrollingBiometrics(true);
                  setStatusBanner(null);
                  const res = await registerDeviceBiometrics();
                  setIsEnrollingBiometrics(false);
                  if (res.ok && res.credentialId) {
                    const nextSettings: AppSettings = {
                      ...form,
                      security: {
                        ...form.security,
                        isSetupComplete: true,
                        lockEnabled: true,
                        authMethod: form.security.pinCode ? 'both' : 'fingerprint',
                        webAuthnCredentialId: res.credentialId,
                      },
                    };
                    setForm(nextSettings);
                    onUpdateSettings(nextSettings);
                    setStatusBanner('Biometrics enrolled! Every PIN screen now supports Biometrics / PIN.');
                  } else {
                    setStatusBanner(res.message);
                  }
                }}
                className="px-3.5 py-2 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/35 text-xs font-extrabold text-emerald-300 flex items-center gap-1.5 cursor-pointer transition disabled:opacity-60"
              >
                {isEnrollingBiometrics ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Fingerprint className="w-3.5 h-3.5" />
                )}
                <span>
                  {form.security.webAuthnCredentialId
                    ? 'Re-register Biometrics'
                    : 'Set Up Biometrics'}
                </span>
              </button>

              {form.security.webAuthnCredentialId && (
                <button
                  type="button"
                  onClick={() => {
                    const nextSettings: AppSettings = {
                      ...form,
                      security: {
                        ...form.security,
                        authMethod: 'pin',
                        webAuthnCredentialId: undefined,
                      },
                    };
                    setForm(nextSettings);
                    onUpdateSettings(nextSettings);
                    setStatusBanner('Biometrics removed from this device. 4-Digit PIN stays active.');
                  }}
                  className="px-3 py-2 rounded-xl bg-[#1B2436] hover:bg-red-500/15 border border-[#2B3B59] hover:border-red-500/30 text-xs font-bold text-slate-300 hover:text-red-300 cursor-pointer transition"
                >
                  Disable Biometrics
                </button>
              )}

              <button
                type="button"
                onClick={onOpenSecuritySetup}
                className="px-3.5 py-2 rounded-xl bg-[#1B2436] hover:bg-[#25324A] border border-[#2B3B59] text-xs font-bold text-amber-400 cursor-pointer transition"
              >
                Configure PIN
              </button>
            </div>
          </div>

          {/* Biometrics & PIN Enrollment Status Strip */}
          <div className="rounded-2xl bg-[#0D121B] border border-[#243047] p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <div className="flex items-start gap-2.5 min-w-0">
              <Fingerprint
                className={`w-5 h-5 shrink-0 mt-0.5 ${
                  form.security.webAuthnCredentialId
                    ? 'text-emerald-400'
                    : 'text-amber-400'
                }`}
              />
              <div className="min-w-0">
                <div className="text-xs font-bold text-white flex flex-wrap items-center gap-2">
                  <span>Device Biometrics &amp; PIN Status</span>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold border ${
                      form.security.webAuthnCredentialId
                        ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/35'
                        : 'bg-amber-500/15 text-amber-300 border-amber-500/35'
                    }`}
                  >
                    {form.security.webAuthnCredentialId
                      ? 'Biometrics Active'
                      : 'Biometrics Not Set Up'}
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 mt-0.5 leading-snug">
                  {form.security.webAuthnCredentialId
                    ? 'Fingerprint / Windows Hello and 4-Digit PIN are both ready at every PIN prompt.'
                    : bioSupportReason ||
                      'Tap "Set Up Biometrics" above to enroll Fingerprint / Windows Hello for quick verification alongside your PIN.'}
                </p>
              </div>
            </div>
            <span className="text-[11px] font-mono-num font-bold text-slate-300 shrink-0">
              PIN: {form.security.pinCode ? 'Configured' : 'Not Set'}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            {/* Privacy Mask Toggle */}
            <div className="rounded-2xl bg-[#0D121B] border border-[#243047] p-4 flex items-center justify-between">
              <div>
                <div className="text-xs font-bold text-white flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Privacy Shield</span>
                </div>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Masks tenant phone numbers & amounts on screen
                </p>
              </div>
              <button
                type="button"
                onClick={() =>
                  toggleInstantSetting({
                    privacyMaskEnabled: !form.privacyMaskEnabled,
                  })
                }
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                  form.privacyMaskEnabled
                    ? 'bg-emerald-500 text-slate-950'
                    : 'bg-[#182133] text-slate-400'
                }`}
              >
                {form.privacyMaskEnabled ? 'Active' : 'Off'}
              </button>
            </div>

            {/* Notification Permission Verification */}
            <div className="rounded-2xl bg-[#0D121B] border border-[#243047] p-4 flex items-center justify-between">
              <div>
                <div className="text-xs font-bold text-white flex items-center gap-1.5">
                  <Bell className="w-3.5 h-3.5 text-amber-400" />
                  <span>Due Reminders</span>
                </div>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  {form.notificationsVerified
                    ? '✓ Verified on device (Day 1–10 alerts)'
                    : 'Requires permission verification'}
                </p>
              </div>
              <button
                type="button"
                onClick={handleVerifyNotificationPermission}
                disabled={isVerifyingNotification}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                  form.remindersEnabled
                    ? 'bg-amber-500 text-slate-950'
                    : 'bg-[#182133] text-slate-400'
                }`}
              >
                {isVerifyingNotification ? 'Testing...' : form.remindersEnabled ? 'Enabled' : 'Enable & Verify'}
              </button>
            </div>
          </div>

          {/* Audit Logs toggle */}
          <div className="pt-2 border-t border-[#1E283B]">
            <button
              type="button"
              onClick={() => setShowAuditLogs((prev) => !prev)}
              className="text-xs font-bold text-amber-400 hover:text-amber-300 flex items-center gap-1.5 cursor-pointer"
            >
              <Lock className="w-3.5 h-3.5" />
              <span>
                {showAuditLogs
                  ? 'Hide Security Audit Log'
                  : `View Security Audit Log (${auditLogs.length})`}
              </span>
            </button>

            {showAuditLogs && (
              <div className="mt-3 rounded-2xl bg-[#0D121B] border border-[#243047] p-3 max-h-48 overflow-y-auto space-y-1.5">
                {auditLogs.length === 0 ? (
                  <p className="text-xs text-slate-400 text-center py-3">
                    No security events logged yet.
                  </p>
                ) : (
                  auditLogs.slice(0, 15).map((log) => (
                    <div
                      key={log.id}
                      className="flex items-center justify-between gap-2 px-3 py-1.5 rounded-lg bg-[#131B29] text-xs"
                    >
                      <div className="truncate">
                        <span className="font-bold text-white">{log.action}</span>
                        <span className="text-slate-400 ml-2">{log.details}</span>
                      </div>
                      <span className="text-[10px] font-mono-num text-slate-500 shrink-0">
                        {new Date(log.createdAt).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>

        {/* 3. Cloud & Cross-Device Synchronization */}
        <div className="surface-card rounded-3xl p-5 sm:p-7 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[#232F44]">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-blue-500/15 border border-blue-500/30 flex items-center justify-center text-blue-400 shrink-0">
                <Cloud className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-extrabold text-white">
                  Data Sync
                </h2>
                <p className="text-xs text-slate-400">
                  Works offline and syncs automatically when connected.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className={`px-2.5 py-1 rounded-full text-xs font-bold border flex items-center gap-1.5 ${
                networkInfo.isOnline
                  ? 'bg-emerald-500/15 border-emerald-500/35 text-emerald-400'
                  : 'bg-red-500/15 border-red-500/35 text-red-400'
              }`}>
                {networkInfo.isOnline ? (
                  <Wifi className="w-3 h-3" />
                ) : (
                  <WifiOff className="w-3 h-3" />
                )}
                <span>{networkInfo.label}</span>
              </span>
            </div>
          </div>

          {/* Public Sharing & Data Safety Warning */}
          <div className="rounded-2xl bg-rose-500/10 border border-rose-500/35 px-4 py-3 flex items-start gap-2.5 text-xs text-rose-200">
            <Shield className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <p className="leading-snug">
              <strong className="text-white">Keep This Code Private:</strong>{' '}
              Sharing your Property Space Code exposes all rooms, tenants, and receipts inside it publicly. Never share it with others.
            </p>
          </div>

          <div className="rounded-2xl bg-[#0D121B] border border-[#243047] p-4 sm:p-5 flex flex-col sm:flex-row sm:items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                <label className="block text-xs font-bold text-white">
                  Property Space Code ({isMobile ? 'Mobile Import' : 'Desktop/Web Host'}):
                </label>
                {isMobile && mobileLock.isLockedThisMonth && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/35 text-[10px] font-bold text-amber-300">
                    <Lock className="w-3 h-3 shrink-0" />
                    <span>
                      Locked until {mobileLock.nextEligibleMonthLabel}
                    </span>
                  </span>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  value={
                    isMobile
                      ? mobileCodeDraft
                      : form.cloudSync.propertyCode ?? ''
                  }
                  disabled={isMobile && isApplyingMobileCode}
                  onChange={(e) => {
                    const nextVal = normalizePropertyCode(e.target.value);
                    if (isMobile) {
                      setMobileCodeDraft(nextVal);
                    } else {
                      setForm({
                        ...form,
                        cloudSync: {
                          ...form.cloudSync,
                          propertyCode: nextVal,
                          enabled: true,
                        },
                      });
                    }
                  }}
                  placeholder="e.g. 4R-7K2M9A"
                  className="h-9 px-3 rounded-xl bg-[#151B26] border border-amber-500/40 text-amber-400 font-mono font-bold text-xs uppercase focus:outline-none focus:border-amber-400 min-w-[150px] disabled:opacity-60 disabled:cursor-not-allowed"
                />

                {!isMobile && (
                  <button
                    type="button"
                    onClick={() => {
                      const randomCode = generatePropertyCode();
                      setForm({
                        ...form,
                        cloudSync: {
                          ...form.cloudSync,
                          propertyCode: randomCode,
                          enabled: true,
                        },
                      });
                    }}
                    className="px-2.5 py-2 rounded-xl bg-[#1A2334] hover:bg-[#233047] border border-[#2B3B59] text-[11px] font-bold text-amber-300 transition cursor-pointer"
                    title="Generate a unique property space code on Desktop/Web"
                  >
                    Generate New Code
                  </button>
                )}

                {isMobile && (
                  <button
                    type="button"
                    onClick={handleApplyMobilePropertyCode}
                    disabled={isApplyingMobileCode}
                    className="px-3 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:bg-slate-800 disabled:text-slate-400 text-slate-950 font-extrabold text-xs flex items-center gap-1.5 transition cursor-pointer disabled:cursor-not-allowed"
                  >
                    <RefreshCw
                      className={`w-3.5 h-3.5 ${isApplyingMobileCode ? 'animate-spin' : ''}`}
                    />
                    <span>
                      {isApplyingMobileCode
                        ? 'Applying & Syncing...'
                        : 'Apply Code & Sync Push'}
                    </span>
                  </button>
                )}
              </div>

              <p className="text-[11px] text-slate-400 mt-1.5 leading-snug">
                {getPropertyCodeHint()}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              {!isMobile && (
                <>
                  <button
                    type="button"
                    onClick={async () => {
                      await navigator.clipboard.writeText(
                        resolveConfiguredPropertyCode(form.cloudSync.propertyCode)
                      );
                      setCopiedSyncCode(true);
                      setTimeout(() => setCopiedSyncCode(false), 2500);
                    }}
                    className="px-3 py-2 rounded-xl bg-[#182235] hover:bg-[#212E46] border border-[#2B3B59] text-amber-400 font-bold text-xs flex items-center gap-1.5 cursor-pointer"
                  >
                    {copiedSyncCode ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        <span className="text-emerald-400">Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copy Code</span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={async () => {
                      const prop = encodeURIComponent(
                        resolveConfiguredPropertyCode(form.cloudSync.propertyCode)
                      );
                      const proj = form.cloudSync.firebaseProjectId
                        ? `&proj=${encodeURIComponent(form.cloudSync.firebaseProjectId)}`
                        : '';
                      const link = `${window.location.origin}${window.location.pathname}?prop=${prop}${proj}`;
                      await navigator.clipboard.writeText(link);
                      setCopiedMobileLink(true);
                      setTimeout(() => setCopiedMobileLink(false), 2500);
                    }}
                    className="px-3 py-2 rounded-xl bg-[#182235] hover:bg-[#212E46] border border-[#2B3B59] text-emerald-400 font-bold text-xs flex items-center gap-1.5 cursor-pointer"
                    title="Send this 1-click link to your phone to apply the code (once/month on mobile)"
                  >
                    {copiedMobileLink ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Link Copied</span>
                      </>
                    ) : (
                      <>
                        <Smartphone className="w-3.5 h-3.5" />
                        <span>Pair Mobile</span>
                      </>
                    )}
                  </button>
                </>
              )}

              <button
                type="button"
                onClick={handleSmartSync}
                disabled={isSyncing}
                className={`px-4 py-2 rounded-xl text-white font-extrabold text-xs flex items-center gap-1.5 cursor-pointer shadow-lg transition ${
                  isPropertyCodeChanged
                    ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-amber-500/20'
                    : 'bg-blue-500 hover:bg-blue-400 shadow-blue-500/20'
                }`}
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`}
                />
                <span>
                  {isSyncing
                    ? isPropertyCodeChanged
                      ? 'Applying & Syncing...'
                      : 'Syncing...'
                    : isPropertyCodeChanged
                      ? 'Apply Code & Sync Push'
                      : 'Sync Now'}
                </span>
              </button>
            </div>
          </div>

          {/* Backup & Restore Controls */}
          <div className="grid grid-cols-2 gap-3 pt-1">
            <button
              type="button"
              onClick={handleExportBackup}
              className="py-2.5 px-3 rounded-xl bg-[#141C2B] hover:bg-[#1D283E] border border-[#28364F] text-slate-200 text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5 text-amber-400" />
              <span>Export JSON Backup</span>
            </button>

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="py-2.5 px-3 rounded-xl bg-[#141C2B] hover:bg-[#1D283E] border border-[#28364F] text-slate-200 text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Upload className="w-3.5 h-3.5 text-emerald-400" />
              <span>Restore JSON Backup</span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              onChange={handleImportBackup}
              className="hidden"
            />
          </div>

          {/* Dev Cloud Config toggle */}
          <div className="pt-1">
            <button
              type="button"
              onClick={() => setShowDevCloudConfig((prev) => !prev)}
              className="text-xs text-slate-500 hover:text-slate-300 font-semibold cursor-pointer"
            >
              {showDevCloudConfig ? 'Hide Cloud Endpoints' : 'Cloud Database Endpoints'}
            </button>

            {showDevCloudConfig && (
              <div className="mt-3 p-4 rounded-2xl bg-[#0D121B] border border-[#243047] space-y-4 text-xs">
                <div>
                  <label className="block text-slate-300 mb-1 font-bold">
                    Cloud Database Provider: <span className="text-amber-400">🔥 Firebase Realtime Database</span>
                  </label>
                  <p className="text-[11px] text-slate-400">
                    Live bidirectional SSE and REST synchronization between Mobile & Desktop devices.
                  </p>
                </div>

                <div className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-slate-400 mb-1 font-semibold">
                        Firebase Project ID
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. rent-41279"
                        value={form.cloudSync.firebaseProjectId || ''}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            cloudSync: {
                              ...form.cloudSync,
                              provider: 'firebase',
                              firebaseProjectId: e.target.value,
                              enabled: true,
                            },
                          })
                        }
                        className="w-full h-9 rounded-xl bg-[#151B26] border border-[#252F42] px-3 text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-400 mb-1 font-semibold">
                        Database URL
                      </label>
                      <input
                        type="text"
                        placeholder="https://rent-41279-default-rtdb.asia-southeast1.firebasedatabase.app"
                        value={form.cloudSync.firebaseDatabaseUrl || ''}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            cloudSync: {
                              ...form.cloudSync,
                              provider: 'firebase',
                              firebaseDatabaseUrl: e.target.value,
                              enabled: true,
                            },
                          })
                        }
                        className="w-full h-9 rounded-xl bg-[#151B26] border border-[#252F42] px-3 text-white font-mono text-[11px]"
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={async () => {
                        await navigator.clipboard.writeText(FIREBASE_RULES_JSON);
                        setCopiedSql(true);
                        setTimeout(() => setCopiedSql(false), 2500);
                      }}
                      className="px-3 py-1.5 rounded-lg bg-[#151B26] border border-[#252F42] text-amber-300 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                    >
                      {copiedSql ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-400" />
                          <span className="text-emerald-400">Rules Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" />
                          <span>Copy Firebase Realtime Rules</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 4. Desktop & Mobile Applications or Installed Standalone Status */}
        <div className="surface-card rounded-3xl p-5 sm:p-7 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[#232F44]">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 ${
                isInstalledStandalone
                  ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-400'
                  : 'bg-amber-500/15 border border-amber-500/30 text-amber-400'
              }`}>
                {isInstalledStandalone ? (
                  <ShieldCheck className="w-5 h-5" />
                ) : (
                  <Download className="w-5 h-5" />
                )}
              </div>
              <div>
                <h2 className="text-base font-extrabold text-white">
                  {isInstalledStandalone
                    ? 'App Status'
                    : isMobile
                    ? 'Mobile App (Direct APK)'
                    : 'Desktop & Mobile Apps'}
                </h2>
                <p className="text-xs text-slate-400">
                  {isInstalledStandalone
                    ? 'Standalone app active with local offline storage.'
                    : isMobile
                    ? 'Offline Mobile App with live Sub-Meter camera.'
                    : 'Portable Desktop Launcher & offline Mobile App.'}
                </p>
              </div>
            </div>

            {isInstalledStandalone ? (
              <span className="px-3 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/35 text-emerald-400 text-xs font-bold flex items-center gap-1.5">
                <Check className="w-3.5 h-3.5" />
                <span>{isDesktop ? 'Desktop Host Active' : 'Mobile App Active'}</span>
              </span>
            ) : (
              onOpenDownloadModal && (
                <button
                  type="button"
                  onClick={onOpenDownloadModal}
                  className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black text-xs flex items-center gap-1.5 transition cursor-pointer shadow-md shadow-amber-500/20"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Open Download Center</span>
                </button>
              )
            )}
          </div>

          {isInstalledStandalone ? (
            /* Clean Active Standalone Status Panel (Zero redundant download buttons) */
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="rounded-2xl bg-[#0D121B] border border-[#243047] p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {isDesktop ? (
                      <Laptop className="w-4 h-4 text-amber-400" />
                    ) : (
                      <Smartphone className="w-4 h-4 text-emerald-400" />
                    )}
                    <span className="font-extrabold text-sm text-white">
                      {isDesktop ? 'Desktop App' : 'Mobile App'}
                    </span>
                  </div>
                  <span className="px-2 py-0.5 rounded font-mono text-[10px] font-bold bg-emerald-500/15 border border-emerald-500/30 text-emerald-400">
                    ● RUNNING NOW
                  </span>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  {isDesktop
                    ? 'Standalone Desktop App with dedicated window and shortcut support.'
                    : 'Offline Mobile App with live Sub-Meter camera and direct Messenger sharing.'}
                </p>
                <div className="pt-2 border-t border-[#1C2536] flex items-center justify-between text-xs text-slate-400">
                  <span>Storage Engine:</span>
                  <span className="text-emerald-400 font-semibold">IndexedDB (100% Offline)</span>
                </div>
              </div>

              <div className="rounded-2xl bg-[#0D121B] border border-[#243047] p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Share2 className="w-4 h-4 text-amber-400" />
                    <span className="font-extrabold text-sm text-white">
                      Device Pairing &amp; Space Code
                    </span>
                  </div>
                  <span className="px-2 py-0.5 rounded font-mono text-[10px] font-bold bg-amber-500/15 border border-amber-500/30 text-amber-400">
                    {resolveConfiguredPropertyCode(settings.cloudSync?.propertyCode)}
                  </span>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  {isMobile
                    ? 'Mobile can only apply a code generated from Desktop/Web (once per month). Never share your code | Sharing exposes your data publicly.'
                    : 'Generate this code on Desktop/Web and apply it on Mobile (once/month). Never share it | Anyone with this code can access your data.'}
                </p>
                <div className="pt-2 border-t border-[#1C2536] flex items-center justify-between gap-2">
                  <span className="text-xs text-slate-400">
                    {isMobile ? 'Monthly Limit:' : 'Space Code:'}
                  </span>
                  {isMobile ? (
                    <span className="text-xs font-bold text-amber-300">
                      {mobileLock.isLockedThisMonth
                        ? `Locked until ${mobileLock.nextEligibleMonthLabel}`
                        : '1 change available this month'}
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={async () => {
                        await navigator.clipboard.writeText(
                          resolveConfiguredPropertyCode(settings.cloudSync?.propertyCode)
                        );
                        setCopiedExeDirect(true);
                        setTimeout(() => setCopiedExeDirect(false), 2400);
                      }}
                      className="px-3 py-1.5 rounded-xl bg-[#162031] hover:bg-[#1E2B42] border border-[#2A3B57] text-amber-300 text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
                    >
                      {copiedExeDirect ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                          <span className="text-emerald-400">Code Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Copy Code</span>
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>
            </div>
          ) : (
            /* Visitor Web Downloads (Filtered by platform) */
            <div className={`grid grid-cols-1 ${isMobile ? 'md:grid-cols-1 max-w-xl' : 'md:grid-cols-3'} gap-4`}>
              {/* Windows EXE Box (Hidden on Mobile phones) */}
              {!isMobile && (
                <div className="rounded-2xl bg-[#0D121B] border border-[#243047] p-4.5 flex flex-col justify-between gap-4">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Laptop className="w-4 h-4 text-amber-400" />
                        <span className="font-extrabold text-sm text-white">
                          Windows Desktop Launcher
                        </span>
                      </div>
                      <span className="px-2 py-0.5 rounded font-mono text-[10px] font-bold bg-blue-500/15 border border-blue-500/30 text-blue-400">
                        .EXE • ~44 KB
                      </span>
                    </div>
                    <p className="text-xs text-slate-300 leading-relaxed">
                      Dedicated borderless desktop app powered by Edge/Chrome runtime. Automatically creates desktop &amp; taskbar shortcuts with official system logo.
                    </p>
                    <div className="text-[11px] font-mono text-slate-400 truncate">
                      File: <span className="text-amber-400">4Rent-Launcher.exe</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pt-2 border-t border-[#1C2536]">
                    <button
                      type="button"
                      onClick={async () => {
                        const baseUrl = window.location.origin + window.location.pathname.replace(/\/+$/, '');
                        await navigator.clipboard.writeText(`${baseUrl}/4Rent-Launcher.exe`);
                        setCopiedExeDirect(true);
                        setTimeout(() => setCopiedExeDirect(false), 2400);
                      }}
                      className="px-3 py-2 rounded-xl bg-[#162031] hover:bg-[#1E2B42] border border-[#2A3B57] text-slate-300 text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
                    >
                      {copiedExeDirect ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                          <span className="text-emerald-400">Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Copy Link</span>
                        </>
                      )}
                    </button>

                    <a
                      href={`${window.location.origin}${window.location.pathname.replace(/\/+$/, '')}/4Rent-Launcher.exe`}
                      download="4Rent-Launcher.exe"
                      className="flex-1 py-2 px-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs flex items-center justify-center gap-1.5 shadow-md shadow-amber-500/20 transition cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Download .EXE</span>
                    </a>
                  </div>
                </div>
              )}

              {/* macOS Desktop App Box (Hidden on Mobile phones — Zero Node.js / Zero CLI) */}
              {!isMobile && (
                <div className="rounded-2xl bg-[#0D121B] border border-[#243047] p-4.5 flex flex-col justify-between gap-4">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Laptop className="w-4 h-4 text-sky-400" />
                        <span className="font-extrabold text-sm text-white">
                          macOS Desktop App
                        </span>
                      </div>
                      <span className="px-2 py-0.5 rounded font-mono text-[10px] font-bold bg-sky-500/15 border border-sky-500/30 text-sky-300">
                        .APP / .ZIP
                      </span>
                    </div>
                    <p className="text-xs text-slate-300 leading-relaxed">
                      Native macOS bundle (<code className="text-sky-300">4Rent.app</code>) with 1-click Applications installer &amp; Retina icon. Zero Node.js or CLI required.
                    </p>
                    <div className="text-[11px] font-mono text-slate-400 truncate">
                      File: <span className="text-sky-300">4Rent-Desktop-macOS.zip</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pt-2 border-t border-[#1C2536]">
                    <a
                      href={`${window.location.origin}${window.location.pathname.replace(/\/+$/, '')}/Install-4Rent-macOS.command`}
                      download="Install-4Rent-macOS.command"
                      className="px-3 py-2 rounded-xl bg-[#162031] hover:bg-[#1E2B42] border border-sky-500/35 text-sky-300 text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
                    >
                      <span>1-Click Setup</span>
                    </a>

                    <a
                      href={`${window.location.origin}${window.location.pathname.replace(/\/+$/, '')}/4Rent-Desktop-macOS.zip`}
                      download="4Rent-Desktop-macOS.zip"
                      className="flex-1 py-2 px-3 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-black text-xs flex items-center justify-center gap-1.5 shadow-md shadow-sky-500/20 transition cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Download macOS</span>
                    </a>
                  </div>
                </div>
              )}

              {/* Mobile App APK Box */}
              <div className="rounded-2xl bg-[#0D121B] border border-[#243047] p-4.5 flex flex-col justify-between gap-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Smartphone className="w-4 h-4 text-emerald-400" />
                      <span className="font-extrabold text-sm text-white">
                        Mobile App
                      </span>
                    </div>
                    <span className="px-2 py-0.5 rounded font-mono text-[10px] font-bold bg-emerald-500/15 border border-emerald-500/30 text-emerald-400">
                      .APK • ~272 KB
                    </span>
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    Live Sub-Meter camera scanner with 1-tap Messenger receipt sharing.
                  </p>
                  <div className="text-[11px] font-mono text-slate-400 truncate">
                    File: <span className="text-emerald-400">4Rent-v1.0.1-release.apk</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-2 border-t border-[#1C2536]">
                  <button
                    type="button"
                    onClick={async () => {
                      const baseUrl = window.location.origin + window.location.pathname.replace(/\/+$/, '');
                      await navigator.clipboard.writeText(`${baseUrl}/4Rent-v1.0.1-release.apk`);
                      setCopiedApkDirect(true);
                      setTimeout(() => setCopiedApkDirect(false), 2400);
                    }}
                    className="px-3 py-2 rounded-xl bg-[#162031] hover:bg-[#1E2B42] border border-[#2A3B57] text-slate-300 text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
                  >
                    {copiedApkDirect ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        <span className="text-emerald-400">Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copy Link</span>
                      </>
                    )}
                  </button>

                  <a
                    href={`${window.location.origin}${window.location.pathname.replace(/\/+$/, '')}/4Rent-v1.0.1-release.apk`}
                    download="4Rent-v1.0.1-release.apk"
                    className="flex-1 py-2 px-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs flex items-center justify-center gap-1.5 shadow-md shadow-emerald-500/20 transition cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download .APK</span>
                  </a>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
