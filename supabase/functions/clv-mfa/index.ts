// supabase/functions/clv-mfa/index.ts
// Two-factor sign-in. After the password, every sign-in needs a second factor: a 6-digit code e-mailed
// to the user, or the Google Authenticator code when the user has activated it on the account page
// (Supabase MFA, the browser verifies it and the session becomes aal2).
//   { action: "status" }                  -> { verified, totp, email, first_password }
//   { action: "send", purpose? }          -> e-mails a 6-digit code (valid 10 min, 5 attempts; max 1 per 30 s, 6 per hour);
//                                            purpose "login" (default) or "password" (confirming a password change)
//   { action: "verify", code }            -> checks a sign-in code; marks this session as verified; completes the sign-in
//   { action: "totp_done" }               -> after an authenticator verification (aal2): completes the sign-in
//   { action: "remind", never? }          -> answer to the "activate the authenticator app" reminder
//   { action: "change_password", password, current_password?, code? }
//                                         -> sets a new password, only with a fresh second factor: an e-mailed
//                                            "password" code, or an authenticator code entered in the last 5 minutes.
//                                            The current password is required too, except right after an e-mailed
//                                            recovery link. A newly invited member setting a first password is exempt.
// Completing a sign-in logs it (audit trail), stamps last_login_at and tells the page whether to show the
// reminder: no authenticator app yet, every 10 sign-ins or 30 days; "don't remind me again" pauses it 6 months.
// Deploy: supabase functions deploy clv-mfa --no-verify-jwt
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { adminClient, clientIp, cors, json, jwtClaims, mfaOk, requireUser, sendMail } from "../_shared/clv.ts";
import { pickLang, type Lang } from "../_shared/mail-i18n.ts";

const CODE_TTL_MS = 10 * 60 * 1000, MAX_ATTEMPTS = 5, RESEND_MS = 30 * 1000, MAX_PER_HOUR = 6;
const REMIND_LOGINS = 10, REMIND_DAYS = 30, SNOOZE_DAYS = 182;
const TOTP_FRESH_S = 5 * 60, RECOVERY_FRESH_S = 60 * 60;

type Purpose = "login" | "password";
const MAIL: Record<Purpose, Record<Lang, { s: string; t: string }>> = {
  login: {
    en: { s: "Your Clavoris sign-in code: {code}", t: "Dear {name},\n\nYour sign-in code for Clavoris is:\n\n{code}\n\nThe code is valid for 10 minutes and can be used once. Enter it on the sign-in page to continue.\n\nDid you not just sign in? Then someone knows your password: do not share this code, change your password on your account page and inform access@clavoris.com." },
    nl: { s: "Uw Clavoris-aanmeldcode: {code}", t: "Beste {name},\n\nUw aanmeldcode voor Clavoris is:\n\n{code}\n\nDe code is 10 minuten geldig en kan één keer gebruikt worden. Vul hem in op de aanmeldpagina om verder te gaan.\n\nHebt u zich niet net aangemeld? Dan kent iemand uw wachtwoord: deel deze code niet, wijzig uw wachtwoord op uw accountpagina en verwittig access@clavoris.com." },
    fr: { s: "Votre code de connexion Clavoris : {code}", t: "Cher/Chère {name},\n\nVotre code de connexion à Clavoris est :\n\n{code}\n\nLe code est valable 10 minutes et ne peut être utilisé qu'une seule fois. Saisissez-le sur la page de connexion pour continuer.\n\nVous ne venez pas de vous connecter ? Quelqu'un connaît alors votre mot de passe : ne communiquez pas ce code, changez votre mot de passe sur votre page de compte et prévenez access@clavoris.com." },
  },
  password: {
    en: { s: "Your Clavoris code to change your password: {code}", t: "Dear {name},\n\nYou asked to change your Clavoris password. Your confirmation code is:\n\n{code}\n\nThe code is valid for 10 minutes and can be used once.\n\nDid you not ask for this? Do not share this code and inform access@clavoris.com." },
    nl: { s: "Uw Clavoris-code om uw wachtwoord te wijzigen: {code}", t: "Beste {name},\n\nU vroeg om uw Clavoris-wachtwoord te wijzigen. Uw bevestigingscode is:\n\n{code}\n\nDe code is 10 minuten geldig en kan één keer gebruikt worden.\n\nHebt u dit niet gevraagd? Deel deze code niet en verwittig access@clavoris.com." },
    fr: { s: "Votre code Clavoris pour changer votre mot de passe : {code}", t: "Cher/Chère {name},\n\nVous avez demandé à changer votre mot de passe Clavoris. Votre code de confirmation est :\n\n{code}\n\nLe code est valable 10 minutes et ne peut être utilisé qu'une seule fois.\n\nVous n'êtes pas à l'origine de cette demande ? Ne communiquez pas ce code et prévenez access@clavoris.com." },
  },
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
// Time (s) of the most recent authentication with one of the given methods, from the JWT "amr" claim.
function amrAt(claims: Record<string, any>, methods: string[]): number {
  const amr = Array.isArray(claims.amr) ? claims.amr : [];
  return amr.filter((e: any) => methods.includes(e?.method)).reduce((m: number, e: any) => Math.max(m, Number(e?.timestamp) || 0), 0);
}
function strong(pw: string): boolean { return pw.length >= 12 && /[A-Za-z]/.test(pw) && /[0-9]/.test(pw); }
// A throw-away client (nothing persisted) to check a password without touching the user's own session.
async function passwordWorks(email: string, password: string): Promise<boolean> {
  const c = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await c.auth.signInWithPassword({ email, password });
  if (error || !data?.session) return false;
  await c.auth.signOut({ scope: "local" }).catch(() => {});
  return true;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method" }, 405);
  const admin = adminClient();
  const body = await req.json().catch(() => ({}));
  const action = String(body.action || "status");
  // The second factor itself can of course be done without having passed it; the reminder answer and a
  // password change need it.
  const me = await requireUser(admin, req, { mfa: action === "remind" || action === "change_password" });
  if (me instanceof Response) return me;
  const jwt = (req.headers.get("authorization") || "").replace("Bearer ", "");
  const claims = jwtClaims(jwt);
  const sessionId = String(claims.session_id || "");
  if (!sessionId) return json({ error: "no-session" }, 400);
  const nowS = Math.floor(Date.now() / 1000);

  const { data: factors } = await admin.auth.admin.mfa.listFactors({ userId: me.id });
  const totp = !!(factors?.factors || []).find((f: any) => f.factor_type === "totp" && f.status === "verified");

  // A newly invited member choosing a first password (from the invitation link) is not asked for a code.
  async function firstPassword(): Promise<boolean> {
    if (nowS - amrAt(claims, ["recovery", "otp", "magiclink", "invite"]) > RECOVERY_FRESH_S) return false;
    const { data: p } = await admin.from("clv_profiles").select("status, last_login_at").eq("id", me.id).maybeSingle();
    return !!p && p.status === "registered" && !p.last_login_at;
  }

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

  // Checks an e-mailed code for this session and purpose; marks it used when correct.
  async function checkCode(purpose: Purpose, raw: unknown): Promise<Response | null> {
    const code = String(raw || "").replace(/\D/g, "");
    if (code.length !== 6) return json({ error: "bad-code" }, 400);
    const { data: row } = await admin.from("clv_mfa_codes").select("id, code_hash, expires_at, attempts").eq("user_id", me.id).eq("session_id", sessionId).eq("purpose", purpose).is("used_at", null).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (!row) return json({ error: "no-code" }, 400);
    if (new Date(row.expires_at).getTime() < Date.now()) return json({ error: "expired" }, 400);
    if (row.attempts >= MAX_ATTEMPTS) return json({ error: "too-many-attempts" }, 400);
    if ((await sha256(`${me.id}:${sessionId}:${purpose}:${code}`)) !== row.code_hash) {
      await admin.from("clv_mfa_codes").update({ attempts: row.attempts + 1 }).eq("id", row.id);
      await admin.from("clv_audit").insert({ actor: me.id, actor_email: me.email, event_type: "mfa-failed", target: me.email, detail: { method: "email", purpose } }).then(() => {}, () => {});
      return json({ error: "wrong-code", attempts_left: Math.max(0, MAX_ATTEMPTS - row.attempts - 1) }, 400);
    }
    await admin.from("clv_mfa_codes").update({ used_at: new Date().toISOString() }).eq("id", row.id);
    return null;
  }

  if (action === "status") {
    return json({ ok: true, verified: await mfaOk(admin, jwt, me.id), totp, email: mask(me.email), first_password: await firstPassword() });
  }

  if (action === "send") {
    const purpose: Purpose = body.purpose === "password" ? "password" : "login";
    const hourAgo = new Date(Date.now() - 3600000).toISOString();
    const { data: recent } = await admin.from("clv_mfa_codes").select("created_at").eq("user_id", me.id).gte("created_at", hourAgo).order("created_at", { ascending: false });
    if (recent && recent.length && Date.now() - new Date(recent[0].created_at).getTime() < RESEND_MS) return json({ error: "wait", retry_in: Math.ceil((RESEND_MS - (Date.now() - new Date(recent[0].created_at).getTime())) / 1000) }, 429);
    if (recent && recent.length >= MAX_PER_HOUR) return json({ error: "too-many" }, 429);
    const code = sixDigits();
    // One live code per session and purpose: a new code replaces the previous one.
    await admin.from("clv_mfa_codes").update({ used_at: new Date().toISOString() }).eq("user_id", me.id).eq("session_id", sessionId).eq("purpose", purpose).is("used_at", null);
    const { error } = await admin.from("clv_mfa_codes").insert({ user_id: me.id, session_id: sessionId, purpose, code_hash: await sha256(`${me.id}:${sessionId}:${purpose}:${code}`), expires_at: new Date(Date.now() + CODE_TTL_MS).toISOString() });
    if (error) return json({ error: error.message }, 500);
    const L = pickLang(me.lang);
    const m = MAIL[purpose][L] || MAIL[purpose].en;
    const fill = (s: string) => s.replace(/\{code\}/g, code).replace(/\{name\}/g, me.full_name || FALLBACK[L]);
    let mailed = false;
    try { mailed = await sendMail(me.email, fill(m.s), fill(m.t), L); } catch (e) { console.error("mfa code mail:", (e as Error).message); }
    if (!mailed) return json({ error: "mail-failed" }, 502);
    return json({ ok: true, sent_to: mask(me.email), expires_in: CODE_TTL_MS / 1000 });
  }

  if (action === "verify") {
    const bad = await checkCode("login", body.code);
    if (bad) return bad;
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

  if (action === "change_password") {
    const password = String(body.password || "");
    if (!strong(password)) return json({ error: "weak-password" }, 400);
    const first = await firstPassword();
    const recovery = nowS - amrAt(claims, ["recovery", "otp", "magiclink", "invite"]) <= RECOVERY_FRESH_S;
    if (!first) {
      // Fresh second factor: an authenticator code entered in the last 5 minutes, or an e-mailed password code.
      const freshTotp = nowS - amrAt(claims, ["totp"]) <= TOTP_FRESH_S;
      if (!freshTotp) {
        if (!body.code) return json({ error: "code-required" }, 400);
        const bad = await checkCode("password", body.code);
        if (bad) return bad;
      }
      // The current password, unless the user arrived through an e-mailed recovery link (forgotten password).
      if (!recovery && !(await passwordWorks(me.email, String(body.current_password || "")))) return json({ error: "wrong-password" }, 400);
    }
    // The same password as before: nothing to change, it simply stays valid.
    if (await passwordWorks(me.email, password)) return json({ ok: true, same: true });
    const { error } = await admin.auth.admin.updateUserById(me.id, { password });
    if (error) return json({ error: error.message }, 400);
    await admin.from("clv_audit").insert({ actor: me.id, actor_email: me.email, event_type: "password-changed", target: me.email, detail: { first, recovery, ip: clientIp(req) } }).then(() => {}, () => {});
    return json({ ok: true });
  }

  return json({ error: "bad-action" }, 400);
});
