-- Two-factor sign-in for Clavoris.
-- Every sign-in needs a second factor: a 6-digit code e-mailed to the user, or — when the user has
-- activated it on the account page — a Google Authenticator (TOTP) code (Supabase MFA, session aal2).
-- An e-mailed code verified for a session is recorded in clv_mfa_sessions (keyed by the JWT session_id).
-- A session opened from an e-mailed link (password recovery / invitation) already proves possession of
-- the mailbox and counts as e-mail-verified, unless the user has an authenticator app (then aal2 needed).
-- Enforcement: clv_mfa_ok() is part of every RLS read of personal or room data and of clv_is_admin(),
-- and the edge functions check the same rule (clv_mfa_ok_for) before doing anything for the caller.

create table if not exists public.clv_mfa_codes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null,
  code_hash text not null,
  expires_at timestamptz not null,
  attempts int not null default 0,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists clv_mfa_codes_user_idx on public.clv_mfa_codes (user_id, created_at desc);
alter table public.clv_mfa_codes enable row level security;  -- service role only

create table if not exists public.clv_mfa_sessions (
  session_id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  method text not null,
  verified_at timestamptz not null default now()
);
alter table public.clv_mfa_sessions enable row level security;  -- service role only

-- Reminder to activate the authenticator app: every 10 sign-ins or 30 days; "don't remind me again"
-- pauses it for 6 months, after which the cycle starts again.
alter table public.clv_profiles
  add column if not exists mfa_logins_since_reminder int not null default 0,
  add column if not exists mfa_reminded_at timestamptz,
  add column if not exists mfa_snooze_until timestamptz;

create or replace function public.clv_mfa_ok_for(p_user uuid, p_session uuid, p_aal text, p_amr jsonb)
returns boolean language sql stable security definer set search_path = public, auth as $$
  select p_user is not null and (
    coalesce(p_aal, '') = 'aal2'
    or exists (select 1 from public.clv_mfa_sessions s where s.session_id = p_session and s.user_id = p_user)
    or (
      exists (select 1 from jsonb_array_elements(case when jsonb_typeof(p_amr) = 'array' then p_amr else '[]'::jsonb end) e
               where e->>'method' in ('otp', 'recovery', 'magiclink', 'invite'))
      and not exists (select 1 from auth.mfa_factors f where f.user_id = p_user and f.status = 'verified')
    )
  );
$$;
revoke all on function public.clv_mfa_ok_for(uuid, uuid, text, jsonb) from public, anon, authenticated;

create or replace function public.clv_mfa_ok()
returns boolean language sql stable security definer set search_path = public as $$
  select public.clv_mfa_ok_for(auth.uid(), nullif(auth.jwt()->>'session_id', '')::uuid, auth.jwt()->>'aal', auth.jwt()->'amr');
$$;

-- Admin rights and room access only count for a session that passed the second factor.
create or replace function public.clv_is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.clv_profiles
                 where id = auth.uid() and role in ('admin','super') and status <> 'suspended')
     and public.clv_mfa_ok();
$$;

create or replace function public.clv_has_room_access(p_room uuid, p_user uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.clv_room_assignments a
      join public.clv_rooms r on r.id = a.room_id and r.status = 'open'
      join public.clv_profiles p on p.id = a.user_id and p.status = 'verified'
     where a.room_id = p_room and a.user_id = p_user
       and a.revoked_at is null and (a.expires_at is null or a.expires_at > now()))
     and public.clv_mfa_ok();
$$;

create or replace function public.clv_is_room_member(p_room uuid, p_user uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.clv_room_assignments a where a.room_id = p_room and a.user_id = p_user and a.revoked_at is null)
     and public.clv_mfa_ok();
$$;

-- Own-row reads of personal data need the second factor too (the own profile row stays readable so the
-- sign-in page can show who is signing in; changing it needs the second factor).
drop policy if exists clv_access_requests_read on public.clv_access_requests;
create policy clv_access_requests_read on public.clv_access_requests for select to authenticated
  using (((user_id = (select auth.uid())) and public.clv_mfa_ok()) or public.clv_is_admin());
drop policy if exists clv_downloads_read on public.clv_downloads;
create policy clv_downloads_read on public.clv_downloads for select to authenticated
  using (((user_id = (select auth.uid())) and public.clv_mfa_ok()) or public.clv_is_admin());
drop policy if exists clv_annex_read on public.clv_room_annex_acceptances;
create policy clv_annex_read on public.clv_room_annex_acceptances for select to authenticated
  using (((user_id = (select auth.uid())) and public.clv_mfa_ok()) or public.clv_is_admin());
drop policy if exists clv_assignments_read on public.clv_room_assignments;
create policy clv_assignments_read on public.clv_room_assignments for select to authenticated
  using (((user_id = (select auth.uid())) and public.clv_mfa_ok()) or public.clv_is_admin());
drop policy if exists clv_signed_docs_read on public.clv_signed_documents;
create policy clv_signed_docs_read on public.clv_signed_documents for select to authenticated
  using (((user_id = (select auth.uid())) and public.clv_mfa_ok()) or public.clv_is_admin());
drop policy if exists clv_profiles_update_own on public.clv_profiles;
create policy clv_profiles_update_own on public.clv_profiles for update to authenticated
  using ((id = (select auth.uid())) and public.clv_mfa_ok()) with check (id = (select auth.uid()));
