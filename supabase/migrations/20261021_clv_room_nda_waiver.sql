-- "NDA off" per member and room: the company running the room does not require this member to sign the room's NDA
-- before the documents open. Identity verification is still required unless "KYC off" (kyc_waived) is also set.
alter table public.clv_room_assignments
  add column if not exists nda_waived boolean not null default false,
  add column if not exists nda_waived_at timestamptz,
  add column if not exists nda_waived_by uuid;
comment on column public.clv_room_assignments.nda_waived is '"NDA off": the company running the room does not require this member to sign the room''s NDA before the documents open (identity verification is still required unless kyc_waived).';
