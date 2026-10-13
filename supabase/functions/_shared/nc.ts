// Nextcloud WebDAV helper for the Clavoris data rooms.
// Secrets: NC_URL (https://drive.example.com), NC_USER, NC_PASS (an app password).
// Data rooms live under clv_rooms.nextcloud_folder (path relative to the NC user's root).

const NC_URL = (Deno.env.get("NC_URL") || "").replace(/\/$/, "");
const NC_USER = Deno.env.get("NC_USER") || "";
const NC_PASS = Deno.env.get("NC_PASS") || "";

export function ncConfigured(): boolean { return !!(NC_URL && NC_USER && NC_PASS); }

function auth(): string { return "Basic " + btoa(`${NC_USER}:${NC_PASS}`); }
export function encPath(p: string): string {
  return p.split("/").filter(Boolean).map(encodeURIComponent).join("/");
}
function davUrl(p: string): string { return `${NC_URL}/remote.php/dav/files/${encodeURIComponent(NC_USER)}/${encPath(p)}`; }

export type NcEntry = { name: string; path: string; dir: boolean; size: number; modified: string; etag: string; mime: string };

function xmlVal(block: string, tag: string): string {
  const m = block.match(new RegExp(`<(?:[a-z0-9]+:)?${tag}[^>]*>([^<]*)</(?:[a-z0-9]+:)?${tag}>`, "i"));
  return m ? m[1] : "";
}

// List direct children of a folder (PROPFIND Depth: 1). Hidden entries (dot-prefixed) are skipped.
export async function ncList(folder: string): Promise<NcEntry[]> {
  const body = `<?xml version="1.0"?><d:propfind xmlns:d="DAV:"><d:prop><d:resourcetype/><d:getcontentlength/><d:getlastmodified/><d:getetag/><d:getcontenttype/></d:prop></d:propfind>`;
  const res = await fetch(davUrl(folder) + "/", { method: "PROPFIND", headers: { authorization: auth(), depth: "1", "content-type": "application/xml" }, body });
  if (res.status === 404) return [];
  if (!res.ok) { const t = (await res.text().catch(() => "")).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 160); console.error("nc list", res.status, t); throw new Error(`nc list ${res.status}`); }
  const xml = await res.text();
  const out: NcEntry[] = [];
  const base = `/remote.php/dav/files/${encodeURIComponent(NC_USER)}/`;
  const blocks = xml.split(/<(?:[a-z0-9]+:)?response>/i).slice(1);
  for (const b of blocks) {
    const href = decodeURIComponent(xmlVal(b, "href"));
    const rel = href.startsWith(base) ? href.slice(base.length) : href;
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
  const res = await fetch(davUrl(path), { headers: { authorization: auth() } });
  if (!res.ok) throw new Error(`nc get ${res.status}`);
  return res;
}

export async function ncMkdirP(folder: string): Promise<void> {
  const parts = folder.split("/").filter(Boolean);
  let cur = "";
  for (const p of parts) {
    cur += (cur ? "/" : "") + p;
    const res = await fetch(davUrl(cur), { method: "MKCOL", headers: { authorization: auth() } });
    if (![201, 405].includes(res.status)) throw new Error(`nc mkcol ${res.status} ${cur}`);
  }
}

export async function ncPut(path: string, bytes: Uint8Array, contentType = "application/octet-stream"): Promise<void> {
  const res = await fetch(davUrl(path), { method: "PUT", headers: { authorization: auth(), "content-type": contentType }, body: bytes });
  if (!res.ok) throw new Error(`nc put ${res.status}`);
}

export async function sha256Hex(data: Uint8Array | string): Promise<string> {
  const buf = typeof data === "string" ? new TextEncoder().encode(data) : data;
  const h = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(h)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
