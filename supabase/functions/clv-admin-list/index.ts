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
    .select("id, email, full_name, company, job_title, lang, role, status, features, company_id, kyc_level, kyc_review_answer, kyc_reviewed_at, suspended_at, last_login_at, created_at, account:clv_companies!clv_profiles_company_id_fkey(name)")
    .order("created_at", { ascending: true });
  if (error) return json({ error: error.message }, 400);
  let users = (data || []).map((u: any) => ({ ...u, company_name: u.account?.name || null, account: undefined }));
  // An admin sees their company's staff and the investors their company onboarded (room members,
  // product subscribers / holders); a super sees everyone.
  if (me.role !== "super") {
    const cid = me.company_id || "";
    const { data: rooms } = await admin.from("clv_rooms").select("id").eq("company_id", cid);
    const { data: prods } = await admin.from("clv_products").select("id").eq("company_id", cid);
    const rids = (rooms || []).map((r: any) => r.id), pids = (prods || []).map((p: any) => p.id);
    const { data: asg } = rids.length ? await admin.from("clv_room_assignments").select("user_id").in("room_id", rids) : { data: [] as any[] };
    const { data: acc } = pids.length ? await admin.from("clv_product_access").select("user_id").in("product_id", pids) : { data: [] as any[] };
    const { data: hold } = pids.length ? await admin.from("clv_holdings").select("user_id").in("product_id", pids) : { data: [] as any[] };
    const ids = new Set<string>([...(asg || []), ...(acc || []), ...(hold || [])].map((x: any) => x.user_id));
    users = users.filter((u: any) => ids.has(u.id) || (u.company_id && u.company_id === cid) || u.id === me.id);
  }
  return json({ ok: true, users, me: { role: me.role, company_id: me.company_id || null } });
});
