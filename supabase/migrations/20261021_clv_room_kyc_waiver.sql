-- Identity verification (KYC) can be switched off per person per data room by the company running the room
-- ("KYC off" in the admin member list, or when inviting). The person then signs the room's NDA without a prior
-- identity check; the signed copy states that no identity verification was carried out.
alter table public.clv_room_assignments
  add column if not exists kyc_waived boolean not null default false,
  add column if not exists kyc_waived_at timestamptz,
  add column if not exists kyc_waived_by uuid;

comment on column public.clv_room_assignments.kyc_waived is
  'Identity verification not required for this person in this room (set by the company running the room).';
