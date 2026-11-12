import { AppDatabaseSnapshot, CloudSyncConfig } from '../types/rental';
import {
  formatMonthKeyLabel,
  getAdjacentMonthKey,
  normalizeMonthKey,
} from '../utils/billingCalculator';
import { getStoredMobileAppliedMonth } from './storageService';

export function normalizePropertyCode(raw: string): string {
  return (raw || '').trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');
}

export function generatePropertyCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = new Uint8Array(6);
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  let suffix = '';
  for (const b of bytes) {
    suffix += alphabet[b % alphabet.length];
  }
  return `4R-${suffix}`;
}

export interface MobileCodeMonthlyLockState {
  isLockedThisMonth: boolean;
  appliedMonthKey: string;
  currentMonthKey: string;
  nextEligibleMonthLabel: string;
}

export function getMobileCodeMonthlyLock(
  cloudSync?: Pick<CloudSyncConfig, 'mobileCodeAppliedMonth'>
): MobileCodeMonthlyLockState {
  const currentMonthKey = normalizeMonthKey();
  const appliedMonthKey =
    cloudSync?.mobileCodeAppliedMonth || getStoredMobileAppliedMonth() || '';
  const isLockedThisMonth = Boolean(
    appliedMonthKey && appliedMonthKey === currentMonthKey
  );
  const nextMonthKey = getAdjacentMonthKey(currentMonthKey, 1);
  return {
    isLockedThisMonth,
    appliedMonthKey,
    currentMonthKey,
    nextEligibleMonthLabel: formatMonthKeyLabel(nextMonthKey, 'long'),
  };
}

/**
 * 4Rent Firebase Configuration for Web & Mobile.
 * API keys are intentionally omitted from source control; supply optional
 * credentials via Vite environment variables (.env.local) or Cloud Sync Settings.
 */
const firebaseViteEnv =
  (import.meta as unknown as { env?: Record<string, string> }).env || {};

export const DEFAULT_FIREBASE_CONFIG = {
  apiKey: firebaseViteEnv.VITE_FIREBASE_API_KEY || '',
  authDomain: 'rent-41279.firebaseapp.com',
  projectId: firebaseViteEnv.VITE_FIREBASE_PROJECT_ID || 'rent-41279',
  storageBucket: 'rent-41279.firebasestorage.app',
  messagingSenderId: '1065579410434',
  appId: '1:1065579410434:web:5ed8b25e9ade2fc30de31b',
  measurementId: 'G-JBPNCJ9C4R',
};

export const DEFAULT_FIREBASE_DATABASE_URL =
  'https://rent-41279-default-rtdb.asia-southeast1.firebasedatabase.app';

export const FIREBASE_RULES_JSON = `{
  "rules": {
    "properties": {
      "$propertyCode": {
        ".read": "auth != null",
        ".write": "auth != null"
      }
    },
    "system_registry": {
      "$propertyCode": {
        ".read": "auth != null",
        ".write": "auth != null"
      }
    }
  }
}`;

export function getFirebaseDatabaseUrl(config: CloudSyncConfig): string {
  if (config.firebaseDatabaseUrl && config.firebaseDatabaseUrl.trim()) {
    return config.firebaseDatabaseUrl.trim().replace(/\/+$/, '');
  }
  const projectId = (
    config.firebaseProjectId || DEFAULT_FIREBASE_CONFIG.projectId
  ).trim();
  if (projectId === 'rent-41279' || projectId === 'four-rent-demo') {
    return DEFAULT_FIREBASE_DATABASE_URL;
  }
  return `https://${projectId}-default-rtdb.firebaseio.com`;
}

export function isCloudConfigured(config?: CloudSyncConfig): boolean {
  if (!config || !config.enabled) return false;
  return Boolean(
    (config.firebaseProjectId && config.firebaseProjectId.trim()) ||
      (config.firebaseDatabaseUrl && config.firebaseDatabaseUrl.trim()) ||
      DEFAULT_FIREBASE_CONFIG.projectId
  );
}

function appendFirebaseAuthParam(url: string, config: CloudSyncConfig): string {
  const token = (config.firebaseApiKey || '').trim();
  // Never pass a Firebase Web API key (AIza...) as ?auth=; RTDB ?auth= expects an ID token or DB secret.
  if (!token || /^AIza[0-9A-Za-z_-]{20,}$/.test(token)) {
    return url;
  }
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}auth=${encodeURIComponent(token)}`;
}

// ---------------------------------------------------------------------------
// Firebase Realtime Database REST & SSE Sync Engine
// ---------------------------------------------------------------------------

export async function pushSnapshotToFirebase(
  config: CloudSyncConfig,
  snapshot: AppDatabaseSnapshot
): Promise<{ ok: boolean; message: string; syncedAt?: string }> {
  const baseUrl = getFirebaseDatabaseUrl(config);
  const propCode = config.propertyCode || '4RENT-MAIN';
  const syncedAt = new Date().toISOString();
  // Never upload local PIN, WebAuthn identifiers, or API tokens to cloud snapshots
  const sanitizedSettings = snapshot.settings
    ? {
        ...snapshot.settings,
        security: {
          ...snapshot.settings.security,
          pinCode: '',
          webAuthnCredentialId: undefined,
        },
        cloudSync: {
          ...snapshot.settings.cloudSync,
          firebaseApiKey: '',
        },
      }
    : snapshot.settings;
  const payloadSnapshot = {
    ...snapshot,
    settings: sanitizedSettings,
    exportedAt: syncedAt,
  };

  const url = appendFirebaseAuthParam(
    `${baseUrl}/properties/${encodeURIComponent(propCode)}.json`,
    config
  );

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        propertyCode: propCode,
        snapshot: payloadSnapshot,
        updatedAt: syncedAt,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      return {
        ok: false,
        message: `Firebase Error (${response.status}): ${errText || response.statusText}`,
      };
    }

    // Best-effort registration in system_registry
    try {
      const regUrl = appendFirebaseAuthParam(
        `${baseUrl}/system_registry/${encodeURIComponent(propCode)}.json`,
        config
      );
      const regController = new AbortController();
      const regTimeout = setTimeout(() => regController.abort(), 5000);
      fetch(regUrl, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          propertyCode: propCode,
          apartmentName: snapshot.settings?.apartmentName || '4Rent Property',
          landlordName: snapshot.settings?.landlordName || 'Administrator',
          roomsCount: snapshot.rooms?.length || 0,
          billsCount: snapshot.bills?.length || 0,
          inquiriesCount: snapshot.inquiries?.length || 0,
          lastActiveAt: syncedAt,
          clientVersion: '1.0.0',
        }),
        signal: regController.signal,
      })
        .catch(() => undefined)
        .finally(() => clearTimeout(regTimeout));
    } catch {
      // ignore non-critical registry write error
    }

    return {
      ok: true,
      message: `Synchronized to Firebase Realtime Database (${propCode})`,
      syncedAt,
    };
  } catch (err) {
    return {
      ok: false,
      message:
        err instanceof Error ? err.message : 'Network error during Firebase sync',
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function pullSnapshotFromFirebase(
  config: CloudSyncConfig
): Promise<{
  ok: boolean;
  message: string;
  snapshot?: AppDatabaseSnapshot;
  updatedAt?: string;
}> {
  const baseUrl = getFirebaseDatabaseUrl(config);
  const propCode = config.propertyCode || '4RENT-MAIN';
  const url = appendFirebaseAuthParam(
    `${baseUrl}/properties/${encodeURIComponent(propCode)}.json`,
    config
  );

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });

    if (!response.ok) {
      return {
        ok: false,
        message: `Firebase Error (${response.status}): ${response.statusText}`,
      };
    }

    const data = await response.json();
    if (!data || !data.snapshot) {
      return {
        ok: false,
        message: `No cloud snapshot found yet in Firebase for Property "${propCode}". Tap "Sync Now" to initialize it.`,
      };
    }

    return {
      ok: true,
      message: 'Successfully pulled latest data from Firebase.',
      snapshot: data.snapshot as AppDatabaseSnapshot,
      updatedAt: data.updatedAt,
    };
  } catch (err) {
    return {
      ok: false,
      message:
        err instanceof Error ? err.message : 'Failed to connect to Firebase.',
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

export function subscribeToFirebaseRealtime(
  config: CloudSyncConfig,
  onRemoteSnapshot: (snapshot: AppDatabaseSnapshot) => void
): () => void {
  if (typeof EventSource === 'undefined') return () => {};

  const baseUrl = getFirebaseDatabaseUrl(config);
  const propCode = config.propertyCode || '4RENT-MAIN';
  const url = appendFirebaseAuthParam(
    `${baseUrl}/properties/${encodeURIComponent(propCode)}.json`,
    config
  );

  const handleEvent = (event: MessageEvent) => {
    try {
      const parsed = JSON.parse(event.data);
      if (!parsed || parsed.data == null) return;

      if (parsed.path === '/' && parsed.data.snapshot) {
        onRemoteSnapshot(parsed.data.snapshot as AppDatabaseSnapshot);
      } else if (parsed.path === '/snapshot' && typeof parsed.data === 'object') {
        onRemoteSnapshot(parsed.data as AppDatabaseSnapshot);
      } else if (parsed.data.snapshot) {
        onRemoteSnapshot(parsed.data.snapshot as AppDatabaseSnapshot);
      }
    } catch {
      // ignore malformed SSE payloads
    }
  };

  try {
    const es = new EventSource(url);
    es.addEventListener('put', handleEvent as EventListener);
    es.addEventListener('patch', handleEvent as EventListener);
    return () => es.close();
  } catch {
    return () => {};
  }
}

// ---------------------------------------------------------------------------
// Unified Cloud Database Aliases (Pure Firebase)
// ---------------------------------------------------------------------------

export const pushSnapshotToCloud = pushSnapshotToFirebase;
export const pullSnapshotFromCloud = pullSnapshotFromFirebase;
export const subscribeToRealtimeSync = subscribeToFirebaseRealtime;

// ---------------------------------------------------------------------------
// Network & Offline Status Detection
// ---------------------------------------------------------------------------

export type NetworkConnectionType = 'wifi' | 'cellular' | 'offline' | 'unknown';

export function getNetworkStatus(): {
  isOnline: boolean;
  connectionType: NetworkConnectionType;
  label: string;
} {
  const win = typeof window !== 'undefined' ? (window as any) : {};
  if (win.AndroidNative && typeof win.AndroidNative.getNetworkType === 'function') {
    try {
      const type = win.AndroidNative.getNetworkType() as NetworkConnectionType;
      if (type === 'offline') {
        return { isOnline: false, connectionType: 'offline', label: 'Offline (Local Safe)' };
      }
      return {
        isOnline: true,
        connectionType: type === 'cellular' ? 'cellular' : 'wifi',
        label: type === 'cellular' ? 'Mobile Data (Active)' : 'Wi-Fi (Active)',
      };
    } catch {
      // fallback
    }
  }

  const isOnline = typeof navigator !== 'undefined' ? navigator.onLine !== false : true;
  if (!isOnline) {
    return { isOnline: false, connectionType: 'offline', label: 'Offline (Local Safe)' };
  }

  const isMobile =
    typeof navigator !== 'undefined' &&
    /Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(
      navigator.userAgent || ''
    );

  const nav = typeof navigator !== 'undefined' ? (navigator as any) : null;
  const conn = nav?.connection || nav?.mozConnection || nav?.webkitConnection;
  if (conn) {
    const t = String(conn.type || '').toLowerCase();
    const eff = String(conn.effectiveType || '').toLowerCase();

    if (t.includes('wifi') || t.includes('ethernet')) {
      return {
        isOnline: true,
        connectionType: 'wifi',
        label: isMobile ? 'Wi-Fi (Active)' : 'Online (Wi-Fi / LAN)',
      };
    }

    if (t.includes('cellular')) {
      return {
        isOnline: true,
        connectionType: 'cellular',
        label: 'Mobile Data (Active)',
      };
    }

    if (isMobile && (conn.saveData || (eff && ['2g', '3g'].includes(eff)))) {
      return {
        isOnline: true,
        connectionType: 'cellular',
        label: 'Mobile Data (Active)',
      };
    }
  }

  if (!isMobile) {
    return {
      isOnline: true,
      connectionType: 'wifi',
      label: 'Online (Wi-Fi / LAN)',
    };
  }

  return { isOnline: true, connectionType: 'wifi', label: 'Online (Wi-Fi)' };
}

// ---------------------------------------------------------------------------
// Database Merge Helper
// ---------------------------------------------------------------------------

export function mergeDatabaseSnapshots(
  local: AppDatabaseSnapshot,
  remote: AppDatabaseSnapshot
): AppDatabaseSnapshot {
  const roomMap = new Map<string, any>();
  for (const r of remote.rooms || []) {
    roomMap.set(r.id, r);
  }
  for (const l of local.rooms || []) {
    const existing = roomMap.get(l.id);
    if (!existing) {
      roomMap.set(l.id, l);
    } else {
      const localTime = new Date(l.updatedAt || 0).getTime();
      const remoteTime = new Date(existing.updatedAt || 0).getTime();
      if (localTime >= remoteTime) {
        roomMap.set(l.id, l);
      }
    }
  }

  const billMap = new Map<string, any>();
  for (const b of remote.bills || []) {
    billMap.set(b.id, b);
  }
  for (const b of local.bills || []) {
    const existing = billMap.get(b.id);
    if (!existing) {
      billMap.set(b.id, b);
    } else {
      const localTime = new Date(b.updatedAt || b.createdAt || 0).getTime();
      const remoteTime = new Date(existing.updatedAt || existing.createdAt || 0).getTime();
      if (localTime >= remoteTime) {
        billMap.set(b.id, b);
      }
    }
  }

  const inquiryMap = new Map<string, any>();
  for (const i of remote.inquiries || []) {
    inquiryMap.set(i.id, i);
  }
  for (const i of local.inquiries || []) {
    inquiryMap.set(i.id, i);
  }

  const historyMap = new Map<string, any>();
  for (const h of remote.tenantHistory || []) {
    historyMap.set(h.id, h);
  }
  for (const h of local.tenantHistory || []) {
    historyMap.set(h.id, h);
  }

  const meterLogMap = new Map<string, any>();
  for (const m of remote.meterLogs || []) {
    meterLogMap.set(m.id, m);
  }
  for (const m of local.meterLogs || []) {
    meterLogMap.set(m.id, m);
  }

  // Keep local device security credentials intact when merging remote settings
  const mergedSettings = {
    ...(remote.settings || {}),
    ...(local.settings || {}),
    security: local.settings?.security || remote.settings?.security,
    cloudSync: local.settings?.cloudSync || remote.settings?.cloudSync,
  };

  return {
    version: '1.0.0',
    exportedAt: new Date().toISOString(),
    rooms: Array.from(roomMap.values()),
    bills: Array.from(billMap.values()),
    inquiries: Array.from(inquiryMap.values()),
    tenantHistory: Array.from(historyMap.values()),
    meterLogs: Array.from(meterLogMap.values()).sort((a, b) =>
      String(b.readingDate || '').localeCompare(String(a.readingDate || ''))
    ),
    settings: mergedSettings,
  };
}
