-- Delivery tracking for automated mail sent through Postmark (see clv-mail-events).
-- status: sent -> delivered | resent_text (HTML bounced, plain-text retry sent) | failed (red_flag = true).
-- body/cta are kept only until the message reaches a final status (they may contain one-time codes).
create table if not exists public.clv_mail_log (
  id uuid primary key default gen_random_uuid(),
  message_id text unique not null,
  recipient text not null,
  subject text,
  body text,
  lang text,
  cta jsonb,
  format text not null check (format in ('html', 'text')),
  parent_id uuid references public.clv_mail_log(id) on delete set null,
  status text not null default 'sent' check (status in ('sent', 'delivered', 'resent_text', 'failed')),
  detail text,
  red_flag boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists clv_mail_log_red_flag on public.clv_mail_log (created_at desc) where red_flag;
create index if not exists clv_mail_log_recipient on public.clv_mail_log (recipient, created_at desc);
alter table public.clv_mail_log enable row level security;  -- service role only

-- Keys accepted by the Postmark webhook URL (?key=...), stored as SHA-256.
create table if not exists public.clv_mail_webhook_keys (
  key_hash text primary key,
  created_at timestamptz not null default now()
);
alter table public.clv_mail_webhook_keys enable row level security;  -- service role only
