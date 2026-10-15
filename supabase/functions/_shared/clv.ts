// Shared helpers for the clv-admin-* functions (ported from the Minerva cloud).
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { smtpSend } from "./smtp.ts";
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

// ---- two-factor sign-in ----
// Claims of a JWT that auth.getUser() has already validated (session_id, aal, amr).
export function jwtClaims(jwt: string): Record<string, any> {
  try { const b = jwt.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"); return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(b + "===".slice((b.length + 3) % 4)), (c) => c.charCodeAt(0)))); } catch { return {}; }
}
// Has this session passed the second factor? Same rule as the database (clv_mfa_ok_for): authenticator
// code (aal2), an e-mailed code verified for this session, or a session opened from an e-mailed link.
export async function mfaOk(admin: SupabaseClient, jwt: string, userId: string): Promise<boolean> {
  const c = jwtClaims(jwt);
  const { data, error } = await admin.rpc("clv_mfa_ok_for", { p_user: userId, p_session: c.session_id || null, p_aal: c.aal || null, p_amr: c.amr || [] });
  if (error) { console.error("mfa check:", error.message); return false; }
  return data === true;
}
export type AuthOpts = { mfa?: boolean };
const MFA_REQUIRED = () => json({ error: "mfa-required" }, 401);

// Resolve the caller from the JWT and require a Clavoris admin or super role (and the second factor).
export async function requireAdmin(admin: SupabaseClient, req: Request, opts: AuthOpts = {}): Promise<Caller | Response> {
  const jwt = (req.headers.get("authorization") || "").replace("Bearer ", "");
  if (!jwt) return json({ error: "unauthorized" }, 401);
  const { data } = await admin.auth.getUser(jwt);
  const user = data?.user;
  if (!user) return json({ error: "unauthorized" }, 401);
  const { data: p } = await admin.from("clv_profiles").select("role, status, company_id").eq("id", user.id).single();
  if (!p || !["admin", "super"].includes(p.role) || p.status === "suspended") return json({ error: "forbidden" }, 403);
  if (opts.mfa !== false && !(await mfaOk(admin, jwt, user.id))) return MFA_REQUIRED();
  return { id: user.id, email: user.email || "", role: p.role, company_id: p.company_id || null };
}

// Resolve the caller from the JWT: any enrolled, non-suspended Clavoris user.
export type Features = { market?: boolean; trading?: boolean; products?: string[] | null };
export type Profile = { id: string; email: string; full_name: string | null; company: string | null; job_title: string | null; legal_rep: boolean | null; company_id: string | null; role: "user" | "admin" | "super"; status: string; lang: string | null; features: Features; sumsub_applicant_id: string | null; kyc_provider: string | null; kyc_session_id: string | null; kyc_reviewed_at: string | null };
export async function requireUser(admin: SupabaseClient, req: Request, opts: AuthOpts = {}): Promise<Profile | Response> {
  const jwt = (req.headers.get("authorization") || "").replace("Bearer ", "");
  if (!jwt) return json({ error: "unauthorized" }, 401);
  const { data } = await admin.auth.getUser(jwt);
  const user = data?.user;
  if (!user) return json({ error: "unauthorized" }, 401);
  const { data: p } = await admin.from("clv_profiles").select("id, email, full_name, company, job_title, legal_rep, company_id, role, status, lang, features, sumsub_applicant_id, kyc_provider, kyc_session_id, kyc_reviewed_at").eq("id", user.id).single();
  if (!p || p.status === "suspended" || p.status === "rejected") return json({ error: "forbidden" }, 403);
  if (opts.mfa !== false && !(await mfaOk(admin, jwt, user.id))) return MFA_REQUIRED();
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
// Footer under every automated mail: signature, locations, assistance address, notification settings /
// unsubscribe (lands on the sign-in page; after sign-in the app offers the notification settings) and the
// privacy policy. Plain text carries the addresses; the HTML version links the words themselves.
type FooterParts = { tag: string; loc: string; help: string; notif: string; unsub: string; privacy: string };
const FOOTER_PARTS: Record<Lang, FooterParts> = {
  en: { tag: "Private investment, enabled", loc: "Antwerp · Luxembourg", help: "This mailbox is not monitored. For assistance write to access@clavoris.com.", notif: "Manage e-mail notifications", unsub: "Unsubscribe", privacy: "Privacy policy" },
  nl: { tag: "Private investeringen, mogelijk gemaakt", loc: "Antwerpen · Luxemburg", help: "Deze mailbox wordt niet gelezen. Voor hulp schrijft u naar access@clavoris.com.", notif: "E-mailmeldingen beheren", unsub: "Uitschrijven", privacy: "Privacybeleid" },
  fr: { tag: "L'investissement privé, rendu possible", loc: "Anvers · Luxembourg", help: "Cette boîte n'est pas surveillée. Pour toute assistance, écrivez à access@clavoris.com.", notif: "Gérer les notifications par e-mail", unsub: "Se désinscrire", privacy: "Politique de confidentialité" },
};
const UNSUB_URL = () => `${APP_URL}/login.html?unsubscribe=1`;
const PRIVACY_URL = () => `${SITE_URL}/privacy.html`;
export function mailFooter(lang: Lang): string {
  const f = FOOTER_PARTS[lang] || FOOTER_PARTS.en;
  return `____________________\n\nClavoris · ${f.tag}\n${f.loc}\n\n${f.help}\n${f.unsub} / ${f.notif.toLowerCase()}: ${UNSUB_URL()}\n${f.privacy}: ${PRIVACY_URL()}`;
}
export const MAIL_SIGNATURE = mailFooter("en");

export function mailConfigured(): boolean { return !!Deno.env.get("CLAVORIS_SMTP_HOST"); }
// Branded HTML + plain text (multipart/alternative). App mail goes out through Brevo (smtp-relay.brevo.com),
// not mailbox.org, whose outgoing filter silently dropped it. Set CLAVORIS_MAIL_HTML=0 for plain text only.
const MAIL_HTML = Deno.env.get("CLAVORIS_MAIL_HTML") !== "0";

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
const OPEN_ROOM: Record<string, string> = { en: "Click here to open the data room:", nl: "Klik hier om de dataroom te openen:", fr: "Cliquez ici pour ouvrir la data room :" };
const CLICK_HERE: Record<string, string> = { en: "Click here", nl: "Klik hier", fr: "Cliquez ici" };
const FONT_UI = "Poppins,'Helvetica Neue',Helvetica,Arial,sans-serif";
const FONT_DISPLAY = "'EB Garamond',Garamond,Georgia,'Times New Roman',serif";
const FROM_CAPTION: Record<string, string> = { en: "Message from", nl: "Bericht van", fr: "Message de" };
export function textToHtml(text: string, cta?: Cta | Cta[], lang: Lang = "en"): string {
  // One call to action gets the button plus the copyable address; several (e.g. Accept / Decline) get buttons only.
  const ctas: Cta[] = !cta ? [] : Array.isArray(cta) ? cta : [cta];
  const single = ctas.length === 1;
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const link = (href: string, label: string) => `<a href="${esc(href)}" style="color:#1A3A5C;text-decoration:underline">${esc(label)}</a>`;
  // The plain-text lead-in ("Click here to activate your account:") is replaced by the button itself.
  const norm = (x: string) => x.trim().replace(/\s*:$/, "").toLowerCase();
  let src = text.replace(/\r/g, "").split("\n");
  // Sender line ("Message from <company>") is shown as a caption under the logo.
  let sender = "";
  const fm = (src[0] || "").match(/^(Message from|Bericht van|Message de) (.+)$/);
  if (fm) { sender = fm[2].trim(); src = src.slice(1); while (src.length && !src[0].trim()) src.shift(); }
  // The data room named in the mail ("Minerva Luxury Motors 1" / « … »), used as the link text.
  const rm = text.match(/"([^"\n]{2,120})"|«\s*([^»\n]{2,120}?)\s*»/);
  const roomName = rm ? (rm[1] || rm[2] || "").trim() : "";
  const blocks: string[] = [];
  let para: string[] = [];
  const flush = () => { if (para.length) { blocks.push(`<p style="margin:0 0 20px;font-family:${FONT_UI};font-size:15px;line-height:1.7;color:#1F2933">${para.join("<br>")}</p>`); para = []; } };
  src.forEach((line, i) => {
    const t = line.trim();
    const nextCta = src[i + 1] !== undefined ? ctas.find((c) => c.url === src[i + 1].trim()) : undefined;
    if (nextCta && norm(t) === norm(nextCta.label)) return;
    const c = ctas.find((x) => x.url === t);
    if (c) {
      const cta = c;
      flush();
      // "Bulletproof" button: the padding sits on the table cell (Outlook ignores padding on links).
      blocks.push(`<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:6px ${single ? "0 14px" : "10px 14px 0"};display:inline-table"><tr>`
        + `<td align="center" bgcolor="#1A3A5C" style="background:#1A3A5C;border-radius:3px;padding:12px 26px;mso-padding-alt:12px 26px">`
        + `<a href="${esc(cta.url)}" target="_blank" style="display:inline-block;font-family:${FONT_UI};font-size:14px;font-weight:500;line-height:20px;letter-spacing:.03em;color:#F7F3EC;text-decoration:none"><span style="color:#F7F3EC">${esc(cta.label)}</span></a>`
        + `</td></tr></table>`
        + (!single ? "" : `<p style="margin:22px 0 26px;font-family:${FONT_UI};font-size:12px;line-height:1.6;color:#6E83A0">${esc(ctaLabel(lang, "fallback"))}<br><a href="${esc(cta.url)}" style="color:#6E83A0;word-break:break-all">${esc(cta.url)}</a></p>`));
      return;
    }
    if (!t) { flush(); return; }
    // A one-time code (a line holding only 6 digits) stands out: large, spaced digits in a framed box.
    if (/^\d{6}$/.test(t)) {
      flush();
      blocks.push(`<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 24px"><tr>`
        + `<td align="center" bgcolor="#F7F3EC" style="background:#F7F3EC;border:1px solid #E6DFD1;border-top:3px solid #B8860B;border-radius:6px;padding:18px 30px">`
        + `<span style="font-family:'SFMono-Regular',Menlo,Consolas,'Courier New',monospace;font-size:38px;line-height:44px;font-weight:700;letter-spacing:12px;color:#1A3A5C;white-space:nowrap">${t}</span>`
        + `</td></tr></table>`);
      return;
    }
    // A bare address on its own line is never shown as such: the lead-in line above it becomes the link
    // ("Sign in to Clavoris" underlined) and a data-room address reads "Click here to open the data room:
    // <room name>" with the room name as the link. The plain-text part keeps the address.
    if (/^https?:\/\/\S+$/.test(t)) {
      const lead = para.length && /:\s*$/.test(src[i - 1] || "") ? para.pop()! : "";
      const room = /\/room\.html\?id=/.test(t) ? roomName : "";
      if (room) para.push(esc(OPEN_ROOM[lang] || OPEN_ROOM.en) + " " + `<a href="${esc(t)}" style="color:#1A3A5C;text-decoration:underline;font-weight:600">${esc(room)}</a>`);
      else if (lead) para.push(`<a href="${esc(t)}" style="color:#1A3A5C;text-decoration:underline">${lead.replace(/\s*:\s*$/, "")}</a>`);
      else para.push(link(t, CLICK_HERE[lang] || CLICK_HERE.en));
      return;
    }
    para.push(esc(line).replace(/(https?:\/\/[^\s&]+(?:&amp;[^\s&]+)*)/g, (u) => link(u.replace(/&amp;/g, "&"), u.replace(/&amp;/g, "&"))).replace(/([\w.+-]+@clavoris\.com)/g, (m) => link("mailto:" + m, m)));
  });
  flush();
  const f = FOOTER_PARTS[lang] || FOOTER_PARTS.en;
  const logo = `${SITE_URL}/assets/clavoris-logo.png`;
  const fl = (href: string, label: string) => `<a href="${esc(href)}" style="color:#6E83A0;text-decoration:underline">${esc(label)}</a>`;
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">`
    + `</head>`
    + `<body style="margin:0;padding:0;background:#F7F3EC">`
    + `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#F7F3EC" style="background:#F7F3EC"><tr><td align="center" style="padding:40px 16px">`
    + `<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background:#FFFFFF;border:1px solid #E6DFD1;border-top:3px solid #B8860B">`
    + `<tr><td align="center" style="padding:40px 48px 28px"><img src="${logo}" width="72" alt="Clavoris" style="display:block;width:72px;height:auto;border:0">`
    + (sender ? `<p style="margin:22px 0 0;font-family:${FONT_UI};font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#6E83A0">${esc(FROM_CAPTION[lang] || FROM_CAPTION.en)}</p><p style="margin:4px 0 0;font-family:${FONT_DISPLAY};font-size:21px;line-height:1.3;color:#1A3A5C">${esc(sender)}</p>` : "")
    + `</td></tr>`
    + `<tr><td style="padding:0 48px"><div style="height:1px;line-height:1px;background:#E6DFD1">&nbsp;</div></td></tr>`
    + `<tr><td style="padding:36px 48px 24px">${blocks.join("")}</td></tr>`
    + `<tr><td bgcolor="#EDE7DA" style="background:#EDE7DA;padding:28px 48px 30px">`
    + `<p style="margin:0 0 4px;font-family:${FONT_DISPLAY};font-size:17px;color:#1A3A5C">Clavoris <span style="font-style:italic;color:#B8860B">· ${esc(f.tag)}</span></p>`
    + `<p style="margin:0 0 16px;font-family:${FONT_UI};font-size:12px;letter-spacing:.06em;color:#6E83A0">${esc(f.loc)}</p>`
    + `<p style="margin:0 0 10px;font-family:${FONT_UI};font-size:12px;line-height:1.6;color:#6E83A0">${esc(f.help).replace("access@clavoris.com", fl("mailto:access@clavoris.com", "access@clavoris.com"))}</p>`
    + `<p style="margin:0;font-family:${FONT_UI};font-size:12px;line-height:1.6;color:#6E83A0">${fl(UNSUB_URL(), f.notif)} &nbsp;·&nbsp; ${fl(UNSUB_URL(), f.unsub)} &nbsp;·&nbsp; ${fl(PRIVACY_URL(), f.privacy)}</p>`
    + `</td></tr></table></td></tr></table></body></html>`;
}

// Formal greeting: when the recipient's profile carries Mr / Mrs and a last name, the template's opening
// line ("Dear {name}," / "Beste {name}," / "Cher/Chère {name},") becomes "Dear Mr Van Beirs," etc.
const GREETING: Record<string, Record<Lang, string>> = {
  mr: { en: "Dear Mr {last},", nl: "Geachte heer {last},", fr: "Cher Monsieur {last}," },
  mrs: { en: "Dear Mrs {last},", nl: "Geachte mevrouw {last},", fr: "Chère Madame {last}," },
};
async function formalGreeting(to: string, text: string, L: Lang): Promise<string> {
  const line = /^(Dear|Beste|Cher\/Chère) [^\n]*,[ \t]*$/m;
  if (!line.test(text)) return text;
  try {
    const { data: p } = await adminClient().from("clv_profiles").select("salutation, last_name").eq("email", to.trim().toLowerCase()).maybeSingle();
    const g = p?.salutation && String(p.last_name || "").trim() ? GREETING[p.salutation]?.[L] : "";
    return g ? text.replace(line, g.replace("{last}", String(p!.last_name).trim())) : text;
  } catch { return text; }
}

// Second route for recipients whose mail is hosted by mailbox.org (MX *.mailbox.org): mailbox.org refuses
// mail from Brevo's shared sending IPs while one of them is on the SpamCop blocklist ("554 5.7.1 … blocked
// by RBL"), and Brevo only reports that later as a soft bounce. Mail to those recipients is therefore
// submitted through mailbox.org itself (delivered internally, no blocklist check). Secrets:
// CLAVORIS_SMTP_ALT_HOST (smtp.mailbox.org), CLAVORIS_SMTP_ALT_PORT (465), CLAVORIS_SMTP_ALT_USER,
// CLAVORIS_SMTP_ALT_PASS (an application password of the clavoris.com mailbox); optional
// CLAVORIS_SMTP_ALT_MX (MX suffixes, comma separated; default "mailbox.org"). Without them all mail uses Brevo.
const mxCache = new Map<string, string[]>();
export async function mxHosts(domain: string): Promise<string[]> {
  if (mxCache.has(domain)) return mxCache.get(domain)!;
  let hosts: string[] = [];
  try { hosts = (await Deno.resolveDns(domain, "MX")).map((r) => String(r.exchange).toLowerCase().replace(/\.$/, "")); }
  catch (e) { console.error("mx lookup:", domain, (e as Error).message); }
  mxCache.set(domain, hosts);
  return hosts;
}
async function altRoute(to: string): Promise<boolean> {
  if (!Deno.env.get("CLAVORIS_SMTP_ALT_HOST") || !Deno.env.get("CLAVORIS_SMTP_ALT_PASS")) return false;
  const domain = to.trim().toLowerCase().split("@")[1] || "";
  if (!domain) return false;
  const suffixes = (Deno.env.get("CLAVORIS_SMTP_ALT_MX") || "mailbox.org").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  const hosts = await mxHosts(domain);
  return hosts.some((h) => suffixes.some((s) => h === s || h.endsWith("." + s)));
}

// Postmark (transactional mail service with clean shared IPs): when CLAVORIS_POSTMARK_TOKEN (the server API
// token) is set, all mail goes through Postmark's HTTP API instead of SMTP. Requires clavoris.com to be a
// verified sender domain in Postmark (DKIM + Return-Path records).
async function postmarkSend(token: string, to: string, subject: string, body: string, html: string | undefined): Promise<string> {
  const res = await fetch("https://api.postmarkapp.com/email", {
    method: "POST",
    headers: { "Accept": "application/json", "Content-Type": "application/json", "X-Postmark-Server-Token": token },
    body: JSON.stringify({
      From: `Clavoris <${MAIL_FROM}>`, To: to.trim(), ReplyTo: MAIL_REPLY_TO, Subject: subject,
      TextBody: body, HtmlBody: html, MessageStream: Deno.env.get("CLAVORIS_POSTMARK_STREAM") || "outbound",
      TrackOpens: false, TrackLinks: "None",
      Headers: [{ Name: "List-Unsubscribe", Value: `<mailto:${MAIL_REPLY_TO}?subject=unsubscribe>, <${UNSUB_URL()}>` }],
    }),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || j.ErrorCode) throw new Error(`postmark ${res.status} ${j.ErrorCode ?? ""} ${j.Message ?? ""}`.trim());
  return String(j.MessageID || "");
}

// Delivery tracking (Postmark route): every message is recorded in clv_mail_log. The webhook function
// clv-mail-events receives Postmark's Delivery / Bounce events: a bounced HTML mail is re-sent once as plain
// text (opt.parent = the log row of the HTML attempt); a bounced plain-text mail is red-flagged for reporting.
async function logMail(row: Record<string, unknown>): Promise<void> {
  try { const { error } = await adminClient().from("clv_mail_log").insert(row); if (error) console.error("mail log:", error.message); }
  catch (e) { console.error("mail log:", (e as Error).message); }
}

// opt.html === false sends plain text only; opt.parent links a plain-text retry to its HTML attempt.
export async function sendMail(to: string, subject: string, text: string, lang: Lang | string = "en", cta?: Cta | Cta[], opt: { html?: boolean; parent?: string } = {}): Promise<boolean> {
  const withHtml = MAIL_HTML && opt.html !== false;
  const original = text;
  const pmToken = Deno.env.get("CLAVORIS_POSTMARK_TOKEN");
  if ((!Deno.env.get("CLAVORIS_SMTP_HOST") && !pmToken) || !to) return false;
  if (pmToken) {
    const L = pickLang(lang);
    if (cta && !Array.isArray(cta)) text = text.replace(/\n(Start here:|Begin hier:|Commencez ici :)\n/, "\n" + cta.label + (L === "fr" ? " :" : ":") + "\n");
    text = await formalGreeting(to, text, L);
    const body = text + "\n\n" + mailFooter(L);
    try {
      const id = await postmarkSend(pmToken, to, subject, body, withHtml ? textToHtml(text, cta, L) : undefined);
      console.log("mail sent: [postmark]", to, "|", subject.replace(/\b\d{6}\b/g, "******"), "|", id, withHtml ? "html" : "text");
      await logMail({ message_id: id, recipient: to.trim().toLowerCase(), subject, body: original, lang: L, cta: cta ?? null, format: withHtml ? "html" : "text", parent_id: opt.parent ?? null });
      return true;
    } catch (e) {
      console.error("mail failed: [postmark]", to, "|", subject.replace(/\b\d{6}\b/g, "******"), "|", (e as Error).message);
      if (!Deno.env.get("CLAVORIS_SMTP_HOST")) throw e;
      // Postmark refused (e.g. account still pending approval): fall through to the SMTP routes.
    }
  }
  const alt = await altRoute(to);
  const P = alt ? "CLAVORIS_SMTP_ALT_" : "CLAVORIS_SMTP_";
  const host = Deno.env.get(P + "HOST")!;
  const port = Number(Deno.env.get(P + "PORT") || 465);
  const user = Deno.env.get(P + "USER") || MAIL_FROM;
  const pass = Deno.env.get(P + "PASS") || "";
  const L = pickLang(lang);
  // The invitation's lead-in "Start here:" reads as "Click here to activate your account:" above the link.
  if (cta && !Array.isArray(cta)) text = text.replace(/\n(Start here:|Begin hier:|Commencez ici :)\n/, "\n" + cta.label + (L === "fr" ? " :" : ":") + "\n");
  text = await formalGreeting(to, text, L);
  const body = text + "\n\n" + mailFooter(L);
  try {
    // Own SMTP submission (_shared/smtp.ts): standard headers (Message-ID, Date), one multipart/alternative.
    const r = await smtpSend({ host, port, user, pass, helo: "clavoris.com" }, {
      fromName: "Clavoris", from: MAIL_FROM, to: to.trim(), replyTo: MAIL_REPLY_TO, subject,
      text: body, html: withHtml ? textToHtml(text, cta, L) : undefined,
      // Standard unsubscribe header (shown by Gmail and Outlook as "Unsubscribe"); expected on automated mail.
      headers: { "List-Unsubscribe": `<mailto:${MAIL_REPLY_TO}?subject=unsubscribe>, <${UNSUB_URL()}>` },
    });
    console.log("mail sent:", alt ? "[mailbox.org]" : "[brevo]", to, "|", subject.replace(/\b\d{6}\b/g, "******"), "|", r.messageId, "|", r.reply.replace(/\s+/g, " ").slice(0, 120));
    return true;
  } catch (e) {
    console.error("mail failed:", alt ? "[mailbox.org]" : "[brevo]", to, "|", subject.replace(/\b\d{6}\b/g, "******"), "|", (e as Error).message);
    if (!alt) throw e;
    // mailbox.org route refused (e.g. wrong application password): fall back to Brevo.
    const r = await smtpSend({ host: Deno.env.get("CLAVORIS_SMTP_HOST")!, port: Number(Deno.env.get("CLAVORIS_SMTP_PORT") || 465), user: Deno.env.get("CLAVORIS_SMTP_USER") || MAIL_FROM, pass: Deno.env.get("CLAVORIS_SMTP_PASS") || "", helo: "clavoris.com" }, {
      fromName: "Clavoris", from: MAIL_FROM, to: to.trim(), replyTo: MAIL_REPLY_TO, subject,
      text: body, html: withHtml ? textToHtml(text, cta, L) : undefined,
      headers: { "List-Unsubscribe": `<mailto:${MAIL_REPLY_TO}?subject=unsubscribe>, <${UNSUB_URL()}>` },
    });
    console.log("mail sent: [brevo fallback]", to, "|", subject.replace(/\b\d{6}\b/g, "******"), "|", r.messageId, "|", r.reply.replace(/\s+/g, " ").slice(0, 120));
    return true;
  }
}

// ---- enrolment on the shared user directory ----
// The Supabase project is shared with the Minerva cloud: one auth user per e-mail address.
// A Clavoris enrolment therefore either creates the auth user (new to both platforms) or
// attaches a Clavoris profile to an existing user (who keeps their existing password).
// Returns the activation link to send: a one-time recovery link lands on reset.html.
export type Enrolled = { id: string; created: boolean; linked: boolean; link: string };
export type Addressing = { salutation?: string | null; first_name?: string | null; last_name?: string | null };
export async function enrolUser(admin: SupabaseClient, email: string, name: string, company: string | null, lang = "en", role: "user" | "admin" = "user", addr: Addressing = {}): Promise<Enrolled | { error: string }> {
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
  const { error: pErr } = await admin.from("clv_profiles").insert({ id, email, full_name: name || (l.user.user_metadata as { full_name?: string } | null)?.full_name || null, company, lang, role, status: "registered", salutation: addr.salutation || null, first_name: addr.first_name || null, last_name: addr.last_name || null });
  if (pErr) { if (created) await admin.auth.admin.deleteUser(id).catch(() => {}); return { error: pErr.message }; }
  return { id, created, linked, link };
}
