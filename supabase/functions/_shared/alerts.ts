// Red flags: events that need a person at the company to look, mailed to the staff concerned.
//   mail      — an e-mail could not be delivered at all (the HTML version and its plain-text retry both bounced)
//   kyc       — an identity verification was declined by the provider
//   downloads — a member downloaded an unusual number of documents from one data room within an hour
// Each flag is written to the audit trail (event "red-flag-<kind>", shown to staff only) and mailed, in their
// own language, to every super administrator and to the administrators of the companies concerned (the
// company of the person and the companies running the data rooms the person belongs to). The same flag is
// raised at most once per key within the dedupe window, so a stubborn mailbox does not flood the staff.
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { APP_URL, sendMail } from "./clv.ts";
import { pickLang, type Lang } from "./mail-i18n.ts";

export type FlagKind = "mail" | "kyc" | "downloads";
export const DOWNLOAD_ALERT_PER_HOUR = 20;

// Subjects start with a fixed prefix per language: a bounced alert is recognised and never re-alerted.
export const ALERT_PREFIX: Record<Lang, string> = { en: "Clavoris alert", nl: "Clavoris-waarschuwing", fr: "Alerte Clavoris" };
export const isAlertSubject = (s: string) => Object.values(ALERT_PREFIX).some((p) => String(s || "").startsWith(p));

const T: Record<FlagKind, Record<Lang, { s: string; t: string }>> = {
  mail: {
    en: { s: "{p}: e-mail to {email} could not be delivered", t: "Dear {name},\n\nClavoris could not deliver an e-mail to {email}{who}: the receiving mail server refused both the formatted version and the plain-text version.\n\nSubject: {subject}\nReason given by the server: {reason}\nTime: {time} UTC\n\nUntil this is solved, this person receives no sign-in codes, invitations or notifications by e-mail. Ask the recipient or their IT department to accept e-mail from noreply@clavoris.com, or correct the address in the admin console.\n\nAudit trail: {link}" },
    nl: { s: "{p}: e-mail aan {email} kon niet worden bezorgd", t: "Beste {name},\n\nClavoris kon een e-mail aan {email}{who} niet bezorgen: de ontvangende mailserver weigerde zowel de opgemaakte versie als de versie in platte tekst.\n\nOnderwerp: {subject}\nReden opgegeven door de server: {reason}\nTijdstip: {time} UTC\n\nZolang dit niet is opgelost, ontvangt deze persoon geen aanmeldcodes, uitnodigingen of meldingen per e-mail. Vraag de ontvanger of diens IT-afdeling om e-mail van noreply@clavoris.com te aanvaarden, of corrigeer het adres in de beheerconsole.\n\nAuditspoor: {link}" },
    fr: { s: "{p} : l'e-mail à {email} n'a pas pu être remis", t: "Cher/Chère {name},\n\nClavoris n'a pas pu remettre un e-mail à {email}{who} : le serveur de messagerie destinataire a refusé à la fois la version mise en forme et la version en texte brut.\n\nObjet : {subject}\nMotif indiqué par le serveur : {reason}\nHeure : {time} UTC\n\nTant que ce problème n'est pas résolu, cette personne ne reçoit ni codes de connexion, ni invitations, ni notifications par e-mail. Demandez au destinataire ou à son service informatique d'accepter les e-mails de noreply@clavoris.com, ou corrigez l'adresse dans la console d'administration.\n\nPiste d'audit : {link}" },
  },
  kyc: {
    en: { s: "{p}: identity verification declined for {person}", t: "Dear {name},\n\nThe identity verification of {person} ({email}) was declined by the verification provider ({provider}, session {session}).\n\nSummary: {summary}\nData rooms: {rooms}\n\nThe person can try again; Clavoris does not allow an NDA to be signed until the verification succeeds. Review the case in the provider's console before deciding on any access outside the platform.\n\nAudit trail: {link}" },
    nl: { s: "{p}: identiteitsverificatie geweigerd voor {person}", t: "Beste {name},\n\nDe identiteitsverificatie van {person} ({email}) werd geweigerd door de verificatiedienst ({provider}, sessie {session}).\n\nSamenvatting: {summary}\nDatarooms: {rooms}\n\nDe persoon kan het opnieuw proberen; Clavoris laat de ondertekening van een NDA pas toe nadat de verificatie geslaagd is. Bekijk het dossier in de console van de verificatiedienst voor u beslist over enige toegang buiten het platform.\n\nAuditspoor: {link}" },
    fr: { s: "{p} : vérification d'identité refusée pour {person}", t: "Cher/Chère {name},\n\nLa vérification d'identité de {person} ({email}) a été refusée par le prestataire de vérification ({provider}, session {session}).\n\nRésumé : {summary}\nData rooms : {rooms}\n\nLa personne peut réessayer ; Clavoris ne permet de signer un NDA qu'une fois la vérification réussie. Examinez le dossier dans la console du prestataire avant de décider de tout accès en dehors de la plateforme.\n\nPiste d'audit : {link}" },
  },
  downloads: {
    en: { s: "{p}: {n} downloads by {person} in {room}", t: "Dear {name},\n\n{person} ({email}) downloaded {n} documents from the data room \"{room}\" within the last hour.\n\nEvery download carries a watermark with the person's name and is logged with its download code. If this does not look like a normal review, you can end the person's access in Admin › Data rooms.\n\nAudit trail: {link}" },
    nl: { s: "{p}: {n} downloads door {person} in {room}", t: "Beste {name},\n\n{person} ({email}) downloadde het voorbije uur {n} documenten uit de dataroom \"{room}\".\n\nElke download draagt een watermerk met de naam van de persoon en wordt met de downloadcode geregistreerd. Lijkt dit niet op een normale beoordeling, dan kunt u de toegang van de persoon beëindigen in Beheer › Datarooms.\n\nAuditspoor: {link}" },
    fr: { s: "{p} : {n} téléchargements par {person} dans {room}", t: "Cher/Chère {name},\n\n{person} ({email}) a téléchargé {n} documents de la data room « {room} » au cours de la dernière heure.\n\nChaque téléchargement porte un filigrane au nom de la personne et est enregistré avec son code. Si cela ne ressemble pas à un examen normal, vous pouvez mettre fin à l'accès de la personne dans Administration › Data rooms.\n\nPiste d'audit : {link}" },
  },
};
const FALLBACK: Record<Lang, string> = { en: "colleague", nl: "collega", fr: "collègue" };
const fill = (s: string, v: Record<string, string>) => s.replace(/\{(\w+)\}/g, (_, k) => v[k] ?? "");

export async function raiseRedFlag(admin: SupabaseClient, kind: FlagKind, opts: {
  userId?: string | null; email?: string | null; roomId?: string | null;
  vars?: Record<string, string>; key: string; dedupeHours?: number; silent?: boolean;
}): Promise<{ raised: boolean; mailed: number }> {
  const event = `red-flag-${kind}`;
  const since = new Date(Date.now() - (opts.dedupeHours ?? 24) * 3600000).toISOString();
  const { data: seen } = await admin.from("clv_audit").select("id").eq("event_type", event).eq("target", opts.key).gte("created_at", since).limit(1);
  if (seen && seen.length) return { raised: false, mailed: 0 };

  // The person concerned (by id, else by e-mail address) and the companies that should hear about it.
  const sel = "id, email, full_name, company_id";
  let person: { id: string; email: string; full_name: string | null; company_id: string | null } | null = null;
  if (opts.userId) person = (await admin.from("clv_profiles").select(sel).eq("id", opts.userId).maybeSingle()).data;
  else if (opts.email) person = (await admin.from("clv_profiles").select(sel).ilike("email", String(opts.email).trim()).maybeSingle()).data;
  const email = String(person?.email || opts.email || "").trim();
  const companies = new Set<string>();
  if (person?.company_id) companies.add(person.company_id);
  const roomNames: string[] = [];
  if (person) {
    const { data: asg } = await admin.from("clv_room_assignments").select("room:clv_rooms(name, company_id)").eq("user_id", person.id).is("revoked_at", null);
    for (const a of (asg || []) as any[]) { if (a.room?.company_id) companies.add(a.room.company_id); if (a.room?.name) roomNames.push(a.room.name); }
  }
  if (opts.roomId) { const { data: r } = await admin.from("clv_rooms").select("company_id").eq("id", opts.roomId).maybeSingle(); if (r?.company_id) companies.add(r.company_id); }

  await admin.from("clv_audit").insert({ actor: person?.id || null, actor_email: email || null, event_type: event, target: opts.key, detail: { ...(opts.vars || {}), email } }).then(() => {}, (e: Error) => console.error("red flag audit:", e.message));
  console.error("RED FLAG", kind, opts.key);
  if (opts.silent) return { raised: true, mailed: 0 };

  const { data: staff } = await admin.from("clv_profiles").select("email, full_name, lang, role, company_id, status").in("role", ["super", "admin"]).neq("status", "suspended");
  const to = (staff || []).filter((s: any) => s.email && s.email.toLowerCase() !== email.toLowerCase() && (s.role === "super" || (s.company_id && companies.has(s.company_id))));
  let mailed = 0;
  for (const s of to as any[]) {
    const L = pickLang(s.lang), m = T[kind][L];
    const v: Record<string, string> = {
      p: ALERT_PREFIX[L], name: s.full_name || FALLBACK[L], email, person: person?.full_name || email,
      who: person?.full_name ? ` (${person.full_name})` : "", rooms: roomNames.join(", ") || "—", link: `${APP_URL}/account.html#audit`,
      time: new Date().toISOString().replace("T", " ").slice(0, 16), ...(opts.vars || {}),
    };
    if (await sendMail(s.email, fill(m.s, v), fill(m.t, v), L).catch((e: Error) => { console.error("red flag mail:", s.email, e.message); return false; })) mailed++;
  }
  return { raised: true, mailed };
}
