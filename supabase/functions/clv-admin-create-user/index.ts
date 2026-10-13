// supabase/functions/clv-admin-create-user/index.ts
// Enrol a Clavoris user from the admin console. SECURITY:
//   - caller must be admin or super (verified server-side);
//   - creating an admin requires the caller to be super;
//   - status is fixed server-side ('registered': KYC still to run).
// Emails a one-time activation link from noreply@clavoris.com in the chosen language. The user
// directory is shared with the Minerva cloud: an existing user keeps their passphrase and gets a
// Clavoris profile. Feature switches (marketplace, trading, product allowlist) are stored on the profile.
// Deploy: supabase functions deploy clv-admin-create-user --no-verify-jwt
import { adminClient, APP_URL, audit, cleanFeatures, cors, enrolUser, json, requireAdmin, sendMail } from "../_shared/clv.ts";
import { type Lang, mail, pickLang, word } from "../_shared/mail-i18n.ts";
const withLang = (u: string, l: string) => u + (u.includes("?") ? "&" : "?") + "lang=" + l;

function sendInvite(to: string, name: string, role: "user" | "admin", link: string, linked: boolean, lang: Lang): Promise<boolean> {
  const m = mail(lang, linked ? "user_enrolled_linked" : "user_enrolled_new", { name, role: word(lang, role === "admin" ? "role_admin" : "role_investor"), link: withLang(link, lang), login: `${APP_URL}/login.html?lang=${lang}` });
  return sendMail(to, m.subject, m.text, lang);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method" }, 405);
  const admin = adminClient();
  const me = await requireAdmin(admin, req);
  if (me instanceof Response) return me;

  const body = await req.json().catch(() => ({}));
  const role = body.role === "admin" ? "admin" : "user";
  const name = String(body.name || "").trim().slice(0, 120);
  const email = String(body.email || "").trim().toLowerCase().slice(0, 200);
  const company = String(body.company || "").trim().slice(0, 160) || null;
  const lang = pickLang(body.lang);
  const features = cleanFeatures(body.features);
  if (!name) return json({ error: "name-required" }, 400);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: "email-invalid" }, 400);
  if (role === "admin" && me.role !== "super") return json({ error: "super-only" }, 403);

  const en = await enrolUser(admin, email, name, company, lang, role);
  if ("error" in en) return json({ error: en.error === "already-enrolled" ? "email-taken" : en.error }, 400);
  const id = en.id;
  if (role === "user") await admin.from("clv_profiles").update({ features }).eq("id", id).then(() => {}, () => {});

  await audit(admin, me, role === "admin" ? "admin-created" : "user-created", email, { role, company, features });

  let invited = false;
  try { invited = await sendInvite(email, name, role, en.link, en.linked, lang); } catch { invited = false; }
  return json({ ok: true, id, email, role, invited, linked: en.linked });
});
