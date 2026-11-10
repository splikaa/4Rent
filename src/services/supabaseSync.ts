import { createClient, SupabaseClient, RealtimeChannel } from '@supabase/supabase-js';
import { AppDatabaseSnapshot, CloudSyncConfig } from '../types/rental';

let cachedClient: SupabaseClient | null = null;
let cachedConfigKey = '';
let activeLiveChannel: RealtimeChannel | null = null;

function getClient(config: CloudSyncConfig): SupabaseClient | null {
  if (!config.enabled || !config.supabaseUrl || !config.supabaseAnonKey) {
    return null;
  }
  const key = `${config.supabaseUrl}|${config.supabaseAnonKey}`;
  if (!cachedClient || cachedConfigKey !== key) {
    cachedClient = createClient(
      config.supabaseUrl.trim(),
      config.supabaseAnonKey.trim(),
      {
        realtime: {
          params: {
            eventsPerSecond: 10,
          },
        },
      }
    );
    cachedConfigKey = key;
  }
  return cachedClient;
}

export const SUPABASE_SETUP_SQL = `-- Run this once in your Supabase SQL Editor to enable 4Rent Cloud Database Sync:
create table if not exists public.four_rent_sync (
  property_code text primary key,
  snapshot jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.four_rent_sync enable row level security;

drop policy if exists "Allow public sync access by property_code" on public.four_rent_sync;

create policy "Allow public sync access by property_code"
  on public.four_rent_sync
  for all
  using (true)
  with check (true);

-- Enable Realtime publication so desktop and mobile react instantly to changes
alter publication supabase_realtime add table public.four_rent_sync;`;

/**
 * Live Realtime subscription for instantaneous desktop <-> mobile synchronicity.
 */
export function subscribeToRealtimeSync(
  config: CloudSyncConfig,
  onRemoteSnapshot: (snapshot: AppDatabaseSnapshot) => void
): () => void {
  const client = getClient(config);
  if (!client) return () => {};

  const propCode = config.propertyCode || '4RENT-MAIN';
  const channelName = `4rent-live-${propCode}`;

  try {
    if (activeLiveChannel) {
      client.removeChannel(activeLiveChannel);
      activeLiveChannel = null;
    }

    const channel = client.channel(channelName, {
      config: { broadcast: { ack: false } },
    });

    channel
      .on('broadcast', { event: 'db_update' }, (payload) => {
        try {
          const snap = payload?.payload?.snapshot;
          if (snap && typeof snap === 'object' && Array.isArray(snap.rooms)) {
            onRemoteSnapshot(snap as AppDatabaseSnapshot);
          }
        } catch (err) {
          console.warn('Realtime sync payload parsing error:', err);
        }
      })
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'four_rent_sync',
          filter: `property_code=eq.${propCode}`,
        },
        (payload) => {
          try {
            const snap = (
              payload?.new as { snapshot?: AppDatabaseSnapshot } | undefined
            )?.snapshot;
            if (snap && typeof snap === 'object' && Array.isArray(snap.rooms)) {
              onRemoteSnapshot(snap);
            }
          } catch (err) {
            console.warn('Realtime postgres_changes parsing error:', err);
          }
        }
      );

    channel.subscribe();
    activeLiveChannel = channel;

    return () => {
      if (activeLiveChannel) {
        client.removeChannel(activeLiveChannel);
        activeLiveChannel = null;
      }
    };
  } catch {
    return () => {};
  }
}

export async function pushSnapshotToCloud(
  config: CloudSyncConfig,
  snapshot: AppDatabaseSnapshot
): Promise<{ ok: boolean; message: string; syncedAt?: string }> {
  const client = getClient(config);
  if (!client) {
    return {
      ok: false,
      message:
        'Cloud Sync is not configured. Enter your Supabase URL and Anon Key in Settings.',
    };
  }

  const propCode = config.propertyCode || '4RENT-MAIN';
  const syncedAt = new Date().toISOString();
  const payloadSnapshot = { ...snapshot, exportedAt: syncedAt };

  // 1. Send live Realtime broadcast to all open desktop/mobile apps
  try {
    const liveChannel =
      activeLiveChannel ||
      client.channel(`4rent-live-${propCode}`, {
        config: { broadcast: { ack: false } },
      });
    await liveChannel.send({
      type: 'broadcast',
      event: 'db_update',
      payload: { propertyCode: propCode, snapshot: payloadSnapshot, syncedAt },
    });
  } catch {
    // Non-blocking for offline or websocket transition
  }

  // 2. Persist to Postgres database table `public.four_rent_sync` with timeout
  try {
    const upsertPromise = client.from('four_rent_sync').upsert(
      {
        property_code: propCode,
        snapshot: payloadSnapshot,
        updated_at: syncedAt,
      },
      { onConflict: 'property_code' }
    );

    const timeoutPromise = new Promise<{ error: { message: string } }>((resolve) =>
      setTimeout(
        () =>
          resolve({
            error: { message: 'Cloud sync timed out after 8s.' },
          }),
        8000
      )
    );

    const { error } = (await Promise.race([
      upsertPromise,
      timeoutPromise,
    ])) as any;

    if (error) {
      return {
        ok: true,
        message: `Broadcasted to connected devices. (Note: To persist to Postgres table, run SQL setup in Settings).`,
        syncedAt,
      };
    }

    return {
      ok: true,
      message: `Synchronized to Supabase Cloud Database (${propCode})`,
      syncedAt,
    };
  } catch (err) {
    return {
      ok: false,
      message:
        err instanceof Error ? err.message : 'Network error during Cloud Sync',
    };
  }
}

export async function pullSnapshotFromCloud(
  config: CloudSyncConfig
): Promise<{
  ok: boolean;
  message: string;
  snapshot?: AppDatabaseSnapshot;
  updatedAt?: string;
}> {
  const client = getClient(config);
  if (!client) {
    return {
      ok: false,
      message: 'Cloud Sync is not configured.',
    };
  }

  try {
    const selectPromise = client
      .from('four_rent_sync')
      .select('snapshot, updated_at')
      .eq('property_code', config.propertyCode || '4RENT-MAIN')
      .maybeSingle();

    const timeoutPromise = new Promise<{
      data: null;
      error: { message: string };
    }>((resolve) =>
      setTimeout(
        () =>
          resolve({
            data: null,
            error: { message: 'Cloud pull timed out after 8s.' },
          }),
        8000
      )
    );

    const { data, error } = (await Promise.race([
      selectPromise,
      timeoutPromise,
    ])) as any;

    if (error) {
      if (
        (error as any).code === '42P01' ||
        (error as any).code === 'PGRST204' ||
        String((error as any).code) === '404' ||
        (error.message && error.message.includes('does not exist'))
      ) {
        return {
          ok: false,
          message:
            'Cloud Sync table not yet initialized. Copy and run the SQL Setup Script in Settings to create it.',
        };
      }
      return { ok: false, message: `Supabase Error: ${error.message}` };
    }

    if (!data || !data.snapshot) {
      return {
        ok: false,
        message: `No cloud snapshot found yet for Property Code "${config.propertyCode}". Push local data to create it.`,
      };
    }

    return {
      ok: true,
      message: 'Successfully pulled latest data from Cloud Database.',
      snapshot: data.snapshot as AppDatabaseSnapshot,
      updatedAt: data.updated_at,
    };
  } catch (err) {
    return {
      ok: false,
      message:
        err instanceof Error ? err.message : 'Failed to connect to Supabase.',
    };
  }
}

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

    // Only mobile devices should fall back to cellular on saveData or 2G/3G estimation
    if (isMobile && (conn.saveData || (eff && ['2g', '3g'].includes(eff)))) {
      return {
        isOnline: true,
        connectionType: 'cellular',
        label: 'Mobile Data (Active)',
      };
    }
  }

  // Desktop defaults to Wi-Fi / LAN
  if (!isMobile) {
    return {
      isOnline: true,
      connectionType: 'wifi',
      label: 'Online (Wi-Fi / LAN)',
    };
  }

  return { isOnline: true, connectionType: 'wifi', label: 'Online (Wi-Fi)' };
}

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
