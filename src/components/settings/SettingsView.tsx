import React, { useRef, useState } from 'react';
import {
  ArrowLeft,
  Bell,
  Check,
  Cloud,
  Copy,
  Database,
  Download,
  Lock,
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

interface SettingsViewProps {
  settings: AppSettings;
  onBack: () => void;
  onUpdateSettings: (newSettings: AppSettings) => void;
  onReloadAllData: () => void;
  onLoadSampleData: () => void;
  onResetAllData: () => void;
  onOpenSecuritySetup: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  settings,
  onBack,
  onUpdateSettings,
  onReloadAllData,
  onLoadSampleData,
  onResetAllData,
  onOpenSecuritySetup,
}) => {
  const [form, setForm] = useState<AppSettings>(settings);
  const [statusBanner, setStatusBanner] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [copiedSql, setCopiedSql] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleSaveGeneral = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdateSettings(form);
    setStatusBanner('Settings saved successfully!');
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
    }
    setStatusBanner(res.message);
  };

  const handlePullCloud = async () => {
    setIsSyncing(true);
    setStatusBanner(null);
    const res = await pullSnapshotFromCloud(form.cloudSync);
    setIsSyncing(false);
    if (res.ok && res.snapshot) {
      importDatabaseSnapshot(res.snapshot);
      onReloadAllData();
    }
    setStatusBanner(res.message);
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

        {/* 1. Property & Default Sub-Meter Billing Rates */}
        <form
          onSubmit={handleSaveGeneral}
          className="rounded-2xl bg-[#151B26] border border-[#232D40] p-5 sm:p-6 space-y-4"
        >
          <div className="flex items-center gap-2.5 pb-3 border-b border-[#20293A]">
            <Shield className="w-5 h-5 text-amber-400" />
            <div>
              <h2 className="text-base font-bold text-white">
                Apartment Profile & Default Sub-Meter Rates
              </h2>
              <p className="text-xs text-slate-400">
                Appears on official printable receipts and Messenger billing
                statements
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Apartment / Property Name
              </label>
              <input
                type="text"
                value={form.apartmentName}
                onChange={(e) =>
                  setForm({ ...form, apartmentName: e.target.value })
                }
                className="w-full rounded-xl bg-[#0E131C] border border-[#252F42] px-3.5 py-2.5 text-sm text-white"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Landlord / Admin Contact Phone
              </label>
              <input
                type="text"
                value={form.landlordPhone}
                onChange={(e) =>
                  setForm({ ...form, landlordPhone: e.target.value })
                }
                className="w-full rounded-xl bg-[#0E131C] border border-[#252F42] px-3.5 py-2.5 text-sm text-white"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Default Electric Sub-Meter Rate (₱ / kWh)
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
                className="w-full rounded-xl bg-[#0E131C] border border-[#252F42] px-3.5 py-2.5 text-sm font-bold text-amber-400 font-mono-num"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
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
                className="w-full rounded-xl bg-[#0E131C] border border-[#252F42] px-3.5 py-2.5 text-sm font-bold text-white font-mono-num"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Payment Instructions (Shown on Printable & Messenger Receipts)
              </label>
              <textarea
                rows={2}
                value={form.paymentInstructions}
                onChange={(e) =>
                  setForm({ ...form, paymentInstructions: e.target.value })
                }
                className="w-full rounded-xl bg-[#0E131C] border border-[#252F42] px-3.5 py-2.5 text-xs text-white"
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
                  App Security (PIN & Biometrics) & Reminders
                </h2>
                <p className="text-xs text-slate-400">
                  Manage your Passcode PIN, Fingerprint lock, and due-date
                  notifications
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onOpenSecuritySetup}
              className="px-4 py-2 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-400 font-bold text-xs cursor-pointer"
            >
              Configure PIN / Fingerprint
            </button>
          </div>

          <div className="flex items-center justify-between text-xs sm:text-sm">
            <span className="text-slate-300 flex items-center gap-2">
              <Bell className="w-4 h-4 text-amber-400" />
              Unpaid Bill & Due-Date Device Reminders
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

        {/* 3. Supabase Cloud Sync (Desktop <-> Mobile) */}
        <div className="rounded-2xl bg-[#151B26] border border-[#232D40] p-5 sm:p-6 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-[#20293A]">
            <div className="flex items-center gap-2.5">
              <Cloud className="w-5 h-5 text-blue-400" />
              <div>
                <h2 className="text-base font-bold text-white">
                  Supabase Cloud Sync (Desktop ↔ Mobile)
                </h2>
                <p className="text-xs text-slate-400">
                  Sync rooms, sub-meter readings, and payments across devices
                  with offline fallback
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                const next = {
                  ...form,
                  cloudSync: {
                    ...form.cloudSync,
                    enabled: !form.cloudSync.enabled,
                  },
                };
                setForm(next);
                onUpdateSettings(next);
              }}
              className={`px-4 py-1.5 rounded-full text-xs font-bold transition cursor-pointer ${
                form.cloudSync.enabled
                  ? 'bg-blue-500 text-white'
                  : 'bg-[#0E131C] text-slate-400 border border-[#252F42]'
              }`}
            >
              {form.cloudSync.enabled ? 'Cloud Sync Active' : 'Offline-Only Mode'}
            </button>
          </div>

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
                    },
                  })
                }
                className="w-full rounded-xl bg-[#0E131C] border border-[#252F42] px-3 py-2 text-xs text-white"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Supabase Anon Public Key
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
                    },
                  })
                }
                className="w-full rounded-xl bg-[#0E131C] border border-[#252F42] px-3 py-2 text-xs text-white"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Shared Property Sync Code
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
                className="w-full rounded-xl bg-[#0E131C] border border-[#252F42] px-3 py-2 text-xs font-mono-num font-bold text-amber-400"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 pt-2">
            <button
              type="button"
              onClick={handlePushCloud}
              disabled={isSyncing}
              className="px-4 py-2 rounded-xl bg-blue-500 hover:bg-blue-400 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`}
              />
              <span>Push Local Data to Cloud</span>
            </button>
            <button
              type="button"
              onClick={handlePullCloud}
              disabled={isSyncing}
              className="px-4 py-2 rounded-xl bg-[#1D2638] hover:bg-[#26324A] text-slate-200 font-bold text-xs flex items-center gap-1.5 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Pull Data from Cloud</span>
            </button>
            <button
              type="button"
              onClick={async () => {
                await navigator.clipboard.writeText(SUPABASE_SETUP_SQL);
                setCopiedSql(true);
                setTimeout(() => setCopiedSql(false), 3000);
              }}
              className="px-3.5 py-2 rounded-xl bg-[#0E131C] border border-[#252F42] text-slate-300 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
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

        {/* 4. Local Offline Backup, Demo Data & Reset */}
        <div className="rounded-2xl bg-[#151B26] border border-[#232D40] p-5 sm:p-6 space-y-4">
          <div className="flex items-center gap-2.5 pb-3 border-b border-[#20293A]">
            <Database className="w-5 h-5 text-emerald-400" />
            <div>
              <h2 className="text-base font-bold text-white">
                Offline Backup, Demo Data & Reset
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
      </div>
    </div>
  );
};

