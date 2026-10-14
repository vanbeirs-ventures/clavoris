// supabase/functions/clv-kyc-token/index.ts
// Starts (or resumes) a Didit identity-verification session for the signed-in user and
// returns the hosted verification URL the app opens. vendor_data is the Clavoris user id;
// Didit reuses an unfinished session for the same vendor_data, so calling this again is safe.
// Results come back through clv-didit-webhook.
// Secrets: DIDIT_API_KEY, DIDIT_WORKFLOW_ID (console workflow id); optional CLAVORIS_APP_URL.
// Deploy: supabase functions deploy clv-kyc-token --no-verify-jwt
import { adminClient, APP_URL, clientIp, cors, json, requireUser } from "../_shared/clv.ts";

const DIDIT_URL = "https://verification.didit.me";
const LANGS = new Set(["en", "nl", "fr", "de", "es", "it"]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method" }, 405);
  const admin = adminClient();
  const me = await requireUser(admin, req);
  if (me instanceof Response) return me;

  const apiKey = Deno.env.get("DIDIT_API_KEY"), workflow = Deno.env.get("DIDIT_WORKFLOW_ID");
  if (!apiKey || !workflow) return json({ error: "kyc-not-configured" }, 503);
  if (me.status === "verified") return json({ ok: true, verified: true });
  if (me.status === "rejected" || me.status === "suspended") return json({ error: "kyc-closed" }, 403);

  const body = await req.json().catch(() => ({}));
  const next = typeof body.next === "string" && /^[a-z0-9_./?=&-]{1,200}$/i.test(body.next) && !body.next.startsWith("/") && !body.next.includes("//") ? body.next : "portal.html";
  const lang = LANGS.has(String(me.lang || "")) ? String(me.lang) : "en";
  const callback = `${APP_URL}/kyc.html?next=${encodeURIComponent(next)}`;

  const res = await fetch(`${DIDIT_URL}/v3/session/`, {
    method: "POST",
    headers: { "x-api-key": apiKey, "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      workflow_id: workflow,
      vendor_data: me.id,
      callback,
      language: lang,
      contact_details: { email: me.email },
      metadata: { app: "clavoris", email: me.email },
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.url || !data.session_id) {
    console.error("didit session:", res.status, JSON.stringify(data).slice(0, 500));
    return json({ error: res.status === 403 ? "kyc-not-configured" : "kyc-token-failed" }, 502);
  }

  const upd: Record<string, unknown> = { kyc_provider: "didit", kyc_session_id: String(data.session_id), kyc_session_number: data.session_number ?? null, kyc_level: "didit-kyc" };
  if (me.status === "registered") upd.status = "kyc_pending";
  await admin.from("clv_profiles").update(upd).eq("id", me.id);
  // Timeline entry (idempotent per session: Didit hands back the same unfinished session).
  await admin.from("clv_kyc_events").upsert({
    provider: "didit", event_id: `session:${data.session_id}`, webhook_type: "session.created", session_id: String(data.session_id),
    user_id: me.id, status: String(data.status || "Not Started"), environment: null,
    payload: { session_number: data.session_number ?? null, workflow_id: workflow, language: lang, ip: clientIp(req), user_agent: req.headers.get("user-agent") || "" },
    processed_at: new Date().toISOString(),
  }, { onConflict: "provider,event_id", ignoreDuplicates: true }).then(() => {}, (e: Error) => console.error("kyc event:", e.message));
  return json({ ok: true, url: String(data.url), session_id: String(data.session_id), status: String(data.status || ""), email: me.email });
});
