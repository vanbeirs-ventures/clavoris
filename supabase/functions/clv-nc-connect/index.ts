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
// Secrets: NC_URL (base URL of the Nextcloud; only needed to make a NEW connection — an existing stored
// connection carries its own url). Deploy with --no-verify-jwt.
import { adminClient, audit, cors, json, requireAdmin } from "../_shared/clv.ts";

const NC_URL_ENV = (Deno.env.get("NC_URL") || "").replace(/\/$/, "");
const polls = new Map<string, string>(); // token -> poll endpoint (per instance; endpoint also returned to the client)

// Login Flow v2 returns the *login name* (may be an e-mail address); WebDAV paths need the
// account id. Resolve it through OCS with the app password; fall back to the login name.
async function resolveUid(url: string, loginName: string, pass: string): Promise<string> {
  try {
    const r = await fetch(`${url}/ocs/v2.php/cloud/user?format=json`, { headers: { authorization: "Basic " + btoa(`${loginName}:${pass}`), "ocs-apirequest": "true" } });
    if (!r.ok) return loginName;
    const d = await r.json();
    return String(d?.ocs?.data?.id || loginName);
  } catch { return loginName; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method" }, 405);
  const admin = adminClient();
  const me = await requireAdmin(admin, req);
  if (me instanceof Response) return me;
  const body = await req.json().catch(() => ({}));
  const action = String(body.action || "status");
  const { data: stored } = await admin.from("clv_settings").select("value, updated_at").eq("key", "nc").maybeSingle();
  const storedV = (stored?.value || {}) as { url?: string; user?: string; pass?: string; login?: string };
  const NC_URL = NC_URL_ENV || (storedV.url || "").replace(/\/$/, "");
  if (!NC_URL) return json({ error: "nc-url-not-configured" }, 503);

  if (action === "status") {
    const data = stored;
    const v = storedV;
    if (!v.user || !v.pass) return json({ ok: true, connected: false, url: NC_URL });
    // Live check: PROPFIND depth 0 on the user's root.
    const check = async (user: string) => {
      const r = await fetch(`${v.url}/remote.php/dav/files/${encodeURIComponent(user)}/`, { method: "PROPFIND", headers: { authorization: "Basic " + btoa(`${user}:${v.pass}`), depth: "0" } });
      return r.status;
    };
    let checked = false, error: string | null = null;
    try {
      let st = await check(v.user);
      if (st === 404 || st === 401) {
        // Stored login name is not the account id (e.g. an e-mail): resolve and self-heal.
        const uid = await resolveUid(v.url!, v.login || v.user, v.pass);
        if (uid !== v.user) {
          st = await check(uid);
          if (st >= 200 && st < 300) {
            await admin.from("clv_settings").update({ value: { ...v, user: uid, login: v.login || v.user }, updated_at: new Date().toISOString() }).eq("key", "nc");
            v.user = uid;
          }
        }
      }
      checked = st >= 200 && st < 300; if (!checked) error = `nc ${st}`;
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
    const url = (d.server || NC_URL).replace(/\/$/, "");
    const uid = await resolveUid(url, d.loginName, d.appPassword);
    const { error } = await admin.from("clv_settings").upsert({ key: "nc", value: { url, user: uid, login: d.loginName, pass: d.appPassword }, updated_at: new Date().toISOString(), updated_by: me.id });
    if (error) { console.error("clv-nc-connect: store failed", error.message); return json({ error: "store-failed: " + error.message }, 500); }
    polls.delete(token);
    await audit(admin, me, "nextcloud-connected", uid, { server: d.server, login: d.loginName });
    return json({ ok: true, user: uid });
  }

  if (action === "disconnect") {
    await admin.from("clv_settings").delete().eq("key", "nc");
    await audit(admin, me, "nextcloud-disconnected", "", {});
    return json({ ok: true });
  }
  return json({ error: "bad-action" }, 400);
});
