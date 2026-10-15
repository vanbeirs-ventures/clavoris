-- Self-service account closure (clv-account, action "delete").
-- The profile row stays (other records reference it) but is emptied and marked deleted_at.
-- What the law requires Clavoris to keep is copied to clv_retention: sealed, no user access
-- (RLS on, no policies; only the service role reads it), kept for five years after closure.
alter table clv_profiles add column if not exists deleted_at timestamptz;

create table if not exists clv_retention (
  user_id        uuid primary key,
  email          text,
  full_name      text,
  first_name     text,
  last_name      text,
  company        text,
  kyc_summary    jsonb,
  kyc_session_id text,
  deleted_at     timestamptz default now(),
  retain_until   timestamptz default (now() + interval '5 years')
);
alter table clv_retention enable row level security;
