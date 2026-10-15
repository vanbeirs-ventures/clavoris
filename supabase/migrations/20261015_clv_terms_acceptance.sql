-- Acceptance of the General Terms and Conditions (terms.html). Every user accepts the current version
-- once (with the profile, before identity verification); a new version is asked again at next sign-in.
-- Written only by the edge function clv-account (action "accept_terms"), which also logs it in clv_audit
-- with the IP address; not in the column grants of authenticated.
alter table clv_profiles add column if not exists terms_version text;
alter table clv_profiles add column if not exists terms_accepted_at timestamptz;
