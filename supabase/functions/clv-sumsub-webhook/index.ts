// supabase/functions/clv-sumsub-webhook/index.ts
// Receives Sumsub applicant webhooks and updates the Clavoris KYC status.
// Verifies the X-Payload-Digest HMAC (secret SUMSUB_WEBHOOK_SECRET). Events are stored
// in clv_sumsub_events (idempotent on digest). Mapping:
//   applicantReviewed GREEN            -> verified
//   applicantReviewed RED  (RETRY)     -> kyc_retry
//   applicantReviewed RED  (FINAL)     -> rejected
//   applicantPending / applicantCreated -> kyc_pending (only from registered)
// Deploy: supabase functions deploy clv-sumsub-webhook --no-verify-jwt
import { adminClient, json } from "../_shared/clv.ts";

async function hmacHex(secret: string, body: Uint8Array, algo: string): Promise<string> {
  const hash = /512/.test(algo) ? "SHA-512" : /1$/.test(algo) ? "SHA-1" : "SHA-256";
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, body);
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method" }, 405);
  const secret = Deno.env.get("SUMSUB_WEBHOOK_SECRET");
  if (!secret) return json({ error: "webhook-not-configured" }, 503);
  const raw = new Uint8Array(await req.arrayBuffer());
  const digest = (req.headers.get("x-payload-digest") || "").toLowerCase();
  const algo = req.headers.get("x-payload-digest-alg") || "HMAC_SHA256_HEX";
  const expected = await hmacHex(secret, raw, algo);
  if (!digest || digest !== expected) return json({ error: "bad-signature" }, 401);

  const admin = adminClient();
  const ev = JSON.parse(new TextDecoder().decode(raw) || "{}");
  const type = String(ev.type || "");
  const externalUserId = String(ev.externalUserId || "");
  const applicantId = String(ev.applicantId || "");
  const answer = ev.reviewResult?.reviewAnswer || null;
  const rejectType = ev.reviewResult?.reviewRejectType || null;

  const { data: dup } = await admin.from("clv_sumsub_events").select("id").eq("digest", digest).maybeSingle();
  if (dup) return json({ ok: true, duplicate: true });
  await admin.from("clv_sumsub_events").insert({ digest, type, applicant_id: applicantId, external_user_id: externalUserId, review_answer: answer, payload: ev });

  if (externalUserId) {
    const { data: p } = await admin.from("clv_profiles").select("id, status, role").eq("id", externalUserId).maybeSingle();
    if (p) {
      const upd: Record<string, unknown> = { sumsub_applicant_id: applicantId || undefined };
      if (type === "applicantReviewed") {
        upd.kyc_review_answer = answer; upd.kyc_reject_type = rejectType; upd.kyc_reviewed_at = new Date().toISOString();
        if (answer === "GREEN") upd.status = "verified";
        else if (answer === "RED") upd.status = rejectType === "FINAL" ? "rejected" : "kyc_retry";
      } else if ((type === "applicantPending" || type === "applicantCreated") && p.status === "registered") upd.status = "kyc_pending";
      if (p.role !== "user" && upd.status === "rejected") delete upd.status; // never lock out staff
      await admin.from("clv_profiles").update(upd).eq("id", p.id);
      await admin.from("clv_sumsub_events").update({ processed_at: new Date().toISOString() }).eq("digest", digest);
    }
  }
  return json({ ok: true });
});
