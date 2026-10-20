// supabase/functions/clv-room-file/index.ts
// Streams one data room file to an entitled user. Checks: active assignment (or staff),
// NDA signed when the room requires it, download permission. Every delivery is logged in
// clv_access_log and clv_downloads with a unique download code and SHA-256 fingerprints.
// Data rooms deliver PDF, JPEG and PNG: every page is stamped with the user's identity, the time and
// the download code. Excel workbooks (.xlsx, .xls) are delivered as the original file, for download only
// (no browser view, no watermark inside the workbook): the download code is in the file name and the
// download is recorded like any other. Other file types placed in the folder are refused. A JPEG or PNG is delivered
// inside a one-page PDF carrying the same stamp and protections, so an image never leaves unmarked. Delivered documents carry
// PDF permissions that switch off printing, copying text and editing (owner password random, never
// stored); they still open without a password. The member's own signed NDA stays printable.
// The user's first download triggers a confirmation mail (audit trail + confidentiality).
//   { room_id, path }          -> a file inside the room folder (download)
//   { room_id, path, view: true } -> the same file to read in the browser: watermarked the same way and logged
//                                    as a "view"; allowed also where downloads are switched off
//   { room_id, nda: true }     -> the caller's own signed NDA
// Deploy: supabase functions deploy clv-room-file --no-verify-jwt
// @cantoo/pdf-lib: pdf-lib with PDF encryption (permissions), used to switch off printing. Loaded through esm.sh:
// with the npm: specifier the edge runtime failed to boot (its CommonJS dependency @pdf-lib/standard-fonts did not
// resolve: "does not provide an export named FontNames"), which took views and downloads offline from 15 October.
import { PDFDocument, StandardFonts, rgb } from "https://esm.sh/@cantoo/pdf-lib@2.3.2";
import { adminClient, APP_URL, clientIp, cors, inScope, isStaff, json, requireUser, sendMail } from "../_shared/clv.ts";
import { mail, pickLang } from "../_shared/room-mail.ts";
import { ncConfigured, ncGet, sha256Hex } from "../_shared/nc.ts";
import { DOWNLOAD_ALERT_PER_HOUR, raiseRedFlag } from "../_shared/alerts.ts";

function genCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; const r = crypto.getRandomValues(new Uint8Array(10));
  let s = ""; for (let i = 0; i < 10; i++) { s += chars[r[i] % chars.length]; if (i === 4) s += "-"; }
  return s;
}

const IMAGE = /\.(jpe?g|png)$/i;
const EXCEL = /\.(xlsx|xls)$/i;
const EXCEL_TYPE = (name: string) => /\.xls$/i.test(name) ? "application/vnd.ms-excel" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
// One page sized to the image (longest side 842 pt, A4 height), the image filling the page.
async function imageToPdf(bytes: Uint8Array, png: boolean): Promise<Uint8Array | null> {
  try {
    const pdf = await PDFDocument.create();
    const img = png ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
    const k = 842 / Math.max(img.width, img.height);
    const w = Math.max(200, img.width * k), h = Math.max(200, img.height * k);
    const page = pdf.addPage([w, h]);
    page.drawImage(img, { x: 0, y: 0, width: w, height: h });
    return await pdf.save();
  } catch { return null; }
}

// Watermark words in the member's profile language.
const WM: Record<string, { mark: string; dl: string; view: string }> = {
  en: { mark: "CONFIDENTIAL", dl: "download", view: "view" },
  nl: { mark: "VERTROUWELIJK", dl: "download", view: "inzage" },
  fr: { mark: "CONFIDENTIEL", dl: "téléchargement", view: "consultation" },
};

async function stampPdf(bytes: Uint8Array, line: string, mark = "CONFIDENTIAL"): Promise<Uint8Array | null> {
  try {
    const pdf = await PDFDocument.load(bytes, { ignoreEncryption: true });
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    for (const page of pdf.getPages()) {
      const { width, height } = page.getSize();
      page.drawText(line, { x: 24, y: 14, size: 7.5, font, color: rgb(0.45, 0.45, 0.45) });
      page.drawText(mark, { x: width / 2 - mark.length * 10, y: height / 2, size: 54, font, color: rgb(0.72, 0.53, 0.04), opacity: 0.08, rotate: { type: "degrees", angle: 35 } as any });
    }
    pdf.encrypt({ userPassword: "", ownerPassword: crypto.randomUUID() + crypto.randomUUID(), permissions: { printing: false, modifying: false, copying: false, annotating: false, fillingForms: false, contentAccessibility: true, documentAssembly: false } });
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

  const { data: room } = await admin.from("clv_rooms").select("id, name, company_id, nextcloud_folder, qes_nda_required, downloads_allowed, watermark, company:clv_companies(name)").eq("id", roomId).maybeSingle();
  if (!room || !room.nextcloud_folder) return json({ error: "not-found" }, 404);
  // Staff rights only in the rooms of the staff member's own company (a super admin: everywhere).
  const staffHere = isStaff(me) && inScope(me, room.company_id);

  let canDownload = true;
  if (!staffHere) {
    const { data: a } = await admin.from("clv_room_assignments").select("can_download, expires_at").eq("room_id", roomId).eq("user_id", me.id).is("revoked_at", null).maybeSingle();
    if (!a) return json({ error: "forbidden" }, 403);
    // After the access end date the member may still open the room and fetch their own signed NDA,
    // but no other document.
    const expired = !!a.expires_at && new Date(a.expires_at) < new Date();
    if (expired && body.nda !== true) return json({ error: "expired" }, 403);
    canDownload = !!a.can_download && !!room.downloads_allowed;
  }
  const { data: nda } = await admin.from("clv_signed_documents").select("nextcloud_path, countersigned_path").eq("room_id", roomId).eq("user_id", me.id).eq("doc_type", "nda").maybeSingle();

  let target: string, fileName: string, action: string;
  if (body.nda === true) {
    if (!nda?.nextcloud_path) return json({ error: "no-nda" }, 404);
    target = nda.countersigned_path || nda.nextcloud_path; fileName = target.split("/").pop() || "NDA.pdf"; action = "download-nda";
  } else {
    if (room.qes_nda_required && !nda && !staffHere) return json({ error: "nda-required" }, 403);
    if (!canDownload && body.view !== true) return json({ error: "download-not-allowed" }, 403);
    const rel = String(body.path || "").replace(/^\/+/, "");
    if (!rel || rel.includes("..") || /^_(users|nda)(\/|$)/.test(rel)) return json({ error: "bad-path" }, 400);
    target = `${room.nextcloud_folder}/${rel}`; fileName = rel.split("/").pop() || "file"; action = body.view === true ? "view" : "download";
    if (!/\.(pdf|jpe?g|png|xlsx|xls)$/i.test(fileName)) return json({ error: "pdf-only" }, 400); // watermarked PDF, JPEG and PNG; Excel as the original
    if (action === "view" && EXCEL.test(fileName)) return json({ error: "download-only" }, 400); // a workbook cannot be shown in the browser viewer
  }

  let res: Response;
  try { res = await ncGet(target); } catch (e) { return json({ error: "file-unavailable", detail: (e as Error).message }, 404); }
  const source = new Uint8Array(await res.arrayBuffer());
  const shaSource = await sha256Hex(source);
  // An image is placed in a one-page PDF first, so it gets the same stamp and protections as a PDF.
  const isImage = action !== "download-nda" && IMAGE.test(fileName);
  let pdfSource = source;
  if (isImage) {
    const wrapped = await imageToPdf(source, /\.png$/i.test(fileName));
    if (!wrapped) return json({ error: "file-unreadable" }, 422);
    pdfSource = wrapped;
  }
  const ip = clientIp(req), ua = req.headers.get("user-agent") || "";
  const now = new Date();
  const wm = WM[pickLang(me.lang)] || WM.en;
  await admin.from("clv_access_log").insert({ user_id: me.id, room_id: roomId, file_path: target, action, ip, user_agent: ua }).then(() => {}, () => {});

  let delivered = source, deliveredAs = "original", outName = fileName;
  if (action === "view") {
    // Reading in the browser: the same stamp (identity, time, a view code); no download record or mail.
    const stamped = room.watermark !== false || isImage ? await stampPdf(pdfSource, `Clavoris · ${room.name} · ${me.full_name || me.email} (${me.email}) · ${now.toISOString().slice(0, 16).replace("T", " ")} UTC · ${wm.view} ${genCode()}`, wm.mark) : null;
    delivered = stamped || pdfSource;
    return new Response(delivered, { status: 200, headers: { ...cors, "content-type": "application/pdf", "content-disposition": `inline; filename="${fileName.replace(/"/g, "")}"`, "cache-control": "no-store" } });
  }
  if (action === "download") {
    const code = genCode();
    const stampLine = `Clavoris · ${room.name} · ${me.full_name || me.email} (${me.email}) · ${now.toISOString().slice(0, 16).replace("T", " ")} UTC · ${wm.dl} ${code}`;
    const isPdf = /\.pdf$/i.test(fileName) || (res.headers.get("content-type") || "").includes("pdf");
    if (isImage) {
      // Always stamped, also when the room's watermark is switched off: the PDF page is the only form an image leaves in.
      const stamped = await stampPdf(pdfSource, stampLine, wm.mark);
      delivered = stamped || pdfSource; deliveredAs = stamped ? "image-pdf-watermarked" : "image-pdf";
    } else if (room.watermark !== false && isPdf) {
      const stamped = await stampPdf(source, stampLine, wm.mark);
      if (stamped) { delivered = stamped; deliveredAs = "pdf-watermarked"; }
    }
    const dot = fileName.lastIndexOf(".");
    // An image arrives as a PDF: "photo.jpg" -> "photo__CODE.pdf".
    outName = isImage ? `${fileName.slice(0, dot)}__${code}.pdf` : dot > 0 ? `${fileName.slice(0, dot)}__${code}${fileName.slice(dot)}` : `${fileName}__${code}`;
    const shaDelivered = await sha256Hex(delivered);
    const { count } = await admin.from("clv_downloads").select("id", { count: "exact", head: true }).eq("user_id", me.id);
    await admin.from("clv_downloads").insert({
      code, user_id: me.id, room_id: roomId, file_path: target, file_name: fileName, file_etag: res.headers.get("etag") || null,
      sha256_source: shaSource, sha256_delivered: shaDelivered, delivered_as: deliveredAs,
      watermark: { code, user: me.full_name, email: me.email, company: me.company, room: room.name, at: now.toISOString(), stamped: deliveredAs !== "original" },
      ip, user_agent: ua,
    }).then(() => {}, (e: unknown) => console.error("clv-room-file: download record failed", e));

    // Red flag: an unusual number of downloads from this room within an hour (members only).
    if (!staffHere) {
      const { count: lastHour } = await admin.from("clv_downloads").select("id", { count: "exact", head: true }).eq("user_id", me.id).eq("room_id", roomId).gte("created_at", new Date(Date.now() - 3600000).toISOString());
      if ((lastHour || 0) >= DOWNLOAD_ALERT_PER_HOUR) await raiseRedFlag(admin, "downloads", { userId: me.id, roomId, key: `dl:${me.id}:${roomId}`, vars: { n: String(lastHour), room: room.name } }).catch((e: Error) => console.error("red flag:", e.message));
    }
    if ((count || 0) === 0) {
      const L = pickLang(me.lang);
      const m = mail(L, "first_download", { name: me.full_name, room: room.name, owner: (room as any).company?.name || "", file: fileName, code, audit: `${APP_URL}/account.html#audit` });
      sendMail(me.email, m.subject, m.text, L).catch((e) => console.error("clv-room-file: first-download mail failed", e));
    }
  }
  return new Response(delivered, { status: 200, headers: { ...cors, "content-type": isImage ? "application/pdf" : EXCEL.test(fileName) ? EXCEL_TYPE(fileName) : res.headers.get("content-type") || "application/octet-stream", "content-disposition": `attachment; filename="${outName.replace(/"/g, "")}"`, "access-control-expose-headers": "content-disposition, x-clavoris-sha256", "x-clavoris-sha256": await sha256Hex(delivered) } });
});
