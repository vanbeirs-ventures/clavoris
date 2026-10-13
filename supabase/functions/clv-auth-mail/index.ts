// supabase/functions/clv-auth-mail/index.ts
// Public endpoint: sends Clavoris auth mails from noreply@clavoris.com instead
// of Supabase Auth's project-wide sender (which the Minerva site also uses).
//   { action: "recovery", email }  -> emails a one-time passphrase-reset link (in the user's language)
// Always answers { ok: true } so the endpoint cannot be used to enumerate
// enrolled addresses. Only addresses with a clv_profiles row are mailed.
// Deploy: supabase functions deploy clv-auth-mail --no-verify-jwt
import { adminClient, APP_URL, cors, json, mailConfigured, sendMail } from "../_shared/clv.ts";
import { mail, pickLang } from "../_shared/mail-i18n.ts";
const withLang = (u: string, l: string) => u + (u.includes("?") ? "&" : "?") + "lang=" + l;

const recent = new Map<string, number>(); // in-instance throttle: one mail per address per 60 s

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method" }, 405);
  const body = await req.json().catch(() => ({}));
  const action = String(body.action || "");
  const email = String(body.email || "").trim().toLowerCase().slice(0, 200);
  if (action !== "recovery" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ ok: true });
  if (!mailConfigured()) return json({ ok: false, error: "mail-not-configured" }, 503);

  const now = Date.now();
  if ((recent.get(email) || 0) > now - 60_000) return json({ ok: true });
  recent.set(email, now);

  const admin = adminClient();
  const { data: p } = await admin.from("clv_profiles").select("id, full_name, status, lang").eq("email", email).maybeSingle();
  if (!p || p.status === "suspended") return json({ ok: true });

  const { data: link, error } = await admin.auth.admin.generateLink({
    type: "recovery", email, options: { redirectTo: APP_URL + "/reset.html" },
  });
  if (error || !link?.properties?.hashed_token) { console.error("clv-auth-mail generateLink failed:", error?.message || "no hashed_token"); return json({ ok: true }); }
  // Link to our own page carrying the token hash: the token is only consumed when the
  // user presses Continue there (verifyOtp), so link scanners cannot burn it.
  const resetUrl = `${APP_URL}/reset.html?token_hash=${encodeURIComponent(link.properties.hashed_token)}&type=recovery`;

  const L = pickLang(p.lang);
  const m = mail(L, "recovery", { name: p.full_name, link: withLang(resetUrl, L) });
  try {
    const sent = await sendMail(email, m.subject, m.text, L);
    console.log("clv-auth-mail recovery mail", sent ? "sent" : "not sent (mail not configured)", "->", email);
  } catch (e) { console.error("clv-auth-mail sendMail failed:", (e as Error)?.message || String(e)); }
  return json({ ok: true });
});
