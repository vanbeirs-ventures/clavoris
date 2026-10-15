// supabase/functions/clv-subscription/index.ts
// Company-account subscriptions (Free / Starter / Professional / Enterprise).
//   { action: "list" }     -> { plans, subscriptions }
//        subscriptions the caller can see:
//          - the active subscription of every company account the caller belongs to: the companies whose
//            data rooms the caller was invited to, and the caller's own company account (staff). Read-only:
//            a member cannot change the plan of a company account that invited them ("managed").
//          - the caller's own requests to subscribe a company account (requested / quote requested / active).
//   { action: "request", plan, company_name, registration_no?, country?, billing_email, message? }
//        -> records a request to subscribe the caller's own company account (Enterprise = request a quote),
//           confirms it to the caller by mail and informs Clavoris (super admins). Clavoris activates it.
// Deploy: supabase functions deploy clv-subscription --no-verify-jwt
import { adminClient, audit, cors, json, requireUser, sendMail } from "../_shared/clv.ts";
import { pickLang, type Lang } from "../_shared/mail-i18n.ts";

const PLAN_NAME: Record<string, string> = { free: "Free", starter: "Starter", professional: "Professional", enterprise: "Enterprise" };
const RECEIPT: Record<Lang, { s: string; t: string; quote: string; plan: string }> = {
  en: { s: "Clavoris: your subscription request — {plan}", plan: "We received your request to subscribe {company} to the {plan} plan.", quote: "We received your request for an Enterprise quote for {company}.", t: "Dear {name},\n\n{lead}\n\nClavoris reviews the request and contacts you to activate the subscription. You can follow its status on your account page under Subscriptions." },
  nl: { s: "Clavoris: uw abonnementsaanvraag — {plan}", plan: "We ontvingen uw aanvraag om {company} te abonneren op het {plan}-plan.", quote: "We ontvingen uw aanvraag voor een Enterprise-offerte voor {company}.", t: "Beste {name},\n\n{lead}\n\nClavoris bekijkt de aanvraag en neemt contact met u op om het abonnement te activeren. U volgt de status op uw accountpagina onder Abonnementen." },
  fr: { s: "Clavoris : votre demande d'abonnement — {plan}", plan: "Nous avons reçu votre demande d'abonnement de {company} au plan {plan}.", quote: "Nous avons reçu votre demande de devis Enterprise pour {company}.", t: "Cher/Chère {name},\n\n{lead}\n\nClavoris examine la demande et vous contacte pour activer l'abonnement. Vous suivez son statut sur votre page de compte, sous Abonnements." },
};
const clean = (v: unknown, max = 200) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method" }, 405);
  const admin = adminClient();
  const me = await requireUser(admin, req);
  if (me instanceof Response) return me;
  const body = await req.json().catch(() => ({}));
  const action = String(body.action || "list");

  const { data: plans } = await admin.from("clv_plans").select("code, sort, price_month_eur, max_users, white_label, modules").order("sort");

  if (action === "list") {
    // Company accounts the caller belongs to: rooms they were invited to + their own company account.
    const { data: asg } = await admin.from("clv_room_assignments").select("room:clv_rooms(company_id)").eq("user_id", me.id).is("revoked_at", null);
    const viaRooms = new Set((asg || []).map((a: any) => a.room?.company_id).filter(Boolean));
    const ids = new Set<string>(viaRooms as Set<string>); if (me.company_id) ids.add(me.company_id);
    const linked = ids.size ? (await admin.from("clv_plan_subscriptions").select("id, company_id, company_name, plan_code, status, created_at, activated_at, requested_by, company:clv_companies(name)").in("company_id", [...ids]).eq("status", "active")).data || [] : [];
    const own = (await admin.from("clv_plan_subscriptions").select("id, company_id, company_name, plan_code, status, created_at, activated_at, requested_by, company:clv_companies(name)").eq("requested_by", me.id).neq("status", "cancelled").order("created_at", { ascending: false })).data || [];
    const seen = new Set<string>();
    const subscriptions = [...linked, ...own].filter((s: any) => !seen.has(s.id) && seen.add(s.id)).map((s: any) => ({
      id: s.id, company: s.company?.name || s.company_name, plan: s.plan_code, status: s.status,
      since: s.activated_at || s.created_at,
      // Own request (the caller asked for it) versus a plan held by a company account that invited the caller.
      own: s.requested_by === me.id,
      managed: s.requested_by !== me.id,
      via: s.company_id && viaRooms.has(s.company_id) ? "rooms" : s.company_id && s.company_id === me.company_id ? "staff" : "own",
    }));
    return json({ ok: true, plans: plans || [], subscriptions });
  }

  if (action === "request") {
    const plan = String(body.plan || "");
    if (!(plans || []).some((p: any) => p.code === plan)) return json({ error: "bad-plan" }, 400);
    const company = clean(body.company_name, 160), billing = clean(body.billing_email, 200).toLowerCase();
    if (company.length < 2) return json({ error: "company-required" }, 400);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(billing)) return json({ error: "email-required" }, 400);
    // One open request per company name per user.
    const { data: open } = await admin.from("clv_plan_subscriptions").select("id").eq("requested_by", me.id).ilike("company_name", company).in("status", ["requested", "quote_requested"]).limit(1);
    if (open && open.length) return json({ error: "already-requested" }, 400);
    const status = plan === "enterprise" ? "quote_requested" : "requested";
    const request = { registration_no: clean(body.registration_no, 40), country: clean(body.country, 2).toUpperCase(), billing_email: billing, message: clean(body.message, 1000), requested_by_email: me.email, requested_by_name: me.full_name };
    const { data: row, error } = await admin.from("clv_plan_subscriptions").insert({ company_name: company, plan_code: plan, status, requested_by: me.id, request }).select("id").single();
    if (error) return json({ error: error.message }, 400);
    await audit(admin, { id: me.id, email: me.email, role: me.role }, status === "quote_requested" ? "plan-quote-requested" : "plan-requested", row.id, { plan, company });
    // Mails are awaited: the function instance may stop as soon as the response is returned.
    const L = pickLang(me.lang), R = RECEIPT[L] || RECEIPT.en, planName = PLAN_NAME[plan];
    const lead = (status === "quote_requested" ? R.quote : R.plan).replace("{company}", company).replace("{plan}", planName);
    const sends: Promise<unknown>[] = [sendMail(me.email, R.s.replace("{plan}", planName), R.t.replace("{name}", me.full_name || me.email).replace("{lead}", lead), L).catch((e) => console.error("plan receipt:", (e as Error).message))];
    const { data: supers } = await admin.from("clv_profiles").select("email").eq("role", "super").neq("status", "suspended");
    const staffText = `A subscription ${status === "quote_requested" ? "quote" : ""} request was made on Clavoris.\n\nPlan: ${planName}\nCompany: ${company}\nRegistration no.: ${request.registration_no || "—"}\nCountry: ${request.country || "—"}\nBilling e-mail: ${billing}\nRequested by: ${me.full_name || "—"} <${me.email}>\nMessage: ${request.message || "—"}\n\nThe request waits for activation (table clv_plan_subscriptions, id ${row.id}).`.replace("  ", " ");
    for (const s of supers || []) sends.push(sendMail(s.email, `Clavoris: ${status === "quote_requested" ? "Enterprise quote request" : planName + " subscription request"} — ${company}`, staffText, "en").catch((e) => console.error("plan staff mail:", (e as Error).message)));
    await Promise.all(sends);
    return json({ ok: true, status });
  }

  return json({ error: "bad-action" }, 400);
});
