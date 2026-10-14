-- Profile capacity: a user registers as a private person or under an organisation.
-- With an organisation, the role is mandatory and the user states whether they are a legal
-- representative authorised to sign on behalf of that organisation (legal_rep true/false;
-- null = not yet answered). Enforced in the app (registration, account, NDA step) and in
-- clv-room-nda before a signature is recorded.
alter table public.clv_profiles add column if not exists legal_rep boolean;
comment on column public.clv_profiles.legal_rep is 'Organisation accounts: true = legal representative authorised to sign on behalf of the organisation; false = not authorised; null = not answered (private person or incomplete profile).';

-- Enrolment used to fill full_name with the e-mail local part when the inviter gave no name;
-- those placeholders are not names. Clear them so the user is asked for their name.
update public.clv_profiles set full_name = null where full_name is not null and full_name = split_part(email, '@', 1);
