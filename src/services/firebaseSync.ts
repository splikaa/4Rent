import { AppDatabaseSnapshot, CloudSyncConfig } from '../types/rental';

/**
 * 4Rent Production Firebase Configuration for Web & Mobile
 */
export const DEFAULT_FIREBASE_CONFIG = {
  apiKey: 'AIzaSyADZ1u2AAvEF1Rvh3knPjck_rnRihP2Ifk',
  authDomain: 'rent-41279.firebaseapp.com',
  projectId: 'rent-41279',
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
        ".read": true,
        ".write": true
      }
    },
    "system_registry": {
      ".read": true,
      "$propertyCode": {
        ".write": true
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
  const payloadSnapshot = { ...snapshot, exportedAt: syncedAt };

  let url = `${baseUrl}/properties/${encodeURIComponent(propCode)}.json`;
  const apiKey = config.firebaseApiKey || DEFAULT_FIREBASE_CONFIG.apiKey;
  if (apiKey && apiKey.trim()) {
    url += `?auth=${encodeURIComponent(apiKey.trim())}`;
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

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
    clearTimeout(timeoutId);

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      return {
        ok: false,
        message: `Firebase Error (${response.status}): ${errText || response.statusText}`,
      };
    }

    // Simultaneously register this property in system_registry so property owners/admins can see all active users in Firebase Console
    try {
      let regUrl = `${baseUrl}/system_registry/${encodeURIComponent(propCode)}.json`;
      if (apiKey && apiKey.trim()) {
        regUrl += `?auth=${encodeURIComponent(apiKey.trim())}`;
      }
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
      }).catch(() => {});
    } catch {}

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

  let url = `${baseUrl}/properties/${encodeURIComponent(propCode)}.json`;
  const apiKey = config.firebaseApiKey || DEFAULT_FIREBASE_CONFIG.apiKey;
  if (apiKey && apiKey.trim()) {
    url += `?auth=${encodeURIComponent(apiKey.trim())}`;
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    const response = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

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
  }
}

export function subscribeToFirebaseRealtime(
  config: CloudSyncConfig,
  onRemoteSnapshot: (snapshot: AppDatabaseSnapshot) => void
): () => void {
  if (typeof EventSource === 'undefined') return () => {};

  const baseUrl = getFirebaseDatabaseUrl(config);
  const propCode = config.propertyCode || '4RENT-MAIN';
  const url = `${baseUrl}/properties/${encodeURIComponent(propCode)}.json`;

  try {
    const es = new EventSource(url);
    es.addEventListener('put', (event) => {
      try {
        const parsed = JSON.parse(event.data);
        if (parsed && parsed.data && parsed.data.snapshot) {
          onRemoteSnapshot(parsed.data.snapshot);
        } else if (parsed && parsed.snapshot) {
          onRemoteSnapshot(parsed.snapshot);
        }
      } catch {}
    });
    es.addEventListener('patch', (event) => {
      try {
        const parsed = JSON.parse(event.data);
        if (parsed && parsed.data && parsed.data.snapshot) {
          onRemoteSnapshot(parsed.data.snapshot);
        } else if (parsed && parsed.snapshot) {
          onRemoteSnapshot(parsed.snapshot);
        }
      } catch {}
    });
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

  const mergedSettings = {
    ...(remote.settings || {}),
    ...(local.settings || {}),
  };

  return {
    version: '1.0.0',
    exportedAt: new Date().toISOString(),
    rooms: Array.from(roomMap.values()),
    bills: Array.from(billMap.values()),
    inquiries: Array.from(inquiryMap.values()),
    tenantHistory: Array.from(historyMap.values()),
    settings: mergedSettings,
  };
}
