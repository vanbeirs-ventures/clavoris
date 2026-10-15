-- Data-room member visibility. By default every member of a data room sees the other members' names and
-- organisations. A member who chooses private participation (profile form at registration, changeable
-- later) is shown to the other investors as "Private member"; the company running the room (admins,
-- staff) still sees who it is.
alter table public.clv_profiles add column if not exists member_private boolean not null default false;
grant update (member_private) on public.clv_profiles to authenticated;
