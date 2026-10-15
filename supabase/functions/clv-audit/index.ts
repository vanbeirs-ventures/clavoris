// supabase/functions/clv-audit/index.ts
// Audit trail.
//   { action: "login" }  -> records a successful sign-in (IP address and user agent taken server-side)
//   { action: "users" }  -> staff: the users whose trail the caller may read (super: everyone; company admin:
//                           the members of the company's data rooms and the company's own staff)
//   { action: "list", user_id?, kind?, date? }
//        -> the timeline, newest first, in the caller's language. Without user_id: the caller's own trail.
//           Staff may pass a user_id from "users", or "all" for every user in scope. kind filters on one
//           event kind (login, kyc, nda, view, download, room, account, admin); date (YYYY-MM-DD, UTC) on one day.
// Sources: sign-ins, identity verification (Didit sessions and results; historical Sumsub results), NDA
// signatures, data-room visits, documents read and downloaded (type, fingerprint, watermark), and the
// actions recorded in clv_audit (account, terms, data-room membership, administration).
// Deploy: supabase functions deploy clv-audit --no-verify-jwt
import { adminClient, clientIp, cors, isStaff, json, requireUser } from "../_shared/clv.ts";
import { pickLang, type Lang } from "../_shared/mail-i18n.ts";

type Ev = { ts: string; kind: string; title: string; detail: string; room?: string | null; ref?: string | null; sha?: string | null; ip?: string | null; user?: string | null };

const ext = (name: string) => { const m = /\.([a-z0-9]+)$/i.exec(name || ""); return m ? m[1].toUpperCase() : "file"; };
const fill = (s: string, v: Record<string, string> = {}) => s.replace(/\{(\w+)\}/g, (_, k) => v[k] ?? "");

// Texts of the timeline. {x} placeholders are filled per event.
const T: Record<Lang, Record<string, string>> = {
  en: {
    login: "Signed in", login_d: "Sign-in to the Clavoris portal",
    kyc_start: "Identity verification started", kyc_start_d: "Verification session opened",
    kyc_ok: "Identity verification approved", kyc_ok_d: "Didit review (AMLD6){doc}",
    kyc_no: "Identity verification not successful", kyc_no_d: "Didit review · another attempt is possible{c}",
    kyc_open: "Identity verification not completed", kyc_open_d: "Didit session {s} · can be restarted",
    kyc_exp: "Identity verification expired", kyc_exp_d: "Validity lapsed · a new verification is required",
    kyc_rev: "Identity documents submitted", kyc_rev_d: "Didit review pending",
    kyc_old: "Identity verification {a}", kyc_old_d: "Sumsub review (AMLD6){l}",
    nda: "NDA signed", nda_d: "KYC-attested electronic signature{f}", nda_file: " · signed copy stored as PDF",
    nda_dl: "Downloaded your signed NDA", nda_dl_d: "PDF · signed copy",
    view: "Read {f}", view_d: "Opened in the browser · watermarked · identity, time and IP recorded",
    dl: "Downloaded {f}", dl_wm: "visible watermark on every page", dl_ref: "download reference in file name",
    dl_qes: "qualified e-signatures embedded (PAdES)", dl_orig: "contract original, unsigned", dl_rec: "identity, time and IP recorded",
    room: "Opened data room", room_d: "Data-room visit", contract: "Contract",
  },
  nl: {
    login: "Aangemeld", login_d: "Aanmelding op het Clavoris-portaal",
    kyc_start: "Identiteitsverificatie gestart", kyc_start_d: "Verificatiesessie geopend",
    kyc_ok: "Identiteitsverificatie goedgekeurd", kyc_ok_d: "Beoordeling door Didit (AMLD6){doc}",
    kyc_no: "Identiteitsverificatie niet geslaagd", kyc_no_d: "Beoordeling door Didit · een nieuwe poging is mogelijk{c}",
    kyc_open: "Identiteitsverificatie niet voltooid", kyc_open_d: "Didit-sessie {s} · kan opnieuw worden gestart",
    kyc_exp: "Identiteitsverificatie verlopen", kyc_exp_d: "Geldigheid verstreken · een nieuwe verificatie is vereist",
    kyc_rev: "Identiteitsdocumenten ingediend", kyc_rev_d: "Beoordeling door Didit loopt",
    kyc_old: "Identiteitsverificatie {a}", kyc_old_d: "Beoordeling door Sumsub (AMLD6){l}",
    nda: "NDA ondertekend", nda_d: "Elektronische handtekening na KYC{f}", nda_file: " · ondertekende kopie bewaard als pdf",
    nda_dl: "Uw ondertekende NDA gedownload", nda_dl_d: "Pdf · ondertekende kopie",
    view: "{f} gelezen", view_d: "Geopend in de browser · met watermerk · identiteit, tijdstip en IP vastgelegd",
    dl: "{f} gedownload", dl_wm: "zichtbaar watermerk op elke pagina", dl_ref: "downloadreferentie in de bestandsnaam",
    dl_qes: "gekwalificeerde e-handtekeningen ingebed (PAdES)", dl_orig: "origineel contract, niet ondertekend", dl_rec: "identiteit, tijdstip en IP vastgelegd",
    room: "Dataroom geopend", room_d: "Bezoek aan de dataroom", contract: "Contract",
  },
  fr: {
    login: "Connexion", login_d: "Connexion au portail Clavoris",
    kyc_start: "Vérification d'identité commencée", kyc_start_d: "Session de vérification ouverte",
    kyc_ok: "Vérification d'identité approuvée", kyc_ok_d: "Examen par Didit (AMLD6){doc}",
    kyc_no: "Vérification d'identité non réussie", kyc_no_d: "Examen par Didit · une nouvelle tentative est possible{c}",
    kyc_open: "Vérification d'identité non terminée", kyc_open_d: "Session Didit {s} · peut être relancée",
    kyc_exp: "Vérification d'identité expirée", kyc_exp_d: "Validité échue · une nouvelle vérification est requise",
    kyc_rev: "Documents d'identité transmis", kyc_rev_d: "Examen par Didit en cours",
    kyc_old: "Vérification d'identité {a}", kyc_old_d: "Examen par Sumsub (AMLD6){l}",
    nda: "NDA signé", nda_d: "Signature électronique après KYC{f}", nda_file: " · copie signée conservée en PDF",
    nda_dl: "Votre NDA signé téléchargé", nda_dl_d: "PDF · copie signée",
    view: "{f} consulté", view_d: "Ouvert dans le navigateur · filigrané · identité, heure et IP enregistrées",
    dl: "{f} téléchargé", dl_wm: "filigrane visible sur chaque page", dl_ref: "référence de téléchargement dans le nom du fichier",
    dl_qes: "signatures électroniques qualifiées intégrées (PAdES)", dl_orig: "contrat original, non signé", dl_rec: "identité, heure et IP enregistrées",
    room: "Data room ouverte", room_d: "Visite de la data room", contract: "Contrat",
  },
};
// Actions recorded in clv_audit: [kind, en, nl, fr].
const ACT: Record<string, [string, string, string, string]> = {
  "terms-accepted": ["account", "General Terms and Conditions accepted", "Algemene voorwaarden aanvaard", "Conditions générales acceptées"],
  "password-changed": ["account", "Password changed", "Wachtwoord gewijzigd", "Mot de passe modifié"],
  "mfa-passed": ["login", "Second factor confirmed", "Tweede factor bevestigd", "Second facteur confirmé"],
  "mfa-failed": ["login", "Second factor failed", "Tweede factor mislukt", "Échec du second facteur"],
  "mfa-exempted": ["admin", "Second factor exemption set", "Vrijstelling tweede factor ingesteld", "Exemption du second facteur définie"],
  "room-left": ["room", "Left a data room", "Dataroom verlaten", "Data room quittée"],
  "access-extension-requested": ["room", "Longer access requested", "Langere toegang gevraagd", "Prolongation d'accès demandée"],
  "account-deleted": ["account", "Account closed", "Account afgesloten", "Compte clôturé"],
  "plan-requested": ["account", "Subscription requested", "Abonnement aangevraagd", "Abonnement demandé"],
  "plan-quote-requested": ["account", "Enterprise quote requested", "Enterprise-offerte gevraagd", "Devis Enterprise demandé"],
  "room-access-granted": ["admin", "Member invited to a data room", "Lid uitgenodigd in een dataroom", "Membre invité dans une data room"],
  "room-access-revoked": ["admin", "Data-room access revoked", "Toegang tot dataroom ingetrokken", "Accès à la data room révoqué"],
  "room-access-reactivated": ["admin", "Data-room access reactivated", "Toegang tot dataroom heractiveerd", "Accès à la data room réactivé"],
  "room-reminder-sent": ["admin", "Reminder sent to a member", "Herinnering verstuurd aan een lid", "Rappel envoyé à un membre"],
  "room-expiry-changed": ["admin", "Access end date changed", "Einddatum toegang gewijzigd", "Date de fin d'accès modifiée"],
  "access-extended": ["admin", "Access extension accepted", "Verlenging van toegang aanvaard", "Prolongation d'accès acceptée"],
  "access-extension-rejected": ["admin", "Access extension refused", "Verlenging van toegang geweigerd", "Prolongation d'accès refusée"],
  "room-answerer-added": ["admin", "Member tagged to answer questions", "Lid aangeduid om vragen te beantwoorden", "Membre désigné pour répondre aux questions"],
  "room-answerer-removed": ["admin", "Answer tag removed", "Aanduiding voor antwoorden verwijderd", "Désignation pour les réponses retirée"],
  "room-created": ["admin", "Data room created", "Dataroom aangemaakt", "Data room créée"],
  "room-updated": ["admin", "Data room updated", "Dataroom bijgewerkt", "Data room mise à jour"],
  "room-document-uploaded": ["admin", "Document uploaded", "Document opgeladen", "Document chargé"],
  "room-document-deleted": ["admin", "Document deleted", "Document verwijderd", "Document supprimé"],
  "user-created": ["admin", "User created", "Gebruiker aangemaakt", "Utilisateur créé"],
  "user-updated": ["admin", "User updated", "Gebruiker bijgewerkt", "Utilisateur mis à jour"],
  "admin-created": ["admin", "Administrator created", "Beheerder aangemaakt", "Administrateur créé"],
  "company-created": ["admin", "Company account created", "Bedrijfsaccount aangemaakt", "Compte société créé"],
  "company-updated": ["admin", "Company details updated", "Bedrijfsgegevens bijgewerkt", "Données de la société mises à jour"],
  "nextcloud-connected": ["admin", "Document storage connected", "Documentopslag gekoppeld", "Stockage de documents connecté"],
  "nextcloud-disconnected": ["admin", "Document storage disconnected", "Documentopslag ontkoppeld", "Stockage de documents déconnecté"],
  "contract-created": ["admin", "Contract created", "Contract aangemaakt", "Contrat créé"],
  "product-created": ["admin", "Product created", "Product aangemaakt", "Produit créé"],
  "product-updated": ["admin", "Product updated", "Product bijgewerkt", "Produit mis à jour"],
};
const LI: Record<Lang, number> = { en: 1, nl: 2, fr: 3 };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method" }, 405);
  const admin = adminClient();
  const me = await requireUser(admin, req);
  if (me instanceof Response) return me;
  const body = await req.json().catch(() => ({}));
  const action = String(body.action || "list");
  const ip = clientIp(req), ua = req.headers.get("user-agent") || "";
  const L = pickLang(me.lang), t = T[L];

  if (action === "login") {
    await admin.from("clv_profiles").update({ last_login_at: new Date().toISOString() }).eq("id", me.id).then(() => {}, (e: Error) => console.error("clv-audit last_login:", e.message));
    const { error } = await admin.from("clv_access_log").insert({ user_id: me.id, action: "login", ip, user_agent: ua });
    if (error) console.error("clv-audit login:", error.message);
    return json({ ok: true });
  }

  // Users in scope for staff: super = everyone; company admin = members of the company's rooms + company staff.
  async function scopeUsers(): Promise<{ id: string; name: string; email: string }[]> {
    let ids: string[] | null = null;
    if (me.role !== "super") {
      const { data: rooms } = await admin.from("clv_rooms").select("id").eq("company_id", me.company_id || "00000000-0000-0000-0000-000000000000");
      const rids = (rooms || []).map((r: any) => r.id);
      const { data: asg } = rids.length ? await admin.from("clv_room_assignments").select("user_id").in("room_id", rids) : { data: [] as any[] };
      const { data: staff } = await admin.from("clv_profiles").select("id").eq("company_id", me.company_id || "00000000-0000-0000-0000-000000000000");
      ids = [...new Set([me.id, ...(asg || []).map((a: any) => a.user_id), ...(staff || []).map((s: any) => s.id)])];
    }
    let q = admin.from("clv_profiles").select("id, email, full_name, deleted_at").is("deleted_at", null).order("full_name", { ascending: true }).limit(2000);
    if (ids) q = q.in("id", ids);
    const { data } = await q;
    return (data || []).map((p: any) => ({ id: p.id, name: p.full_name || "", email: p.email || "" }));
  }

  if (action === "users") {
    if (!isStaff(me)) return json({ error: "forbidden" }, 403);
    return json({ ok: true, users: await scopeUsers() });
  }
  if (action !== "list") return json({ error: "bad-action" }, 400);

  // Whose trail: one's own; staff may read a user in scope, or all of them.
  let userIds = [me.id], names: Record<string, string> = {};
  const wanted = String(body.user_id || "");
  if (wanted && wanted !== me.id) {
    if (!isStaff(me)) return json({ error: "forbidden" }, 403);
    const scope = await scopeUsers();
    names = Object.fromEntries(scope.map((u) => [u.id, u.name ? `${u.name} (${u.email})` : u.email]));
    if (wanted === "all") userIds = scope.map((u) => u.id);
    else if (names[wanted]) userIds = [wanted];
    else return json({ error: "forbidden" }, 403);
  }
  const many = userIds.length > 1;
  const kind = String(body.kind || "");
  const day = /^\d{4}-\d{2}-\d{2}$/.test(String(body.date || "")) ? String(body.date) : "";
  const from = day ? day + "T00:00:00.000Z" : null, to = day ? day + "T23:59:59.999Z" : null;
  const limit = Math.min(Number(body.limit || 500), 1000);
  const win = (q: any, col: string) => (from ? q.gte(col, from).lte(col, to) : q);
  const ids = userIds.slice(0, 2000);

  const [logs, dls, kyc, didit, acts, rooms] = await Promise.all([
    win(admin.from("clv_access_log").select("ts, user_id, action, file_path, room_id, ip").in("user_id", ids).in("action", ["login", "kyc-start", "nda-signed", "download-nda", "view", "download", "room-view"]), "ts").order("ts", { ascending: false }).limit(limit * 2),
    win(admin.from("clv_downloads").select("created_at, user_id, code, file_name, file_path, delivered_as, sha256_delivered, watermark, room_id, contract_id, contract:clv_contracts(title), ip").in("user_id", ids), "created_at").order("created_at", { ascending: false }).limit(limit),
    win(admin.from("clv_sumsub_events").select("received_at, external_user_id, type, review_answer, payload").in("external_user_id", ids), "received_at").order("received_at", { ascending: false }).limit(limit),
    win(admin.from("clv_kyc_events").select("received_at, user_id, webhook_type, status, session_id, payload").in("user_id", ids), "received_at").order("received_at", { ascending: false }).limit(limit),
    win(admin.from("clv_audit").select("created_at, actor, event_type, target, detail").in("actor", ids), "created_at").order("created_at", { ascending: false }).limit(limit),
    admin.from("clv_rooms").select("id, name, slug"),
  ]);
  const roomName = new Map<string, string>((rooms.data || []).map((r: any) => [r.id, r.name]));
  const roomBySlug = new Map<string, string>((rooms.data || []).map((r: any) => [r.slug, r.name]));
  const who = (id: string) => (many || wanted ? names[id] || null : null);
  const out: Ev[] = [];

  // Downloads recorded with fingerprint and watermark (clv_downloads); the access log is used for the rest.
  const dlKeys = new Set((dls.data || []).map((d: any) => `${d.user_id}|${d.file_path}|${String(d.created_at).slice(0, 15)}`));
  for (const l of logs.data || []) {
    const room = l.room_id ? roomName.get(l.room_id) || null : null, f = String(l.file_path || "").split("/").pop() || "";
    const base = { ts: l.ts, ip: l.ip, room, user: who(l.user_id) };
    if (l.action === "login") out.push({ ...base, kind: "login", title: t.login, detail: t.login_d });
    else if (l.action === "kyc-start") out.push({ ...base, kind: "kyc", title: t.kyc_start, detail: t.kyc_start_d });
    else if (l.action === "nda-signed") out.push({ ...base, kind: "nda", title: t.nda, detail: fill(t.nda_d, { f: l.file_path ? t.nda_file : "" }) });
    else if (l.action === "download-nda") out.push({ ...base, kind: "download", title: t.nda_dl, detail: t.nda_dl_d });
    else if (l.action === "view") out.push({ ...base, kind: "view", title: fill(t.view, { f }), detail: t.view_d });
    else if (l.action === "room-view") out.push({ ...base, kind: "room", title: t.room, detail: t.room_d });
    else if (l.action === "download" && !dlKeys.has(`${l.user_id}|${l.file_path}|${String(l.ts).slice(0, 15)}`)) out.push({ ...base, kind: "download", title: fill(t.dl, { f }), detail: `${ext(f)} · ${t.dl_wm} · ${t.dl_rec}` });
  }
  for (const d of dls.data || []) {
    const wm = (d.watermark || {}) as { stamped?: boolean };
    const stamped = d.delivered_as === "pdf-watermarked" || !!wm.stamped, isContract = !!d.contract_id;
    out.push({ ts: d.created_at, kind: "download", title: fill(t.dl, { f: d.file_name }), detail: `${ext(d.file_name)} · ${isContract ? (d.delivered_as === "qes-signed" ? t.dl_qes : t.dl_orig) : stamped ? t.dl_wm : t.dl_ref} · ${t.dl_rec}`, room: isContract ? `${t.contract}: ${(d.contract as any)?.title || ""}` : d.room_id ? roomName.get(d.room_id) || null : null, ref: d.code, sha: d.sha256_delivered, ip: d.ip, user: who(d.user_id) });
  }
  for (const k of kyc.data || []) {
    const p = (k.payload || {}) as { reviewResult?: { reviewRejectType?: string }; levelName?: string };
    if (k.type !== "applicantReviewed") continue;
    const ans = k.review_answer === "GREEN" ? "✓" : k.review_answer === "RED" ? (p.reviewResult?.reviewRejectType === "FINAL" ? "✗" : "↻") : "·";
    out.push({ ts: k.received_at, kind: "kyc", title: fill(t.kyc_old, { a: ans }), detail: fill(t.kyc_old_d, { l: p.levelName ? " · " + p.levelName : "" }), user: who(k.external_user_id) });
  }
  const seen = new Set<string>();
  for (const k of didit.data || []) {
    const p = (k.payload || {}) as { ip?: string; decision?: { reviews?: Array<{ comment?: string }>; id_verifications?: Array<{ document_type?: string; issuing_state?: string }> } };
    const st = String(k.status || ""), s8 = String(k.session_id || "").slice(0, 8), u = who(k.user_id);
    const idv = p.decision?.id_verifications?.[0];
    if (k.webhook_type === "session.created") out.push({ ts: k.received_at, kind: "kyc", title: t.kyc_start, detail: t.kyc_start_d, ip: p.ip || null, user: u });
    else if (st === "Approved") out.push({ ts: k.received_at, kind: "kyc", title: t.kyc_ok, detail: fill(t.kyc_ok_d, { doc: idv?.document_type ? " · " + idv.document_type + (idv.issuing_state ? " (" + idv.issuing_state + ")" : "") : "" }), user: u });
    else if (st === "Declined") out.push({ ts: k.received_at, kind: "kyc", title: t.kyc_no, detail: fill(t.kyc_no_d, { c: p.decision?.reviews?.[0]?.comment ? " · " + p.decision.reviews[0].comment : "" }), user: u });
    else if (st === "Abandoned" || st === "Expired") out.push({ ts: k.received_at, kind: "kyc", title: t.kyc_open, detail: fill(t.kyc_open_d, { s: s8 }), user: u });
    else if (st === "Kyc Expired") out.push({ ts: k.received_at, kind: "kyc", title: t.kyc_exp, detail: t.kyc_exp_d, user: u });
    else if (st === "In Review") { const key = "ir:" + k.session_id; if (!seen.has(key)) { seen.add(key); out.push({ ts: k.received_at, kind: "kyc", title: t.kyc_rev, detail: t.kyc_rev_d, user: u }); } }
  }
  for (const a of acts.data || []) {
    const def = ACT[a.event_type];
    if (!def || a.event_type === "mfa-passed") continue; // the sign-in itself is already listed
    const d = (a.detail || {}) as Record<string, unknown>;
    const room = typeof d.room === "string" ? roomBySlug.get(d.room) || null : null;
    const target = a.target && a.target !== a.actor && typeof a.target === "string" && !/^[0-9a-f-]{36}$/i.test(a.target) ? a.target : "";
    out.push({ ts: a.created_at, kind: def[0], title: def[LI[L]], detail: [target, typeof d.version === "string" ? "v" + d.version : "", typeof d.until === "string" ? String(d.until).slice(0, 10) : ""].filter(Boolean).join(" · "), room, ip: typeof d.ip === "string" ? d.ip : null, user: who(a.actor) });
  }
  const list = (kind ? out.filter((e) => e.kind === kind) : out).sort((a, b) => (a.ts < b.ts ? 1 : a.ts > b.ts ? -1 : 0));
  return json({ ok: true, events: list.slice(0, limit), kinds: ["login", "kyc", "nda", "view", "download", "room", "account", "admin"] });
});
