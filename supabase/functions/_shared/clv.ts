// Shared helpers for the clv-admin-* functions (ported from the Minerva cloud).
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";
import { type Lang, pickLang } from "./mail-i18n.ts";

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

export type Caller = { id: string; email: string; role: "user" | "admin" | "super"; company_id?: string | null };

// Resolve the caller from the JWT and require a Clavoris admin or super role.
export async function requireAdmin(admin: SupabaseClient, req: Request): Promise<Caller | Response> {
  const jwt = (req.headers.get("authorization") || "").replace("Bearer ", "");
  if (!jwt) return json({ error: "unauthorized" }, 401);
  const { data } = await admin.auth.getUser(jwt);
  const user = data?.user;
  if (!user) return json({ error: "unauthorized" }, 401);
  const { data: p } = await admin.from("clv_profiles").select("role, status, company_id").eq("id", user.id).single();
  if (!p || !["admin", "super"].includes(p.role) || p.status === "suspended") return json({ error: "forbidden" }, 403);
  return { id: user.id, email: user.email || "", role: p.role, company_id: p.company_id || null };
}

// Resolve the caller from the JWT: any enrolled, non-suspended Clavoris user.
export type Features = { market?: boolean; trading?: boolean; products?: string[] | null };
export type Profile = { id: string; email: string; full_name: string | null; company: string | null; company_id: string | null; role: "user" | "admin" | "super"; status: string; lang: string | null; features: Features; sumsub_applicant_id: string | null; kyc_provider: string | null; kyc_session_id: string | null; kyc_reviewed_at: string | null };
export async function requireUser(admin: SupabaseClient, req: Request): Promise<Profile | Response> {
  const jwt = (req.headers.get("authorization") || "").replace("Bearer ", "");
  if (!jwt) return json({ error: "unauthorized" }, 401);
  const { data } = await admin.auth.getUser(jwt);
  const user = data?.user;
  if (!user) return json({ error: "unauthorized" }, 401);
  const { data: p } = await admin.from("clv_profiles").select("id, email, full_name, company, company_id, role, status, lang, features, sumsub_applicant_id, kyc_provider, kyc_session_id, kyc_reviewed_at").eq("id", user.id).single();
  if (!p || p.status === "suspended" || p.status === "rejected") return json({ error: "forbidden" }, 403);
  if (!p.features || typeof p.features !== "object") p.features = {};
  return p as Profile;
}
export function isStaff(p: { role: string }): boolean { return p.role === "admin" || p.role === "super"; }
// Company scoping: a super sees everything (null = no filter); an admin only their own company's
// rooms, products and contracts. Returns the company id to filter on, or null for no filter.
export function companyScope(p: { role: string; company_id?: string | null }): string | null { return p.role === "super" ? null : (p.company_id || "00000000-0000-0000-0000-000000000000"); }
export function inScope(p: { role: string; company_id?: string | null }, companyId: string | null | undefined): boolean { const s = companyScope(p); return s === null || s === companyId; }
export function fmtDay(d: string | Date | null | undefined, lang = "en"): string { if (!d) return "—"; try { return new Date(d).toLocaleDateString(lang === "en" ? "en-GB" : lang + "-BE", { year: "numeric", month: "long", day: "numeric" }); } catch { return String(d).slice(0, 10); } }
// Normalise a feature object coming from the admin console.
export function cleanFeatures(f: unknown): Features {
  const o = (f && typeof f === "object" ? f : {}) as Record<string, unknown>;
  const products = Array.isArray(o.products) ? o.products.map(String).filter((x) => /^[0-9a-f-]{36}$/.test(x)).slice(0, 200) : null;
  return { market: !!o.market, trading: !!o.trading, products };
}
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
export const SITE_URL = APP_URL.replace(/\/app$/, "");
// Footer under every automated mail: signature, assistance address, notification settings /
// unsubscribe (lands on the sign-in page; after sign-in the app offers the notification settings)
// and the privacy policy.
const FOOTER: Record<Lang, string> = {
  en: "Clavoris · Private investment, enabled\nAntwerp · Luxembourg\n\nThis mailbox is not monitored. For assistance write to access@clavoris.com.\nManage your e-mail notifications or unsubscribe: {unsub}\nPrivacy policy: {privacy}",
  nl: "Clavoris · Private investeringen, mogelijk gemaakt\nAntwerpen · Luxemburg\n\nDeze mailbox wordt niet gelezen. Voor hulp schrijft u naar access@clavoris.com.\nE-mailmeldingen beheren of uitschrijven: {unsub}\nPrivacybeleid: {privacy}",
  fr: "Clavoris · L'investissement privé, rendu possible\nAnvers · Luxembourg\n\nCette boîte n'est pas surveillée. Pour toute assistance, écrivez à access@clavoris.com.\nGérer vos notifications par e-mail ou vous désinscrire : {unsub}\nPolitique de confidentialité : {privacy}",
};
export function mailFooter(lang: Lang): string { return FOOTER[lang].replace("{unsub}", `${APP_URL}/login.html?unsubscribe=1`).replace("{privacy}", `${SITE_URL}/privacy.html`); }
export const MAIL_SIGNATURE = mailFooter("en");

export function mailConfigured(): boolean { return !!Deno.env.get("CLAVORIS_SMTP_HOST"); }

// Subject header. The mail library re-encodes any subject that contains non-ASCII characters or starts
// with "=?" as one long quoted-printable word folded with soft line breaks, which breaks the header block
// in most receivers (the remaining headers then show up in the body). So: keep the leading ASCII part as
// plain text and encode only the rest as RFC 2047 base64 words; the result is pure ASCII and never starts
// with "=?", so the library passes it through untouched.
export function encodeSubject(s: string): string {
  const str = String(s || "").replace(/[\r\n]+/g, " ").trim();
  if (/^[\x20-\x7e]*$/.test(str)) return str;
  const ascii = /^[\x20-\x7e]*/.exec(str)![0];
  let head = ascii.slice(0, ascii.lastIndexOf(" ") + 1).replace(/\s+$/, ""); // cut at a word boundary
  let rest = str.slice(head.length).replace(/^\s+/, "");
  if (!head) { head = "Clavoris:"; rest = rest.replace(/^Clavoris\s*:?\s*/i, ""); }
  const bytes = new TextEncoder().encode(rest);
  const words: string[] = [];
  for (let i = 0; i < bytes.length;) {
    let end = Math.min(bytes.length, i + 33);
    while (end < bytes.length && (bytes[end] & 0xc0) === 0x80) end--; // do not split a UTF-8 sequence
    words.push("=?utf-8?B?" + btoa(String.fromCharCode(...bytes.subarray(i, end))) + "?=");
    i = end;
  }
  return head + " " + words.join(" ");
}

// Base64 of a UTF-8 string, folded into 76-character lines (RFC 2045).
export function base64Lines(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = ""; for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return (btoa(bin).match(/.{1,76}/g) || []).join("\r\n");
}

export async function sendMail(to: string, subject: string, text: string, lang: Lang | string = "en"): Promise<boolean> {
  const host = Deno.env.get("CLAVORIS_SMTP_HOST"); if (!host || !to) return false;
  const port = Number(Deno.env.get("CLAVORIS_SMTP_PORT") || 465);
  const user = Deno.env.get("CLAVORIS_SMTP_USER") || MAIL_FROM;
  const pass = Deno.env.get("CLAVORIS_SMTP_PASS") || "";
  const client = new SMTPClient({ connection: { hostname: host, port, tls: port === 465, auth: { username: user, password: pass } } });
  try {
    // The body goes out base64-encoded: the library's own quoted-printable folding drops characters when an
    // encoded byte straddles a line break (e.g. the "." of "clavoris.com" vanished in a footer link).
    const body = text + "\n\n" + mailFooter(pickLang(lang));
    await client.send({ from: `Clavoris <${MAIL_FROM}>`, to, replyTo: MAIL_REPLY_TO, subject: encodeSubject(subject), mimeContent: [{ mimeType: 'text/plain; charset="utf-8"', content: base64Lines(body), transferEncoding: "base64" }] });
    return true;
  } finally { try { await client.close(); } catch { /* ignore */ } }
}

// ---- enrolment on the shared user directory ----
// The Supabase project is shared with the Minerva cloud: one auth user per e-mail address.
// A Clavoris enrolment therefore either creates the auth user (new to both platforms) or
// attaches a Clavoris profile to an existing user (who keeps their existing password).
// Returns the activation link to send: a one-time recovery link lands on reset.html.
export type Enrolled = { id: string; created: boolean; linked: boolean; link: string };
export async function enrolUser(admin: SupabaseClient, email: string, name: string, company: string | null, lang = "en", role: "user" | "admin" = "user"): Promise<Enrolled | { error: string }> {
  const { data: existing } = await admin.from("clv_profiles").select("id, status").eq("email", email).maybeSingle();
  if (existing) return { error: "already-enrolled" };
  let id: string | null = null, created = false, linked = false;
  const pw = Array.from(crypto.getRandomValues(new Uint8Array(24))).map((b) => "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789".charAt(b % 54)).join("");
  const { data: u, error: cErr } = await admin.auth.admin.createUser({ email, password: pw, email_confirm: true, user_metadata: { full_name: name }, app_metadata: { app: "clavoris" } });
  if (!cErr && u?.user) { id = u.user.id; created = true; }
  else if (cErr && /registered|exists|already/i.test(cErr.message)) linked = true; // existing Minerva/Clavoris auth user
  else return { error: cErr?.message || "create-failed" };
  // One-time link; for an existing user this also yields the user id without listing the directory.
  const { data: l, error: lErr } = await admin.auth.admin.generateLink({ type: "recovery", email, options: { redirectTo: APP_URL + "/reset.html" } });
  if (lErr || !l?.user) { if (created && id) await admin.auth.admin.deleteUser(id).catch(() => {}); return { error: lErr?.message || "link-failed" }; }
  id = id || l.user.id;
  const link = l.properties?.hashed_token ? `${APP_URL}/reset.html?token_hash=${encodeURIComponent(l.properties.hashed_token)}&type=recovery&welcome=1` : `${APP_URL}/login.html`;
  const { error: pErr } = await admin.from("clv_profiles").insert({ id, email, full_name: name || (l.user.user_metadata as { full_name?: string } | null)?.full_name || email.split("@")[0], company, lang, role, status: "registered" });
  if (pErr) { if (created) await admin.auth.admin.deleteUser(id).catch(() => {}); return { error: pErr.message }; }
  return { id, created, linked, link };
}
