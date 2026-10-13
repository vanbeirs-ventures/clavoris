// Sumsub REST helper (HMAC-signed requests). Secrets: SUMSUB_APP_TOKEN, SUMSUB_SECRET_KEY.
const SUMSUB_URL = "https://api.sumsub.com";

async function sig(secret: string, ts: number, method: string, path: string, body: Uint8Array): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const pre = new TextEncoder().encode(`${ts}${method}${path}`);
  const data = new Uint8Array(pre.length + body.length); data.set(pre); data.set(body, pre.length);
  const s = await crypto.subtle.sign("HMAC", key, data);
  return Array.from(new Uint8Array(s)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function sumsubConfigured(): boolean { return !!(Deno.env.get("SUMSUB_APP_TOKEN") && Deno.env.get("SUMSUB_SECRET_KEY")); }

// Signed request. `body` may be a JSON object, a FormData (multipart) or undefined.
export async function sumsub(method: string, path: string, body?: unknown): Promise<Response> {
  const appToken = Deno.env.get("SUMSUB_APP_TOKEN") || "", secret = Deno.env.get("SUMSUB_SECRET_KEY") || "";
  let bytes = new Uint8Array(0), contentType: string | null = null;
  if (body instanceof FormData) {
    const r = new Response(body); contentType = r.headers.get("content-type"); bytes = new Uint8Array(await r.arrayBuffer());
  } else if (body !== undefined) { bytes = new TextEncoder().encode(JSON.stringify(body)); contentType = "application/json"; }
  const ts = Math.floor(Date.now() / 1000);
  const headers: Record<string, string> = { "X-App-Token": appToken, "X-App-Access-Sig": await sig(secret, ts, method, path, bytes), "X-App-Access-Ts": String(ts), accept: "application/json" };
  if (contentType) headers["content-type"] = contentType;
  return await fetch(SUMSUB_URL + path, { method, headers, body: bytes.length ? bytes : undefined });
}

export async function sumsubJson<T = any>(method: string, path: string, body?: unknown): Promise<{ ok: boolean; status: number; data: T }> {
  const r = await sumsub(method, path, body);
  const data = await r.json().catch(() => ({}));
  if (!r.ok) console.error("sumsub", method, path, r.status, JSON.stringify(data).slice(0, 300));
  return { ok: r.ok, status: r.status, data };
}

// WebSDK access token for a user on a given level.
export async function sumsubAccessToken(externalUserId: string, levelName: string, ttl = 1800): Promise<string | null> {
  const r = await sumsubJson<{ token?: string }>("POST", `/resources/accessTokens?userId=${encodeURIComponent(externalUserId)}&levelName=${encodeURIComponent(levelName)}&ttlInSecs=${ttl}`);
  return r.ok ? r.data.token || null : null;
}

// Applicant id for an external user id (null when the applicant does not exist yet).
export async function sumsubApplicantId(externalUserId: string): Promise<string | null> {
  const r = await sumsubJson<{ id?: string }>("GET", `/resources/applicants/-;externalUserId=${encodeURIComponent(externalUserId)}/one`);
  return r.ok ? r.data.id || null : null;
}
