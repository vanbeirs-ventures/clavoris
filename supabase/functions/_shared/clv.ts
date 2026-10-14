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
export type Profile = { id: string; email: string; full_name: string | null; company: string | null; job_title: string | null; legal_rep: boolean | null; company_id: string | null; role: "user" | "admin" | "super"; status: string; lang: string | null; features: Features; sumsub_applicant_id: string | null; kyc_provider: string | null; kyc_session_id: string | null; kyc_reviewed_at: string | null };
export async function requireUser(admin: SupabaseClient, req: Request): Promise<Profile | Response> {
  const jwt = (req.headers.get("authorization") || "").replace("Bearer ", "");
  if (!jwt) return json({ error: "unauthorized" }, 401);
  const { data } = await admin.auth.getUser(jwt);
  const user = data?.user;
  if (!user) return json({ error: "unauthorized" }, 401);
  const { data: p } = await admin.from("clv_profiles").select("id, email, full_name, company, job_title, legal_rep, company_id, role, status, lang, features, sumsub_applicant_id, kyc_provider, kyc_session_id, kyc_reviewed_at").eq("id", user.id).single();
  if (!p || p.status === "suspended" || p.status === "rejected") return json({ error: "forbidden" }, 403);
  if (!p.features || typeof p.features !== "object") p.features = {};
  return p as Profile;
}
export function isStaff(p: { role: string }): boolean { return p.role === "admin" || p.role === "super"; }
// A profile is complete when it carries a real name and, for an organisation account, the role
// and the legal-representative answer (true/false). Same rule as the app's profile form.
export function profileComplete(p: { full_name: string | null; company: string | null; job_title: string | null; legal_rep: boolean | null }): boolean {
  if (!String(p.full_name || "").trim()) return false;
  if (String(p.company || "").trim()) return !!String(p.job_title || "").trim() && typeof p.legal_rep === "boolean";
  return true;
}
// Name comparison for typed signatures: case, accents and extra spaces do not count.
export function sameName(a: string, b: string): boolean {
  const n = (s: string) => String(s || "").normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/\s+/g, " ").trim();
  return n(a) !== "" && n(a) === n(b);
}
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

// HTML alternative of a plain-text mail: paragraphs kept, bare URLs made clickable, and — when a call to
// action is given — its URL rendered as a button with a label ("Click here to activate your account")
// plus the address underneath for clients that strip buttons. Mail clients such as Outlook do not always
// linkify a long plain-text URL with several parameters; the HTML part makes the link reliable.
export type Cta = { url: string; label: string };
const CTA: Record<string, Record<Lang, string>> = {
  activate: { en: "Click here to activate your account", nl: "Klik hier om uw account te activeren", fr: "Cliquez ici pour activer votre compte" },
  reset: { en: "Click here to set a new password", nl: "Klik hier om een nieuw wachtwoord in te stellen", fr: "Cliquez ici pour définir un nouveau mot de passe" },
  fallback: { en: "If the button does not work, copy this address into your browser:", nl: "Werkt de knop niet? Kopieer dan dit adres in uw browser:", fr: "Si le bouton ne fonctionne pas, copiez cette adresse dans votre navigateur :" },
};
export function ctaLabel(lang: Lang | string, key: "activate" | "reset" | "fallback"): string { const L = pickLang(lang); return CTA[key][L] || CTA[key].en; }
export function textToHtml(text: string, cta?: Cta, lang: Lang = "en"): string {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  // The plain-text lead-in "Click here to activate your account:" is replaced by the button itself.
  const norm = (x: string) => x.trim().replace(/\s*:$/, "").toLowerCase();
  const src = text.split("\n");
  const lines = src.map((line, i) => {
    const t = line.trim();
    if (cta && src[i + 1] !== undefined && src[i + 1].trim() === cta.url && norm(t) === norm(cta.label)) return null;
    if (cta && t === cta.url) {
      return `<p style="margin:18px 0"><a href="${esc(cta.url)}" style="display:inline-block;background:#1B3A5C;color:#F5EFE3;text-decoration:none;font-weight:600;padding:12px 22px;border-radius:4px">${esc(cta.label)}</a></p>`
        + `<p style="font-size:12px;color:#6b6b6b;margin:0 0 14px">${esc(ctaLabel(lang, "fallback"))}<br><a href="${esc(cta.url)}" style="color:#1B3A5C;word-break:break-all">${esc(cta.url)}</a></p>`;
    }
    const html = esc(line).replace(/(https?:\/\/[^\s&]+(?:&amp;[^\s&]+)*)/g, (u) => `<a href="${u}" style="color:#1B3A5C;word-break:break-all">${u}</a>`);
    return html === "" ? "" : html;
  }).filter((x) => x !== null);
  const body = lines.join("\n").replace(/\n{2,}/g, "</p><p>").replace(/\n/g, "<br>");
  return `<!doctype html><html><body style="margin:0;padding:24px;background:#F7F3EB;font-family:Helvetica,Arial,sans-serif;font-size:14.5px;line-height:1.6;color:#1f2933">`
    + `<div style="max-width:620px;margin:0 auto;background:#ffffff;border:1px solid #e6dfd1;border-radius:6px;padding:28px 32px">`
    + `<p style="font-size:20px;color:#1B3A5C;margin:0 0 18px"><strong>Clavoris</strong> <span style="color:#B8860B;font-size:12px">· Private investment, enabled</span></p>`
    + `<p>${body}</p></div></body></html>`;
}

export async function sendMail(to: string, subject: string, text: string, lang: Lang | string = "en", cta?: Cta): Promise<boolean> {
  const host = Deno.env.get("CLAVORIS_SMTP_HOST"); if (!host || !to) return false;
  const port = Number(Deno.env.get("CLAVORIS_SMTP_PORT") || 465);
  const user = Deno.env.get("CLAVORIS_SMTP_USER") || MAIL_FROM;
  const pass = Deno.env.get("CLAVORIS_SMTP_PASS") || "";
  const client = new SMTPClient({ connection: { hostname: host, port, tls: port === 465, auth: { username: user, password: pass } } });
  try {
    // The body goes out base64-encoded: the library's own quoted-printable folding drops characters when an
    // encoded byte straddles a line break (e.g. the "." of "clavoris.com" vanished in a footer link).
    const L = pickLang(lang);
    // The invitation's lead-in "Start here:" reads as "Click here to activate your account:" above the link.
    if (cta) text = text.replace(/\n(Start here:|Begin hier:|Commencez ici :)\n/, "\n" + cta.label + (L === "fr" ? " :" : ":") + "\n");
    const body = text + "\n\n" + mailFooter(L);
    await client.send({ from: `Clavoris <${MAIL_FROM}>`, to, replyTo: MAIL_REPLY_TO, subject: encodeSubject(subject), mimeContent: [
      { mimeType: 'text/plain; charset="utf-8"', content: base64Lines(body), transferEncoding: "base64" },
      { mimeType: 'text/html; charset="utf-8"', content: base64Lines(textToHtml(body, cta, L)), transferEncoding: "base64" },
    ] });
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
  const { data: u, error: cErr } = await admin.auth.admin.createUser({ email, password: pw, email_confirm: true, user_metadata: name ? { full_name: name } : {}, app_metadata: { app: "clavoris" } });
  if (!cErr && u?.user) { id = u.user.id; created = true; }
  else if (cErr && /registered|exists|already/i.test(cErr.message)) linked = true; // existing Minerva/Clavoris auth user
  else return { error: cErr?.message || "create-failed" };
  // One-time link; for an existing user this also yields the user id without listing the directory.
  const { data: l, error: lErr } = await admin.auth.admin.generateLink({ type: "recovery", email, options: { redirectTo: APP_URL + "/reset.html" } });
  if (lErr || !l?.user) { if (created && id) await admin.auth.admin.deleteUser(id).catch(() => {}); return { error: lErr?.message || "link-failed" }; }
  id = id || l.user.id;
  const link = l.properties?.hashed_token ? `${APP_URL}/reset.html?token_hash=${encodeURIComponent(l.properties.hashed_token)}&type=recovery&welcome=1` : `${APP_URL}/login.html`;
  const { error: pErr } = await admin.from("clv_profiles").insert({ id, email, full_name: name || (l.user.user_metadata as { full_name?: string } | null)?.full_name || null, company, lang, role, status: "registered" });
  if (pErr) { if (created) await admin.auth.admin.deleteUser(id).catch(() => {}); return { error: pErr.message }; }
  return { id, created, linked, link };
}
