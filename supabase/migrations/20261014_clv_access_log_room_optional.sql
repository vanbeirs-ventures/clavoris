-- Sign-ins are logged in clv_access_log without a data room.
alter table public.clv_access_log alter column room_id drop not null;
