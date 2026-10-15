-- Per-user exemption from the second factor, set only by an operator (users have no update grant on it).
-- Applied 15 Oct 2026; s.vanbeirs@vanbeirsventures.com exempted at the owner's request (audit: mfa-exempted).
-- To re-enable 2FA for a user: update public.clv_profiles set mfa_exempt = false where email = '...';
alter table public.clv_profiles add column if not exists mfa_exempt boolean not null default false;

create or replace function public.clv_mfa_ok_for(p_user uuid, p_session uuid, p_aal text, p_amr jsonb)
 returns boolean
 language sql
 stable security definer
 set search_path to 'public', 'auth'
as $function$
  select p_user is not null and (
    coalesce(p_aal, '') = 'aal2'
    or exists (select 1 from public.clv_profiles pr where pr.id = p_user and pr.mfa_exempt)
    or exists (select 1 from public.clv_mfa_sessions s where s.session_id = p_session and s.user_id = p_user)
    or (
      exists (select 1 from jsonb_array_elements(case when jsonb_typeof(p_amr) = 'array' then p_amr else '[]'::jsonb end) e
               where e->>'method' in ('otp', 'recovery', 'magiclink', 'invite'))
      and not exists (select 1 from auth.mfa_factors f where f.user_id = p_user and f.status = 'verified')
    )
  );
$function$;
