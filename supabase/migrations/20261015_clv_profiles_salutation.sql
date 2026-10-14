-- Optional addressing set when a company invites someone to a data room: Mr / Mrs, first and last name.
-- When salutation and last_name are present, automated mails open with "Dear Mr <last name>,".
alter table public.clv_profiles
  add column if not exists salutation text check (salutation in ('mr', 'mrs')),
  add column if not exists first_name text,
  add column if not exists last_name text;
