// supabase/functions/clv-market/index.ts
// Marketplace & portfolio.
//   Investors (feature "market"): list / get products they are entitled to, open the full
//   documentation (audited per investor for prospectus-exemption compliance), download a
//   document (stamped PDF, SHA-256 recorded), subscribe at emission, and — with feature
//   "trading" on a product with secondary_enabled — list holdings for sale or buy a listing.
//   Portfolio: holdings per product with totals, coupon schedule and payments, executed
//   documentation (QES contracts) and issuer details.
//   Staff: product CRUD, subscriptions/listings settlement (which creates or moves holdings),
//   coupon payment records, and the per-product access audit with distinct-investor counts.
// Deploy: supabase functions deploy clv-market --no-verify-jwt
import { PDFDocument, StandardFonts, rgb } from "https://esm.sh/pdf-lib@1.17.1";
import { adminClient, APP_URL, audit, clientIp, cors, isStaff, json, type Profile, requireUser, sendMail } from "../_shared/clv.ts";
import { mail, pickLang } from "../_shared/mail-i18n.ts";
import { ncConfigured, ncGet, ncTree, sha256Hex } from "../_shared/nc.ts";

const PRODUCT_COLS = "id, code, name, type, status, issuer_name, issuer_id, issuer_country, issuer_description, isin, currency, nominal, min_units, total_units, coupon_rate, coupon_frequency, issue_date, first_coupon_date, maturity_date, subscription_opens, subscription_closes, description, highlights, nextcloud_folder, secondary_enabled, max_investors, created_at, updated_at";
const PERIODS: Record<string, number> = { annual: 1, semi: 2, quarterly: 4, monthly: 12, none: 0 };

type Product = Record<string, any>;
type Admin = ReturnType<typeof adminClient>;

function entitled(me: Profile, productId: string): boolean {
  if (isStaff(me)) return true;
  const f = me.features || {};
  if (!f.market) return false;
  return !f.products || f.products.includes(productId);
}
function canTrade(me: Profile, p: Product): boolean { return !isStaff(me) && !!me.features?.trading && !!p.secondary_enabled && entitled(me, p.id); }

async function logAccess(admin: Admin, me: Profile, productId: string, kind: string, req: Request, extra: Record<string, unknown> = {}) {
  if (isStaff(me)) return; // staff consultation is not an investor assessment
  await admin.from("clv_product_access").insert({ product_id: productId, user_id: me.id, kind, ip: clientIp(req), user_agent: req.headers.get("user-agent") || "", ...extra }).then(() => {}, () => {});
}

// Coupon schedule from the terms: dates from first_coupon_date (or issue_date + period) to maturity.
function schedule(p: Product): { due: string; rate_period: number }[] {
  const n = PERIODS[p.coupon_frequency] || 0;
  if (!n || !p.coupon_rate || !p.maturity_date) return [];
  const months = 12 / n;
  const start = new Date((p.first_coupon_date || p.issue_date || p.created_at).slice(0, 10) + "T00:00:00Z");
  if (!p.first_coupon_date) start.setUTCMonth(start.getUTCMonth() + months);
  const end = new Date(p.maturity_date + "T00:00:00Z");
  const out: { due: string; rate_period: number }[] = [];
  const d = new Date(start);
  for (let i = 0; i < 600 && d <= end; i++) { out.push({ due: d.toISOString().slice(0, 10), rate_period: Number(p.coupon_rate) / n }); d.setUTCMonth(d.getUTCMonth() + months); }
  if (!out.length || out[out.length - 1].due !== p.maturity_date) out.push({ due: p.maturity_date, rate_period: Number(p.coupon_rate) / n });
  return out;
}

async function holdingsOf(admin: Admin, userId: string, productId?: string) {
  let q = admin.from("clv_holdings").select("id, product_id, user_id, units, price_per_unit, source, subscription_id, listing_id, contract_id, acquired_at, note").eq("user_id", userId);
  if (productId) q = q.eq("product_id", productId);
  const { data } = await q.order("acquired_at");
  return data || [];
}
async function unitsHeld(admin: Admin, userId: string, productId: string): Promise<number> {
  const h = await holdingsOf(admin, userId, productId);
  return h.reduce((s: number, x: any) => s + Number(x.units), 0);
}
async function unitsListed(admin: Admin, userId: string, productId: string): Promise<number> {
  const { data } = await admin.from("clv_listings").select("units").eq("seller_id", userId).eq("product_id", productId).in("status", ["open", "matched"]);
  return (data || []).reduce((s: number, x: any) => s + Number(x.units), 0);
}
async function unitsSubscribed(admin: Admin, productId: string): Promise<number> {
  const { data } = await admin.from("clv_subscriptions").select("units").eq("product_id", productId).in("status", ["requested", "accepted", "settled"]);
  return (data || []).reduce((s: number, x: any) => s + Number(x.units), 0);
}
async function investorCounts(admin: Admin, productId: string) {
  const { data } = await admin.from("clv_product_access").select("user_id, kind").eq("product_id", productId);
  const viewed = new Set<string>(), assessed = new Set<string>();
  for (const r of data || []) { viewed.add(r.user_id); if (r.kind === "docs" || r.kind === "download") assessed.add(r.user_id); }
  const { data: h } = await admin.from("clv_holdings").select("user_id").eq("product_id", productId).gt("units", 0);
  const holders = new Set((h || []).map((x: any) => x.user_id));
  return { viewed: viewed.size, assessed: assessed.size, holders: holders.size };
}

async function stampPdf(bytes: Uint8Array, line: string): Promise<Uint8Array | null> {
  try {
    const pdf = await PDFDocument.load(bytes, { ignoreEncryption: true });
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    for (const page of pdf.getPages()) page.drawText(line, { x: 24, y: 14, size: 7.5, font, color: rgb(0.45, 0.45, 0.45) });
    return await pdf.save();
  } catch { return null; }
}

async function notifyStaff(admin: Admin, subject: string, text: string) {
  const { data } = await admin.from("clv_profiles").select("email, lang").in("role", ["admin", "super"]).neq("status", "suspended");
  for (const s of data || []) await sendMail(s.email, subject, text, pickLang(s.lang)).catch(() => false);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method" }, 405);
  const admin = adminClient();
  const me = await requireUser(admin, req);
  if (me instanceof Response) return me;
  const body = await req.json().catch(() => ({}));
  const action = String(body.action || "list");
  const staff = isStaff(me);
  const ip = clientIp(req);
  const L = pickLang(me.lang);

  /* ---------------- investor side ---------------- */
  if (action === "list") {
    if (!staff && !me.features?.market) return json({ error: "feature-off" }, 403);
    let q = admin.from("clv_products").select(PRODUCT_COLS).neq("status", "cancelled").order("created_at", { ascending: false });
    if (!staff && Array.isArray(me.features?.products)) q = q.in("id", me.features!.products!.length ? me.features!.products! : ["00000000-0000-0000-0000-000000000000"]);
    const { data: products } = await q;
    const mine = await holdingsOf(admin, me.id);
    const out = [];
    for (const p of products || []) {
      const units = mine.filter((h: any) => h.product_id === p.id).reduce((s: number, h: any) => s + Number(h.units), 0);
      const { count: open } = await admin.from("clv_listings").select("id", { count: "exact", head: true }).eq("product_id", p.id).eq("status", "open");
      out.push({ ...p, my_units: units, open_listings: open || 0, can_trade: canTrade(me, p), subscribed_units: staff ? await unitsSubscribed(admin, p.id) : undefined });
    }
    return json({ products: out, features: staff ? { market: true, trading: true } : me.features });
  }

  if (["get", "docs", "download", "subscribe", "list_sell", "buy", "cancel_listing"].includes(action)) {
    const id = String(body.id || body.product_id || "");
    const { data: p } = await admin.from("clv_products").select(PRODUCT_COLS).eq("id", id).maybeSingle();
    if (!p) return json({ error: "not-found" }, 404);
    if (!entitled(me, p.id)) return json({ error: "forbidden" }, 403);

    if (action === "get") {
      await logAccess(admin, me, p.id, "view", req);
      const holdings = await holdingsOf(admin, me.id, p.id);
      const myUnits = holdings.reduce((s: number, h: any) => s + Number(h.units), 0);
      const { data: listings } = await admin.from("clv_listings").select("id, seller_id, units, price_per_unit, status, created_at, buyer_id").eq("product_id", p.id).in("status", ["open", "matched"]).order("price_per_unit");
      const { data: subs } = await admin.from("clv_subscriptions").select("id, units, amount, status, created_at, settled_at, contract_id").eq("product_id", p.id).eq("user_id", me.id).order("created_at", { ascending: false });
      const sched = schedule(p);
      return json({
        product: p, my_units: myUnits, my_subscriptions: subs || [], holdings,
        listings: (listings || []).map((l: any) => ({ ...l, mine: l.seller_id === me.id, buying: l.buyer_id === me.id, seller_id: undefined, buyer_id: undefined })),
        can_trade: canTrade(me, p), can_subscribe: !staff && p.status === "open" && me.status === "verified", kyc_verified: me.status === "verified",
        units_subscribed: await unitsSubscribed(admin, p.id), next_coupon: sched.find((c) => c.due >= new Date().toISOString().slice(0, 10)) || null, coupons: sched.length,
        docs_available: !!p.nextcloud_folder && await ncConfigured(),
      });
    }

    if (action === "docs") {
      if (!p.nextcloud_folder) return json({ tree: [], note: "no-docs" });
      if (!(await ncConfigured())) return json({ error: "storage-not-configured" }, 503);
      let tree: any[] = [];
      try { tree = await ncTree(p.nextcloud_folder, 3); } catch (e) { return json({ error: "storage-unavailable", detail: (e as Error).message }, 502); }
      await logAccess(admin, me, p.id, "docs", req); // the investor has assessed the full documentation
      const root = p.nextcloud_folder.replace(/\/$/, "") + "/";
      return json({ tree: tree.map((e) => ({ name: e.name, path: e.path.startsWith(root) ? e.path.slice(root.length) : e.path, dir: e.dir, size: e.size, modified: e.modified })) });
    }

    if (action === "download") {
      if (!p.nextcloud_folder) return json({ error: "not-found" }, 404);
      const rel = String(body.path || "").replace(/^\/+/, "");
      if (!rel || rel.includes("..")) return json({ error: "bad-path" }, 400);
      let res: Response;
      try { res = await ncGet(`${p.nextcloud_folder}/${rel}`); } catch (e) { return json({ error: "file-unavailable", detail: (e as Error).message }, 404); }
      const source = new Uint8Array(await res.arrayBuffer());
      const name = rel.split("/").pop() || "document";
      let delivered = source;
      const now = new Date().toISOString().slice(0, 16).replace("T", " ");
      if (/\.pdf$/i.test(name) && !staff) {
        const stamped = await stampPdf(source, `Clavoris · ${p.code} ${p.name} · ${me.full_name || me.email} (${me.email}) · ${now} UTC · confidential, for the addressee only`);
        if (stamped) delivered = stamped;
      }
      const sha = await sha256Hex(delivered);
      await logAccess(admin, me, p.id, "download", req, { path: rel, sha256: sha });
      return new Response(delivered, { headers: { ...cors, "content-type": res.headers.get("content-type") || "application/octet-stream", "content-disposition": `attachment; filename="${name.replace(/"/g, "")}"`, "access-control-expose-headers": "content-disposition, x-clavoris-sha256", "x-clavoris-sha256": sha } });
    }

    if (action === "subscribe") {
      if (staff) return json({ error: "staff-cannot-subscribe" }, 400);
      if (me.status !== "verified") return json({ error: "kyc-required" }, 403);
      if (p.status !== "open") return json({ error: "not-open" }, 400);
      const units = Math.floor(Number(body.units || 0));
      if (!units || units < Number(p.min_units || 1)) return json({ error: "min-units", min: p.min_units }, 400);
      if (p.total_units && (await unitsSubscribed(admin, p.id)) + units > Number(p.total_units)) return json({ error: "oversubscribed" }, 400);
      // The investor must have assessed the documentation before subscribing (prospectus rule).
      const { count: seen } = await admin.from("clv_product_access").select("id", { count: "exact", head: true }).eq("product_id", p.id).eq("user_id", me.id).in("kind", ["docs", "download"]);
      if (!seen) return json({ error: "docs-not-assessed" }, 400);
      const amount = units * Number(p.nominal);
      const { data: sub, error } = await admin.from("clv_subscriptions").insert({ product_id: p.id, user_id: me.id, units, amount, note: String(body.note || "").slice(0, 500) || null, ip }).select("id").single();
      if (error) return json({ error: error.message }, 400);
      await logAccess(admin, me, p.id, "subscribe", req, { path: sub.id });
      const m = mail(L, "sub_received", { name: me.full_name || me.email, product: `${p.code} · ${p.name}`, units: String(units), amount: `${p.currency} ${amount.toFixed(2)}`, link: `${APP_URL}/portfolio.html` });
      await sendMail(me.email, m.subject, m.text, L).catch(() => false);
      await notifyStaff(admin, `[Clavoris] Subscription request · ${p.code}`, `${me.full_name || me.email} (${me.email}, ${me.company || "—"}) requests ${units} unit(s) of ${p.code} ${p.name} = ${p.currency} ${amount.toFixed(2)}.\n\nReview under Admin › Marketplace: ${APP_URL}/admin.html#market`);
      return json({ ok: true, id: sub.id, amount });
    }

    if (action === "list_sell") {
      if (!canTrade(me, p)) return json({ error: "trading-off" }, 403);
      if (me.status !== "verified") return json({ error: "kyc-required" }, 403);
      const units = Math.floor(Number(body.units || 0)), price = Number(body.price_per_unit || 0);
      if (!units || units < 1 || !(price > 0)) return json({ error: "bad-input" }, 400);
      const free = (await unitsHeld(admin, me.id, p.id)) - (await unitsListed(admin, me.id, p.id));
      if (units > free) return json({ error: "insufficient-units", free }, 400);
      const { data: l, error } = await admin.from("clv_listings").insert({ product_id: p.id, seller_id: me.id, units, price_per_unit: price }).select("id").single();
      if (error) return json({ error: error.message }, 400);
      await logAccess(admin, me, p.id, "list", req, { path: l.id });
      return json({ ok: true, id: l.id });
    }

    if (action === "cancel_listing") {
      const { data: l } = await admin.from("clv_listings").select("id, seller_id, status").eq("id", String(body.listing_id || "")).maybeSingle();
      if (!l || (l.seller_id !== me.id && !staff)) return json({ error: "forbidden" }, 403);
      if (l.status !== "open") return json({ error: "not-open" }, 400);
      await admin.from("clv_listings").update({ status: "cancelled", cancelled_at: new Date().toISOString() }).eq("id", l.id);
      return json({ ok: true });
    }

    if (action === "buy") {
      if (!canTrade(me, p)) return json({ error: "trading-off" }, 403);
      if (me.status !== "verified") return json({ error: "kyc-required" }, 403);
      const { count: seen } = await admin.from("clv_product_access").select("id", { count: "exact", head: true }).eq("product_id", p.id).eq("user_id", me.id).in("kind", ["docs", "download"]);
      if (!seen) return json({ error: "docs-not-assessed" }, 400);
      const { data: l } = await admin.from("clv_listings").select("id, seller_id, status, units, price_per_unit").eq("id", String(body.listing_id || "")).eq("product_id", p.id).maybeSingle();
      if (!l || l.status !== "open") return json({ error: "not-open" }, 400);
      if (l.seller_id === me.id) return json({ error: "own-listing" }, 400);
      const { data: upd } = await admin.from("clv_listings").update({ status: "matched", buyer_id: me.id, matched_at: new Date().toISOString() }).eq("id", l.id).eq("status", "open").select("id");
      if (!upd?.length) return json({ error: "not-open" }, 400);
      await logAccess(admin, me, p.id, "buy", req, { path: l.id });
      const { data: seller } = await admin.from("clv_profiles").select("email, full_name, lang").eq("id", l.seller_id).single();
      const total = `${p.currency} ${(Number(l.units) * Number(l.price_per_unit)).toFixed(2)}`;
      if (seller) { const sl = pickLang(seller.lang); const m = mail(sl, "listing_matched", { name: seller.full_name || seller.email, product: `${p.code} · ${p.name}`, units: String(l.units), amount: total, link: `${APP_URL}/portfolio.html` }); await sendMail(seller.email, m.subject, m.text, sl).catch(() => false); }
      const mb = mail(L, "buy_matched", { name: me.full_name || me.email, product: `${p.code} · ${p.name}`, units: String(l.units), amount: total, link: `${APP_URL}/portfolio.html` });
      await sendMail(me.email, mb.subject, mb.text, L).catch(() => false);
      await notifyStaff(admin, `[Clavoris] Secondary trade to settle · ${p.code}`, `${me.full_name || me.email} buys ${l.units} unit(s) of ${p.code} from ${seller?.full_name || seller?.email} at ${p.currency} ${Number(l.price_per_unit).toFixed(2)} (${total}).\n\nSettle under Admin › Marketplace: ${APP_URL}/admin.html#market`);
      return json({ ok: true });
    }
  }

  if (action === "portfolio") {
    const holdings = await holdingsOf(admin, me.id);
    const ids = [...new Set(holdings.map((h: any) => h.product_id))];
    const { data: subs } = await admin.from("clv_subscriptions").select("id, product_id, units, amount, status, created_at, settled_at, contract_id").eq("user_id", me.id).neq("status", "settled").in("status", ["requested", "accepted"]).order("created_at", { ascending: false });
    const { data: lst } = await admin.from("clv_listings").select("id, product_id, units, price_per_unit, status, created_at, seller_id, buyer_id, contract_id").or(`seller_id.eq.${me.id},buyer_id.eq.${me.id}`).in("status", ["open", "matched"]).order("created_at", { ascending: false });
    for (const s of subs || []) if (!ids.includes(s.product_id)) ids.push(s.product_id);
    for (const l of lst || []) if (!ids.includes(l.product_id)) ids.push(l.product_id);
    const { data: products } = ids.length ? await admin.from("clv_products").select(PRODUCT_COLS).in("id", ids) : { data: [] };
    const { data: pays } = await admin.from("clv_coupon_payments").select("product_id, due_date, amount, paid_at, reference").eq("user_id", me.id);
    const cids = [...new Set([...holdings, ...(subs || []), ...(lst || [])].map((x: any) => x.contract_id).filter(Boolean))];
    const { data: contracts } = cids.length ? await admin.from("clv_contracts").select("id, title, status, executed_at, original_name").in("id", cids) : { data: [] };
    const today = new Date().toISOString().slice(0, 10);
    const positions = (products || []).map((p: Product) => {
      const hs = holdings.filter((h: any) => h.product_id === p.id);
      const units = hs.reduce((s: number, h: any) => s + Number(h.units), 0);
      const cost = hs.reduce((s: number, h: any) => s + Number(h.units) * Number(h.price_per_unit), 0);
      const nominalValue = units * Number(p.nominal);
      const annual = p.coupon_rate ? nominalValue * Number(p.coupon_rate) / 100 : 0;
      const coupons = schedule(p).map((c) => {
        const paid = (pays || []).find((x: any) => x.product_id === p.id && x.due_date === c.due);
        return { due: c.due, amount: paid ? Number(paid.amount) : Math.round(nominalValue * c.rate_period) / 100, paid_at: paid?.paid_at || null, reference: paid?.reference || null, status: paid?.paid_at ? "paid" : c.due < today ? "due" : "scheduled" };
      });
      const received = coupons.filter((c) => c.paid_at).reduce((s, c) => s + c.amount, 0);
      const next = coupons.find((c) => !c.paid_at && c.due >= today) || null;
      return { product: p, units, cost, nominal_value: nominalValue, annual_coupon: annual, coupons_received: received, next_coupon: next, coupons, holdings: hs,
        pending_subscriptions: (subs || []).filter((s: any) => s.product_id === p.id), listings: (lst || []).filter((l: any) => l.product_id === p.id).map((l: any) => ({ ...l, side: l.seller_id === me.id ? "sell" : "buy", seller_id: undefined, buyer_id: undefined })),
        documents: (contracts || []).filter((c: any) => [...hs, ...(subs || []), ...(lst || [])].some((x: any) => x.contract_id === c.id)) };
    });
    const totals: Record<string, { nominal: number; cost: number; annual_coupon: number; received: number; positions: number }> = {};
    for (const x of positions) { const t = totals[x.product.currency] ||= { nominal: 0, cost: 0, annual_coupon: 0, received: 0, positions: 0 }; if (x.units > 0) { t.nominal += x.nominal_value; t.cost += x.cost; t.annual_coupon += x.annual_coupon; t.received += x.coupons_received; t.positions++; } }
    return json({ positions, totals, features: staff ? { market: true, trading: true } : me.features });
  }

  /* ---------------- staff side ---------------- */
  if (!staff) return json({ error: "forbidden" }, 403);
  const caller = { id: me.id, email: me.email, role: me.role };

  if (action === "admin_list") {
    const { data: products } = await admin.from("clv_products").select(PRODUCT_COLS).order("created_at", { ascending: false });
    const out = [];
    for (const p of products || []) {
      const { data: subs } = await admin.from("clv_subscriptions").select("units, status").eq("product_id", p.id);
      const { data: lst } = await admin.from("clv_listings").select("status").eq("product_id", p.id);
      out.push({ ...p, ...await investorCounts(admin, p.id), units_subscribed: (subs || []).filter((s: any) => s.status !== "cancelled" && s.status !== "rejected").reduce((s: number, x: any) => s + Number(x.units), 0),
        subs_requested: (subs || []).filter((s: any) => s.status === "requested").length, trades_to_settle: (lst || []).filter((l: any) => l.status === "matched").length, listings_open: (lst || []).filter((l: any) => l.status === "open").length });
    }
    return json({ products: out });
  }

  if (action === "admin_save") {
    const b = body.product || {};
    const str = (k: string, n = 200) => (b[k] == null ? null : String(b[k]).trim().slice(0, n) || null);
    const num = (k: string) => (b[k] === "" || b[k] == null ? null : Number(b[k]));
    const date = (k: string) => (b[k] && /^\d{4}-\d{2}-\d{2}$/.test(String(b[k])) ? String(b[k]) : null);
    const row: Record<string, unknown> = {
      code: str("code", 40), name: str("name"), type: ["private_bond", "sicav_share", "note", "other"].includes(b.type) ? b.type : "private_bond",
      status: ["upcoming", "open", "closed", "matured", "cancelled"].includes(b.status) ? b.status : "upcoming",
      issuer_name: str("issuer_name"), issuer_id: str("issuer_id", 80), issuer_country: str("issuer_country", 2), issuer_description: str("issuer_description", 4000),
      isin: str("isin", 20), currency: (str("currency", 3) || "EUR").toUpperCase(), nominal: num("nominal") ?? 1000, min_units: Math.max(1, Math.floor(num("min_units") ?? 1)), total_units: num("total_units"),
      coupon_rate: num("coupon_rate"), coupon_frequency: Object.keys(PERIODS).includes(b.coupon_frequency) ? b.coupon_frequency : "annual",
      issue_date: date("issue_date"), first_coupon_date: date("first_coupon_date"), maturity_date: date("maturity_date"), subscription_opens: date("subscription_opens"), subscription_closes: date("subscription_closes"),
      description: str("description", 8000), highlights: str("highlights", 2000), nextcloud_folder: str("nextcloud_folder", 500)?.replace(/^\/+|\/+$/g, "") || null,
      secondary_enabled: !!b.secondary_enabled, max_investors: num("max_investors"), updated_at: new Date().toISOString(),
    };
    if (!row.code || !row.name || !row.issuer_name) return json({ error: "code-name-issuer-required" }, 400);
    let res;
    if (b.id) res = await admin.from("clv_products").update(row).eq("id", String(b.id)).select("id").single();
    else res = await admin.from("clv_products").insert({ ...row, created_by: me.id }).select("id").single();
    if (res.error) return json({ error: res.error.message }, 400);
    await audit(admin, caller, b.id ? "product-updated" : "product-created", String(row.code), { id: res.data.id, status: row.status });
    return json({ ok: true, id: res.data.id });
  }

  if (action === "admin_product") {
    const id = String(body.id || "");
    const { data: p } = await admin.from("clv_products").select(PRODUCT_COLS).eq("id", id).maybeSingle();
    if (!p) return json({ error: "not-found" }, 404);
    const prof = "profile:clv_profiles!";
    const { data: subs } = await admin.from("clv_subscriptions").select(`id, units, amount, status, created_at, settled_at, contract_id, user_id, ${prof}clv_subscriptions_user_id_fkey(full_name, email, company)`).eq("product_id", id).order("created_at", { ascending: false });
    const { data: lst } = await admin.from("clv_listings").select(`id, units, price_per_unit, status, created_at, matched_at, settled_at, contract_id, seller_id, buyer_id, seller:clv_profiles!clv_listings_seller_id_fkey(full_name, email), buyer:clv_profiles!clv_listings_buyer_id_fkey(full_name, email)`).eq("product_id", id).order("created_at", { ascending: false });
    const { data: hold } = await admin.from("clv_holdings").select(`user_id, units, price_per_unit, source, acquired_at, ${prof}clv_holdings_user_id_fkey(full_name, email, company)`).eq("product_id", id);
    const { data: acc } = await admin.from("clv_product_access").select(`user_id, kind, path, sha256, ip, ts, ${prof}clv_product_access_user_id_fkey(full_name, email, company)`).eq("product_id", id).order("ts", { ascending: false }).limit(1000);
    // Per-investor assessment summary (first/last documentation access, downloads) for the compliance file.
    const byUser: Record<string, any> = {};
    for (const a of acc || []) {
      const u = byUser[a.user_id] ||= { user_id: a.user_id, name: a.profile?.full_name, email: a.profile?.email, company: a.profile?.company, first: a.ts, last: a.ts, views: 0, docs: 0, downloads: 0, files: new Set<string>() };
      if (a.ts < u.first) u.first = a.ts; if (a.ts > u.last) u.last = a.ts;
      if (a.kind === "view") u.views++; if (a.kind === "docs") u.docs++; if (a.kind === "download") { u.downloads++; if (a.path) u.files.add(a.path); }
    }
    const investors = Object.values(byUser).map((u: any) => ({ ...u, files: [...u.files], assessed: u.docs + u.downloads > 0 }));
    const holders: Record<string, any> = {};
    for (const h of hold || []) { const x = holders[h.user_id] ||= { user_id: h.user_id, name: h.profile?.full_name, email: h.profile?.email, company: h.profile?.company, units: 0 }; x.units += Number(h.units); }
    const { data: pays } = await admin.from("clv_coupon_payments").select("user_id, due_date, amount, paid_at, reference").eq("product_id", id);
    return json({ product: p, counts: await investorCounts(admin, id), subscriptions: subs || [], listings: lst || [], holders: Object.values(holders).filter((h: any) => h.units > 0), investors, access: (acc || []).slice(0, 300), coupon_schedule: schedule(p), payments: pays || [] });
  }

  if (action === "admin_subscription") {
    const { data: s } = await admin.from("clv_subscriptions").select("id, product_id, user_id, units, amount, status, contract_id").eq("id", String(body.id || "")).maybeSingle();
    if (!s) return json({ error: "not-found" }, 404);
    const to = String(body.status || "");
    const now = new Date().toISOString();
    const patch: Record<string, unknown> = { status: to };
    if (body.contract_id !== undefined) patch.contract_id = body.contract_id || null;
    if (to === "accepted") patch.accepted_at = now;
    if (to === "settled") { if (s.status === "settled") return json({ error: "already-settled" }, 400); patch.settled_at = now; }
    if (to === "cancelled" || to === "rejected") patch.closed_at = now;
    if (!["accepted", "settled", "cancelled", "rejected"].includes(to)) return json({ error: "bad-status" }, 400);
    const { error } = await admin.from("clv_subscriptions").update(patch).eq("id", s.id);
    if (error) return json({ error: error.message }, 400);
    const { data: p } = await admin.from("clv_products").select("id, code, name, nominal, currency").eq("id", s.product_id).single();
    if (to === "settled") {
      await admin.from("clv_holdings").insert({ product_id: s.product_id, user_id: s.user_id, units: s.units, price_per_unit: Number(s.amount) / Number(s.units), source: "subscription", subscription_id: s.id, contract_id: (patch.contract_id as string) || s.contract_id || null });
      const { data: u } = await admin.from("clv_profiles").select("email, full_name, lang").eq("id", s.user_id).single();
      if (u) { const ul = pickLang(u.lang); const m = mail(ul, "sub_settled", { name: u.full_name || u.email, product: `${p.code} · ${p.name}`, units: String(s.units), amount: `${p.currency} ${Number(s.amount).toFixed(2)}`, link: `${APP_URL}/portfolio.html` }); await sendMail(u.email, m.subject, m.text, ul).catch(() => false); }
    }
    await audit(admin, caller, "subscription-" + to, s.id, { product: p?.code, user_id: s.user_id, units: s.units });
    return json({ ok: true });
  }

  if (action === "admin_listing") {
    const { data: l } = await admin.from("clv_listings").select("id, product_id, seller_id, buyer_id, units, price_per_unit, status, contract_id").eq("id", String(body.id || "")).maybeSingle();
    if (!l) return json({ error: "not-found" }, 404);
    const to = String(body.status || "");
    const now = new Date().toISOString();
    if (to === "cancelled") { await admin.from("clv_listings").update({ status: "cancelled", cancelled_at: now }).eq("id", l.id); return json({ ok: true }); }
    if (to !== "settled") return json({ error: "bad-status" }, 400);
    if (l.status !== "matched" || !l.buyer_id) return json({ error: "not-matched" }, 400);
    const held = await unitsHeld(admin, l.seller_id, l.product_id);
    if (held < Number(l.units)) return json({ error: "seller-insufficient", held }, 400);
    const contract = body.contract_id || l.contract_id || null;
    // Move units: negative holding row for the seller, positive for the buyer (full history kept).
    await admin.from("clv_holdings").insert([
      { product_id: l.product_id, user_id: l.seller_id, units: 0, price_per_unit: l.price_per_unit, source: "secondary", listing_id: l.id, contract_id: contract, note: `sold ${l.units}` },
      { product_id: l.product_id, user_id: l.buyer_id, units: l.units, price_per_unit: l.price_per_unit, source: "secondary", listing_id: l.id, contract_id: contract },
    ]);
    // Reduce the seller's units on their earliest holdings (FIFO).
    let left = Number(l.units);
    for (const h of await holdingsOf(admin, l.seller_id, l.product_id)) {
      if (left <= 0) break; const take = Math.min(left, Number(h.units)); if (!take) continue;
      await admin.from("clv_holdings").update({ units: Number(h.units) - take }).eq("id", h.id); left -= take;
    }
    await admin.from("clv_listings").update({ status: "settled", settled_at: now, contract_id: contract }).eq("id", l.id);
    const { data: p } = await admin.from("clv_products").select("code, name, currency").eq("id", l.product_id).single();
    for (const uid of [l.seller_id, l.buyer_id]) {
      const { data: u } = await admin.from("clv_profiles").select("email, full_name, lang").eq("id", uid).single();
      if (u) { const ul = pickLang(u.lang); const m = mail(ul, "trade_settled", { name: u.full_name || u.email, product: `${p.code} · ${p.name}`, units: String(l.units), amount: `${p.currency} ${(Number(l.units) * Number(l.price_per_unit)).toFixed(2)}`, link: `${APP_URL}/portfolio.html` }); await sendMail(u.email, m.subject, m.text, ul).catch(() => false); }
    }
    await audit(admin, caller, "trade-settled", l.id, { product: p?.code, units: l.units, price: l.price_per_unit });
    return json({ ok: true });
  }

  if (action === "admin_coupon") {
    // Record a coupon payment for one holder or for all holders on a due date.
    const productId = String(body.product_id || ""), due = String(body.due_date || "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(due)) return json({ error: "bad-date" }, 400);
    const { data: p } = await admin.from("clv_products").select(PRODUCT_COLS).eq("id", productId).maybeSingle();
    if (!p) return json({ error: "not-found" }, 404);
    const sc = schedule(p).find((c) => c.due === due);
    if (!sc) return json({ error: "not-in-schedule" }, 400);
    const { data: hold } = await admin.from("clv_holdings").select("user_id, units").eq("product_id", productId);
    const per: Record<string, number> = {};
    for (const h of hold || []) per[h.user_id] = (per[h.user_id] || 0) + Number(h.units);
    const targets = body.user_id ? [String(body.user_id)] : Object.keys(per).filter((u) => per[u] > 0);
    const rows = targets.map((u) => ({ product_id: productId, user_id: u, due_date: due, amount: body.amount != null && body.user_id ? Number(body.amount) : Math.round((per[u] || 0) * Number(p.nominal) * sc.rate_period) / 100, paid_at: body.paid === false ? null : new Date().toISOString(), reference: String(body.reference || "").slice(0, 120) || null, created_by: me.id }));
    const { error } = await admin.from("clv_coupon_payments").upsert(rows, { onConflict: "product_id,user_id,due_date" });
    if (error) return json({ error: error.message }, 400);
    await audit(admin, caller, "coupon-recorded", p.code, { due, holders: rows.length, total: rows.reduce((s, r) => s + r.amount, 0) });
    return json({ ok: true, recorded: rows.length });
  }

  if (action === "admin_delete") {
    const id = String(body.id || "");
    const { count } = await admin.from("clv_holdings").select("id", { count: "exact", head: true }).eq("product_id", id);
    if (count) return json({ error: "has-holdings" }, 400);
    await admin.from("clv_products").delete().eq("id", id);
    await audit(admin, caller, "product-deleted", id);
    return json({ ok: true });
  }

  return json({ error: "unknown-action" }, 400);
});
