// supabase/functions/clv-mailtest/index.ts
// Delivery test for automated mail: sends a test message to each recipient, once as branded HTML (+ text
// alternative) and once as plain text only, through the normal sendMail route (Postmark when configured).
// Not callable by users: the request must carry a one-time test token whose SHA-256 is stored in
// clv_mail_test_tokens (inserted by an operator with database access; expires after 30 minutes).
//   POST { token, recipients: string[] (max 8), modes?: ["html","text"] }
//   -> { ok, results: [{ to, mode, ok, error?, mx }] }
// Deploy: supabase functions deploy clv-mailtest --no-verify-jwt
import { adminClient, cors, json, mxHosts, sendMail } from "../_shared/clv.ts";

async function sha256(s: string): Promise<string> {
  const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(h)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method" }, 405);
  const body = await req.json().catch(() => ({}));
  const admin = adminClient();
  const hash = await sha256(String(body.token || ""));
  const { data: tok } = await admin.from("clv_mail_test_tokens").select("token_hash, expires_at, used_at").eq("token_hash", hash).maybeSingle();
  if (!tok || tok.used_at || new Date(tok.expires_at).getTime() < Date.now()) return json({ error: "forbidden" }, 403);
  await admin.from("clv_mail_test_tokens").update({ used_at: new Date().toISOString() }).eq("token_hash", hash);

  const recipients: string[] = (Array.isArray(body.recipients) ? body.recipients : []).map((r: unknown) => String(r).trim().toLowerCase()).filter((r: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r)).slice(0, 8);
  const modes: string[] = (Array.isArray(body.modes) ? body.modes : ["html", "text"]).filter((m: unknown) => m === "html" || m === "text");
  const run = new Date().toISOString().slice(11, 16) + " UTC";
  const results: unknown[] = [];
  for (const to of recipients) {
    const mx = await mxHosts(to.split("@")[1]);
    for (const mode of modes) {
      const subject = `Clavoris delivery test (${mode === "html" ? "HTML" : "plain text"}) ${run}`;
      const text = `Dear Clavoris user,\n\nThis is an automated delivery test of Clavoris e-mail (${mode === "html" ? "branded HTML with a plain-text alternative" : "plain text only"}), sent to ${to} at ${run}.\n\nNo action is needed. A sample sign-in code looks like this:\n\n123456\n\nhttps://www.clavoris.com/app/login.html`;
      try { const ok = await sendMail(to, subject, text, "en", undefined, { html: mode === "html" }); results.push({ to, mode, ok, mx }); }
      catch (e) { results.push({ to, mode, ok: false, error: (e as Error).message, mx }); }
    }
  }
  return json({ ok: true, results });
});
