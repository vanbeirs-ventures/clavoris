// supabase/functions/clv-kyc-token/index.ts
// Issues a Sumsub WebSDK access token for the signed-in user so they can complete
// identity verification (KYC) in the Clavoris app. The applicant's external id is the
// Clavoris user id; results come back through clv-sumsub-webhook.
// Secrets: SUMSUB_APP_TOKEN, SUMSUB_SECRET_KEY, SUMSUB_LEVEL_NAME (e.g. "clavoris-investor").
// Deploy: supabase functions deploy clv-kyc-token --no-verify-jwt
import { adminClient, cors, json, requireUser } from "../_shared/clv.ts";

const SUMSUB_URL = "https://api.sumsub.com";

async function sumsubSig(secret: string, ts: number, method: string, path: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${ts}${method}${path}${body}`));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method" }, 405);
  const admin = adminClient();
  const me = await requireUser(admin, req);
  if (me instanceof Response) return me;

  const appToken = Deno.env.get("SUMSUB_APP_TOKEN"), secret = Deno.env.get("SUMSUB_SECRET_KEY");
  const level = Deno.env.get("SUMSUB_LEVEL_NAME") || "basic-kyc-level";
  if (!appToken || !secret) return json({ error: "kyc-not-configured" }, 503);
  if (me.status === "verified") return json({ ok: true, verified: true });

  const path = `/resources/accessTokens?userId=${encodeURIComponent(me.id)}&levelName=${encodeURIComponent(level)}&ttlInSecs=1800`;
  const ts = Math.floor(Date.now() / 1000);
  const sig = await sumsubSig(secret, ts, "POST", path, "");
  const res = await fetch(SUMSUB_URL + path, { method: "POST", headers: { "X-App-Token": appToken, "X-App-Access-Sig": sig, "X-App-Access-Ts": String(ts), accept: "application/json" } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.token) { console.error("sumsub token:", res.status, JSON.stringify(data)); return json({ error: "kyc-token-failed" }, 502); }

  if (me.status === "registered") await admin.from("clv_profiles").update({ status: "kyc_pending", kyc_level: level }).eq("id", me.id);
  return json({ ok: true, token: data.token, level, email: me.email });
});
