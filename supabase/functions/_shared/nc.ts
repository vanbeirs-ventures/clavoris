// Nextcloud WebDAV helper for the Clavoris data rooms.
// Credentials come from the stored connection (clv_settings key "nc", created by the
// admin "Connect Nextcloud" button via Nextcloud Login Flow v2) or, as a fallback, from
// the secrets NC_URL / NC_USER / NC_PASS. Data rooms live under clv_rooms.nextcloud_folder
// (path relative to the connected user's root).
import { adminClient } from "./clv.ts";

// user = the Nextcloud account id (used in WebDAV paths); login = the name the app password was issued to
// (used to authenticate). They differ when the account signs in with an e-mail address.
export type NcCreds = { url: string; user: string; pass: string; login?: string };
// Credentials are cached briefly so a (re)connection made in the admin panel is picked up
// without a redeploy; a missing connection is never cached.
let cached: { creds: NcCreds; at: number } | null = null;
const CACHE_MS = 60_000;

export async function ncCreds(): Promise<NcCreds | null> {
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.creds;
  const { data } = await adminClient().from("clv_settings").select("value").eq("key", "nc").maybeSingle();
  const v = (data?.value || {}) as Partial<NcCreds>;
  let creds: NcCreds | null = null;
  if (v.url && v.user && v.pass) creds = { url: v.url.replace(/\/$/, ""), user: v.user, pass: v.pass, login: v.login || v.user };
  else {
    const url = (Deno.env.get("NC_URL") || "").replace(/\/$/, ""), user = Deno.env.get("NC_USER") || "", pass = Deno.env.get("NC_PASS") || "";
    if (url && user && pass) creds = { url, user, pass };
  }
  cached = creds ? { creds, at: Date.now() } : null;
  return creds;
}
export async function ncConfigured(): Promise<boolean> { return !!(await ncCreds()); }

// An app password is only accepted together with the login name it was issued to, not the account id.
function auth(c: NcCreds): string { return "Basic " + btoa(`${c.login || c.user}:${c.pass}`); }
export function encPath(p: string): string {
  return p.split("/").filter(Boolean).map(encodeURIComponent).join("/");
}
function davUrl(c: NcCreds, p: string): string { return `${c.url}/remote.php/dav/files/${encodeURIComponent(c.user)}/${encPath(p)}`; }
async function need(): Promise<NcCreds> { const c = await ncCreds(); if (!c) throw new Error("storage-not-configured"); return c; }

export type NcEntry = { name: string; path: string; dir: boolean; size: number; modified: string; etag: string; mime: string };

function xmlVal(block: string, tag: string): string {
  const m = block.match(new RegExp(`<(?:[a-z0-9]+:)?${tag}[^>]*>([^<]*)</(?:[a-z0-9]+:)?${tag}>`, "i"));
  return m ? m[1] : "";
}

// List direct children of a folder (PROPFIND Depth: 1). Hidden entries (dot-prefixed) are skipped.
export async function ncList(folder: string): Promise<NcEntry[]> {
  const c = await need();
  const body = `<?xml version="1.0"?><d:propfind xmlns:d="DAV:"><d:prop><d:resourcetype/><d:getcontentlength/><d:getlastmodified/><d:getetag/><d:getcontenttype/></d:prop></d:propfind>`;
  const res = await fetch(davUrl(c, folder) + "/", { method: "PROPFIND", headers: { authorization: auth(c), depth: "1", "content-type": "application/xml" }, body });
  if (res.status === 404) return [];
  if (!res.ok) { const t = (await res.text().catch(() => "")).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 160); console.error("nc list", res.status, t); throw new Error(`nc list ${res.status}`); }
  const xml = await res.text();
  const out: NcEntry[] = [];
  // Hrefs carry the account id (which may differ from the login name used for auth):
  // strip everything up to and including /remote.php/dav/files/<account>/.
  const blocks = xml.split(/<(?:[a-z0-9]+:)?response>/i).slice(1);
  for (const b of blocks) {
    const href = decodeURIComponent(xmlVal(b, "href"));
    const rel = href.replace(/^.*?\/remote\.php\/dav\/files\/[^/]+\//, "");
    const clean = rel.replace(/\/$/, "");
    if (clean === folder.replace(/\/$/, "")) continue; // the folder itself
    const name = clean.split("/").pop() || "";
    if (!name || name.startsWith(".")) continue;
    const dir = /<(?:[a-z0-9]+:)?collection\s*\/?>/i.test(b);
    out.push({ name, path: clean, dir, size: Number(xmlVal(b, "getcontentlength") || 0), modified: xmlVal(b, "getlastmodified"), etag: xmlVal(b, "getetag").replace(/"/g, ""), mime: xmlVal(b, "getcontenttype") });
  }
  out.sort((a, b) => (a.dir === b.dir ? a.name.localeCompare(b.name) : a.dir ? -1 : 1));
  return out;
}

// Recursive tree (folders first), limited depth to keep responses small.
export async function ncTree(folder: string, depth = 4): Promise<NcEntry[]> {
  const items = await ncList(folder);
  if (depth <= 1) return items;
  const all: NcEntry[] = [];
  for (const it of items) {
    all.push(it);
    if (it.dir) all.push(...await ncTree(it.path, depth - 1));
  }
  return all;
}

export async function ncGet(path: string): Promise<Response> {
  const c = await need();
  const res = await fetch(davUrl(c, path), { headers: { authorization: auth(c) } });
  if (!res.ok) throw new Error(`nc get ${res.status}`);
  return res;
}

export async function ncMkdirP(folder: string): Promise<void> {
  const c = await need();
  const parts = folder.split("/").filter(Boolean);
  let cur = "";
  for (const p of parts) {
    cur += (cur ? "/" : "") + p;
    const res = await fetch(davUrl(c, cur), { method: "MKCOL", headers: { authorization: auth(c) } });
    if (![201, 405].includes(res.status)) throw new Error(`nc mkcol ${res.status} ${cur}`);
  }
}

export async function ncPut(path: string, bytes: Uint8Array, contentType = "application/octet-stream"): Promise<void> {
  const c = await need();
  const res = await fetch(davUrl(c, path), { method: "PUT", headers: { authorization: auth(c), "content-type": contentType }, body: bytes });
  if (!res.ok) throw new Error(`nc put ${res.status}`);
}

export async function ncDelete(path: string): Promise<void> {
  const c = await need();
  const res = await fetch(davUrl(c, path), { method: "DELETE", headers: { authorization: auth(c) } });
  if (!res.ok && res.status !== 404) throw new Error(`nc delete ${res.status}`);
}

export async function sha256Hex(data: Uint8Array | string): Promise<string> {
  const buf = typeof data === "string" ? new TextEncoder().encode(data) : data;
  const h = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(h)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
