// Shared helpers for the clv-admin-* functions (ported from the Minerva cloud).
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

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

// Resolve the caller from the JWT: any enrolled, non-suspended Clavoris user.
export type Profile = { id: string; email: string; full_name: string | null; company: string | null; role: "user" | "admin" | "super"; status: string; sumsub_applicant_id: string | null; kyc_reviewed_at: string | null };
export async function requireUser(admin: SupabaseClient, req: Request): Promise<Profile | Response> {
  const jwt = (req.headers.get("authorization") || "").replace("Bearer ", "");
  if (!jwt) return json({ error: "unauthorized" }, 401);
  const { data } = await admin.auth.getUser(jwt);
  const user = data?.user;
  if (!user) return json({ error: "unauthorized" }, 401);
  const { data: p } = await admin.from("clv_profiles").select("id, email, full_name, company, role, status, sumsub_applicant_id, kyc_reviewed_at").eq("id", user.id).single();
  if (!p || p.status === "suspended" || p.status === "rejected") return json({ error: "forbidden" }, 403);
  return p as Profile;
}
export function isStaff(p: { role: string }): boolean { return p.role === "admin" || p.role === "super"; }
export function clientIp(req: Request): string { return (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || req.headers.get("cf-connecting-ip") || ""; }

export async function audit(admin: SupabaseClient, actor: Caller, event_type: string, target: string, detail: Record<string, unknown> = {}) {
  await admin.from("clv_audit").insert({ actor: actor.id, actor_email: actor.email, event_type, target, detail }).then(() => {}, () => {});
}

export const LANGS = ["en", "nl", "fr", "de", "es", "it"];
export const ROLES = ["user", "admin", "super"];
export const STATUSES = ["registered", "kyc_pending", "kyc_retry", "verified", "rejected", "suspended"];

// ---- outbound mail: always from the Clavoris no-reply sender ----
// Secrets: CLAVORIS_SMTP_HOST, CLAVORIS_SMTP_PORT (465), CLAVORIS_SMTP_USER, CLAVORIS_SMTP_PASS,
// optional CLAVORIS_MAIL_FROM (default noreply@clavoris.com), CLAVORIS_APP_URL.
export const MAIL_FROM = Deno.env.get("CLAVORIS_MAIL_FROM") || "noreply@clavoris.com";
export const MAIL_REPLY_TO = "access@clavoris.com";
export const APP_URL = (Deno.env.get("CLAVORIS_APP_URL") || "https://www.clavoris.com/app").replace(/\/$/, "");
export const MAIL_SIGNATURE = "Clavoris · Keys to institutional capital\nAntwerp · Luxembourg · Nordic\n\nThis mailbox is not monitored. For assistance write to access@clavoris.com.";

export function mailConfigured(): boolean { return !!Deno.env.get("CLAVORIS_SMTP_HOST"); }

export async function sendMail(to: string, subject: string, text: string): Promise<boolean> {
  const host = Deno.env.get("CLAVORIS_SMTP_HOST"); if (!host) return false;
  const port = Number(Deno.env.get("CLAVORIS_SMTP_PORT") || 465);
  const user = Deno.env.get("CLAVORIS_SMTP_USER") || MAIL_FROM;
  const pass = Deno.env.get("CLAVORIS_SMTP_PASS") || "";
  const client = new SMTPClient({ connection: { hostname: host, port, tls: port === 465, auth: { username: user, password: pass } } });
  try {
    await client.send({ from: `Clavoris <${MAIL_FROM}>`, to, replyTo: MAIL_REPLY_TO, subject, content: text + "\n\n" + MAIL_SIGNATURE });
    return true;
  } finally { try { await client.close(); } catch { /* ignore */ } }
}
