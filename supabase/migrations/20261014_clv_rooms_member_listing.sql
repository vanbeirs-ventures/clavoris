-- Invited members see the room in their list (name, type, owner) from the moment they are assigned,
-- also before identity verification. Documents stay gated by clv_has_room_access / the room functions.
create or replace function public.clv_is_room_member(p_room uuid, p_user uuid default auth.uid())
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (select 1 from public.clv_room_assignments a where a.room_id = p_room and a.user_id = p_user and a.revoked_at is null);
$$;
revoke all on function public.clv_is_room_member(uuid, uuid) from public, anon;
grant execute on function public.clv_is_room_member(uuid, uuid) to authenticated;
drop policy if exists clv_rooms_member_list on public.clv_rooms;
create policy clv_rooms_member_list on public.clv_rooms for select to authenticated using (public.clv_is_room_member(id));
