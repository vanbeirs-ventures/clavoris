// supabase/functions/clv-mfa/index.ts
// Two-factor sign-in. After the password, every sign-in needs a second factor: a 6-digit code e-mailed
// to the user, or the Google Authenticator code when the user has activated it on the account page
// (Supabase MFA, the browser verifies it and the session becomes aal2).
//   { action: "status" }              -> { verified, totp, email }  (verified = this session passed 2FA)
//   { action: "send" }                -> e-mails a 6-digit code (valid 10 min, 5 attempts; max 1 per 30 s, 6 per hour)
//   { action: "verify", code }        -> checks the code; marks this session as verified; completes the sign-in
//   { action: "totp_done" }           -> after an authenticator verification (aal2): completes the sign-in
//   { action: "remind", never? }      -> answer to the "activate the authenticator app" reminder
// Completing a sign-in logs it (audit trail), stamps last_login_at and tells the page whether to show the
// reminder: no authenticator app yet, every 10 sign-ins or 30 days; "don't remind me again" pauses it 6 months.
// Deploy: supabase functions deploy clv-mfa --no-verify-jwt
import { adminClient, clientIp, cors, json, jwtClaims, mfaOk, requireUser, sendMail } from "../_shared/clv.ts";
import { pickLang, type Lang } from "../_shared/mail-i18n.ts";

const CODE_TTL_MS = 10 * 60 * 1000, MAX_ATTEMPTS = 5, RESEND_MS = 30 * 1000, MAX_PER_HOUR = 6;
const REMIND_LOGINS = 10, REMIND_DAYS = 30, SNOOZE_DAYS = 182;

const MAIL: Record<Lang, { s: string; t: string }> = {
  en: { s: "Your Clavoris sign-in code: {code}", t: "Dear {name},\n\nYour sign-in code for Clavoris is:\n\n{code}\n\nThe code is valid for 10 minutes and can be used once. Enter it on the sign-in page to continue.\n\nDid you not just sign in? Then someone knows your password: do not share this code, change your password on your account page and inform access@clavoris.com." },
  nl: { s: "Uw Clavoris-aanmeldcode: {code}", t: "Beste {name},\n\nUw aanmeldcode voor Clavoris is:\n\n{code}\n\nDe code is 10 minuten geldig en kan één keer gebruikt worden. Vul hem in op de aanmeldpagina om verder te gaan.\n\nHebt u zich niet net aangemeld? Dan kent iemand uw wachtwoord: deel deze code niet, wijzig uw wachtwoord op uw accountpagina en verwittig access@clavoris.com." },
  fr: { s: "Votre code de connexion Clavoris : {code}", t: "Cher/Chère {name},\n\nVotre code de connexion à Clavoris est :\n\n{code}\n\nLe code est valable 10 minutes et ne peut être utilisé qu'une seule fois. Saisissez-le sur la page de connexion pour continuer.\n\nVous ne venez pas de vous connecter ? Quelqu'un connaît alors votre mot de passe : ne communiquez pas ce code, changez votre mot de passe sur votre page de compte et prévenez access@clavoris.com." },
};
const FALLBACK: Record<Lang, string> = { en: "investor", nl: "belegger", fr: "investisseur" };

async function sha256(s: string): Promise<string> {
  const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(h)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
function sixDigits(): string {
  const a = new Uint32Array(1);
  let n: number;
  do { crypto.getRandomValues(a); n = a[0]; } while (n >= 4294000000); // avoid modulo bias
  return String(n % 1000000).padStart(6, "0");
}
function mask(email: string): string {
  const [u, d] = String(email || "").split("@");
  if (!d) return email;
  return (u.length <= 2 ? u[0] + "•" : u.slice(0, 2) + "•".repeat(Math.min(6, u.length - 2))) + "@" + d;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method" }, 405);
  const admin = adminClient();
  const body = await req.json().catch(() => ({}));
  const action = String(body.action || "status");
  // The second factor itself can of course be done without having passed it; the reminder answer needs it.
  const me = await requireUser(admin, req, { mfa: action === "remind" });
  if (me instanceof Response) return me;
  const jwt = (req.headers.get("authorization") || "").replace("Bearer ", "");
  const claims = jwtClaims(jwt);
  const sessionId = String(claims.session_id || "");
  if (!sessionId) return json({ error: "no-session" }, 400);

  const { data: factors } = await admin.auth.admin.mfa.listFactors({ userId: me.id });
  const totp = !!(factors?.factors || []).find((f: any) => f.factor_type === "totp" && f.status === "verified");

  // Completes a sign-in once the second factor is passed: audit trail, last sign-in, reminder decision.
  async function complete(method: string) {
    const ip = clientIp(req), ua = (req.headers.get("user-agent") || "").slice(0, 400);
    await admin.from("clv_access_log").insert({ user_id: me.id, action: "login", ip, user_agent: ua }).then(() => {}, () => {});
    await admin.from("clv_audit").insert({ actor: me.id, actor_email: me.email, event_type: "mfa-passed", target: me.email, detail: { method } }).then(() => {}, () => {});
    const { data: p } = await admin.from("clv_profiles").select("mfa_logins_since_reminder, mfa_reminded_at, mfa_snooze_until").eq("id", me.id).maybeSingle();
    const now = Date.now();
    const patch: Record<string, unknown> = { last_login_at: new Date().toISOString() };
    let remind = false;
    if (!totp && p && !(p.mfa_snooze_until && new Date(p.mfa_snooze_until).getTime() > now)) {
      const logins = (p.mfa_logins_since_reminder || 0) + 1;
      const since = p.mfa_reminded_at ? now - new Date(p.mfa_reminded_at).getTime() : Infinity;
      remind = !p.mfa_reminded_at || logins >= REMIND_LOGINS || since >= REMIND_DAYS * 86400000;
      if (remind) { patch.mfa_reminded_at = new Date().toISOString(); patch.mfa_logins_since_reminder = 0; }
      else patch.mfa_logins_since_reminder = logins;
    }
    await admin.from("clv_profiles").update(patch).eq("id", me.id);
    return json({ ok: true, verified: true, remind });
  }

  if (action === "status") {
    return json({ ok: true, verified: await mfaOk(admin, jwt, me.id), totp, email: mask(me.email) });
  }

  if (action === "send") {
    const hourAgo = new Date(Date.now() - 3600000).toISOString();
    const { data: recent } = await admin.from("clv_mfa_codes").select("created_at").eq("user_id", me.id).gte("created_at", hourAgo).order("created_at", { ascending: false });
    if (recent && recent.length && Date.now() - new Date(recent[0].created_at).getTime() < RESEND_MS) return json({ error: "wait", retry_in: Math.ceil((RESEND_MS - (Date.now() - new Date(recent[0].created_at).getTime())) / 1000) }, 429);
    if (recent && recent.length >= MAX_PER_HOUR) return json({ error: "too-many" }, 429);
    const code = sixDigits();
    // One live code per session: a new code replaces the previous one.
    await admin.from("clv_mfa_codes").update({ used_at: new Date().toISOString() }).eq("user_id", me.id).eq("session_id", sessionId).is("used_at", null);
    const { error } = await admin.from("clv_mfa_codes").insert({ user_id: me.id, session_id: sessionId, code_hash: await sha256(`${me.id}:${sessionId}:${code}`), expires_at: new Date(Date.now() + CODE_TTL_MS).toISOString() });
    if (error) return json({ error: error.message }, 500);
    const L = pickLang(me.lang);
    const m = MAIL[L] || MAIL.en;
    const fill = (s: string) => s.replace(/\{code\}/g, code).replace(/\{name\}/g, me.full_name || FALLBACK[L]);
    let mailed = false;
    try { mailed = await sendMail(me.email, fill(m.s), fill(m.t), L); } catch (e) { console.error("mfa code mail:", (e as Error).message); }
    if (!mailed) return json({ error: "mail-failed" }, 502);
    return json({ ok: true, sent_to: mask(me.email), expires_in: CODE_TTL_MS / 1000 });
  }

  if (action === "verify") {
    const code = String(body.code || "").replace(/\D/g, "");
    if (code.length !== 6) return json({ error: "bad-code" }, 400);
    const { data: row } = await admin.from("clv_mfa_codes").select("id, code_hash, expires_at, attempts").eq("user_id", me.id).eq("session_id", sessionId).is("used_at", null).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (!row) return json({ error: "no-code" }, 400);
    if (new Date(row.expires_at).getTime() < Date.now()) return json({ error: "expired" }, 400);
    if (row.attempts >= MAX_ATTEMPTS) return json({ error: "too-many-attempts" }, 400);
    if ((await sha256(`${me.id}:${sessionId}:${code}`)) !== row.code_hash) {
      await admin.from("clv_mfa_codes").update({ attempts: row.attempts + 1 }).eq("id", row.id);
      await admin.from("clv_audit").insert({ actor: me.id, actor_email: me.email, event_type: "mfa-failed", target: me.email, detail: { method: "email" } }).then(() => {}, () => {});
      return json({ error: "wrong-code", attempts_left: Math.max(0, MAX_ATTEMPTS - row.attempts - 1) }, 400);
    }
    await admin.from("clv_mfa_codes").update({ used_at: new Date().toISOString() }).eq("id", row.id);
    await admin.from("clv_mfa_sessions").upsert({ session_id: sessionId, user_id: me.id, method: "email", verified_at: new Date().toISOString() });
    return await complete("email");
  }

  if (action === "totp_done") {
    if (claims.aal !== "aal2") return json({ error: "mfa-required" }, 401);
    return await complete("totp");
  }

  if (action === "remind") {
    if (body.never === true) await admin.from("clv_profiles").update({ mfa_snooze_until: new Date(Date.now() + SNOOZE_DAYS * 86400000).toISOString() }).eq("id", me.id);
    return json({ ok: true });
  }

  return json({ error: "bad-action" }, 400);
});
