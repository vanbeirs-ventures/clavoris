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

// Invitation to a further data room for someone who already has an account (signed in before, here or on
// another platform of the group): no registration, no activation link, no new password. The mail says so,
// leads straight to the sign-in page (which then opens the room) and lists only what is still open for
// this room: identity verification when not yet done, and the room's own NDA ({steps}, see existingSteps).
const EXISTING: Record<Lang, { s: string; t: string }> = {
  en: { s: "Clavoris data room: {room}", t: "Dear {name},\n\n{company} has given you access to the data room \"{room}\".{until}\n\nYour e-mail address already has an account, so there is nothing to register or activate. Sign in with your usual e-mail address and password; the data room opens straight after signing in:\n{link}\n\nWhat remains for this data room:\n{steps}\n\nForgotten your password? Choose \"Forgotten your password?\" on the sign-in page." },
  nl: { s: "Clavoris dataroom: {room}", t: "Beste {name},\n\n{company} heeft u toegang gegeven tot de dataroom \"{room}\".{until}\n\nUw e-mailadres heeft al een account, dus u hoeft zich niet te registreren of te activeren. Meld u aan met uw gebruikelijke e-mailadres en wachtwoord; de dataroom opent meteen na het aanmelden:\n{link}\n\nWat er nog moet gebeuren voor deze dataroom:\n{steps}\n\nWachtwoord vergeten? Kies \"Wachtwoord vergeten?\" op de aanmeldpagina." },
  fr: { s: "Data room Clavoris : {room}", t: "Cher/Chère {name},\n\n{company} vous a donné accès à la data room « {room} ».{until}\n\nVotre adresse e-mail dispose déjà d'un compte : aucune inscription ni activation n'est nécessaire. Connectez-vous avec votre adresse e-mail et votre mot de passe habituels ; la data room s'ouvre dès la connexion :\n{link}\n\nCe qu'il reste à faire pour cette data room :\n{steps}\n\nMot de passe oublié ? Choisissez « Mot de passe oublié ? » sur la page de connexion." },
};
const STEP: Record<Lang, Record<string, string>> = {
  en: { kyc_done: "- Your identity is already verified; no new check is needed.", kyc_todo: "- Complete your identity verification: a few minutes with your identity document and your phone or webcam. You are guided through it after signing in.", nda: "- Sign the data room's non-disclosure agreement electronically. Each data room has its own agreement, also when you have signed one for another room.", nda_done: "- You have already signed this data room's non-disclosure agreement.", docs: "- The documents then open. Every download is personal, watermarked with your name and recorded.", docs_open: "- The documents are available as soon as you have signed in. Every download is personal, watermarked with your name and recorded." },
  nl: { kyc_done: "- Uw identiteit is al geverifieerd; een nieuwe controle is niet nodig.", kyc_todo: "- Voltooi uw identiteitsverificatie: enkele minuten met uw identiteitsdocument en uw telefoon of webcam. U wordt er na het aanmelden doorheen geleid.", nda: "- Onderteken de geheimhoudingsovereenkomst van de dataroom elektronisch. Elke dataroom heeft een eigen overeenkomst, ook als u er al een voor een andere dataroom ondertekend hebt.", nda_done: "- U hebt de geheimhoudingsovereenkomst van deze dataroom al ondertekend.", docs: "- Daarna gaan de documenten open. Elke download is persoonlijk, voorzien van een watermerk met uw naam en wordt geregistreerd.", docs_open: "- De documenten zijn beschikbaar zodra u aangemeld bent. Elke download is persoonlijk, voorzien van een watermerk met uw naam en wordt geregistreerd." },
  fr: { kyc_done: "- Votre identité est déjà vérifiée ; aucun nouveau contrôle n'est nécessaire.", kyc_todo: "- Effectuez votre vérification d'identité : quelques minutes avec votre pièce d'identité et votre téléphone ou webcam. Vous y êtes guidé(e) après la connexion.", nda: "- Signez électroniquement l'accord de confidentialité de la data room. Chaque data room a son propre accord, même si vous en avez déjà signé un pour une autre data room.", nda_done: "- Vous avez déjà signé l'accord de confidentialité de cette data room.", docs: "- Les documents s'ouvrent ensuite. Chaque téléchargement est personnel, porte un filigrane à votre nom et est enregistré.", docs_open: "- Les documents sont disponibles dès votre connexion. Chaque téléchargement est personnel, porte un filigrane à votre nom et est enregistré." },
};
// The open steps for this person and this room. Identity verification is only asked where the room has an NDA.
// No identity verification for this person in this room ("KYC off", set by the company running the room).
const STEP_WAIVED: Record<Lang, string> = {
  en: "- No identity verification is required for this data room.",
  nl: "- Voor deze dataroom is geen identiteitsverificatie nodig.",
  fr: "- Aucune vérification d'identité n'est requise pour cette data room.",
};
// No non-disclosure agreement for this person in this room ("NDA off", set by the company running the room).
const STEP_NONDA: Record<Lang, string> = {
  en: "- No non-disclosure agreement is required for you in this data room.",
  nl: "- Voor u is in deze dataroom geen geheimhoudingsovereenkomst nodig.",
  fr: "- Aucun accord de confidentialité n'est requis pour vous dans cette data room.",
};
export function existingSteps(lang: Lang, s: { verified: boolean; ndaRequired: boolean; ndaSigned: boolean; waived?: boolean; ndaWaived?: boolean }): { steps: string; kyc: boolean } {
  const t = STEP[lang] || STEP.en;
  if (!s.ndaRequired || s.ndaSigned) return { steps: (s.ndaSigned ? t.nda_done + "\n" : "") + t.docs_open, kyc: false };
  if (s.ndaWaived) {
    if (s.verified || s.waived) return { steps: [STEP_NONDA[lang] || STEP_NONDA.en, t.docs_open].join("\n"), kyc: false };
    return { steps: [t.kyc_todo, STEP_NONDA[lang] || STEP_NONDA.en, t.docs].join("\n"), kyc: true };
  }
  if (s.waived && !s.verified) return { steps: [STEP_WAIVED[lang] || STEP_WAIVED.en, t.nda, t.docs].join("\n"), kyc: false };
  return { steps: [s.verified ? t.kyc_done : t.kyc_todo, t.nda, t.docs].join("\n"), kyc: !s.verified };
}

// "KYC off" for someone already invited: they sign in again and go straight to the room's NDA.
const KYC_WAIVED: Record<Lang, { s: string; t: string }> = {
  en: { s: "Clavoris data room: {room}, no identity verification needed", t: "Dear {name},\n\n{company} has decided that no identity verification is needed for you in the data room \"{room}\".\n\nWhat remains:\n1. Sign in to Clavoris:\n{link}\n2. Sign the data room's non-disclosure agreement electronically.\n3. The documents open. Every download is personal, watermarked with your name and recorded.\n\nForgotten your password? Choose \"Forgotten your password?\" on the sign-in page." },
  nl: { s: "Clavoris dataroom: {room}, geen identiteitsverificatie nodig", t: "Beste {name},\n\n{company} heeft beslist dat voor u in de dataroom \"{room}\" geen identiteitsverificatie nodig is.\n\nWat er nog moet gebeuren:\n1. Meld u aan bij Clavoris:\n{link}\n2. Onderteken de geheimhoudingsovereenkomst van de dataroom elektronisch.\n3. De documenten gaan open. Elke download is persoonlijk, voorzien van een watermerk met uw naam en wordt geregistreerd.\n\nWachtwoord vergeten? Kies \"Wachtwoord vergeten?\" op de aanmeldpagina." },
  fr: { s: "Data room Clavoris : {room}, aucune vérification d'identité nécessaire", t: "Cher/Chère {name},\n\n{company} a décidé qu'aucune vérification d'identité n'est nécessaire pour vous dans la data room « {room} ».\n\nCe qu'il reste à faire :\n1. Connectez-vous à Clavoris :\n{link}\n2. Signez électroniquement l'accord de confidentialité de la data room.\n3. Les documents s'ouvrent. Chaque téléchargement est personnel, porte un filigrane à votre nom et est enregistré.\n\nMot de passe oublié ? Choisissez « Mot de passe oublié ? » sur la page de connexion." },
};
// The same for someone who has not yet activated their account: activation link instead of the sign-in page.
const KYC_WAIVED_NEW: Record<Lang, { s: string; t: string }> = {
  en: { s: KYC_WAIVED.en.s, t: "Dear {name},\n\n{company} has decided that no identity verification is needed for you in the data room \"{room}\".\n\nWhat remains:\n1. Activate your account with the link below and choose your password (the link is valid once, for 24 hours).\n2. Complete your profile: your name and organisation appear on the non-disclosure agreement.\n3. Sign the data room's non-disclosure agreement electronically.\n4. The documents open. Every download is personal, watermarked with your name and recorded.\n\nStart here:\n{link}" },
  nl: { s: KYC_WAIVED.nl.s, t: "Beste {name},\n\n{company} heeft beslist dat voor u in de dataroom \"{room}\" geen identiteitsverificatie nodig is.\n\nWat er nog moet gebeuren:\n1. Activeer uw account met de link hieronder en kies uw wachtwoord (de link is eenmalig en 24 uur geldig).\n2. Vul uw profiel aan: uw naam en organisatie verschijnen op de geheimhoudingsovereenkomst.\n3. Onderteken de geheimhoudingsovereenkomst van de dataroom elektronisch.\n4. De documenten gaan open. Elke download is persoonlijk, voorzien van een watermerk met uw naam en wordt geregistreerd.\n\nBegin hier:\n{link}" },
  fr: { s: KYC_WAIVED.fr.s, t: "Cher/Chère {name},\n\n{company} a décidé qu'aucune vérification d'identité n'est nécessaire pour vous dans la data room « {room} ».\n\nCe qu'il reste à faire :\n1. Activez votre compte avec le lien ci-dessous et choisissez votre mot de passe (le lien est valable une seule fois, pendant 24 heures).\n2. Complétez votre profil : votre nom et votre organisation figurent sur l'accord de confidentialité.\n3. Signez électroniquement l'accord de confidentialité de la data room.\n4. Les documents s'ouvrent. Chaque téléchargement est personnel, porte un filigrane à votre nom et est enregistré.\n\nCommencez ici :\n{link}" },
};
// "NDA off" for someone already invited: no non-disclosure agreement to sign for this room. The identity step is left
// out (vars.nokyc) when the person is verified already or "KYC off" is set too.
const NDA_WAIVED: Record<Lang, { s: string; t: string }> = {
  en: { s: "Clavoris data room: {room}, no non-disclosure agreement needed", t: "Dear {name},\n\n{company} has decided that you do not need to sign a non-disclosure agreement for the data room \"{room}\".\n\nWhat remains:\n1. Sign in to Clavoris:\n{link}\n2. Verify your identity: a few minutes with your identity document and your phone or webcam.\n3. The documents open. Every download is personal, watermarked with your name and recorded.\n\nForgotten your password? Choose \"Forgotten your password?\" on the sign-in page." },
  nl: { s: "Clavoris dataroom: {room}, geen geheimhoudingsovereenkomst nodig", t: "Beste {name},\n\n{company} heeft beslist dat u voor de dataroom \"{room}\" geen geheimhoudingsovereenkomst hoeft te ondertekenen.\n\nWat er nog moet gebeuren:\n1. Meld u aan bij Clavoris:\n{link}\n2. Verifieer uw identiteit: enkele minuten met uw identiteitsdocument en uw telefoon of webcam.\n3. De documenten gaan open. Elke download is persoonlijk, voorzien van een watermerk met uw naam en wordt geregistreerd.\n\nWachtwoord vergeten? Kies \"Wachtwoord vergeten?\" op de aanmeldpagina." },
  fr: { s: "Data room Clavoris : {room}, aucun accord de confidentialité nécessaire", t: "Cher/Chère {name},\n\n{company} a décidé que vous n'avez pas à signer d'accord de confidentialité pour la data room « {room} ».\n\nCe qu'il reste à faire :\n1. Connectez-vous à Clavoris :\n{link}\n2. Vérifiez votre identité : quelques minutes avec votre pièce d'identité et votre téléphone ou webcam.\n3. Les documents s'ouvrent. Chaque téléchargement est personnel, porte un filigrane à votre nom et est enregistré.\n\nMot de passe oublié ? Choisissez « Mot de passe oublié ? » sur la page de connexion." },
};
// The same for someone who has not yet activated their account: activation link instead of the sign-in page.
const NDA_WAIVED_NEW: Record<Lang, { s: string; t: string }> = {
  en: { s: NDA_WAIVED.en.s, t: "Dear {name},\n\n{company} has decided that you do not need to sign a non-disclosure agreement for the data room \"{room}\".\n\nWhat remains:\n1. Activate your account with the link below and choose your password (the link is valid once, for 24 hours).\n2. Complete your profile.\n3. Verify your identity: a few minutes with your identity document and your phone or webcam.\n4. The documents open. Every download is personal, watermarked with your name and recorded.\n\nStart here:\n{link}" },
  nl: { s: NDA_WAIVED.nl.s, t: "Beste {name},\n\n{company} heeft beslist dat u voor de dataroom \"{room}\" geen geheimhoudingsovereenkomst hoeft te ondertekenen.\n\nWat er nog moet gebeuren:\n1. Activeer uw account met de link hieronder en kies uw wachtwoord (de link is eenmalig en 24 uur geldig).\n2. Vul uw profiel aan.\n3. Verifieer uw identiteit: enkele minuten met uw identiteitsdocument en uw telefoon of webcam.\n4. De documenten gaan open. Elke download is persoonlijk, voorzien van een watermerk met uw naam en wordt geregistreerd.\n\nBegin hier:\n{link}" },
  fr: { s: NDA_WAIVED.fr.s, t: "Cher/Chère {name},\n\n{company} a décidé que vous n'avez pas à signer d'accord de confidentialité pour la data room « {room} ».\n\nCe qu'il reste à faire :\n1. Activez votre compte avec le lien ci-dessous et choisissez votre mot de passe (le lien est valable une seule fois, pendant 24 heures).\n2. Complétez votre profil.\n3. Vérifiez votre identité : quelques minutes avec votre pièce d'identité et votre téléphone ou webcam.\n4. Les documents s'ouvrent. Chaque téléchargement est personnel, porte un filigrane à votre nom et est enregistré.\n\nCommencez ici :\n{link}" },
};
// Invitation and reminders without a non-disclosure agreement ("NDA off"): the NDA step and the NDA mentions are left out.
const NDA_STEP = /\n\d\. (Sign the (data )?room's non-disclosure agreement|Onderteken de geheimhoudingsovereenkomst|Signez électroniquement l'accord de confidentialité)[^\n]*/;
function withoutNdaStep(text: string): string {
  text = text
    .replace(": your name and organisation appear on the non-disclosure agreement.", ".")
    .replace(": uw naam en organisatie verschijnen op de geheimhoudingsovereenkomst.", ".")
    .replace(" : votre nom et votre organisation figurent sur l'accord de confidentialité.", ".")
    .replace("the identity verification (KYC) and the room's non-disclosure agreement complete the process", "the identity verification (KYC) completes the process")
    .replace("voltooien de identiteitsverificatie (KYC) en de geheimhoudingsovereenkomst van de dataroom het proces", "voltooit de identiteitsverificatie (KYC) het proces")
    .replace("la vérification d'identité (KYC) et l'accord de confidentialité de la data room achèvent le processus", "la vérification d'identité (KYC) achève le processus")
    .replace("Once verified, the room's non-disclosure agreement is the last step before the documents become available.", "Once verified, the documents open.")
    .replace("Na de verificatie is de geheimhoudingsovereenkomst van de dataroom de laatste stap voordat de documenten beschikbaar worden.", "Na de verificatie gaan de documenten open.")
    .replace("Une fois vérifié(e), l'accord de confidentialité de la data room est la dernière étape avant que les documents soient disponibles.", "Une fois vérifié(e), les documents s'ouvrent.");
  if (!NDA_STEP.test(text)) return text;
  let n = 0;
  return text.replace(NDA_STEP, "").replace(/\n(\d)\. /g, () => `\n${++n}. `);
}

// Invitation without identity verification: the identity step and the note on the KYC provider are left out.
const ID_STEP = /\n\d\. (Verify your identity|Verifieer uw identiteit|Vérifiez votre identité)[^\n]*/;
function withoutKycStep(text: string): string {
  // Activation reminder: "After that, the identity verification (KYC) and the room's NDA complete the process."
  text = text.replace("the identity verification (KYC) and the room's non-disclosure agreement complete the process", "the room's non-disclosure agreement completes the process")
    .replace("voltooien de identiteitsverificatie (KYC) en de geheimhoudingsovereenkomst van de dataroom het proces", "voltooit de geheimhoudingsovereenkomst van de dataroom het proces")
    .replace("la vérification d'identité (KYC) et l'accord de confidentialité de la data room achèvent le processus", "l'accord de confidentialité de la data room achève le processus")
    // With "NDA off" as well, nothing but the documents remains.
    .replace("After that, the identity verification (KYC) completes the process.", "After that, the documents open.")
    .replace("Daarna voltooit de identiteitsverificatie (KYC) het proces.", "Daarna gaan de documenten open.")
    .replace("Ensuite, la vérification d'identité (KYC) achève le processus.", "Ensuite, les documents s'ouvrent.");
  if (!ID_STEP.test(text)) return text;
  let n = 0;
  return text.replace(ID_STEP, "").replace(/\n(\d)\. /g, () => `\n${++n}. `);
}

export function mail(lang: Lang, key: string, vars: V = {}): { subject: string; text: string } {
  const own = key === "ext_requested" ? EXT_REQ : key === "room_invite_existing" ? EXISTING : key === "kyc_waived" ? KYC_WAIVED : key === "kyc_waived_new" ? KYC_WAIVED_NEW : key === "nda_waived" ? NDA_WAIVED : key === "nda_waived_new" ? NDA_WAIVED_NEW : null;
  const m = own ? { subject: fillV((own[lang] || own.en).s, vars), text: fillV((own[lang] || own.en).t, vars) } : base(lang, key, vars);
  const noKyc = !!vars.nokyc;
  const noNda = !!vars.nonda;
  const t0 = noNda ? withoutNdaStep(m.text) : m.text;
  const text = (noKyc ? withoutKycStep(t0) : t0)
    .replace(/the Clavoris data room/g, "the data room")
    .replace(/de Clavoris-dataroom/g, "de dataroom")
    .replace(/la data room Clavoris/g, "la data room");
  let body = text;
  if (!noKyc && (key === "room_invite_new" || key === "room_invite_linked" || (key === "room_invite_existing" && vars.kyc))) {
    const note = KYC_NOTE[lang] || KYC_NOTE.en;
    body = START.test(body) ? body.replace(START, (m0) => "\n\n" + note + m0) : body + "\n\n" + note;
  }
  if (key === "room_invite_new" || key === "room_invite_linked" || key === "room_invite_existing") body = body + "\n\n" + (PRIVACY_NOTE[lang] || PRIVACY_NOTE.en);
  const owner = String(vars.owner ?? "").trim();
  return { subject: m.subject, text: owner ? `${FROM_LINE[lang] || FROM_LINE.en} ${owner}\n\n${body}` : body };
}
