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
const START = /\n\n(Start here:|Begin hier:|Commencez ici :)\n/;

export function mail(lang: Lang, key: string, vars: V = {}): { subject: string; text: string } {
  const m = base(lang, key, vars);
  const text = m.text
    .replace(/the Clavoris data room/g, "the data room")
    .replace(/de Clavoris-dataroom/g, "de dataroom")
    .replace(/la data room Clavoris/g, "la data room");
  let body = text;
  if (key === "room_invite_new" || key === "room_invite_linked") {
    const note = KYC_NOTE[lang] || KYC_NOTE.en;
    body = START.test(body) ? body.replace(START, (m0) => "\n\n" + note + m0) : body + "\n\n" + note;
  }
  const owner = String(vars.owner ?? "").trim();
  return { subject: m.subject, text: owner ? `${FROM_LINE[lang] || FROM_LINE.en} ${owner}\n\n${body}` : body };
}
