// supabase/functions/clv-admin-artifacts/index.ts
// Interactive artifacts, managed by the company that owns them (admin of that company, or super).
//   { action: "list", room_id }                                        -> the company's artifacts + this room's links
//   { action: "create", room_id, slug, title, description?, source_url? } -> new artifact for the room's company
//   { action: "publish", artifact_id, html, data?, note? }             -> new immutable version (HTML ≤ 8 MB, data JSON)
//   { action: "versions", artifact_id }                                -> published versions (without content)
//   { action: "link", room_id, artifact_id }                           -> attach to a room — created DISABLED
//   { action: "update_link", link_id, label?, pinned_version?, config?, position? }
//   { action: "enable", link_id, enabled, confirm: true }              -> make visible to members (or hide again)
//   { action: "unlink", link_id }                                      -> remove from the room
// Nothing becomes visible to members without an explicit "enable" with confirm: true. Every change is audited.
// Deploy: supabase functions deploy clv-admin-artifacts --no-verify-jwt
import { adminClient, audit, cors, inScope, json, requireAdmin } from "../_shared/clv.ts";

const MAX_HTML = 8 * 1024 * 1024;
const MAX_DATA = 8 * 1024 * 1024;
const enc = new TextEncoder();
async function sha256Hex(s: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", enc.encode(s));
  return Array.from(new Uint8Array(d), (b) => b.toString(16).padStart(2, "0")).join("");
}
// Stable JSON (sorted keys) so the fingerprint of the data does not depend on key order.
function canon(v: unknown): string {
  if (Array.isArray(v)) return "[" + v.map(canon).join(",") + "]";
  if (v && typeof v === "object") return "{" + Object.keys(v as object).sort().map((k) => JSON.stringify(k) + ":" + canon((v as any)[k])).join(",") + "}";
  return JSON.stringify(v ?? null);
}
function cleanConfig(c: any) {
  const out: Record<string, unknown> = {};
  if (Array.isArray(c?.hide)) out.hide = c.hide.map((s: unknown) => String(s).slice(0, 200)).filter(Boolean).slice(0, 100);
  if (Array.isArray(c?.collections)) out.collections = c.collections.map((s: unknown) => String(s).slice(0, 64)).filter(Boolean).slice(0, 50);
  if (typeof c?.print === "boolean") out.print = c.print;
  if (typeof c?.watermark === "boolean") out.watermark = c.watermark;
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

  const roomOf = async (id: string) => {
    const { data: room } = await admin.from("clv_rooms").select("id, slug, name, company_id").eq("id", id).maybeSingle();
    return room && inScope(me, room.company_id) ? room : null;
  };
  const artOf = async (id: string) => {
    const { data: a } = await admin.from("clv_artifacts").select("id, slug, title, company_id, current_version").eq("id", id).maybeSingle();
    return a && inScope(me, a.company_id) ? a : null;
  };
  const linkOf = async (id: string) => {
    const { data: l } = await admin.from("clv_room_artifacts").select("id, room_id, artifact_id, enabled, room:clv_rooms(id, slug, name, company_id)").eq("id", id).maybeSingle();
    return l && inScope(me, (l as any).room?.company_id) ? l as any : null;
  };

  if (action === "list") {
    const room = await roomOf(String(body.room_id || ""));
    if (!room) return json({ error: "not-found" }, 404);
    const { data: arts } = await admin.from("clv_artifacts").select("id, slug, title, description, source_url, current_version, updated_at").eq("company_id", room.company_id).order("title");
    const { data: links } = await admin.from("clv_room_artifacts").select("id, artifact_id, label, pinned_version, config, enabled, position, enabled_at").eq("room_id", room.id).order("position").order("created_at");
    return json({ ok: true, artifacts: arts || [], links: links || [] });
  }

  if (action === "create") {
    const room = await roomOf(String(body.room_id || ""));
    if (!room) return json({ error: "not-found" }, 404);
    const slug = String(body.slug || "").toLowerCase().trim();
    const title = String(body.title || "").trim().slice(0, 160);
    if (!/^[a-z0-9][a-z0-9-]{1,62}$/.test(slug)) return json({ error: "bad-slug" }, 400);
    if (!title) return json({ error: "title-required" }, 400);
    const { data, error } = await admin.from("clv_artifacts").insert({ company_id: room.company_id, slug, title, description: String(body.description || "").slice(0, 1000) || null, source_url: String(body.source_url || "").slice(0, 500) || null, created_by: me.id }).select("id").single();
    if (error) return json({ error: /duplicate/.test(error.message) ? "slug-taken" : error.message }, 400);
    await audit(admin, me, "artifact-created", slug, { title, company_id: room.company_id });
    return json({ ok: true, id: data.id });
  }

  if (action === "publish") {
    const art = await artOf(String(body.artifact_id || ""));
    if (!art) return json({ error: "not-found" }, 404);
    const html = String(body.html || "");
    if (!html.trim()) return json({ error: "html-required" }, 400);
    if (enc.encode(html).length > MAX_HTML) return json({ error: "too-large" }, 400);
    const data = body.data && typeof body.data === "object" && !Array.isArray(body.data) ? body.data : {};
    const dataStr = canon(data);
    if (enc.encode(dataStr).length > MAX_DATA) return json({ error: "too-large" }, 400);
    const sha = await sha256Hex(html + "\n" + dataStr);
    const version = (art.current_version || 0) + 1;
    const { error } = await admin.from("clv_artifact_versions").insert({ artifact_id: art.id, version, html, data, sha256: sha, note: String(body.note || "").slice(0, 500) || null, published_by: me.id });
    if (error) return json({ error: error.message }, 400);
    await admin.from("clv_artifacts").update({ current_version: version, updated_at: new Date().toISOString() }).eq("id", art.id);
    await audit(admin, me, "artifact-published", art.slug, { version, sha256: sha, bytes: html.length, collections: Object.keys(data) });
    return json({ ok: true, version, sha256: sha });
  }

  if (action === "versions") {
    const art = await artOf(String(body.artifact_id || ""));
    if (!art) return json({ error: "not-found" }, 404);
    const { data } = await admin.from("clv_artifact_versions").select("version, sha256, note, published_at, published_by").eq("artifact_id", art.id).order("version", { ascending: false }).limit(100);
    return json({ ok: true, versions: data || [] });
  }

  if (action === "link") {
    const room = await roomOf(String(body.room_id || ""));
    const art = await artOf(String(body.artifact_id || ""));
    if (!room || !art || art.company_id !== room.company_id) return json({ error: "not-found" }, 404);
    // Always created disabled: members see nothing until staff enable it explicitly.
    const { data, error } = await admin.from("clv_room_artifacts").insert({ room_id: room.id, artifact_id: art.id, enabled: false, created_by: me.id }).select("id").single();
    if (error) return json({ error: /duplicate/.test(error.message) ? "already-linked" : error.message }, 400);
    await audit(admin, me, "artifact-linked", room.slug, { artifact: art.slug, enabled: false });
    return json({ ok: true, id: data.id });
  }

  if (action === "update_link") {
    const l = await linkOf(String(body.link_id || ""));
    if (!l) return json({ error: "not-found" }, 404);
    const patch: Record<string, unknown> = {};
    if ("label" in body) patch.label = String(body.label || "").slice(0, 160) || null;
    if ("pinned_version" in body) patch.pinned_version = body.pinned_version ? Math.max(1, parseInt(body.pinned_version, 10) || 1) : null;
    if ("config" in body) patch.config = cleanConfig(body.config);
    if ("position" in body) patch.position = parseInt(body.position, 10) || 0;
    if (patch.pinned_version) {
      const { data: v } = await admin.from("clv_artifact_versions").select("version").eq("artifact_id", l.artifact_id).eq("version", patch.pinned_version).maybeSingle();
      if (!v) return json({ error: "no-such-version" }, 400);
    }
    const { error } = await admin.from("clv_room_artifacts").update(patch).eq("id", l.id);
    if (error) return json({ error: error.message }, 400);
    await audit(admin, me, "artifact-link-updated", l.room.slug, { link: l.id, ...patch });
    return json({ ok: true });
  }

  if (action === "enable") {
    const l = await linkOf(String(body.link_id || ""));
    if (!l) return json({ error: "not-found" }, 404);
    const on = body.enabled === true;
    if (on && body.confirm !== true) return json({ error: "confirm-required" }, 400);
    const { error } = await admin.from("clv_room_artifacts").update(on ? { enabled: true, enabled_at: new Date().toISOString(), enabled_by: me.id } : { enabled: false }).eq("id", l.id);
    if (error) return json({ error: error.message }, 400);
    await audit(admin, me, on ? "artifact-enabled" : "artifact-disabled", l.room.slug, { link: l.id });
    return json({ ok: true, enabled: on });
  }

  if (action === "unlink") {
    const l = await linkOf(String(body.link_id || ""));
    if (!l) return json({ error: "not-found" }, 404);
    await admin.from("clv_room_artifacts").delete().eq("id", l.id);
    await audit(admin, me, "artifact-unlinked", l.room.slug, { link: l.id });
    return json({ ok: true });
  }

  return json({ error: "bad-action" }, 400);
});
