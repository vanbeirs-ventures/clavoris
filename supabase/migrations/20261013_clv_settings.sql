-- Server-side settings for the Clavoris app (e.g. the Nextcloud connection created by
-- the admin "Connect Nextcloud" button). No RLS policies: service role only.
create table if not exists clv_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid
);
alter table clv_settings enable row level security;
