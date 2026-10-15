// supabase/functions/clv-mail-events/index.ts
// Postmark webhook (Delivery + Bounce) for Clavoris mail. Flow per message:
//   1. Mail goes out as branded HTML (+ text alternative); it is recorded in clv_mail_log.
//   2. Delivery event -> status "delivered". Nothing else happens.
//   3. Bounce of the HTML attempt -> status "resent_text"; the same mail is re-sent once as plain text only.
//   4. Bounce of the plain-text attempt (or a failed re-send) -> status "failed" with red_flag = true, for reporting.
// Message bodies (which may hold one-time codes) are erased once a message reaches a final status.
// Called by Postmark only: the URL carries ?key=..., whose SHA-256 must be in clv_mail_webhook_keys.
// Deploy: supabase functions deploy clv-mail-events --no-verify-jwt
import { adminClient, cors, json, sendMail } from "../_shared/clv.ts";

async function sha256(s: string): Promise<string> {
  const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(h)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
const mask = (s: string) => String(s || "").replace(/\b\d{6}\b/g, "******");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method" }, 405);
  const admin = adminClient();
  const key = new URL(req.url).searchParams.get("key") || "";
  const { data: k } = await admin.from("clv_mail_webhook_keys").select("key_hash").eq("key_hash", await sha256(key)).maybeSingle();
  if (!k) return json({ error: "forbidden" }, 403);

  const ev = await req.json().catch(() => ({}));
  const type = String(ev.RecordType || "");
  const messageId = String(ev.MessageID || "");
  if (!messageId || (type !== "Delivery" && type !== "Bounce")) return json({ ok: true, ignored: type });
  const { data: row } = await admin.from("clv_mail_log").select("id, recipient, subject, body, lang, cta, format, status").eq("message_id", messageId).maybeSingle();
  if (!row) return json({ ok: true, unknown: messageId });
  const now = new Date().toISOString();

  if (type === "Delivery") {
    await admin.from("clv_mail_log").update({ status: "delivered", detail: String(ev.Details || "").slice(0, 500), subject: mask(row.subject), body: null, updated_at: now }).eq("id", row.id);
    return json({ ok: true, delivered: messageId });
  }

  // Bounce
  const detail = `${ev.Type || "Bounce"}: ${String(ev.Details || ev.Description || "").slice(0, 450)}`;
  if (row.status === "resent_text" || row.status === "failed") return json({ ok: true, duplicate: messageId });
  if (row.format === "html" && row.body) {
    await admin.from("clv_mail_log").update({ status: "resent_text", detail, updated_at: now }).eq("id", row.id);
    try {
      await sendMail(row.recipient, row.subject, row.body, row.lang || "en", row.cta ?? undefined, { html: false, parent: row.id });
      await admin.from("clv_mail_log").update({ subject: mask(row.subject), body: null }).eq("id", row.id);
      console.log("mail bounce -> plain-text retry:", row.recipient, "|", mask(row.subject));
      return json({ ok: true, resent: row.recipient });
    } catch (e) {
      await admin.from("clv_mail_log").update({ status: "failed", red_flag: true, detail: `${detail} | retry failed: ${(e as Error).message}`.slice(0, 900), subject: mask(row.subject), body: null, updated_at: now }).eq("id", row.id);
      console.error("mail RED FLAG (retry failed):", row.recipient, "|", mask(row.subject));
      return json({ ok: true, red_flag: row.recipient });
    }
  }
  await admin.from("clv_mail_log").update({ status: "failed", red_flag: true, detail, subject: mask(row.subject), body: null, updated_at: now }).eq("id", row.id);
  console.error("mail RED FLAG:", row.recipient, "|", mask(row.subject), "|", detail);
  return json({ ok: true, red_flag: row.recipient });
});
