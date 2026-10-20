// Mails for the company team (staff of a company account), in the recipient's language (en / nl / fr).
// A new person activates their account with a one-time link; someone who already has an account signs in with
// their own password. Formal tone, third person for Clavoris, no exclamation marks.
import { pickLang, type Lang } from "./mail-i18n.ts";
export { pickLang };

type V = Record<string, string | number | null | undefined>;
const fill = (s: string, v: V) => s.replace(/\{(\w+)\}/g, (_, k) => String(v[k] ?? ""));

const T: Record<string, Record<Lang, { s: string; t: string }>> = {
  team_new: {
    en: { s: "Clavoris: you have been added to the team of {company}", t: "Dear {name},\n\n{by} has added you to the team of {company} on Clavoris.\n\nAs a member of the team you manage the company's data rooms, invitations, documents and contracts. You see only the data of {company}.\n\nActivate your account with the link below and choose your password (the link is valid once, for 24 hours). Your identity is then verified once, with your identity document and your phone or webcam.\n\nStart here:\n{link}" },
    nl: { s: "Clavoris: u bent toegevoegd aan het team van {company}", t: "Beste {name},\n\n{by} heeft u op Clavoris toegevoegd aan het team van {company}.\n\nAls teamlid beheert u de datarooms, uitnodigingen, documenten en contracten van de onderneming. U ziet enkel de gegevens van {company}.\n\nActiveer uw account met de link hieronder en kies uw wachtwoord (de link is eenmalig en 24 uur geldig). Daarna wordt uw identiteit eenmalig geverifieerd, met uw identiteitsdocument en uw telefoon of webcam.\n\nBegin hier:\n{link}" },
    fr: { s: "Clavoris : vous avez été ajouté(e) à l'équipe de {company}", t: "Cher/Chère {name},\n\n{by} vous a ajouté(e) à l'équipe de {company} sur Clavoris.\n\nEn tant que membre de l'équipe, vous gérez les data rooms, les invitations, les documents et les contrats de la société. Vous ne voyez que les données de {company}.\n\nActivez votre compte avec le lien ci-dessous et choisissez votre mot de passe (le lien est valable une seule fois, pendant 24 heures). Votre identité est ensuite vérifiée une fois, avec votre pièce d'identité et votre téléphone ou webcam.\n\nCommencez ici :\n{link}" },
  },
  team_existing: {
    en: { s: "Clavoris: you have been added to the team of {company}", t: "Dear {name},\n\n{by} has added you to the team of {company} on Clavoris.\n\nAs a member of the team you manage the company's data rooms, invitations, documents and contracts. You see only the data of {company}.\n\nYour e-mail address already has an account, so there is nothing to register or activate. Sign in with your usual e-mail address and password; the administration opens after signing in:\n{link}\n\nForgotten your password? Choose \"Forgotten your password?\" on the sign-in page." },
    nl: { s: "Clavoris: u bent toegevoegd aan het team van {company}", t: "Beste {name},\n\n{by} heeft u op Clavoris toegevoegd aan het team van {company}.\n\nAls teamlid beheert u de datarooms, uitnodigingen, documenten en contracten van de onderneming. U ziet enkel de gegevens van {company}.\n\nUw e-mailadres heeft al een account, dus u hoeft zich niet te registreren of te activeren. Meld u aan met uw gebruikelijke e-mailadres en wachtwoord; het beheer opent na het aanmelden:\n{link}\n\nWachtwoord vergeten? Kies \"Wachtwoord vergeten?\" op de aanmeldpagina." },
    fr: { s: "Clavoris : vous avez été ajouté(e) à l'équipe de {company}", t: "Cher/Chère {name},\n\n{by} vous a ajouté(e) à l'équipe de {company} sur Clavoris.\n\nEn tant que membre de l'équipe, vous gérez les data rooms, les invitations, les documents et les contrats de la société. Vous ne voyez que les données de {company}.\n\nVotre adresse e-mail dispose déjà d'un compte : aucune inscription ni activation n'est nécessaire. Connectez-vous avec votre adresse e-mail et votre mot de passe habituels ; l'administration s'ouvre après la connexion :\n{link}\n\nMot de passe oublié ? Choisissez « Mot de passe oublié ? » sur la page de connexion." },
  },
};
export const TEAM_CTA: Record<Lang, { activate: string; open: string }> = {
  en: { activate: "Activate my account", open: "Sign in to Clavoris" },
  nl: { activate: "Mijn account activeren", open: "Aanmelden bij Clavoris" },
  fr: { activate: "Activer mon compte", open: "Se connecter à Clavoris" },
};
export function teamMail(lang: Lang, key: "team_new" | "team_existing", vars: V): { subject: string; text: string } {
  const m = T[key][lang] || T[key].en;
  return { subject: fill(m.s, vars), text: fill(m.t, vars) };
}
