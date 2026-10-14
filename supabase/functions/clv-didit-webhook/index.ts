// supabase/functions/clv-didit-webhook/index.ts
// Receives Didit verification webhooks and updates the Clavoris KYC status.
// Verifies X-Signature-V2 (HMAC-SHA256 over the canonical JSON body, secret DIDIT_WEBHOOK_SECRET)
// and rejects stale deliveries (X-Timestamp older than 5 minutes). Every event is stored once in
// clv_kyc_events (unique on event_id). Status mapping (vendor_data = Clavoris user id):
//   Approved                      -> verified
//   In Review / In Progress /
//   Awaiting User / Not Started   -> kyc_pending (only from registered / kyc_retry)
//   Declined / Abandoned / Expired-> kyc_retry   (never for staff; a Declined with a final
//                                               reason still leaves the account retryable —
//                                               a hard "rejected" is set by an admin)
//   Kyc Expired                   -> registered  (verification lapsed; user must redo it)
// Always answers within the 5 s Didit allows; heavy work is minimal.
// Deploy: supabase functions deploy clv-didit-webhook --no-verify-jwt
import { adminClient, json } from "../_shared/clv.ts";

const MAX_SKEW_S = 300;

// Didit canonicalisation: floats shortened (toFixed(2) when not integer), keys sorted recursively.
function canon(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(canon);
  if (v && typeof v === "object") {
    const o: Record<string, unknown> = {};
    for (const k of Object.keys(v as Record<string, unknown>).sort()) o[k] = canon((v as Record<string, unknown>)[k]);
    return o;
  }
  if (typeof v === "number" && !Number.isInteger(v)) return Number(v.toFixed(2));
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

type Decision = Record<string, unknown> & {
  id_verifications?: Array<Record<string, unknown>>;
  liveness_checks?: Array<Record<string, unknown>>;
  face_matches?: Array<Record<string, unknown>>;
  aml_screenings?: Array<Record<string, unknown>>;
  reviews?: Array<Record<string, unknown>>;
};
// Compact, non-sensitive summary kept on the profile (no document images, no numbers).
function summarize(d: Decision | undefined, status: string): Record<string, unknown> {
  const idv = d?.id_verifications?.[0] || {};
  const pick = (o: Record<string, unknown>, keys: string[]) => Object.fromEntries(keys.filter((k) => o[k] !== undefined).map((k) => [k, o[k]]));
  return {
    status,
    id_verification: pick(idv, ["status", "document_type", "issuing_state", "issuing_state_name", "first_name", "last_name", "date_of_birth", "expiration_date", "nationality", "warnings"]),
    liveness: pick(d?.liveness_checks?.[0] || {}, ["status", "score", "method"]),
    face_match: pick(d?.face_matches?.[0] || {}, ["status", "score"]),
    aml: pick(d?.aml_screenings?.[0] || {}, ["status", "total_hits", "score"]),
    review: pick(d?.reviews?.[0] || {}, ["new_status", "comment", "created_at", "user"]),
  };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method" }, 405);
  const secret = Deno.env.get("DIDIT_WEBHOOK_SECRET");
  if (!secret) return json({ error: "webhook-not-configured" }, 503);

  const raw = await req.text();
  const sigHeader = (req.headers.get("x-signature-v2") || "").trim().toLowerCase();
  const tsHeader = (req.headers.get("x-timestamp") || "").trim();
  const ts = Number(tsHeader);
  if (!sigHeader || !Number.isFinite(ts)) return json({ error: "bad-signature" }, 401);
  if (Math.abs(Math.floor(Date.now() / 1000) - ts) > MAX_SKEW_S) return json({ error: "stale" }, 401);

  let ev: Record<string, unknown>;
  try { ev = JSON.parse(raw); } catch { return json({ error: "bad-json" }, 400); }
  const expected = await hmacHex(secret, JSON.stringify(canon(ev)));
  if (!timingSafeEq(expected, sigHeader)) return json({ error: "bad-signature" }, 401);

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

  if (vendor) {
    const { data: p } = await admin.from("clv_profiles").select("id, status, role, kyc_session_id").eq("id", vendor).maybeSingle();
    if (p) {
      const upd: Record<string, unknown> = { kyc_provider: "didit", kyc_session_id: sessionId || p.kyc_session_id, kyc_level: "didit-kyc" };
      const staff = p.role !== "user";
      if (status === "Approved") {
        upd.status = "verified"; upd.kyc_review_answer = "GREEN"; upd.kyc_reject_type = null; upd.kyc_reviewed_at = new Date().toISOString();
        upd.kyc_summary = summarize(ev.decision as Decision, status);
      } else if (status === "Declined" || status === "Abandoned" || status === "Expired") {
        upd.kyc_review_answer = "RED"; upd.kyc_reject_type = "RETRY"; upd.kyc_reviewed_at = new Date().toISOString();
        upd.kyc_summary = summarize(ev.decision as Decision, status);
        if (!staff && p.status !== "verified") upd.status = "kyc_retry";
      } else if (status === "Kyc Expired") {
        upd.kyc_summary = summarize(ev.decision as Decision, status);
        if (!staff) upd.status = "registered";
      } else if (["In Review", "In Progress", "Awaiting User", "Not Started", "Resubmitted"].includes(status)) {
        if (p.status === "registered" || p.status === "kyc_retry") upd.status = "kyc_pending";
      }
      const { error: updErr } = await admin.from("clv_profiles").update(upd).eq("id", p.id);
      if (updErr) console.error("profile update:", updErr.message);
      await admin.from("clv_kyc_events").update({ processed_at: new Date().toISOString() }).eq("id", ins?.id);
    }
  }
  return json({ ok: true });
});
