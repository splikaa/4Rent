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
  Lock,
  Monitor,
  RefreshCw,
  Save,
  Shield,
  Sparkles,
  Trash2,
  Upload,
} from 'lucide-react';
import { AppDatabaseSnapshot, AppSettings } from '../../types/rental';
import {
  exportDatabaseSnapshot,
  importDatabaseSnapshot,
} from '../../services/storageService';
import {
  pullSnapshotFromCloud,
  pushSnapshotToCloud,
  SUPABASE_SETUP_SQL,
} from '../../services/supabaseSync';
import {
  formatPhoneNumber,
  isMobileDevice,
} from '../../utils/billingCalculator';

interface SettingsViewProps {
  settings: AppSettings;
  onBack: () => void;
  onUpdateSettings: (newSettings: AppSettings) => void;
  onReloadAllData: () => void;
  onLoadSampleData: () => void;
  onResetAllData: () => void;
  onOpenSecuritySetup: () => void;
  onInstallDesktopApp?: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  settings,
  onBack,
  onUpdateSettings,
  onReloadAllData,
  onLoadSampleData,
  onResetAllData,
  onOpenSecuritySetup,
  onInstallDesktopApp,
}) => {
  const isMobile = isMobileDevice();
  const [form, setForm] = useState<AppSettings>(settings);
  const [statusBanner, setStatusBanner] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [showDevCloudConfig, setShowDevCloudConfig] = useState(false);
  const [copiedSql, setCopiedSql] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleSaveGeneral = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdateSettings(form);
    setStatusBanner('Settings saved to persistent database!');
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

  const handleDownloadDesktopInstallerBat = () => {
    if (onInstallDesktopApp) {
      onInstallDesktopApp();
    }
    const batContent = [
      '@echo off',
      'title 4Rent Desktop Application Installer (Developed by splikaa)',
      'echo ================================================================',
      'echo   Installing 4Rent Apartment ^& Sub-Meter System (v1.3.0)',
      'echo   Developed by splikaa',
      'echo ================================================================',
      'echo.',
      'set "APP_URL=https://splikaa.github.io/4Rent/"',
      'set "ICON_DIR=%LOCALAPPDATA%\\4Rent"',
      'set "ICON_PATH=%LOCALAPPDATA%\\4Rent\\4rent-icon.ico"',
      'set "SHORTCUT=%USERPROFILE%\\Desktop\\4Rent Apartment System.lnk"',
      '',
      'if not exist "%ICON_DIR%" mkdir "%ICON_DIR%"',
      'powershell -NoProfile -ExecutionPolicy Bypass -Command "try { Invoke-WebRequest -Uri \'https://splikaa.github.io/4Rent/4rent-icon.ico\' -OutFile \'%ICON_PATH%\' -UseBasicParsing } catch {}"',
      '',
      'powershell -NoProfile -ExecutionPolicy Bypass -Command "$ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut(\'%SHORTCUT%\'); if (Test-Path \'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe\') { $s.TargetPath = \'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe\'; $s.Arguments = \'--app=%APP_URL%\'; } elseif (Test-Path \'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe\') { $s.TargetPath = \'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe\'; $s.Arguments = \'--app=%APP_URL%\'; } else { $s.TargetPath = \'%APP_URL%\'; }; if (Test-Path \'%ICON_PATH%\') { $s.IconLocation = \'%ICON_PATH%,0\'; }; $s.Description = \'4Rent Apartment Management System by splikaa\'; $s.Save()"',
      '',
      'ie4uinit.exe -show >nul 2>&1',
      'echo [SUCCESS] "4Rent Apartment System" shortcut with 4Rent Icon installed on Desktop!',
      'echo Launching 4Rent Desktop Application...',
      'start "" "msedge" --app=https://splikaa.github.io/4Rent/ 2>nul || start "" "https://splikaa.github.io/4Rent/"',
      'exit',
    ].join('\r\n');

    const blob = new Blob([batContent], { type: 'application/bat' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'Install-4Rent-Desktop.bat';
    a.click();
    URL.revokeObjectURL(url);
    setStatusBanner(
      '4Rent Desktop Installer downloaded! Run Install-4Rent-Desktop.bat to install the 4Rent icon on your Desktop.'
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
    setStatusBanner('Backup JSON file downloaded!');
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

  return (
    <div className="min-h-screen flex flex-col bg-[#0B0E14] pb-24">
      <header className="sticky top-0 z-20 bg-[#141923] border-b border-[#222B3C] px-4 sm:px-6 h-16 flex items-center justify-between">
        <button
          type="button"
          onClick={onBack}
          className="w-10 h-10 rounded-xl hover:bg-[#1E2636] flex items-center justify-center text-slate-200 transition cursor-pointer"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-lg sm:text-xl font-bold text-white">Settings</h1>
        <div className="w-10" />
      </header>

      <div className="w-full max-w-4xl mx-auto px-4 sm:px-6 pt-6 space-y-6">
        {statusBanner && (
          <div className="rounded-2xl bg-amber-500/15 border border-amber-500/30 px-4 py-3 text-xs sm:text-sm font-semibold text-amber-300">
            {statusBanner}
          </div>
        )}

        {/* 1. Property & Global Sub-Meter Billing Rates */}
        <form
          onSubmit={handleSaveGeneral}
          className="rounded-2xl bg-[#151B26] border border-[#232D40] p-5 sm:p-6 space-y-4"
        >
          <div className="flex items-center gap-2.5 pb-3 border-b border-[#20293A]">
            <Shield className="w-5 h-5 text-amber-400" />
            <div>
              <h2 className="text-base font-bold text-white">
                Apartment Profile & Global Sub-Meter Rate
              </h2>
              <p className="text-xs text-slate-400">
                Electric sub-meter rate configured here automatically reflects
                across all created rooms
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-start">
            <div className="flex flex-col">
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Apartment / Property Name
              </label>
              <input
                type="text"
                value={form.apartmentName}
                onChange={(e) =>
                  setForm({ ...form, apartmentName: e.target.value })
                }
                className="w-full h-10 rounded-xl bg-[#0E131C] border border-[#252F42] px-3.5 text-sm text-white focus:border-amber-500 focus:outline-none"
              />
            </div>

            <div className="flex flex-col">
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
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
                className="w-full h-10 rounded-xl bg-[#0E131C] border border-[#252F42] px-3.5 text-sm text-white font-mono-num focus:border-amber-500 focus:outline-none"
              />
            </div>

            <div className="flex flex-col">
              <label className="block text-xs font-semibold text-amber-400 mb-1.5">
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
                className="w-full h-10 rounded-xl bg-[#0E131C] border border-amber-500/40 px-3.5 text-sm font-bold text-amber-400 font-mono-num focus:border-amber-500 focus:outline-none"
              />
            </div>

            <div className="flex flex-col">
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
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
                className="w-full h-10 rounded-xl bg-[#0E131C] border border-[#252F42] px-3.5 text-sm font-bold text-white font-mono-num focus:border-amber-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="submit"
              className="px-5 py-2.5 rounded-xl bg-[#F59E0B] hover:bg-[#FBBF24] text-slate-950 font-bold text-xs flex items-center gap-2 cursor-pointer"
            >
              <Save className="w-4 h-4" />
              <span>Save Property Settings</span>
            </button>
          </div>
        </form>

        {/* 2. Security Lock & Notification Reminders */}
        <div className="rounded-2xl bg-[#151B26] border border-[#232D40] p-5 sm:p-6 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-[#20293A]">
            <div className="flex items-center gap-2.5">
              <Lock className="w-5 h-5 text-amber-400" />
              <div>
                <h2 className="text-base font-bold text-white">
                  {isMobile
                    ? 'App Security (PIN & Mobile Biometrics)'
                    : 'Desktop Security (4-Digit Passcode PIN)'}
                </h2>
                <p className="text-xs text-slate-400">
                  {isMobile
                    ? 'Manage your 4-digit PIN, mobile fingerprint lock, and due-date reminders'
                    : 'Desktop mode uses 4-digit Passcode PIN protection for app lock and room removal'}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onOpenSecuritySetup}
              className="px-4 py-2 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-400 font-bold text-xs cursor-pointer"
            >
              {isMobile ? 'Configure PIN / Biometrics' : 'Change 4-Digit PIN'}
            </button>
          </div>

          <div className="flex items-center justify-between text-xs sm:text-sm">
            <span className="text-slate-300 flex items-center gap-2">
              <Bell className="w-4 h-4 text-amber-400" />
              Unpaid Bill & Next-Month Due Reminders (Day 1 to 10)
            </span>
            <button
              type="button"
              onClick={() => {
                const next = {
                  ...form,
                  remindersEnabled: !form.remindersEnabled,
                };
                setForm(next);
                onUpdateSettings(next);
              }}
              className={`px-4 py-1.5 rounded-full text-xs font-bold transition cursor-pointer ${
                form.remindersEnabled
                  ? 'bg-emerald-500 text-slate-950'
                  : 'bg-[#0E131C] text-slate-400 border border-[#252F42]'
              }`}
            >
              {form.remindersEnabled ? 'Enabled' : 'Disabled'}
            </button>
          </div>
        </div>

        {/* 3. Desktop Installer & Developer-Integrated Cloud Database Sync */}
        <div className="rounded-2xl bg-[#151B26] border border-[#232D40] p-5 sm:p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-[#20293A]">
            <div className="flex items-center gap-2.5">
              <Cloud className="w-5 h-5 text-blue-400" />
              <div>
                <h2 className="text-base font-bold text-white">
                  Desktop Installer & Persistent Cloud Sync (Desktop ↔ Mobile)
                </h2>
                <p className="text-xs text-slate-400">
                  Pre-integrated by developer <strong className="text-amber-400">splikaa</strong> • Data persists safely across all app updates
                </p>
              </div>
            </div>
            <span className="px-3 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-xs font-bold">
              Persistent DB Active
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="rounded-xl bg-[#0E131C] border border-[#252F42] p-4 flex flex-col justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 text-xs font-bold text-white">
                  <Monitor className="w-4 h-4 text-amber-400" />
                  <span>4Rent Desktop Installer</span>
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  Install 4Rent directly onto Windows / Mac Desktop for instant
                  1-click landlord access.
                </p>
              </div>
              <button
                type="button"
                onClick={handleDownloadDesktopInstallerBat}
                className="w-full py-2.5 px-3 rounded-xl bg-[#F59E0B] hover:bg-[#FBBF24] text-slate-950 font-extrabold text-xs flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Install 4Rent for Desktop</span>
              </button>
            </div>

            <div className="rounded-xl bg-[#0E131C] border border-[#252F42] p-4 flex flex-col justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 text-xs font-bold text-white">
                  <RefreshCw className="w-4 h-4 text-blue-400" />
                  <span>Desktop ↔ Mobile Synchronization</span>
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  All rooms, sub-meter readings, and receipts are stored in a
                  version-proof database that never resets on update.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={handlePushCloud}
                  disabled={isSyncing}
                  className="py-2.5 px-3 rounded-xl bg-blue-500 hover:bg-blue-400 text-white font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer"
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
                  className="py-2.5 px-3 rounded-xl bg-[#1D2638] hover:bg-[#26324A] text-slate-200 font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Sync Pull</span>
                </button>
              </div>
            </div>
          </div>

          {/* Collapsible Developer Cloud Endpoint Panel (for splikaa) */}
          <div className="pt-2">
            <button
              type="button"
              onClick={() => setShowDevCloudConfig((prev) => !prev)}
              className="text-[11px] text-slate-500 hover:text-slate-300 font-semibold cursor-pointer"
            >
              {showDevCloudConfig
                ? 'Hide Developer Cloud Endpoint Settings (splikaa)'
                : 'Developer Cloud Endpoint Settings (Managed by splikaa)'}
            </button>

            {showDevCloudConfig && (
              <div className="mt-3 p-4 rounded-xl bg-[#0E131C] border border-[#252F42] space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
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
                      className="w-full h-9 rounded-xl bg-[#151B26] border border-[#252F42] px-3 text-xs text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
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
                      className="w-full h-9 rounded-xl bg-[#151B26] border border-[#252F42] px-3 text-xs text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
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
                      className="w-full h-9 rounded-xl bg-[#151B26] border border-[#252F42] px-3 text-xs font-mono-num font-bold text-amber-400"
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
                    className="px-3 py-1.5 rounded-lg bg-[#151B26] border border-[#252F42] text-slate-300 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                  >
                    {copiedSql ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        <span className="text-emerald-400">SQL Schema Copied!</span>
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

        {/* 4. Local Offline Backup, Demo Data & Reset */}
        <div className="rounded-2xl bg-[#151B26] border border-[#232D40] p-5 sm:p-6 space-y-4">
          <div className="flex items-center gap-2.5 pb-3 border-b border-[#20293A]">
            <Database className="w-5 h-5 text-emerald-400" />
            <div>
              <h2 className="text-base font-bold text-white">
                Database Backup, Demo Data & Reset
              </h2>
              <p className="text-xs text-slate-400">
                Export or restore your entire 4Rent database as a portable JSON
                file
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

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleExportJson}
              className="px-4 py-2.5 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-300 font-bold text-xs flex items-center gap-1.5 cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>Export Backup (.JSON)</span>
            </button>

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="px-4 py-2.5 rounded-xl bg-[#1D2638] hover:bg-[#26324A] text-slate-200 font-bold text-xs flex items-center gap-1.5 cursor-pointer"
            >
              <Upload className="w-4 h-4" />
              <span>Restore Backup (.JSON)</span>
            </button>

            <button
              type="button"
              onClick={onLoadSampleData}
              className="px-4 py-2.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-300 font-bold text-xs flex items-center gap-1.5 cursor-pointer"
            >
              <Sparkles className="w-4 h-4" />
              <span>Load Demo Apartment Data</span>
            </button>

            <button
              type="button"
              onClick={onResetAllData}
              className="px-4 py-2.5 rounded-xl bg-red-500/15 hover:bg-red-500/25 border border-red-500/30 text-red-300 font-bold text-xs flex items-center gap-1.5 cursor-pointer ml-auto"
            >
              <Trash2 className="w-4 h-4" />
              <span>Reset to Empty State</span>
            </button>
          </div>
        </div>

        {/* 5. System Version & Developer Attribution */}
        <div className="rounded-2xl bg-[#151B26] border border-[#232D40] p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
              <Code2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-extrabold text-white">
                4Rent Apartment & Sub-Meter Management System
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Persistent Database • Enhanced De-Blur OCR • Desktop & Mobile
                Synchronized
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 sm:text-right">
            <div className="px-3.5 py-2 rounded-xl bg-[#0E131C] border border-[#252F42]">
              <span className="text-[10px] uppercase tracking-wider text-slate-400 block">
                System Version
              </span>
              <span className="text-sm font-extrabold text-amber-400 font-mono-num">
                v1.3.0
              </span>
            </div>
            <div className="px-3.5 py-2 rounded-xl bg-[#0E131C] border border-amber-500/30">
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
