-- Standing countersignature of the Disclosing Party on a data room's NDA.
-- An administrator of the company that runs the room, identity-verified, signs once per room and NDA
-- version; that signature is added to every copy of that version signed by members of the room
-- (also to copies signed before it, as a separate countersigned copy next to the original).
create table if not exists public.clv_nda_countersignatures (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.clv_rooms(id) on delete cascade,
  company_id uuid references public.clv_companies(id),
  versions jsonb not null,                -- [{ "version": "v…", "sha256": "…" }] covered by this signature
  signer_id uuid not null references public.clv_profiles(id),
  signer_email text not null,
  typed_name text not null,
  capacity text not null,
  kyc_provider text, kyc_session_id text, kyc_reviewed_at timestamptz,
  ip text, user_agent text,
  signed_at timestamptz not null default now(),
  revoked_at timestamptz, revoked_by uuid
);
create index if not exists clv_nda_countersignatures_room on public.clv_nda_countersignatures (room_id) where revoked_at is null;
alter table public.clv_nda_countersignatures enable row level security;  -- server-side access only

alter table public.clv_signed_documents add column if not exists countersigned_path text;
alter table public.clv_signed_documents add column if not exists countersigned_at timestamptz;
alter table public.clv_signed_documents add column if not exists countersignature_id uuid references public.clv_nda_countersignatures(id);
