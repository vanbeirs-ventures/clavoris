// supabase/functions/clv-room/index.ts
// Data room view for an assigned user (or staff): room info, NDA status, members
// (name + organisation), and the folder/file tree from Nextcloud. Files are only
// listed once the NDA is signed (when the room requires one); downloads go through
// clv-room-file. Deploy: supabase functions deploy clv-room --no-verify-jwt
import { adminClient, APP_URL, audit, clientIp, cors, fmtDay, inScope, isStaff, json, requireUser, sendMail } from "../_shared/clv.ts";
import { EXT_CTA, mail, pickLang } from "../_shared/room-mail.ts";
import { ncConfigured, ncTree } from "../_shared/nc.ts";
import { roomAutoMails } from "../_shared/room-auto-mail.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method" }, 405);
  const admin = adminClient();
  const me = await requireUser(admin, req);
  if (me instanceof Response) return me;
  const body = await req.json().catch(() => ({}));
  const roomId = String(body.room_id || "");
  if (!roomId) return json({ error: "room-required" }, 400);
  const light = body.action === "members"; // heartbeat + members only, no folder tree

  const { data: room } = await admin.from("clv_rooms").select("id, slug, name, description, project_type, seller, nextcloud_folder, status, qes_nda_required, annex_version, downloads_allowed, company_id, nda_pdf_path, nda_pdf_name, company:clv_companies(name)").eq("id", roomId).maybeSingle();
  if (!room) return json({ error: "not-found" }, 404);
  const companyName = (room as any).company?.name || "Clavoris";
  // Staff rights (no NDA, every document, members unmasked) only in the rooms of the staff member's own company;
  // a Clavoris super admin has them everywhere. Staff of another company are ordinary members here.
  const staffHere = isStaff(me) && inScope(me, room.company_id);

  // Access: an active, unexpired assignment — or staff.
  let assignment: { can_download: boolean; expires_at: string | null; kyc_waived?: boolean; nda_waived?: boolean } | null = null;
  if (!staffHere) {
    const { data: a } = await admin.from("clv_room_assignments").select("can_download, expires_at, kyc_waived, nda_waived").eq("room_id", roomId).eq("user_id", me.id).is("revoked_at", null).maybeSingle();
    if (!a) return json({ error: "forbidden" }, 403);
    assignment = a;
  }
  // Identity verification switched off for this person in this room by the company running it ("KYC off"): the
  // NDA can be signed without a prior identity check (the signed copy says so).
  const kycWaived = !staffHere && !!assignment?.kyc_waived && me.status !== "verified";
  // After the end date the room stays visible (tree listed) but downloads are blocked by clv-room-file.
  const expired = !!assignment?.expires_at && new Date(assignment.expires_at!) < new Date();

  if (body.action === "extend_request") {
    // Member asks the company for a longer access; staff are mailed, the member gets a receipt.
    if (staffHere) return json({ error: "staff" }, 400);
    const until = String(body.until || "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(until) || new Date(until + "T00:00:00Z").getTime() < Date.now() - 86400000) return json({ error: "bad-date" }, 400);
    const message = String(body.message || "").trim().slice(0, 1000);
    const { data: open } = await admin.from("clv_access_requests").select("id").eq("room_id", roomId).eq("user_id", me.id).eq("status", "pending").maybeSingle();
    if (open) return json({ error: "already-pending" }, 400);
    const { data: created, error } = await admin.from("clv_access_requests").insert({ room_id: roomId, user_id: me.id, requested_until: until, message: message || null }).select("id").single();
    if (error) return json({ error: error.message }, 400);
    await audit(admin, { id: me.id, email: me.email, role: me.role }, "access-extension-requested", roomId, { until, message });
    const L = pickLang(me.lang);
    const rc = mail(L, "ext_received", { name: me.full_name, room: room.name, company: companyName, owner: companyName, date: fmtDay(until + "T12:00:00Z", L) });
    // Mails are awaited: the function instance may stop as soon as the response is returned.
    // The member's receipt is an automatic member mail (room-auto-mail.ts); the company team is always mailed.
    const sends: Promise<unknown>[] = (await roomAutoMails(admin)) ? [sendMail(me.email, rc.subject, rc.text, L).catch((e) => console.error("ext receipt mail:", (e as Error).message))] : [];
    const { data: staff } = await admin.from("clv_profiles").select("email, lang, role, company_id").in("role", ["admin", "super"]).neq("status", "suspended");
    for (const s of (staff || []).filter((s: any) => s.role === "super" || s.company_id === room.company_id)) {
      const sl = pickLang(s.lang);
      const base = `${APP_URL}/extension.html?id=${created.id}&lang=${sl}`;
      const accept = `${base}&d=accept`, reject = `${base}&d=reject`;
      const m = mail(sl, "ext_requested", { name: me.full_name || me.email, email: me.email, org: me.company || "—", room: room.name, date: fmtDay(until + "T12:00:00Z", sl), current: fmtDay(assignment?.expires_at, sl), message: message || "—", accept, reject });
      sends.push(sendMail(s.email, m.subject, m.text, sl, [{ url: accept, label: EXT_CTA[sl].accept }, { url: reject, label: EXT_CTA[sl].reject }]).catch((e) => console.error("ext request mail:", s.email, (e as Error).message)));
    }
    await Promise.all(sends);
    return json({ ok: true });
  }

  // NDA status for this user / room.
  const { data: nda } = await admin.from("clv_signed_documents").select("id, doc_version, signed_at, nextcloud_path").eq("room_id", roomId).eq("user_id", me.id).eq("doc_type", "nda").order("signed_at", { ascending: false }).limit(1).maybeSingle();
  const ndaRequired = !!room.qes_nda_required;
  const ndaSigned = !!nda;
  // "NDA off" (set by the company running the room for this person): the documents open without the NDA, after the
  // identity verification (unless "KYC off" is set too).
  const ndaWaived = !staffHere && !!assignment?.nda_waived && !ndaSigned;
  const identityOk = me.status === "verified" || staffHere || kycWaived;
  const gateOpen = !ndaRequired || ndaSigned || staffHere || (ndaWaived && identityOk);

  // Members: everyone with an active assignment, plus staff who manage the room.
  const { data: rows } = await admin.from("clv_room_assignments").select("user_id, granted_at, profile:clv_profiles!clv_room_assignments_user_id_fkey(email, full_name, salutation, first_name, last_name, company, job_title, status, member_private, role, company_id, account:clv_companies!clv_profiles_company_id_fkey(name))").eq("room_id", roomId).is("revoked_at", null);
  const memberIds = (rows || []).map((r: any) => r.user_id);
  const { data: signed } = memberIds.length ? await admin.from("clv_signed_documents").select("user_id").eq("room_id", roomId).eq("doc_type", "nda").in("user_id", memberIds) : { data: [] as any[] };
  const signedSet = new Set((signed || []).map((s: any) => s.user_id));
  // Presence: green = active in this room within the last 3 minutes (the page refreshes
  // every 90 s while open), orange = has been in the room before, red = never opened it.
  const { data: acts } = memberIds.length ? await admin.from("clv_access_log").select("user_id, ts").eq("room_id", roomId).in("user_id", memberIds).order("ts", { ascending: false }).limit(2000) : { data: [] as any[] };
  const lastSeen: Record<string, string> = {}; (acts || []).forEach((l: any) => { if (!lastSeen[l.user_id]) lastSeen[l.user_id] = l.ts; });
  const cutoff = Date.now() - 3 * 60 * 1000;
  const memberName = (p: any) => {
    const full = String(p?.full_name || "").trim();
    if (full) return full;
    return [p?.first_name, p?.last_name].map((x: any) => String(x || "").trim()).filter(Boolean).join(" ");
  };
  // Company team: staff of the company that runs the room (or a Clavoris super admin) who were added to the room.
  // They are listed by name with the company as organisation, apart from the investors, and sign no NDA.
  const isTeam = (p: any) => !!p && (p.role === "super" || (p.role === "admin" && !!room.company_id && p.company_id === room.company_id));
  const members = (rows || []).map((r: any) => {
    const seen = lastSeen[r.user_id] || null;
    if (isTeam(r.profile)) {
      return { name: memberName(r.profile) || r.profile?.email || "", company: companyName, job_title: r.profile?.job_title || "", private: false, team: true, self: r.user_id === me.id,
        member_id: "M-" + String(r.user_id).replace(/-/g, "").slice(0, 6).toUpperCase(), verified: r.profile?.status === "verified", nda_signed: false, since: r.granted_at, last_seen: seen,
        presence: seen ? (new Date(seen).getTime() > cutoff ? "online" : "returning") : "never" };
    }
    const presence = seen ? (new Date(seen).getTime() > cutoff ? "online" : "returning") : "never";
    return {
      // Name: the full name, else first + last name from the invitation; organisation: the stated company,
      // else the company account the member belongs to.
      // A member who chose private participation is shown to the other investors by member ID only
      // (no name, organisation or role); the company running the room and the member themself see it all.
      ...(r.profile?.member_private && !staffHere && r.user_id !== me.id
        ? { name: "", company: "", job_title: "", private: true }
        : { name: memberName(r.profile), company: r.profile?.company || r.profile?.account?.name || "", job_title: r.profile?.job_title || "", private: !!r.profile?.member_private }),
      self: r.user_id === me.id,
      // Stable member ID (same in every room), shown instead of the name when the member is private or
      // has not entered a name yet.
      member_id: "M-" + String(r.user_id).replace(/-/g, "").slice(0, 6).toUpperCase(),
      // No e-mail addresses in the member list, for anyone, staff included: a member is shown by name and
      // organisation, or by member ID when private or unnamed. Staff find addresses in the admin console.
      verified: r.profile?.status === "verified", nda_signed: signedSet.has(r.user_id), since: r.granted_at, last_seen: seen, presence,
    };
  }).sort((a: any, b: any) => Number(!a.team) - Number(!b.team) || Number(!a.name) - Number(!b.name) || (a.company || "").localeCompare(b.company || "") || a.name.localeCompare(b.name));

  // Folder tree (only once the gate is open). _users/ holds the signed NDAs and is never listed.
  let tree: any[] = [];
  let ncError: string | null = null;
  if (gateOpen) {
    if (light) { /* no tree */ }
    else if (!(await ncConfigured())) ncError = "storage-not-configured";
    else {
      try {
        const root = room.nextcloud_folder || "";
        // The room shows the folder structure of its Nextcloud folder as it is (up to 6 levels deep).
        const all = await ncTree(root, 6);
        // Data rooms deliver PDF, JPEG and PNG, watermarked with the recipient, the time and the download code
        // (images inside a watermarked PDF page), and Excel workbooks (.xlsx, .xls) as the original file, for
        // download only, with the same download code in the file name and the same download record. Other
        // file types placed in the folder are not listed (and not downloadable).
        tree = all.filter((e) => !/^_(users|nda)(\/|$)/.test(e.path.slice(root.length + 1)))
          .filter((e) => e.dir || /\.(pdf|jpe?g|png|xlsx|xls)$/i.test(e.name))
          .map((e) => ({ name: e.name, path: e.path.slice(root.length + 1), dir: e.dir, size: e.size, modified: e.modified, mime: e.mime }));
        // Drop folders left empty by the filter (no document anywhere below them).
        tree = tree.filter((e) => !e.dir || tree.some((f) => !f.dir && f.path.startsWith(e.path + "/")));
      } catch (e) { ncError = (e as Error).message; }
    }
    await admin.from("clv_access_log").insert({ user_id: me.id, room_id: roomId, file_path: null, action: "room-view", ip: clientIp(req), user_agent: req.headers.get("user-agent") || "" }).then(() => {}, () => {});
  }

  const { data: pendingReq } = staffHere ? { data: null } : await admin.from("clv_access_requests").select("id, requested_until, created_at").eq("room_id", roomId).eq("user_id", me.id).eq("status", "pending").maybeSingle();
  return json({
    ok: true,
    room: { id: room.id, slug: room.slug, name: room.name, description: room.description, project_type: room.project_type, seller: room.seller, status: room.status, nda_required: ndaRequired, nda_version: room.annex_version, downloads_allowed: !!room.downloads_allowed, company: companyName, nda_pdf: !!room.nda_pdf_path, nda_pdf_name: room.nda_pdf_name },
    me: { verified: me.status === "verified" || staffHere || kycWaived, kyc_waived: kycWaived, staff: staffHere, can_download: staffHere ? true : (!!assignment?.can_download && !expired), expires_at: assignment?.expires_at || null, expired, pending_request: pendingReq || null },
    nda: { required: ndaRequired, waived: ndaWaived, signed: ndaSigned, signed_at: nda?.signed_at || null, version: nda?.doc_version || null, has_file: !!nda?.nextcloud_path },
    members, tree, storage_error: ncError,
  });
});
