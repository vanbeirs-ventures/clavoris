// supabase/functions/clv-audit/index.ts
// Personal audit trail of the signed-in user.
//   { action: "login" }  -> records a successful sign-in (called by the app right after login;
//                           the IP address and user agent are taken server-side)
//   { action: "list" }   -> the user's timeline, newest first: sign-ins, KYC start and Sumsub
//                           results, NDA signatures, every download (type, fingerprint, watermark)
// Deploy: supabase functions deploy clv-audit --no-verify-jwt
import { adminClient, clientIp, cors, json, requireUser } from "../_shared/clv.ts";

type Ev = { ts: string; kind: string; title: string; detail: string; room?: string | null; ref?: string | null; sha?: string | null; ip?: string | null };

const ext = (name: string) => { const m = /\.([a-z0-9]+)$/i.exec(name || ""); return m ? m[1].toUpperCase() : "file"; };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method" }, 405);
  const admin = adminClient();
  const me = await requireUser(admin, req);
  if (me instanceof Response) return me;
  const body = await req.json().catch(() => ({}));
  const action = String(body.action || "list");
  const ip = clientIp(req), ua = req.headers.get("user-agent") || "";

  if (action === "login") {
    const { error } = await admin.from("clv_access_log").insert({ user_id: me.id, action: "login", ip, user_agent: ua });
    if (error) console.error("clv-audit login:", error.message);
    return json({ ok: true });
  }

  if (action !== "list") return json({ error: "bad-action" }, 400);
  const limit = Math.min(Number(body.limit || 300), 1000);
  const [logs, dls, kyc, rooms] = await Promise.all([
    admin.from("clv_access_log").select("ts, action, file_path, room_id, ip").eq("user_id", me.id).in("action", ["login", "kyc-start", "nda-signed", "download-nda"]).order("ts", { ascending: false }).limit(limit),
    admin.from("clv_downloads").select("created_at, code, file_name, delivered_as, sha256_delivered, sha256_source, watermark, room_id, contract_id, contract:clv_contracts(title), ip").eq("user_id", me.id).order("created_at", { ascending: false }).limit(limit),
    admin.from("clv_sumsub_events").select("received_at, type, review_answer, payload").eq("external_user_id", me.id).order("received_at", { ascending: false }).limit(limit),
    admin.from("clv_rooms").select("id, name"),
  ]);
  const roomName = new Map<string, string>((rooms.data || []).map((r: { id: string; name: string }) => [r.id, r.name]));
  const out: Ev[] = [];

  for (const l of logs.data || []) {
    const room = l.room_id ? roomName.get(l.room_id) || null : null;
    if (l.action === "login") out.push({ ts: l.ts, kind: "login", title: "Signed in", detail: "Password sign-in to the Clavoris portal", ip: l.ip });
    else if (l.action === "kyc-start") out.push({ ts: l.ts, kind: "kyc", title: "Identity verification started", detail: "Sumsub verification session opened", ip: l.ip });
    else if (l.action === "nda-signed") out.push({ ts: l.ts, kind: "nda", title: "NDA signed", detail: "KYC-attested electronic signature" + (l.file_path ? " · signed copy stored as PDF" : ""), room, ip: l.ip });
    else if (l.action === "download-nda") out.push({ ts: l.ts, kind: "download", title: "Downloaded your signed NDA", detail: "PDF · signed copy", room, ip: l.ip });
  }
  for (const d of dls.data || []) {
    const wm = (d.watermark || {}) as { stamped?: boolean };
    const stamped = d.delivered_as === "pdf-watermarked" || !!wm.stamped;
    const isContract = !!d.contract_id;
    out.push({ ts: d.created_at, kind: "download", title: `Downloaded ${d.file_name}`, detail: `${ext(d.file_name)} · ${isContract ? (d.delivered_as === "qes-signed" ? "qualified e-signatures embedded (PAdES)" : "contract original, unsigned") : stamped ? "visible watermark on every page" : "download reference in file name"} · identity, time and IP recorded`, room: isContract ? ("Contract: " + ((d.contract as any)?.title || "")) : d.room_id ? roomName.get(d.room_id) || null : null, ref: d.code, sha: d.sha256_delivered, ip: d.ip });
  }
  for (const k of kyc.data || []) {
    const p = (k.payload || {}) as { reviewResult?: { reviewRejectType?: string; moderationComment?: string }; levelName?: string };
    if (k.type === "applicantReviewed") {
      const ans = k.review_answer === "GREEN" ? "approved" : k.review_answer === "RED" ? (p.reviewResult?.reviewRejectType === "FINAL" ? "rejected" : "needs another attempt") : String(k.review_answer || "reviewed");
      out.push({ ts: k.received_at, kind: "kyc", title: `Identity verification ${ans}`, detail: `Sumsub review (AMLD6)${p.levelName ? " · level " + p.levelName : ""}${p.reviewResult?.moderationComment ? " · " + p.reviewResult.moderationComment : ""}` });
    } else if (k.type === "applicantPending") out.push({ ts: k.received_at, kind: "kyc", title: "Identity documents submitted", detail: "Sumsub review pending" });
    else if (k.type === "applicantCreated") out.push({ ts: k.received_at, kind: "kyc", title: "Identity verification applicant created", detail: "Sumsub" });
  }
  out.sort((a, b) => (a.ts < b.ts ? 1 : a.ts > b.ts ? -1 : 0));
  return json({ ok: true, events: out.slice(0, limit) });
});
