-- Official name from the identity verification (KYC). When Didit approves a verification, the given names and
-- family name read from the identity document replace what was pre-filled at the invitation (shown name: first
-- given name + family name) and kyc_name_at is stamped. From then on a signed-in member can no longer change
-- full_name / first_name / last_name: such a change is ignored. The platform (service role) can still update it.
alter table public.clv_profiles add column if not exists kyc_name_at timestamptz;

create or replace function public.clv_profiles_kyc_name_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.kyc_name_at is not null and coalesce(auth.role(), '') in ('authenticated', 'anon') then
    new.full_name := old.full_name;
    new.first_name := old.first_name;
    new.last_name := old.last_name;
    new.kyc_name_at := old.kyc_name_at;
  end if;
  return new;
end $$;

create or replace trigger clv_profiles_kyc_name_guard before update on public.clv_profiles
  for each row execute function public.clv_profiles_kyc_name_guard();
