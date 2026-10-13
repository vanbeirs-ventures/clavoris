// supabase/functions/clv-room-nda/index.ts
// NDA gate for a data room.
//   { action: "text", room_id }                       -> the NDA text and version
//   { action: "sign", room_id, typed_name, accept }   -> signs it (identity-verified users only)
//   { action: "store", room_id }                      -> stores the PDF of an existing signature whose
//                                                        copy could not be stored at signing time
// Signing: the user must be KYC-verified (Sumsub). The NDA is rendered to a PDF with a
// signature block (name, email, organisation, time, IP, KYC reference, hashes), stored in
// Nextcloud under <room>/_users/<email>/ and recorded in clv_signed_documents. The record
// carries validation.method so an eIDAS QES signature (Sumsub eSign) can replace it later.
// Deploy: supabase functions deploy clv-room-nda --no-verify-jwt
import { PDFDocument, StandardFonts, rgb } from "https://esm.sh/pdf-lib@1.17.1";
import { adminClient, clientIp, cors, isStaff, json, requireUser } from "../_shared/clv.ts";
import { ncConfigured, ncMkdirP, ncPut, sha256Hex } from "../_shared/nc.ts";

function wrap(text: string, max: number): string[] {
  const out: string[] = [];
  for (const para of text.split(/\r?\n/)) {
    if (!para.trim()) { out.push(""); continue; }
    let line = "";
    for (const w of para.split(/\s+/)) {
      if ((line + " " + w).trim().length > max) { out.push(line); line = w; } else line = (line + " " + w).trim();
    }
    if (line) out.push(line);
  }
  return out;
}

async function renderNdaPdf(opts: { title: string; room: string; text: string; sig: Record<string, string> }): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.TimesRoman);
  const bold = await pdf.embedFont(StandardFonts.TimesRomanBold);
  const mono = await pdf.embedFont(StandardFonts.Courier);
  const navy = rgb(0.10, 0.23, 0.36), gold = rgb(0.72, 0.53, 0.04), grey = rgb(0.35, 0.35, 0.35);
  const W = 595.28, H = 841.89, M = 56, LH = 13.5;
  let page = pdf.addPage([W, H]); let y = H - M;
  const newPage = () => { page = pdf.addPage([W, H]); y = H - M; };
  const line = (s: string, f = font, size = 10.5, color = rgb(0.1, 0.1, 0.1)) => {
    if (y < M + LH) newPage();
    page.drawText(s, { x: M, y, size, font: f, color }); y -= LH;
  };
  page.drawText("Clavoris", { x: M, y, size: 22, font: bold, color: navy });
  page.drawText("Keys to institutional capital", { x: M + 96, y: y + 4, size: 9, font, color: gold });
  y -= 30;
  page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 1, color: gold }); y -= 22;
  line(opts.title, bold, 15, navy); y -= 4;
  line(`Data room: ${opts.room}`, font, 10.5, grey); y -= 10;
  for (const l of wrap(opts.text, 100)) line(l);
  y -= 10; if (y < 200) newPage();
  page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.6, color: gold }); y -= 20;
  line("Electronic signature record", bold, 12, navy); y -= 2;
  for (const [k, v] of Object.entries(opts.sig)) {
    page.drawText(k.padEnd(22), { x: M, y, size: 8.5, font: mono, color: grey });
    page.drawText(v, { x: M + 140, y, size: 9, font, color: rgb(0.1, 0.1, 0.1) }); y -= 12.5;
    if (y < M) newPage();
  }
  y -= 8;
  for (const l of wrap("This document was accepted electronically by an identity-verified user of the Clavoris data room. The signatory's identity was verified through the Clavoris KYC procedure (Sumsub) before signature. The hashes above bind this record to the exact text accepted. Clavoris retains the access log of this acceptance.", 100)) line(l, font, 8.5, grey);
  const pages = pdf.getPages();
  pages.forEach((p, i) => p.drawText(`Clavoris · ${opts.room} · NDA · page ${i + 1} / ${pages.length}`, { x: M, y: 30, size: 8, font, color: grey }));
  return await pdf.save();
}

async function storeNda(room: { nextcloud_folder: string | null; slug: string }, email: string, version: string, at: Date, pdfBytes: Uint8Array): Promise<string | null> {
  if (!(await ncConfigured()) || !room.nextcloud_folder) return null;
  const safeMail = email.toLowerCase().replace(/[^a-z0-9@._-]/g, "_");
  const folder = `${room.nextcloud_folder}/_users/${safeMail}`;
  const file = `${folder}/NDA_${room.slug}_${version}_${at.toISOString().slice(0, 10)}.pdf`;
  try { await ncMkdirP(folder); await ncPut(file, pdfBytes, "application/pdf"); return file; }
  catch (e) { console.error("clv-room-nda: nextcloud store failed:", (e as Error).message); return null; }
}

function sigBlock(me: { email: string; company: string | null; sumsub_applicant_id: string | null; kyc_reviewed_at: string | null }, typed: string, at: Date, ip: string, version: string, shaUnsigned: string): Record<string, string> {
  return {
    "Signatory": typed, "Email": me.email, "Organisation": me.company || "—",
    "Signed at (UTC)": at.toISOString().replace("T", " ").slice(0, 19),
    "Identity verification": `Sumsub KYC · applicant ${me.sumsub_applicant_id || "n/a"} · reviewed ${me.kyc_reviewed_at ? String(me.kyc_reviewed_at).slice(0, 10) : "n/a"}`,
    "Signature method": "KYC-attested electronic acceptance (eIDAS simple e-signature)",
    "IP address": ip || "n/a", "NDA version": version, "SHA-256 of text": shaUnsigned,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method" }, 405);
  const admin = adminClient();
  const me = await requireUser(admin, req);
  if (me instanceof Response) return me;
  const body = await req.json().catch(() => ({}));
  const roomId = String(body.room_id || "");
  const action = String(body.action || "text");
  if (!roomId) return json({ error: "room-required" }, 400);

  const { data: room } = await admin.from("clv_rooms").select("id, slug, name, nextcloud_folder, qes_nda_required, annex_text, annex_version").eq("id", roomId).maybeSingle();
  if (!room) return json({ error: "not-found" }, 404);
  if (!isStaff(me)) {
    const { data: a } = await admin.from("clv_room_assignments").select("id, expires_at").eq("room_id", roomId).eq("user_id", me.id).is("revoked_at", null).maybeSingle();
    if (!a || (a.expires_at && new Date(a.expires_at) < new Date())) return json({ error: "forbidden" }, 403);
  }
  const text = room.annex_text || "";
  const version = room.annex_version || "v1";

  if (action === "text") return json({ ok: true, text, version, required: !!room.qes_nda_required });

  if (action === "store") {
    // Backfill: the signature exists but its PDF could not be stored at the time (storage down).
    const { data: rec } = await admin.from("clv_signed_documents").select("id, doc_version, signed_at, nextcloud_path, validation").eq("room_id", roomId).eq("user_id", me.id).eq("doc_type", "nda").maybeSingle();
    if (!rec) return json({ error: "no-nda" }, 404);
    if (rec.nextcloud_path) return json({ ok: true, stored: true, already: true });
    const v = (rec.validation || {}) as Record<string, string>;
    const at = new Date(rec.signed_at);
    const shaUnsigned = await sha256Hex(text);
    const pdfBytes = await renderNdaPdf({ title: "Non-Disclosure Agreement", room: room.name, text, sig: sigBlock(me, v.typed_name || me.full_name || "", at, v.ip || "", rec.doc_version, shaUnsigned) });
    const ncPath = await storeNda(room, me.email, rec.doc_version, at, pdfBytes);
    if (!ncPath) return json({ ok: true, stored: false });
    const shaSigned = await sha256Hex(pdfBytes);
    await admin.from("clv_signed_documents").update({ nextcloud_path: ncPath, sha256_signed: shaSigned, validation: { ...v, stored: true, stored_at: new Date().toISOString(), stored_late: true } }).eq("id", rec.id);
    return json({ ok: true, stored: true });
  }

  if (action !== "sign") return json({ error: "bad-action" }, 400);
  if (!room.qes_nda_required) return json({ ok: true, already: true });
  if (me.status !== "verified" && !isStaff(me)) return json({ error: "kyc-required" }, 403);
  if (body.accept !== true) return json({ error: "accept-required" }, 400);
  const typed = String(body.typed_name || "").trim();
  if (!typed || typed.toLowerCase() !== String(me.full_name || "").trim().toLowerCase()) return json({ error: "name-mismatch" }, 400);

  const { data: existing } = await admin.from("clv_signed_documents").select("id, signed_at").eq("room_id", roomId).eq("user_id", me.id).eq("doc_type", "nda").maybeSingle();
  if (existing) return json({ ok: true, already: true, signed_at: existing.signed_at });

  const now = new Date();
  const ip = clientIp(req), ua = req.headers.get("user-agent") || "";
  const shaUnsigned = await sha256Hex(text);
  const pdfBytes = await renderNdaPdf({ title: "Non-Disclosure Agreement", room: room.name, text, sig: sigBlock(me, typed, now, ip, version, shaUnsigned) });
  const shaSigned = await sha256Hex(pdfBytes);
  const ncPath = await storeNda(room, me.email, version, now, pdfBytes);

  const { error } = await admin.from("clv_signed_documents").insert({
    user_id: me.id, room_id: roomId, doc_type: "nda", doc_version: version,
    sha256_unsigned: shaUnsigned, sha256_signed: shaSigned, nextcloud_path: ncPath, signed_at: now.toISOString(),
    validation: { method: "kyc-attested-click", typed_name: typed, ip, user_agent: ua, sumsub_applicant_id: me.sumsub_applicant_id, kyc_reviewed_at: me.kyc_reviewed_at, stored: !!ncPath },
  });
  if (error) return json({ error: error.message }, 400);
  await admin.from("clv_access_log").insert({ user_id: me.id, room_id: roomId, file_path: ncPath, action: "nda-signed", ip, user_agent: ua }).then(() => {}, () => {});
  return json({ ok: true, signed_at: now.toISOString(), stored: !!ncPath });
});
