// supabase/functions/clv-admin-create-user/index.ts
// Enrol a Clavoris user from the admin console. SECURITY:
//   - caller must be admin or super (verified server-side);
//   - creating an admin requires the caller to be super;
//   - status is fixed server-side ('registered': KYC still to run).
// Generates a one-time passphrase and emails a sign-in invitation when SMTP
// is configured (same SMTP_* secrets as the Minerva functions on this project).
// Deploy: supabase functions deploy clv-admin-create-user --no-verify-jwt
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";
import { adminClient, audit, cors, json, LANGS, requireAdmin } from "../_shared/clv.ts";

function genPassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const r = crypto.getRandomValues(new Uint32Array(14));
  let out = "";
  for (let i = 0; i < 14; i++) { out += chars[r[i] % chars.length]; if (i === 4 || i === 9) out += "-"; }
  return out;
}

async function sendInvite(to: string, name: string, roleLabel: string, password: string): Promise<boolean> {
  const host = Deno.env.get("SMTP_HOST"); if (!host) return false;
  const port = Number(Deno.env.get("SMTP_PORT") || 465);
  const user = Deno.env.get("SMTP_USER")!;
  const pass = Deno.env.get("SMTP_PASS")!;
  const site = (Deno.env.get("CLAVORIS_APP_URL") || "https://vanbeirsventures.com/clavoris/app").replace(/\/$/, "");
  const text = `Dear ${name || "investor"},\n\nClavoris has enrolled you as ${roleLabel}.\n\n`
    + `Sign in at ${site}/login.html\nEmail: ${to}\nOne-time passphrase: ${password}\n\n`
    + `Please set your own passphrase after first sign-in (Account › Passphrase).\n\n`
    + `Clavoris · Keys to institutional capital\nAntwerp · Luxembourg · Nordic`;
  const client = new SMTPClient({ connection: { hostname: host, port, tls: port === 465, auth: { username: user, password: pass } } });
  try {
    await client.send({ from: `Clavoris <${user}>`, to, replyTo: "access@clavoris.com", subject: "Your Clavoris access", content: text });
    return true;
  } finally { client.close().catch(() => {}); }
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
  const lang = LANGS.includes(body.lang) ? body.lang : "en";
  if (!name) return json({ error: "name-required" }, 400);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: "email-invalid" }, 400);
  if (role === "admin" && me.role !== "super") return json({ error: "super-only" }, 403);

  const password = genPassword();
  const { data: created, error: cErr } = await admin.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { full_name: name }, app_metadata: { app: "clavoris" },
  });
  if (cErr) return json({ error: /registered|exists|already/i.test(cErr.message) ? "email-taken" : cErr.message }, 400);
  const id = created.user!.id;

  const { error: pErr } = await admin.from("clv_profiles").insert({ id, email, full_name: name, company, lang, role, status: "registered" });
  if (pErr) { await admin.auth.admin.deleteUser(id).catch(() => {}); return json({ error: pErr.message }, 400); }

  await audit(admin, me, role === "admin" ? "admin-created" : "user-created", email, { role, company });

  let invited = false;
  try { invited = await sendInvite(email, name, role === "admin" ? "an administrator" : "a professional investor", password); } catch { invited = false; }
  // The one-time passphrase is returned to the console ONLY when it could not be emailed.
  return json({ ok: true, id, email, role, invited, ...(invited ? {} : { password }) });
});
