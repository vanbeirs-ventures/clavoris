-- Mandatory visibility choice: a new member must explicitly choose (profile step after setting the
-- password) whether other data-room members see their name or only their member ID. The time of the
-- choice is recorded here; until it is set, the app keeps the member on the profile page.
alter table public.clv_profiles add column if not exists privacy_chosen_at timestamptz;
grant update (privacy_chosen_at) on public.clv_profiles to authenticated;
