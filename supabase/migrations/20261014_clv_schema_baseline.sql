-- Clavoris schema baseline — generated from the live catalog of the former shared
-- project (Minerva Website, ojwvdfdkybutuflwbutd) on 2026-10-14, when Clavoris moved
-- to its own Supabase project. It is the union of all earlier migrations plus the
-- objects that had been created by hand; it is idempotent and can be applied to a
-- fresh project in one go. Earlier migration files are kept for history only.

-- ---------------------------------------------------------------- sequences
create sequence if not exists public.clv_contract_events_id_seq;
create sequence if not exists public.clv_product_access_id_seq;

-- ---------------------------------------------------------------- tables
create table if not exists public.clv_companies (
  id uuid not null default gen_random_uuid(),
  name text not null,
  legal_form text,
  country text,
  registration_no text,
  contact_email text,
  created_at timestamp with time zone not null default now(),
  created_by uuid,
  constraint clv_companies_pkey primary key (id)
);

create table if not exists public.clv_profiles (
  id uuid not null,
  email text not null,
  full_name text,
  company text,
  job_title text,
  mobile text,
  lang text not null default 'en'::text,
  role text not null default 'user'::text,
  status text not null default 'registered'::text,
  terms_accepted_at timestamp with time zone,
  sumsub_applicant_id text,
  kyc_level text,
  kyc_review_answer text,
  kyc_reject_type text,
  kyc_reviewed_at timestamp with time zone,
  suspended_at timestamp with time zone,
  last_login_at timestamp with time zone,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  features jsonb not null default '{}'::jsonb,
  notify jsonb not null default '{}'::jsonb,
  company_id uuid,
  kyc_provider text,
  kyc_session_id text,
  kyc_session_number bigint,
  kyc_summary jsonb,
  constraint clv_profiles_pkey primary key (id),
  constraint clv_profiles_sumsub_applicant_id_key unique (sumsub_applicant_id),
  constraint clv_profiles_id_fkey foreign key (id) references auth.users(id) on delete cascade,
  constraint clv_profiles_company_id_fkey foreign key (company_id) references public.clv_companies(id),
  constraint clv_profiles_kyc_reject_type_check check (kyc_reject_type = any (array['RETRY'::text, 'FINAL'::text])),
  constraint clv_profiles_kyc_review_answer_check check (kyc_review_answer = any (array['GREEN'::text, 'RED'::text])),
  constraint clv_profiles_lang_check check (lang = any (array['en'::text, 'nl'::text, 'fr'::text, 'de'::text, 'es'::text, 'it'::text])),
  constraint clv_profiles_role_check check (role = any (array['user'::text, 'admin'::text, 'super'::text])),
  constraint clv_profiles_status_check check (status = any (array['registered'::text, 'kyc_pending'::text, 'kyc_retry'::text, 'verified'::text, 'rejected'::text, 'suspended'::text]))
);

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'clv_companies_created_by_fkey') then
    alter table public.clv_companies add constraint clv_companies_created_by_fkey foreign key (created_by) references public.clv_profiles(id);
  end if;
end $$;

create table if not exists public.clv_rooms (
  id uuid not null default gen_random_uuid(),
  slug text not null,
  name text not null,
  description text,
  project_type text not null default 'ma'::text,
  seller text,
  nextcloud_folder text not null,
  status text not null default 'open'::text,
  default_expiry_days integer default 90,
  watermark boolean not null default true,
  downloads_allowed boolean not null default true,
  qes_nda_required boolean not null default false,
  annex_text text,
  annex_version text,
  created_by uuid,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  company_id uuid,
  nda_pdf_path text,
  nda_pdf_name text,
  nda_pdf_sha256 text,
  constraint clv_rooms_pkey primary key (id),
  constraint clv_rooms_slug_key unique (slug),
  constraint clv_rooms_company_id_fkey foreign key (company_id) references public.clv_companies(id),
  constraint clv_rooms_created_by_fkey foreign key (created_by) references public.clv_profiles(id),
  constraint clv_rooms_project_type_check check (project_type = 'ma'::text),
  constraint clv_rooms_slug_check check (slug ~ '^[a-z0-9-]{3,60}$'::text),
  constraint clv_rooms_status_check check (status = any (array['draft'::text, 'open'::text, 'closed'::text]))
);

create table if not exists public.clv_access_log (
  id bigint generated always as identity not null,
  user_id uuid not null,
  room_id uuid not null,
  file_path text,
  action text not null,
  ip text,
  user_agent text,
  ts timestamp with time zone not null default now(),
  constraint clv_access_log_pkey primary key (id),
  constraint clv_access_log_action_check check (action = any (array['login'::text, 'kyc-start'::text, 'list'::text, 'view'::text, 'download'::text, 'room-view'::text, 'nda-signed'::text, 'download-nda'::text, 'presence'::text]))
);

create table if not exists public.clv_audit (
  id bigint generated always as identity not null,
  actor uuid,
  actor_email text,
  event_type text not null,
  target text,
  detail jsonb,
  created_at timestamp with time zone not null default now(),
  constraint clv_audit_pkey primary key (id)
);

create table if not exists public.clv_settings (
  key text not null,
  value jsonb not null,
  updated_at timestamp with time zone not null default now(),
  updated_by uuid,
  constraint clv_settings_pkey primary key (key)
);

create table if not exists public.clv_sumsub_events (
  id bigint generated always as identity not null,
  digest text not null,
  type text,
  applicant_id text,
  external_user_id text,
  review_answer text,
  payload jsonb not null,
  processed_at timestamp with time zone,
  received_at timestamp with time zone not null default now(),
  constraint clv_sumsub_events_pkey primary key (id),
  constraint clv_sumsub_events_digest_key unique (digest)
);

create table if not exists public.clv_kyc_events (
  id bigint generated by default as identity not null,
  provider text not null default 'didit'::text,
  event_id text not null,
  webhook_type text,
  session_id text,
  user_id uuid,
  status text,
  environment text,
  payload jsonb not null,
  received_at timestamp with time zone not null default now(),
  processed_at timestamp with time zone,
  constraint clv_kyc_events_pkey primary key (id),
  constraint clv_kyc_events_user_id_fkey foreign key (user_id) references public.clv_profiles(id) on delete set null
);

create table if not exists public.clv_room_assignments (
  id uuid not null default gen_random_uuid(),
  room_id uuid not null,
  user_id uuid not null,
  can_download boolean not null default true,
  expires_at timestamp with time zone,
  granted_by uuid,
  granted_at timestamp with time zone not null default now(),
  revoked_at timestamp with time zone,
  revoked_by uuid,
  reminded_7d_at timestamp with time zone,
  reminded_24h_at timestamp with time zone,
  constraint clv_room_assignments_pkey primary key (id),
  constraint clv_room_assignments_room_id_user_id_key unique (room_id, user_id),
  constraint clv_room_assignments_granted_by_fkey foreign key (granted_by) references public.clv_profiles(id),
  constraint clv_room_assignments_revoked_by_fkey foreign key (revoked_by) references public.clv_profiles(id),
  constraint clv_room_assignments_room_id_fkey foreign key (room_id) references public.clv_rooms(id) on delete cascade,
  constraint clv_room_assignments_user_id_fkey foreign key (user_id) references public.clv_profiles(id) on delete cascade
);

create table if not exists public.clv_room_annex_acceptances (
  id bigint generated always as identity not null,
  room_id uuid not null,
  user_id uuid not null,
  annex_version text,
  annex_sha256 text not null,
  ip text,
  user_agent text,
  accepted_at timestamp with time zone not null default now(),
  constraint clv_room_annex_acceptances_pkey primary key (id),
  constraint clv_room_annex_acceptances_room_id_fkey foreign key (room_id) references public.clv_rooms(id) on delete cascade,
  constraint clv_room_annex_acceptances_user_id_fkey foreign key (user_id) references public.clv_profiles(id) on delete cascade
);

create table if not exists public.clv_room_files (
  room_id uuid not null,
  path text not null,
  etag text,
  size bigint,
  modified text,
  first_seen timestamp with time zone not null default now(),
  last_changed timestamp with time zone not null default now(),
  constraint clv_room_files_pkey primary key (room_id, path),
  constraint clv_room_files_room_id_fkey foreign key (room_id) references public.clv_rooms(id) on delete cascade
);

create table if not exists public.clv_access_requests (
  id uuid not null default gen_random_uuid(),
  room_id uuid not null,
  user_id uuid not null,
  requested_until date not null,
  message text,
  status text not null default 'pending'::text,
  decided_by uuid,
  decided_at timestamp with time zone,
  decision_note text,
  created_at timestamp with time zone not null default now(),
  constraint clv_access_requests_pkey primary key (id),
  constraint clv_access_requests_decided_by_fkey foreign key (decided_by) references public.clv_profiles(id),
  constraint clv_access_requests_room_id_fkey foreign key (room_id) references public.clv_rooms(id) on delete cascade,
  constraint clv_access_requests_user_id_fkey foreign key (user_id) references public.clv_profiles(id) on delete cascade,
  constraint clv_access_requests_status_check check (status = any (array['pending'::text, 'accepted'::text, 'rejected'::text]))
);

create table if not exists public.clv_signed_documents (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null,
  room_id uuid,
  doc_type text not null,
  doc_version text,
  sumsub_image_id text,
  sha256_unsigned text,
  sha256_signed text,
  nextcloud_path text,
  validation jsonb,
  signed_at timestamp with time zone,
  created_at timestamp with time zone not null default now(),
  constraint clv_signed_documents_pkey primary key (id),
  constraint clv_signed_documents_user_id_fkey foreign key (user_id) references public.clv_profiles(id) on delete cascade
);

create table if not exists public.clv_contracts (
  id uuid not null default gen_random_uuid(),
  title text not null,
  description text,
  status text not null default 'draft'::text,
  folder text not null,
  original_name text not null,
  original_path text not null,
  sha256_original text not null,
  current_path text,
  executed_path text,
  sha256_executed text,
  certificate_path text,
  pages integer,
  created_by uuid,
  created_at timestamp with time zone not null default now(),
  launched_at timestamp with time zone,
  executed_at timestamp with time zone,
  closed_at timestamp with time zone,
  company_id uuid,
  constraint clv_contracts_pkey primary key (id),
  constraint clv_contracts_company_id_fkey foreign key (company_id) references public.clv_companies(id),
  constraint clv_contracts_created_by_fkey foreign key (created_by) references public.clv_profiles(id),
  constraint clv_contracts_status_check check (status = any (array['draft'::text, 'in_progress'::text, 'executed'::text, 'declined'::text, 'cancelled'::text]))
);

create table if not exists public.clv_contract_parties (
  id uuid not null default gen_random_uuid(),
  contract_id uuid not null,
  user_id uuid not null,
  role text not null,
  order_no integer not null default 1,
  status text not null default 'pending'::text,
  invited_at timestamp with time zone,
  opened_at timestamp with time zone,
  signing_started_at timestamp with time zone,
  signed_at timestamp with time zone,
  declined_at timestamp with time zone,
  ip text,
  user_agent text,
  sumsub_applicant_id text,
  sumsub_doc_name text,
  signed_path text,
  sha256_signed text,
  evidence jsonb not null default '{}'::jsonb,
  added_by uuid,
  added_at timestamp with time zone not null default now(),
  constraint clv_contract_parties_pkey primary key (id),
  constraint clv_contract_parties_contract_id_user_id_key unique (contract_id, user_id),
  constraint clv_contract_parties_contract_id_fkey foreign key (contract_id) references public.clv_contracts(id) on delete cascade,
  constraint clv_contract_parties_user_id_fkey foreign key (user_id) references public.clv_profiles(id),
  constraint clv_contract_parties_role_check check (role = any (array['signatory'::text, 'auditor'::text])),
  constraint clv_contract_parties_status_check check (status = any (array['pending'::text, 'invited'::text, 'opened'::text, 'signing'::text, 'signed'::text, 'declined'::text]))
);

create table if not exists public.clv_contract_events (
  id bigint not null default nextval('public.clv_contract_events_id_seq'::regclass),
  contract_id uuid not null,
  user_id uuid,
  event text not null,
  detail jsonb not null default '{}'::jsonb,
  ip text,
  ts timestamp with time zone not null default now(),
  constraint clv_contract_events_pkey primary key (id),
  constraint clv_contract_events_contract_id_fkey foreign key (contract_id) references public.clv_contracts(id) on delete cascade
);
alter sequence public.clv_contract_events_id_seq owned by public.clv_contract_events.id;

create table if not exists public.clv_downloads (
  id uuid not null default gen_random_uuid(),
  code text not null,
  user_id uuid not null,
  room_id uuid,
  file_path text not null,
  file_name text not null,
  file_etag text,
  sha256_source text,
  sha256_delivered text,
  watermark jsonb not null,
  delivered_as text not null default 'pdf'::text,
  ip text,
  user_agent text,
  created_at timestamp with time zone not null default now(),
  contract_id uuid,
  constraint clv_downloads_pkey primary key (id),
  constraint clv_downloads_code_key unique (code),
  constraint clv_downloads_contract_id_fkey foreign key (contract_id) references public.clv_contracts(id),
  constraint clv_downloads_room_id_fkey foreign key (room_id) references public.clv_rooms(id),
  constraint clv_downloads_user_id_fkey foreign key (user_id) references public.clv_profiles(id),
  constraint clv_downloads_code_check check (code ~ '^CLV-[A-Z0-9]{4}-[A-Z0-9]{4}$'::text)
);

create table if not exists public.clv_products (
  id uuid not null default gen_random_uuid(),
  code text not null,
  name text not null,
  type text not null default 'private_bond'::text,
  status text not null default 'upcoming'::text,
  issuer_name text not null,
  issuer_id text,
  issuer_country text,
  issuer_description text,
  isin text,
  currency text not null default 'EUR'::text,
  nominal numeric(18,2) not null default 1000,
  min_units integer not null default 1,
  total_units integer,
  coupon_rate numeric(8,4),
  coupon_frequency text not null default 'annual'::text,
  issue_date date,
  first_coupon_date date,
  maturity_date date,
  subscription_opens date,
  subscription_closes date,
  description text,
  highlights text,
  nextcloud_folder text,
  secondary_enabled boolean not null default false,
  max_investors integer,
  created_by uuid,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  notified_open_at timestamp with time zone,
  company_id uuid,
  constraint clv_products_pkey primary key (id),
  constraint clv_products_code_key unique (code),
  constraint clv_products_company_id_fkey foreign key (company_id) references public.clv_companies(id),
  constraint clv_products_created_by_fkey foreign key (created_by) references public.clv_profiles(id),
  constraint clv_products_coupon_frequency_check check (coupon_frequency = any (array['annual'::text, 'semi'::text, 'quarterly'::text, 'monthly'::text, 'none'::text])),
  constraint clv_products_status_check check (status = any (array['upcoming'::text, 'open'::text, 'closed'::text, 'matured'::text, 'cancelled'::text])),
  constraint clv_products_type_check check (type = any (array['private_bond'::text, 'sicav_share'::text, 'note'::text, 'other'::text]))
);

create table if not exists public.clv_subscriptions (
  id uuid not null default gen_random_uuid(),
  product_id uuid not null,
  user_id uuid not null,
  units integer not null,
  amount numeric(18,2) not null,
  status text not null default 'requested'::text,
  contract_id uuid,
  note text,
  ip text,
  created_at timestamp with time zone not null default now(),
  accepted_at timestamp with time zone,
  settled_at timestamp with time zone,
  closed_at timestamp with time zone,
  constraint clv_subscriptions_pkey primary key (id),
  constraint clv_subscriptions_contract_id_fkey foreign key (contract_id) references public.clv_contracts(id),
  constraint clv_subscriptions_product_id_fkey foreign key (product_id) references public.clv_products(id) on delete cascade,
  constraint clv_subscriptions_user_id_fkey foreign key (user_id) references public.clv_profiles(id),
  constraint clv_subscriptions_status_check check (status = any (array['requested'::text, 'accepted'::text, 'settled'::text, 'cancelled'::text, 'rejected'::text])),
  constraint clv_subscriptions_units_check check (units > 0)
);

create table if not exists public.clv_listings (
  id uuid not null default gen_random_uuid(),
  product_id uuid not null,
  seller_id uuid not null,
  units integer not null,
  price_per_unit numeric(18,2) not null,
  status text not null default 'open'::text,
  buyer_id uuid,
  contract_id uuid,
  created_at timestamp with time zone not null default now(),
  matched_at timestamp with time zone,
  settled_at timestamp with time zone,
  cancelled_at timestamp with time zone,
  constraint clv_listings_pkey primary key (id),
  constraint clv_listings_buyer_id_fkey foreign key (buyer_id) references public.clv_profiles(id),
  constraint clv_listings_contract_id_fkey foreign key (contract_id) references public.clv_contracts(id),
  constraint clv_listings_product_id_fkey foreign key (product_id) references public.clv_products(id) on delete cascade,
  constraint clv_listings_seller_id_fkey foreign key (seller_id) references public.clv_profiles(id),
  constraint clv_listings_status_check check (status = any (array['open'::text, 'matched'::text, 'settled'::text, 'cancelled'::text])),
  constraint clv_listings_units_check check (units > 0)
);

create table if not exists public.clv_holdings (
  id uuid not null default gen_random_uuid(),
  product_id uuid not null,
  user_id uuid not null,
  units integer not null,
  price_per_unit numeric(18,2) not null,
  source text not null,
  subscription_id uuid,
  listing_id uuid,
  contract_id uuid,
  acquired_at timestamp with time zone not null default now(),
  note text,
  constraint clv_holdings_pkey primary key (id),
  constraint clv_holdings_contract_id_fkey foreign key (contract_id) references public.clv_contracts(id),
  constraint clv_holdings_product_id_fkey foreign key (product_id) references public.clv_products(id) on delete cascade,
  constraint clv_holdings_subscription_id_fkey foreign key (subscription_id) references public.clv_subscriptions(id),
  constraint clv_holdings_user_id_fkey foreign key (user_id) references public.clv_profiles(id),
  constraint clv_holdings_source_check check (source = any (array['subscription'::text, 'secondary'::text, 'transfer'::text])),
  constraint clv_holdings_units_check check (units >= 0)
);

create table if not exists public.clv_coupon_payments (
  id uuid not null default gen_random_uuid(),
  product_id uuid not null,
  user_id uuid not null,
  due_date date not null,
  amount numeric(18,2) not null,
  paid_at timestamp with time zone,
  reference text,
  created_by uuid,
  created_at timestamp with time zone not null default now(),
  constraint clv_coupon_payments_pkey primary key (id),
  constraint clv_coupon_payments_product_id_user_id_due_date_key unique (product_id, user_id, due_date),
  constraint clv_coupon_payments_product_id_fkey foreign key (product_id) references public.clv_products(id) on delete cascade,
  constraint clv_coupon_payments_user_id_fkey foreign key (user_id) references public.clv_profiles(id)
);

create table if not exists public.clv_product_access (
  id bigint not null default nextval('public.clv_product_access_id_seq'::regclass),
  product_id uuid not null,
  user_id uuid not null,
  kind text not null,
  path text,
  sha256 text,
  ip text,
  user_agent text,
  ts timestamp with time zone not null default now(),
  constraint clv_product_access_pkey primary key (id),
  constraint clv_product_access_product_id_fkey foreign key (product_id) references public.clv_products(id) on delete cascade,
  constraint clv_product_access_user_id_fkey foreign key (user_id) references public.clv_profiles(id),
  constraint clv_product_access_kind_check check (kind = any (array['view'::text, 'docs'::text, 'download'::text, 'subscribe'::text, 'list'::text, 'buy'::text]))
);
alter sequence public.clv_product_access_id_seq owned by public.clv_product_access.id;

create table if not exists public.clv_product_events (
  id uuid not null default gen_random_uuid(),
  product_id uuid not null,
  kind text not null,
  title text not null,
  body text,
  event_date date,
  created_by uuid,
  created_at timestamp with time zone not null default now(),
  notified integer not null default 0,
  constraint clv_product_events_pkey primary key (id),
  constraint clv_product_events_created_by_fkey foreign key (created_by) references public.clv_profiles(id),
  constraint clv_product_events_product_id_fkey foreign key (product_id) references public.clv_products(id) on delete cascade,
  constraint clv_product_events_kind_check check (kind = any (array['coupon'::text, 'custom'::text, 'maturity'::text, 'principal'::text, 'conversion'::text]))
);

-- ---------------------------------------------------------------- functions
create or replace function public.clv_has_room_access(p_room uuid, p_user uuid default auth.uid())
 returns boolean
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select exists (
    select 1 from public.clv_room_assignments a
      join public.clv_rooms r on r.id = a.room_id and r.status = 'open'
      join public.clv_profiles p on p.id = a.user_id and p.status = 'verified'
     where a.room_id = p_room and a.user_id = p_user
       and a.revoked_at is null and (a.expires_at is null or a.expires_at > now()));
$function$;

create or replace function public.clv_is_admin()
 returns boolean
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select exists (select 1 from public.clv_profiles
                 where id = auth.uid() and role in ('admin','super') and status <> 'suspended');
$function$;

create or replace function public.clv_touch_updated_at()
 returns trigger
 language plpgsql
 set search_path to 'public'
as $function$
begin new.updated_at := now(); return new; end; $function$;

revoke all on function public.clv_has_room_access(uuid, uuid) from public, anon;
revoke all on function public.clv_is_admin() from public, anon;
grant execute on function public.clv_has_room_access(uuid, uuid) to authenticated, service_role;
grant execute on function public.clv_is_admin() to authenticated, service_role;

-- ---------------------------------------------------------------- triggers
drop trigger if exists clv_profiles_touch on public.clv_profiles;
create trigger clv_profiles_touch before update on public.clv_profiles for each row execute function public.clv_touch_updated_at();
drop trigger if exists clv_rooms_touch on public.clv_rooms;
create trigger clv_rooms_touch before update on public.clv_rooms for each row execute function public.clv_touch_updated_at();

-- ---------------------------------------------------------------- indexes
create index if not exists clv_access_log_room_ts_idx on public.clv_access_log using btree (room_id, ts desc);
create index if not exists clv_access_log_user_ts on public.clv_access_log using btree (user_id, ts desc);
create index if not exists clv_access_requests_room on public.clv_access_requests using btree (room_id, status);
create index if not exists clv_audit_created_idx on public.clv_audit using btree (created_at desc);
create index if not exists clv_contract_events_contract on public.clv_contract_events using btree (contract_id, ts desc);
create index if not exists clv_contract_parties_user on public.clv_contract_parties using btree (user_id);
create index if not exists clv_downloads_room_idx on public.clv_downloads using btree (room_id, created_at desc);
create index if not exists clv_downloads_user_idx on public.clv_downloads using btree (user_id, created_at desc);
create index if not exists clv_holdings_product on public.clv_holdings using btree (product_id);
create index if not exists clv_holdings_user on public.clv_holdings using btree (user_id);
create unique index if not exists clv_kyc_events_event_uq on public.clv_kyc_events using btree (provider, event_id);
create index if not exists clv_kyc_events_session_idx on public.clv_kyc_events using btree (session_id);
create index if not exists clv_kyc_events_user_idx on public.clv_kyc_events using btree (user_id, received_at desc);
create index if not exists clv_listings_product on public.clv_listings using btree (product_id, status);
create index if not exists clv_product_access_product on public.clv_product_access using btree (product_id, user_id);
create index if not exists clv_product_access_user on public.clv_product_access using btree (user_id, ts desc);
create index if not exists clv_profiles_kyc_session_idx on public.clv_profiles using btree (kyc_session_id);
create index if not exists clv_profiles_status_idx on public.clv_profiles using btree (status);
create index if not exists clv_room_assignments_user_idx on public.clv_room_assignments using btree (user_id);
create index if not exists clv_signed_documents_user_idx on public.clv_signed_documents using btree (user_id);
create index if not exists clv_subscriptions_product on public.clv_subscriptions using btree (product_id);
create index if not exists clv_subscriptions_user on public.clv_subscriptions using btree (user_id);

-- ---------------------------------------------------------------- row level security
do $$ declare t text; begin
  for t in select tablename from pg_tables where schemaname = 'public' and tablename like 'clv\_%' escape '\' loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

drop policy if exists clv_access_log_admin_read on public.clv_access_log;
create policy clv_access_log_admin_read on public.clv_access_log for select to authenticated using (clv_is_admin());
drop policy if exists clv_access_requests_read on public.clv_access_requests;
create policy clv_access_requests_read on public.clv_access_requests for select to authenticated using ((user_id = (select auth.uid())) or clv_is_admin());
drop policy if exists clv_annex_read on public.clv_room_annex_acceptances;
create policy clv_annex_read on public.clv_room_annex_acceptances for select to authenticated using ((user_id = (select auth.uid())) or clv_is_admin());
drop policy if exists clv_assignments_read on public.clv_room_assignments;
create policy clv_assignments_read on public.clv_room_assignments for select to authenticated using ((user_id = (select auth.uid())) or clv_is_admin());
drop policy if exists clv_audit_admin_read on public.clv_audit;
create policy clv_audit_admin_read on public.clv_audit for select to authenticated using (clv_is_admin());
drop policy if exists clv_companies_read on public.clv_companies;
create policy clv_companies_read on public.clv_companies for select to authenticated using (true);
drop policy if exists clv_downloads_read on public.clv_downloads;
create policy clv_downloads_read on public.clv_downloads for select to authenticated using ((user_id = (select auth.uid())) or clv_is_admin());
drop policy if exists clv_product_events_read on public.clv_product_events;
create policy clv_product_events_read on public.clv_product_events for select to authenticated using (true);
drop policy if exists clv_profiles_read on public.clv_profiles;
create policy clv_profiles_read on public.clv_profiles for select to authenticated using ((id = (select auth.uid())) or clv_is_admin());
drop policy if exists clv_profiles_update_own on public.clv_profiles;
create policy clv_profiles_update_own on public.clv_profiles for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));
drop policy if exists clv_room_files_admin on public.clv_room_files;
create policy clv_room_files_admin on public.clv_room_files for select to authenticated using (clv_is_admin());
drop policy if exists clv_rooms_read on public.clv_rooms;
create policy clv_rooms_read on public.clv_rooms for select to authenticated using (clv_is_admin() or clv_has_room_access(id));
drop policy if exists clv_signed_docs_read on public.clv_signed_documents;
create policy clv_signed_docs_read on public.clv_signed_documents for select to authenticated using ((user_id = (select auth.uid())) or clv_is_admin());

-- ---------------------------------------------------------------- grants
-- Edge functions use the service role; the browser only ever reads (RLS-filtered) and
-- updates its own profile. Everything else is revoked from anon/authenticated.
do $$ declare t text; begin
  for t in select tablename from pg_tables where schemaname = 'public' and tablename like 'clv\_%' escape '\' loop
    execute format('revoke all on table public.%I from anon, authenticated', t);
    execute format('grant select, insert, update, delete on table public.%I to service_role', t);
  end loop;
end $$;
grant usage on sequence public.clv_contract_events_id_seq, public.clv_product_access_id_seq to service_role;
grant select on table
  public.clv_access_log, public.clv_access_requests, public.clv_audit, public.clv_companies, public.clv_downloads,
  public.clv_product_events, public.clv_profiles, public.clv_room_annex_acceptances, public.clv_room_assignments,
  public.clv_room_files, public.clv_rooms, public.clv_signed_documents
  to authenticated;
grant update on table public.clv_profiles to authenticated;
alter default privileges for role postgres in schema public grant select, insert, update, delete on tables to service_role;
