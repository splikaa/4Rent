import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { AppDatabaseSnapshot, CloudSyncConfig } from '../types/rental';

let cachedClient: SupabaseClient | null = null;
let cachedConfigKey = '';

function getClient(config: CloudSyncConfig): SupabaseClient | null {
  if (!config.enabled || !config.supabaseUrl || !config.supabaseAnonKey) {
    return null;
  }
  const key = `${config.supabaseUrl}|${config.supabaseAnonKey}`;
  if (!cachedClient || cachedConfigKey !== key) {
    cachedClient = createClient(config.supabaseUrl.trim(), config.supabaseAnonKey.trim());
    cachedConfigKey = key;
  }
  return cachedClient;
}

export const SUPABASE_SETUP_SQL = `-- Run this once in your Supabase SQL Editor to enable 4Rent Cloud Sync across Desktop & Mobile:
create table if not exists public.four_rent_sync (
  property_code text primary key,
  snapshot jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.four_rent_sync enable row level security;

create policy "Allow public sync access by property_code"
  on public.four_rent_sync
  for all
  using (true)
  with check (true);`;

export async function pushSnapshotToCloud(
  config: CloudSyncConfig,
  snapshot: AppDatabaseSnapshot
): Promise<{ ok: boolean; message: string; syncedAt?: string }> {
  const client = getClient(config);
  if (!client) {
    return {
      ok: false,
      message: 'Cloud Sync is not configured. Enter your Supabase URL and Anon Key in Settings.',
    };
  }

  try {
    const syncedAt = new Date().toISOString();
    const { error } = await client.from('four_rent_sync').upsert(
      {
        property_code: config.propertyCode || '4RENT-MAIN',
        snapshot: { ...snapshot, exportedAt: syncedAt },
        updated_at: syncedAt,
      },
      { onConflict: 'property_code' }
    );

    if (error) {
      return { ok: false, message: `Supabase Error: ${error.message}` };
    }

    return {
      ok: true,
      message: `Synced to cloud (${config.propertyCode})`,
      syncedAt,
    };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : 'Network error during Cloud Sync',
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
    const { data, error } = await client
      .from('four_rent_sync')
      .select('snapshot, updated_at')
      .eq('property_code', config.propertyCode || '4RENT-MAIN')
      .maybeSingle();

    if (error) {
      return { ok: false, message: `Supabase Error: ${error.message}` };
    }

    if (!data || !data.snapshot) {
      return {
        ok: false,
        message: `No cloud snapshot found yet for Property Code "${config.propertyCode}". Push your local data first.`,
      };
    }

    return {
      ok: true,
      message: 'Successfully pulled latest data from Cloud Sync.',
      snapshot: data.snapshot as AppDatabaseSnapshot,
      updatedAt: data.updated_at,
    };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : 'Failed to connect to Supabase.',
    };
  }
}

