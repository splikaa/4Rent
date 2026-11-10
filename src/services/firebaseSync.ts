import { AppDatabaseSnapshot, CloudSyncConfig } from '../types/rental';

export const FIREBASE_RULES_JSON = `{
  "rules": {
    "properties": {
      "$propertyCode": {
        ".read": true,
        ".write": true
      }
    }
  }
}`;

export function getFirebaseDatabaseUrl(config: CloudSyncConfig): string {
  if (config.firebaseDatabaseUrl && config.firebaseDatabaseUrl.trim()) {
    return config.firebaseDatabaseUrl.trim().replace(/\/+$/, '');
  }
  const projectId = (config.firebaseProjectId || 'four-rent-demo').trim();
  return `https://${projectId}-default-rtdb.firebaseio.com`;
}

export async function pushSnapshotToFirebase(
  config: CloudSyncConfig,
  snapshot: AppDatabaseSnapshot
): Promise<{ ok: boolean; message: string; syncedAt?: string }> {
  const baseUrl = getFirebaseDatabaseUrl(config);
  const propCode = config.propertyCode || '4RENT-MAIN';
  const syncedAt = new Date().toISOString();
  const payloadSnapshot = { ...snapshot, exportedAt: syncedAt };

  let url = `${baseUrl}/properties/${encodeURIComponent(propCode)}.json`;
  if (config.firebaseApiKey && config.firebaseApiKey.trim()) {
    url += `?auth=${encodeURIComponent(config.firebaseApiKey.trim())}`;
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
  if (config.firebaseApiKey && config.firebaseApiKey.trim()) {
    url += `?auth=${encodeURIComponent(config.firebaseApiKey.trim())}`;
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
