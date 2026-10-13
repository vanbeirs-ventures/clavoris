// supabase/functions/clv-nc-connect/index.ts
// Connects the data rooms to Nextcloud through Login Flow v2 (admin only), so no app
// password is ever copied by hand. The flow: "start" asks Nextcloud for a login URL and
// a poll token; the admin signs in to Nextcloud in that window and grants access; "poll"
// asks Nextcloud whether the grant happened and, when it has, stores the app password
// server-side (clv_settings key "nc", service role only).
//   { action: "status" }                  -> { connected, user, url, checked, error? }
//   { action: "start" }                   -> { login, token }  (open `login` in a new tab)
//   { action: "poll", token }             -> { pending: true } | { ok: true, user }
//   { action: "disconnect" }              -> removes the stored connection
// Secrets: NC_URL (base URL of the Nextcloud). Deploy with --no-verify-jwt.
import { adminClient, audit, cors, json, requireAdmin } from "../_shared/clv.ts";

const NC_URL = (Deno.env.get("NC_URL") || "").replace(/\/$/, "");
const polls = new Map<string, string>(); // token -> poll endpoint (per instance; endpoint also returned to the client)

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method" }, 405);
  const admin = adminClient();
  const me = await requireAdmin(admin, req);
  if (me instanceof Response) return me;
  const body = await req.json().catch(() => ({}));
  const action = String(body.action || "status");
  if (!NC_URL) return json({ error: "nc-url-not-configured" }, 503);

  if (action === "status") {
    const { data } = await admin.from("clv_settings").select("value, updated_at").eq("key", "nc").maybeSingle();
    const v = (data?.value || {}) as { url?: string; user?: string; pass?: string };
    if (!v.user || !v.pass) return json({ ok: true, connected: false, url: NC_URL });
    // Live check: PROPFIND depth 0 on the user's root.
    let checked = false, error: string | null = null;
    try {
      const r = await fetch(`${v.url}/remote.php/dav/files/${encodeURIComponent(v.user)}/`, { method: "PROPFIND", headers: { authorization: "Basic " + btoa(`${v.user}:${v.pass}`), depth: "0" } });
      checked = r.ok; if (!r.ok) error = `nc ${r.status}`;
    } catch (e) { error = (e as Error).message; }
    return json({ ok: true, connected: true, user: v.user, url: v.url, since: data?.updated_at, checked, error });
  }

  if (action === "start") {
    const r = await fetch(`${NC_URL}/index.php/login/v2`, { method: "POST", headers: { "user-agent": "Clavoris data rooms" } });
    if (!r.ok) return json({ error: `nc-login-flow ${r.status}` }, 502);
    const d = await r.json();
    polls.set(d.poll.token, d.poll.endpoint);
    return json({ ok: true, login: d.login, token: d.poll.token, endpoint: d.poll.endpoint });
  }

  if (action === "poll") {
    const token = String(body.token || "");
    const endpoint = polls.get(token) || String(body.endpoint || "");
    if (!token || !endpoint || !endpoint.startsWith(NC_URL)) return json({ error: "bad-token" }, 400);
    const r = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: `token=${encodeURIComponent(token)}` });
    if (r.status === 404) return json({ ok: true, pending: true });
    if (!r.ok) return json({ error: `nc-poll ${r.status}` }, 502);
    const d = await r.json() as { server: string; loginName: string; appPassword: string };
    await admin.from("clv_settings").upsert({ key: "nc", value: { url: (d.server || NC_URL).replace(/\/$/, ""), user: d.loginName, pass: d.appPassword }, updated_at: new Date().toISOString(), updated_by: me.id });
    polls.delete(token);
    await audit(admin, me, "nextcloud-connected", d.loginName, { server: d.server });
    return json({ ok: true, user: d.loginName });
  }

  if (action === "disconnect") {
    await admin.from("clv_settings").delete().eq("key", "nc");
    await audit(admin, me, "nextcloud-disconnected", "", {});
    return json({ ok: true });
  }
  return json({ error: "bad-action" }, 400);
});
