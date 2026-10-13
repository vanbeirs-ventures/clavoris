// supabase/functions/clv-admin-rooms/index.ts
// Admin console for data rooms (caller must be admin or super).
//   { action: "list" }                                   -> rooms with member counts
//   { action: "members", room_id }                       -> members, NDA status, last access
//   { action: "invite", room_id, email, lang? (en|nl|fr), name?, company? } -> enrol-if-needed + assign + invitation mail
//   { action: "revoke", room_id, user_id }               -> revoke access (kept in the list, tagged revoked)
//   { action: "reactivate", room_id, user_id }           -> reinstate a revoked member
//   { action: "remind", room_id, user_id }               -> reminder mail for the next step (activation / KYC / NDA)
// Deploy: supabase functions deploy clv-admin-rooms --no-verify-jwt
import { adminClient, APP_URL, audit, cors, enrolUser, json, requireAdmin, sendMail } from "../_shared/clv.ts";
import { mail, pickLang } from "../_shared/mail-i18n.ts";
const withLang = (u: string, l: string) => u + (u.includes("?") ? "&" : "?") + "lang=" + l;

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
    // Every assignment, including revoked ones (tagged, with the option to reactivate), with the
    // full onboarding status: activated (first sign-in), KYC, NDA, last access, last reminder.
    const { data: rows } = await admin.from("clv_room_assignments").select("id, user_id, can_download, expires_at, granted_at, revoked_at, profile:clv_profiles!clv_room_assignments_user_id_fkey(email, full_name, company, status, last_login_at, lang)").eq("room_id", roomId).order("granted_at", { ascending: false });
    const ids = (rows || []).map((r: any) => r.user_id);
    const { data: signed } = ids.length ? await admin.from("clv_signed_documents").select("user_id, signed_at").eq("room_id", roomId).eq("doc_type", "nda").in("user_id", ids) : { data: [] as any[] };
    const { data: last } = ids.length ? await admin.from("clv_access_log").select("user_id, ts, action").eq("room_id", roomId).in("user_id", ids).order("ts", { ascending: false }).limit(500) : { data: [] as any[] };
    const { data: rem } = ids.length ? await admin.from("clv_audit").select("target, created_at, detail").eq("event_type", "room-reminder-sent").in("target", ids).order("created_at", { ascending: false }).limit(500) : { data: [] as any[] };
    const signedAt: Record<string, string> = {}; (signed || []).forEach((s: any) => { signedAt[s.user_id] = s.signed_at; });
    const lastAt: Record<string, string> = {}; (last || []).forEach((l: any) => { if (!lastAt[l.user_id]) lastAt[l.user_id] = l.ts; });
    const remAt: Record<string, { ts: string; step: string }> = {}; (rem || []).forEach((r: any) => { if (!remAt[r.target] && r.detail?.room === room.slug) remAt[r.target] = { ts: r.created_at, step: r.detail?.step || "" }; });
    return json({ ok: true, members: (rows || []).map((r: any) => {
      const st = r.profile?.status || "registered";
      const activated = !!r.profile?.last_login_at, verified = st === "verified", nda = !!signedAt[r.user_id];
      const next = r.revoked_at ? null : !activated ? "signup" : !verified ? "kyc" : !nda ? "nda" : null; // next reminder step
      return { user_id: r.user_id, email: r.profile?.email, name: r.profile?.full_name, company: r.profile?.company, status: st, lang: r.profile?.lang, activated, last_login_at: r.profile?.last_login_at || null, can_download: r.can_download, expires_at: r.expires_at, granted_at: r.granted_at, revoked_at: r.revoked_at, nda_signed_at: signedAt[r.user_id] || null, last_access: lastAt[r.user_id] || null, next_step: next, reminded: remAt[r.user_id] || null };
    }) });
  }

  if (action === "remind") {
    // Nudge the member about the next outstanding onboarding step: activation, KYC or NDA.
    const userId = String(body.user_id || "");
    const { data: a } = await admin.from("clv_room_assignments").select("id, revoked_at, profile:clv_profiles!clv_room_assignments_user_id_fkey(email, full_name, status, last_login_at, lang)").eq("room_id", roomId).eq("user_id", userId).maybeSingle();
    const prof = (a as any)?.profile;
    if (!a || !prof) return json({ error: "not-member" }, 404);
    if (a.revoked_at) return json({ error: "revoked" }, 400);
    const { data: nda } = await admin.from("clv_signed_documents").select("id").eq("room_id", roomId).eq("user_id", userId).eq("doc_type", "nda").maybeSingle();
    const step = !prof.last_login_at ? "signup" : prof.status !== "verified" ? "kyc" : !nda ? "nda" : null;
    if (!step) return json({ ok: true, step: null });
    const L = pickLang(prof.lang);
    let link = `${APP_URL}/room.html?id=${roomId}`;
    if (step === "signup") {
      const { data: l } = await admin.auth.admin.generateLink({ type: "recovery", email: prof.email, options: { redirectTo: APP_URL + "/reset.html" } });
      link = l?.properties?.hashed_token ? `${APP_URL}/reset.html?token_hash=${encodeURIComponent(l.properties.hashed_token)}&type=recovery&welcome=1&lang=${L}` : `${APP_URL}/login.html?lang=${L}`;
    } else if (step === "kyc") link = `${APP_URL}/kyc.html?next=room.html%3Fid%3D${roomId}`;
    const m = mail(L, "remind_" + step, { name: prof.full_name, room: room.name, link });
    let mailed = false;
    try { mailed = await sendMail(prof.email, m.subject, m.text, L); } catch (e) { console.error("clv-admin-rooms remind mail:", (e as Error).message); }
    await audit(admin, me, "room-reminder-sent", userId, { room: room.slug, step, mailed });
    return json({ ok: true, step, mailed });
  }

  if (action === "reactivate") {
    // Reinstate a revoked member (fresh expiry) and tell them the room is open again.
    const userId = String(body.user_id || "");
    const expires = room.default_expiry_days ? new Date(Date.now() + room.default_expiry_days * 86400000).toISOString() : null;
    const { data: a, error } = await admin.from("clv_room_assignments").update({ revoked_at: null, revoked_by: null, expires_at: expires, granted_by: me.id, granted_at: new Date().toISOString() }).eq("room_id", roomId).eq("user_id", userId).not("revoked_at", "is", null).select("id").maybeSingle();
    if (error) return json({ error: error.message }, 400);
    if (!a) return json({ error: "not-revoked" }, 400);
    await audit(admin, me, "room-access-reactivated", userId, { room: room.slug });
    const { data: prof } = await admin.from("clv_profiles").select("email, full_name, lang").eq("id", userId).maybeSingle();
    if (prof) { const L = pickLang(prof.lang); const m = mail(L, "room_invite_existing", { name: prof.full_name, room: room.name, link: `${APP_URL}/login.html?lang=${L}` }); sendMail(prof.email, m.subject, m.text, L).catch(() => {}); }
    return json({ ok: true, expires_at: expires });
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
    const lang = pickLang(body.lang);

    // 1. Enrol the user if needed (shared directory: an existing Minerva user keeps their passphrase).
    let { data: prof } = await admin.from("clv_profiles").select("id, email, full_name, status, lang").eq("email", email).maybeSingle();
    let created = false, linked = false, link = `${APP_URL}/login.html`;
    if (!prof) {
      const en = await enrolUser(admin, email, name, company, lang);
      if ("error" in en) return json({ error: en.error }, 400);
      prof = { id: en.id, email, full_name: name, status: "registered", lang };
      created = en.created; linked = en.linked; link = en.link;
      await audit(admin, me, "user-created", email, { via: "room-invite", room: room.slug, linked });
    } else if (prof.status === "suspended" || prof.status === "rejected") return json({ error: "user-blocked" }, 400);

    // 2. Assign (re-activate if previously revoked).
    const expires = room.default_expiry_days ? new Date(Date.now() + room.default_expiry_days * 86400000).toISOString() : null;
    const { data: existing } = await admin.from("clv_room_assignments").select("id, revoked_at").eq("room_id", roomId).eq("user_id", prof.id).maybeSingle();
    if (existing) await admin.from("clv_room_assignments").update({ revoked_at: null, revoked_by: null, expires_at: expires, granted_by: me.id, granted_at: new Date().toISOString() }).eq("id", existing.id);
    else await admin.from("clv_room_assignments").insert({ room_id: roomId, user_id: prof.id, can_download: true, expires_at: expires, granted_by: me.id });
    await audit(admin, me, "room-access-granted", email, { room: room.slug, created });

    // 3. Invitation mail from the Clavoris sender, in the recipient's language.
    const L = pickLang(prof.lang || lang);
    const login = `${APP_URL}/login.html?lang=${L}`;
    const m = created ? mail(L, "room_invite_new", { name, room: room.name, link: withLang(link, L) })
      : linked ? mail(L, "room_invite_linked", { name, room: room.name, login, link: withLang(link, L) })
      : mail(L, "room_invite_existing", { name: prof.full_name, room: room.name, link: login });
    let mailed = false;
    try { mailed = await sendMail(email, m.subject, m.text, L); } catch (e) { console.error("clv-admin-rooms invite mail:", (e as Error).message); }
    return json({ ok: true, user_id: prof.id, created, linked, mailed, expires_at: expires });
  }

  return json({ error: "bad-action" }, 400);
});
