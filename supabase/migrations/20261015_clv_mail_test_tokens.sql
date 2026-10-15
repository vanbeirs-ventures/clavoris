-- One-time tokens for the clv-mailtest delivery test function (service role only; no policies).
create table if not exists public.clv_mail_test_tokens (
  token_hash text primary key,
  expires_at timestamptz not null default now() + interval '30 minutes',
  used_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.clv_mail_test_tokens enable row level security;
