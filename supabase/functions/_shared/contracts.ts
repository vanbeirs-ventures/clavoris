// Contract execution engine (shared by clv-contracts and clv-sumsub-webhook).
// Signatories sign one after the other; each signature is a Sumsub qualified e-signature
// (PAdES, embedded in the PDF). The PDF signed by party N is the document handed to party N+1.
// When the last signatory has signed, the contract is executed: the final PDF is kept as is
// (altering it would break the embedded qualified signatures) and Clavoris produces a separate
// certificate of completion with the full evidence.
import { PDFDocument, StandardFonts, rgb } from "https://esm.sh/pdf-lib@1.17.1";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { APP_URL, sendMail } from "./clv.ts";
import { mail, pickLang } from "./mail-i18n.ts";
import { ncGet, ncMkdirP, ncPut, sha256Hex } from "./nc.ts";
import { sumsub, sumsubApplicantId, sumsubJson } from "./sumsub.ts";

export const CONTRACTS_ROOT = "Documents/Clavoris/Contracts";
export const QES_LEVEL = () => Deno.env.get("SUMSUB_QES_LEVEL_NAME") || "";

export type Party = { id: string; contract_id: string; user_id: string; role: string; order_no: number; status: string; signed_at: string | null; signed_path: string | null; sha256_signed: string | null; sumsub_applicant_id: string | null; sumsub_doc_name: string | null; evidence: Record<string, unknown>; ip: string | null; invited_at: string | null; opened_at: string | null; signing_started_at: string | null; declined_at: string | null; profile?: { full_name: string | null; email: string; company: string | null; lang?: string | null } };
export type Contract = { id: string; title: string; description: string | null; status: string; folder: string; original_name: string; original_path: string; sha256_original: string; current_path: string | null; executed_path: string | null; sha256_executed: string | null; certificate_path: string | null; pages: number | null; created_at: string; launched_at: string | null; executed_at: string | null };

export async function logEvent(admin: SupabaseClient, contractId: string, userId: string | null, event: string, detail: Record<string, unknown> = {}, ip = "") {
  await admin.from("clv_contract_events").insert({ contract_id: contractId, user_id: userId, event, detail, ip }).then(() => {}, (e: unknown) => console.error("contract event", e));
}

export async function loadParties(admin: SupabaseClient, contractId: string): Promise<Party[]> {
  const { data } = await admin.from("clv_contract_parties").select("*, profile:clv_profiles!clv_contract_parties_user_id_fkey(full_name, email, company, lang)").eq("contract_id", contractId).order("role").order("order_no").order("added_at");
  return (data || []) as Party[];
}

export function signatoriesInOrder(parties: Party[]): Party[] { return parties.filter((p) => p.role === "signatory").sort((a, b) => a.order_no - b.order_no || a.invited_at?.localeCompare(b.invited_at || "") || 0); }
export function nextSignatory(parties: Party[]): Party | null { return signatoriesInOrder(parties).find((p) => p.status !== "signed") || null; }

// Invite the next signatory in line (mail + status). Returns the party invited, if any.
export async function inviteNext(admin: SupabaseClient, c: Contract, parties: Party[]): Promise<Party | null> {
  const nxt = nextSignatory(parties);
  if (!nxt || nxt.status !== "pending") return nxt;
  await admin.from("clv_contract_parties").update({ status: "invited", invited_at: new Date().toISOString() }).eq("id", nxt.id);
  const link = `${APP_URL}/contract.html?id=${c.id}`;
  const L = pickLang(nxt.profile?.lang); const m = mail(L, "contract_your_turn", { name: nxt.profile?.full_name, title: c.title, link });
  sendMail(nxt.profile?.email || "", m.subject, m.text, L).catch((e) => console.error("contract invite mail", e));
  await logEvent(admin, c.id, nxt.user_id, "party-invited", { party_id: nxt.id, order: nxt.order_no });
  return nxt;
}

// Complete the signature of a party whose Sumsub e-sign session finished: fetch the signed PDF,
// store it, advance the sequence. Idempotent; safe to call from the webhook and from the app.
export async function finalizeParty(admin: SupabaseClient, partyId: string): Promise<{ ok: boolean; state: string; error?: string }> {
  const { data: pRaw } = await admin.from("clv_contract_parties").select("*, profile:clv_profiles!clv_contract_parties_user_id_fkey(full_name, email, company, lang)").eq("id", partyId).maybeSingle();
  const p = pRaw as Party | null;
  if (!p) return { ok: false, state: "missing", error: "no-party" };
  if (p.status === "signed") return { ok: true, state: "signed" };
  if (p.status !== "signing") return { ok: false, state: p.status, error: "not-signing" };
  const { data: cRaw } = await admin.from("clv_contracts").select("*").eq("id", p.contract_id).maybeSingle();
  const c = cRaw as Contract | null;
  if (!c || c.status !== "in_progress") return { ok: false, state: "contract", error: "contract-not-in-progress" };

  const applicantId = p.sumsub_applicant_id || await sumsubApplicantId(p.user_id);
  if (!applicantId) return { ok: false, state: "signing", error: "no-applicant" };
  const chk = await sumsubJson<any>("GET", `/resources/checks/latest?type=E_SIGN&applicantId=${encodeURIComponent(applicantId)}`);
  if (!chk.ok) return { ok: false, state: "signing", error: `esign-check ${chk.status}` };
  const checks: any[] = chk.data?.checks || (Array.isArray(chk.data) ? chk.data : []);
  let found: { imageId: string; signedAt: string; checkId: string; answer: string; inputDoc: any } | null = null;
  for (const ck of checks) {
    for (const d of ck?.esignCheckInfo?.signedDocuments || []) {
      if (d.name === p.sumsub_doc_name || (d.name || "").startsWith(p.sumsub_doc_name?.replace(/\.pdf$/i, "") || "\u0000")) { found = { imageId: d.imageId, signedAt: d.signedAt, checkId: ck.id, answer: ck.answer, inputDoc: ck.inputDoc }; break; }
    }
    if (found) break;
  }
  if (!found) return { ok: true, state: "signing" }; // not signed yet

  const dl = await sumsub("GET", `/resources/applicants/${encodeURIComponent(applicantId)}/esign/resources/${encodeURIComponent(found.imageId)}`);
  if (!dl.ok) return { ok: false, state: "signing", error: `signed-doc ${dl.status}` };
  const bytes = new Uint8Array(await dl.arrayBuffer());
  const sha = await sha256Hex(bytes);
  const step = p.order_no;
  const path = `${c.folder}/signed-${String(step).padStart(2, "0")}-${(p.profile?.email || p.user_id).toLowerCase().replace(/[^a-z0-9@._-]/g, "_")}.pdf`;
  await ncMkdirP(c.folder);
  await ncPut(path, bytes, "application/pdf");
  const evidence = { ...(p.evidence || {}), sumsub_check_id: found.checkId, sumsub_image_id: found.imageId, signed_at_provider: found.signedAt, answer: found.answer, id_doc_type: found.inputDoc?.idDocType || null, id_doc_country: found.inputDoc?.country || null, signer_name: [found.inputDoc?.firstName, found.inputDoc?.lastName].filter(Boolean).join(" ") || null };
  await admin.from("clv_contract_parties").update({ status: "signed", signed_at: new Date().toISOString(), signed_path: path, sha256_signed: sha, sumsub_applicant_id: applicantId, evidence }).eq("id", p.id);
  await admin.from("clv_contracts").update({ current_path: path }).eq("id", c.id);
  await logEvent(admin, c.id, p.user_id, "party-signed", { party_id: p.id, sha256: sha, path, check: found.checkId });

  // Advance.
  const parties = await loadParties(admin, c.id);
  const c2 = { ...c, current_path: path };
  const nxt = nextSignatory(parties);
  if (nxt) { await inviteNext(admin, c2, parties); return { ok: true, state: "signed" }; }
  await executeContract(admin, c2, parties);
  return { ok: true, state: "executed" };
}

async function executeContract(admin: SupabaseClient, c: Contract, parties: Party[]) {
  const exec = await ncGet(c.current_path!);
  const bytes = new Uint8Array(await exec.arrayBuffer());
  const sha = await sha256Hex(bytes);
  const executedPath = `${c.folder}/executed.pdf`;
  await ncPut(executedPath, bytes, "application/pdf");
  const now = new Date();
  const cert = await renderCertificate(c, parties, sha, now);
  const certPath = `${c.folder}/certificate-of-completion.pdf`;
  await ncPut(certPath, cert, "application/pdf");
  await admin.from("clv_contracts").update({ status: "executed", executed_path: executedPath, sha256_executed: sha, certificate_path: certPath, executed_at: now.toISOString(), closed_at: now.toISOString() }).eq("id", c.id);
  await logEvent(admin, c.id, null, "contract-executed", { sha256_executed: sha, certificate: certPath });
  const link = `${APP_URL}/contract.html?id=${c.id}`;
  for (const p of parties) {
    const email = p.profile?.email; if (!email) continue;
    const L = pickLang(p.profile?.lang);
    const m = mail(L, p.role === "signatory" ? "contract_executed_signatory" : "contract_executed_auditor", { name: p.profile?.full_name, title: c.title, link, sha });
    sendMail(email, m.subject, m.text, L).catch((e) => console.error("contract executed mail", e));
  }
}

function wrap(text: string, max: number): string[] {
  const out: string[] = [];
  for (const para of String(text).split(/\r?\n/)) {
    if (!para.trim()) { out.push(""); continue; }
    let line = "";
    for (const w of para.split(/\s+/)) { if ((line + " " + w).trim().length > max) { out.push(line); line = w; } else line = (line + " " + w).trim(); }
    if (line) out.push(line);
  }
  return out;
}

export async function renderCertificate(c: Contract, parties: Party[], shaExecuted: string, at: Date): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.TimesRoman), bold = await pdf.embedFont(StandardFonts.TimesRomanBold), mono = await pdf.embedFont(StandardFonts.Courier);
  const navy = rgb(0.10, 0.23, 0.36), gold = rgb(0.72, 0.53, 0.04), grey = rgb(0.35, 0.35, 0.35), ink = rgb(0.1, 0.1, 0.1);
  const W = 595.28, H = 841.89, M = 56, LH = 13.5;
  let page = pdf.addPage([W, H]); let y = H - M;
  const newPage = () => { page = pdf.addPage([W, H]); y = H - M; };
  const line = (s: string, f = font, size = 10.5, color = ink, x = M) => { if (y < M + LH) newPage(); page.drawText(s, { x, y, size, font: f, color }); y -= LH; };
  const kv = (k: string, v: string) => { if (y < M + LH) newPage(); page.drawText(k, { x: M, y, size: 8.5, font: mono, color: grey }); for (const l of wrap(v, 78)) { page.drawText(l, { x: M + 150, y, size: 9.5, font, color: ink }); y -= 12.5; if (y < M) newPage(); } };

  page.drawText("Clavoris", { x: M, y, size: 22, font: bold, color: navy });
  page.drawText("Private investment, enabled", { x: M + 96, y: y + 4, size: 9, font, color: gold });
  y -= 30; page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 1, color: gold }); y -= 24;
  line("Certificate of completion", bold, 17, navy); y -= 6;
  line("Qualified electronic signature record (eIDAS Regulation (EU) 910/2014)", font, 10.5, grey); y -= 14;
  kv("Contract", c.title);
  if (c.description) kv("Description", c.description);
  kv("Contract reference", c.id);
  kv("Original document", `${c.original_name} · SHA-256 ${c.sha256_original}`);
  kv("Executed document", `executed.pdf · SHA-256 ${shaExecuted}`);
  kv("Executed at (UTC)", at.toISOString().replace("T", " ").slice(0, 19));
  kv("Signature format", "PAdES qualified electronic signatures embedded in the executed PDF, one per signatory, with qualified timestamps; issued through Sumsub (QTSP partner InfoCert) after identity proofing per ETSI 119 461.");
  y -= 10; page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.6, color: gold }); y -= 20;
  line("Signatories", bold, 12.5, navy); y -= 4;
  for (const p of signatoriesInOrder(parties)) {
    const ev = (p.evidence || {}) as Record<string, string | null>;
    line(`${p.order_no}. ${p.profile?.full_name || "—"}${p.profile?.company ? " · " + p.profile.company : ""}`, bold, 10.5, ink);
    kv("E-mail", p.profile?.email || "—");
    kv("Signed at (UTC)", p.signed_at ? String(p.signed_at).replace("T", " ").slice(0, 19) : "—");
    kv("Identity proofing", `Sumsub QES · applicant ${p.sumsub_applicant_id || "—"} · check ${ev.sumsub_check_id || "—"}${ev.id_doc_type ? " · " + ev.id_doc_type + (ev.id_doc_country ? " (" + ev.id_doc_country + ")" : "") : ""}`);
    if (ev.signer_name) kv("Name on ID document", String(ev.signer_name));
    kv("IP address", p.ip || "—");
    kv("Document after signature", `SHA-256 ${p.sha256_signed || "—"}`);
    y -= 6;
  }
  const auditors = parties.filter((p) => p.role === "auditor");
  if (auditors.length) {
    y -= 6; line("Auditors (follow the execution; not signatories)", bold, 12.5, navy); y -= 4;
    for (const p of auditors) line(`${p.profile?.full_name || "—"}${p.profile?.company ? " · " + p.profile.company : ""} · ${p.profile?.email || ""}`, font, 10, ink);
  }
  y -= 12;
  for (const l of wrap("This certificate is issued by Clavoris as the record of the execution of the contract named above. The legally binding signatures are the qualified electronic signatures embedded in the executed PDF; they can be validated with any PAdES-capable reader or the EU DSS validation service. The hashes above bind this certificate to the exact documents exchanged. Clavoris retains the full event log of the execution.", 100)) line(l, font, 8.5, grey);
  const pages = pdf.getPages();
  pages.forEach((pg, i) => pg.drawText(`Clavoris · ${c.title} · certificate of completion · page ${i + 1} / ${pages.length}`, { x: M, y: 30, size: 8, font, color: grey }));
  return await pdf.save();
}
