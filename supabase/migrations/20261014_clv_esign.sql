-- Contracts: qualified signatures via e-Signature.eu (replaces the Sumsub e-sign step).
-- One e-Signature.eu request per contract (all signatories declared at launch, embedded mode);
-- Clavoris keeps the signing order by only handing the signing link to the signatory whose turn it is.
alter table public.clv_contracts
  add column if not exists esign_id_sign text,
  add column if not exists esign_status text,
  add column if not exists esign_doc_name text,
  add column if not exists esign_synced_at timestamptz,
  add column if not exists audit_trail_path text;
create index if not exists clv_contracts_esign_id_sign_idx on public.clv_contracts (esign_id_sign);

alter table public.clv_contract_parties
  add column if not exists esign_signer_no integer,
  add column if not exists esign_signature_link text,
  add column if not exists esign_method text;

notify pgrst, 'reload schema';
