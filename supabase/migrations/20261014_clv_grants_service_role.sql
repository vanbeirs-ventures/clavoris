-- Service-role access to the tables added on 2026-10-14 (edge functions use the service key);
-- anon gets nothing, authenticated keeps read-only via RLS as on the other clv_ tables.
-- Applied to the project on 2026-10-14 (the admin console failed with "permission denied for table clv_companies").
grant select, insert, update, delete on table public.clv_companies, public.clv_access_requests, public.clv_room_files, public.clv_product_events to service_role;
revoke all on table public.clv_companies, public.clv_access_requests, public.clv_room_files, public.clv_product_events from anon;
-- Future clv_ tables created by postgres get the same grants automatically.
alter default privileges for role postgres in schema public grant select, insert, update, delete on tables to service_role;
