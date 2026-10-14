-- Users may update their own profile fields from the app (RLS policy clv_profiles_update_own limits
-- the row to auth.uid()). Only these columns: role, status, company_id, KYC fields and features stay
-- writable by the service role (edge functions) only.
grant update (full_name, company, job_title, legal_rep, mobile, lang, notify, last_login_at) on public.clv_profiles to authenticated;
