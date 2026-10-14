// supabase/functions/clv-didit-webhook/index.ts
// Receives Didit verification webhooks and updates the Clavoris KYC status (see _shared/kyc.ts for
// the status mapping). Accepts either X-Signature-V2 (HMAC-SHA256 over the canonical JSON: keys sorted,
// compact, Unicode unescaped, whole-valued floats as integers) or X-Signature (HMAC-SHA256 over the raw
// body), secret DIDIT_WEBHOOK_SECRET; rejects deliveries whose X-Timestamp is older than 5 minutes.
// Every event is stored once in clv_kyc_events (unique on event_id).
// Always answers within the 5 s Didit allows; heavy work is minimal.
// Deploy: supabase functions deploy clv-didit-webhook --no-verify-jwt
import { adminClient, json } from "../_shared/clv.ts";
import { applyKycStatus, type Decision } from "../_shared/kyc.ts";

const MAX_SKEW_S = 300;

// Didit canonicalisation: keys sorted recursively, compact, Unicode unescaped; whole-valued floats are
// integers already after JSON.parse, and JSON.stringify prints the same shortest form as Python.
function canon(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(canon);
  if (v && typeof v === "object") {
    const o: Record<string, unknown> = {};
    for (const k of Object.keys(v as Record<string, unknown>).sort()) o[k] = canon((v as Record<string, unknown>)[k]);
    return o;
  }
  return v;
}
async function hmacHex(secret: string, msg: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(msg));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
function timingSafeEq(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method" }, 405);
  const secret = Deno.env.get("DIDIT_WEBHOOK_SECRET");
  if (!secret) return json({ error: "webhook-not-configured" }, 503);

  const raw = await req.text();
  const sigV2 = (req.headers.get("x-signature-v2") || "").trim().toLowerCase();
  const sigV1 = (req.headers.get("x-signature") || "").trim().toLowerCase();
  const tsHeader = (req.headers.get("x-timestamp") || "").trim();
  const ts = Number(tsHeader);
  if ((!sigV1 && !sigV2) || !Number.isFinite(ts)) return json({ error: "bad-signature" }, 401);
  if (Math.abs(Math.floor(Date.now() / 1000) - ts) > MAX_SKEW_S) return json({ error: "stale" }, 401);

  let ev: Record<string, unknown>;
  try { ev = JSON.parse(raw); } catch { return json({ error: "bad-json" }, 400); }
  const okV1 = !!sigV1 && timingSafeEq(await hmacHex(secret, raw), sigV1);
  const okV2 = !okV1 && !!sigV2 && timingSafeEq(await hmacHex(secret, JSON.stringify(canon(ev))), sigV2);
  if (!okV1 && !okV2) { console.error("didit signature mismatch", { type: ev.webhook_type, status: ev.status, v1: !!sigV1, v2: !!sigV2 }); return json({ error: "bad-signature" }, 401); }

  const admin = adminClient();
  const eventId = String(ev.event_id || `${ev.session_id}:${ev.status}:${ev.timestamp ?? ts}`);
  const sessionId = String(ev.session_id || "");
  const status = String(ev.status || "");
  const vendor = String(ev.vendor_data || "");
  const webhookType = String(ev.webhook_type || "");
  const environment = String(ev.environment || "");

  const { data: ins, error: insErr } = await admin.from("clv_kyc_events")
    .insert({ provider: "didit", event_id: eventId, webhook_type: webhookType, session_id: sessionId, user_id: /^[0-9a-f-]{36}$/i.test(vendor) ? vendor : null, status, environment, payload: ev })
    .select("id").maybeSingle();
  if (insErr) {
    if (/duplicate|unique/i.test(insErr.message)) return json({ ok: true, duplicate: true });
    console.error("clv_kyc_events insert:", insErr.message);
    return json({ error: "store-failed" }, 500);
  }

  if (/^[0-9a-f-]{36}$/i.test(vendor) && (webhookType === "status.updated" || !webhookType)) {
    const applied = await applyKycStatus(admin, vendor, sessionId, status, ev.decision as Decision | undefined);
    if (applied) await admin.from("clv_kyc_events").update({ processed_at: new Date().toISOString() }).eq("id", ins?.id);
  }
  return json({ ok: true });
});
