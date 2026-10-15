// supabase/functions/clv-room-nda/index.ts
// NDA gate for a data room.
//   { action: "text", room_id }                       -> the NDA text and version
//   { action: "sign", room_id, typed_name, accept }   -> signs it (identity-verified users only)
//   { action: "store", room_id }                      -> stores the PDF of an existing signature whose
//                                                        copy could not be stored at signing time
//   { action: "countersign_status", room_id }         -> the Disclosing Party's countersignature of the room's NDA
//   { action: "countersign", room_id, typed_name, capacity, accept }
//                                                     -> an identity-verified administrator of the company that
//                                                        runs the room signs the NDA once (per NDA version) for
//                                                        that company; the signature is added to every member's
//                                                        signed copy of that version, also to copies signed earlier
// Signing: the user must be KYC-verified (Didit; historical users via Sumsub). The NDA is rendered to a PDF with a
// signature block (name, email, organisation, time, IP, KYC reference, hashes), stored in
// Nextcloud under <room>/_users/<email>/ and recorded in clv_signed_documents. The record
// carries validation.method so an eIDAS QES signature (e-Signature.eu) can replace it later.
// Deploy: supabase functions deploy clv-room-nda --no-verify-jwt
import { PDFDocument, StandardFonts, rgb } from "https://esm.sh/pdf-lib@1.17.1";
import { adminClient, audit, clientIp, cors, isStaff, json, profileComplete, requireUser, sameName } from "../_shared/clv.ts";
import { ncConfigured, ncGet, ncMkdirP, ncPut, sha256Hex } from "../_shared/nc.ts";

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
  page.drawText("Private investment, enabled", { x: M + 96, y: y + 4, size: 9, font, color: gold });
  y -= 30;
  page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 1, color: gold }); y -= 22;
  line(opts.title, bold, 15, navy); y -= 4;
  line(`Data room: ${opts.room}`, font, 10.5, grey); y -= 10;
  for (const l of wrap(opts.text, 100)) line(l);
  y -= 10; if (y < 200) newPage();
  page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.6, color: gold }); y -= 20;
  line("Handtekeningbijvoegsel · Electronic signature record", bold, 12, navy); y -= 2;
  for (const [k, v] of Object.entries(opts.sig)) {
    page.drawText(k, { x: M, y, size: 8, font: mono, color: grey });
    for (const l of wrap(v, 66)) { page.drawText(l, { x: M + 165, y, size: 9, font, color: rgb(0.1, 0.1, 0.1) }); y -= 12.5; }
    y -= 1.5;
    if (y < M) newPage();
  }
  y -= 8;
  for (const l of wrap("Dit document werd elektronisch aanvaard door een gebruiker met geverifieerde identiteit van de Clavoris-dataroom. De identiteit van de ondertekenaar werd vóór de ondertekening geverifieerd via de KYC-procedure van Clavoris (AMLD6). De vingerafdrukken hierboven verbinden dit bijvoegsel met de precies aanvaarde tekst. Clavoris bewaart het toegangslogboek van die aanvaarding.", 100)) line(l, font, 8.5, rgb(0.1, 0.1, 0.1));
  y -= 4;
  for (const l of wrap("This document was accepted electronically by an identity-verified user of the Clavoris data room. The signatory's identity was verified through the Clavoris KYC procedure (AMLD6 identity verification) before signature. The hashes above bind this record to the exact text accepted. Clavoris retains the access log of this acceptance.", 100)) line(l, font, 8.5, grey);
  const pages = pdf.getPages();
  pages.forEach((p, i) => p.drawText(`Clavoris · ${opts.room} · NDA · page ${i + 1} / ${pages.length}`, { x: M, y: 30, size: 8, font, color: grey }));
  return await pdf.save();
}

// Uploaded NDA (PDF chosen by the company admin): the signed copy is the original PDF with a
// Clavoris signature page appended (the original pages are left untouched).
async function appendSignaturePage(original: Uint8Array, opts: { room: string; company: string; sig: Record<string, string> }): Promise<Uint8Array> {
  const pdf = await PDFDocument.load(original, { ignoreEncryption: true });
  const font = await pdf.embedFont(StandardFonts.TimesRoman), bold = await pdf.embedFont(StandardFonts.TimesRomanBold), mono = await pdf.embedFont(StandardFonts.Courier);
  const navy = rgb(0.10, 0.23, 0.36), gold = rgb(0.72, 0.53, 0.04), grey = rgb(0.35, 0.35, 0.35), ink = rgb(0.1, 0.1, 0.1);
  const W = 595.28, H = 841.89, M = 56;
  const page = pdf.addPage([W, H]); let y = H - M;
  page.drawText("Clavoris", { x: M, y, size: 22, font: bold, color: navy });
  page.drawText("Private investment, enabled", { x: M + 96, y: y + 4, size: 9, font, color: gold });
  y -= 30; page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 1, color: gold }); y -= 24;
  page.drawText("Handtekeningbijvoegsel · Electronic signature record", { x: M, y, size: 14, font: bold, color: navy }); y -= 18;
  // Long company or room names wrap instead of running off the page.
  for (const l of wrap(`Geheimhoudingsovereenkomst van ${opts.company} · dataroom ${opts.room} / Non-disclosure agreement of ${opts.company} · data room ${opts.room}`, 92)) { page.drawText(l, { x: M, y, size: 10, font, color: grey }); y -= 14; }
  y -= 10;
  for (const [k, v] of Object.entries(opts.sig)) {
    page.drawText(k, { x: M, y, size: 8, font: mono, color: grey });
    for (const l of wrap(v, 66)) { page.drawText(l, { x: M + 165, y, size: 9, font, color: ink }); y -= 12.5; }
    y -= 1.5;
  }
  y -= 10;
  for (const l of wrap("De voorgaande pagina's vormen de geheimhoudingsovereenkomst zoals zij op Clavoris aan de ondertekenaar werd voorgelegd; de SHA-256 hierboven verbindt dit bijvoegsel met dat document. Zij werd elektronisch aanvaard door een gebruiker met geverifieerde identiteit (AMLD6-KYC); Clavoris bewaart het toegangslogboek van die aanvaarding.", 100)) { page.drawText(l, { x: M, y, size: 8.5, font, color: ink }); y -= 12; }
  y -= 6;
  for (const l of wrap("The preceding pages are the non-disclosure agreement exactly as presented to the signatory on Clavoris; the SHA-256 above binds this record to that document. It was accepted electronically by an identity-verified user (AMLD6 KYC) and Clavoris retains the access log of this acceptance.", 100)) { page.drawText(l, { x: M, y, size: 8.5, font, color: grey }); y -= 12; }
  const pages = pdf.getPages();
  pages[pages.length - 1].drawText(`Clavoris · ${opts.room} · NDA · handtekeningbijvoegsel / signature record`, { x: M, y: 30, size: 8, font, color: grey });
  return await pdf.save();
}

// Countersignature of the Disclosing Party: one page added after the member's signature page (bilingual,
// the NDA being Dutch-binding). The original pages and the member's signature page are left untouched.
type Countersign = { id: string; typed_name: string; capacity: string; signer_email: string; signed_at: string; ip: string | null; kyc_provider: string | null; kyc_session_id: string | null; kyc_reviewed_at: string | null; versions: { version: string; sha256: string }[] };
async function appendCountersignPage(signed: Uint8Array, cs: Countersign, opts: { room: string; company: string; version: string }): Promise<Uint8Array> {
  const pdf = await PDFDocument.load(signed, { ignoreEncryption: true });
  const font = await pdf.embedFont(StandardFonts.TimesRoman), bold = await pdf.embedFont(StandardFonts.TimesRomanBold), mono = await pdf.embedFont(StandardFonts.Courier);
  const navy = rgb(0.10, 0.23, 0.36), gold = rgb(0.72, 0.53, 0.04), grey = rgb(0.35, 0.35, 0.35), ink = rgb(0.1, 0.1, 0.1);
  const W = 595.28, H = 841.89, M = 56;
  const page = pdf.addPage([W, H]); let y = H - M;
  page.drawText("Clavoris", { x: M, y, size: 22, font: bold, color: navy });
  page.drawText("Private investment, enabled", { x: M + 96, y: y + 4, size: 9, font, color: gold });
  y -= 30; page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 1, color: gold }); y -= 24;
  page.drawText("Elektronische tegenhandtekening · Electronic countersignature", { x: M, y, size: 14, font: bold, color: navy }); y -= 18;
  for (const l of wrap(`Geheimhoudingsovereenkomst van ${opts.company} · dataroom ${opts.room} / Non-disclosure agreement of ${opts.company} · data room ${opts.room}`, 92)) { page.drawText(l, { x: M, y, size: 10, font, color: grey }); y -= 13.5; }
  y -= 10;
  const sha = (cs.versions.find((v) => v.version === opts.version) || { sha256: "n/a" }).sha256;
  const rows: [string, string][] = [
    ["Ondertekenaar / Signatory", cs.typed_name],
    ["Hoedanigheid / Capacity", cs.capacity],
    ["Namens / On behalf of", `${opts.company} (Verstrekkende Partij / Disclosing Party)`],
    ["Ondertekend / Signed (UTC)", String(cs.signed_at).replace("T", " ").slice(0, 19)],
    ["Identiteit / Identity", `${cs.kyc_provider === "didit" ? "Didit" : (cs.kyc_provider || "KYC")} KYC · sessie / session ${cs.kyc_session_id || "n/a"} · beoordeeld / reviewed ${cs.kyc_reviewed_at ? String(cs.kyc_reviewed_at).slice(0, 10) : "n/a"}`],
    ["Methode / Method", "Eenmalige elektronische handtekening op Clavoris (eIDAS eenvoudige e-handtekening) / One-time electronic signature on Clavoris (eIDAS simple e-signature)"],
    ["IP-adres / IP address", cs.ip || "n/a"],
    ["NDA-versie / NDA version", opts.version],
    ["SHA-256 NDA", sha],
    ["Referentie / Reference", cs.id],
  ];
  for (const [k, v] of rows) {
    page.drawText(k, { x: M, y, size: 8, font: mono, color: grey });
    for (const l of wrap(v, 66)) { page.drawText(l, { x: M + 165, y, size: 9, font, color: ink }); y -= 12.5; }
    y -= 1.5;
  }
  y -= 10;
  const nl = `De ondertekenaar heeft deze geheimhoudingsovereenkomst (versie ${opts.version}) als bevoegde vertegenwoordiger van de Verstrekkende Partij eenmalig elektronisch ondertekend op het Clavoris-platform, na verificatie van zijn identiteit. Die handtekening is rechtsgeldig aangebracht op alle exemplaren van deze versie die door gebruikers van de dataroom “${opts.room}” worden ondertekend, ongeacht het tijdstip van hun ondertekening, en geldt als ondertekening door de Verstrekkende Partij.`;
  const en = `The signatory signed this non-disclosure agreement (version ${opts.version}) once, electronically, on the Clavoris platform, as authorised representative of the Disclosing Party, after verification of his identity. That signature is validly applied to every copy of this version signed by users of the data room “${opts.room}”, whatever the time of their signature, and counts as signature by the Disclosing Party.`;
  for (const l of wrap(nl, 100)) { page.drawText(l, { x: M, y, size: 8.5, font, color: ink }); y -= 12; }
  y -= 6;
  for (const l of wrap(en, 100)) { page.drawText(l, { x: M, y, size: 8.5, font, color: grey }); y -= 12; }
  page.drawText(`Clavoris · ${opts.room} · NDA · countersignature`, { x: M, y: 30, size: 8, font, color: grey });
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

function sigBlock(me: { email: string; company: string | null; job_title?: string | null; legal_rep?: boolean | null; sumsub_applicant_id: string | null; kyc_provider?: string | null; kyc_session_id?: string | null; kyc_reviewed_at: string | null }, typed: string, at: Date, ip: string, version: string, shaUnsigned: string): Record<string, string> {
  return {
    // Bilingual labels and texts, Dutch first (the data-room NDAs are Dutch-binding), then English.
    "Ondertekenaar / Signatory": typed, "E-mail": me.email, "Organisatie / Organisation": me.company || "— (privépersoon / private person)",
    "Functie / Role": me.company ? (me.job_title || "—") : "—",
    "Hoedanigheid / Capacity": me.company
      ? (me.legal_rep ? `Wettelijk vertegenwoordiger, bevoegd om te ondertekenen namens ${me.company} / Legal representative, authorised to sign on behalf of ${me.company}` : `Ondertekent in eigen naam, niet als bevoegd vertegenwoordiger van ${me.company} / Signs in a personal capacity, not as authorised representative of ${me.company}`)
      : "Privépersoon, ondertekent in eigen naam / Private person, signs in a personal capacity",
    "Ondertekend / Signed (UTC)": at.toISOString().replace("T", " ").slice(0, 19),
    "Identiteit / Identity": `${me.kyc_provider === "didit" || (!me.sumsub_applicant_id && me.kyc_session_id) ? `Didit KYC · sessie / session ${me.kyc_session_id || "n/a"}` : `Sumsub KYC · applicant ${me.sumsub_applicant_id || "n/a"}`} · beoordeeld / reviewed ${me.kyc_reviewed_at ? String(me.kyc_reviewed_at).slice(0, 10) : "n/a"}`,
    "Methode / Method": "Elektronische aanvaarding na identiteitsverificatie (eIDAS eenvoudige e-handtekening) / KYC-attested electronic acceptance (eIDAS simple e-signature)",
    "IP-adres / IP address": ip || "n/a", "NDA-versie / NDA version": version, "SHA-256 NDA": shaUnsigned,
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

  const { data: room } = await admin.from("clv_rooms").select("id, slug, name, company_id, nextcloud_folder, qes_nda_required, annex_text, annex_version, nda_pdf_path, nda_pdf_name, nda_pdf_sha256, company:clv_companies(name)").eq("id", roomId).maybeSingle();
  if (!room) return json({ error: "not-found" }, 404);
  const companyName = (room as any).company?.name || "Clavoris";
  if (!isStaff(me)) {
    const { data: a } = await admin.from("clv_room_assignments").select("id, expires_at").eq("room_id", roomId).eq("user_id", me.id).is("revoked_at", null).maybeSingle();
    if (!a) return json({ error: "forbidden" }, 403);
    // After the access end date the member may still read / store their NDA, but not sign a new one.
    if (a.expires_at && new Date(a.expires_at) < new Date() && action === "sign") return json({ error: "expired" }, 403);
  }
  const text = room.annex_text || "";
  const version = room.annex_version || "v1";

  if (action === "text") return json({ ok: true, text, version, required: !!room.qes_nda_required, pdf: !!room.nda_pdf_path, pdf_name: room.nda_pdf_name, company: companyName });

  if (action === "pdf") {
    // The room's NDA document (uploaded by the company admin) for reading before signing.
    if (!room.nda_pdf_path) return json({ error: "no-pdf" }, 404);
    let res: Response;
    try { res = await ncGet(room.nda_pdf_path); } catch (e) { return json({ error: "file-unavailable", detail: (e as Error).message }, 404); }
    const bytes = new Uint8Array(await res.arrayBuffer());
    return new Response(bytes, { headers: { ...cors, "content-type": "application/pdf", "content-disposition": `inline; filename="${String(room.nda_pdf_name || "NDA.pdf").replace(/"/g, "")}"`, "access-control-expose-headers": "content-disposition" } });
  }

  // The Disclosing Party's countersignature covering an NDA version of this room (if signed).
  async function countersignFor(v: string): Promise<Countersign | null> {
    const { data } = await admin.from("clv_nda_countersignatures").select("id, typed_name, capacity, signer_email, signed_at, ip, kyc_provider, kyc_session_id, kyc_reviewed_at, versions").eq("room_id", roomId).is("revoked_at", null).contains("versions", JSON.stringify([{ version: v }])).order("signed_at", { ascending: false }).limit(1).maybeSingle();
    return (data as Countersign) || null;
  }

  if (action === "countersign_status" || action === "countersign") {
    if (!isStaff(me)) return json({ error: "forbidden" }, 403);
    const shaCurrent = room.nda_pdf_sha256 || await sha256Hex(text);
    // Only an identity-verified administrator of the company that runs the room signs for it.
    const why = me.company_id !== room.company_id ? "not-company-admin" : (me.status !== "verified" || !(me.kyc_session_id || me.sumsub_applicant_id)) ? "kyc-required" : "";
    const current = await countersignFor(version);
    const { data: docs } = await admin.from("clv_signed_documents").select("id, user_id, doc_version, sha256_unsigned, signed_at, nextcloud_path, countersigned_path").eq("room_id", roomId).eq("doc_type", "nda");
    const open = (docs || []).filter((d: any) => !d.countersigned_path);
    if (action === "countersign_status") {
      return json({ ok: true, can_sign: !why && !current, reason: why || (current ? "already" : ""), version, sha256: shaCurrent, signer_name: me.full_name, signer_capacity_hint: me.job_title || "",
        countersignature: current ? { typed_name: current.typed_name, capacity: current.capacity, signed_at: current.signed_at, signer_email: current.signer_email } : null,
        signed_total: (docs || []).length, not_countersigned: open.length });
    }
    if (why) return json({ error: why }, 403);
    if (current) return json({ ok: true, already: true });
    if (body.accept !== true) return json({ error: "accept-required" }, 400);
    const typed = String(body.typed_name || "").trim(), capacity = String(body.capacity || "").trim().slice(0, 300);
    if (!sameName(typed, me.full_name || "")) return json({ error: "name-mismatch" }, 400);
    if (!capacity) return json({ error: "capacity-required" }, 400);
    // Covers the current version and every version members of this room have already signed.
    const vmap = new Map<string, string>([[version, shaCurrent]]);
    for (const d of (docs || []) as any[]) if (!vmap.has(d.doc_version)) vmap.set(d.doc_version, d.sha256_unsigned || "n/a");
    const versions = [...vmap].map(([v, sh]) => ({ version: v, sha256: sh }));
    const ip = clientIp(req);
    const { data: cs, error } = await admin.from("clv_nda_countersignatures").insert({ room_id: roomId, company_id: room.company_id, versions, signer_id: me.id, signer_email: me.email, typed_name: typed, capacity, kyc_provider: me.kyc_provider || (me.sumsub_applicant_id ? "sumsub" : null), kyc_session_id: me.kyc_session_id || me.sumsub_applicant_id, kyc_reviewed_at: me.kyc_reviewed_at, ip, user_agent: req.headers.get("user-agent") || "" }).select("id, typed_name, capacity, signer_email, signed_at, ip, kyc_provider, kyc_session_id, kyc_reviewed_at, versions").single();
    if (error) return json({ error: error.message }, 400);
    await audit(admin, me, "nda-countersigned", room.name, { room_id: roomId, countersignature_id: cs.id, versions: versions.map((v) => v.version), capacity });
    // Copies already signed: a countersigned copy is stored next to the original, which stays untouched.
    let done = 0, failed = 0;
    for (const d of open as any[]) {
      if (!d.nextcloud_path) { failed++; continue; }
      try {
        const r = await ncGet(d.nextcloud_path);
        const out = await appendCountersignPage(new Uint8Array(await r.arrayBuffer()), cs as Countersign, { room: room.name, company: companyName, version: d.doc_version });
        const path = d.nextcloud_path.replace(/\.pdf$/i, "") + "_countersigned.pdf";
        await ncPut(path, out, "application/pdf");
        await admin.from("clv_signed_documents").update({ countersigned_path: path, countersigned_at: new Date().toISOString(), countersignature_id: cs.id }).eq("id", d.id);
        done++;
      } catch (e) { failed++; console.error("clv-room-nda: countersign copy failed:", d.id, (e as Error).message); }
    }
    return json({ ok: true, countersigned_at: cs.signed_at, copies: done, failed });
  }

  // Build the signed PDF: the uploaded NDA with a signature page, or the rendered text NDA.
  async function signedPdf(sig: Record<string, string>): Promise<Uint8Array> {
    if (room!.nda_pdf_path) {
      try { const r = await ncGet(room!.nda_pdf_path); return await appendSignaturePage(new Uint8Array(await r.arrayBuffer()), { room: room!.name, company: companyName, sig }); }
      catch (e) { console.error("clv-room-nda: nda pdf unavailable, falling back to text:", (e as Error).message); }
    }
    return await renderNdaPdf({ title: "Non-Disclosure Agreement", room: room!.name, text, sig });
  }

  if (action === "store") {
    // Backfill: the signature exists but its PDF could not be stored at the time (storage down).
    const { data: rec } = await admin.from("clv_signed_documents").select("id, doc_version, signed_at, nextcloud_path, validation").eq("room_id", roomId).eq("user_id", me.id).eq("doc_type", "nda").maybeSingle();
    if (!rec) return json({ error: "no-nda" }, 404);
    if (rec.nextcloud_path) return json({ ok: true, stored: true, already: true });
    const v = (rec.validation || {}) as Record<string, string>;
    const at = new Date(rec.signed_at);
    const shaUnsigned = room.nda_pdf_sha256 || await sha256Hex(text);
    let pdfBytes = await signedPdf(sigBlock(me, v.typed_name || me.full_name || "", at, v.ip || "", rec.doc_version, shaUnsigned));
    const csl = await countersignFor(rec.doc_version);
    if (csl) pdfBytes = await appendCountersignPage(pdfBytes, csl, { room: room.name, company: companyName, version: rec.doc_version });
    const ncPath = await storeNda(room, me.email, rec.doc_version, at, pdfBytes);
    if (!ncPath) return json({ ok: true, stored: false });
    const shaSigned = await sha256Hex(pdfBytes);
    await admin.from("clv_signed_documents").update({ nextcloud_path: ncPath, sha256_signed: shaSigned, validation: { ...v, stored: true, stored_at: new Date().toISOString(), stored_late: true }, ...(csl ? { countersigned_path: ncPath, countersigned_at: new Date().toISOString(), countersignature_id: csl.id } : {}) }).eq("id", rec.id);
    return json({ ok: true, stored: true });
  }

  if (action !== "sign") return json({ error: "bad-action" }, 400);
  if (!room.qes_nda_required) return json({ ok: true, already: true });
  if (me.status !== "verified" && !isStaff(me)) return json({ error: "kyc-required" }, 403);
  if (body.accept !== true) return json({ error: "accept-required" }, 400);
  if (!profileComplete(me)) return json({ error: "profile-incomplete" }, 400);
  const typed = String(body.typed_name || "").trim();
  if (!sameName(typed, me.full_name || "")) return json({ error: "name-mismatch" }, 400);

  const { data: existing } = await admin.from("clv_signed_documents").select("id, signed_at").eq("room_id", roomId).eq("user_id", me.id).eq("doc_type", "nda").maybeSingle();
  if (existing) return json({ ok: true, already: true, signed_at: existing.signed_at });

  const now = new Date();
  const ip = clientIp(req), ua = req.headers.get("user-agent") || "";
  const shaUnsigned = room.nda_pdf_sha256 || await sha256Hex(text);
  let pdfBytes = await signedPdf(sigBlock(me, typed, now, ip, version, shaUnsigned));
  // The Disclosing Party's standing countersignature of this version, if given, is added at once.
  const cs = await countersignFor(version);
  if (cs) pdfBytes = await appendCountersignPage(pdfBytes, cs, { room: room.name, company: companyName, version });
  const shaSigned = await sha256Hex(pdfBytes);
  const ncPath = await storeNda(room, me.email, version, now, pdfBytes);

  const { error } = await admin.from("clv_signed_documents").insert({
    user_id: me.id, room_id: roomId, doc_type: "nda", doc_version: version,
    sha256_unsigned: shaUnsigned, sha256_signed: shaSigned, nextcloud_path: ncPath, signed_at: now.toISOString(),
    ...(cs && ncPath ? { countersigned_path: ncPath, countersigned_at: now.toISOString(), countersignature_id: cs.id } : {}),
    validation: { method: "kyc-attested-click", typed_name: typed, organisation: me.company || null, role: me.job_title || null, legal_rep: me.company ? !!me.legal_rep : null, ip, user_agent: ua, sumsub_applicant_id: me.sumsub_applicant_id, kyc_provider: me.kyc_provider || (me.sumsub_applicant_id ? "sumsub" : null), kyc_session_id: me.kyc_session_id, kyc_reviewed_at: me.kyc_reviewed_at, stored: !!ncPath },
  });
  if (error) return json({ error: error.message }, 400);
  await admin.from("clv_access_log").insert({ user_id: me.id, room_id: roomId, file_path: ncPath, action: "nda-signed", ip, user_agent: ua }).then(() => {}, () => {});
  return json({ ok: true, signed_at: now.toISOString(), stored: !!ncPath });
});
