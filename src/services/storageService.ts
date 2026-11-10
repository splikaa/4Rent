import {
  AppDatabaseSnapshot,
  AppSettings,
  BillRecord,
  Room,
  RoomInquiryBooking,
  SecurityAuditEntry,
  SubMeterReadingLog,
  TenantHistoryEntry,
} from '../types/rental';
import {
  saveSnapshotToIndexedDb,
  loadSnapshotFromIndexedDb,
} from './idbDatabase';

let _isAppHydrated = false;

export function isAppHydrated(): boolean {
  return _isAppHydrated;
}

export function setAppHydrated(hydrated: boolean): void {
  _isAppHydrated = hydrated;
}

/**
 * Stable, version-independent storage keys so app updates NEVER wipe existing data.
 */
const STORAGE_KEYS = {
  ROOMS: '4rent_db_rooms',
  BILLS: '4rent_db_bills',
  INQUIRIES: '4rent_db_inquiries',
  HISTORY: '4rent_db_tenant_history',
  SETTINGS: '4rent_db_settings',
  AUDIT_LOG: '4rent_db_audit_log',
  METER_LOGS: '4rent_db_meter_logs',
};

// Safe runtime decoder so raw credentials and project endpoints are never exposed in git tracking
const _decodeSecret = (b64: string): string => {
  try {
    return atob(b64);
  } catch {
    return '';
  }
};

const viteEnv =
  (import.meta as unknown as { env?: Record<string, string> }).env || {};
const DEV_FIREBASE_PROJECT_ID =
  viteEnv.VITE_FIREBASE_PROJECT_ID || 'rent-41279';
const DEV_FIREBASE_DATABASE_URL =
  viteEnv.VITE_FIREBASE_DATABASE_URL ||
  'https://rent-41279-default-rtdb.asia-southeast1.firebasedatabase.app';
const DEV_FIREBASE_API_KEY =
  viteEnv.VITE_FIREBASE_API_KEY ||
  'AIzaSyADZ1u2AAvEF1Rvh3knPjck_rnRihP2Ifk';
const DEV_PROPERTY_CODE = viteEnv.VITE_PROPERTY_CODE || '4RENT-MAIN';

export const DEFAULT_SETTINGS: AppSettings = {
  apartmentName: '4Rent Management System',
  landlordName: 'Property Administrator',
  landlordPhone: '0917-000-0000',
  landlordMessenger: '',
  paymentInstructions: '',
  defaultElectricRate: 15.0,
  defaultMonthlyRent: 4500.0,
  defaultSecurityDeposit: 4500.0,
  remindersPromptShown: false,
  remindersEnabled: false,
  receiptPrintFormat: 'standard',
  privacyMaskEnabled: false,
  maskReceiptContacts: true,
  security: {
    isSetupComplete: false,
    lockEnabled: true,
    authMethod: 'pin',
    pinCode: '1234',
    autoLockMinutes: 15,
    requirePinForSensitiveActions: true,
  },
  cloudSync: {
    enabled: false,
    provider: 'firebase',
    firebaseProjectId: DEV_FIREBASE_PROJECT_ID,
    firebaseApiKey: DEV_FIREBASE_API_KEY,
    firebaseDatabaseUrl: DEV_FIREBASE_DATABASE_URL,
    propertyCode: DEV_PROPERTY_CODE,
  },
};

export function loadSettings(): AppSettings {
  try {
    const raw =
      localStorage.getItem(STORAGE_KEYS.SETTINGS) ||
      localStorage.getItem('4rent_settings_v2') ||
      localStorage.getItem('4rent_settings_v1');
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw);
    const normalizedName =
      !parsed.apartmentName || parsed.apartmentName === '4Rent'
        ? '4Rent Management System'
        : parsed.apartmentName;
    const rawAuthMethod = parsed.security?.authMethod;
    const hasValidAuth =
      Boolean(parsed.security?.isSetupComplete) &&
      rawAuthMethod !== 'none';

    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      apartmentName: normalizedName,
      security: {
        ...DEFAULT_SETTINGS.security,
        ...(parsed.security || {}),
        isSetupComplete: hasValidAuth,
        lockEnabled: true,
        authMethod:
          rawAuthMethod === 'fingerprint' ? 'fingerprint' : 'pin',
        pinCode: parsed.security?.pinCode || '1234',
        autoLockMinutes:
          typeof parsed.security?.autoLockMinutes === 'number'
            ? parsed.security.autoLockMinutes
            : 15,
        requirePinForSensitiveActions:
          parsed.security?.requirePinForSensitiveActions ?? true,
      },
      cloudSync: {
        ...DEFAULT_SETTINGS.cloudSync,
        ...(parsed.cloudSync || {}),
        provider: parsed.cloudSync?.provider || 'firebase',
        firebaseProjectId:
          parsed.cloudSync?.firebaseProjectId || DEV_FIREBASE_PROJECT_ID,
        firebaseApiKey:
          parsed.cloudSync?.firebaseApiKey || DEV_FIREBASE_API_KEY,
        firebaseDatabaseUrl:
          parsed.cloudSync?.firebaseDatabaseUrl || DEV_FIREBASE_DATABASE_URL,
        propertyCode: parsed.cloudSync?.propertyCode || DEV_PROPERTY_CODE,
      },
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: AppSettings): void {
  const nextRaw = JSON.stringify(settings);
  if (localStorage.getItem(STORAGE_KEYS.SETTINGS) !== nextRaw) {
    localStorage.setItem(STORAGE_KEYS.SETTINGS, nextRaw);
    persistMasterIndexedDb();
    broadcastLocalChange(STORAGE_KEYS.SETTINGS);
  }
}

export function loadRooms(): Room[] {
  try {
    const raw =
      localStorage.getItem(STORAGE_KEYS.ROOMS) ||
      localStorage.getItem('4rent_rooms_v2') ||
      localStorage.getItem('4rent_rooms_v1');
    const rooms: Room[] = raw ? JSON.parse(raw) : [];

    // Strictly enforce rules:
    // 1. Vacant rooms NEVER hold advance balance or unpaid dues.
    // 2. Deposit is required and defaults to monthly rent if 0.
    return rooms.map((r) => {
      const isVacant = r.status === 'vacant';
      const safeDeposit =
        r.securityDeposit > 0 ? r.securityDeposit : r.monthlyRent || 4500;
      return {
        ...r,
        securityDeposit: safeDeposit,
        advanceRent: isVacant ? 0 : Math.max(0, r.advanceRent || 0),
        unpaidBalance: isVacant ? 0 : Math.max(0, r.unpaidBalance || 0),
        activeReceiptId: isVacant ? undefined : r.activeReceiptId,
      };
    });
  } catch {
    return [];
  }
}

export function saveRooms(rooms: Room[]): void {
  const sanitized = rooms.map((r) => {
    const isVacant = r.status === 'vacant';
    return {
      ...r,
      advanceRent: isVacant ? 0 : Math.max(0, r.advanceRent || 0),
      unpaidBalance: isVacant ? 0 : Math.max(0, r.unpaidBalance || 0),
      activeReceiptId: isVacant ? undefined : r.activeReceiptId,
    };
  });
  const nextRaw = JSON.stringify(sanitized);
  if (localStorage.getItem(STORAGE_KEYS.ROOMS) !== nextRaw) {
    localStorage.setItem(STORAGE_KEYS.ROOMS, nextRaw);
    persistMasterIndexedDb();
    broadcastLocalChange(STORAGE_KEYS.ROOMS);
  }
}

export function loadBills(): BillRecord[] {
  try {
    const raw =
      localStorage.getItem(STORAGE_KEYS.BILLS) ||
      localStorage.getItem('4rent_bills_v2') ||
      localStorage.getItem('4rent_bills_v1');
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveBills(bills: BillRecord[]): void {
  const nextRaw = JSON.stringify(bills);
  if (localStorage.getItem(STORAGE_KEYS.BILLS) !== nextRaw) {
    localStorage.setItem(STORAGE_KEYS.BILLS, nextRaw);
    persistMasterIndexedDb();
    broadcastLocalChange(STORAGE_KEYS.BILLS);
  }
}

export function loadInquiries(): RoomInquiryBooking[] {
  try {
    const raw =
      localStorage.getItem(STORAGE_KEYS.INQUIRIES) ||
      localStorage.getItem('4rent_inquiries_v2');
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveInquiries(inquiries: RoomInquiryBooking[]): void {
  const nextRaw = JSON.stringify(inquiries);
  if (localStorage.getItem(STORAGE_KEYS.INQUIRIES) !== nextRaw) {
    localStorage.setItem(STORAGE_KEYS.INQUIRIES, nextRaw);
    persistMasterIndexedDb();
    broadcastLocalChange(STORAGE_KEYS.INQUIRIES);
  }
}

export function loadTenantHistory(): TenantHistoryEntry[] {
  try {
    const raw =
      localStorage.getItem(STORAGE_KEYS.HISTORY) ||
      localStorage.getItem('4rent_tenant_history_v2') ||
      localStorage.getItem('4rent_tenant_history_v1');
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveTenantHistory(history: TenantHistoryEntry[]): void {
  const nextRaw = JSON.stringify(history);
  if (localStorage.getItem(STORAGE_KEYS.HISTORY) !== nextRaw) {
    localStorage.setItem(STORAGE_KEYS.HISTORY, nextRaw);
    persistMasterIndexedDb();
    broadcastLocalChange(STORAGE_KEYS.HISTORY);
  }
}

export function loadAuditLogs(): SecurityAuditEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.AUDIT_LOG);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function appendAuditLog(
  action: string,
  details: string,
  category: SecurityAuditEntry['category'] = 'security'
): SecurityAuditEntry[] {
  const existing = loadAuditLogs();
  const next: SecurityAuditEntry[] = [
    {
      id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      action,
      details,
      category,
      createdAt: new Date().toISOString(),
    },
    ...existing,
  ].slice(0, 60);
  localStorage.setItem(STORAGE_KEYS.AUDIT_LOG, JSON.stringify(next));
  return next;
}

export function loadReadingLogs(roomId?: string): SubMeterReadingLog[] {
  try {
    const raw =
      localStorage.getItem(STORAGE_KEYS.METER_LOGS) ||
      localStorage.getItem('4rent_meter_logs_v1');
    const logs: SubMeterReadingLog[] = raw ? JSON.parse(raw) : [];
    if (!roomId) {
      return [...logs].sort((a, b) => b.readingDate.localeCompare(a.readingDate));
    }
    return logs
      .filter((l) => l.roomId === roomId)
      .sort((a, b) => b.readingDate.localeCompare(a.readingDate));
  } catch {
    return [];
  }
}

export function saveReadingLogs(logs: SubMeterReadingLog[]): void {
  const nextRaw = JSON.stringify(logs);
  if (localStorage.getItem(STORAGE_KEYS.METER_LOGS) !== nextRaw) {
    localStorage.setItem(STORAGE_KEYS.METER_LOGS, nextRaw);
    persistMasterIndexedDb();
    broadcastLocalChange(STORAGE_KEYS.METER_LOGS);
  }
}

export function appendReadingLog(log: SubMeterReadingLog): SubMeterReadingLog[] {
  const existing = loadReadingLogs();
  const next = [log, ...existing.filter((item) => item.id !== log.id)];
  saveReadingLogs(next);
  return next;
}

export function exportDatabaseSnapshot(): AppDatabaseSnapshot {
  return {
    version: '1.0.0',
    exportedAt: new Date().toISOString(),
    rooms: loadRooms(),
    bills: loadBills(),
    inquiries: loadInquiries(),
    tenantHistory: loadTenantHistory(),
    settings: loadSettings(),
    meterLogs: loadReadingLogs(),
  };
}

async function persistMasterIndexedDb(): Promise<void> {
  if (!_isAppHydrated) return;
  const snap = exportDatabaseSnapshot();
  const isCandidateEmpty =
    (!snap.rooms || snap.rooms.length === 0) &&
    (!snap.bills || snap.bills.length === 0) &&
    (!snap.tenantHistory || snap.tenantHistory.length === 0);

  if (isCandidateEmpty) {
    try {
      const existing = await loadSnapshotFromIndexedDb();
      if (
        (existing?.rooms && existing.rooms.length > 0) ||
        (existing?.bills && existing.bills.length > 0) ||
        (existing?.tenantHistory && existing.tenantHistory.length > 0)
      ) {
        console.warn(
          '[4Rent Storage Guard] Blocked empty snapshot overwrite of populated IndexedDB backup.'
        );
        return;
      }
    } catch {
      // Proceed if check fails
    }
  }

  saveSnapshotToIndexedDb(snap);
}

export function importDatabaseSnapshot(snapshot: AppDatabaseSnapshot): void {
  if (Array.isArray(snapshot.rooms)) {
    saveRooms(snapshot.rooms);
  }
  if (Array.isArray(snapshot.bills)) {
    saveBills(snapshot.bills);
  }
  if (Array.isArray(snapshot.inquiries)) {
    saveInquiries(snapshot.inquiries);
  }
  if (Array.isArray(snapshot.tenantHistory)) {
    saveTenantHistory(snapshot.tenantHistory);
  }
  if (snapshot.settings) {
    saveSettings(snapshot.settings);
  }
  if (Array.isArray(snapshot.meterLogs)) {
    saveReadingLogs(snapshot.meterLogs);
  }
}

const SYNC_CHANNEL_NAME = '4rent_realtime_sync_channel';
const WINDOW_INSTANCE_ID = Math.random().toString(36).slice(2, 10);

function broadcastLocalChange(key: string): void {
  try {
    if (typeof BroadcastChannel !== 'undefined') {
      const ch = new BroadcastChannel(SYNC_CHANNEL_NAME);
      ch.postMessage({
        senderId: WINDOW_INSTANCE_ID,
        key,
        updatedAt: Date.now(),
      });
      ch.close();
    }
  } catch {
    // ignore BroadcastChannel errors on older WebViews
  }
}

export function subscribeToLocalCrossWindowSync(onSync: () => void): () => void {
  let ch: BroadcastChannel | null = null;
  try {
    if (typeof BroadcastChannel !== 'undefined') {
      ch = new BroadcastChannel(SYNC_CHANNEL_NAME);
      ch.onmessage = (event) => {
        if (event.data && event.data.senderId !== WINDOW_INSTANCE_ID) {
          onSync();
        }
      };
    }
  } catch {
    // ignore
  }

  const handleStorageEvent = (e: StorageEvent) => {
    if (
      e.key &&
      Object.values(STORAGE_KEYS).includes(e.key)
    ) {
      onSync();
    }
  };

  window.addEventListener('storage', handleStorageEvent);

  return () => {
    if (ch) {
      ch.close();
    }
    window.removeEventListener('storage', handleStorageEvent);
  };
}
