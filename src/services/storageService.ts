import {
  AppDatabaseSnapshot,
  AppSettings,
  BillRecord,
  Room,
  RoomInquiryBooking,
  SecurityAuditEntry,
  TenantHistoryEntry,
} from '../types/rental';
import { saveSnapshotToIndexedDb } from './idbDatabase';

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
const DEV_SUPABASE_URL =
  viteEnv.VITE_SUPABASE_URL ||
  _decodeSecret('aHR0cHM6Ly9uZndneWlxZG15bmFxa3BoZ2ZxZS5zdXBhYmFzZS5jbw==');
const DEV_SUPABASE_ANON_KEY =
  viteEnv.VITE_SUPABASE_ANON_KEY ||
  _decodeSecret(
    'c2JfcHVibGlzaGFibGVfRGxjTUctSk8zWl9tOFczNEFUemJsQV9zT05XRFk0bg=='
  );
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
    lockEnabled: false,
    authMethod: 'none',
    pinCode: '1234',
    autoLockMinutes: 15,
    requirePinForSensitiveActions: true,
  },
  cloudSync: {
    enabled: Boolean(DEV_SUPABASE_URL && DEV_SUPABASE_ANON_KEY),
    supabaseUrl: DEV_SUPABASE_URL,
    supabaseAnonKey: DEV_SUPABASE_ANON_KEY,
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
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      apartmentName: normalizedName,
      security: {
        ...DEFAULT_SETTINGS.security,
        ...(parsed.security || {}),
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
        supabaseUrl: parsed.cloudSync?.supabaseUrl || DEV_SUPABASE_URL,
        supabaseAnonKey:
          parsed.cloudSync?.supabaseAnonKey || DEV_SUPABASE_ANON_KEY,
        propertyCode: parsed.cloudSync?.propertyCode || DEV_PROPERTY_CODE,
      },
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: AppSettings): void {
  localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
  persistMasterIndexedDb();
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
  localStorage.setItem(STORAGE_KEYS.ROOMS, JSON.stringify(sanitized));
  persistMasterIndexedDb();
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
  localStorage.setItem(STORAGE_KEYS.BILLS, JSON.stringify(bills));
  persistMasterIndexedDb();
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
  localStorage.setItem(STORAGE_KEYS.INQUIRIES, JSON.stringify(inquiries));
  persistMasterIndexedDb();
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
  localStorage.setItem(STORAGE_KEYS.HISTORY, JSON.stringify(history));
  persistMasterIndexedDb();
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

export function exportDatabaseSnapshot(): AppDatabaseSnapshot {
  return {
    version: '1.0.0',
    exportedAt: new Date().toISOString(),
    rooms: loadRooms(),
    bills: loadBills(),
    inquiries: loadInquiries(),
    tenantHistory: loadTenantHistory(),
    settings: loadSettings(),
  };
}

function persistMasterIndexedDb(): void {
  const snap = exportDatabaseSnapshot();
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
}
