// supabase/functions/clv-admin-list/index.ts
// Returns every Clavoris profile for the admin console (admin or super only).
// Deploy: supabase functions deploy clv-admin-list --no-verify-jwt
import { adminClient, cors, json, requireAdmin } from "../_shared/clv.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const admin = adminClient();
  const me = await requireAdmin(admin, req);
  if (me instanceof Response) return me;

  const { data, error } = await admin
    .from("clv_profiles")
    .select("id, email, full_name, company, job_title, lang, role, status, kyc_level, kyc_review_answer, kyc_reviewed_at, suspended_at, last_login_at, created_at")
    .order("created_at", { ascending: true });
  if (error) return json({ error: error.message }, 400);
  return json({ ok: true, users: data || [] });
});
