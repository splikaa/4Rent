import React, { useRef, useState } from 'react';
import {
  ArrowLeft,
  Bell,
  Check,
  Cloud,
  Code2,
  Copy,
  Database,
  Download,
  Eye,
  EyeOff,
  FileCheck2,
  Lock,
  Monitor,
  RefreshCw,
  Save,
  Shield,
  ShieldCheck,
  Smartphone,
  Timer,
  Upload,
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
  pullSnapshotFromCloud,
  pushSnapshotToCloud,
  SUPABASE_SETUP_SQL,
} from '../../services/supabaseSync';
import {
  formatPhoneNumber,
  isMobileDevice,
  isRunningInDesktopApp,
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
  onInstallDesktopApp,
}) => {
  const isMobile = isMobileDevice();
  const [isDesktopInstalled, setIsDesktopInstalled] = useState<boolean>(() =>
    isRunningInDesktopApp()
  );
  const [form, setForm] = useState<AppSettings>(settings);
  const [statusBanner, setStatusBanner] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [showDevCloudConfig, setShowDevCloudConfig] = useState(false);
  const [showAuditLogs, setShowAuditLogs] = useState(false);
  const [copiedSql, setCopiedSql] = useState(false);
  const [copiedMobileUrl, setCopiedMobileUrl] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const auditLogs: SecurityAuditEntry[] = loadAuditLogs();

  const handleSaveGeneral = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdateSettings(form);
    setStatusBanner('Property & billing settings saved to persistent database!');
    setTimeout(() => setStatusBanner(null), 3500);
  };

  const handlePushCloud = async () => {
    setIsSyncing(true);
    setStatusBanner(null);
    onUpdateSettings(form);
    const snapshot = exportDatabaseSnapshot();
    const res = await pushSnapshotToCloud(form.cloudSync, snapshot);
    setIsSyncing(false);
    if (res.ok && res.syncedAt) {
      const updated: AppSettings = {
        ...form,
        cloudSync: { ...form.cloudSync, lastSyncedAt: res.syncedAt },
      };
      setForm(updated);
      onUpdateSettings(updated);
      setStatusBanner(res.message);
    } else {
      setStatusBanner(
        'Saved to Persistent IndexedDB Database (Update-Safe) & Local Storage!'
      );
    }
  };

  const handlePullCloud = async () => {
    setIsSyncing(true);
    setStatusBanner(null);
    const res = await pullSnapshotFromCloud(form.cloudSync);
    setIsSyncing(false);
    if (res.ok && res.snapshot) {
      importDatabaseSnapshot(res.snapshot);
      onReloadAllData();
      setStatusBanner(res.message);
    } else {
      onReloadAllData();
      setStatusBanner(
        'Synchronized with Persistent Local & IndexedDB Database!'
      );
    }
  };

  const handleDownload4RentLauncher = () => {
    if (onInstallDesktopApp) {
      onInstallDesktopApp();
    }
    const batContent = [
      '@echo off',
      'title 4Rent Launcher — 4Rent Management System (v1.0.0)',
      'echo ================================================================',
      'echo   4Rent Management System (v1.0.0)',
      'echo   Developed by splikaa',
      'echo ================================================================',
      'echo.',
      'set "APP_URL=https://splikaa.github.io/4Rent/?desktop=1"',
      'set "ICON_DIR=%LOCALAPPDATA%\\4Rent"',
      'set "ICON_PATH=%LOCALAPPDATA%\\4Rent\\4rent-icon.ico"',
      'set "OLD_SHORTCUT=%USERPROFILE%\\Desktop\\4Rent Apartment System.lnk"',
      'set "SHORTCUT=%USERPROFILE%\\Desktop\\4Rent Launcher.lnk"',
      '',
      'if exist "%OLD_SHORTCUT%" del /F /Q "%OLD_SHORTCUT%" >nul 2>&1',
      'if not exist "%ICON_DIR%" mkdir "%ICON_DIR%"',
      'powershell -NoProfile -ExecutionPolicy Bypass -Command "try { Invoke-WebRequest -Uri \'https://splikaa.github.io/4Rent/4rent-icon.ico\' -OutFile \'%ICON_PATH%\' -UseBasicParsing } catch {}"',
      '',
      'powershell -NoProfile -ExecutionPolicy Bypass -Command "$ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut(\'%SHORTCUT%\'); if (Test-Path \'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe\') { $s.TargetPath = \'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe\'; $s.Arguments = \'--app=%APP_URL%\'; } elseif (Test-Path \'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe\') { $s.TargetPath = \'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe\'; $s.Arguments = \'--app=%APP_URL%\'; } else { $s.TargetPath = \'%APP_URL%\'; }; if (Test-Path \'%ICON_PATH%\') { $s.IconLocation = \'%ICON_PATH%,0\'; }; $s.Description = \'4Rent Management System (v1.0.0) by splikaa\'; $s.Save()"',
      '',
      'ie4uinit.exe -show >nul 2>&1',
      'echo [SUCCESS] "4Rent Launcher" installed on Desktop!',
      'echo Launching 4Rent Management System...',
      'start "" "msedge" --app=https://splikaa.github.io/4Rent/?desktop=1 2>nul || start "" "https://splikaa.github.io/4Rent/?desktop=1"',
      '(goto) 2>nul & del "%~f0"',
    ].join('\r\n');

    const blob = new Blob([batContent], { type: 'application/bat' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = '4Rent Launcher.bat';
    a.click();
    URL.revokeObjectURL(url);

    // Mark desktop launcher as installed so the installer card removes itself
    try {
      localStorage.setItem('4rent_desktop_installed', 'true');
    } catch {
      // ignore storage error
    }
    setIsDesktopInstalled(true);
    setStatusBanner(
      '4Rent Launcher downloaded and configured! The Desktop Installer prompt has been removed.'
    );
  };

  const handleExportJson = () => {
    const snap = exportDatabaseSnapshot();
    const blob = new Blob([JSON.stringify(snap, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `4Rent-Backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setStatusBanner('Portable database backup (.JSON) downloaded!');
  };

  const handleImportJson = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(
          reader.result as string
        ) as AppDatabaseSnapshot;
        importDatabaseSnapshot(parsed);
        onReloadAllData();
        setStatusBanner('Database backup restored successfully!');
      } catch {
        setStatusBanner('Invalid backup JSON file.');
      }
    };
    reader.readAsText(file);
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
      {/* Top Header with Generous Spacing */}
      <header className="sticky top-0 z-20 bg-[#111722]/90 backdrop-blur-xl border-b border-[#232E42] px-5 sm:px-8 h-18 flex items-center justify-between">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to Dashboard"
          className="w-11 h-11 rounded-2xl bg-[#172030] hover:bg-[#1E293D] border border-[#26334B] flex items-center justify-center text-slate-200 transition cursor-pointer btn-fluid"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="text-center">
          <h1 className="text-lg sm:text-xl font-extrabold text-white tracking-tight">
            Settings & Privacy
          </h1>
          <p className="text-[11px] text-slate-400 hidden sm:block">
            4Rent Management System • v1.0.0
          </p>
        </div>
        <div className="w-11" />
      </header>

      {/* Main Content Container — Generous Breathing Room */}
      <div className="w-full max-w-4xl mx-auto px-5 sm:px-8 lg:px-10 pt-8 space-y-8">
        {statusBanner && (
          <div className="rounded-2xl bg-amber-500/15 border border-amber-500/35 px-5 py-4 text-xs sm:text-sm font-semibold text-amber-300 shadow-lg animate-view-enter">
            {statusBanner}
          </div>
        )}

        {/* 1. Property & Global Sub-Meter Billing Rates */}
        <form
          onSubmit={handleSaveGeneral}
          className="surface-card rounded-3xl p-6 sm:p-8 space-y-6"
        >
          <div className="flex items-start sm:items-center gap-3.5 pb-4 border-b border-[#232F44]">
            <div className="w-11 h-11 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-extrabold text-white">
                Property Profile & Global Sub-Meter Rate
              </h2>
              <p className="text-xs sm:text-sm text-slate-400 mt-0.5">
                Electric sub-meter rate configured here automatically reflects
                across all rooms and unpaid bills
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 sm:gap-6 items-start">
            <div className="flex flex-col">
              <label className="block text-xs font-semibold text-slate-300 mb-2">
                System / Property Name
              </label>
              <input
                type="text"
                value={form.apartmentName}
                onChange={(e) =>
                  setForm({ ...form, apartmentName: e.target.value })
                }
                className="w-full h-11 rounded-2xl bg-[#0D121B] border border-[#263248] px-4 text-sm text-white focus:border-amber-500 focus:outline-none transition"
              />
            </div>

            <div className="flex flex-col">
              <label className="block text-xs font-semibold text-slate-300 mb-2">
                Landlord / Admin Mobile Number (Auto-Formatted)
              </label>
              <input
                type="tel"
                placeholder="0917-555-0100"
                value={form.landlordPhone}
                onChange={(e) =>
                  setForm({
                    ...form,
                    landlordPhone: formatPhoneNumber(e.target.value),
                  })
                }
                className="w-full h-11 rounded-2xl bg-[#0D121B] border border-[#263248] px-4 text-sm text-white font-mono-num focus:border-amber-500 focus:outline-none transition"
              />
            </div>

            <div className="flex flex-col">
              <label className="block text-xs font-semibold text-amber-400 mb-2">
                Global Electric Sub-Meter Rate (₱ / kWh)
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
                className="w-full h-11 rounded-2xl bg-[#0D121B] border border-amber-500/40 px-4 text-sm font-bold text-amber-400 font-mono-num focus:border-amber-500 focus:outline-none transition"
              />
            </div>

            <div className="flex flex-col">
              <label className="block text-xs font-semibold text-slate-300 mb-2">
                Default Monthly Room Rent (₱)
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
                className="w-full h-11 rounded-2xl bg-[#0D121B] border border-[#263248] px-4 text-sm font-bold text-white font-mono-num focus:border-amber-500 focus:outline-none transition"
              />
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="submit"
              className="px-6 py-3 rounded-2xl bg-[#F59E0B] hover:bg-[#FBBF24] text-slate-950 font-extrabold text-xs sm:text-sm flex items-center gap-2 shadow-lg shadow-amber-500/20 cursor-pointer btn-fluid"
            >
              <Save className="w-4 h-4" />
              <span>Save Property Settings</span>
            </button>
          </div>
        </form>

        {/* 2. Landlord Safety & Tenant Privacy Protection (RA 10173 Compliance) */}
        <div className="surface-card rounded-3xl p-6 sm:p-8 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-[#232F44]">
            <div className="flex items-start sm:items-center gap-3.5">
              <div className="w-11 h-11 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base sm:text-lg font-extrabold text-white">
                  Landlord Safety & Tenant Privacy Protection
                </h2>
                <p className="text-xs sm:text-sm text-slate-400 mt-0.5">
                  Protect landlord financial figures, tenant personal contact data
                  (RA 10173), and unauthorized access
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onOpenSecuritySetup}
              className="px-4 py-2.5 rounded-2xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/35 text-amber-400 font-bold text-xs cursor-pointer btn-fluid"
            >
              {isMobile ? 'Configure PIN / Biometrics' : 'Change 4-Digit PIN'}
            </button>
          </div>

          <div className="space-y-4">
            {/* Toggle 1: Screen Privacy Shield */}
            <div className="rounded-2xl bg-[#0D121B] border border-[#243047] p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-start gap-3.5">
                {form.privacyMaskEnabled ? (
                  <EyeOff className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                ) : (
                  <Eye className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                )}
                <div>
                  <div className="text-sm font-bold text-white">
                    Public Screen Privacy Shield (Mask Tenant PII & Revenue)
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Hides tenant phone numbers (0917-•••-••01) and total landlord
                    revenue on screen when viewing around guests or tenants.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() =>
                  toggleInstantSetting({
                    privacyMaskEnabled: !form.privacyMaskEnabled,
                  })
                }
                className={`self-start sm:self-center px-4 py-2 rounded-full text-xs font-extrabold transition cursor-pointer shrink-0 ${
                  form.privacyMaskEnabled
                    ? 'bg-emerald-500 text-slate-950'
                    : 'bg-[#172030] text-slate-300 border border-[#29364F]'
                }`}
              >
                {form.privacyMaskEnabled ? 'Privacy Masked' : 'Standard View'}
              </button>
            </div>

            {/* Toggle 2: Receipt Contact Redaction */}
            <div className="rounded-2xl bg-[#0D121B] border border-[#243047] p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-start gap-3.5">
                <FileCheck2 className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
                <div>
                  <div className="text-sm font-bold text-white">
                    Redact Tenant Mobile Number on Shared Receipts
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Partially masks tenant phone numbers on exported receipt
                    images & printouts + embeds an anti-tamper verification seal.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() =>
                  toggleInstantSetting({
                    maskReceiptContacts: !form.maskReceiptContacts,
                  })
                }
                className={`self-start sm:self-center px-4 py-2 rounded-full text-xs font-extrabold transition cursor-pointer shrink-0 ${
                  form.maskReceiptContacts
                    ? 'bg-emerald-500 text-slate-950'
                    : 'bg-[#172030] text-slate-300 border border-[#29364F]'
                }`}
              >
                {form.maskReceiptContacts ? 'Protected' : 'Unmasked'}
              </button>
            </div>

            {/* Toggle 3: Auto-Lock Inactivity Timer & PIN Protection */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="rounded-2xl bg-[#0D121B] border border-[#243047] p-4 sm:p-5 flex items-center justify-between gap-3">
                <div className="flex items-start gap-3">
                  <Timer className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <div className="text-xs sm:text-sm font-bold text-white">
                      Idle Auto-Lock Timer
                    </div>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Locks system automatically when left unattended
                    </p>
                  </div>
                </div>
                <select
                  value={form.security.autoLockMinutes ?? 15}
                  onChange={(e) => {
                    const mins = parseInt(e.target.value, 10);
                    toggleInstantSetting({
                      security: {
                        ...form.security,
                        autoLockMinutes: mins,
                      },
                    });
                  }}
                  className="h-9 rounded-xl bg-[#161E2E] border border-[#28354E] px-3 text-xs font-bold text-amber-400 focus:outline-none"
                >
                  <option value={0}>Off</option>
                  <option value={5}>5 Mins</option>
                  <option value={15}>15 Mins</option>
                  <option value={30}>30 Mins</option>
                </select>
              </div>

              <div className="rounded-2xl bg-[#0D121B] border border-[#243047] p-4 sm:p-5 flex items-center justify-between gap-3">
                <div className="flex items-start gap-3">
                  <Bell className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <div className="text-xs sm:text-sm font-bold text-white">
                      Due Reminders (Day 1–10)
                    </div>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Monthly payment window alerts
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    toggleInstantSetting({
                      remindersEnabled: !form.remindersEnabled,
                    })
                  }
                  className={`px-4 py-1.5 rounded-full text-xs font-extrabold transition cursor-pointer ${
                    form.remindersEnabled
                      ? 'bg-emerald-500 text-slate-950'
                      : 'bg-[#172030] text-slate-400 border border-[#29364F]'
                  }`}
                >
                  {form.remindersEnabled ? 'Enabled' : 'Disabled'}
                </button>
              </div>
            </div>
          </div>

          {/* Collapsible Landlord Security Audit Log */}
          <div className="pt-2 border-t border-[#1E283B]">
            <button
              type="button"
              onClick={() => setShowAuditLogs((prev) => !prev)}
              className="text-xs font-bold text-amber-400 hover:text-amber-300 flex items-center gap-1.5 cursor-pointer"
            >
              <Lock className="w-3.5 h-3.5" />
              <span>
                {showAuditLogs
                  ? 'Hide Landlord Security & Activity Audit Log'
                  : `View Landlord Security & Activity Audit Log (${auditLogs.length})`}
              </span>
            </button>

            {showAuditLogs && (
              <div className="mt-4 rounded-2xl bg-[#0D121B] border border-[#243047] p-4 max-h-56 overflow-y-auto space-y-2">
                {auditLogs.length === 0 ? (
                  <p className="text-xs text-slate-400 text-center py-4">
                    No security or billing events logged in this session yet.
                  </p>
                ) : (
                  auditLogs.slice(0, 15).map((log) => (
                    <div
                      key={log.id}
                      className="flex items-center justify-between gap-3 px-3 py-2 rounded-xl bg-[#131B29] border border-[#202B40] text-xs"
                    >
                      <div>
                        <span className="font-bold text-white">{log.action}</span>
                        <span className="text-slate-400 ml-2">{log.details}</span>
                      </div>
                      <span className="text-[10px] font-mono-num text-slate-500 shrink-0">
                        {new Date(log.createdAt).toLocaleTimeString('en-US', {
                          hour: 'numeric',
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

        {/* 3. Persistent Cloud Sync & Mobile App Companion (Desktop Installer Auto-Removed Once Installed!) */}
        <div className="surface-card rounded-3xl p-6 sm:p-8 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-[#232F44]">
            <div className="flex items-start sm:items-center gap-3.5">
              <div className="w-11 h-11 rounded-2xl bg-blue-500/15 border border-blue-500/30 flex items-center justify-center text-blue-400 shrink-0">
                <Cloud className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base sm:text-lg font-extrabold text-white">
                  Persistent Cloud Sync & Mobile App (Desktop ↔ Mobile)
                </h2>
                <p className="text-xs sm:text-sm text-slate-400 mt-0.5">
                  Pre-integrated by developer{' '}
                  <strong className="text-amber-400">splikaa</strong> • Data
                  persists safely across all app updates
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {isDesktopInstalled && (
                <span className="px-3 py-1 rounded-full bg-amber-500/15 border border-amber-500/35 text-amber-400 text-xs font-bold">
                  4Rent Launcher Active
                </span>
              )}
              <span className="px-3 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/35 text-emerald-400 text-xs font-bold">
                Persistent DB Active
              </span>
            </div>
          </div>

          <div
            className={`grid grid-cols-1 ${
              !isDesktopInstalled ? 'sm:grid-cols-2' : 'sm:grid-cols-1'
            } gap-5`}
          >
            {/* Only show Desktop Launcher download if NOT already running in Desktop version */}
            {!isDesktopInstalled && (
              <div className="rounded-2xl bg-[#0D121B] border border-[#243047] p-5 flex flex-col justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 text-sm font-bold text-white">
                    <Monitor className="w-4 h-4 text-amber-400" />
                    <span>4Rent Launcher (Desktop)</span>
                  </div>
                  <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
                    Download <strong>4Rent Launcher</strong> for 1-click Desktop
                    access. Automatically removes this installer card once
                    installed.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleDownload4RentLauncher}
                  className="w-full py-3 px-4 rounded-2xl bg-[#F59E0B] hover:bg-[#FBBF24] text-slate-950 font-extrabold text-xs flex items-center justify-center gap-2 cursor-pointer btn-fluid"
                >
                  <Download className="w-4 h-4" />
                  <span>Download 4Rent Launcher</span>
                </button>
              </div>
            )}

            {/* Desktop <-> Native Mobile App (Flutter / Swift) Real-Time Cloud Sync Box */}
            <div className="rounded-2xl bg-[#0D121B] border border-[#243047] p-5 flex flex-col justify-between gap-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 text-sm font-bold text-white">
                    <Smartphone className="w-4 h-4 text-amber-400" />
                    <span>
                      Native Mobile App (Flutter / Swift) ↔ Desktop Real-Time Sync
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
                    Syncs rooms, sub-meter readings, and official receipts live
                    between this Desktop and the installable{' '}
                    <strong className="text-slate-200">
                      Flutter / iOS Swift Mobile App
                    </strong>{' '}
                    using Property Sync Code{' '}
                    <code className="px-1.5 py-0.5 rounded bg-[#182235] text-amber-400 font-mono-num font-bold">
                      {form.cloudSync.propertyCode || '4RENT-MAIN'}
                    </code>
                    .
                  </p>
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(
                        form.cloudSync.propertyCode || '4RENT-MAIN'
                      );
                      setCopiedMobileUrl(true);
                      setTimeout(() => setCopiedMobileUrl(false), 3000);
                    } catch {
                      // ignore clipboard error
                    }
                  }}
                  className="px-3.5 py-2 rounded-xl bg-[#182235] hover:bg-[#212E46] border border-[#2B3B59] text-amber-400 font-bold text-xs inline-flex items-center gap-1.5 cursor-pointer btn-fluid shrink-0"
                >
                  {copiedMobileUrl ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="text-emerald-400">Sync Code Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>
                        Copy Sync Code ({form.cloudSync.propertyCode || '4RENT-MAIN'})
                      </span>
                    </>
                  )}
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <a
                  href="./4Rent-v1.0.0-release.apk"
                  download="4Rent-v1.0.0-release.apk"
                  className="py-3 px-3.5 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold text-xs flex items-center justify-center gap-1.5 cursor-pointer btn-fluid"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download APK (Release)</span>
                </a>
                <button
                  type="button"
                  onClick={() => {
                    const mobileUrl = `${window.location.origin}${window.location.pathname}?mobile=1`;
                    window.open(
                      mobileUrl,
                      '4RentMobileApp',
                      'width=412,height=860,menubar=no,toolbar=no,location=no,status=no'
                    );
                  }}
                  className="py-3 px-3.5 rounded-2xl bg-[#F59E0B] hover:bg-[#FBBF24] text-slate-950 font-extrabold text-xs flex items-center justify-center gap-1.5 cursor-pointer btn-fluid"
                >
                  <Smartphone className="w-3.5 h-3.5" />
                  <span>Open Mobile App (Live Sync)</span>
                </button>
                <button
                  type="button"
                  onClick={handlePushCloud}
                  disabled={isSyncing}
                  className="py-3 px-3.5 rounded-2xl bg-blue-500 hover:bg-blue-400 text-white font-extrabold text-xs flex items-center justify-center gap-1.5 cursor-pointer btn-fluid"
                >
                  <RefreshCw
                    className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`}
                  />
                  <span>Sync Push</span>
                </button>
                <button
                  type="button"
                  onClick={handlePullCloud}
                  disabled={isSyncing}
                  className="py-3 px-3.5 rounded-2xl bg-[#1A2438] hover:bg-[#24314A] border border-[#2B3B59] text-slate-200 font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer btn-fluid"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Sync Pull</span>
                </button>
              </div>
            </div>
          </div>

          {/* Collapsible Developer Cloud Endpoint Panel */}
          <div className="pt-2">
            <button
              type="button"
              onClick={() => setShowDevCloudConfig((prev) => !prev)}
              className="text-xs text-slate-500 hover:text-slate-300 font-semibold cursor-pointer"
            >
              {showDevCloudConfig
                ? 'Hide Developer Cloud Endpoint Settings (splikaa)'
                : 'Developer Cloud Endpoint Settings (Managed by splikaa)'}
            </button>

            {showDevCloudConfig && (
              <div className="mt-4 p-5 rounded-2xl bg-[#0D121B] border border-[#243047] space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                      Supabase Project URL
                    </label>
                    <input
                      type="text"
                      placeholder="https://xyz.supabase.co"
                      value={form.cloudSync.supabaseUrl}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          cloudSync: {
                            ...form.cloudSync,
                            supabaseUrl: e.target.value,
                            enabled: true,
                          },
                        })
                      }
                      className="w-full h-10 rounded-xl bg-[#151B26] border border-[#252F42] px-3.5 text-xs text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                      Supabase Anon Key
                    </label>
                    <input
                      type="password"
                      placeholder="eyJhbGciOiJIUzI1NiIs..."
                      value={form.cloudSync.supabaseAnonKey}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          cloudSync: {
                            ...form.cloudSync,
                            supabaseAnonKey: e.target.value,
                            enabled: true,
                          },
                        })
                      }
                      className="w-full h-10 rounded-xl bg-[#151B26] border border-[#252F42] px-3.5 text-xs text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                      Property Sync Code
                    </label>
                    <input
                      type="text"
                      placeholder="4RENT-MAIN"
                      value={form.cloudSync.propertyCode}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          cloudSync: {
                            ...form.cloudSync,
                            propertyCode: e.target.value,
                          },
                        })
                      }
                      className="w-full h-10 rounded-xl bg-[#151B26] border border-[#252F42] px-3.5 text-xs font-mono-num font-bold text-amber-400"
                    />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={async () => {
                      await navigator.clipboard.writeText(SUPABASE_SETUP_SQL);
                      setCopiedSql(true);
                      setTimeout(() => setCopiedSql(false), 3000);
                    }}
                    className="px-3.5 py-2 rounded-xl bg-[#151B26] border border-[#252F42] text-slate-300 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                  >
                    {copiedSql ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        <span className="text-emerald-400">
                          SQL Schema Copied!
                        </span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copy Supabase SQL Setup</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 4. Portable Database Backup & Restore (Reset to Empty Removed for Landlord Safety) */}
        <div className="surface-card rounded-3xl p-6 sm:p-8 space-y-6">
          <div className="flex items-start sm:items-center gap-3.5 pb-4 border-b border-[#232F44]">
            <div className="w-11 h-11 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-extrabold text-white">
                Database Backup & Restore
              </h2>
              <p className="text-xs sm:text-sm text-slate-400 mt-0.5">
                Export or restore your entire 4Rent Management System database as
                a portable JSON file
              </p>
            </div>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            onChange={handleImportJson}
            className="hidden"
          />

          <div className="flex flex-wrap items-center gap-4">
            <button
              type="button"
              onClick={handleExportJson}
              className="px-5 py-3 rounded-2xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/35 text-emerald-300 font-extrabold text-xs sm:text-sm flex items-center gap-2 cursor-pointer btn-fluid"
            >
              <Download className="w-4 h-4" />
              <span>Export Backup (.JSON)</span>
            </button>

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="px-5 py-3 rounded-2xl bg-[#1A2438] hover:bg-[#24314A] border border-[#2B3B59] text-slate-200 font-bold text-xs sm:text-sm flex items-center gap-2 cursor-pointer btn-fluid"
            >
              <Upload className="w-4 h-4" />
              <span>Restore Backup (.JSON)</span>
            </button>
          </div>
        </div>

        {/* 5. System Version (v1.0.0) & Peaceful Naming */}
        <div className="surface-card rounded-3xl p-6 sm:p-8 flex flex-col sm:flex-row sm:items-center justify-between gap-5">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
              <Code2 className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-extrabold text-white">
                4Rent Management System
              </h2>
              <p className="text-xs sm:text-sm text-slate-400 mt-0.5">
                Persistent Database • De-Blur Sub-Meter OCR • Desktop & Mobile
                App
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3.5 sm:text-right">
            <div className="px-4 py-2.5 rounded-2xl bg-[#0D121B] border border-[#253148]">
              <span className="text-[10px] uppercase tracking-wider text-slate-400 block">
                System Version
              </span>
              <span className="text-sm font-extrabold text-amber-400 font-mono-num">
                v1.0.0
              </span>
            </div>
            <div className="px-4 py-2.5 rounded-2xl bg-[#0D121B] border border-amber-500/35">
              <span className="text-[10px] uppercase tracking-wider text-slate-400 block">
                Developer
              </span>
              <span className="text-sm font-extrabold text-white">
                by splikaa
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
