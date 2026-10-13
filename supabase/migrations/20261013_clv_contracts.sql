-- Contracts: PDF agreements executed with eIDAS qualified electronic signatures (Sumsub QES).
-- Parties are Clavoris users: signatories (sign in order) or auditors (follow the process only).
-- Service role only (edge function clv-contracts); no RLS policies.
create table if not exists clv_contracts (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  status text not null default 'draft' check (status in ('draft','in_progress','executed','declined','cancelled')),
  folder text not null,                 -- Nextcloud folder of this contract (relative to the connected account root)
  original_name text not null,          -- file name as uploaded
  original_path text not null,          -- Nextcloud path of the unsigned PDF
  sha256_original text not null,
  current_path text,                    -- latest signed version (input for the next signatory)
  executed_path text,                   -- fully executed PDF (all qualified signatures embedded)
  sha256_executed text,
  certificate_path text,                -- Clavoris certificate of completion (PDF)
  pages int,
  created_by uuid references clv_profiles(id),
  created_at timestamptz not null default now(),
  launched_at timestamptz,
  executed_at timestamptz,
  closed_at timestamptz
);
alter table clv_contracts enable row level security;

create table if not exists clv_contract_parties (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references clv_contracts(id) on delete cascade,
  user_id uuid not null references clv_profiles(id),
  role text not null check (role in ('signatory','auditor')),
  order_no int not null default 1,
  status text not null default 'pending' check (status in ('pending','invited','opened','signing','signed','declined')),
  invited_at timestamptz,
  opened_at timestamptz,
  signing_started_at timestamptz,
  signed_at timestamptz,
  declined_at timestamptz,
  ip text,
  user_agent text,
  sumsub_applicant_id text,
  sumsub_doc_name text,                 -- document name used in the Sumsub e-sign session
  signed_path text,                     -- Nextcloud path of the PDF after this party's signature
  sha256_signed text,
  evidence jsonb not null default '{}'::jsonb,
  added_by uuid,
  added_at timestamptz not null default now(),
  unique (contract_id, user_id)
);
alter table clv_contract_parties enable row level security;
create index if not exists clv_contract_parties_user on clv_contract_parties (user_id);

create table if not exists clv_contract_events (
  id bigserial primary key,
  contract_id uuid not null references clv_contracts(id) on delete cascade,
  user_id uuid,
  event text not null,
  detail jsonb not null default '{}'::jsonb,
  ip text,
  ts timestamptz not null default now()
);
alter table clv_contract_events enable row level security;
create index if not exists clv_contract_events_contract on clv_contract_events (contract_id, ts desc);

grant all on table clv_contracts, clv_contract_parties, clv_contract_events to service_role;
grant usage, select on sequence clv_contract_events_id_seq to service_role;
revoke all on table clv_contracts, clv_contract_parties, clv_contract_events from anon, authenticated;

-- Contract downloads are recorded in the same download register as data-room downloads.
alter table clv_downloads alter column room_id drop not null;
alter table clv_downloads add column if not exists contract_id uuid references clv_contracts(id);
alter table clv_downloads drop constraint if exists clv_downloads_delivered_as_check;
