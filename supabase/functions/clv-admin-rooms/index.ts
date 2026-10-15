// supabase/functions/clv-admin-rooms/index.ts
// Admin console for company accounts and data rooms (caller must be admin or super; an admin only
// sees their own company's rooms, a super every company).
//   { action: "companies" }                              -> company accounts (super: all; admin: own)
//   { action: "save_company", company: {...} }           -> create / update a company (super); a company admin updates their own
//   { action: "list" }                                   -> rooms with member counts, pending extension requests
//   { action: "save_room", room: {...}, nda_pdf_base64?, nda_pdf_name? } -> create / update a room (NDA PDF stored on Nextcloud)
//   { action: "members", room_id }                       -> members incl. revoked, onboarding status, expiry, pending request
//   { action: "invite", room_id, email, lang?, salutation? ("mr"|"mrs"), first_name?, last_name?, name?, company?, expires_at? }
//                                                         -> enrol-if-needed + assign + invitation mail
//   { action: "set_expiry", room_id, user_id, expires_at } -> change the access end date
//   { action: "decide_extension", request_id, accept, until?, note? } -> accept / reject an extension request (mails the user)
//   { action: "revoke" | "reactivate" | "remind", room_id, user_id }
//   { action: "set_answerer", room_id, user_id, on }      -> tag a member as answering the room's Q&A questions
// Deploy: supabase functions deploy clv-admin-rooms --no-verify-jwt
import { adminClient, APP_URL, audit, companyScope, cors, enrolUser, fmtDay, inScope, json, requireAdmin, sendMail, ctaLabel } from "../_shared/clv.ts";
import { mail, OPEN_CTA, pickLang, word } from "../_shared/room-mail.ts";
import { ncConfigured, ncMkdirP, ncPut, sha256Hex } from "../_shared/nc.ts";
const withLang = (u: string, l: string) => u + (u.includes("?") ? "&" : "?") + "lang=" + l;
const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "room";
const isDate = (s: unknown) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ""));
// An access end date is stored as the end of that day (UTC) so the countdown reads naturally.
const endOfDay = (d: string) => new Date(d + "T23:59:59Z").toISOString();

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method" }, 405);
  const admin = adminClient();
  const me = await requireAdmin(admin, req);
  if (me instanceof Response) return me;
  const body = await req.json().catch(() => ({}));
  const action = String(body.action || "list");
  const scope = companyScope(me);

  async function companyName(id: string | null | undefined): Promise<string> {
    if (!id) return "Clavoris";
    const { data } = await admin.from("clv_companies").select("name").eq("id", id).maybeSingle();
    return data?.name || "Clavoris";
  }

  /* ---------------- company accounts ---------------- */
  if (action === "companies") {
    let q = admin.from("clv_companies").select("id, name, legal_form, country, registration_no, contact_email, created_at").order("name");
    if (scope) q = q.eq("id", scope);
    const { data } = await q;
    const { data: staff } = await admin.from("clv_profiles").select("id, email, full_name, role, company_id").in("role", ["admin", "super"]);
    return json({ ok: true, companies: (data || []).map((c: any) => ({ ...c, admins: (staff || []).filter((s: any) => s.company_id === c.id).map((s: any) => ({ id: s.id, email: s.email, name: s.full_name, role: s.role })) })), me: { role: me.role, company_id: me.company_id || null } });
  }
  if (action === "save_company") {
    // A super creates and edits every company; a company admin edits the details of their own company.
    const c = body.company || {};
    if (me.role !== "super" && !(c.id && String(c.id) === me.company_id)) return json({ error: "forbidden" }, 403);
    const row = { name: String(c.name || "").trim().slice(0, 200), legal_form: String(c.legal_form || "").trim().slice(0, 60) || null, country: String(c.country || "").trim().toUpperCase().slice(0, 2) || null, registration_no: String(c.registration_no || "").trim().slice(0, 60) || null, contact_email: String(c.contact_email || "").trim().toLowerCase().slice(0, 200) || null };
    if (!row.name) return json({ error: "name-required" }, 400);
    const res = c.id ? await admin.from("clv_companies").update(row).eq("id", String(c.id)).select("id").single() : await admin.from("clv_companies").insert({ ...row, created_by: me.id }).select("id").single();
    if (res.error) return json({ error: res.error.message }, 400);
    await audit(admin, me, c.id ? "company-updated" : "company-created", row.name, { id: res.data.id });
    return json({ ok: true, id: res.data.id });
  }

  /* ---------------- rooms ---------------- */
  if (action === "list") {
    let q = admin.from("clv_rooms").select("id, slug, name, description, seller, project_type, status, qes_nda_required, default_expiry_days, downloads_allowed, nextcloud_folder, company_id, nda_pdf_name, nda_pdf_path, annex_version, created_at, company:clv_companies(name)").order("created_at", { ascending: false });
    if (scope) q = q.eq("company_id", scope);
    const { data: rooms } = await q;
    const ids = (rooms || []).map((r: any) => r.id);
    const { data: asg } = ids.length ? await admin.from("clv_room_assignments").select("room_id").in("room_id", ids).is("revoked_at", null) : { data: [] as any[] };
    const { data: reqs } = ids.length ? await admin.from("clv_access_requests").select("room_id").in("room_id", ids).eq("status", "pending") : { data: [] as any[] };
    const counts: Record<string, number> = {}, pend: Record<string, number> = {};
    (asg || []).forEach((a: any) => { counts[a.room_id] = (counts[a.room_id] || 0) + 1; });
    (reqs || []).forEach((a: any) => { pend[a.room_id] = (pend[a.room_id] || 0) + 1; });
    return json({ ok: true, rooms: (rooms || []).map((r: any) => ({ ...r, company_name: r.company?.name || null, company: undefined, members: counts[r.id] || 0, pending_requests: pend[r.id] || 0 })), me: { role: me.role, company_id: me.company_id || null } });
  }

  if (action === "save_room") {
    const r = body.room || {};
    const companyId = me.role === "super" ? (String(r.company_id || "") || me.company_id || null) : me.company_id;
    if (!companyId) return json({ error: "company-required" }, 400);
    const name = String(r.name || "").trim().slice(0, 200);
    if (!name) return json({ error: "name-required" }, 400);
    const row: Record<string, unknown> = {
      name, description: String(r.description || "").trim().slice(0, 2000) || null, seller: String(r.seller || "").trim().slice(0, 200) || null,
      project_type: String(r.project_type || "ma").slice(0, 20), status: ["open", "closed"].includes(r.status) ? r.status : "open",
      nextcloud_folder: String(r.nextcloud_folder || "").trim().replace(/^\/+|\/+$/g, "").slice(0, 500) || null,
      default_expiry_days: Math.max(1, Math.min(3650, Number(r.default_expiry_days) || 90)), downloads_allowed: r.downloads_allowed !== false,
      qes_nda_required: r.qes_nda_required !== false, company_id: companyId, updated_at: new Date().toISOString(),
    };
    if (r.annex_text !== undefined) row.annex_text = String(r.annex_text || "").slice(0, 60000) || null;
    let id = String(r.id || "");
    if (id) {
      const { data: ex } = await admin.from("clv_rooms").select("company_id").eq("id", id).maybeSingle();
      if (!ex || !inScope(me, ex.company_id)) return json({ error: "forbidden" }, 403);
    }
    // NDA PDF: uploaded by the company admin, stored under <room folder>/_nda/ on Nextcloud.
    if (body.nda_pdf_base64) {
      if (!(await ncConfigured())) return json({ error: "storage-not-configured" }, 503);
      let bytes: Uint8Array;
      try { bytes = Uint8Array.from(atob(String(body.nda_pdf_base64)), (ch) => ch.charCodeAt(0)); } catch { return json({ error: "bad-file" }, 400); }
      if (bytes.length < 100 || bytes.length > 12 * 1024 * 1024 || String.fromCharCode(...bytes.slice(0, 5)) !== "%PDF-") return json({ error: "pdf-only" }, 400);
      const folder = (row.nextcloud_folder as string) || `Documents/Clavoris/Data Rooms/${slugify(name)}`;
      row.nextcloud_folder = folder;
      const version = "v" + new Date().toISOString().slice(0, 10).replace(/-/g, "") + "-" + (await sha256Hex(bytes)).slice(0, 6);
      const path = `${folder}/_nda/NDA_${version}.pdf`;
      try { await ncMkdirP(`${folder}/_nda`); await ncPut(path, bytes, "application/pdf"); } catch (e) { return json({ error: "storage-failed", detail: (e as Error).message }, 502); }
      row.nda_pdf_path = path; row.nda_pdf_name = String(body.nda_pdf_name || "NDA.pdf").replace(/[^\w.() -]/g, "_").slice(0, 120); row.nda_pdf_sha256 = await sha256Hex(bytes); row.annex_version = version; row.qes_nda_required = true;
    }
    if (!id) {
      let slug = slugify(name);
      const { data: taken } = await admin.from("clv_rooms").select("id").eq("slug", slug).maybeSingle();
      if (taken) slug += "-" + crypto.randomUUID().slice(0, 4);
      const res = await admin.from("clv_rooms").insert({ ...row, slug, created_by: me.id, annex_version: (row.annex_version as string) || "v1" }).select("id").single();
      if (res.error) return json({ error: res.error.message }, 400);
      id = res.data.id;
    } else {
      const { error } = await admin.from("clv_rooms").update(row).eq("id", id);
      if (error) return json({ error: error.message }, 400);
    }
    await audit(admin, me, r.id ? "room-updated" : "room-created", name, { id, nda_pdf: !!body.nda_pdf_base64 });
    return json({ ok: true, id });
  }

  if (action === "decide_extension") {
    const { data: rq } = await admin.from("clv_access_requests").select("id, room_id, user_id, requested_until, status").eq("id", String(body.request_id || "")).maybeSingle();
    if (!rq) return json({ error: "not-found" }, 404);
    if (rq.status !== "pending") return json({ error: "already-decided" }, 400);
    const { data: room } = await admin.from("clv_rooms").select("id, slug, name, company_id").eq("id", rq.room_id).maybeSingle();
    if (!room || !inScope(me, room.company_id)) return json({ error: "forbidden" }, 403);
    const accept = body.accept === true;
    const until = accept ? (isDate(body.until) ? String(body.until) : String(rq.requested_until)) : null;
    const note = String(body.note || "").trim().slice(0, 1000);
    await admin.from("clv_access_requests").update({ status: accept ? "accepted" : "rejected", decided_by: me.id, decided_at: new Date().toISOString(), decision_note: note || null }).eq("id", rq.id);
    const { data: a } = await admin.from("clv_room_assignments").select("id, expires_at").eq("room_id", rq.room_id).eq("user_id", rq.user_id).maybeSingle();
    if (accept && a) await admin.from("clv_room_assignments").update({ expires_at: endOfDay(until!), reminded_7d_at: null, reminded_24h_at: null, revoked_at: null, revoked_by: null }).eq("id", a.id);
    const { data: u } = await admin.from("clv_profiles").select("email, full_name, lang").eq("id", rq.user_id).maybeSingle();
    const cname = await companyName(room.company_id);
    if (u) {
      const L = pickLang(u.lang);
      const m = mail(L, accept ? "ext_accepted" : "ext_rejected", { name: u.full_name, room: room.name, company: cname, owner: cname, date: fmtDay(accept ? endOfDay(until!) : a?.expires_at, L), note: note ? word(L, "note_line", { company: cname, owner: cname, note }) : "", link: `${APP_URL}/room.html?id=${room.id}` });
      await sendMail(u.email, m.subject, m.text, L).catch((e) => console.error("ext decision mail:", (e as Error).message));
    }
    await audit(admin, me, accept ? "access-extended" : "access-extension-rejected", rq.user_id, { room: room.slug, until, note });
    return json({ ok: true, accepted: accept, expires_at: accept ? endOfDay(until!) : a?.expires_at || null });
  }

  const roomId = String(body.room_id || "");
  if (!roomId) return json({ error: "room-required" }, 400);
  const { data: room } = await admin.from("clv_rooms").select("id, slug, name, default_expiry_days, company_id").eq("id", roomId).maybeSingle();
  if (!room || !inScope(me, room.company_id)) return json({ error: "not-found" }, 404);
  const cname = await companyName(room.company_id);

  if (action === "members") {
    // Every assignment, including revoked ones (tagged, with the option to reactivate), with the
    // full onboarding status: activated (first sign-in), KYC, NDA, access end date, last access,
    // last reminder and any pending extension request.
    const { data: rows } = await admin.from("clv_room_assignments").select("id, user_id, can_download, expires_at, granted_at, revoked_at, answers_questions, profile:clv_profiles!clv_room_assignments_user_id_fkey(email, full_name, company, status, last_login_at, lang)").eq("room_id", roomId).order("granted_at", { ascending: false });
    const ids = (rows || []).map((r: any) => r.user_id);
    const { data: signed } = ids.length ? await admin.from("clv_signed_documents").select("user_id, signed_at").eq("room_id", roomId).eq("doc_type", "nda").in("user_id", ids) : { data: [] as any[] };
    const { data: last } = ids.length ? await admin.from("clv_access_log").select("user_id, ts, action").eq("room_id", roomId).in("user_id", ids).order("ts", { ascending: false }).limit(500) : { data: [] as any[] };
    const { data: rem } = ids.length ? await admin.from("clv_audit").select("target, created_at, detail").eq("event_type", "room-reminder-sent").in("target", ids).order("created_at", { ascending: false }).limit(500) : { data: [] as any[] };
    const { data: reqs } = ids.length ? await admin.from("clv_access_requests").select("id, user_id, requested_until, message, status, created_at, decided_at, decision_note").eq("room_id", roomId).in("user_id", ids).order("created_at", { ascending: false }) : { data: [] as any[] };
    const signedAt: Record<string, string> = {}; (signed || []).forEach((s: any) => { signedAt[s.user_id] = s.signed_at; });
    const lastAt: Record<string, string> = {}; (last || []).forEach((l: any) => { if (!lastAt[l.user_id]) lastAt[l.user_id] = l.ts; });
    const remAt: Record<string, { ts: string; step: string }> = {}; (rem || []).forEach((r: any) => { if (!remAt[r.target] && r.detail?.room === room.slug) remAt[r.target] = { ts: r.created_at, step: r.detail?.step || "" }; });
    const pending: Record<string, any> = {}, lastReq: Record<string, any> = {};
    (reqs || []).forEach((r: any) => { if (r.status === "pending" && !pending[r.user_id]) pending[r.user_id] = r; if (!lastReq[r.user_id]) lastReq[r.user_id] = r; });
    return json({ ok: true, members: (rows || []).map((r: any) => {
      const st = r.profile?.status || "registered";
      const verified = st === "verified", nda = !!signedAt[r.user_id];
      // Activated = has signed in. Verified KYC or a signed NDA prove a sign-in even when last_login_at
      // was never stamped (sign-ins before the stamp existed, or a 2FA step left unfinished).
      const activated = !!r.profile?.last_login_at || verified || nda;
      const next = r.revoked_at ? null : !activated ? "signup" : !verified ? "kyc" : !nda ? "nda" : null;
      return { user_id: r.user_id, email: r.profile?.email, name: r.profile?.full_name, company: r.profile?.company, status: st, lang: r.profile?.lang, activated, last_login_at: r.profile?.last_login_at || null, can_download: r.can_download, answers_questions: !!r.answers_questions, expires_at: r.expires_at, granted_at: r.granted_at, revoked_at: r.revoked_at, nda_signed_at: signedAt[r.user_id] || null, last_access: lastAt[r.user_id] || null, next_step: next, reminded: remAt[r.user_id] || null, pending_request: pending[r.user_id] || null, last_request: lastReq[r.user_id] || null };
    }) });
  }

  if (action === "set_expiry") {
    const userId = String(body.user_id || "");
    const until = body.expires_at ? (isDate(body.expires_at) ? endOfDay(String(body.expires_at)) : null) : null;
    if (body.expires_at && !until) return json({ error: "bad-date" }, 400);
    const { error } = await admin.from("clv_room_assignments").update({ expires_at: until, reminded_7d_at: null, reminded_24h_at: null }).eq("room_id", roomId).eq("user_id", userId);
    if (error) return json({ error: error.message }, 400);
    await audit(admin, me, "room-expiry-changed", userId, { room: room.slug, until });
    return json({ ok: true, expires_at: until });
  }

  if (action === "remind") {
    const userId = String(body.user_id || "");
    const { data: a } = await admin.from("clv_room_assignments").select("id, revoked_at, expires_at, profile:clv_profiles!clv_room_assignments_user_id_fkey(email, full_name, status, last_login_at, lang)").eq("room_id", roomId).eq("user_id", userId).maybeSingle();
    const prof = (a as any)?.profile;
    if (!a || !prof) return json({ error: "not-member" }, 404);
    if (a.revoked_at) return json({ error: "revoked" }, 400);
    const { data: nda } = await admin.from("clv_signed_documents").select("id").eq("room_id", roomId).eq("user_id", userId).eq("doc_type", "nda").maybeSingle();
    const step = !prof.last_login_at && prof.status !== "verified" && !nda ? "signup" : prof.status !== "verified" ? "kyc" : !nda ? "nda" : null;
    if (!step) return json({ ok: true, step: null });
    const L = pickLang(prof.lang);
    let link = `${APP_URL}/room.html?id=${roomId}`;
    if (step === "signup") {
      const { data: l } = await admin.auth.admin.generateLink({ type: "recovery", email: prof.email, options: { redirectTo: APP_URL + "/reset.html" } });
      link = l?.properties?.hashed_token ? `${APP_URL}/reset.html?token_hash=${encodeURIComponent(l.properties.hashed_token)}&type=recovery&welcome=1&lang=${L}&room=${encodeURIComponent(room.name)}&by=${encodeURIComponent(cname)}` : `${APP_URL}/login.html?lang=${L}`;
    } else if (step === "kyc") link = `${APP_URL}/kyc.html?next=room.html%3Fid%3D${roomId}`;
    const m = mail(L, "remind_" + step, { name: prof.full_name, room: room.name, owner: cname, link });
    let mailed = false;
    try { mailed = await sendMail(prof.email, m.subject, m.text, L, step === "signup" ? { url: link, label: ctaLabel(L, "activate") } : undefined); } catch (e) { console.error("clv-admin-rooms remind mail:", (e as Error).message); }
    await audit(admin, me, "room-reminder-sent", userId, { room: room.slug, step, mailed });
    return json({ ok: true, step, mailed });
  }

  if (action === "reactivate") {
    const userId = String(body.user_id || "");
    const expires = isDate(body.expires_at) ? endOfDay(String(body.expires_at)) : room.default_expiry_days ? new Date(Date.now() + room.default_expiry_days * 86400000).toISOString() : null;
    const { data: a, error } = await admin.from("clv_room_assignments").update({ revoked_at: null, revoked_by: null, expires_at: expires, reminded_7d_at: null, reminded_24h_at: null, granted_by: me.id, granted_at: new Date().toISOString() }).eq("room_id", roomId).eq("user_id", userId).not("revoked_at", "is", null).select("id").maybeSingle();
    if (error) return json({ error: error.message }, 400);
    if (!a) return json({ error: "not-revoked" }, 400);
    await audit(admin, me, "room-access-reactivated", userId, { room: room.slug });
    const { data: prof } = await admin.from("clv_profiles").select("email, full_name, lang").eq("id", userId).maybeSingle();
    if (prof) { const L = pickLang(prof.lang); const open = `${APP_URL}/room.html?id=${room.id}&lang=${L}`; const m = mail(L, "room_invite_existing", { name: prof.full_name, room: room.name, company: cname, owner: cname, until: expires ? word(L, "until_line", { date: fmtDay(expires, L) }) : "", link: open }); await sendMail(prof.email, m.subject, m.text, L, { url: open, label: OPEN_CTA[L] }).catch(() => false); }
    return json({ ok: true, expires_at: expires });
  }

  if (action === "set_answerer") {
    const userId = String(body.user_id || "");
    const on = body.on === true;
    const { data: a, error } = await admin.from("clv_room_assignments").update({ answers_questions: on }).eq("room_id", roomId).eq("user_id", userId).select("id").maybeSingle();
    if (error) return json({ error: error.message }, 400);
    if (!a) return json({ error: "not-member" }, 404);
    await audit(admin, me, on ? "room-answerer-added" : "room-answerer-removed", userId, { room: room.slug });
    return json({ ok: true, answers_questions: on });
  }

  if (action === "revoke") {
    const userId = String(body.user_id || "");
    const { error } = await admin.from("clv_room_assignments").update({ revoked_at: new Date().toISOString(), revoked_by: me.id }).eq("room_id", roomId).eq("user_id", userId).is("revoked_at", null);
    if (error) return json({ error: error.message }, 400);
    await audit(admin, me, "room-access-revoked", userId, { room: room.slug });
    return json({ ok: true });
  }

  if (action === "invite") {
    const email = String(body.email || "").trim().toLowerCase().slice(0, 200);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: "email-invalid" }, 400);
    // Optional addressing: Mr / Mrs, first and last name. When given, every mail to this person opens
    // with "Dear Mr <last name>," (sendMail reads the profile).
    const salutation = ["mr", "mrs"].includes(String(body.salutation || "")) ? String(body.salutation) : null;
    const nm = (v: unknown) => String(v || "").replace(/\s+/g, " ").trim().slice(0, 80);
    const first = nm(body.first_name), last = nm(body.last_name);
    const name = [first, last].filter(Boolean).join(" ") || String(body.name || "").trim().slice(0, 120);
    const company = String(body.company || "").trim().slice(0, 160) || null;
    const lang = pickLang(body.lang);
    if (body.expires_at && !isDate(body.expires_at)) return json({ error: "bad-date" }, 400);

    // 1. Enrol the user if needed (shared directory: an existing Minerva user keeps their passphrase).
    let { data: prof } = await admin.from("clv_profiles").select("id, email, full_name, status, lang, salutation, first_name, last_name").eq("email", email).maybeSingle();
    let created = false, linked = false, link = `${APP_URL}/login.html`;
    if (!prof) {
      const en = await enrolUser(admin, email, name, company, lang, "user", { salutation, first_name: first || null, last_name: last || null });
      if ("error" in en) return json({ error: en.error }, 400);
      prof = { id: en.id, email, full_name: name, status: "registered", lang, salutation, first_name: first || null, last_name: last || null };
      created = en.created; linked = en.linked; link = en.link;
      await audit(admin, me, "user-created", email, { via: "room-invite", room: room.slug, linked });
    } else if (prof.status === "suspended" || prof.status === "rejected") return json({ error: "user-blocked" }, 400);
    else {
      // Existing account: fill in only what is still empty; what the person entered themselves stays.
      const patch: Record<string, string> = {};
      if (salutation && !prof.salutation) patch.salutation = salutation;
      if (first && !prof.first_name) patch.first_name = first;
      if (last && !prof.last_name) patch.last_name = last;
      if (name && !String(prof.full_name || "").trim()) patch.full_name = name;
      if (Object.keys(patch).length) { await admin.from("clv_profiles").update(patch).eq("id", prof.id); prof = { ...prof, ...patch }; }
    }

    // 2. Assign (re-activate if previously revoked). End date: as chosen, else the room default.
    const expires = isDate(body.expires_at) ? endOfDay(String(body.expires_at)) : room.default_expiry_days ? new Date(Date.now() + room.default_expiry_days * 86400000).toISOString() : null;
    const { data: existing } = await admin.from("clv_room_assignments").select("id, revoked_at").eq("room_id", roomId).eq("user_id", prof.id).maybeSingle();
    if (existing) await admin.from("clv_room_assignments").update({ revoked_at: null, revoked_by: null, expires_at: expires, reminded_7d_at: null, reminded_24h_at: null, granted_by: me.id, granted_at: new Date().toISOString() }).eq("id", existing.id);
    else await admin.from("clv_room_assignments").insert({ room_id: roomId, user_id: prof.id, can_download: true, expires_at: expires, granted_by: me.id });
    await audit(admin, me, "room-access-granted", email, { room: room.slug, created, expires });

    // 3. Invitation mail from the Clavoris sender, in the recipient's language, naming the inviting
    //    company and the access end date; the activation link carries both for the sign-up page.
    const L = pickLang(prof.lang || lang);
    const ctx = `&room=${encodeURIComponent(room.name)}&by=${encodeURIComponent(cname)}`;
    const login = `${APP_URL}/login.html?lang=${L}`;
    const openRoom = `${APP_URL}/room.html?id=${room.id}&lang=${L}`;
    const until = expires ? word(L, "until_line", { date: fmtDay(expires, L) }) : "";
    const m = created ? mail(L, "room_invite_new", { name, room: room.name, company: cname, owner: cname, until, link: withLang(link, L) + ctx })
      : linked ? mail(L, "room_invite_linked", { name, room: room.name, company: cname, owner: cname, until, login, link: withLang(link, L) + ctx })
      : mail(L, "room_invite_existing", { name: prof.full_name, room: room.name, company: cname, owner: cname, until, link: openRoom });
    let mailed = false;
    // New account: activation button. Existing account: a button straight into the room (sign-in first if needed).
    const cta = (created || linked) ? { url: withLang(link, L) + ctx, label: ctaLabel(L, "activate") } : { url: openRoom, label: OPEN_CTA[L] };
    try { mailed = await sendMail(email, m.subject, m.text, L, cta); } catch (e) { console.error("clv-admin-rooms invite mail:", (e as Error).message); }
    return json({ ok: true, user_id: prof.id, created, linked, mailed, expires_at: expires });
  }

  return json({ error: "bad-action" }, 400);
});
