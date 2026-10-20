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
//   { action: "directory", room_id, q?, from_room? }    -> people to invite (search; super: all, company admin: its rooms' members)
//   { action: "set_expiry", room_id, user_id, expires_at } -> change the access end date
//   { action: "decide_extension", request_id, accept, until?, note? } -> accept / reject an extension request (mails the user)
//   { action: "revoke" | "reactivate" | "remind", room_id, user_id }
//   { action: "set_answerer", room_id, user_id, on }      -> tag a member as answering the room's Q&A questions
//   { action: "add_self", room_id }                      -> add the calling staff member to the room's member list (company team)
//   { action: "team", company_id }                       -> staff of a company account, with the plan's staff seats
//   { action: "team_invite", company_id, email, lang?, salutation?, first_name?, last_name? } -> add a staff member (mail)
//   { action: "team_remove", company_id, user_id }       -> remove a staff member from the team (becomes an ordinary user)
//   { action: "team_resend", company_id, user_id }       -> send the team invitation again
// Deploy: supabase functions deploy clv-admin-rooms --no-verify-jwt
import { adminClient, APP_URL, audit, companyScope, cors, enrolUser, fmtDay, inScope, json, requireAdmin, sendMail, ctaLabel } from "../_shared/clv.ts";
import { activationLink, isActivated } from "../_shared/activation.ts";
import { existingSteps, mail, OPEN_CTA, pickLang, word } from "../_shared/room-mail.ts";
import { ncConfigured, ncMkdirP, ncPut, sha256Hex } from "../_shared/nc.ts";
import { limitOf, overLimit, planOf } from "../_shared/plans.ts";
import { TEAM_CTA, teamMail } from "../_shared/team-mail.ts";
const withLang = (u: string, l: string) => u + (u.includes("?") ? "&" : "?") + "lang=" + l;
const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "room";
const isDate = (s: unknown) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ""));
// An access end date is stored as the end of that day (UTC) so the countdown reads naturally.
const endOfDay = (d: string) => new Date(d + "T23:59:59Z").toISOString();

// An account already in use is sent to the sign-in page, which then opens the room.
const signInTo = (roomId: string, L: string) => `${APP_URL}/login.html?lang=${L}&next=${encodeURIComponent("room.html?id=" + roomId)}`;

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

  /* ---------------- company team (staff of a company account) ---------------- */
  // A company admin manages the team of their own company; a Clavoris super admin the team of any company.
  // Staff of a company see and manage only that company's data rooms, contracts and products.
  if (action === "team" || action === "team_invite" || action === "team_remove" || action === "team_resend") {
    const companyId = String(body.company_id || "");
    if (!companyId || !inScope(me, companyId)) return json({ error: "forbidden" }, 403);
    const { data: comp } = await admin.from("clv_companies").select("id, name").eq("id", companyId).maybeSingle();
    if (!comp) return json({ error: "not-found" }, 404);
    const staffSel = "id, email, full_name, first_name, last_name, salutation, job_title, lang, role, status, last_login_at, created_at";
    // Untyped client for the team queries (their select lists are composed at run time).
    const db: any = admin;
    const seats = async () => {
      const { plan } = await planOf(admin, companyId);
      const { count } = await db.from("clv_profiles").select("id", { count: "exact", head: true }).eq("company_id", companyId).is("deleted_at", null);
      return { plan: plan.code, limit: limitOf(plan, "users"), used: count || 0 };
    };
    const { data: meP } = await db.from("clv_profiles").select("full_name").eq("id", me.id).maybeSingle();
    const byName = String(meP?.full_name || "").trim() || me.email;
    const sendTeamMail = async (p: any, activateLink: string | null) => {
      const L = pickLang(p.lang);
      const name = String(p.full_name || "").trim() || [p.first_name, p.last_name].filter(Boolean).join(" ") || p.email;
      const link = activateLink ? withLang(activateLink, L) : `${APP_URL}/login.html?lang=${L}&next=${encodeURIComponent("admin.html")}`;
      const m = teamMail(L, activateLink ? "team_new" : "team_existing", { name, by: byName, company: comp.name, link });
      try { return await sendMail(p.email, m.subject, m.text, L, { url: link, label: activateLink ? TEAM_CTA[L].activate : TEAM_CTA[L].open }); } catch (e) { console.error("team mail:", (e as Error).message); return false; }
    };

    if (action === "team") {
      const { data: people } = await db.from("clv_profiles").select(staffSel).eq("company_id", companyId).in("role", ["admin", "super"]).is("deleted_at", null).order("full_name", { ascending: true, nullsFirst: false });
      const team = [];
      for (const p of people || []) team.push({ id: p.id, email: p.email, name: String(p.full_name || "").trim() || [p.first_name, p.last_name].filter(Boolean).join(" "), job_title: p.job_title || "", role: p.role, status: p.status, last_login_at: p.last_login_at, created_at: p.created_at, self: p.id === me.id, activated: await isActivated(admin, p.id, p.last_login_at, p.status) });
      return json({ ok: true, company: { id: comp.id, name: comp.name }, team, seats: await seats(), can_manage: true });
    }

    if (action === "team_invite") {
      const email = String(body.email || "").trim().toLowerCase().slice(0, 200);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: "email-invalid" }, 400);
      const salutation = ["mr", "mrs"].includes(String(body.salutation || "")) ? String(body.salutation) : null;
      const nm = (v: unknown) => String(v || "").replace(/\s+/g, " ").trim().slice(0, 80);
      const first = nm(body.first_name), last = nm(body.last_name), name = [first, last].filter(Boolean).join(" ");
      const lang = pickLang(body.lang);
      let { data: prof } = await db.from("clv_profiles").select(staffSel + ", company_id").eq("email", email).maybeSingle();
      if (prof && prof.role === "super") return json({ error: "is-clavoris-staff" }, 400);
      if (prof && prof.role === "admin" && prof.company_id === companyId) return json({ error: "already-in-team" }, 400);
      if (prof && prof.role === "admin" && prof.company_id) return json({ error: "staff-of-other-company" }, 400);
      if (prof && (prof.status === "suspended" || prof.status === "rejected")) return json({ error: "user-blocked" }, 400);
      // Staff seats of the company's plan (Clavoris super admins are not limited).
      if (me.role !== "super") { const over = await overLimit(admin, companyId, "users"); if (over) return json(over, 403); }
      let activate: string | null = null, created = false;
      if (!prof) {
        const en = await enrolUser(admin, email, name, comp.name, lang, "admin", { salutation, first_name: first || null, last_name: last || null });
        if ("error" in en) return json({ error: en.error }, 400);
        await db.from("clv_profiles").update({ company_id: companyId }).eq("id", en.id);
        const { data: p2 } = await db.from("clv_profiles").select(staffSel + ", company_id").eq("id", en.id).maybeSingle();
        prof = p2; created = en.created;
        if (!(await isActivated(admin, en.id, null, "registered"))) activate = en.link;
      } else {
        const patch: Record<string, unknown> = { role: "admin", company_id: companyId };
        if (salutation && !prof.salutation) patch.salutation = salutation;
        if (first && !prof.first_name) patch.first_name = first;
        if (last && !prof.last_name) patch.last_name = last;
        if (name && !String(prof.full_name || "").trim()) patch.full_name = name;
        await db.from("clv_profiles").update(patch).eq("id", prof.id);
        prof = { ...prof, ...patch };
        if (!(await isActivated(admin, prof.id, prof.last_login_at, prof.status))) activate = await activationLink(admin, prof.email);
      }
      await audit(admin, me, "team-member-added", email, { company: comp.name, created });
      const mailed = await sendTeamMail(prof, activate);
      return json({ ok: true, user_id: prof.id, created, activation: !!activate, mailed, seats: await seats() });
    }

    const userId = String(body.user_id || "");
    const { data: member } = await db.from("clv_profiles").select(staffSel + ", company_id").eq("id", userId).maybeSingle();
    if (!member || member.company_id !== companyId || member.role !== "admin") return json({ error: "not-in-team" }, 404);

    if (action === "team_remove") {
      if (member.id === me.id) return json({ error: "self" }, 400);
      // The person keeps their account, their room memberships and their signed documents, as an ordinary user.
      await db.from("clv_profiles").update({ role: "user", company_id: null }).eq("id", member.id);
      await audit(admin, me, "team-member-removed", member.email, { company: comp.name });
      return json({ ok: true, seats: await seats() });
    }

    // team_resend
    const act = (await isActivated(admin, member.id, member.last_login_at, member.status)) ? null : await activationLink(admin, member.email);
    const mailed = await sendTeamMail(member, act);
    await audit(admin, me, "team-invitation-resent", member.email, { company: comp.name, activation: !!act });
    return json({ ok: true, mailed, activation: !!act });
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
    // A new data room: the company account's plan sets how many rooms it may have (super admins are not limited).
    if (!id && me.role !== "super") { const over = await overLimit(admin, companyId, "data_rooms"); if (over) return json(over, 403); }
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
  const { data: room } = await admin.from("clv_rooms").select("id, slug, name, default_expiry_days, company_id, qes_nda_required").eq("id", roomId).maybeSingle();
  if (!room || !inScope(me, room.company_id)) return json({ error: "not-found" }, 404);
  const cname = await companyName(room.company_id);

  if (action === "directory") {
    // People who can be invited to this room without typing their address: name, organisation and status.
    // A super admin sees every active account; a company admin only people who are or were members of its
    // own company's rooms (never another company's investors). Suspended and rejected accounts are left out.
    const term = String(body.q || "").replace(/[",()%*\\]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
    const fromRoom = String(body.from_room || "");
    let ownRooms: { id: string; name: string }[] = [];
    { let rq = admin.from("clv_rooms").select("id, name, company_id").order("created_at", { ascending: false }); if (scope) rq = rq.eq("company_id", scope); const { data } = await rq; ownRooms = (data || []).map((r: any) => ({ id: r.id, name: r.name })); }
    let ids: string[] | null = null;
    if (me.role !== "super") {
      const rIds = ownRooms.map((r) => r.id);
      const { data: asg } = rIds.length ? await admin.from("clv_room_assignments").select("user_id").in("room_id", rIds) : { data: [] as any[] };
      ids = [...new Set((asg || []).map((a: any) => a.user_id as string))];
    }
    if (fromRoom) {
      if (!ownRooms.some((r) => r.id === fromRoom)) return json({ error: "not-found" }, 404);
      const { data: asg } = await admin.from("clv_room_assignments").select("user_id").eq("room_id", fromRoom);
      const inRoom = new Set((asg || []).map((a: any) => a.user_id as string));
      ids = (ids ?? [...inRoom]).filter((id) => inRoom.has(id));
    }
    const rooms = ownRooms.filter((r) => r.id !== roomId);
    if (ids && !ids.length) return json({ ok: true, users: [], rooms });
    let pq = admin.from("clv_profiles").select("id, email, full_name, salutation, first_name, last_name, company, job_title, lang, role, status, last_login_at").not("status", "in", "(suspended,rejected)").order("full_name", { ascending: true, nullsFirst: false }).limit(term ? 12 : 200);
    if (ids) pq = pq.in("id", ids.slice(0, 1000));
    if (term) pq = pq.or(["email", "full_name", "first_name", "last_name", "company"].map((c) => `${c}.ilike."%${term}%"`).join(","));
    const { data: people, error } = await pq;
    if (error) return json({ error: error.message }, 400);
    const pIds = (people || []).map((p: any) => p.id);
    const { data: here } = pIds.length ? await admin.from("clv_room_assignments").select("user_id").eq("room_id", roomId).is("revoked_at", null).in("user_id", pIds) : { data: [] as any[] };
    const { data: ndas } = pIds.length ? await admin.from("clv_signed_documents").select("user_id").eq("doc_type", "nda").in("user_id", pIds) : { data: [] as any[] };
    const member = new Set((here || []).map((h: any) => h.user_id)), signedAny = new Set((ndas || []).map((n: any) => n.user_id));
    const name = (p: any) => String(p.full_name || "").trim() || [p.first_name, p.last_name].filter(Boolean).join(" ");
    return json({ ok: true, rooms, users: (people || []).map((p: any) => ({
      id: p.id, email: p.email, name: name(p), salutation: p.salutation || "", first_name: p.first_name || "", last_name: p.last_name || "",
      company: p.company || "", job_title: p.job_title || "", lang: p.lang || "en", staff: p.role === "admin" || p.role === "super",
      verified: p.status === "verified", activated: !!p.last_login_at || p.status === "verified" || signedAny.has(p.id),
      last_login_at: p.last_login_at || null, member: member.has(p.id),
    })) });
  }

  if (action === "add_self") {
    // The calling staff member joins the room's member list as part of the company team: no invitation mail,
    // no access end date, no NDA of their own.
    const { data: ex } = await admin.from("clv_room_assignments").select("id").eq("room_id", roomId).eq("user_id", me.id).maybeSingle();
    if (ex) await admin.from("clv_room_assignments").update({ revoked_at: null, revoked_by: null, expires_at: null, granted_by: me.id, granted_at: new Date().toISOString() }).eq("id", ex.id);
    else await admin.from("clv_room_assignments").insert({ room_id: roomId, user_id: me.id, can_download: true, expires_at: null, granted_by: me.id });
    await audit(admin, me, "room-team-joined", me.email, { room: room.slug });
    return json({ ok: true });
  }

  if (action === "members") {
    // Every assignment, including revoked ones (tagged, with the option to reactivate), with the
    // full onboarding status: activated (first sign-in), KYC, NDA, access end date, last access,
    // last reminder and any pending extension request.
    const { data: rows } = await admin.from("clv_room_assignments").select("id, user_id, can_download, expires_at, granted_at, revoked_at, answers_questions, profile:clv_profiles!clv_room_assignments_user_id_fkey(email, full_name, company, status, last_login_at, lang, role, company_id)").eq("room_id", roomId).order("granted_at", { ascending: false });
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
    // Activated = the account is in use (see isActivated): signed in, verified, an NDA signed in any room, or an
    // existing user of another platform of the group. Only the members not obviously active are looked up.
    const inUse: Record<string, boolean> = {};
    for (const r of rows || []) {
      const p = (r as any).profile;
      inUse[r.user_id] = !!p?.last_login_at || p?.status === "verified" || !!signedAt[r.user_id] || await isActivated(admin, r.user_id, p?.last_login_at || null, p?.status || null);
    }
    return json({ ok: true, members: (rows || []).map((r: any) => {
      const st = r.profile?.status || "registered";
      const verified = st === "verified", nda = !!signedAt[r.user_id];
      const activated = inUse[r.user_id];
      // Company team: staff of the company that runs the room (or a Clavoris super admin); no NDA, no reminders.
      const team = r.profile?.role === "super" || (r.profile?.role === "admin" && !!room.company_id && r.profile?.company_id === room.company_id);
      const next = r.revoked_at || team ? null : !activated ? "signup" : !verified ? "kyc" : !nda ? "nda" : null;
      return { team, user_id: r.user_id, email: r.profile?.email, name: r.profile?.full_name, company: r.profile?.company, status: st, lang: r.profile?.lang, activated, last_login_at: r.profile?.last_login_at || null, can_download: r.can_download, answers_questions: !!r.answers_questions, expires_at: r.expires_at, granted_at: r.granted_at, revoked_at: r.revoked_at, nda_signed_at: signedAt[r.user_id] || null, last_access: lastAt[r.user_id] || null, next_step: next, reminded: remAt[r.user_id] || null, pending_request: pending[r.user_id] || null, last_request: lastReq[r.user_id] || null };
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
    // An account already in use never gets an activation mail, only the sign-in page and the open step.
    const activated = !!nda || await isActivated(admin, userId, prof.last_login_at, prof.status);
    const step = !activated ? "signup" : prof.status !== "verified" ? "kyc" : !nda ? "nda" : null;
    if (!step) return json({ ok: true, step: null });
    const L = pickLang(prof.lang);
    let link = `${APP_URL}/room.html?id=${roomId}`;
    if (step === "signup") {
      const { data: l } = await admin.auth.admin.generateLink({ type: "recovery", email: prof.email, options: { redirectTo: APP_URL + "/reset.html" } });
      link = l?.properties?.hashed_token ? `${APP_URL}/reset.html?token_hash=${encodeURIComponent(l.properties.hashed_token)}&type=recovery&welcome=1&lang=${L}&room=${encodeURIComponent(room.name)}&by=${encodeURIComponent(cname)}` : `${APP_URL}/login.html?lang=${L}`;
    } else if (step === "kyc") link = `${APP_URL}/login.html?lang=${L}&next=${encodeURIComponent("kyc.html?next=room.html%3Fid%3D" + roomId)}`;
    else link = signInTo(roomId, L);
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
    const { data: prof } = await admin.from("clv_profiles").select("email, full_name, lang, last_login_at, status").eq("id", userId).maybeSingle();
    if (prof) {
      const L = pickLang(prof.lang), until = expires ? word(L, "until_line", { date: fmtDay(expires, L) }) : "";
      // Never signed in: a fresh activation link (an earlier one may have expired). Otherwise: the sign-in page.
      const act = (await isActivated(admin, userId, prof.last_login_at, prof.status)) ? null : await activationLink(admin, prof.email);
      if (act) {
        const url = withLang(act, L) + `&room=${encodeURIComponent(room.name)}&by=${encodeURIComponent(cname)}`;
        const m = mail(L, "room_invite_new", { name: prof.full_name, room: room.name, company: cname, owner: cname, until, link: url });
        await sendMail(prof.email, m.subject, m.text, L, { url, label: ctaLabel(L, "activate") }).catch(() => false);
      } else {
        const url = signInTo(room.id, L);
        const { data: nda } = await admin.from("clv_signed_documents").select("id").eq("room_id", roomId).eq("user_id", userId).eq("doc_type", "nda").limit(1);
        const st = existingSteps(L, { verified: prof.status === "verified", ndaRequired: !!room.qes_nda_required, ndaSigned: !!(nda && nda.length) });
        const m = mail(L, "room_invite_existing", { name: prof.full_name, room: room.name, company: cname, owner: cname, until, link: url, steps: st.steps, kyc: st.kyc ? "1" : "" });
        await sendMail(prof.email, m.subject, m.text, L, { url, label: OPEN_CTA[L] }).catch(() => false);
      }
    }
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
    let { data: prof } = await admin.from("clv_profiles").select("id, email, full_name, status, lang, salutation, first_name, last_name, last_login_at, role, company_id").eq("email", email).maybeSingle();
    let created = false, linked = false, activate = false, link = `${APP_URL}/login.html`;
    // A member of the company team (staff of the company that runs the room): no access end date and no NDA.
    const team = !!prof && (prof.role === "super" || (prof.role === "admin" && !!room.company_id && prof.company_id === room.company_id));
    if (!prof) {
      const en = await enrolUser(admin, email, name, company, lang, "user", { salutation, first_name: first || null, last_name: last || null });
      if ("error" in en) return json({ error: en.error }, 400);
      prof = { id: en.id, email, full_name: name, status: "registered", lang, salutation, first_name: first || null, last_name: last || null, last_login_at: null, role: "user", company_id: null };
      created = en.created; linked = en.linked; link = en.link;
      await audit(admin, me, "user-created", email, { via: "room-invite", room: room.slug, linked });
      // Already a user of another platform of the group, who has signed in there: treated as an existing
      // user (signs in with the password they have), not sent an activation link.
      if (linked && await isActivated(admin, en.id, null, "registered")) linked = false;
    } else if (prof.status === "suspended" || prof.status === "rejected") return json({ error: "user-blocked" }, 400);
    else {
      // Existing account: fill in only what is still empty; what the person entered themselves stays.
      const patch: Record<string, string> = {};
      if (salutation && !prof.salutation) patch.salutation = salutation;
      if (first && !prof.first_name) patch.first_name = first;
      if (last && !prof.last_name) patch.last_name = last;
      if (name && !String(prof.full_name || "").trim()) patch.full_name = name;
      if (Object.keys(patch).length) { await admin.from("clv_profiles").update(patch).eq("id", prof.id); prof = { ...prof, ...patch }; }
      // Enrolled earlier but never signed in (no password chosen yet): send a fresh activation link, not the sign-in page.
      if (!(await isActivated(admin, prof.id, prof.last_login_at, prof.status))) {
        const act = await activationLink(admin, prof.email);
        if (act) { activate = true; link = act; }
      }
    }

    // 2. Assign (re-activate if previously revoked). End date: as chosen, else the room default; none for the team.
    const expires = team ? null : isDate(body.expires_at) ? endOfDay(String(body.expires_at)) : room.default_expiry_days ? new Date(Date.now() + room.default_expiry_days * 86400000).toISOString() : null;
    const { data: existing } = await admin.from("clv_room_assignments").select("id, revoked_at").eq("room_id", roomId).eq("user_id", prof.id).maybeSingle();
    if (existing) await admin.from("clv_room_assignments").update({ revoked_at: null, revoked_by: null, expires_at: expires, reminded_7d_at: null, reminded_24h_at: null, granted_by: me.id, granted_at: new Date().toISOString() }).eq("id", existing.id);
    else await admin.from("clv_room_assignments").insert({ room_id: roomId, user_id: prof.id, can_download: true, expires_at: expires, granted_by: me.id });
    await audit(admin, me, "room-access-granted", email, { room: room.slug, created, expires });

    // 3. Invitation mail from the Clavoris sender, in the recipient's language, naming the inviting
    //    company and the access end date; the activation link carries both for the sign-up page.
    const L = pickLang(prof.lang || lang);
    const ctx = `&room=${encodeURIComponent(room.name)}&by=${encodeURIComponent(cname)}`;
    const login = `${APP_URL}/login.html?lang=${L}`;
    const openRoom = signInTo(room.id, L);
    const until = expires ? word(L, "until_line", { date: fmtDay(expires, L) }) : "";
    // Existing account: no registration; the mail lists only what is still open for this room.
    let steps = { steps: "", kyc: false };
    if (!(created || linked || activate)) {
      const { data: nda } = await admin.from("clv_signed_documents").select("id").eq("room_id", roomId).eq("user_id", prof.id).eq("doc_type", "nda").limit(1);
      steps = existingSteps(L, { verified: prof.status === "verified", ndaRequired: !!room.qes_nda_required && !team, ndaSigned: !!(nda && nda.length) });
    }
    const m = created || activate ? mail(L, "room_invite_new", { name: prof.full_name || name, room: room.name, company: cname, owner: cname, until, link: withLang(link, L) + ctx })
      : linked ? mail(L, "room_invite_linked", { name, room: room.name, company: cname, owner: cname, until, login, link: withLang(link, L) + ctx })
      : mail(L, "room_invite_existing", { name: prof.full_name || name, room: room.name, company: cname, owner: cname, until, link: openRoom, steps: steps.steps, kyc: steps.kyc ? "1" : "" });
    let mailed = false;
    // Account never used: activation button (set the password). Account in use: the sign-in page, which opens the room.
    const cta = (created || linked || activate) ? { url: withLang(link, L) + ctx, label: ctaLabel(L, "activate") } : { url: openRoom, label: OPEN_CTA[L] };
    try { mailed = await sendMail(email, m.subject, m.text, L, cta); } catch (e) { console.error("clv-admin-rooms invite mail:", (e as Error).message); }
    return json({ ok: true, user_id: prof.id, team, created, linked, existing: !(created || linked || activate), activation: created || linked || activate, mailed, expires_at: expires });
  }

  return json({ error: "bad-action" }, 400);
});
