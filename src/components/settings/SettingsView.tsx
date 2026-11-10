import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  Bell,
  Check,
  Cloud,
  Copy,
  Database,
  Download,
  Eye,
  EyeOff,
  FileCheck2,
  Lock,
  RefreshCw,
  Save,
  Share2,
  Shield,
  ShieldCheck,
  Smartphone,
  Upload,
  Wifi,
  WifiOff,
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
} from '../../services/storageService';
import {
  getNetworkStatus,
  mergeDatabaseSnapshots,
  pullSnapshotFromCloud,
  pushSnapshotToCloud,
  FIREBASE_RULES_JSON,
} from '../../services/firebaseSync';
import { requestAndVerifyNotifications } from '../../services/ocrService';
import {
  formatPhoneNumber,
  isMobileDevice,
} from '../../utils/billingCalculator';

interface SettingsViewProps {
  settings: AppSettings;
  onBack: () => void;
  onUpdateSettings: (newSettings: AppSettings) => void;
  onReloadAllData: () => void;
  onOpenSecuritySetup: () => void;
  onInstallDesktopApp?: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  settings,
  onBack,
  onUpdateSettings,
  onReloadAllData,
  onOpenSecuritySetup,
}) => {
  const isMobile = isMobileDevice();
  const [form, setForm] = useState<AppSettings>(settings);
  const [statusBanner, setStatusBanner] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isVerifyingNotification, setIsVerifyingNotification] = useState(false);
  const [showDevCloudConfig, setShowDevCloudConfig] = useState(false);
  const [showAuditLogs, setShowAuditLogs] = useState(false);
  const [copiedSql, setCopiedSql] = useState(false);
  const [copiedSyncCode, setCopiedSyncCode] = useState(false);
  const [copiedMobileLink, setCopiedMobileLink] = useState(false);
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

  const handleSaveGeneral = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdateSettings(form);
    setStatusBanner('Settings saved successfully.');
    setTimeout(() => setStatusBanner(null), 3000);
  };

  /**
   * Syncs data seamlessly across devices:
   * Pulls remote snapshot, merges with local changes, saves merged state locally, and pushes to cloud.
   */
  const handleSmartSync = async () => {
    setIsSyncing(true);
    setStatusBanner(null);
    onUpdateSettings(form);

    const net = getNetworkStatus();
    if (!net.isOnline) {
      setIsSyncing(false);
      setStatusBanner('Device is currently Offline. Local changes are saved in IndexedDB.');
      return;
    }

    try {
      // 1. Pull remote
      const pullRes = await pullSnapshotFromCloud(form.cloudSync);
      const localSnap = exportDatabaseSnapshot();

      let finalSnap = localSnap;
      if (pullRes.ok && pullRes.snapshot) {
        // 2. Smart Merge
        finalSnap = mergeDatabaseSnapshots(localSnap, pullRes.snapshot);
        importDatabaseSnapshot(finalSnap);
        onReloadAllData();
      }

      // 3. Push merged snapshot
      const pushRes = await pushSnapshotToCloud(form.cloudSync, finalSnap);
      setIsSyncing(false);

      if (pushRes.ok) {
        const updated: AppSettings = {
          ...form,
          cloudSync: { ...form.cloudSync, lastSyncedAt: pushRes.syncedAt },
        };
        setForm(updated);
        onUpdateSettings(updated);
        setStatusBanner(`Synced via ${net.label} at ${new Date().toLocaleTimeString()}`);
      } else {
        setStatusBanner(pushRes.message || 'Data saved locally in IndexedDB.');
      }
    } catch {
      setIsSyncing(false);
      setStatusBanner('Sync completed locally.');
    }
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
            {networkInfo.label} • v1.0.0
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
                Electric Sub-Meter Rate (₱ / kWh)
              </label>
              <input
                type="number"
                step="0.01"
                value={form.defaultElectricRate}
                onChange={(e) =>
                  setForm({
                    ...form,
                    defaultElectricRate: parseFloat(e.target.value) || 0,
                  })
                }
                className="w-full h-10 rounded-xl bg-[#0D121B] border border-amber-500/40 px-3.5 text-xs sm:text-sm font-bold text-amber-400 font-mono-num focus:border-amber-500 focus:outline-none transition"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Default Monthly Unit Rent (₱)
              </label>
              <input
                type="number"
                step="0.01"
                value={form.defaultMonthlyRent}
                onChange={(e) =>
                  setForm({
                    ...form,
                    defaultMonthlyRent: parseFloat(e.target.value) || 0,
                  })
                }
                className="w-full h-10 rounded-xl bg-[#0D121B] border border-[#263248] px-3.5 text-xs sm:text-sm font-bold text-white font-mono-num focus:border-amber-500 focus:outline-none transition"
              />
            </div>
          </div>

          <div className="flex justify-end pt-1">
            <button
              type="submit"
              className="px-5 py-2.5 rounded-xl bg-[#F59E0B] hover:bg-[#FBBF24] text-slate-950 font-extrabold text-xs sm:text-sm flex items-center gap-2 cursor-pointer btn-fluid shadow-lg shadow-amber-500/20"
            >
              <Save className="w-4 h-4" />
              <span>Save Rates</span>
            </button>
          </div>
        </form>

        {/* 2. Security & Notifications */}
        <div className="surface-card rounded-3xl p-5 sm:p-7 space-y-5">
          <div className="flex items-center justify-between pb-3 border-b border-[#232F44]">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
                <Lock className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-extrabold text-white">
                  Security & Notifications
                </h2>
                <p className="text-xs text-slate-400">
                  PIN authentication & verified due reminders
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onOpenSecuritySetup}
              className="px-3.5 py-1.5 rounded-xl bg-[#1B2436] hover:bg-[#25324A] border border-[#2B3B59] text-xs font-bold text-amber-400 cursor-pointer"
            >
              Configure PIN
            </button>
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
                  Data Synchronization (Offline / Mobile Data / Wi-Fi)
                </h2>
                <p className="text-xs text-slate-400">
                  Works 100% offline. Automatically synchronizes when connected.
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

          <div className="rounded-2xl bg-[#0D121B] border border-[#243047] p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="text-xs font-bold text-white flex items-center gap-2">
                <span>Property Sync Code:</span>
                <code className="px-2 py-0.5 rounded bg-[#182235] text-amber-400 font-mono-num font-bold">
                  {form.cloudSync.propertyCode || '4RENT-MAIN'}
                </code>
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                All records, meter proofs, and payments sync between Mobile and Desktop using this code.
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={async () => {
                  await navigator.clipboard.writeText(
                    form.cloudSync.propertyCode || '4RENT-MAIN'
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
                    form.cloudSync.propertyCode || '4RENT-MAIN'
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
                title="Send this 1-click link to your phone or desktop to sync data instantly"
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

              <button
                type="button"
                onClick={handleSmartSync}
                disabled={isSyncing}
                className="px-4 py-2 rounded-xl bg-blue-500 hover:bg-blue-400 text-white font-extrabold text-xs flex items-center gap-1.5 cursor-pointer shadow-lg shadow-blue-500/20"
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`}
                />
                <span>Sync Now</span>
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
      </div>
    </div>
  );
};
