-- The room form offers M&A, Financing and Other; the database accepted only 'ma', so saving a room of another
-- type failed on clv_rooms_project_type_check.
alter table public.clv_rooms drop constraint clv_rooms_project_type_check;
alter table public.clv_rooms add constraint clv_rooms_project_type_check check (project_type = any (array['ma'::text, 'financing'::text, 'other'::text]));
