// supabase/functions/clv-room-docs/index.ts
// Documents of a data room, managed by the company that owns it (admin of that company, or super).
// The room's folder is created automatically under the Clavoris data-room folder, named after the room;
// the storage location is never shown or chosen in the interface. Data rooms hold PDF, JPEG and PNG.
//   { action: "list", room_id }                                   -> files and folders of the room
//   { action: "upload", room_id, name, folder?, file_base64 }     -> add / replace one PDF (max 25 MB)
//   { action: "delete", room_id, path }                           -> remove one PDF
//   { action: "mkdir", room_id, folder }                          -> create a sub-folder
// Deploy: supabase functions deploy clv-room-docs --no-verify-jwt
import { adminClient, audit, cors, inScope, json, requireAdmin } from "../_shared/clv.ts";
import { ncConfigured, ncDelete, ncMkdirP, ncPut, ncTree, sha256Hex } from "../_shared/nc.ts";

const BASE = "Documents/Clavoris/Data Rooms";
const MAX = 25 * 1024 * 1024;
// A folder or file name as the user typed it, made safe for the storage: no path separators, control
// characters or leading dots; reserved folders (_nda, _users) cannot be used.
const clean = (s: string) => String(s || "").replace(/[\\/:*?"<>|\u0000-\u001f]+/g, " ").replace(/\s+/g, " ").trim().replace(/^\.+/, "").slice(0, 120);
const cleanFolder = (s: string) => String(s || "").split("/").map(clean).filter(Boolean).join("/");
const reserved = (rel: string) => /^_(users|nda)(\/|$)/i.test(rel);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method" }, 405);
  const admin = adminClient();
  const me = await requireAdmin(admin, req);
  if (me instanceof Response) return me;
  const body = await req.json().catch(() => ({}));
  const action = String(body.action || "list");
  if (!(await ncConfigured())) return json({ error: "storage-not-configured" }, 503);

  const { data: room } = await admin.from("clv_rooms").select("id, slug, name, company_id, nextcloud_folder").eq("id", String(body.room_id || "")).maybeSingle();
  if (!room || !inScope(me, room.company_id)) return json({ error: "not-found" }, 404);

  // The room's folder: created on first use, named after the room (suffixed if that name is taken).
  let root = String(room.nextcloud_folder || "");
  if (!root) {
    const base = clean(room.name) || room.slug;
    root = `${BASE}/${base}`;
    const { data: taken } = await admin.from("clv_rooms").select("id").eq("nextcloud_folder", root).neq("id", room.id).maybeSingle();
    if (taken) root = `${BASE}/${base} (${String(room.slug).slice(-4)})`;
    try { await ncMkdirP(root); } catch (e) { return json({ error: "storage-failed", detail: (e as Error).message }, 502); }
    await admin.from("clv_rooms").update({ nextcloud_folder: root }).eq("id", room.id);
  }

  if (action === "list") {
    let all;
    try { await ncMkdirP(root); all = await ncTree(root, 6); } catch (e) { return json({ error: "storage-failed", detail: (e as Error).message }, 502); }
    const items = all.map((e) => ({ name: e.name, path: e.path.slice(root.length + 1), dir: e.dir, size: e.size, modified: e.modified }))
      .filter((e) => !reserved(e.path));
    return json({ ok: true, items, pdf_only: true });
  }

  if (action === "mkdir") {
    const folder = cleanFolder(body.folder);
    if (!folder || reserved(folder)) return json({ error: "bad-folder" }, 400);
    try { await ncMkdirP(`${root}/${folder}`); } catch (e) { return json({ error: "storage-failed", detail: (e as Error).message }, 502); }
    return json({ ok: true, folder });
  }

  if (action === "upload") {
    const name = clean(body.name);
    const folder = cleanFolder(body.folder);
    if (!name || !/\.(pdf|jpe?g|png)$/i.test(name)) return json({ error: "pdf-only" }, 400);
    if (folder && reserved(folder)) return json({ error: "bad-folder" }, 400);
    let bytes: Uint8Array;
    try { bytes = Uint8Array.from(atob(String(body.file_base64 || "")), (ch) => ch.charCodeAt(0)); } catch { return json({ error: "bad-file" }, 400); }
    if (bytes.length > MAX) return json({ error: "too-large" }, 400);
    // Content check, not just the extension: the file must really be a PDF, JPEG or PNG.
    const kind = /\.png$/i.test(name) ? "png" : /\.jpe?g$/i.test(name) ? "jpg" : "pdf";
    const ok = bytes.length >= 100 && (kind === "pdf" ? String.fromCharCode(...bytes.slice(0, 5)) === "%PDF-"
      : kind === "png" ? bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
      : bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff);
    if (!ok) return json({ error: "pdf-only" }, 400);
    const dir = folder ? `${root}/${folder}` : root;
    try { await ncMkdirP(dir); await ncPut(`${dir}/${name}`, bytes, kind === "pdf" ? "application/pdf" : kind === "png" ? "image/png" : "image/jpeg"); } catch (e) { return json({ error: "storage-failed", detail: (e as Error).message }, 502); }
    const sha = await sha256Hex(bytes);
    await audit(admin, me, "room-document-uploaded", room.slug, { file: (folder ? folder + "/" : "") + name, size: bytes.length, sha256: sha });
    return json({ ok: true, path: (folder ? folder + "/" : "") + name, size: bytes.length, sha256: sha });
  }

  if (action === "delete") {
    const rel = String(body.path || "").replace(/^\/+/, "");
    if (!rel || rel.includes("..") || reserved(rel)) return json({ error: "bad-path" }, 400);
    try { await ncDelete(`${root}/${rel}`); } catch (e) { return json({ error: "storage-failed", detail: (e as Error).message }, 502); }
    await audit(admin, me, "room-document-deleted", room.slug, { file: rel });
    return json({ ok: true });
  }

  return json({ error: "bad-action" }, 400);
});
