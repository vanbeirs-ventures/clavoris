// supabase/functions/clv-room-file/index.ts
// Streams one data room file to an entitled user. Checks: active assignment (or staff),
// NDA signed when the room requires it, download permission. Every delivery is logged in
// clv_access_log and clv_downloads with a unique download code and SHA-256 fingerprints.
// PDFs are stamped on every page with the user's identity and the download code; other
// file types carry the code in the delivered file name and in the record.
// The user's first download triggers a confirmation mail (audit trail + confidentiality).
//   { room_id, path }          -> a file inside the room folder
//   { room_id, nda: true }     -> the caller's own signed NDA
// Deploy: supabase functions deploy clv-room-file --no-verify-jwt
import { PDFDocument, StandardFonts, rgb } from "https://esm.sh/pdf-lib@1.17.1";
import { adminClient, APP_URL, clientIp, cors, isStaff, json, requireUser, sendMail } from "../_shared/clv.ts";
import { mail, pickLang } from "../_shared/mail-i18n.ts";
import { ncConfigured, ncGet, sha256Hex } from "../_shared/nc.ts";

function genCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; const r = crypto.getRandomValues(new Uint8Array(10));
  let s = ""; for (let i = 0; i < 10; i++) { s += chars[r[i] % chars.length]; if (i === 4) s += "-"; }
  return s;
}

async function stampPdf(bytes: Uint8Array, line: string): Promise<Uint8Array | null> {
  try {
    const pdf = await PDFDocument.load(bytes, { ignoreEncryption: true });
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    for (const page of pdf.getPages()) {
      const { width, height } = page.getSize();
      page.drawText(line, { x: 24, y: 14, size: 7.5, font, color: rgb(0.45, 0.45, 0.45) });
      page.drawText("CONFIDENTIAL", { x: width / 2 - 120, y: height / 2, size: 54, font, color: rgb(0.72, 0.53, 0.04), opacity: 0.08, rotate: { type: "degrees", angle: 35 } as any });
    }
    return await pdf.save();
  } catch { return null; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method" }, 405);
  const admin = adminClient();
  const me = await requireUser(admin, req);
  if (me instanceof Response) return me;
  const body = await req.json().catch(() => ({}));
  const roomId = String(body.room_id || "");
  if (!roomId) return json({ error: "room-required" }, 400);
  if (!(await ncConfigured())) return json({ error: "storage-not-configured" }, 503);

  const { data: room } = await admin.from("clv_rooms").select("id, name, nextcloud_folder, qes_nda_required, downloads_allowed, watermark").eq("id", roomId).maybeSingle();
  if (!room || !room.nextcloud_folder) return json({ error: "not-found" }, 404);

  let canDownload = true;
  if (!isStaff(me)) {
    const { data: a } = await admin.from("clv_room_assignments").select("can_download, expires_at").eq("room_id", roomId).eq("user_id", me.id).is("revoked_at", null).maybeSingle();
    if (!a) return json({ error: "forbidden" }, 403);
    // After the access end date the member may still open the room and fetch their own signed NDA,
    // but no other document.
    const expired = !!a.expires_at && new Date(a.expires_at) < new Date();
    if (expired && body.nda !== true) return json({ error: "expired" }, 403);
    canDownload = !!a.can_download && !!room.downloads_allowed;
  }
  const { data: nda } = await admin.from("clv_signed_documents").select("nextcloud_path").eq("room_id", roomId).eq("user_id", me.id).eq("doc_type", "nda").maybeSingle();

  let target: string, fileName: string, action: string;
  if (body.nda === true) {
    if (!nda?.nextcloud_path) return json({ error: "no-nda" }, 404);
    target = nda.nextcloud_path; fileName = target.split("/").pop() || "NDA.pdf"; action = "download-nda";
  } else {
    if (room.qes_nda_required && !nda && !isStaff(me)) return json({ error: "nda-required" }, 403);
    if (!canDownload) return json({ error: "download-not-allowed" }, 403);
    const rel = String(body.path || "").replace(/^\/+/, "");
    if (!rel || rel.includes("..") || rel.startsWith("_users")) return json({ error: "bad-path" }, 400);
    target = `${room.nextcloud_folder}/${rel}`; fileName = rel.split("/").pop() || "file"; action = "download";
  }

  let res: Response;
  try { res = await ncGet(target); } catch (e) { return json({ error: "file-unavailable", detail: (e as Error).message }, 404); }
  const source = new Uint8Array(await res.arrayBuffer());
  const shaSource = await sha256Hex(source);
  const ip = clientIp(req), ua = req.headers.get("user-agent") || "";
  const now = new Date();
  await admin.from("clv_access_log").insert({ user_id: me.id, room_id: roomId, file_path: target, action, ip, user_agent: ua }).then(() => {}, () => {});

  let delivered = source, deliveredAs = "original", outName = fileName;
  if (action === "download") {
    const code = genCode();
    const stampLine = `Clavoris · ${room.name} · ${me.full_name || me.email} (${me.email}) · ${now.toISOString().slice(0, 16).replace("T", " ")} UTC · download ${code}`;
    const isPdf = /\.pdf$/i.test(fileName) || (res.headers.get("content-type") || "").includes("pdf");
    if (room.watermark !== false && isPdf) {
      const stamped = await stampPdf(source, stampLine);
      if (stamped) { delivered = stamped; deliveredAs = "pdf-watermarked"; }
    }
    const dot = fileName.lastIndexOf(".");
    outName = dot > 0 ? `${fileName.slice(0, dot)}__${code}${fileName.slice(dot)}` : `${fileName}__${code}`;
    const shaDelivered = await sha256Hex(delivered);
    const { count } = await admin.from("clv_downloads").select("id", { count: "exact", head: true }).eq("user_id", me.id);
    await admin.from("clv_downloads").insert({
      code, user_id: me.id, room_id: roomId, file_path: target, file_name: fileName, file_etag: res.headers.get("etag") || null,
      sha256_source: shaSource, sha256_delivered: shaDelivered, delivered_as: deliveredAs,
      watermark: { code, user: me.full_name, email: me.email, company: me.company, room: room.name, at: now.toISOString(), stamped: deliveredAs !== "original" },
      ip, user_agent: ua,
    }).then(() => {}, (e: unknown) => console.error("clv-room-file: download record failed", e));

    if ((count || 0) === 0) {
      const L = pickLang(me.lang);
      const m = mail(L, "first_download", { name: me.full_name, room: room.name, file: fileName, code, audit: `${APP_URL}/account.html#audit` });
      sendMail(me.email, m.subject, m.text, L).catch((e) => console.error("clv-room-file: first-download mail failed", e));
    }
  }
  return new Response(delivered, { status: 200, headers: { ...cors, "content-type": res.headers.get("content-type") || "application/octet-stream", "content-disposition": `attachment; filename="${outName.replace(/"/g, "")}"`, "access-control-expose-headers": "content-disposition, x-clavoris-sha256", "x-clavoris-sha256": await sha256Hex(delivered) } });
});
