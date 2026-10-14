// supabase/functions/clv-esign-webhook/index.ts
// Callback of e-Signature.eu: the provider POSTs the signature request (same JSON as the API) on
// every change; pdf_file_base64 is included once the request is finished. The callback carries no
// signature, so nothing in the body is trusted: the request is re-fetched from the provider with the
// API key and the contract is synchronised from that (syncContract). The posted PDF is only used
// when the re-fetched status is "finished". Deploy with --no-verify-jwt.
// Callback URL: https://<project>.supabase.co/functions/v1/clv-esign-webhook
import { adminClient, cors, json } from "../_shared/clv.ts";
import { esignConfigured, type EsignRequest } from "../_shared/esign.ts";
import { type Contract, logEvent, syncContract } from "../_shared/contracts.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method === "GET") return json({ ok: true, service: "clv-esign-webhook" });
  if (req.method !== "POST") return json({ error: "method" }, 405);
  if (!esignConfigured()) return json({ error: "not-configured" }, 503);
  const raw = await req.text();
  let body: any = null;
  try { body = JSON.parse(raw); } catch { /* form-encoded? */ try { body = Object.fromEntries(new URLSearchParams(raw)); } catch { body = null; } }
  const given: EsignRequest | null = body?.result && typeof body.result === "object" ? body.result : body;
  const idSign = given?.id_sign != null ? String(given.id_sign) : "";
  if (!idSign) { console.warn("esign webhook without id_sign", raw.slice(0, 200)); return json({ ok: true, ignored: "no-id_sign" }); }

  const admin = adminClient();
  const { data: c } = await admin.from("clv_contracts").select("*").eq("esign_id_sign", idSign).maybeSingle();
  if (!c) { console.warn("esign webhook unknown request", idSign); return json({ ok: true, ignored: "unknown-request" }); }
  const res = await syncContract(admin, c as Contract, given);
  await logEvent(admin, (c as Contract).id, null, "provider-callback", { esign_id_sign: idSign, status_id: given?.status_id || null, result: res.state, error: res.error || null, with_pdf: !!given?.pdf_file_base64 });
  // 2xx acknowledges; a provider-side failure (fetch/PDF missing) returns 500 so the provider retries within the hour.
  if (!res.ok && res.error && res.error !== "no-request") return json({ ok: false, error: res.error }, 500);
  return json({ ok: true, state: res.state });
});
