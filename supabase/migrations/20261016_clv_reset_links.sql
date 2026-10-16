-- Password-reset links valid for 5 minutes. The mail carries a random code; this table maps its SHA-256 to the
-- Supabase recovery token, which never leaves the server (Supabase's own link lifetime is 24 hours, for
-- invitations and reminders). Service role only: RLS on, no policies.
create table if not exists public.clv_reset_links (
  code_hash text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  token_hash text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz
);
create index if not exists clv_reset_links_user on public.clv_reset_links (user_id);
alter table public.clv_reset_links enable row level security;
