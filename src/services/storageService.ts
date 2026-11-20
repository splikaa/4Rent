import {
  AppDatabaseSnapshot,
  AppSettings,
  BillRecord,
  MonthlyMeterReading,
  Room,
  RoomInquiryBooking,
  SecurityAuditEntry,
  SubMeterReadingLog,
  TenantHistoryEntry,
} from '../types/rental';
import {
  saveMeterMasterImage,
  saveSnapshotToIndexedDb,
  loadSnapshotFromIndexedDb,
  syncMonthlyReadingsToIndexedDb,
} from './idbDatabase';
import {
  reconcileRoomAdvanceLedger,
  roundCurrencyCentavos,
  roundKwh,
} from '../utils/financialEngine';
import { normalizeBillingMonthKey } from '../utils/rentSchedule';
import {
  getOrCreateDevicePropertyCode,
  normalizePropertyCode,
} from '../utils/propertyCode';

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
const CURRENT_SCHEMA_VERSION = 2;

const STORAGE_KEYS = {
  ROOMS: '4rent_db_rooms',
  BILLS: '4rent_db_bills',
  INQUIRIES: '4rent_db_inquiries',
  HISTORY: '4rent_db_tenant_history',
  SETTINGS: '4rent_db_settings',
  AUDIT_LOG: '4rent_db_audit_log',
  METER_LOGS: '4rent_db_meter_logs',
  MONTHLY_READINGS: '4rent_db_monthly_readings',
  SCHEMA_VERSION: '4rent_db_schema_version',
};

const viteEnv =
  (import.meta as unknown as { env?: Record<string, string> }).env || {};
const DEV_FIREBASE_PROJECT_ID =
  viteEnv.VITE_FIREBASE_PROJECT_ID || 'rent-41279';
const DEV_FIREBASE_DATABASE_URL =
  viteEnv.VITE_FIREBASE_DATABASE_URL ||
  'https://rent-41279-default-rtdb.asia-southeast1.firebasedatabase.app';
const DEV_FIREBASE_API_KEY = viteEnv.VITE_FIREBASE_API_KEY || '';
const DEV_PROPERTY_CODE = normalizePropertyCode(viteEnv.VITE_PROPERTY_CODE || '');

function createDefaultSettings(): AppSettings {
  return {
    apartmentName: '4Rent Management System',
    landlordName: 'Property Administrator',
    landlordPhone: '0917-000-0000',
    landlordMessenger: '',
    paymentInstructions: '',
    defaultElectricRate: 15.0,
    monthlyElectricRates: {},
    defaultMonthlyRent: 4500.0,
    defaultSecurityDeposit: 4500.0,
    latePenalty: {
      enabled: true,
      mode: 'daily_rent',
      value: null,
      applyPerDay: true,
    },
    advanceCapMode: 'unlimited',
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
      enabled: true,
      provider: 'firebase',
      firebaseProjectId: DEV_FIREBASE_PROJECT_ID,
      firebaseApiKey: DEV_FIREBASE_API_KEY,
      firebaseDatabaseUrl: DEV_FIREBASE_DATABASE_URL,
      propertyCode: DEV_PROPERTY_CODE || getOrCreateDevicePropertyCode(),
    },
  };
}

export const DEFAULT_SETTINGS: AppSettings = createDefaultSettings();

const INLINE_DATA_URL_THRESHOLD = 4000;
const _pendingImageOffloads = new Set<Promise<string>>();

function fastContentHash(input: string): string {
  let hash = 0x811c9dc5;
  const len = input.length;
  const step = Math.max(1, Math.floor(len / 96));
  for (let i = 0; i < len; i += step) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  hash ^= len;
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function offloadImageValue(
  scopeId: string,
  val: string | undefined,
  maxInlineChars = INLINE_DATA_URL_THRESHOLD
): string | undefined {
  if (!val || !val.startsWith('data:') || val.length <= maxInlineChars) {
    return val;
  }
  const safeScope = scopeId.replace(/[^a-zA-Z0-9_-]/g, '_');
  const key = `idb:meter:${safeScope}_${fastContentHash(val)}`;
  const p = saveMeterMasterImage(key, val).finally(() => {
    _pendingImageOffloads.delete(p);
  });
  _pendingImageOffloads.add(p);
  return key;
}

function compactRoomsMedia(
  rooms: Room[],
  maxInlineChars = INLINE_DATA_URL_THRESHOLD
): { compacted: Room[]; changed: boolean } {
  let changed = false;
  const compacted = rooms.map((r) => {
    const nextPhoto = offloadImageValue(
      `room_${r.id}_photo`,
      r.lastMeterPhotoDataUrl,
      maxInlineChars
    );
    const nextCrop = offloadImageValue(
      `room_${r.id}_crop`,
      r.lastMeterCropDataUrl,
      maxInlineChars
    );
    if (nextPhoto !== r.lastMeterPhotoDataUrl || nextCrop !== r.lastMeterCropDataUrl) {
      changed = true;
      return {
        ...r,
        lastMeterPhotoDataUrl: nextPhoto,
        lastMeterCropDataUrl: nextCrop,
      };
    }
    return r;
  });
  return { compacted, changed };
}

function compactBillsMedia(
  bills: BillRecord[],
  maxInlineChars = INLINE_DATA_URL_THRESHOLD
): { compacted: BillRecord[]; changed: boolean } {
  let changed = false;
  const compacted = bills.map((b) => {
    const nextPrev = offloadImageValue(
      `bill_${b.id}_prev`,
      b.prevMeterPhotoDataUrl,
      maxInlineChars
    );
    const nextPrevCrop = offloadImageValue(
      `bill_${b.id}_prev_crop`,
      b.prevMeterCropDataUrl,
      maxInlineChars
    );
    const nextCurr = offloadImageValue(
      `bill_${b.id}_curr`,
      b.meterPhotoDataUrl,
      maxInlineChars
    );
    const nextCurrCrop = offloadImageValue(
      `bill_${b.id}_curr_crop`,
      b.currMeterCropDataUrl,
      maxInlineChars
    );
    if (
      nextPrev !== b.prevMeterPhotoDataUrl ||
      nextPrevCrop !== b.prevMeterCropDataUrl ||
      nextCurr !== b.meterPhotoDataUrl ||
      nextCurrCrop !== b.currMeterCropDataUrl
    ) {
      changed = true;
      return {
        ...b,
        prevMeterPhotoDataUrl: nextPrev,
        prevMeterCropDataUrl: nextPrevCrop,
        meterPhotoDataUrl: nextCurr,
        currMeterCropDataUrl: nextCurrCrop,
      };
    }
    return b;
  });
  return { compacted, changed };
}

function compactLogsMedia(
  logs: SubMeterReadingLog[],
  maxInlineChars = INLINE_DATA_URL_THRESHOLD
): { compacted: SubMeterReadingLog[]; changed: boolean } {
  let changed = false;
  const compacted = logs.map((l) => {
    const nextPhoto = offloadImageValue(`log_${l.id}_photo`, l.photoDataUrl, maxInlineChars);
    const nextCrop = offloadImageValue(`log_${l.id}_crop`, l.cropDataUrl, maxInlineChars);
    if (nextPhoto !== l.photoDataUrl || nextCrop !== l.cropDataUrl) {
      changed = true;
      return {
        ...l,
        photoDataUrl: nextPhoto,
        cropDataUrl: nextCrop,
      };
    }
    return l;
  });
  return { compacted, changed };
}

function compactMonthlyReadingsMedia(
  readings: MonthlyMeterReading[],
  maxInlineChars = INLINE_DATA_URL_THRESHOLD
): { compacted: MonthlyMeterReading[]; changed: boolean } {
  let changed = false;
  const compacted = readings.map((r) => {
    const nextPrevPhoto = offloadImageValue(
      `mread_${r.id}_prev_photo`,
      r.prevPhotoDataUrl,
      maxInlineChars
    );
    const nextPrevCrop = offloadImageValue(
      `mread_${r.id}_prev_crop`,
      r.prevCropDataUrl,
      maxInlineChars
    );
    const nextCurrPhoto = offloadImageValue(
      `mread_${r.id}_curr_photo`,
      r.currPhotoDataUrl,
      maxInlineChars
    );
    const nextCurrCrop = offloadImageValue(
      `mread_${r.id}_curr_crop`,
      r.currCropDataUrl,
      maxInlineChars
    );
    if (
      nextPrevPhoto !== r.prevPhotoDataUrl ||
      nextPrevCrop !== r.prevCropDataUrl ||
      nextCurrPhoto !== r.currPhotoDataUrl ||
      nextCurrCrop !== r.currCropDataUrl
    ) {
      changed = true;
      return {
        ...r,
        prevPhotoDataUrl: nextPrevPhoto,
        prevCropDataUrl: nextPrevCrop,
        currPhotoDataUrl: nextCurrPhoto,
        currCropDataUrl: nextCurrCrop,
      };
    }
    return r;
  });
  return { compacted, changed };
}

function isQuotaError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const maybe = err as { name?: string; code?: number; message?: string };
  return (
    maybe.name === 'QuotaExceededError' ||
    maybe.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    maybe.code === 22 ||
    maybe.code === 1014 ||
    /quota/i.test(String(maybe.message || ''))
  );
}

function reclaimLocalStorageSpace(): void {
  try {
    // 1. Drop redundant legacy v1/v2 keys ONLY when modern 4rent_db_* keys already exist
    const legacyPairs: Array<[string, string]> = [
      [STORAGE_KEYS.ROOMS, '4rent_rooms_v2'],
      [STORAGE_KEYS.ROOMS, '4rent_rooms_v1'],
      [STORAGE_KEYS.BILLS, '4rent_bills_v2'],
      [STORAGE_KEYS.BILLS, '4rent_bills_v1'],
      [STORAGE_KEYS.INQUIRIES, '4rent_inquiries_v2'],
      [STORAGE_KEYS.HISTORY, '4rent_tenant_history_v2'],
      [STORAGE_KEYS.HISTORY, '4rent_tenant_history_v1'],
      [STORAGE_KEYS.SETTINGS, '4rent_settings_v2'],
      [STORAGE_KEYS.SETTINGS, '4rent_settings_v1'],
      [STORAGE_KEYS.METER_LOGS, '4rent_meter_logs_v1'],
    ];
    for (const [modernKey, legacyKey] of legacyPairs) {
      if (localStorage.getItem(modernKey) && localStorage.getItem(legacyKey)) {
        localStorage.removeItem(legacyKey);
      }
    }

    // 2. Aggressively offload ANY inline base64 images inside rooms, bills, and logs
    const rawRooms = localStorage.getItem(STORAGE_KEYS.ROOMS);
    if (rawRooms) {
      const parsedRooms = JSON.parse(rawRooms);
      if (Array.isArray(parsedRooms)) {
        const { compacted, changed } = compactRoomsMedia(parsedRooms, 0);
        if (changed) {
          localStorage.setItem(STORAGE_KEYS.ROOMS, JSON.stringify(compacted));
        }
      }
    }

    const rawBills = localStorage.getItem(STORAGE_KEYS.BILLS);
    if (rawBills) {
      const parsedBills = JSON.parse(rawBills);
      if (Array.isArray(parsedBills)) {
        const { compacted, changed } = compactBillsMedia(parsedBills, 0);
        if (changed) {
          localStorage.setItem(STORAGE_KEYS.BILLS, JSON.stringify(compacted));
        }
      }
    }

    const rawLogs = localStorage.getItem(STORAGE_KEYS.METER_LOGS);
    if (rawLogs) {
      const parsedLogs = JSON.parse(rawLogs);
      if (Array.isArray(parsedLogs)) {
        const { compacted, changed } = compactLogsMedia(parsedLogs.slice(0, 40), 0);
        if (changed || parsedLogs.length > 40) {
          localStorage.setItem(STORAGE_KEYS.METER_LOGS, JSON.stringify(compacted));
        }
      }
    }

    const rawMonthlyReadings = localStorage.getItem(STORAGE_KEYS.MONTHLY_READINGS);
    if (rawMonthlyReadings) {
      const parsedReadings = JSON.parse(rawMonthlyReadings);
      if (Array.isArray(parsedReadings)) {
        const { compacted, changed } = compactMonthlyReadingsMedia(parsedReadings, 0);
        if (changed) {
          localStorage.setItem(
            STORAGE_KEYS.MONTHLY_READINGS,
            JSON.stringify(compacted)
          );
        }
      }
    }

    // 3. Trim audit log history
    const rawAudit = localStorage.getItem(STORAGE_KEYS.AUDIT_LOG);
    if (rawAudit) {
      const parsedAudit = JSON.parse(rawAudit);
      if (Array.isArray(parsedAudit) && parsedAudit.length > 15) {
        localStorage.setItem(
          STORAGE_KEYS.AUDIT_LOG,
          JSON.stringify(parsedAudit.slice(0, 15))
        );
      }
    }
  } catch {
    // Ignore errors during emergency cleanup
  }
}

function safeLocalStorageSetItem(key: string, serialized: string): boolean {
  try {
    if (typeof localStorage === 'undefined') return false;
    localStorage.setItem(key, serialized);
    return true;
  } catch (err) {
    if (isQuotaError(err)) {
      reclaimLocalStorageSpace();
      try {
        localStorage.setItem(key, serialized);
        return true;
      } catch (retryErr) {
        console.warn(
          `[4Rent Storage] localStorage quota pressure on "${key}"; preserved in IndexedDB backup.`,
          retryErr
        );
        return false;
      }
    }
    console.warn(`[4Rent Storage] Failed writing "${key}":`, err);
    return false;
  }
}

export function loadSettings(): AppSettings {
  const defaults = createDefaultSettings();
  try {
    const raw =
      localStorage.getItem(STORAGE_KEYS.SETTINGS) ||
      localStorage.getItem('4rent_settings_v2') ||
      localStorage.getItem('4rent_settings_v1');
    if (!raw) return defaults;
    const parsed = JSON.parse(raw);
    const normalizedName =
      !parsed.apartmentName || parsed.apartmentName === '4Rent'
        ? '4Rent Management System'
        : parsed.apartmentName;
    const rawAuthMethod = parsed.security?.authMethod;
    const hasValidAuth =
      Boolean(parsed.security?.isSetupComplete) &&
      rawAuthMethod !== 'none';

    const rawCode = normalizePropertyCode(parsed.cloudSync?.propertyCode || '');
    const isUntouchedLegacyDefault =
      rawCode === '4RENT-MAIN' &&
      !parsed.cloudSync?.lastSyncedAt &&
      !parsed.cloudSync?.mobileCodeAppliedAt &&
      !DEV_PROPERTY_CODE;
    const resolvedPropertyCode =
      !rawCode || isUntouchedLegacyDefault
        ? defaults.cloudSync.propertyCode
        : rawCode;

    const rawPenalty = parsed.latePenalty;
    const isUntouchedLegacyPenalty =
      rawPenalty &&
      typeof rawPenalty === 'object' &&
      rawPenalty.enabled === false &&
      rawPenalty.mode === 'fixed' &&
      (rawPenalty.value === null || rawPenalty.value === undefined) &&
      !rawPenalty.applyPerDay;
    const normalizedLatePenalty =
      rawPenalty && typeof rawPenalty === 'object' && !isUntouchedLegacyPenalty
        ? {
            enabled: Boolean(rawPenalty.enabled),
            mode:
              rawPenalty.mode === 'percentage'
                ? ('percentage' as const)
                : rawPenalty.mode === 'fixed'
                ? ('fixed' as const)
                : ('daily_rent' as const),
            value:
              typeof rawPenalty.value === 'number' &&
              Number.isFinite(rawPenalty.value) &&
              rawPenalty.value >= 0
                ? rawPenalty.value
                : null,
            applyPerDay:
              rawPenalty.applyPerDay === undefined
                ? true
                : Boolean(rawPenalty.applyPerDay),
          }
        : defaults.latePenalty;

    return {
      ...defaults,
      ...parsed,
      apartmentName: normalizedName,
      monthlyElectricRates:
        parsed.monthlyElectricRates &&
        typeof parsed.monthlyElectricRates === 'object'
          ? parsed.monthlyElectricRates
          : {},
      latePenalty: normalizedLatePenalty,
      security: {
        ...defaults.security,
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
        ...defaults.cloudSync,
        ...(parsed.cloudSync || {}),
        provider: parsed.cloudSync?.provider || 'firebase',
        firebaseProjectId:
          parsed.cloudSync?.firebaseProjectId || DEV_FIREBASE_PROJECT_ID,
        firebaseApiKey:
          parsed.cloudSync?.firebaseApiKey || DEV_FIREBASE_API_KEY,
        firebaseDatabaseUrl:
          parsed.cloudSync?.firebaseDatabaseUrl || DEV_FIREBASE_DATABASE_URL,
        propertyCode: resolvedPropertyCode,
      },
    };
  } catch {
    return defaults;
  }
}

export function saveSettings(settings: AppSettings): void {
  const nextRaw = JSON.stringify(settings);
  if (localStorage.getItem(STORAGE_KEYS.SETTINGS) !== nextRaw) {
    safeLocalStorageSetItem(STORAGE_KEYS.SETTINGS, nextRaw);
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
    const { compacted, changed } = compactRoomsMedia(rooms);
    if (changed) {
      safeLocalStorageSetItem(STORAGE_KEYS.ROOMS, JSON.stringify(compacted));
    }

    // Strictly enforce rules:
    // 1. Vacant rooms NEVER hold advance balance or unpaid dues.
    // 2. Deposit is required and defaults to monthly rent if 0.
    return compacted.map((r) => {
      const isVacant = r.status === 'vacant';
      const safeDeposit =
        r.securityDeposit > 0 ? r.securityDeposit : r.monthlyRent || 4500;
      const sanitized: Room = {
        ...r,
        securityDeposit: safeDeposit,
        advanceRent: isVacant ? 0 : Math.max(0, r.advanceRent || 0),
        unpaidBalance: isVacant ? 0 : Math.max(0, r.unpaidBalance || 0),
        activeReceiptId: isVacant ? undefined : r.activeReceiptId,
      };
      return isVacant ? sanitized : reconcileRoomAdvanceLedger(sanitized);
    });
  } catch {
    return [];
  }
}

export function saveRooms(rooms: Room[]): void {
  const sanitized = rooms.map((r) => {
    const isVacant = r.status === 'vacant';
    const nextRoom: Room = {
      ...r,
      advanceRent: isVacant ? 0 : Math.max(0, r.advanceRent || 0),
      unpaidBalance: isVacant ? 0 : Math.max(0, r.unpaidBalance || 0),
      activeReceiptId: isVacant ? undefined : r.activeReceiptId,
    };
    return isVacant ? nextRoom : reconcileRoomAdvanceLedger(nextRoom);
  });
  const { compacted } = compactRoomsMedia(sanitized);
  const nextRaw = JSON.stringify(compacted);
  if (localStorage.getItem(STORAGE_KEYS.ROOMS) !== nextRaw) {
    safeLocalStorageSetItem(STORAGE_KEYS.ROOMS, nextRaw);
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
    const bills: BillRecord[] = raw ? JSON.parse(raw) : [];
    const { compacted, changed } = compactBillsMedia(bills);
    if (changed) {
      safeLocalStorageSetItem(STORAGE_KEYS.BILLS, JSON.stringify(compacted));
    }
    return compacted;
  } catch {
    return [];
  }
}

export function saveBills(bills: BillRecord[]): void {
  const { compacted } = compactBillsMedia(bills);
  const nextRaw = JSON.stringify(compacted);
  if (localStorage.getItem(STORAGE_KEYS.BILLS) !== nextRaw) {
    safeLocalStorageSetItem(STORAGE_KEYS.BILLS, nextRaw);
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
    safeLocalStorageSetItem(STORAGE_KEYS.INQUIRIES, nextRaw);
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
    safeLocalStorageSetItem(STORAGE_KEYS.HISTORY, nextRaw);
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
  safeLocalStorageSetItem(STORAGE_KEYS.AUDIT_LOG, JSON.stringify(next));
  return next;
}

export function loadReadingLogs(roomId?: string): SubMeterReadingLog[] {
  try {
    const raw =
      localStorage.getItem(STORAGE_KEYS.METER_LOGS) ||
      localStorage.getItem('4rent_meter_logs_v1');
    const rawLogs: SubMeterReadingLog[] = raw ? JSON.parse(raw) : [];
    const { compacted: logs, changed } = compactLogsMedia(rawLogs);
    if (changed) {
      safeLocalStorageSetItem(STORAGE_KEYS.METER_LOGS, JSON.stringify(logs));
    }
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
  const { compacted } = compactLogsMedia(logs);
  const nextRaw = JSON.stringify(compacted);
  if (localStorage.getItem(STORAGE_KEYS.METER_LOGS) !== nextRaw) {
    safeLocalStorageSetItem(STORAGE_KEYS.METER_LOGS, nextRaw);
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

// ---------------------------------------------------------------------------
// Monthly Sub-Meter Readings (Unique per roomId + billingMonthKey)
// ---------------------------------------------------------------------------

function normalizeMonthlyReadingRecord(
  r: MonthlyMeterReading
): MonthlyMeterReading {
  const monthKey = normalizeBillingMonthKey(r.billingMonthKey || r.billingPeriod);
  const consumptionKwh = roundKwh(
    Math.max(
      0,
      Number.isFinite(r.consumptionKwh)
        ? r.consumptionKwh
        : r.currentReadingKwh - r.previousReadingKwh
    )
  );
  const electricRate = Number.isFinite(r.electricRate)
    ? Math.max(0, r.electricRate)
    : 0;
  const electricCharge = roundCurrencyCentavos(
    Number.isFinite(r.electricCharge)
      ? r.electricCharge
      : consumptionKwh * electricRate
  );

  return {
    ...r,
    billingMonthKey: monthKey,
    consumptionKwh,
    electricRate,
    electricCharge,
  };
}

function deduplicateMonthlyReadings(
  readings: MonthlyMeterReading[]
): MonthlyMeterReading[] {
  const byRoomMonth = new Map<string, MonthlyMeterReading>();
  for (const raw of readings) {
    if (!raw || !raw.roomId) continue;
    const normalized = normalizeMonthlyReadingRecord(raw);
    const key = `${normalized.roomId}::${normalized.billingMonthKey}`;
    const existing = byRoomMonth.get(key);
    if (!existing) {
      byRoomMonth.set(key, normalized);
      continue;
    }
    const existingTs = new Date(
      existing.updatedAt || existing.verifiedAt || existing.createdAt || 0
    ).getTime();
    const candidateTs = new Date(
      normalized.updatedAt || normalized.verifiedAt || normalized.createdAt || 0
    ).getTime();
    if (candidateTs >= existingTs) {
      byRoomMonth.set(key, normalized);
    }
  }
  return Array.from(byRoomMonth.values()).sort((a, b) =>
    b.billingMonthKey.localeCompare(a.billingMonthKey)
  );
}

export function loadMonthlyReadings(roomId?: string): MonthlyMeterReading[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.MONTHLY_READINGS);
    const parsed: MonthlyMeterReading[] = raw ? JSON.parse(raw) : [];
    const deduped = deduplicateMonthlyReadings(Array.isArray(parsed) ? parsed : []);
    const { compacted, changed } = compactMonthlyReadingsMedia(deduped);
    if (changed) {
      safeLocalStorageSetItem(
        STORAGE_KEYS.MONTHLY_READINGS,
        JSON.stringify(compacted)
      );
    }
    if (!roomId) return compacted;
    return compacted.filter((r) => r.roomId === roomId);
  } catch {
    return [];
  }
}

export function saveMonthlyReadings(readings: MonthlyMeterReading[]): void {
  const deduped = deduplicateMonthlyReadings(readings);
  const { compacted } = compactMonthlyReadingsMedia(deduped);
  const nextRaw = JSON.stringify(compacted);
  if (localStorage.getItem(STORAGE_KEYS.MONTHLY_READINGS) !== nextRaw) {
    safeLocalStorageSetItem(STORAGE_KEYS.MONTHLY_READINGS, nextRaw);
    void syncMonthlyReadingsToIndexedDb(compacted);
    persistMasterIndexedDb();
    broadcastLocalChange(STORAGE_KEYS.MONTHLY_READINGS);
  }
}

export function getMonthlyMeterReading(
  roomId: string,
  monthKeyOrPeriod: string
): MonthlyMeterReading | undefined {
  const targetKey = normalizeBillingMonthKey(monthKeyOrPeriod);
  return loadMonthlyReadings(roomId).find(
    (r) => normalizeBillingMonthKey(r.billingMonthKey || r.billingPeriod) === targetKey
  );
}

export function upsertMonthlyMeterReading(
  reading: MonthlyMeterReading,
  options?: { allowReplaceExisting?: boolean }
): { ok: true; readings: MonthlyMeterReading[]; saved: MonthlyMeterReading } | { ok: false; error: string } {
  const normalized = normalizeMonthlyReadingRecord(reading);
  const existing = loadMonthlyReadings();
  const conflict = existing.find(
    (r) =>
      r.roomId === normalized.roomId &&
      normalizeBillingMonthKey(r.billingMonthKey || r.billingPeriod) ===
        normalized.billingMonthKey &&
      r.id !== normalized.id
  );

  if (conflict && !options?.allowReplaceExisting) {
    if (conflict.billId && normalized.billId && conflict.billId !== normalized.billId) {
      return {
        ok: false,
        error: `A finalized meter reading already exists for ${normalized.billingPeriod} (Receipt ${conflict.billId}).`,
      };
    }
    if (
      conflict.billId &&
      !normalized.billId &&
      Math.abs(conflict.currentReadingKwh - normalized.currentReadingKwh) > 0.001
    ) {
      return {
        ok: false,
        error: `Conflicting monthly meter reading detected for ${normalized.billingPeriod}. Existing billed reading is ${conflict.currentReadingKwh} kWh.`,
      };
    }
  }

  const saved: MonthlyMeterReading = conflict
    ? {
        ...conflict,
        ...normalized,
        id: conflict.id,
        createdAt: conflict.createdAt || normalized.createdAt,
        updatedAt: new Date().toISOString(),
      }
    : {
        ...normalized,
        updatedAt: normalized.updatedAt || new Date().toISOString(),
      };

  const next = deduplicateMonthlyReadings([
    saved,
    ...existing.filter(
      (r) =>
        !(
          r.roomId === saved.roomId &&
          normalizeBillingMonthKey(r.billingMonthKey || r.billingPeriod) ===
            saved.billingMonthKey
        ) && r.id !== saved.id
    ),
  ]);

  saveMonthlyReadings(next);
  return { ok: true, readings: next, saved };
}

/**
 * Atomic billing persistence transaction:
 * Writes related collections (rooms, bills, monthlyReadings, meterLogs) together.
 * If ANY localStorage write fails, rolls back every touched key to its exact prior value.
 */
export interface BillingTransactionPayload {
  rooms?: Room[];
  bills?: BillRecord[];
  monthlyReadings?: MonthlyMeterReading[];
  meterLogs?: SubMeterReadingLog[];
}

export function commitBillingTransaction(
  payload: BillingTransactionPayload
): { ok: true } | { ok: false; error: string } {
  if (typeof localStorage === 'undefined') {
    return { ok: true };
  }

  const writes: Array<{ key: string; nextRaw: string }> = [];

  if (payload.rooms) {
    const sanitized = payload.rooms.map((r) => {
      const isVacant = r.status === 'vacant';
      const nextRoom: Room = {
        ...r,
        advanceRent: isVacant ? 0 : Math.max(0, r.advanceRent || 0),
        unpaidBalance: isVacant ? 0 : Math.max(0, r.unpaidBalance || 0),
        activeReceiptId: isVacant ? undefined : r.activeReceiptId,
      };
      return isVacant ? nextRoom : reconcileRoomAdvanceLedger(nextRoom);
    });
    const { compacted } = compactRoomsMedia(sanitized);
    writes.push({ key: STORAGE_KEYS.ROOMS, nextRaw: JSON.stringify(compacted) });
  }

  if (payload.bills) {
    const { compacted } = compactBillsMedia(payload.bills);
    writes.push({ key: STORAGE_KEYS.BILLS, nextRaw: JSON.stringify(compacted) });
  }

  let compactedReadings: MonthlyMeterReading[] | null = null;
  if (payload.monthlyReadings) {
    const deduped = deduplicateMonthlyReadings(payload.monthlyReadings);
    const { compacted } = compactMonthlyReadingsMedia(deduped);
    compactedReadings = compacted;
    writes.push({
      key: STORAGE_KEYS.MONTHLY_READINGS,
      nextRaw: JSON.stringify(compacted),
    });
  }

  if (payload.meterLogs) {
    const { compacted } = compactLogsMedia(payload.meterLogs);
    writes.push({
      key: STORAGE_KEYS.METER_LOGS,
      nextRaw: JSON.stringify(compacted),
    });
  }

  // Snapshot prior values for atomic rollback
  const priorValues = new Map<string, string | null>();
  for (const w of writes) {
    priorValues.set(w.key, localStorage.getItem(w.key));
  }

  const changedKeys: string[] = [];
  try {
    for (const w of writes) {
      if (priorValues.get(w.key) !== w.nextRaw) {
        const wrote = safeLocalStorageSetItem(w.key, w.nextRaw);
        if (!wrote) {
          throw new Error(`Storage write failed for ${w.key}`);
        }
        changedKeys.push(w.key);
      }
    }
  } catch (err) {
    // Roll back every key touched in this transaction
    for (const [key, prev] of priorValues.entries()) {
      try {
        if (prev === null) {
          localStorage.removeItem(key);
        } else {
          localStorage.setItem(key, prev);
        }
      } catch {
        // best-effort rollback
      }
    }
    return {
      ok: false,
      error:
        err instanceof Error
          ? err.message
          : 'Failed to commit billing transaction atomically.',
    };
  }

  if (compactedReadings) {
    void syncMonthlyReadingsToIndexedDb(compactedReadings);
  }
  if (changedKeys.length > 0) {
    persistMasterIndexedDb();
    for (const k of changedKeys) {
      broadcastLocalChange(k);
    }
  }

  return { ok: true };
}

/**
 * Non-destructive, idempotent database migration (Schema v1 -> v2).
 * - Preserves all existing rooms, tenants, payments, bills, rates, and logs.
 * - Backfills historical MonthlyMeterReading records from existing bills when not already recorded.
 * - Normalizes missing billingMonthKey on existing bills without mutating amounts or rates.
 */
export function migrateDatabaseIfNeeded(): {
  migrated: boolean;
  fromVersion: number;
  toVersion: number;
  backfilledReadingsCount: number;
} {
  try {
    if (typeof localStorage === 'undefined') {
      return {
        migrated: false,
        fromVersion: CURRENT_SCHEMA_VERSION,
        toVersion: CURRENT_SCHEMA_VERSION,
        backfilledReadingsCount: 0,
      };
    }

    const storedVersion = Number(
      localStorage.getItem(STORAGE_KEYS.SCHEMA_VERSION) || '1'
    );
    const existingBills = loadBills();
    const existingReadings = loadMonthlyReadings();

    if (
      Number.isFinite(storedVersion) &&
      storedVersion >= CURRENT_SCHEMA_VERSION &&
      (existingBills.length === 0 || existingReadings.length > 0)
    ) {
      return {
        migrated: false,
        fromVersion: storedVersion,
        toVersion: CURRENT_SCHEMA_VERSION,
        backfilledReadingsCount: 0,
      };
    }

    const existingKeys = new Set(
      existingReadings.map(
        (r) =>
          `${r.roomId}::${normalizeBillingMonthKey(r.billingMonthKey || r.billingPeriod)}`
      )
    );
    const backfilled: MonthlyMeterReading[] = [...existingReadings];
    let backfilledCount = 0;

    let billsChanged = false;
    const migratedBills = existingBills.map((bill) => {
      const monthKey = normalizeBillingMonthKey(
        bill.billingMonthKey || bill.billingPeriod || bill.createdAt
      );
      const roomMonthKey = `${bill.roomId}::${monthKey}`;

      if (!bill.isArchived && !existingKeys.has(roomMonthKey)) {
        const readingId = bill.meterReadingId || `mread-hist-${bill.id}`;
        const prevKwh = Number.isFinite(bill.prevReading) ? bill.prevReading : 0;
        const currKwh = Number.isFinite(bill.currReading) ? bill.currReading : prevKwh;
        const kwhUsed = Number.isFinite(bill.consumptionKwh)
          ? bill.consumptionKwh
          : roundKwh(Math.max(0, currKwh - prevKwh));
        const rate = Number.isFinite(bill.electricRate) ? bill.electricRate : 0;
        const charge = Number.isFinite(bill.electricTotal)
          ? bill.electricTotal
          : roundCurrencyCentavos(kwhUsed * rate);

        backfilled.push({
          id: readingId,
          roomId: bill.roomId,
          roomName: bill.roomName,
          tenantName: bill.tenantName,
          billingMonthKey: monthKey,
          billingPeriod: bill.billingPeriod,
          previousReadingKwh: prevKwh,
          currentReadingKwh: currKwh,
          consumptionKwh: kwhUsed,
          electricRate: rate,
          electricCharge: charge,
          ocrExtractedReadingKwh:
            bill.ocrConfidence !== undefined ? currKwh : null,
          ocrConfidence: bill.ocrConfidence,
          source:
            bill.ocrConfidence !== undefined
              ? 'ocr_verified'
              : 'manual_authorized',
          isVerified: true,
          verifiedAt: bill.createdAt,
          prevPhotoDataUrl: bill.prevMeterPhotoDataUrl,
          prevCropDataUrl: bill.prevMeterCropDataUrl,
          currPhotoDataUrl: bill.meterPhotoDataUrl,
          currCropDataUrl: bill.currMeterCropDataUrl,
          billId: bill.id,
          createdAt: bill.createdAt,
          updatedAt: bill.updatedAt || bill.createdAt,
        });
        existingKeys.add(roomMonthKey);
        backfilledCount += 1;
      }

      if (!bill.billingMonthKey) {
        billsChanged = true;
        return {
          ...bill,
          billingMonthKey: monthKey,
        };
      }
      return bill;
    });

    if (backfilledCount > 0) {
      saveMonthlyReadings(backfilled);
    }
    if (billsChanged) {
      saveBills(migratedBills);
    }
    safeLocalStorageSetItem(
      STORAGE_KEYS.SCHEMA_VERSION,
      String(CURRENT_SCHEMA_VERSION)
    );

    return {
      migrated: true,
      fromVersion: Number.isFinite(storedVersion) ? storedVersion : 1,
      toVersion: CURRENT_SCHEMA_VERSION,
      backfilledReadingsCount: backfilledCount,
    };
  } catch (err) {
    console.warn('[4Rent Migration] Non-fatal migration warning:', err);
    return {
      migrated: false,
      fromVersion: 1,
      toVersion: CURRENT_SCHEMA_VERSION,
      backfilledReadingsCount: 0,
    };
  }
}

export function exportDatabaseSnapshot(): AppDatabaseSnapshot {
  return {
    version: '1.0.1',
    schemaVersion: CURRENT_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    rooms: loadRooms(),
    bills: loadBills(),
    inquiries: loadInquiries(),
    tenantHistory: loadTenantHistory(),
    settings: loadSettings(),
    meterLogs: loadReadingLogs(),
    monthlyReadings: loadMonthlyReadings(),
  };
}

let _idbPersistTimer: ReturnType<typeof setTimeout> | null = null;
let _idbWriteChain: Promise<void> = Promise.resolve();

function persistMasterIndexedDb(): void {
  if (!_isAppHydrated) return;
  if (_idbPersistTimer) {
    clearTimeout(_idbPersistTimer);
  }
  _idbPersistTimer = setTimeout(() => {
    _idbPersistTimer = null;
    _idbWriteChain = _idbWriteChain
      .then(async () => {
        const snap = exportDatabaseSnapshot();
        const isCandidateEmpty =
          (!snap.rooms || snap.rooms.length === 0) &&
          (!snap.bills || snap.bills.length === 0) &&
          (!snap.tenantHistory || snap.tenantHistory.length === 0);

        if (isCandidateEmpty) {
          try {
            const existing = await loadSnapshotFromIndexedDb();
            const existingCode = normalizePropertyCode(
              existing?.settings?.cloudSync?.propertyCode || ''
            );
            const candidateCode = normalizePropertyCode(
              snap.settings?.cloudSync?.propertyCode || ''
            );
            const isSamePropertySpace =
              !existingCode || !candidateCode || existingCode === candidateCode;
            if (
              isSamePropertySpace &&
              ((existing?.rooms && existing.rooms.length > 0) ||
                (existing?.bills && existing.bills.length > 0) ||
                (existing?.tenantHistory && existing.tenantHistory.length > 0))
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

        await saveSnapshotToIndexedDb(snap);
        if (Array.isArray(snap.monthlyReadings)) {
          await syncMonthlyReadingsToIndexedDb(snap.monthlyReadings);
        }
      })
      .catch(() => {
        // Ignore chained IDB write errors
      });
  }, 120);
}

export function importDatabaseSnapshot(
  snapshot: AppDatabaseSnapshot,
  options?: { preserveLocalSecurity?: boolean }
): void {
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
    if (options?.preserveLocalSecurity) {
      const localSettings = loadSettings();
      saveSettings({
        ...snapshot.settings,
        security: localSettings.security,
        cloudSync: localSettings.cloudSync,
      });
    } else {
      saveSettings(snapshot.settings);
    }
  }
  if (Array.isArray(snapshot.meterLogs)) {
    saveReadingLogs(snapshot.meterLogs);
  }
  if (Array.isArray(snapshot.monthlyReadings)) {
    saveMonthlyReadings(snapshot.monthlyReadings);
  } else if (Array.isArray(snapshot.bills) && snapshot.bills.length > 0) {
    // Non-destructively backfill monthly readings if importing a v1 backup
    migrateDatabaseIfNeeded();
  }
}

const MOBILE_LOCK_STORAGE_KEY = '4rent_mobile_code_applied_month';
const PENDING_CLOUD_APPLY_KEY = '4rent_pending_cloud_apply';

export function getStoredMobileAppliedMonth(): string {
  try {
    return localStorage.getItem(MOBILE_LOCK_STORAGE_KEY) || '';
  } catch {
    return '';
  }
}

export function setStoredMobileAppliedMonth(monthKey: string): void {
  try {
    localStorage.setItem(MOBILE_LOCK_STORAGE_KEY, monthKey);
  } catch {
    // ignore storage errors
  }
}

const PENDING_CLOUD_APPLY_TTL_MS = 15 * 60 * 1000;

export function setPendingCloudApply(
  propertyCode: string,
  appliedMonth: string
): void {
  try {
    localStorage.setItem(
      PENDING_CLOUD_APPLY_KEY,
      JSON.stringify({ propertyCode, appliedMonth, createdAt: Date.now() })
    );
  } catch {
    // ignore storage errors
  }
}

export function peekPendingCloudApply(): {
  propertyCode: string;
  appliedMonth: string;
} | null {
  try {
    const raw = localStorage.getItem(PENDING_CLOUD_APPLY_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const createdAt = Number(parsed?.createdAt);
    if (
      Number.isFinite(createdAt) &&
      Date.now() - createdAt > PENDING_CLOUD_APPLY_TTL_MS
    ) {
      clearPendingCloudApply();
      return null;
    }
    if (parsed?.propertyCode) {
      return {
        propertyCode: String(parsed.propertyCode),
        appliedMonth: String(parsed.appliedMonth || ''),
      };
    }
    return null;
  } catch {
    return null;
  }
}

export function clearPendingCloudApply(): void {
  try {
    localStorage.removeItem(PENDING_CLOUD_APPLY_KEY);
  } catch {
    // ignore storage errors
  }
}

function clearLegacyAndPendingStorageKeys(): void {
  try {
    if (typeof localStorage === 'undefined') return;
    const legacyKeys = [
      '4rent_rooms_v2',
      '4rent_rooms_v1',
      '4rent_bills_v2',
      '4rent_bills_v1',
      '4rent_inquiries_v2',
      '4rent_tenant_history_v2',
      '4rent_tenant_history_v1',
      '4rent_meter_logs_v1',
      '4rent_pending_offline_sync',
    ];
    for (const key of legacyKeys) {
      localStorage.removeItem(key);
    }
  } catch {
    // ignore storage cleanup errors
  }
}

export async function flushMasterIndexedDbNow(): Promise<void> {
  if (_idbPersistTimer) {
    clearTimeout(_idbPersistTimer);
    _idbPersistTimer = null;
  }
  if (_pendingImageOffloads.size > 0) {
    await Promise.allSettled(Array.from(_pendingImageOffloads));
  }
  const writeTask = _idbWriteChain.then(async () => {
    const snap = exportDatabaseSnapshot();
    await saveSnapshotToIndexedDb(snap);
    if (Array.isArray(snap.monthlyReadings)) {
      await syncMonthlyReadingsToIndexedDb(snap.monthlyReadings);
    }
  });
  _idbWriteChain = writeTask.catch(() => {});
  await writeTask;
}

/**
 * Replaces local workspace collections cleanly with a cloud snapshot while preserving
 * local security PIN/biometric credentials and the active cloudSync lock metadata.
 */
export async function applyCloudSnapshotCleanly(
  snapshot: AppDatabaseSnapshot,
  cloudSyncOverride: AppSettings['cloudSync']
): Promise<void> {
  clearLegacyAndPendingStorageKeys();
  const cleanRooms = Array.isArray(snapshot.rooms) ? snapshot.rooms : [];
  const cleanHistory = Array.isArray(snapshot.tenantHistory)
    ? snapshot.tenantHistory
    : [];
  const rawBills = Array.isArray(snapshot.bills) ? snapshot.bills : [];
  const validRoomIds = new Set<string>();
  for (const r of cleanRooms) {
    if (r?.id) validRoomIds.add(r.id);
  }
  for (const h of cleanHistory) {
    if (h?.roomId) validRoomIds.add(h.roomId);
  }
  const cleanBills =
    cleanRooms.length > 0
      ? rawBills.filter((b) => b && b.roomId && validRoomIds.has(b.roomId))
      : rawBills;

  saveRooms(cleanRooms);
  saveBills(cleanBills);
  saveInquiries(Array.isArray(snapshot.inquiries) ? snapshot.inquiries : []);
  saveTenantHistory(cleanHistory);
  saveReadingLogs(Array.isArray(snapshot.meterLogs) ? snapshot.meterLogs : []);
  if (Array.isArray(snapshot.monthlyReadings)) {
    saveMonthlyReadings(snapshot.monthlyReadings);
  } else {
    saveMonthlyReadings([]);
    migrateDatabaseIfNeeded();
  }

  const localSettings = loadSettings();
  const baseSettings = snapshot.settings || localSettings;
  saveSettings({
    ...baseSettings,
    security: localSettings.security,
    cloudSync: cloudSyncOverride,
  });

  if (cloudSyncOverride.mobileCodeAppliedMonth) {
    setStoredMobileAppliedMonth(cloudSyncOverride.mobileCodeAppliedMonth);
  }
  await flushMasterIndexedDbNow();
  clearPendingCloudApply();
}

/**
 * Updates only the active cloudSync metadata block on the currently stored settings.
 */
export function updateStoredCloudSync(
  cloudSync: AppSettings['cloudSync']
): void {
  const current = loadSettings();
  saveSettings({
    ...current,
    cloudSync: {
      ...cloudSync,
      propertyCode: normalizePropertyCode(cloudSync.propertyCode),
    },
  });
}

/**
 * Resets all workspace collections and property settings cleanly for a brand-new
 * Property Space Code while preserving local device security (PIN/biometrics)
 * and overwriting IndexedDB so previous space data never resurrects on reload.
 */
export async function resetWorkspaceForPropertyCode(
  cloudSyncOverride: AppSettings['cloudSync']
): Promise<void> {
  clearPendingCloudApply();
  clearLegacyAndPendingStorageKeys();
  saveRooms([]);
  saveBills([]);
  saveInquiries([]);
  saveTenantHistory([]);
  saveReadingLogs([]);
  saveMonthlyReadings([]);

  const localSettings = loadSettings();
  const cleanDefaults = createDefaultSettings();
  const normalizedCode = normalizePropertyCode(cloudSyncOverride.propertyCode);
  const nextCloudSync: AppSettings['cloudSync'] = {
    ...cloudSyncOverride,
    propertyCode: normalizedCode || cleanDefaults.cloudSync.propertyCode,
  };

  saveSettings({
    ...cleanDefaults,
    security: localSettings.security,
    remindersPromptShown: localSettings.remindersPromptShown,
    cloudSync: nextCloudSync,
  });

  if (nextCloudSync.mobileCodeAppliedMonth) {
    setStoredMobileAppliedMonth(nextCloudSync.mobileCodeAppliedMonth);
  }
  await flushMasterIndexedDbNow();
  clearPendingCloudApply();
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
