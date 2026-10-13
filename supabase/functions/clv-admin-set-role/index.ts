// supabase/functions/clv-admin-set-role/index.ts
// Change a user's role and/or status. SECURITY:
//   - caller must be admin or super (verified server-side);
//   - only a super-admin may grant or change admin/super roles, or edit a staff account;
//   - nobody can demote or suspend themselves;
//   - feature switches (marketplace, secondary trading, product allowlist) may be set here too;
//   - every change is written to clv_audit.
// Deploy: supabase functions deploy clv-admin-set-role --no-verify-jwt
import { adminClient, audit, cleanFeatures, cors, json, requireAdmin, ROLES, STATUSES } from "../_shared/clv.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method" }, 405);
  const admin = adminClient();
  const me = await requireAdmin(admin, req);
  if (me instanceof Response) return me;

  const body = await req.json().catch(() => ({}));
  const id = String(body.id || "");
  const role = ROLES.includes(body.role) ? body.role : null;
  const status = STATUSES.includes(body.status) ? body.status : null;
  const features = body.features && typeof body.features === "object" ? cleanFeatures(body.features) : null;
  const companyId = body.company_id === undefined ? undefined : (body.company_id ? String(body.company_id) : null); // super only
  if (!id || (!role && !status && !features && companyId === undefined)) return json({ error: "bad-input" }, 400);
  if (companyId !== undefined && me.role !== "super") return json({ error: "forbidden" }, 403);
  if (id === me.id && (role || status)) return json({ error: "self" }, 400);

  const { data: target } = await admin.from("clv_profiles").select("id, email, role, status, features").eq("id", id).single();
  if (!target) return json({ error: "not-found" }, 404);

  const touchesStaff = target.role !== "user" || (role && role !== "user");
  if (touchesStaff && me.role !== "super") return json({ error: "super-only" }, 403);

  const patch: Record<string, unknown> = {};
  if (role && role !== target.role) patch.role = role;
  if (status && status !== target.status) {
    patch.status = status;
    patch.suspended_at = status === "suspended" ? new Date().toISOString() : null;
  }
  if (features) patch.features = features;
  if (companyId !== undefined) patch.company_id = companyId;
  if (!Object.keys(patch).length) return json({ ok: true, unchanged: true });

  const { error } = await admin.from("clv_profiles").update(patch).eq("id", id);
  if (error) return json({ error: error.message }, 400);
  await audit(admin, me, "user-updated", target.email, { from: { role: target.role, status: target.status, features: target.features }, to: patch });
  return json({ ok: true });
});
