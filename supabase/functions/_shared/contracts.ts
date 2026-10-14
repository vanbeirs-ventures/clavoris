// Contract execution engine (shared by clv-contracts and clv-esign-webhook).
// One e-Signature.eu request per contract carries all signatories (embedded mode: no provider
// mails, Clavoris hands each signatory the signing link when it is their turn). Each signature is a
// qualified electronic signature (itsme® / Evrotrust, PAdES, embedded in the PDF). When the last
// signatory has signed, the provider delivers the signed PDF and an audit trail; Clavoris keeps both
// untouched (altering the PDF would break the embedded signatures) and produces its own certificate
// of completion with the full evidence.
import { PDFDocument, StandardFonts, rgb } from "https://esm.sh/pdf-lib@1.17.1";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { APP_URL, sendMail } from "./clv.ts";
import { mail, pickLang } from "./mail-i18n.ts";
import { ncMkdirP, ncPut, sha256Hex } from "./nc.ts";
import { b64ToBytes, esignAuditTrail, esignGetRequest, type EsignRequest, signerSigned } from "./esign.ts";

export const CONTRACTS_ROOT = "Documents/Clavoris/Contracts";

export type Party = { id: string; contract_id: string; user_id: string; role: string; order_no: number; status: string; signed_at: string | null; signed_path: string | null; sha256_signed: string | null; esign_signer_no: number | null; esign_signature_link: string | null; esign_method: string | null; evidence: Record<string, unknown>; ip: string | null; invited_at: string | null; opened_at: string | null; signing_started_at: string | null; declined_at: string | null; profile?: { full_name: string | null; email: string; company: string | null; lang?: string | null; mobile?: string | null; notify?: Record<string, unknown> | null } };
export type Contract = { id: string; title: string; description: string | null; status: string; folder: string; original_name: string; original_path: string; sha256_original: string; current_path: string | null; executed_path: string | null; sha256_executed: string | null; certificate_path: string | null; audit_trail_path: string | null; esign_id_sign: string | null; esign_status: string | null; esign_doc_name: string | null; esign_synced_at: string | null; pages: number | null; created_at: string; launched_at: string | null; executed_at: string | null };

export async function logEvent(admin: SupabaseClient, contractId: string, userId: string | null, event: string, detail: Record<string, unknown> = {}, ip = "") {
  await admin.from("clv_contract_events").insert({ contract_id: contractId, user_id: userId, event, detail, ip }).then(() => {}, (e: unknown) => console.error("contract event", e));
}

export async function loadParties(admin: SupabaseClient, contractId: string): Promise<Party[]> {
  const { data } = await admin.from("clv_contract_parties").select("*, profile:clv_profiles!clv_contract_parties_user_id_fkey(full_name, email, company, lang, mobile, notify)").eq("contract_id", contractId).order("role").order("order_no").order("added_at");
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

// Bring the contract in line with the provider's view of the request: parties that signed, the
// finished document, external cancellation. Idempotent; called from the webhook and from the app.
// `given` is the request as posted to the callback (may carry pdf_file_base64); when absent the
// request is re-fetched. The webhook always re-fetches, so an unsigned callback cannot forge state.
export async function syncContract(admin: SupabaseClient, c: Contract, given?: EsignRequest | null): Promise<{ ok: boolean; state: string; error?: string }> {
  if (!c.esign_id_sign) return { ok: false, state: c.status, error: "no-request" };
  if (c.status !== "in_progress") return { ok: true, state: c.status };
  const req = await esignGetRequest(c.esign_id_sign);
  if (!req) return { ok: false, state: c.status, error: "provider-unavailable" };
  const now = new Date().toISOString();
  await admin.from("clv_contracts").update({ esign_status: req.status_id, esign_synced_at: now }).eq("id", c.id);

  let parties = await loadParties(admin, c.id);
  let changed = false;
  for (const p of signatoriesInOrder(parties)) {
    const s = p.esign_signer_no ? req.signers?.[String(p.esign_signer_no)] : undefined;
    if (p.status === "signed" || !signerSigned(s)) continue;
    const evidence = { ...(p.evidence || {}), esign_id_sign: c.esign_id_sign, esign_signer_no: p.esign_signer_no, signed_at_provider: s!.signing_time || null, signing_method: s!.signing_method || null, verified_firstname: s!.verified_firstname || null, verified_lastname: s!.verified_lastname || null, signer_name: [s!.verified_firstname, s!.verified_lastname].filter(Boolean).join(" ") || null };
    await admin.from("clv_contract_parties").update({ status: "signed", signed_at: s!.signing_time ? new Date(s!.signing_time).toISOString() : now, esign_method: s!.signing_method || null, esign_signature_link: null, evidence }).eq("id", p.id);
    await logEvent(admin, c.id, p.user_id, "party-signed", { party_id: p.id, method: s!.signing_method || null, signer: evidence.signer_name });
    changed = true;
  }
  if (changed) parties = await loadParties(admin, c.id);

  const st = String(req.status_id || "").toLowerCase();
  if (st === "finished") {
    const b64 = given?.pdf_file_base64 || req.pdf_file_base64;
    if (!b64) return { ok: false, state: "in_progress", error: "signed-pdf-missing" };
    await executeContract(admin, c, parties, b64ToBytes(b64));
    return { ok: true, state: "executed" };
  }
  if (st === "cancelled" || st === "deleted") {
    await admin.from("clv_contracts").update({ status: "cancelled", closed_at: now }).eq("id", c.id);
    await logEvent(admin, c.id, null, "contract-cancelled", { by: "provider", status: st });
    return { ok: true, state: "cancelled" };
  }
  if (changed) {
    const nxt = nextSignatory(parties);
    if (nxt) await inviteNext(admin, c, parties);
    return { ok: true, state: "signed" };
  }
  return { ok: true, state: "signing" };
}

async function executeContract(admin: SupabaseClient, c: Contract, parties: Party[], bytes: Uint8Array) {
  const sha = await sha256Hex(bytes);
  const executedPath = `${c.folder}/executed.pdf`;
  await ncMkdirP(c.folder);
  await ncPut(executedPath, bytes, "application/pdf");
  let auditPath: string | null = null;
  try { const at = await esignAuditTrail(c.esign_id_sign!); if (at) { auditPath = `${c.folder}/audit-trail.pdf`; await ncPut(auditPath, at, "application/pdf"); } } catch (e) { console.error("audit trail", e); }
  const now = new Date();
  const cert = await renderCertificate(c, parties, sha, now, auditPath);
  const certPath = `${c.folder}/certificate-of-completion.pdf`;
  await ncPut(certPath, cert, "application/pdf");
  // Every signatory signed the same document; record its hash on each party.
  await admin.from("clv_contract_parties").update({ signed_path: executedPath, sha256_signed: sha }).eq("contract_id", c.id).eq("role", "signatory");
  await admin.from("clv_contracts").update({ status: "executed", current_path: executedPath, executed_path: executedPath, sha256_executed: sha, certificate_path: certPath, audit_trail_path: auditPath, executed_at: now.toISOString(), closed_at: now.toISOString() }).eq("id", c.id);
  await logEvent(admin, c.id, null, "contract-executed", { sha256_executed: sha, certificate: certPath, audit_trail: auditPath });
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

const METHOD_LABEL: Record<string, string> = { "itsme-qes-signature": "itsme® qualified electronic signature (QES)", "evrotrust-signature": "Evrotrust qualified electronic signature (QES)", "veriff-advanced-signature": "Veriff advanced electronic signature (AES)", "otp-email-non-qualified": "E-mail OTP simple electronic signature (SES)" };

export async function renderCertificate(c: Contract, parties: Party[], shaExecuted: string, at: Date, auditPath: string | null): Promise<Uint8Array> {
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
  kv("Signature request", `e-Signature.eu request ${c.esign_id_sign || "—"}`);
  kv("Original document", `${c.original_name} · SHA-256 ${c.sha256_original}`);
  kv("Executed document", `executed.pdf · SHA-256 ${shaExecuted}`);
  if (auditPath) kv("Audit trail", "audit-trail.pdf, issued by e-Signature.eu (kept with the executed document)");
  kv("Executed at (UTC)", at.toISOString().replace("T", " ").slice(0, 19));
  kv("Signature format", "PAdES electronic signatures embedded in the executed PDF, one per signatory, with qualified timestamps; created through e-Signature.eu with the signing method recorded per signatory (itsme® and Evrotrust deliver qualified electronic signatures backed by a qualified trust service provider).");
  y -= 10; page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.6, color: gold }); y -= 20;
  line("Signatories", bold, 12.5, navy); y -= 4;
  for (const p of signatoriesInOrder(parties)) {
    const ev = (p.evidence || {}) as Record<string, string | null>;
    line(`${p.order_no}. ${p.profile?.full_name || "—"}${p.profile?.company ? " · " + p.profile.company : ""}`, bold, 10.5, ink);
    kv("E-mail", p.profile?.email || "—");
    kv("Signed at (UTC)", p.signed_at ? String(p.signed_at).replace("T", " ").slice(0, 19) : "—");
    kv("Signing method", `${METHOD_LABEL[p.esign_method || ""] || p.esign_method || "—"} · signer ${p.esign_signer_no ?? "—"} of request ${c.esign_id_sign || "—"}`);
    if (ev.signer_name) kv("Verified identity", String(ev.signer_name));
    kv("IP address", p.ip || "—");
    y -= 6;
  }
  const auditors = parties.filter((p) => p.role === "auditor");
  if (auditors.length) {
    y -= 6; line("Auditors (follow the execution; not signatories)", bold, 12.5, navy); y -= 4;
    for (const p of auditors) line(`${p.profile?.full_name || "—"}${p.profile?.company ? " · " + p.profile.company : ""} · ${p.profile?.email || ""}`, font, 10, ink);
  }
  y -= 12;
  for (const l of wrap("This certificate is issued by Clavoris as the record of the execution of the contract named above. The legally binding signatures are the electronic signatures embedded in the executed PDF; they can be validated with any PAdES-capable reader or the EU DSS validation service. The hashes above bind this certificate to the exact documents exchanged. Clavoris retains the full event log of the execution together with the provider's audit trail.", 100)) line(l, font, 8.5, grey);
  const pages = pdf.getPages();
  pages.forEach((pg, i) => pg.drawText(`Clavoris · ${c.title} · certificate of completion · page ${i + 1} / ${pages.length}`, { x: M, y: 30, size: 8, font, color: grey }));
  return await pdf.save();
}
