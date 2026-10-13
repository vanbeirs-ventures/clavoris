// supabase/functions/clv-admin-rooms/index.ts
// Admin console for data rooms (caller must be admin or super).
//   { action: "list" }                                   -> rooms with member counts
//   { action: "members", room_id }                       -> members, NDA status, last access
//   { action: "invite", room_id, email, name?, company? } -> enrol-if-needed + assign + invitation mail
//   { action: "revoke", room_id, user_id }               -> revoke access (audited)
// Deploy: supabase functions deploy clv-admin-rooms --no-verify-jwt
import { adminClient, APP_URL, audit, cors, json, requireAdmin, sendMail } from "../_shared/clv.ts";

function genPassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const r = crypto.getRandomValues(new Uint32Array(14));
  let out = ""; for (let i = 0; i < 14; i++) { out += chars[r[i] % chars.length]; if (i === 4 || i === 9) out += "-"; }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method" }, 405);
  const admin = adminClient();
  const me = await requireAdmin(admin, req);
  if (me instanceof Response) return me;
  const body = await req.json().catch(() => ({}));
  const action = String(body.action || "list");

  if (action === "list") {
    const { data: rooms } = await admin.from("clv_rooms").select("id, slug, name, seller, project_type, status, qes_nda_required, default_expiry_days, nextcloud_folder, created_at").order("created_at", { ascending: false });
    const { data: asg } = await admin.from("clv_room_assignments").select("room_id").is("revoked_at", null);
    const counts: Record<string, number> = {};
    (asg || []).forEach((a: any) => { counts[a.room_id] = (counts[a.room_id] || 0) + 1; });
    return json({ ok: true, rooms: (rooms || []).map((r: any) => ({ ...r, members: counts[r.id] || 0 })) });
  }

  const roomId = String(body.room_id || "");
  if (!roomId) return json({ error: "room-required" }, 400);
  const { data: room } = await admin.from("clv_rooms").select("id, slug, name, default_expiry_days").eq("id", roomId).maybeSingle();
  if (!room) return json({ error: "not-found" }, 404);

  if (action === "members") {
    const { data: rows } = await admin.from("clv_room_assignments").select("id, user_id, can_download, expires_at, granted_at, profile:clv_profiles(email, full_name, company, status, last_login_at)").eq("room_id", roomId).is("revoked_at", null).order("granted_at", { ascending: false });
    const ids = (rows || []).map((r: any) => r.user_id);
    const { data: signed } = ids.length ? await admin.from("clv_signed_documents").select("user_id, signed_at").eq("room_id", roomId).eq("doc_type", "nda").in("user_id", ids) : { data: [] as any[] };
    const { data: last } = ids.length ? await admin.from("clv_access_log").select("user_id, ts, action").eq("room_id", roomId).in("user_id", ids).order("ts", { ascending: false }).limit(500) : { data: [] as any[] };
    const signedAt: Record<string, string> = {}; (signed || []).forEach((s: any) => { signedAt[s.user_id] = s.signed_at; });
    const lastAt: Record<string, string> = {}; (last || []).forEach((l: any) => { if (!lastAt[l.user_id]) lastAt[l.user_id] = l.ts; });
    return json({ ok: true, members: (rows || []).map((r: any) => ({ user_id: r.user_id, email: r.profile?.email, name: r.profile?.full_name, company: r.profile?.company, status: r.profile?.status, can_download: r.can_download, expires_at: r.expires_at, granted_at: r.granted_at, nda_signed_at: signedAt[r.user_id] || null, last_access: lastAt[r.user_id] || null })) });
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
    const name = String(body.name || "").trim().slice(0, 120);
    const company = String(body.company || "").trim().slice(0, 160) || null;

    // 1. Enrol the user if needed.
    let { data: prof } = await admin.from("clv_profiles").select("id, email, full_name, status").eq("email", email).maybeSingle();
    let created = false;
    if (!prof) {
      const { data: u, error: cErr } = await admin.auth.admin.createUser({ email, password: genPassword(), email_confirm: true, user_metadata: { full_name: name }, app_metadata: { app: "clavoris" } });
      if (cErr) return json({ error: cErr.message }, 400);
      const { error: pErr } = await admin.from("clv_profiles").insert({ id: u.user!.id, email, full_name: name || email.split("@")[0], company, role: "user", status: "registered" });
      if (pErr) { await admin.auth.admin.deleteUser(u.user!.id).catch(() => {}); return json({ error: pErr.message }, 400); }
      prof = { id: u.user!.id, email, full_name: name, status: "registered" };
      created = true;
      await audit(admin, me, "user-created", email, { via: "room-invite", room: room.slug });
    } else if (prof.status === "suspended" || prof.status === "rejected") return json({ error: "user-blocked" }, 400);

    // 2. Assign (re-activate if previously revoked).
    const expires = room.default_expiry_days ? new Date(Date.now() + room.default_expiry_days * 86400000).toISOString() : null;
    const { data: existing } = await admin.from("clv_room_assignments").select("id, revoked_at").eq("room_id", roomId).eq("user_id", prof.id).maybeSingle();
    if (existing) await admin.from("clv_room_assignments").update({ revoked_at: null, revoked_by: null, expires_at: expires, granted_by: me.id, granted_at: new Date().toISOString() }).eq("id", existing.id);
    else await admin.from("clv_room_assignments").insert({ room_id: roomId, user_id: prof.id, can_download: true, expires_at: expires, granted_by: me.id });
    await audit(admin, me, "room-access-granted", email, { room: room.slug, created });

    // 3. Invitation mail from the Clavoris sender.
    let link = `${APP_URL}/login.html`;
    if (created) {
      const { data: l } = await admin.auth.admin.generateLink({ type: "recovery", email, options: { redirectTo: APP_URL + "/reset.html" } });
      if (l?.properties?.hashed_token) link = `${APP_URL}/reset.html?token_hash=${encodeURIComponent(l.properties.hashed_token)}&type=recovery&welcome=1`;
    }
    const text = created
      ? `Dear ${name || "investor"},\n\nYou have been invited to the Clavoris data room "${room.name}".\n\nTo activate your access: set your passphrase, complete your profile and the identity verification (KYC), then sign the room's non-disclosure agreement. Start here (the link is valid once):\n${link}\n\nAccess is personal and every document access is logged.`
      : `Dear ${prof.full_name || "investor"},\n\nYou have been granted access to the Clavoris data room "${room.name}".\n\nSign in to open it:\n${link}\n\nIf you have not yet completed identity verification, you will be guided through it first. The room's non-disclosure agreement must be signed before documents become available.`;
    let mailed = false;
    try { mailed = await sendMail(email, `Clavoris data room: ${room.name}`, text); } catch (e) { console.error("clv-admin-rooms invite mail:", (e as Error).message); }
    return json({ ok: true, user_id: prof.id, created, mailed, expires_at: expires });
  }

  return json({ error: "bad-action" }, 400);
});
