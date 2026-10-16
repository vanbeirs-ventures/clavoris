// supabase/functions/clv-auth-mail/index.ts
// Public endpoint: sends Clavoris auth mails from noreply@clavoris.com instead
// of Supabase Auth's project-wide sender (which the Minerva site also uses).
//   { action: "recovery", email }  -> emails a password-reset link (in the user's language), valid 5 minutes, once
//   { action: "redeem", code }     -> exchanges that link's code for a session (reset.html), or { ok: false, error: "expired" }
// The reset link carries a random code, not the Supabase recovery token: the token stays on the server
// (clv_reset_links), so the 5-minute limit holds although Supabase's own links last 24 hours (that lifetime
// is for invitations and reminders). "recovery" always answers { ok: true } so the endpoint cannot be used to
// enumerate enrolled addresses. Only addresses with a clv_profiles row are mailed.
// Deploy: supabase functions deploy clv-auth-mail --no-verify-jwt
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { adminClient, APP_URL, cors, json, mailConfigured, sendMail, ctaLabel } from "../_shared/clv.ts";
import { isActivated } from "../_shared/activation.ts";
import { mail, pickLang } from "../_shared/mail-i18n.ts";
const withLang = (u: string, l: string) => u + (u.includes("?") ? "&" : "?") + "lang=" + l;

const RESET_MINUTES = 5;
const recent = new Map<string, number>(); // in-instance throttle: one mail per address per 60 s

async function sha256(s: string): Promise<string> {
  const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(h)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
function randomCode(): string {
  const b = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method" }, 405);
  const body = await req.json().catch(() => ({}));
  const action = String(body.action || "");
  const admin = adminClient();

  if (action === "redeem") {
    // One use, within 5 minutes of sending. The row is claimed atomically (used_at), then the Supabase token
    // is verified here and the resulting session handed to the page.
    const code = String(body.code || "").slice(0, 100);
    if (!code) return json({ ok: false, error: "expired" });
    const { data: row } = await admin.from("clv_reset_links").update({ used_at: new Date().toISOString() })
      .eq("code_hash", await sha256(code)).is("used_at", null).gt("expires_at", new Date().toISOString())
      .select("token_hash").maybeSingle();
    if (!row) return json({ ok: false, error: "expired" });
    const anon = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await anon.auth.verifyOtp({ type: "recovery", token_hash: row.token_hash });
    if (error || !data?.session) { console.error("clv-auth-mail redeem:", error?.message || "no session"); return json({ ok: false, error: "expired" }); }
    return json({ ok: true, session: { access_token: data.session.access_token, refresh_token: data.session.refresh_token } });
  }

  const email = String(body.email || "").trim().toLowerCase().slice(0, 200);
  if (action !== "recovery" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ ok: true });
  if (!mailConfigured()) return json({ ok: false, error: "mail-not-configured" }, 503);

  const now = Date.now();
  if ((recent.get(email) || 0) > now - 60_000) return json({ ok: true });
  recent.set(email, now);

  const { data: p } = await admin.from("clv_profiles").select("id, full_name, status, lang, last_login_at").eq("email", email).maybeSingle();
  if (!p || p.status === "suspended") return json({ ok: true });

  const { data: link, error } = await admin.auth.admin.generateLink({
    type: "recovery", email, options: { redirectTo: APP_URL + "/reset.html" },
  });
  if (error || !link?.properties?.hashed_token) { console.error("clv-auth-mail generateLink failed:", error?.message || "no hashed_token"); return json({ ok: true }); }
  // Only the newest reset link counts; the token is stored, the mail carries the code.
  const code = randomCode();
  await admin.from("clv_reset_links").delete().eq("user_id", p.id);
  const { error: sErr } = await admin.from("clv_reset_links").insert({ code_hash: await sha256(code), user_id: p.id, token_hash: link.properties.hashed_token, expires_at: new Date(now + RESET_MINUTES * 60_000).toISOString() });
  if (sErr) { console.error("clv-auth-mail store failed:", sErr.message); return json({ ok: true }); }
  // The code is only redeemed when the user presses Continue on reset.html, so mail link scanners cannot burn it.
  // An invited member who never signed in gets the welcome flow (first password, then profile).
  const first = !(await isActivated(admin, p.id, p.last_login_at));
  const resetUrl = `${APP_URL}/reset.html?code=${encodeURIComponent(code)}&type=recovery${first ? "&welcome=1" : ""}`;

  const L = pickLang(p.lang);
  const m = mail(L, "recovery", { name: p.full_name, link: withLang(resetUrl, L) });
  try {
    const sent = await sendMail(email, m.subject, m.text, L, { url: withLang(resetUrl, L), label: ctaLabel(L, first ? "activate" : "reset") });
    console.log("clv-auth-mail recovery mail", sent ? "sent" : "not sent (mail not configured)", "->", email);
  } catch (e) { console.error("clv-auth-mail sendMail failed:", (e as Error)?.message || String(e)); }
  return json({ ok: true });
});
