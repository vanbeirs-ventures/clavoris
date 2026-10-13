// supabase/functions/clv-contracts/index.ts
// Contracts executed with eIDAS qualified electronic signatures (Sumsub QES).
// Caller = any signed-in user; staff (admin/super) manage contracts, parties see their own.
//   { action: "list" }                                        -> contracts the caller is party to (staff: all)
//   { action: "get", id }                                     -> contract, parties, events, caller's rights
//   { action: "create", title, description, file_name, pdf_base64 }   (staff; PDF only)
//   { action: "add_party", id, email, name, company, role, order_no } (staff; draft only)
//   { action: "remove_party", id, party_id }                  (staff; draft only)
//   { action: "launch", id }                                  (staff) -> invites the first signatory
//   { action: "cancel", id }                                  (staff)
//   { action: "open", id }                                    -> marks the caller's party as opened
//   { action: "sign_start", id }                              -> uploads the current PDF to Sumsub, returns a WebSDK token
//   { action: "sign_check", id }                              -> polls Sumsub for the signed PDF and advances the sequence
//   { action: "download", id, which: original|executed|certificate } -> binary
// Secrets: SUMSUB_APP_TOKEN, SUMSUB_SECRET_KEY, SUMSUB_QES_LEVEL_NAME. Deploy with --no-verify-jwt.
import { PDFDocument } from "https://esm.sh/pdf-lib@1.17.1";
import { adminClient, APP_URL, audit, clientIp, companyScope, cors, enrolUser, inScope, isStaff, json, requireUser, sendMail } from "../_shared/clv.ts";
import { wants } from "../_shared/notify.ts";
import { ncConfigured, ncGet, ncMkdirP, ncPut, sha256Hex } from "../_shared/nc.ts";
import { sumsub, sumsubAccessToken, sumsubApplicantId, sumsubConfigured } from "../_shared/sumsub.ts";
import { mail, pickLang, word } from "../_shared/mail-i18n.ts";
const withLang = (u: string, l: string) => u + (u.includes("?") ? "&" : "?") + "lang=" + l;
import { CONTRACTS_ROOT, type Contract, finalizeParty, inviteNext, loadParties, logEvent, nextSignatory, type Party, QES_LEVEL, signatoriesInOrder } from "../_shared/contracts.ts";

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "contract";

function partyView(p: Party) {
  return { id: p.id, user_id: p.user_id, name: p.profile?.full_name || "", email: p.profile?.email || "", company: p.profile?.company || "", role: p.role, order_no: p.order_no, status: p.status, invited_at: p.invited_at, opened_at: p.opened_at, signed_at: p.signed_at, declined_at: p.declined_at, sha256_signed: p.sha256_signed };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method" }, 405);
  const admin = adminClient();
  const me = await requireUser(admin, req);
  if (me instanceof Response) return me;
  const body = await req.json().catch(() => ({}));
  const action = String(body.action || "list");
  const staff = isStaff(me);
  const ip = clientIp(req), ua = req.headers.get("user-agent") || "";

  // ---- helpers ----
  async function loadContract(id: string): Promise<{ c: Contract; parties: Party[]; mine: Party | null } | Response> {
    const { data } = await admin.from("clv_contracts").select("*").eq("id", id).maybeSingle();
    if (!data) return json({ error: "not-found" }, 404);
    const parties = await loadParties(admin, id);
    const mine = parties.find((p) => p.user_id === me.id) || null;
    if (!mine && !(staff && inScope(me, (data as any).company_id))) return json({ error: "forbidden" }, 403);
    return { c: data as Contract, parties, mine };
  }

  if (action === "list") {
    let ids: string[] | null = null;
    if (!staff) {
      const { data: mine } = await admin.from("clv_contract_parties").select("contract_id").eq("user_id", me.id);
      ids = (mine || []).map((r: { contract_id: string }) => r.contract_id);
      if (!ids.length) return json({ ok: true, contracts: [], staff });
    }
    let q = admin.from("clv_contracts").select("id, title, description, status, original_name, created_at, launched_at, executed_at, company_id").order("created_at", { ascending: false });
    if (ids) q = q.in("id", ids);
    else if (companyScope(me)) q = q.eq("company_id", companyScope(me)!);
    const { data: cs } = await q;
    const cids = (cs || []).map((c: { id: string }) => c.id);
    const { data: ps } = cids.length ? await admin.from("clv_contract_parties").select("contract_id, user_id, role, status, order_no").in("contract_id", cids) : { data: [] as any[] };
    const out = (cs || []).map((c: any) => {
      const pp = (ps || []).filter((p: any) => p.contract_id === c.id);
      const sig = pp.filter((p: any) => p.role === "signatory");
      const my = pp.find((p: any) => p.user_id === me.id);
      return { ...c, signatories: sig.length, signed: sig.filter((p: any) => p.status === "signed").length, auditors: pp.filter((p: any) => p.role === "auditor").length, my_role: my?.role || (staff ? "staff" : null), my_status: my?.status || null, my_turn: !!my && my.role === "signatory" && ["invited", "opened", "signing"].includes(my.status) && c.status === "in_progress" };
    });
    return json({ ok: true, contracts: out, staff });
  }

  if (action === "get") {
    const r = await loadContract(String(body.id || "")); if (r instanceof Response) return r;
    const { c, parties, mine } = r;
    const { data: events } = await admin.from("clv_contract_events").select("ts, user_id, event, detail, ip").eq("contract_id", c.id).order("ts", { ascending: false }).limit(200);
    const names = new Map(parties.map((p) => [p.user_id, p.profile?.full_name || p.profile?.email || ""]));
    const nxt = nextSignatory(parties);
    const myTurn = !!mine && mine.role === "signatory" && c.status === "in_progress" && !!nxt && nxt.id === mine.id;
    const canExecuted = c.status === "executed" && (staff || (mine?.role === "signatory"));
    return json({
      ok: true, staff,
      contract: { id: c.id, title: c.title, description: c.description, status: c.status, original_name: c.original_name, sha256_original: c.sha256_original, sha256_executed: c.sha256_executed, pages: c.pages, created_at: c.created_at, launched_at: c.launched_at, executed_at: c.executed_at },
      parties: parties.map(partyView),
      events: (events || []).map((e: any) => ({ ...e, who: e.user_id ? names.get(e.user_id) || "" : "Clavoris", detail: staff || mine?.role === "auditor" ? e.detail : { } })),
      me: { role: mine?.role || (staff ? "staff" : null), status: mine?.status || null, my_turn: myTurn, can_download_original: true, can_download_executed: canExecuted, can_manage: staff, next_signatory: nxt ? partyView(nxt).name : null },
      qes_configured: sumsubConfigured() && !!QES_LEVEL(),
    });
  }

  if (action === "open") {
    const r = await loadContract(String(body.id || "")); if (r instanceof Response) return r;
    const { c, mine } = r;
    if (mine && ["pending", "invited"].includes(mine.status) && c.status !== "draft") {
      await admin.from("clv_contract_parties").update({ status: "opened", opened_at: new Date().toISOString() }).eq("id", mine.id);
      await logEvent(admin, c.id, me.id, "party-opened", { party_id: mine.id, role: mine.role }, ip);
    } else if (mine && !mine.opened_at) await admin.from("clv_contract_parties").update({ opened_at: new Date().toISOString() }).eq("id", mine.id);
    return json({ ok: true });
  }

  // ---- staff actions ----
  if (action === "create") {
    if (!staff) return json({ error: "forbidden" }, 403);
    if (!(await ncConfigured())) return json({ error: "storage-not-configured" }, 503);
    const title = String(body.title || "").trim().slice(0, 200);
    const description = String(body.description || "").trim().slice(0, 2000) || null;
    const fileName = String(body.file_name || "contract.pdf").replace(/[^\w.() -]/g, "_").slice(0, 120);
    if (!title) return json({ error: "title-required" }, 400);
    if (!/\.pdf$/i.test(fileName)) return json({ error: "pdf-only" }, 400);
    let bytes: Uint8Array;
    try { bytes = Uint8Array.from(atob(String(body.pdf_base64 || "")), (ch) => ch.charCodeAt(0)); } catch { return json({ error: "bad-file" }, 400); }
    if (bytes.length < 100 || bytes.length > 12 * 1024 * 1024) return json({ error: "file-size" }, 400);
    if (String.fromCharCode(...bytes.slice(0, 5)) !== "%PDF-") return json({ error: "pdf-only" }, 400);
    let pages: number | null = null;
    try { pages = (await PDFDocument.load(bytes, { ignoreEncryption: true })).getPageCount(); } catch { return json({ error: "pdf-unreadable" }, 400); }
    const sha = await sha256Hex(bytes);
    const id = crypto.randomUUID();
    const folder = `${CONTRACTS_ROOT}/${new Date().toISOString().slice(0, 10)}-${slug(title)}-${id.slice(0, 8)}`;
    const originalPath = `${folder}/original.pdf`;
    try { await ncMkdirP(folder); await ncPut(originalPath, bytes, "application/pdf"); } catch (e) { return json({ error: "storage-failed", detail: (e as Error).message }, 502); }
    const { error } = await admin.from("clv_contracts").insert({ id, title, description, status: "draft", folder, original_name: fileName, original_path: originalPath, sha256_original: sha, current_path: originalPath, pages, created_by: me.id, company_id: me.company_id || null });
    if (error) return json({ error: error.message }, 400);
    await logEvent(admin, id, me.id, "contract-created", { title, file: fileName, sha256: sha, pages }, ip);
    await audit(admin, me, "contract-created", title, { id });
    return json({ ok: true, id });
  }

  if (action === "add_party") {
    if (!staff) return json({ error: "forbidden" }, 403);
    const r = await loadContract(String(body.id || "")); if (r instanceof Response) return r;
    const { c, parties } = r;
    if (c.status !== "draft") return json({ error: "not-draft" }, 400);
    const email = String(body.email || "").trim().toLowerCase().slice(0, 200);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: "email-invalid" }, 400);
    const role = body.role === "auditor" ? "auditor" : "signatory";
    const name = String(body.name || "").trim().slice(0, 120), company = String(body.company || "").trim().slice(0, 160) || null;
    const lang = pickLang(body.lang);
    let { data: prof } = await admin.from("clv_profiles").select("id, email, full_name, status, lang, notify").eq("email", email).maybeSingle();
    let created = false, linked = false, link = `${APP_URL}/login.html`;
    if (!prof) {
      const en = await enrolUser(admin, email, name, company, lang);
      if ("error" in en) return json({ error: en.error }, 400);
      prof = { id: en.id, email, full_name: name, status: "registered", lang, notify: {} }; created = en.created; linked = en.linked; link = en.link;
      await audit(admin, me, "user-created", email, { via: "contract-party", contract: c.id, linked });
    } else if (prof.status === "suspended" || prof.status === "rejected") return json({ error: "user-blocked" }, 400);
    if (parties.some((p) => p.user_id === prof!.id)) return json({ error: "already-party" }, 400);
    const order = Number(body.order_no) || (signatoriesInOrder(parties).length + 1);
    const { error } = await admin.from("clv_contract_parties").insert({ contract_id: c.id, user_id: prof.id, role, order_no: role === "signatory" ? order : 0, status: "pending", added_by: me.id });
    if (error) return json({ error: error.message }, 400);
    await logEvent(admin, c.id, me.id, "party-added", { email, role, order: role === "signatory" ? order : null, created }, ip);
    if (created || linked) {
      const m = mail(lang, linked ? "contract_added_linked" : "contract_added_new", { name, title: c.title, role: word(lang, role === "auditor" ? "role_auditor" : "role_signatory"), link: withLang(link, lang), login: `${APP_URL}/login.html?lang=${lang}`, tail: word(lang, role === "auditor" ? "tail_auditor" : "tail_signatory") });
      sendMail(email, m.subject, m.text, lang).catch((e) => console.error("contract party mail", e));
    } else if (wants(prof.notify, "contract_new")) {
      // Existing user: "a contract has been assigned to you" (switchable under Account).
      const L = pickLang(prof.lang);
      const m = mail(L, "contract_assigned", { name: prof.full_name, title: c.title, role: word(L, role === "auditor" ? "role_auditor" : "role_signatory"), link: `${APP_URL}/contract.html?id=${c.id}` });
      sendMail(email, m.subject, m.text, L).catch((e) => console.error("contract assigned mail", e));
    }
    return json({ ok: true, created, linked });
  }

  if (action === "remove_party") {
    if (!staff) return json({ error: "forbidden" }, 403);
    const r = await loadContract(String(body.id || "")); if (r instanceof Response) return r;
    if (r.c.status !== "draft") return json({ error: "not-draft" }, 400);
    await admin.from("clv_contract_parties").delete().eq("id", String(body.party_id || "")).eq("contract_id", r.c.id);
    await logEvent(admin, r.c.id, me.id, "party-removed", { party_id: body.party_id }, ip);
    return json({ ok: true });
  }

  if (action === "launch") {
    if (!staff) return json({ error: "forbidden" }, 403);
    const r = await loadContract(String(body.id || "")); if (r instanceof Response) return r;
    const { c, parties } = r;
    if (c.status !== "draft") return json({ error: "not-draft" }, 400);
    if (!signatoriesInOrder(parties).length) return json({ error: "no-signatories" }, 400);
    if (!sumsubConfigured() || !QES_LEVEL()) return json({ error: "qes-not-configured" }, 503);
    await admin.from("clv_contracts").update({ status: "in_progress", launched_at: new Date().toISOString() }).eq("id", c.id);
    await logEvent(admin, c.id, me.id, "contract-launched", { signatories: signatoriesInOrder(parties).length, auditors: parties.filter((p) => p.role === "auditor").length }, ip);
    const c2 = { ...c, status: "in_progress" };
    await inviteNext(admin, c2, parties);
    const link = `${APP_URL}/contract.html?id=${c.id}`;
    for (const p of parties) {
      if (!p.profile?.email) continue;
      const L = pickLang(p.profile.lang);
      if (p.role === "auditor") { const m = mail(L, "contract_launched_auditor", { name: p.profile.full_name, title: c.title, link }); sendMail(p.profile.email, m.subject, m.text, L).catch(() => {}); }
      else if (p.status === "pending" && wants(p.profile.notify, "contract_new")) { const m = mail(L, "contract_launched_wait", { name: p.profile.full_name, title: c.title, order: p.order_no, link }); sendMail(p.profile.email, m.subject, m.text, L).catch(() => {}); }
    }
    return json({ ok: true });
  }

  if (action === "cancel") {
    if (!staff) return json({ error: "forbidden" }, 403);
    const r = await loadContract(String(body.id || "")); if (r instanceof Response) return r;
    if (r.c.status === "executed") return json({ error: "already-executed" }, 400);
    await admin.from("clv_contracts").update({ status: "cancelled", closed_at: new Date().toISOString() }).eq("id", r.c.id);
    await logEvent(admin, r.c.id, me.id, "contract-cancelled", {}, ip);
    return json({ ok: true });
  }

  // ---- signing ----
  if (action === "sign_start") {
    const r = await loadContract(String(body.id || "")); if (r instanceof Response) return r;
    const { c, parties, mine } = r;
    if (!mine || mine.role !== "signatory") return json({ error: "not-signatory" }, 403);
    if (c.status !== "in_progress") return json({ error: "not-in-progress" }, 400);
    const nxt = nextSignatory(parties);
    if (!nxt || nxt.id !== mine.id) return json({ error: "not-your-turn", waiting_for: nxt ? partyView(nxt).name : null }, 400);
    if (!sumsubConfigured() || !QES_LEVEL()) return json({ error: "qes-not-configured" }, 503);
    if (mine.status === "signed") return json({ ok: true, already: true });

    // 1. The applicant: existing KYC applicant (externalUserId = user id) or a new one on the QES level.
    let applicantId = mine.sumsub_applicant_id || me.sumsub_applicant_id || await sumsubApplicantId(me.id);
    if (!applicantId) {
      const cr = await sumsub("POST", `/resources/applicants?levelName=${encodeURIComponent(QES_LEVEL())}`, { externalUserId: me.id, email: me.email });
      const d = await cr.json().catch(() => ({}));
      if (!cr.ok || !d.id) { console.error("sumsub create applicant", cr.status, JSON.stringify(d).slice(0, 300)); return json({ error: "applicant-failed" }, 502); }
      applicantId = d.id as string;
    }
    // 2. Upload the current version of the contract to the applicant's e-sign step (once per party).
    let docName = mine.sumsub_doc_name;
    if (!docName || mine.status !== "signing") {
      const src = await ncGet(c.current_path || c.original_path);
      const bytes = new Uint8Array(await src.arrayBuffer());
      docName = `Clavoris-${c.id.slice(0, 8)}-${mine.order_no}-${mine.id.slice(0, 8)}.pdf`;
      // Visible signature block on the last page: two columns, stacked by signing order.
      const i = mine.order_no - 1;
      const sigBox = { page: Math.max(1, c.pages || 1), x: 56 + (i % 2) * 250, y: 60 + Math.floor(i / 2) * 70, width: 230, height: 58 };
      const fd = new FormData();
      fd.append("content", new Blob([bytes], { type: "application/pdf" }), docName);
      fd.append("metadata", JSON.stringify({ imageFileName: docName, signatures: { pages: [sigBox] } }));
      const up = await sumsub("POST", `/resources/applicants/${encodeURIComponent(applicantId)}/esign/resources/uploadDoc`, fd);
      const ud = await up.text();
      if (!up.ok) { console.error("sumsub uploadDoc", up.status, ud.slice(0, 300)); return json({ error: "upload-failed", status: up.status }, 502); }
      await admin.from("clv_contract_parties").update({ status: "signing", signing_started_at: new Date().toISOString(), sumsub_applicant_id: applicantId, sumsub_doc_name: docName, ip, user_agent: ua, evidence: { ...(mine.evidence || {}), signature_box: sigBox, input_sha256: await sha256Hex(bytes) } }).eq("id", mine.id);
      await logEvent(admin, c.id, me.id, "signing-started", { party_id: mine.id, doc: docName, applicant: applicantId }, ip);
    }
    // 3. WebSDK token on the QES level.
    const token = await sumsubAccessToken(me.id, QES_LEVEL());
    if (!token) return json({ error: "token-failed" }, 502);
    return json({ ok: true, token, email: me.email, doc: docName });
  }

  if (action === "sign_check") {
    const r = await loadContract(String(body.id || "")); if (r instanceof Response) return r;
    const { mine } = r;
    if (!mine || mine.role !== "signatory") return json({ error: "not-signatory" }, 403);
    const res = await finalizeParty(admin, mine.id);
    return json({ ok: res.ok, state: res.state, error: res.error });
  }

  if (action === "download") {
    const r = await loadContract(String(body.id || "")); if (r instanceof Response) return r;
    const { c, mine } = r;
    const which = String(body.which || "original");
    let path: string | null = null, name = "";
    if (which === "original") { path = c.original_path; name = c.original_name; }
    else if (which === "executed" || which === "certificate") {
      if (c.status !== "executed") return json({ error: "not-executed" }, 400);
      if (!staff && mine?.role !== "signatory") return json({ error: "signatories-only" }, 403);
      path = which === "executed" ? c.executed_path : c.certificate_path;
      name = which === "executed" ? c.original_name.replace(/\.pdf$/i, "") + "__EXECUTED.pdf" : c.original_name.replace(/\.pdf$/i, "") + "__certificate-of-completion.pdf";
    } else return json({ error: "bad-which" }, 400);
    if (!path) return json({ error: "file-missing" }, 404);
    let res: Response;
    try { res = await ncGet(path); } catch (e) { return json({ error: "file-unavailable", detail: (e as Error).message }, 404); }
    const bytes = new Uint8Array(await res.arrayBuffer());
    const sha = await sha256Hex(bytes);
    const code = "C" + crypto.randomUUID().replace(/-/g, "").slice(0, 9).toUpperCase();
    await logEvent(admin, c.id, me.id, "download", { which, sha256: sha, code }, ip);
    await admin.from("clv_downloads").insert({ code, user_id: me.id, room_id: null, contract_id: c.id, file_path: path, file_name: name, sha256_source: sha, sha256_delivered: sha, delivered_as: which === "original" ? "original" : "qes-signed", watermark: { code, contract: c.id, which, stamped: false }, ip, user_agent: ua }).then(() => {}, (e: unknown) => console.error("contract download record", e));
    return new Response(bytes, { status: 200, headers: { ...cors, "content-type": "application/pdf", "content-disposition": `attachment; filename="${name.replace(/"/g, "")}"`, "access-control-expose-headers": "content-disposition" } });
  }

  return json({ error: "bad-action" }, 400);
});
