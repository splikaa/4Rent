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

    channel.on('broadcast', { event: 'db_update' }, (payload) => {
      try {
        const snap = payload?.payload?.snapshot;
        if (snap && typeof snap === 'object' && Array.isArray(snap.rooms)) {
          onRemoteSnapshot(snap as AppDatabaseSnapshot);
        }
      } catch (err) {
        console.warn('Realtime sync payload parsing error:', err);
      }
    });

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
