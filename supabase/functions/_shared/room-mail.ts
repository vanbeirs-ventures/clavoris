// Data-room mails. Wraps the localised templates of mail-i18n.ts with two house rules:
//  1. Every mail about a data room states who it comes from: the company that owns the room
//     (vars.owner). It opens the plain text and is shown as a caption under the logo in HTML.
//  2. The body does not repeat "Clavoris" before "data room": the logo in the header says it.
//  3. Invitations to new users explain who carries out the identity verification (Didit) and how
//     the data is handled. Keep the certification list in line with https://docs.didit.me/getting-started/certifications
import { mail as base, pickLang, word, type Lang } from "./mail-i18n.ts";
export { pickLang, word };

type V = Record<string, string | number | null | undefined>;
export const FROM_LINE: Record<Lang, string> = { en: "Message from", nl: "Bericht van", fr: "Message de" };

const KYC_NOTE: Record<Lang, string> = {
  en: "About the identity verification: it is carried out by Didit, an independent identity-verification provider certified to ISO/IEC 27001:2022 and ISO/IEC 27017/27018, audited under SOC 2 Type 2, and tested to iBeta Level 1 (ISO/IEC 30107-3) for liveness detection. Your identity document and the photos taken during the check are processed by Didit in accordance with the GDPR. Clavoris uses the result of the verification to open your access and treats your identity data as strictly confidential.",
  nl: "Over de identiteitsverificatie: die wordt uitgevoerd door Didit, een onafhankelijke aanbieder van identiteitsverificatie, gecertificeerd volgens ISO/IEC 27001:2022 en ISO/IEC 27017/27018, geauditeerd onder SOC 2 Type 2 en getest volgens iBeta Level 1 (ISO/IEC 30107-3) voor liveness-detectie. Uw identiteitsdocument en de foto's die tijdens de controle worden genomen, worden door Didit verwerkt in overeenstemming met de AVG. Clavoris gebruikt het resultaat van de verificatie om uw toegang te openen en behandelt uw identiteitsgegevens strikt vertrouwelijk.",
  fr: "À propos de la vérification d'identité : elle est réalisée par Didit, un prestataire indépendant de vérification d'identité certifié ISO/IEC 27001:2022 et ISO/IEC 27017/27018, audité SOC 2 Type 2 et testé iBeta niveau 1 (ISO/IEC 30107-3) pour la détection du vivant. Votre pièce d'identité et les photos prises lors du contrôle sont traitées par Didit conformément au RGPD. Clavoris utilise le résultat de la vérification pour ouvrir votre accès et traite vos données d'identité de manière strictement confidentielle.",
};

// Data-room identity is private by default (clv_profiles.member_private): every invitation says so.
const PRIVACY_NOTE: Record<Lang, string> = {
  en: "Your identity in the data room is private: other members only see your member ID, not your name or organisation. The company running the room always knows who you are. In the data room you can choose at any time to show your name to the other members.",
  nl: "Uw identiteit in de dataroom is privé: andere leden zien enkel uw lidnummer, niet uw naam of organisatie. De onderneming die de dataroom beheert, weet altijd wie u bent. In de dataroom kunt u op elk moment kiezen om uw naam aan de andere leden te tonen.",
  fr: "Votre identité dans la data room est privée : les autres membres ne voient que votre numéro de membre, ni votre nom ni votre organisation. La société qui gère la data room sait toujours qui vous êtes. Dans la data room, vous pouvez à tout moment choisir d'afficher votre nom aux autres membres.",
};

// Extension request to the administrators of the company that owns the room: two buttons (accept /
// decline) open the decision page, where the date can be adjusted and a comment added for the member.
export const EXT_CTA: Record<Lang, { accept: string; reject: string }> = {
  en: { accept: "Accept the request", reject: "Decline the request" },
  nl: { accept: "Aanvraag aanvaarden", reject: "Aanvraag weigeren" },
  fr: { accept: "Accepter la demande", reject: "Refuser la demande" },
};
const EXT_REQ: Record<Lang, { s: string; t: string }> = {
  en: { s: "Extension request — {room}", t: "{name} ({email}, {org}) asks to extend their access to the data room \"{room}\" until {date}. Current end date: {current}.\n\nMessage from the member: {message}\n\n" + EXT_CTA.en.accept + ":\n{accept}\n\n" + EXT_CTA.en.reject + ":\n{reject}\n\nBoth links open the decision page, where you can adjust the end date and add a comment. The member is informed of your decision by e-mail." },
  nl: { s: "Verlengingsaanvraag — {room}", t: "{name} ({email}, {org}) vraagt de toegang tot de dataroom \"{room}\" te verlengen tot {date}. Huidige einddatum: {current}.\n\nBericht van het lid: {message}\n\n" + EXT_CTA.nl.accept + ":\n{accept}\n\n" + EXT_CTA.nl.reject + ":\n{reject}\n\nBeide links openen de beslissingspagina, waar u de einddatum kunt aanpassen en een opmerking kunt toevoegen. Het lid wordt per e-mail op de hoogte gebracht van uw beslissing." },
  fr: { s: "Demande de prolongation — {room}", t: "{name} ({email}, {org}) demande la prolongation de son accès à la data room « {room} » jusqu'au {date}. Date de fin actuelle : {current}.\n\nMessage du membre : {message}\n\n" + EXT_CTA.fr.accept + " :\n{accept}\n\n" + EXT_CTA.fr.reject + " :\n{reject}\n\nLes deux liens ouvrent la page de décision, où vous pouvez ajuster la date de fin et ajouter un commentaire. Le membre est informé de votre décision par e-mail." },
};
const fillV = (s: string, v: V) => s.replace(/\{(\w+)\}/g, (_, k) => String(v[k] ?? ""));
// Invitation of a user who already has an account: one button straight into the room (sign-in first if needed).
export const OPEN_CTA: Record<Lang, string> = { en: "Open the data room", nl: "Open de dataroom", fr: "Ouvrir la data room" };
const START = /\n\n(Start here:|Begin hier:|Commencez ici :)\n/;

export function mail(lang: Lang, key: string, vars: V = {}): { subject: string; text: string } {
  const m = key === "ext_requested" ? { subject: fillV((EXT_REQ[lang] || EXT_REQ.en).s, vars), text: fillV((EXT_REQ[lang] || EXT_REQ.en).t, vars) } : base(lang, key, vars);
  const text = m.text
    .replace(/the Clavoris data room/g, "the data room")
    .replace(/de Clavoris-dataroom/g, "de dataroom")
    .replace(/la data room Clavoris/g, "la data room");
  let body = text;
  if (key === "room_invite_new" || key === "room_invite_linked") {
    const note = KYC_NOTE[lang] || KYC_NOTE.en;
    body = START.test(body) ? body.replace(START, (m0) => "\n\n" + note + m0) : body + "\n\n" + note;
  }
  if (key === "room_invite_new" || key === "room_invite_linked" || key === "room_invite_existing") body = body + "\n\n" + (PRIVACY_NOTE[lang] || PRIVACY_NOTE.en);
  const owner = String(vars.owner ?? "").trim();
  return { subject: m.subject, text: owner ? `${FROM_LINE[lang] || FROM_LINE.en} ${owner}\n\n${body}` : body };
}
