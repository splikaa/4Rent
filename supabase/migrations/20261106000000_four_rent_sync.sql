-- 4Rent Cloud Database Sync Schema for Desktop & Mobile
-- Project Ref: nfwgyiqdmynaqkphgfqe

create table if not exists public.four_rent_sync (
  property_code text primary key,
  snapshot jsonb not null,
  updated_at timestamptz not null default now()
);

-- Enable Row Level Security (RLS)
alter table public.four_rent_sync enable row level security;

-- Drop any conflicting policy if already exists
drop policy if exists "Allow public sync access by property_code" on public.four_rent_sync;

-- Allow read & upsert sync operations for 4Rent clients
create policy "Allow public sync access by property_code"
  on public.four_rent_sync
  for all
  using (true)
  with check (true);

-- Enable Realtime publication so desktop and mobile react instantly to changes
alter publication supabase_realtime add table public.four_rent_sync;

