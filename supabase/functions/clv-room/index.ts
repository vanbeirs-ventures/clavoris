// supabase/functions/clv-room/index.ts
// Data room view for an assigned user (or staff): room info, NDA status, members
// (name + organisation), and the folder/file tree from Nextcloud. Files are only
// listed once the NDA is signed (when the room requires one); downloads go through
// clv-room-file. Deploy: supabase functions deploy clv-room --no-verify-jwt
import { adminClient, APP_URL, audit, clientIp, cors, fmtDay, isStaff, json, requireUser, sendMail } from "../_shared/clv.ts";
import { mail, pickLang } from "../_shared/mail-i18n.ts";
import { ncConfigured, ncTree } from "../_shared/nc.ts";

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

  // Access: an active, unexpired assignment — or staff.
  let assignment: { can_download: boolean; expires_at: string | null } | null = null;
  if (!isStaff(me)) {
    const { data: a } = await admin.from("clv_room_assignments").select("can_download, expires_at").eq("room_id", roomId).eq("user_id", me.id).is("revoked_at", null).maybeSingle();
    if (!a) return json({ error: "forbidden" }, 403);
    assignment = a;
  }
  // After the end date the room stays visible (tree listed) but downloads are blocked by clv-room-file.
  const expired = !!assignment?.expires_at && new Date(assignment.expires_at!) < new Date();

  if (body.action === "extend_request") {
    // Member asks the company for a longer access; staff are mailed, the member gets a receipt.
    if (isStaff(me)) return json({ error: "staff" }, 400);
    const until = String(body.until || "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(until) || new Date(until + "T00:00:00Z").getTime() < Date.now() - 86400000) return json({ error: "bad-date" }, 400);
    const message = String(body.message || "").trim().slice(0, 1000);
    const { data: open } = await admin.from("clv_access_requests").select("id").eq("room_id", roomId).eq("user_id", me.id).eq("status", "pending").maybeSingle();
    if (open) return json({ error: "already-pending" }, 400);
    const { error } = await admin.from("clv_access_requests").insert({ room_id: roomId, user_id: me.id, requested_until: until, message: message || null });
    if (error) return json({ error: error.message }, 400);
    await audit(admin, { id: me.id, email: me.email, role: me.role }, "access-extension-requested", roomId, { until, message });
    const L = pickLang(me.lang);
    const rc = mail(L, "ext_received", { name: me.full_name, room: room.name, company: companyName, date: fmtDay(until + "T12:00:00Z", L) });
    sendMail(me.email, rc.subject, rc.text, L).catch(() => {});
    const { data: staff } = await admin.from("clv_profiles").select("email, lang, role, company_id").in("role", ["admin", "super"]).neq("status", "suspended");
    for (const s of (staff || []).filter((s: any) => s.role === "super" || s.company_id === room.company_id)) {
      const sl = pickLang(s.lang);
      const m = mail(sl, "ext_requested", { name: me.full_name || me.email, email: me.email, org: me.company || "—", room: room.name, date: fmtDay(until + "T12:00:00Z", sl), message: message || "—", link: `${APP_URL}/admin.html#rooms` });
      sendMail(s.email, m.subject, m.text, sl).catch(() => {});
    }
    return json({ ok: true });
  }

  // NDA status for this user / room.
  const { data: nda } = await admin.from("clv_signed_documents").select("id, doc_version, signed_at, nextcloud_path").eq("room_id", roomId).eq("user_id", me.id).eq("doc_type", "nda").order("signed_at", { ascending: false }).limit(1).maybeSingle();
  const ndaRequired = !!room.qes_nda_required;
  const ndaSigned = !!nda;
  const gateOpen = !ndaRequired || ndaSigned || isStaff(me);

  // Members: everyone with an active assignment, plus staff who manage the room.
  const { data: rows } = await admin.from("clv_room_assignments").select("user_id, granted_at, profile:clv_profiles!clv_room_assignments_user_id_fkey(full_name, company, job_title, status)").eq("room_id", roomId).is("revoked_at", null);
  const memberIds = (rows || []).map((r: any) => r.user_id);
  const { data: signed } = memberIds.length ? await admin.from("clv_signed_documents").select("user_id").eq("room_id", roomId).eq("doc_type", "nda").in("user_id", memberIds) : { data: [] as any[] };
  const signedSet = new Set((signed || []).map((s: any) => s.user_id));
  // Presence: green = active in this room within the last 3 minutes (the page refreshes
  // every 90 s while open), orange = has been in the room before, red = never opened it.
  const { data: acts } = memberIds.length ? await admin.from("clv_access_log").select("user_id, ts").eq("room_id", roomId).in("user_id", memberIds).order("ts", { ascending: false }).limit(2000) : { data: [] as any[] };
  const lastSeen: Record<string, string> = {}; (acts || []).forEach((l: any) => { if (!lastSeen[l.user_id]) lastSeen[l.user_id] = l.ts; });
  const cutoff = Date.now() - 3 * 60 * 1000;
  const members = (rows || []).map((r: any) => {
    const seen = lastSeen[r.user_id] || null;
    const presence = seen ? (new Date(seen).getTime() > cutoff ? "online" : "returning") : "never";
    return {
      name: r.profile?.full_name || "", company: r.profile?.company || "", job_title: r.profile?.job_title || "",
      verified: r.profile?.status === "verified", nda_signed: signedSet.has(r.user_id), since: r.granted_at, last_seen: seen, presence,
    };
  }).sort((a: any, b: any) => (a.company || "").localeCompare(b.company || "") || a.name.localeCompare(b.name));

  // Folder tree (only once the gate is open). _users/ holds the signed NDAs and is never listed.
  let tree: any[] = [];
  let ncError: string | null = null;
  if (gateOpen) {
    if (light) { /* no tree */ }
    else if (!(await ncConfigured())) ncError = "storage-not-configured";
    else {
      try {
        const root = room.nextcloud_folder || "";
        const all = await ncTree(root, 4);
        tree = all.filter((e) => !e.path.slice(root.length + 1).startsWith("_users"))
          .map((e) => ({ name: e.name, path: e.path.slice(root.length + 1), dir: e.dir, size: e.size, modified: e.modified, mime: e.mime }));
      } catch (e) { ncError = (e as Error).message; }
    }
    await admin.from("clv_access_log").insert({ user_id: me.id, room_id: roomId, file_path: null, action: "room-view", ip: clientIp(req), user_agent: req.headers.get("user-agent") || "" }).then(() => {}, () => {});
  }

  const { data: pendingReq } = isStaff(me) ? { data: null } : await admin.from("clv_access_requests").select("id, requested_until, created_at").eq("room_id", roomId).eq("user_id", me.id).eq("status", "pending").maybeSingle();
  return json({
    ok: true,
    room: { id: room.id, slug: room.slug, name: room.name, description: room.description, project_type: room.project_type, seller: room.seller, status: room.status, nda_required: ndaRequired, nda_version: room.annex_version, downloads_allowed: !!room.downloads_allowed, company: companyName, nda_pdf: !!room.nda_pdf_path, nda_pdf_name: room.nda_pdf_name },
    me: { verified: me.status === "verified" || isStaff(me), staff: isStaff(me), can_download: isStaff(me) ? true : (!!assignment?.can_download && !expired), expires_at: assignment?.expires_at || null, expired, pending_request: pendingReq || null },
    nda: { required: ndaRequired, signed: ndaSigned, signed_at: nda?.signed_at || null, version: nda?.doc_version || null, has_file: !!nda?.nextcloud_path },
    members, tree, storage_error: ncError,
  });
});
