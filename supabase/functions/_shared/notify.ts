// Notification helpers shared by clv-notify (scheduled watcher), clv-market and clv-contracts.
// Every category can be switched off by the user under Account › E-mail notifications;
// preferences live in clv_profiles.notify (jsonb) and a missing key means ON.
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { APP_URL, fmtDay, sendMail } from "./clv.ts";
import { mail, pickLang, word } from "./room-mail.ts";
import { ncConfigured, ncTree } from "./nc.ts";
import { roomAutoMails } from "./room-auto-mail.ts";

export type NotifyKey = "room_new" | "room_updated" | "contract_new" | "market_new" | "portfolio_events";
export const NOTIFY_KEYS: NotifyKey[] = ["room_new", "room_updated", "contract_new", "market_new", "portfolio_events"];
type Prefs = Record<string, unknown> | null | undefined;
export function wants(prefs: Prefs, key: NotifyKey): boolean { return !(prefs && typeof prefs === "object" && (prefs as Record<string, unknown>)[key] === false); }
export function cleanNotify(n: unknown): Record<string, boolean> {
  const o = (n && typeof n === "object" ? n : {}) as Record<string, unknown>;
  const out: Record<string, boolean> = {};
  for (const k of NOTIFY_KEYS) if (o[k] === false) out[k] = false;
  return out;
}

type Recipient = { id: string; email: string; full_name: string | null; lang: string | null; notify: Prefs; status: string; features?: Record<string, unknown> | null };
const RECIP = "id, email, full_name, lang, notify, status, features";
const active = (p: Recipient) => p.status !== "suspended" && p.status !== "rejected";

// ---- data rooms: new / updated files ------------------------------------------------------
type Snap = { path: string; etag: string | null; size: number | null; modified: string | null };
export async function scanRooms(admin: SupabaseClient): Promise<{ rooms: number; mails: number; new_files: number; updated_files: number }> {
  const out = { rooms: 0, mails: 0, new_files: 0, updated_files: 0 };
  if (!(await ncConfigured())) return out;
  // Automatic member mails switched off (see room-auto-mail.ts): the file snapshot is still kept up to date.
  const mailOn = await roomAutoMails(admin);
  const { data: rooms } = await admin.from("clv_rooms").select("id, name, nextcloud_folder, status, company:clv_companies(name)").not("nextcloud_folder", "is", null).neq("status", "closed");
  for (const room of rooms || []) {
    out.rooms++;
    let tree: Awaited<ReturnType<typeof ncTree>>;
    try { tree = await ncTree(room.nextcloud_folder, 6); } catch (e) { console.error("clv-notify scan", room.name, (e as Error).message); continue; }
    const root = String(room.nextcloud_folder);
    // Only the documents members can open (PDF, JPEG, PNG) are announced.
    const files = tree.filter((e) => !e.dir && /\.(pdf|jpe?g|png)$/i.test(e.name) && !e.path.slice(root.length + 1).startsWith("_users") && !e.path.slice(root.length + 1).startsWith("_nda")).map((e) => ({ path: e.path.slice(root.length + 1), etag: e.etag || null, size: e.size, modified: e.modified || null }));
    const { data: known } = await admin.from("clv_room_files").select("path, etag, size, modified").eq("room_id", room.id);
    const seen = new Map<string, Snap>(); for (const k of known || []) seen.set(k.path, k);
    const added: string[] = [], changed: string[] = [];
    for (const f of files) {
      const k = seen.get(f.path);
      if (!k) added.push(f.path);
      else if ((k.etag || "") !== (f.etag || "") || Number(k.size || 0) !== Number(f.size || 0)) changed.push(f.path);
    }
    const gone = (known || []).filter((k) => !files.some((f) => f.path === k.path)).map((k) => k.path);
    const now = new Date().toISOString();
    if (added.length || changed.length) await admin.from("clv_room_files").upsert(files.filter((f) => added.includes(f.path) || changed.includes(f.path)).map((f) => ({ room_id: room.id, ...f, last_changed: now, ...(added.includes(f.path) ? { first_seen: now } : {}) })), { onConflict: "room_id,path" });
    if (gone.length) await admin.from("clv_room_files").delete().eq("room_id", room.id).in("path", gone);
    // First scan of a room only seeds the snapshot: nobody is mailed about files that were already there.
    if (!(known || []).length || (!added.length && !changed.length)) continue;
    out.new_files += added.length; out.updated_files += changed.length;
    if (!mailOn) continue;
    const { data: asg } = await admin.from("clv_room_assignments").select("user_id, expires_at, profile:clv_profiles!clv_room_assignments_user_id_fkey(" + RECIP + ")").eq("room_id", room.id).is("revoked_at", null);
    for (const a of asg || []) {
      const p = (a as unknown as { profile: Recipient }).profile; if (!p || !active(p)) continue;
      if (a.expires_at && new Date(a.expires_at) < new Date()) continue;
      const n = wants(p.notify, "room_new") ? added : [], u = wants(p.notify, "room_updated") ? changed : [];
      if (!n.length && !u.length) continue;
      const L = pickLang(p.lang);
      const list = (n.length ? "\n" + word(L, "files_new_h") + "\n" + n.map((x) => "  • " + x).join("\n") + "\n" : "") + (u.length ? "\n" + word(L, "files_updated_h") + "\n" + u.map((x) => "  • " + x).join("\n") + "\n" : "");
      const what = [n.length ? `${n.length} ${word(L, "files_new")}` : "", u.length ? `${u.length} ${word(L, "files_updated")}` : ""].filter(Boolean).join(", ");
      const m = mail(L, "room_files", { name: p.full_name, room: room.name, owner: (room as any).company?.name || "", what, list, link: `${APP_URL}/room.html?id=${room.id}` });
      if (await sendMail(p.email, m.subject, m.text, L).catch(() => false)) out.mails++;
    }
  }
  return out;
}

// ---- marketplace: new investment available (once per product, when it becomes open) --------
export async function notifyNewProducts(admin: SupabaseClient): Promise<number> {
  const { data: prods } = await admin.from("clv_products").select("id, code, name, type, issuer_name, currency, nominal, coupon_rate, coupon_frequency, maturity_date").eq("status", "open").is("notified_open_at", null);
  if (!prods?.length) return 0;
  const { data: users } = await admin.from("clv_profiles").select(RECIP).eq("role", "user");
  let sent = 0;
  for (const p of prods) {
    await admin.from("clv_products").update({ notified_open_at: new Date().toISOString() }).eq("id", p.id);
    for (const u of (users || []) as Recipient[]) {
      if (!active(u) || !wants(u.notify, "market_new")) continue;
      const f = (u.features || {}) as { market?: boolean; products?: string[] | null };
      if (!f.market) continue;
      if (Array.isArray(f.products) && !f.products.includes(p.id)) continue;
      const L = pickLang(u.lang);
      const terms = [p.coupon_rate != null ? `${Number(p.coupon_rate).toFixed(2)} % · ${p.coupon_frequency}` : "", p.maturity_date ? `→ ${p.maturity_date}` : "", `${p.currency} ${Number(p.nominal).toLocaleString("en-GB")} / unit`].filter(Boolean).join(" · ");
      const m = mail(L, "market_new", { name: u.full_name, product: `${p.code} · ${p.name}`, issuer: p.issuer_name, terms, link: `${APP_URL}/product.html?id=${p.id}` });
      if (await sendMail(u.email, m.subject, m.text, L).catch(() => false)) sent++;
    }
  }
  return sent;
}

// ---- portfolio events: mail every holder of the instrument ---------------------------------
// `keys` selects localised title/body templates (per recipient language) instead of the fixed strings.
export type PfEvent = { kind: "coupon" | "custom" | "maturity" | "principal" | "conversion"; title: string; body: string; date: string | null; amounts?: Record<string, string>; keys?: { title: string; body: string; vars?: Record<string, string> } };
export async function notifyHolders(admin: SupabaseClient, product: { id: string; code: string; name: string }, ev: PfEvent, onlyUsers?: string[]): Promise<number> {
  const { data: hold } = await admin.from("clv_holdings").select("user_id, units").eq("product_id", product.id);
  const per: Record<string, number> = {};
  for (const h of hold || []) per[h.user_id] = (per[h.user_id] || 0) + Number(h.units);
  const ids = Object.keys(per).filter((u) => per[u] > 0 && (!onlyUsers || onlyUsers.includes(u)));
  if (!ids.length) return 0;
  const { data: users } = await admin.from("clv_profiles").select(RECIP).in("id", ids);
  let sent = 0;
  for (const u of (users || []) as Recipient[]) {
    if (!active(u) || !wants(u.notify, "portfolio_events")) continue;
    const L = pickLang(u.lang);
    const vars = { ...(ev.keys?.vars || {}), amount: ev.amounts?.[u.id] || "" };
    const title = ev.keys ? word(L, ev.keys.title, vars) : ev.title, body = ev.keys ? word(L, ev.keys.body, vars) : ev.body;
    const m = mail(L, "pf_event", { name: u.full_name, title, body, product: `${product.code} · ${product.name}`, kind: word(L, "ev_" + ev.kind), date: ev.date ? word(L, "on_date", { date: ev.date }) : "", units: String(per[u.id]), amount: ev.amounts?.[u.id] ? ` · ${ev.amounts[u.id]}` : "", link: `${APP_URL}/portfolio.html` });
    if (await sendMail(u.email, m.subject, m.text, L).catch(() => false)) sent++;
  }
  return sent;
}

// ---- data-room access end: reminders 7 days and 24 hours before the end date ------------------
export async function expiryReminders(admin: SupabaseClient): Promise<{ d7: number; h24: number }> {
  const out = { d7: 0, h24: 0 };
  if (!(await roomAutoMails(admin))) return out; // automatic member mails switched off (room-auto-mail.ts)
  const now = Date.now();
  const { data: rows } = await admin.from("clv_room_assignments").select("id, user_id, expires_at, reminded_7d_at, reminded_24h_at, room:clv_rooms(id, name, company:clv_companies(name)), profile:clv_profiles!clv_room_assignments_user_id_fkey(email, full_name, lang, status)").is("revoked_at", null).not("expires_at", "is", null).gt("expires_at", new Date(now).toISOString()).lte("expires_at", new Date(now + 7 * 86400000).toISOString());
  for (const a of (rows || []) as any[]) {
    const p = a.profile, room = a.room; if (!p || !room || p.status === "suspended" || p.status === "rejected") continue;
    const left = new Date(a.expires_at).getTime() - now;
    const L = pickLang(p.lang);
    const vars = { name: p.full_name, room: room.name, owner: room.company?.name || "", date: fmtDay(a.expires_at, L), link: `${APP_URL}/room.html?id=${room.id}` };
    if (left <= 24 * 3600000 && !a.reminded_24h_at) {
      const m = mail(L, "access_24h", vars);
      if (await sendMail(p.email, m.subject, m.text, L).catch(() => false)) { out.h24++; await admin.from("clv_room_assignments").update({ reminded_24h_at: new Date().toISOString(), reminded_7d_at: a.reminded_7d_at || new Date().toISOString() }).eq("id", a.id); }
    } else if (left > 24 * 3600000 && !a.reminded_7d_at) {
      const m = mail(L, "access_7d", vars);
      if (await sendMail(p.email, m.subject, m.text, L).catch(() => false)) { out.d7++; await admin.from("clv_room_assignments").update({ reminded_7d_at: new Date().toISOString() }).eq("id", a.id); }
    }
  }
  return out;
}
