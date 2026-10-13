-- E-mail notifications: per-user preferences, data-room file watcher snapshot, portfolio events.
-- Preferences live in clv_profiles.notify (jsonb). A missing key means ON; the user switches
-- a category off under Account. Keys: room_new, room_updated, contract_new, market_new, portfolio_events.
alter table public.clv_profiles add column if not exists notify jsonb not null default '{}'::jsonb;

-- Snapshot of every data-room file as last seen by the watcher (clv-notify "scan").
create table if not exists public.clv_room_files (
  room_id uuid not null references public.clv_rooms(id) on delete cascade,
  path text not null,
  etag text,
  size bigint,
  modified text,
  first_seen timestamptz not null default now(),
  last_changed timestamptz not null default now(),
  primary key (room_id, path)
);
alter table public.clv_room_files enable row level security;
grant select on public.clv_room_files to authenticated;
create policy clv_room_files_admin on public.clv_room_files for select using (public.clv_is_admin());

-- Portfolio events announced to holders (coupon, custom, maturity, principal, conversion).
create table if not exists public.clv_product_events (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.clv_products(id) on delete cascade,
  kind text not null check (kind in ('coupon','custom','maturity','principal','conversion')),
  title text not null,
  body text,
  event_date date,
  created_by uuid references public.clv_profiles(id),
  created_at timestamptz not null default now(),
  notified int not null default 0
);
alter table public.clv_product_events enable row level security;
grant select on public.clv_product_events to authenticated;
create policy clv_product_events_read on public.clv_product_events for select using (true);

-- "New investment available" is mailed once, when a product first becomes open.
alter table public.clv_products add column if not exists notified_open_at timestamptz;

-- Scheduler: the watcher runs every 15 minutes through pg_net (the function rate-limits itself).
create extension if not exists pg_net with schema extensions;
select cron.unschedule(jobid) from cron.job where jobname = 'clv-notify-scan';
select cron.schedule('clv-notify-scan', '*/15 * * * *', $$
  select net.http_post(
    url := 'https://ojwvdfdkybutuflwbutd.supabase.co/functions/v1/clv-notify',
    headers := '{"content-type":"application/json","x-clavoris-cron":"1"}'::jsonb,
    body := '{"action":"scan"}'::jsonb,
    timeout_milliseconds := 120000
  );
$$);

notify pgrst, 'reload schema';
