// supabase/functions/clv-mailtest/index.ts
// Delivery test for automated mail: sends a test message to each recipient, once as branded HTML (+ text
// alternative) and once as plain text only, through the normal sendMail route (Postmark when configured).
// Not callable by users: the request must carry a one-time test token whose SHA-256 is stored in
// clv_mail_test_tokens (inserted by an operator with database access; expires after 30 minutes).
//   POST { token, recipients: string[] (max 8), modes?: ["html","text"] }
//   -> { ok, results: [{ to, mode, ok, error?, mx }] }
//   POST { token, status: true } -> delivery events of the last 30 Postmark messages (sends nothing)
//   POST { token, register_webhook: key } -> creates/updates the Postmark Delivery+Bounce webhook to clv-mail-events
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

  // { token, register_webhook: "<key>" } -> creates or updates the Postmark webhook (Delivery + Bounce) that
  // calls clv-mail-events?key=<key>. The key's SHA-256 must already be in clv_mail_webhook_keys.
  if (typeof body.register_webhook === "string" && body.register_webhook.length >= 32) {
    const pm = Deno.env.get("CLAVORIS_POSTMARK_TOKEN");
    if (!pm) return json({ error: "no-postmark" }, 400);
    const h = { "Accept": "application/json", "Content-Type": "application/json", "X-Postmark-Server-Token": pm };
    const base = `${Deno.env.get("SUPABASE_URL")}/functions/v1/clv-mail-events`;
    const cfg = { Url: `${base}?key=${encodeURIComponent(body.register_webhook)}`, MessageStream: "outbound", Triggers: { Delivery: { Enabled: true }, Bounce: { Enabled: true, IncludeContent: false }, Open: { Enabled: false }, Click: { Enabled: false }, SpamComplaint: { Enabled: false, IncludeContent: false }, SubscriptionChange: { Enabled: false } } };
    const list = await (await fetch("https://api.postmarkapp.com/webhooks?MessageStream=outbound", { headers: h })).json().catch(() => ({}));
    const existing = (list.Webhooks || []).find((w: any) => String(w.Url || "").startsWith(base));
    const res = await fetch(existing ? `https://api.postmarkapp.com/webhooks/${existing.ID}` : "https://api.postmarkapp.com/webhooks", { method: existing ? "PUT" : "POST", headers: h, body: JSON.stringify(cfg) });
    const j = await res.json().catch(() => ({}));
    return json({ ok: res.ok, id: j.ID, updated: !!existing, error: res.ok ? undefined : j.Message });
  }

  // { token, status: true } -> delivery events of the last Postmark messages (no mail is sent).
  if (body.status === true) {
    const pm = Deno.env.get("CLAVORIS_POSTMARK_TOKEN");
    if (!pm) return json({ error: "no-postmark" }, 400);
    const h = { "Accept": "application/json", "X-Postmark-Server-Token": pm };
    const list = await (await fetch("https://api.postmarkapp.com/messages/outbound?count=30&offset=0", { headers: h })).json();
    const out: unknown[] = [];
    for (const m of list.Messages || []) {
      const d = await (await fetch(`https://api.postmarkapp.com/messages/outbound/${m.MessageID}/details`, { headers: h })).json().catch(() => ({}));
      out.push({
        to: (m.Recipients || []).join(","), subject: String(m.Subject || "").replace(/\b\d{6}\b/g, "******"), status: m.Status, at: m.ReceivedAt,
        events: (d.MessageEvents || []).map((e: any) => ({ type: e.Type, at: e.ReceivedAt, detail: e.Details?.DeliveryMessage || e.Details?.Summary || e.Details?.BounceType || "" })),
      });
    }
    return json({ ok: true, messages: out });
  }

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
