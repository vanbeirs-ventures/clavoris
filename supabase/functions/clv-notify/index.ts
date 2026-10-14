// supabase/functions/clv-notify/index.ts
// Scheduled notification run (pg_cron → pg_net every 15 minutes, header x-clavoris-cron) and
// the admin "Scan now" button:
//   { action: "scan" }  -> data-room file watcher (new / updated files), "new investment" mails,
//                          access-expiry reminders (7 days / 24 h before the end date)
// The run is rate-limited (one scan per 4 minutes) because the cron trigger carries no secret.
// Deploy: supabase functions deploy clv-notify --no-verify-jwt (CI: .github/workflows/deploy-functions.yml,
// target project Clavoris gihetiiuqawfhlwixncn since 2026-10-14)
import { adminClient, cors, json, requireAdmin } from "../_shared/clv.ts";
import { expiryReminders, notifyNewProducts, scanRooms } from "../_shared/notify.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method" }, 405);
  const admin = adminClient();
  const body = await req.json().catch(() => ({}));
  const action = String(body.action || "scan");
  const fromCron = req.headers.get("x-clavoris-cron") === "1";
  if (!fromCron) { const me = await requireAdmin(admin, req); if (me instanceof Response) return me; }
  if (action !== "scan") return json({ error: "bad-action" }, 400);

  const { data: st } = await admin.from("clv_settings").select("value").eq("key", "notify_scan").maybeSingle();
  const last = (st?.value as { at?: string } | null)?.at;
  if (fromCron && last && Date.now() - new Date(last).getTime() < 4 * 60 * 1000) return json({ ok: true, skipped: "recent" });
  await admin.from("clv_settings").upsert({ key: "notify_scan", value: { at: new Date().toISOString() } }, { onConflict: "key" });

  const rooms = await scanRooms(admin).catch((e) => { console.error("clv-notify rooms", (e as Error).message); return null; });
  const products = await notifyNewProducts(admin).catch((e) => { console.error("clv-notify products", (e as Error).message); return -1; });
  const expiry = await expiryReminders(admin).catch((e) => { console.error("clv-notify expiry", (e as Error).message); return null; });
  const result = { ok: true, at: new Date().toISOString(), rooms, product_mails: products, expiry };
  await admin.from("clv_settings").upsert({ key: "notify_scan", value: { at: result.at, last: result } }, { onConflict: "key" });
  return json(result);
});
