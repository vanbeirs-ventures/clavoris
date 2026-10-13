// supabase/functions/clv-auth-mail/index.ts
// Public endpoint: sends Clavoris auth mails from noreply@clavoris.com instead
// of Supabase Auth's project-wide sender (which the Minerva site also uses).
//   { action: "recovery", email }  -> emails a one-time passphrase-reset link
// Always answers { ok: true } so the endpoint cannot be used to enumerate
// enrolled addresses. Only addresses with a clv_profiles row are mailed.
// Deploy: supabase functions deploy clv-auth-mail --no-verify-jwt
import { adminClient, APP_URL, cors, json, mailConfigured, sendMail } from "../_shared/clv.ts";

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
  const { data: p } = await admin.from("clv_profiles").select("id, full_name, status").eq("email", email).maybeSingle();
  if (!p || p.status === "suspended") return json({ ok: true });

  const { data: link, error } = await admin.auth.admin.generateLink({
    type: "recovery", email, options: { redirectTo: APP_URL + "/reset.html" },
  });
  if (error || !link?.properties?.action_link) return json({ ok: true });

  const text = `Dear ${p.full_name || "investor"},\n\nA passphrase reset was requested for your Clavoris account.\n\n`
    + `Set a new passphrase here (the link is valid once, for a limited time):\n${link.properties.action_link}\n\n`
    + `If you did not request this, you can ignore this message; your passphrase stays unchanged.`;
  await sendMail(email, "Reset your Clavoris passphrase", text).catch(() => false);
  return json({ ok: true });
});
