// Shared helpers for the clv-admin-* functions (ported from the Minerva cloud).
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
export const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { ...cors, "content-type": "application/json" } });

export function adminClient(): SupabaseClient {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
}

export type Caller = { id: string; email: string; role: "user" | "admin" | "super" };

// Resolve the caller from the JWT and require a Clavoris admin or super role.
export async function requireAdmin(admin: SupabaseClient, req: Request): Promise<Caller | Response> {
  const jwt = (req.headers.get("authorization") || "").replace("Bearer ", "");
  if (!jwt) return json({ error: "unauthorized" }, 401);
  const { data } = await admin.auth.getUser(jwt);
  const user = data?.user;
  if (!user) return json({ error: "unauthorized" }, 401);
  const { data: p } = await admin.from("clv_profiles").select("role, status").eq("id", user.id).single();
  if (!p || !["admin", "super"].includes(p.role) || p.status === "suspended") return json({ error: "forbidden" }, 403);
  return { id: user.id, email: user.email || "", role: p.role };
}

export async function audit(admin: SupabaseClient, actor: Caller, event_type: string, target: string, detail: Record<string, unknown> = {}) {
  await admin.from("clv_audit").insert({ actor: actor.id, actor_email: actor.email, event_type, target, detail }).then(() => {}, () => {});
}

export const LANGS = ["en", "nl", "fr", "de", "es", "it"];
export const ROLES = ["user", "admin", "super"];
export const STATUSES = ["registered", "kyc_pending", "kyc_retry", "verified", "rejected", "suspended"];
