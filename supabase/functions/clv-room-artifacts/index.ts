// supabase/functions/clv-room-artifacts/index.ts
// Interactive artifacts of a data room, for its members (and the company's staff).
//   { action: "list", room_id }            -> the room's artifacts (members: enabled links only, once the NDA gate is open)
//   { action: "get", room_id, link_id }    -> HTML + read-only data snapshot + viewer configuration + watermark
// Same access rule as the room's documents: an active, unexpired assignment and the NDA signed when the room
// requires one — or staff of the company that owns the room, who may also preview links that are still disabled.
// Every opening is logged in clv_access_log (artifact-view) with a view code shown in the watermark.
// Deploy: supabase functions deploy clv-room-artifacts --no-verify-jwt
import { adminClient, clientIp, cors, inScope, isStaff, json, requireUser } from "../_shared/clv.ts";

const code = () => Array.from(crypto.getRandomValues(new Uint8Array(5)), (b) => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[b % 32]).join("");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method" }, 405);
  const admin = adminClient();
  const me = await requireUser(admin, req);
  if (me instanceof Response) return me;
  const body = await req.json().catch(() => ({}));
  const action = String(body.action || "list");
  const roomId = String(body.room_id || "");
  if (!roomId) return json({ error: "room-required" }, 400);

  const { data: room } = await admin.from("clv_rooms").select("id, slug, name, company_id, qes_nda_required").eq("id", roomId).maybeSingle();
  if (!room) return json({ error: "not-found" }, 404);

  // Staff of the owning company see every link (also disabled ones, as a preview); members need an active,
  // unexpired assignment and an open NDA gate, and only ever see enabled links.
  const staff = isStaff(me) && inScope(me, room.company_id);
  if (!staff) {
    const { data: a } = await admin.from("clv_room_assignments").select("expires_at").eq("room_id", roomId).eq("user_id", me.id).is("revoked_at", null).maybeSingle();
    if (!a) return json({ error: "forbidden" }, 403);
    if (a.expires_at && new Date(a.expires_at) < new Date()) return json({ ok: true, artifacts: [], gate: "expired" });
    if (room.qes_nda_required) {
      const { data: nda } = await admin.from("clv_signed_documents").select("id").eq("room_id", roomId).eq("user_id", me.id).eq("doc_type", "nda").limit(1).maybeSingle();
      if (!nda) return json({ ok: true, artifacts: [], gate: "nda" });
    }
  }

  let links = admin.from("clv_room_artifacts").select("id, artifact_id, label, pinned_version, config, enabled, position, artifact:clv_artifacts(id, slug, title, description, current_version, company_id)").eq("room_id", roomId);
  if (!staff) links = links.eq("enabled", true);

  if (action === "list") {
    const { data: rows } = await links.order("position").order("created_at");
    const out = (rows || []).filter((r: any) => r.artifact && r.artifact.company_id === room.company_id && (r.pinned_version || r.artifact.current_version))
      .map((r: any) => ({ id: r.id, title: r.label || r.artifact.title, description: r.artifact.description || "", version: r.pinned_version || r.artifact.current_version, enabled: !!r.enabled }));
    return json({ ok: true, artifacts: out, staff });
  }

  if (action === "get") {
    const { data: link } = await links.eq("id", String(body.link_id || "")).maybeSingle();
    const art: any = link?.artifact;
    if (!link || !art || art.company_id !== room.company_id) return json({ error: "not-found" }, 404);
    const version = link.pinned_version || art.current_version;
    if (!version) return json({ error: "not-published" }, 404);
    const { data: v } = await admin.from("clv_artifact_versions").select("version, html, data, sha256, published_at").eq("artifact_id", art.id).eq("version", version).maybeSingle();
    if (!v) return json({ error: "not-published" }, 404);

    const cfg = (link.config && typeof link.config === "object") ? link.config as Record<string, any> : {};
    // Only the collections the link exposes (default: the whole snapshot).
    let data = (v.data && typeof v.data === "object") ? v.data as Record<string, any> : {};
    if (Array.isArray(cfg.collections) && cfg.collections.length) data = Object.fromEntries(Object.entries(data).filter(([k]) => cfg.collections.includes(k)));

    const viewCode = code();
    await admin.from("clv_access_log").insert({ user_id: me.id, room_id: roomId, file_path: `artifact:${art.slug}@v${v.version}#${viewCode}${link.enabled ? "" : ":preview"}`, action: "artifact-view", ip: clientIp(req), user_agent: req.headers.get("user-agent") || "" }).then(() => {}, () => {});
    return json({
      ok: true,
      artifact: { id: link.id, title: link.label || art.title, version: v.version, published_at: v.published_at, sha256: v.sha256, preview: !link.enabled },
      html: v.html,
      data,
      config: {
        hide: Array.isArray(cfg.hide) ? cfg.hide.map(String).slice(0, 100) : [],
        print: cfg.print === true,
        watermark: cfg.watermark !== false,
      },
      watermark: { name: me.full_name || me.email, email: me.email, company: me.company || "", at: new Date().toISOString(), code: viewCode },
    });
  }

  return json({ error: "bad-action" }, 400);
});
