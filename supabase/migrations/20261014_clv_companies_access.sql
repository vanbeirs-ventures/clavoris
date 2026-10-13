-- Platform company accounts, per-room NDA PDF, access end dates with extension requests
-- and expiry reminders.

-- 1. Company accounts: the entities that use Clavoris for data rooms, contract signature and
--    private investments (e.g. Minerva Luxury Motors Holding BV in oprichting). An admin user
--    belongs to one company; a super sees every company.
create table if not exists public.clv_companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  legal_form text,
  country text,
  registration_no text,
  contact_email text,
  created_at timestamptz not null default now(),
  created_by uuid references public.clv_profiles(id)
);
alter table public.clv_companies enable row level security;
grant select on public.clv_companies to authenticated;
create policy clv_companies_read on public.clv_companies for select using (true);

alter table public.clv_profiles add column if not exists company_id uuid references public.clv_companies(id);
alter table public.clv_rooms add column if not exists company_id uuid references public.clv_companies(id);
alter table public.clv_products add column if not exists company_id uuid references public.clv_companies(id);
alter table public.clv_contracts add column if not exists company_id uuid references public.clv_companies(id);

-- 2. NDA per data room: the PDF uploaded by the company admin (stored on Nextcloud under the
--    room folder, _nda/). The signed copy appends a KYC-attested signature page to it.
alter table public.clv_rooms add column if not exists nda_pdf_path text;
alter table public.clv_rooms add column if not exists nda_pdf_name text;
alter table public.clv_rooms add column if not exists nda_pdf_sha256 text;

-- 3. Access end date: reminders (7 days / 24 h) and extension requests.
alter table public.clv_room_assignments add column if not exists reminded_7d_at timestamptz;
alter table public.clv_room_assignments add column if not exists reminded_24h_at timestamptz;

create table if not exists public.clv_access_requests (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.clv_rooms(id) on delete cascade,
  user_id uuid not null references public.clv_profiles(id) on delete cascade,
  requested_until date not null,
  message text,
  status text not null default 'pending' check (status in ('pending','accepted','rejected')),
  decided_by uuid references public.clv_profiles(id),
  decided_at timestamptz,
  decision_note text,
  created_at timestamptz not null default now()
);
create index if not exists clv_access_requests_room on public.clv_access_requests (room_id, status);
alter table public.clv_access_requests enable row level security;
grant select on public.clv_access_requests to authenticated;
create policy clv_access_requests_read on public.clv_access_requests for select using (user_id = (select auth.uid()) or public.clv_is_admin());

notify pgrst, 'reload schema';
