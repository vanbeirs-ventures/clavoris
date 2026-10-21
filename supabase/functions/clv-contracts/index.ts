// supabase/functions/clv-contracts/index.ts
// Contracts executed with eIDAS qualified electronic signatures (e-Signature.eu: itsme® / Evrotrust).
// Caller = any signed-in user; staff (admin/super) manage contracts, parties see their own.
//   { action: "list" }                                        -> contracts the caller is party to (staff: also their company's), the
//                                                                data-room NDAs presented to them, and whether they may create contracts
//   { action: "nda_pdf", room_id }                            -> the caller's own signed NDA of that room (printable; also after leaving)
//   { action: "get", id }                                     -> contract, parties, events, caller's rights
//   { action: "create", title, description, file_name, pdf_base64 }   (staff; PDF only)
//   { action: "add_party", id, email, name, company, role, order_no } (staff; draft only)
//   { action: "remove_party", id, party_id }                  (staff; draft only)
//   { action: "launch", id }                                  (staff) -> creates the e-Signature.eu request, invites the first signatory
//   { action: "remind", id }                                  (staff) -> re-sends "your signature is requested" to the current signatory
//   { action: "cancel", id }                                  (staff) -> cancels the request at the provider too
//   { action: "open", id }                                    -> marks the caller's party as opened
//   { action: "sign_start", id }                              -> returns the caller's embedded signing link
//   { action: "sign_check", id }                              -> syncs with the provider (signed parties, finished document)
//   { action: "balance" }                                     (staff) -> signature credits left at the provider
//   { action: "download", id, which: original|executed|certificate|audit } -> binary (signatories, auditors and the company's staff;
//      delivered as stored: no watermark and no print restriction, a QES-signed PDF must not be altered)
// Secrets: ESIGN_API_KEY, ESIGN_USER_ID (optional ESIGN_METHODS). Deploy with --no-verify-jwt.
import { PDFDocument } from "https://esm.sh/pdf-lib@1.17.1";
import { adminClient, APP_URL, audit, clientIp, companyScope, cors, enrolUser, inScope, isStaff, json, requireUser, sendMail } from "../_shared/clv.ts";
import { activationLink, isActivated } from "../_shared/activation.ts";
import { wants } from "../_shared/notify.ts";
import { limitOf, overLimit, planOf } from "../_shared/plans.ts";
import { ncConfigured, ncGet, ncMkdirP, ncPut, sha256Hex } from "../_shared/nc.ts";
import { bytesToB64, esign, esignBalance, esignConfigured, esignGetRequest, ESIGN_METHODS, type EsignRequest, esignResult, normalizePhone, splitName } from "../_shared/esign.ts";
import { mail, pickLang, word } from "../_shared/mail-i18n.ts";
const withLang = (u: string, l: string) => u + (u.includes("?") ? "&" : "?") + "lang=" + l;
import { CONTRACTS_ROOT, type Contract, contractFrom, inviteNext, loadParties, logEvent, nextSignatory, type Party, signatoriesInOrder, syncContract } from "../_shared/contracts.ts";

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
  // manage = staff of the company that owns the contract (or a Clavoris super admin). Staff of another company
  // who are a party to the contract see it as a party only.
  async function loadContract(id: string): Promise<{ c: Contract; parties: Party[]; mine: Party | null; manage: boolean } | Response> {
    const { data } = await admin.from("clv_contracts").select("*").eq("id", id).maybeSingle();
    if (!data) return json({ error: "not-found" }, 404);
    const parties = await loadParties(admin, id);
    const mine = parties.find((p) => p.user_id === me.id) || null;
    const manage = staff && inScope(me, (data as any).company_id);
    if (!mine && !manage) return json({ error: "forbidden" }, 403);
    return { c: data as Contract, parties, mine, manage };
  }

  if (action === "list") {
    // Contracts: those the caller is a party to, plus (staff) every contract of their own company.
    const { data: mine } = await admin.from("clv_contract_parties").select("contract_id").eq("user_id", me.id);
    const partyIds = (mine || []).map((r: { contract_id: string }) => r.contract_id);
    const sel = "id, title, description, status, original_name, created_at, launched_at, executed_at, company_id";
    const lists: any[][] = [];
    if (partyIds.length) { const { data } = await admin.from("clv_contracts").select(sel).in("id", partyIds); lists.push(data || []); }
    if (staff) { let q = admin.from("clv_contracts").select(sel); if (companyScope(me)) q = q.eq("company_id", companyScope(me)!); const { data } = await q; lists.push(data || []); }
    const byId = new Map<string, any>(); lists.flat().forEach((c: any) => byId.set(c.id, c));
    const cs = [...byId.values()].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
    const cids = cs.map((c: { id: string }) => c.id);
    const { data: ps } = cids.length ? await admin.from("clv_contract_parties").select("contract_id, user_id, role, status, order_no").in("contract_id", cids) : { data: [] as any[] };
    const out = cs.map((c: any) => {
      const pp = (ps || []).filter((p: any) => p.contract_id === c.id);
      const sig = pp.filter((p: any) => p.role === "signatory");
      const my = pp.find((p: any) => p.user_id === me.id);
      const manage = staff && inScope(me, c.company_id);
      return { ...c, signatories: sig.length, signed: sig.filter((p: any) => p.status === "signed").length, auditors: pp.filter((p: any) => p.role === "auditor").length, my_role: my?.role || (manage ? "staff" : null), my_status: my?.status || null, my_turn: !!my && my.role === "signatory" && ["invited", "opened", "signing"].includes(my.status) && c.status === "in_progress", can_download_executed: c.status === "executed" && (manage || my?.role === "signatory" || my?.role === "auditor") };
    });

    // Data-room NDAs: rooms the caller is (or was) a member of that require an NDA, signed or still to sign; and for
    // the company's staff, the countersignature of the NDAs of their company's rooms. A member of the company team
    // (staff of the room's company) does not sign the room's NDA.
    const ndas: any[] = [];
    const { data: asg } = await admin.from("clv_room_assignments").select("room_id, granted_at, revoked_at, kyc_waived").eq("user_id", me.id);
    const { data: signedDocs } = await admin.from("clv_signed_documents").select("room_id, doc_version, signed_at, countersigned_at, validation").eq("user_id", me.id).eq("doc_type", "nda").order("signed_at", { ascending: false });
    const roomIds = [...new Set([...(asg || []).map((a: any) => a.room_id), ...(signedDocs || []).map((d: any) => d.room_id)])].filter(Boolean);
    const ownRooms = staff ? await (async () => { let q = admin.from("clv_rooms").select("id"); if (companyScope(me)) q = q.eq("company_id", companyScope(me)!); const { data } = await q; return (data || []).map((r: any) => r.id as string); })() : [];
    const allRooms = [...new Set([...roomIds, ...ownRooms])];
    const { data: rooms } = allRooms.length ? await admin.from("clv_rooms").select("id, name, company_id, qes_nda_required, annex_version, company:clv_companies(name)").in("id", allRooms) : { data: [] as any[] };
    const roomById = new Map((rooms || []).map((r: any) => [r.id, r]));
    for (const rid of roomIds) {
      const r: any = roomById.get(rid); if (!r) continue;
      const doc = (signedDocs || []).find((d: any) => d.room_id === rid);
      const a = (asg || []).find((x: any) => x.room_id === rid);
      if (staff && inScope(me, r.company_id)) continue; // company team: no NDA of its own
      if (!doc && (!r.qes_nda_required || !a || a.revoked_at)) continue; // nothing signed and nothing to sign
      ndas.push({ kind: "member", room_id: rid, room: r.name, company: r.company?.name || "", since: a?.granted_at || null, signed_at: doc?.signed_at || null, version: doc?.doc_version || r.annex_version, countersigned_at: doc?.countersigned_at || null, left: !!a?.revoked_at || !a,
        // Signature type: electronic acceptance after identity verification, or without it where the company
        // running the room switched identity verification off for this person ("KYC off").
        no_kyc: doc ? (doc as any).validation?.method === "click-kyc-waived" : !!a?.kyc_waived && me.status !== "verified" });
    }
    if (ownRooms.length) {
      const nda = (rooms || []).filter((r: any) => ownRooms.includes(r.id) && r.qes_nda_required);
      const { data: cs2 } = nda.length ? await admin.from("clv_nda_countersignatures").select("room_id, signed_at, versions").in("room_id", nda.map((r: any) => r.id)).is("revoked_at", null) : { data: [] as any[] };
      const { data: copies } = nda.length ? await admin.from("clv_signed_documents").select("room_id, doc_version, countersigned_at").eq("doc_type", "nda").in("room_id", nda.map((r: any) => r.id)) : { data: [] as any[] };
      for (const r of nda as any[]) {
        const v = r.annex_version;
        const sig = (cs2 || []).find((x: any) => x.room_id === r.id && (x.versions || []).some((y: any) => y.version === v));
        const waiting = (copies || []).filter((d: any) => d.room_id === r.id && !d.countersigned_at).length;
        ndas.push({ kind: "countersign", room_id: r.id, room: r.name, company: r.company?.name || "", version: v, countersigned_at: sig?.signed_at || null, waiting, since: null });
      }
    }

    // Creating contracts: Clavoris super admins, and staff of a company account whose plan includes contracts.
    let can_create = me.role === "super";
    if (!can_create && staff && me.company_id) { const { plan } = await planOf(admin, me.company_id); can_create = plan.code !== "free" && limitOf(plan, "contracts") !== 0; }
    return json({ ok: true, contracts: out, ndas, staff, can_create });
  }

  if (action === "nda_pdf") {
    // The caller's own signed NDA of a data room, as stored (with the Clavoris signature page and, once given, the
    // company's countersignature page). Printable. Available also after the access ended or the member left.
    const roomId = String(body.room_id || "");
    const { data: doc } = await admin.from("clv_signed_documents").select("id, nextcloud_path, countersigned_path, doc_version").eq("room_id", roomId).eq("user_id", me.id).eq("doc_type", "nda").order("signed_at", { ascending: false }).limit(1).maybeSingle();
    const path = doc?.countersigned_path || doc?.nextcloud_path;
    if (!path) return json({ error: "no-nda" }, 404);
    let res: Response;
    try { res = await ncGet(path); } catch (e) { return json({ error: "file-unavailable", detail: (e as Error).message }, 404); }
    const bytes = new Uint8Array(await res.arrayBuffer());
    const name = path.split("/").pop() || "NDA.pdf";
    await admin.from("clv_access_log").insert({ user_id: me.id, room_id: roomId, file_path: path, action: "download-nda", ip, user_agent: ua }).then(() => {}, () => {});
    return new Response(bytes, { status: 200, headers: { ...cors, "content-type": "application/pdf", "content-disposition": `attachment; filename="${name.replace(/"/g, "")}"`, "access-control-expose-headers": "content-disposition" } });
  }

  if (action === "get") {
    const r = await loadContract(String(body.id || "")); if (r instanceof Response) return r;
    const { c, parties, mine, manage } = r;
    const { data: events } = await admin.from("clv_contract_events").select("ts, user_id, event, detail, ip").eq("contract_id", c.id).order("ts", { ascending: false }).limit(200);
    const names = new Map(parties.map((p) => [p.user_id, p.profile?.full_name || p.profile?.email || ""]));
    const nxt = nextSignatory(parties);
    const myTurn = !!mine && mine.role === "signatory" && c.status === "in_progress" && !!nxt && nxt.id === mine.id;
    const canExecuted = c.status === "executed" && (manage || mine?.role === "signatory" || mine?.role === "auditor");
    return json({
      ok: true, staff: manage,
      contract: { id: c.id, title: c.title, description: c.description, status: c.status, original_name: c.original_name, sha256_original: c.sha256_original, sha256_executed: c.sha256_executed, pages: c.pages, created_at: c.created_at, launched_at: c.launched_at, executed_at: c.executed_at, esign_id_sign: manage ? c.esign_id_sign : null, esign_status: manage ? c.esign_status : null, has_audit_trail: !!c.audit_trail_path },
      parties: parties.map(partyView),
      events: (events || []).map((e: any) => ({ ...e, who: e.user_id ? names.get(e.user_id) || "" : "Clavoris", detail: manage || mine?.role === "auditor" ? e.detail : { } })),
      me: { role: mine?.role || (manage ? "staff" : null), status: mine?.status || null, my_turn: myTurn, can_download_original: true, can_download_executed: canExecuted, can_manage: manage, next_signatory: nxt ? partyView(nxt).name : null },
      qes_configured: esignConfigured(),
    });
  }

  if (action === "balance") {
    if (!staff) return json({ error: "forbidden" }, 403);
    if (!esignConfigured()) return json({ ok: true, configured: false, balance: null });
    return json({ ok: true, configured: true, balance: await esignBalance() });
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
    // The company account's plan sets how many contracts it may have (Clavoris super admins are not limited).
    // Staff without a company account cannot create contracts (only a company on a paid plan can).
    if (me.role !== "super" && !me.company_id) return json({ error: "plan-limit", module: "contracts", plan: "free", limit: 0, used: 0 }, 403);
    if (me.role !== "super") { const over = await overLimit(admin, me.company_id, "contracts"); if (over) return json(over, 403); }
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
    if (!r.manage) return json({ error: "forbidden" }, 403);
    const { c, parties } = r;
    if (c.status !== "draft") return json({ error: "not-draft" }, 400);
    const email = String(body.email || "").trim().toLowerCase().slice(0, 200);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: "email-invalid" }, 400);
    const role = body.role === "auditor" ? "auditor" : "signatory";
    const name = String(body.name || "").trim().slice(0, 120), company = String(body.company || "").trim().slice(0, 160) || null;
    const lang = pickLang(body.lang);
    let { data: prof } = await admin.from("clv_profiles").select("id, email, full_name, status, lang, notify, last_login_at").eq("email", email).maybeSingle();
    let created = false, linked = false, link = `${APP_URL}/login.html`;
    if (!prof) {
      const en = await enrolUser(admin, email, name, company, lang);
      if ("error" in en) return json({ error: en.error }, 400);
      prof = { id: en.id, email, full_name: name, status: "registered", lang, notify: {}, last_login_at: null }; created = en.created; linked = en.linked; link = en.link;
      await audit(admin, me, "user-created", email, { via: "contract-party", contract: c.id, linked });
    } else if (prof.status === "suspended" || prof.status === "rejected") return json({ error: "user-blocked" }, 400);
    else if (!(await isActivated(admin, prof.id, prof.last_login_at))) {
      // Enrolled earlier but never signed in: the activation mail again, with a fresh link.
      const act = await activationLink(admin, prof.email);
      if (act) { created = true; link = act; }
    }
    if (parties.some((p) => p.user_id === prof!.id)) return json({ error: "already-party" }, 400);
    const order = Number(body.order_no) || (signatoriesInOrder(parties).length + 1);
    const { error } = await admin.from("clv_contract_parties").insert({ contract_id: c.id, user_id: prof.id, role, order_no: role === "signatory" ? order : 0, status: "pending", added_by: me.id });
    if (error) return json({ error: error.message }, 400);
    await logEvent(admin, c.id, me.id, "party-added", { email, role, order: role === "signatory" ? order : null, created }, ip);
    const from = await contractFrom(admin, c);
    if (created || linked) {
      const m = mail(lang, linked ? "contract_added_linked" : "contract_added_new", { name: name || prof.full_name, from, title: c.title, role: word(lang, role === "auditor" ? "role_auditor" : "role_signatory"), link: withLang(link, lang), login: `${APP_URL}/login.html?lang=${lang}`, tail: word(lang, role === "auditor" ? "tail_auditor" : "tail_signatory") });
      sendMail(email, m.subject, m.text, lang).catch((e) => console.error("contract party mail", e));
    } else if (wants(prof.notify, "contract_new")) {
      // Existing user: "a contract has been assigned to you" (switchable under Account).
      const L = pickLang(prof.lang);
      const m = mail(L, "contract_assigned", { name: prof.full_name, from, title: c.title, role: word(L, role === "auditor" ? "role_auditor" : "role_signatory"), link: `${APP_URL}/contract.html?id=${c.id}` });
      sendMail(email, m.subject, m.text, L).catch((e) => console.error("contract assigned mail", e));
    }
    return json({ ok: true, created, linked });
  }

  if (action === "remove_party") {
    if (!staff) return json({ error: "forbidden" }, 403);
    const r = await loadContract(String(body.id || "")); if (r instanceof Response) return r;
    if (!r.manage) return json({ error: "forbidden" }, 403);
    if (r.c.status !== "draft") return json({ error: "not-draft" }, 400);
    await admin.from("clv_contract_parties").delete().eq("id", String(body.party_id || "")).eq("contract_id", r.c.id);
    await logEvent(admin, r.c.id, me.id, "party-removed", { party_id: body.party_id }, ip);
    return json({ ok: true });
  }

  if (action === "launch") {
    if (!staff) return json({ error: "forbidden" }, 403);
    const r = await loadContract(String(body.id || "")); if (r instanceof Response) return r;
    if (!r.manage) return json({ error: "forbidden" }, 403);
    const c = r.c; let parties = r.parties;
    if (c.status !== "draft") return json({ error: "not-draft" }, 400);
    const sigs = signatoriesInOrder(parties);
    if (!sigs.length) return json({ error: "no-signatories" }, 400);
    if (!esignConfigured()) return json({ error: "qes-not-configured" }, 503);
    // Every signatory needs a name and a mobile number (itsme®/Evrotrust identify the signer by phone).
    const missing = sigs.filter((p) => !normalizePhone(p.profile?.mobile) || !String(p.profile?.full_name || "").trim()).map((p) => p.profile?.email || p.user_id);
    if (missing.length) return json({ error: "party-profile-incomplete", parties: missing }, 400);

    // One request at e-Signature.eu for the whole contract (embedded mode: the provider sends no mail;
    // Clavoris hands out the signing links in order).
    const src = await ncGet(c.current_path || c.original_path);
    const bytes = new Uint8Array(await src.arrayBuffer());
    const docName = `Clavoris-${c.id.slice(0, 8)}.pdf`;
    const signers = sigs.map((p) => ({ ...splitName(p.profile?.full_name, p.profile?.email || ""), email: p.profile?.email || "", phone: normalizePhone(p.profile?.mobile) }));
    const payload = {
      lang: pickLang(sigs[0].profile?.lang), title: c.title, signature_place: "position_auto", send_email: false, reminder: 0, email_notification: false,
      note_html: `<p>${c.title.replace(/</g, "&lt;")}</p>`, signature_redirect: `${APP_URL}/contract.html?id=${c.id}&signed=1`,
      methods: ESIGN_METHODS(), signers, pdf_file_base64: bytesToB64(bytes),
    };
    const cr = await esign("POST", "request", payload);
    const reqData = esignResult<EsignRequest>(cr.data);
    if (!cr.ok || !reqData?.id_sign) { console.error("esign request", cr.status, cr.text.slice(0, 400)); return json({ error: "provider-request-failed", status: cr.status, detail: (cr.data as any)?.message || cr.text.slice(0, 200) }, 502); }
    const idSign = String(reqData.id_sign);
    for (let i = 0; i < sigs.length; i++) {
      const s = reqData.signers?.[String(i + 1)];
      await admin.from("clv_contract_parties").update({ esign_signer_no: i + 1, esign_signature_link: s?.signature_link || null, evidence: { ...(sigs[i].evidence || {}), input_sha256: c.sha256_original } }).eq("id", sigs[i].id);
    }
    await admin.from("clv_contracts").update({ status: "in_progress", launched_at: new Date().toISOString(), esign_id_sign: idSign, esign_status: reqData.status_id || "pending", esign_doc_name: reqData.doc_name || docName, esign_synced_at: new Date().toISOString() }).eq("id", c.id);
    await logEvent(admin, c.id, me.id, "contract-launched", { signatories: sigs.length, auditors: parties.filter((p) => p.role === "auditor").length, esign_id_sign: idSign, methods: ESIGN_METHODS() }, ip);
    parties = await loadParties(admin, c.id);
    const c2 = { ...c, status: "in_progress", esign_id_sign: idSign };
    const first = await inviteNext(admin, c2, parties);
    const link = `${APP_URL}/contract.html?id=${c.id}`, from = await contractFrom(admin, c);
    for (const p of parties) {
      if (first && p.id === first.id) continue; // already received "your signature is requested"
      if (!p.profile?.email) continue;
      const L = pickLang(p.profile.lang);
      if (p.role === "auditor") { const m = mail(L, "contract_launched_auditor", { name: p.profile.full_name, from, title: c.title, link }); sendMail(p.profile.email, m.subject, m.text, L).catch(() => {}); }
      else if (p.status === "pending" && wants(p.profile.notify, "contract_new")) { const m = mail(L, "contract_launched_wait", { name: p.profile.full_name, from, title: c.title, order: p.order_no, link }); sendMail(p.profile.email, m.subject, m.text, L).catch(() => {}); }
    }
    return json({ ok: true });
  }

  if (action === "remind") {
    // Staff: re-send "your signature is requested" to the signatory whose turn it is.
    if (!staff) return json({ error: "forbidden" }, 403);
    const r = await loadContract(String(body.id || "")); if (r instanceof Response) return r;
    if (!r.manage) return json({ error: "forbidden" }, 403);
    const { c, parties } = r;
    if (c.status !== "in_progress") return json({ error: "not-in-progress" }, 400);
    const nxt = nextSignatory(parties);
    if (!nxt || !nxt.profile?.email) return json({ error: "no-signatory" }, 400);
    const L = pickLang(nxt.profile.lang);
    const m = mail(L, "contract_your_turn", { name: nxt.profile.full_name, from: await contractFrom(admin, c), title: c.title, link: `${APP_URL}/contract.html?id=${c.id}` });
    const sent = await sendMail(nxt.profile.email, m.subject, m.text, L).catch((e) => { console.error("contract remind mail", e); return false; });
    await logEvent(admin, c.id, me.id, "party-reminded", { party_id: nxt.id, sent }, ip);
    return json({ ok: true, sent, to: nxt.profile.email });
  }

  if (action === "cancel") {
    if (!staff) return json({ error: "forbidden" }, 403);
    const r = await loadContract(String(body.id || "")); if (r instanceof Response) return r;
    if (!r.manage) return json({ error: "forbidden" }, 403);
    if (r.c.status === "executed") return json({ error: "already-executed" }, 400);
    let provider: string | null = null;
    if (r.c.esign_id_sign && r.c.status === "in_progress" && esignConfigured()) {
      const x = await esign("DELETE", "cancel", undefined, { id_sign: r.c.esign_id_sign });
      provider = x.ok ? "cancelled" : `cancel-failed ${x.status}`;
      if (!x.ok) console.error("esign cancel", x.status, x.text.slice(0, 300));
    }
    await admin.from("clv_contracts").update({ status: "cancelled", closed_at: new Date().toISOString(), esign_status: provider === "cancelled" ? "cancelled" : r.c.esign_status }).eq("id", r.c.id);
    await admin.from("clv_contract_parties").update({ esign_signature_link: null }).eq("contract_id", r.c.id);
    await logEvent(admin, r.c.id, me.id, "contract-cancelled", { provider }, ip);
    return json({ ok: true, provider });
  }

  // ---- signing ----
  if (action === "sign_start") {
    const r = await loadContract(String(body.id || "")); if (r instanceof Response) return r;
    const { c, parties, mine } = r;
    if (!mine || mine.role !== "signatory") return json({ error: "not-signatory" }, 403);
    if (c.status !== "in_progress") return json({ error: "not-in-progress" }, 400);
    const nxt = nextSignatory(parties);
    if (!nxt || nxt.id !== mine.id) return json({ error: "not-your-turn", waiting_for: nxt ? partyView(nxt).name : null }, 400);
    if (!esignConfigured() || !c.esign_id_sign) return json({ error: "qes-not-configured" }, 503);
    if (mine.status === "signed") return json({ ok: true, already: true });
    // The embedded signing link was issued at launch; re-fetch it from the provider if missing.
    let link = mine.esign_signature_link;
    if (!link && mine.esign_signer_no) {
      const req = await esignGetRequest(c.esign_id_sign);
      link = req?.signers?.[String(mine.esign_signer_no)]?.signature_link || null;
      if (link) await admin.from("clv_contract_parties").update({ esign_signature_link: link }).eq("id", mine.id);
    }
    if (!link) return json({ error: "signing-link-unavailable" }, 502);
    if (mine.status !== "signing") {
      await admin.from("clv_contract_parties").update({ status: "signing", signing_started_at: new Date().toISOString(), ip, user_agent: ua }).eq("id", mine.id);
      await logEvent(admin, c.id, me.id, "signing-started", { party_id: mine.id, esign_id_sign: c.esign_id_sign, signer_no: mine.esign_signer_no }, ip);
    }
    return json({ ok: true, url: link, email: me.email, methods: ESIGN_METHODS() });
  }

  if (action === "sign_check") {
    const r = await loadContract(String(body.id || "")); if (r instanceof Response) return r;
    const { c, mine } = r;
    if (!mine || mine.role !== "signatory") return json({ error: "not-signatory" }, 403);
    if (mine.status === "signed") return json({ ok: true, state: c.status === "executed" ? "executed" : "signed" });
    if (c.status !== "in_progress") return json({ ok: true, state: c.status });
    // The webhook is the primary path; this sync is rate-limited so that the page can poll gently.
    const age = c.esign_synced_at ? Date.now() - new Date(c.esign_synced_at).getTime() : Infinity;
    if (age < 10_000) return json({ ok: true, state: mine.status });
    const res = await syncContract(admin, c);
    if (!res.ok) return json({ ok: false, state: res.state, error: res.error });
    const { data: p2 } = await admin.from("clv_contract_parties").select("status").eq("id", mine.id).maybeSingle();
    const { data: c2 } = await admin.from("clv_contracts").select("status").eq("id", c.id).maybeSingle();
    const state = c2?.status === "executed" ? "executed" : p2?.status === "signed" ? "signed" : c2?.status === "cancelled" ? "cancelled" : "signing";
    return json({ ok: true, state });
  }

  if (action === "download") {
    const r = await loadContract(String(body.id || "")); if (r instanceof Response) return r;
    const { c, mine, manage } = r;
    const which = String(body.which || "original");
    let path: string | null = null, name = "";
    if (which === "original") { path = c.original_path; name = c.original_name; }
    else if (which === "executed" || which === "certificate" || which === "audit") {
      if (c.status !== "executed") return json({ error: "not-executed" }, 400);
      if (!manage && mine?.role !== "signatory" && mine?.role !== "auditor") return json({ error: "parties-only" }, 403);
      const base = c.original_name.replace(/\.pdf$/i, "");
      path = which === "executed" ? c.executed_path : which === "certificate" ? c.certificate_path : c.audit_trail_path;
      name = which === "executed" ? base + "__EXECUTED.pdf" : which === "certificate" ? base + "__certificate-of-completion.pdf" : base + "__audit-trail.pdf";
    } else return json({ error: "bad-which" }, 400);
    if (!path) return json({ error: "file-missing" }, 404);
    let res: Response;
    try { res = await ncGet(path); } catch (e) { return json({ error: "file-unavailable", detail: (e as Error).message }, 404); }
    const bytes = new Uint8Array(await res.arrayBuffer());
    const sha = await sha256Hex(bytes);
    const code = "C" + crypto.randomUUID().replace(/-/g, "").slice(0, 9).toUpperCase();
    await logEvent(admin, c.id, me.id, "download", { which, sha256: sha, code }, ip);
    await admin.from("clv_downloads").insert({ code, user_id: me.id, room_id: null, contract_id: c.id, file_path: path, file_name: name, sha256_source: sha, sha256_delivered: sha, delivered_as: which === "original" ? "original" : "qes-signed", watermark: { code, contract: c.id, which, stamped: false }, ip, user_agent: ua }).then(() => {}, (e: unknown) => console.error("contract download record", e));
    return new Response(bytes, { status: 200, headers: { ...cors, "content-type": "application/pdf", "content-disposition": `attachment; filename="${name.replace(/\"/g, "")}"`, "access-control-expose-headers": "content-disposition" } });
  }

  return json({ error: "bad-action" }, 400);
});
