// supabase/functions/clv-subscription/index.ts
// Company-account subscriptions (Free / Starter / Professional / Enterprise). A subscription is a contract
// between Clavoris – Van Beirs Consult BV and the holder of the company account, under the General Terms
// and Conditions. A company account without an active subscription is on the Free plan (see _shared/plans.ts).
//   { action: "list" }     -> { plans, subscriptions, companies }
//        subscriptions the caller can see:
//          - the active subscription of every company account the caller belongs to: the companies whose
//            data rooms the caller was invited to, and the caller's own company account (staff). Read-only:
//            a member cannot change the plan of a company account that invited them ("managed").
//          - the caller's own requests to subscribe a company account (requested / quote requested / active).
//        companies: for a company admin, their own company account with its plan, limits and current use.
//   { action: "request", plan, company_id?, company_name, registration_no?, country?, billing_email, message? }
//        -> records a request to subscribe a company account (Enterprise = request a quote). A company admin
//           passes company_id to change the plan of their own company. Confirms it to the caller by mail and
//           informs Clavoris (super admins, each in their own language). Clavoris activates it.
//   Super admin only:
//   { action: "admin_list" }                         -> every request and subscription, every company with plan and use
//   { action: "activate", id, make_admin? }          -> activates a request; a request for a new company creates the
//                                                       company account (and, with make_admin, makes the requester its
//                                                       administrator); any earlier active plan of that company ends
//   { action: "set_plan", company_id, plan }         -> puts a company account on a plan directly
//   { action: "cancel", id }                         -> ends a subscription or turns down a request
// Deploy: supabase functions deploy clv-subscription --no-verify-jwt
import { adminClient, APP_URL, audit, cors, isStaff, json, requireUser, sendMail } from "../_shared/clv.ts";
import { pickLang, type Lang } from "../_shared/mail-i18n.ts";
import { limitOf, planOf, usageOf } from "../_shared/plans.ts";

const PLAN_NAME: Record<string, string> = { free: "Free", starter: "Starter", professional: "Professional", enterprise: "Enterprise" };
const RECEIPT: Record<Lang, { s: string; t: string; quote: string; plan: string }> = {
  en: { s: "Clavoris: your subscription request — {plan}", plan: "We received your request to subscribe {company} to the {plan} plan.", quote: "We received your request for an Enterprise quote for {company}.", t: "Dear {name},\n\n{lead}\n\nClavoris reviews the request and contacts you to activate the subscription. You can follow its status on your account page under Subscriptions.\n\nThe subscription is a contract between Clavoris – Van Beirs Consult BV and {company}, under the General Terms and Conditions:\n{terms}" },
  nl: { s: "Clavoris: uw abonnementsaanvraag — {plan}", plan: "We ontvingen uw aanvraag om {company} te abonneren op het {plan}-plan.", quote: "We ontvingen uw aanvraag voor een Enterprise-offerte voor {company}.", t: "Beste {name},\n\n{lead}\n\nClavoris bekijkt de aanvraag en neemt contact met u op om het abonnement te activeren. U volgt de status op uw accountpagina onder Abonnementen.\n\nHet abonnement is een overeenkomst tussen Clavoris – Van Beirs Consult BV en {company}, onder de algemene voorwaarden:\n{terms}" },
  fr: { s: "Clavoris : votre demande d'abonnement — {plan}", plan: "Nous avons reçu votre demande d'abonnement de {company} au plan {plan}.", quote: "Nous avons reçu votre demande de devis Enterprise pour {company}.", t: "Cher/Chère {name},\n\n{lead}\n\nClavoris examine la demande et vous contacte pour activer l'abonnement. Vous suivez son statut sur votre page de compte, sous Abonnements.\n\nL'abonnement est un contrat entre Clavoris – Van Beirs Consult BV et {company}, régi par les conditions générales :\n{terms}" },
};
const STAFF: Record<Lang, { s: string; sq: string; t: string }> = {
  en: { s: "Clavoris: {plan} subscription request — {company}", sq: "Clavoris: Enterprise quote request — {company}", t: "A subscription request was made on Clavoris.\n\nPlan: {plan}\nCompany: {company}\nRegistration no.: {reg}\nCountry: {country}\nBilling e-mail: {billing}\nRequested by: {who}\nMessage: {msg}\n\nReview and activate it in the admin console, under Subscriptions:\n{link}" },
  nl: { s: "Clavoris: aanvraag {plan}-abonnement — {company}", sq: "Clavoris: aanvraag Enterprise-offerte — {company}", t: "Er werd een abonnementsaanvraag ingediend op Clavoris.\n\nPlan: {plan}\nOnderneming: {company}\nOndernemingsnummer: {reg}\nLand: {country}\nFacturatie-e-mail: {billing}\nAangevraagd door: {who}\nBericht: {msg}\n\nBekijk en activeer ze in de beheerconsole, onder Abonnementen:\n{link}" },
  fr: { s: "Clavoris : demande d'abonnement {plan} — {company}", sq: "Clavoris : demande de devis Enterprise — {company}", t: "Une demande d'abonnement a été introduite sur Clavoris.\n\nPlan : {plan}\nSociété : {company}\nNuméro d'entreprise : {reg}\nPays : {country}\nE-mail de facturation : {billing}\nDemandé par : {who}\nMessage : {msg}\n\nExaminez-la et activez-la dans la console d'administration, sous Abonnements :\n{link}" },
};
const ACTIVE: Record<Lang, { s: string; t: string }> = {
  en: { s: "Clavoris: the {plan} plan of {company} is active", t: "Dear {name},\n\nThe {plan} plan of {company} is now active on Clavoris.{admin}\n\nYou find the plan, its limits and the current use on your account page under Subscriptions:\n{link}" },
  nl: { s: "Clavoris: het {plan}-plan van {company} is actief", t: "Beste {name},\n\nHet {plan}-plan van {company} is nu actief op Clavoris.{admin}\n\nU vindt het plan, de limieten en het huidige gebruik op uw accountpagina onder Abonnementen:\n{link}" },
  fr: { s: "Clavoris : le plan {plan} de {company} est actif", t: "Cher/Chère {name},\n\nLe plan {plan} de {company} est désormais actif sur Clavoris.{admin}\n\nVous trouvez le plan, ses limites et l'utilisation actuelle sur votre page de compte, sous Abonnements :\n{link}" },
};
const ADMIN_LINE: Record<Lang, string> = {
  en: "\n\nYou are the administrator of this company account: the Admin menu lets you create data rooms and invite members.",
  nl: "\n\nU bent de beheerder van dit bedrijfsaccount: via het menu Beheer maakt u datarooms aan en nodigt u leden uit.",
  fr: "\n\nVous êtes l'administrateur de ce compte société : le menu Administration vous permet de créer des data rooms et d'inviter des membres.",
};
const clean = (v: unknown, max = 200) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
const fill = (s: string, v: Record<string, string>) => s.replace(/\{(\w+)\}/g, (_, k) => v[k] ?? "");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method" }, 405);
  const admin = adminClient();
  const me = await requireUser(admin, req);
  if (me instanceof Response) return me;
  const body = await req.json().catch(() => ({}));
  const action = String(body.action || "list");

  const { data: plans } = await admin.from("clv_plans").select("code, sort, price_month_eur, max_users, white_label, modules").order("sort");

  // A company account with its plan, limits and current use.
  async function companyView(id: string, name: string) {
    const [{ plan, subscription_id, since }, usage] = await Promise.all([planOf(admin, id), usageOf(admin, id)]);
    const limits: Record<string, number | null> = { data_rooms: limitOf(plan, "data_rooms"), contracts: limitOf(plan, "contracts"), marketplace: limitOf(plan, "marketplace"), portfolio: limitOf(plan, "portfolio"), users: limitOf(plan, "users") };
    return { id, name, plan: plan.code, subscription_id, since, white_label: plan.white_label, limits, usage };
  }

  if (action === "list") {
    // Company accounts the caller belongs to: rooms they were invited to + their own company account.
    const { data: asg } = await admin.from("clv_room_assignments").select("room:clv_rooms(company_id)").eq("user_id", me.id).is("revoked_at", null);
    const viaRooms = new Set((asg || []).map((a: any) => a.room?.company_id).filter(Boolean));
    const ids = new Set<string>(viaRooms as Set<string>); if (me.company_id) ids.add(me.company_id);
    const linked = ids.size ? (await admin.from("clv_plan_subscriptions").select("id, company_id, company_name, plan_code, status, created_at, activated_at, requested_by, company:clv_companies(name)").in("company_id", [...ids]).eq("status", "active")).data || [] : [];
    const own = (await admin.from("clv_plan_subscriptions").select("id, company_id, company_name, plan_code, status, created_at, activated_at, requested_by, company:clv_companies(name)").eq("requested_by", me.id).neq("status", "cancelled").order("created_at", { ascending: false })).data || [];
    const seen = new Set<string>();
    const subscriptions = [...linked, ...own].filter((s: any) => !seen.has(s.id) && seen.add(s.id)).map((s: any) => ({
      id: s.id, company_id: s.company_id, company: s.company?.name || s.company_name, plan: s.plan_code, status: s.status,
      since: s.activated_at || s.created_at,
      // Own request (the caller asked for it) versus a plan held by a company account that invited the caller.
      own: s.requested_by === me.id,
      managed: !(me.role === "admin" && s.company_id && s.company_id === me.company_id) && s.requested_by !== me.id,
      via: s.company_id && viaRooms.has(s.company_id) ? "rooms" : s.company_id && s.company_id === me.company_id ? "staff" : "own",
    }));
    // The company admin manages the plan of their own company account.
    const companies: any[] = [];
    if (isStaff(me) && me.company_id) {
      const { data: c } = await admin.from("clv_companies").select("id, name").eq("id", me.company_id).maybeSingle();
      if (c) companies.push(await companyView(c.id, c.name));
    }
    return json({ ok: true, plans: plans || [], subscriptions, companies, role: me.role });
  }

  if (action === "request") {
    const plan = String(body.plan || "");
    if (!(plans || []).some((p: any) => p.code === plan)) return json({ error: "bad-plan" }, 400);
    // A plan change for an existing company account: only by its own administrator.
    let companyId: string | null = null, company = clean(body.company_name, 160);
    if (body.company_id) {
      if (!(isStaff(me) && (me.role === "super" || String(body.company_id) === me.company_id))) return json({ error: "forbidden" }, 403);
      const { data: c } = await admin.from("clv_companies").select("id, name").eq("id", String(body.company_id)).maybeSingle();
      if (!c) return json({ error: "not-found" }, 404);
      companyId = c.id; company = c.name;
    }
    const billing = clean(body.billing_email, 200).toLowerCase();
    if (company.length < 2) return json({ error: "company-required" }, 400);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(billing)) return json({ error: "email-required" }, 400);
    // One open request per company per user.
    const { data: open } = await admin.from("clv_plan_subscriptions").select("id").eq("requested_by", me.id).ilike("company_name", company).in("status", ["requested", "quote_requested"]).limit(1);
    if (open && open.length) return json({ error: "already-requested" }, 400);
    const status = plan === "enterprise" ? "quote_requested" : "requested";
    const request = { registration_no: clean(body.registration_no, 40), country: clean(body.country, 2).toUpperCase(), billing_email: billing, message: clean(body.message, 1000), requested_by_email: me.email, requested_by_name: me.full_name };
    const { data: row, error } = await admin.from("clv_plan_subscriptions").insert({ company_id: companyId, company_name: company, plan_code: plan, status, requested_by: me.id, request }).select("id").single();
    if (error) return json({ error: error.message }, 400);
    await audit(admin, { id: me.id, email: me.email, role: me.role }, status === "quote_requested" ? "plan-quote-requested" : "plan-requested", row.id, { plan, company });
    // Mails are awaited: the function instance may stop as soon as the response is returned.
    const L = pickLang(me.lang), R = RECEIPT[L] || RECEIPT.en, planName = PLAN_NAME[plan];
    const lead = (status === "quote_requested" ? R.quote : R.plan).replace("{company}", company).replace("{plan}", planName);
    const terms = APP_URL.replace(/\/app$/, "") + "/terms.html";
    const sends: Promise<unknown>[] = [sendMail(me.email, R.s.replace("{plan}", planName), fill(R.t, { name: me.full_name || me.email, lead, company, terms }), L).catch((e) => console.error("plan receipt:", (e as Error).message))];
    const { data: supers } = await admin.from("clv_profiles").select("email, lang").eq("role", "super").neq("status", "suspended");
    for (const s of supers || []) {
      const SL = pickLang(s.lang), S = STAFF[SL];
      const v = { plan: planName, company, reg: request.registration_no || "—", country: request.country || "—", billing, who: `${me.full_name || "—"} <${me.email}>`, msg: request.message || "—", link: `${APP_URL}/admin.html#subscriptions` };
      sends.push(sendMail(s.email, fill(status === "quote_requested" ? S.sq : S.s, v), fill(S.t, v), SL).catch((e) => console.error("plan staff mail:", (e as Error).message)));
    }
    await Promise.all(sends);
    return json({ ok: true, status });
  }

  /* ---------------- Clavoris (super admin) ---------------- */
  if (me.role !== "super") return json({ error: "forbidden" }, 403);

  if (action === "admin_list") {
    const { data: subs } = await admin.from("clv_plan_subscriptions").select("id, company_id, company_name, plan_code, status, request, created_at, activated_at, requested_by, company:clv_companies(name)").order("created_at", { ascending: false }).limit(500);
    const { data: comps } = await admin.from("clv_companies").select("id, name").order("name");
    const companies = await Promise.all((comps || []).map((c: any) => companyView(c.id, c.name)));
    return json({ ok: true, plans: plans || [], companies, subscriptions: (subs || []).map((s: any) => ({ id: s.id, company_id: s.company_id, company: s.company?.name || s.company_name, plan: s.plan_code, status: s.status, request: s.request || {}, created_at: s.created_at, activated_at: s.activated_at, requested_by: s.requested_by })) });
  }

  async function activateRow(id: string, makeAdmin: boolean) {
    const { data: s } = await admin.from("clv_plan_subscriptions").select("*").eq("id", id).maybeSingle();
    if (!s) return { error: "not-found" };
    if (!["requested", "quote_requested"].includes(s.status)) return { error: "not-open" };
    const r = (s.request || {}) as Record<string, string>;
    let companyId = s.company_id as string | null;
    if (!companyId) {
      // A new company account, from the details given with the request.
      const { data: ex } = await admin.from("clv_companies").select("id").ilike("name", s.company_name).maybeSingle();
      if (ex) companyId = ex.id;
      else {
        const { data: c, error } = await admin.from("clv_companies").insert({ name: s.company_name, country: r.country || null, registration_no: r.registration_no || null, contact_email: r.billing_email || null, created_by: me.id }).select("id").single();
        if (error) return { error: error.message };
        companyId = c.id;
        await audit(admin, me, "company-created", s.company_name, { id: companyId, via: "subscription" });
      }
    }
    await admin.from("clv_plan_subscriptions").update({ status: "cancelled" }).eq("company_id", companyId).eq("status", "active");
    const { error: aErr } = await admin.from("clv_plan_subscriptions").update({ status: "active", company_id: companyId, activated_at: new Date().toISOString() }).eq("id", id);
    if (aErr) return { error: aErr.message };
    let madeAdmin = false;
    if (makeAdmin && s.requested_by) {
      const { data: p } = await admin.from("clv_profiles").select("role, company_id").eq("id", s.requested_by).maybeSingle();
      if (p && p.role === "user" && !p.company_id) { await admin.from("clv_profiles").update({ role: "admin", company_id: companyId }).eq("id", s.requested_by); madeAdmin = true; }
    }
    await audit(admin, me, "subscription-activated", s.company_name, { id, plan: s.plan_code, company_id: companyId, made_admin: madeAdmin });
    if (s.requested_by) {
      const { data: u } = await admin.from("clv_profiles").select("email, full_name, lang").eq("id", s.requested_by).maybeSingle();
      if (u?.email) {
        const L = pickLang(u.lang), M = ACTIVE[L];
        const v = { name: u.full_name || u.email, plan: PLAN_NAME[s.plan_code] || s.plan_code, company: s.company_name, admin: madeAdmin ? ADMIN_LINE[L] : "", link: `${APP_URL}/account.html#subs` };
        await sendMail(u.email, fill(M.s, v), fill(M.t, v), L).catch((e) => console.error("plan active mail:", (e as Error).message));
      }
    }
    return { ok: true, company_id: companyId, made_admin: madeAdmin };
  }

  if (action === "activate") {
    const r = await activateRow(String(body.id || ""), body.make_admin !== false);
    return "error" in r ? json(r, 400) : json(r);
  }

  if (action === "set_plan") {
    const companyId = String(body.company_id || ""), plan = String(body.plan || "");
    if (!(plans || []).some((p: any) => p.code === plan)) return json({ error: "bad-plan" }, 400);
    const { data: c } = await admin.from("clv_companies").select("id, name").eq("id", companyId).maybeSingle();
    if (!c) return json({ error: "not-found" }, 404);
    await admin.from("clv_plan_subscriptions").update({ status: "cancelled" }).eq("company_id", companyId).eq("status", "active");
    const { error } = await admin.from("clv_plan_subscriptions").insert({ company_id: companyId, company_name: c.name, plan_code: plan, status: "active", requested_by: null, request: { set_by: me.email }, activated_at: new Date().toISOString() });
    if (error) return json({ error: error.message }, 400);
    await audit(admin, me, "subscription-plan-set", c.name, { company_id: companyId, plan });
    return json({ ok: true });
  }

  if (action === "cancel") {
    const { data: s } = await admin.from("clv_plan_subscriptions").select("id, company_name, status").eq("id", String(body.id || "")).maybeSingle();
    if (!s) return json({ error: "not-found" }, 404);
    await admin.from("clv_plan_subscriptions").update({ status: "cancelled" }).eq("id", s.id);
    await audit(admin, me, "subscription-cancelled", s.company_name, { id: s.id, was: s.status });
    return json({ ok: true });
  }

  return json({ error: "bad-action" }, 400);
});
