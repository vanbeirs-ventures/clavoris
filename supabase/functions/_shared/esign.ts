// e-Signature.eu (qualified electronic signatures: itsme®, Evrotrust; advanced: Veriff; simple: OTP e-mail).
// REST API: https://www.e-signature.eu/wp-json/signature/<endpoint>?userid=<ESIGN_USER_ID>, header x-api-key.
// Secrets: ESIGN_API_KEY, ESIGN_USER_ID. Callback URL (dashboard › My account › Signatures API):
//   https://<project>.supabase.co/functions/v1/clv-esign-webhook
// Credits are consumed per completed signature (itsme/Evrotrust 1, Veriff 0.7, OTP 0.4), not per request.
export const ESIGN_BASE = "https://www.e-signature.eu/wp-json/signature/";
export const ESIGN_METHODS = () => (Deno.env.get("ESIGN_METHODS") || "itsme-qes-signature,evrotrust-signature").split(",").map((s) => s.trim()).filter(Boolean);

export function esignConfigured(): boolean { return !!(Deno.env.get("ESIGN_API_KEY") && Deno.env.get("ESIGN_USER_ID")); }

export type EsignSigner = { firstname: string; lastname: string; email: string; phone?: string; sign_first?: boolean; status: string; signing_time?: string | null; signing_method?: string | null; verified_firstname?: string | null; verified_lastname?: string | null; signature_link?: string | null };
export type EsignRequest = { id_sign: number | string; lang: string; doc_name: string; send_email: boolean; from_api?: boolean; signature_redirect?: string; status_id: "pending" | "finished" | "cancelled" | "deleted" | "skipped" | string; date_status?: string; signers: Record<string, EsignSigner>; pdf_file_base64?: string };

export async function esign<T = any>(method: "GET" | "POST" | "PATCH" | "DELETE", path: string, body?: unknown, query: Record<string, string | number> = {}): Promise<{ ok: boolean; status: number; data: T | null; text: string }> {
  const key = Deno.env.get("ESIGN_API_KEY") || "", user = Deno.env.get("ESIGN_USER_ID") || "";
  const u = new URL(ESIGN_BASE + path.replace(/^\//, ""));
  u.searchParams.set("userid", user);
  for (const [k, v] of Object.entries(query)) u.searchParams.set(k, String(v));
  const res = await fetch(u.toString(), { method, headers: { "x-api-key": key, "accept": "application/json", ...(body ? { "content-type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let data: T | null = null;
  try { data = JSON.parse(text); } catch { /* not json */ }
  return { ok: res.ok, status: res.status, data, text };
}

// Unwrap {success, result} envelopes.
export function esignResult<T = any>(d: any): T | null { if (!d) return null; if (d.result !== undefined) return d.result as T; return d as T; }

export async function esignGetRequest(idSign: string | number): Promise<EsignRequest | null> {
  const r = await esign("GET", "getRequest", undefined, { id_sign: idSign });
  if (!r.ok) { console.error("esign getRequest", r.status, r.text.slice(0, 300)); return null; }
  return esignResult<EsignRequest>(r.data);
}

export async function esignBalance(): Promise<number | null> {
  const r = await esign("GET", "requestBalance");
  const d: any = esignResult(r.data);
  if (!r.ok || d == null) return null;
  const n = typeof d === "number" ? d : Number(d.credits_balance ?? d.balance ?? d.credits ?? d.credit ?? d);
  return Number.isFinite(n) ? n : null;
}

export async function esignAuditTrail(idSign: string | number): Promise<Uint8Array | null> {
  const r = await esign("GET", "requestAuditTrail", undefined, { id_sign: idSign });
  const d: any = esignResult(r.data);
  const b64 = d?.audit_trail_base64 || d?.pdf_file_base64;
  if (!r.ok || !b64) return null;
  return b64ToBytes(b64);
}

export function b64ToBytes(b64: string): Uint8Array { const clean = String(b64).replace(/^data:[^,]*,/, "").replace(/\s/g, ""); return Uint8Array.from(atob(clean), (ch) => ch.charCodeAt(0)); }
export function bytesToB64(bytes: Uint8Array): string { let s = ""; const CH = 0x8000; for (let i = 0; i < bytes.length; i += CH) s += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + CH))); return btoa(s); }

// "Steve Van Beirs" -> { firstname: "Steve", lastname: "Van Beirs" }.
export function splitName(full: string | null | undefined, email: string): { firstname: string; lastname: string } {
  const parts = String(full || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return { firstname: parts[0], lastname: parts.slice(1).join(" ") };
  if (parts.length === 1) return { firstname: parts[0], lastname: parts[0] };
  const local = email.split("@")[0];
  return { firstname: local, lastname: local };
}

// Phone in E.164-ish form: "+32 475 12 34 56" -> "+32475123456"; "0032…" -> "+32…".
export function normalizePhone(p: string | null | undefined): string {
  let s = String(p || "").replace(/[\s.\-()]/g, "");
  if (s.startsWith("00")) s = "+" + s.slice(2);
  return /^\+\d{8,15}$/.test(s) ? s : "";
}

// A signer counts as signed when the provider reports a signing time or a non-pending status.
export function signerSigned(s: EsignSigner | undefined): boolean { if (!s) return false; const st = String(s.status || "").toLowerCase(); return !!s.signing_time || st === "signed" || st === "finished" || st === "completed"; }
