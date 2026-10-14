// Data-room mails. Wraps the localised templates of mail-i18n.ts with two house rules:
//  1. Every mail about a data room states who it comes from: the company that owns the room
//     (vars.owner). It opens the plain text and is shown as a caption under the logo in HTML.
//  2. The body does not repeat "Clavoris" before "data room": the logo in the header says it.
import { mail as base, pickLang, word, type Lang } from "./mail-i18n.ts";
export { pickLang, word };

type V = Record<string, string | number | null | undefined>;
export const FROM_LINE: Record<Lang, string> = { en: "Message from", nl: "Bericht van", fr: "Message de" };

export function mail(lang: Lang, key: string, vars: V = {}): { subject: string; text: string } {
  const m = base(lang, key, vars);
  const text = m.text
    .replace(/the Clavoris data room/g, "the data room")
    .replace(/de Clavoris-dataroom/g, "de dataroom")
    .replace(/la data room Clavoris/g, "la data room");
  const owner = String(vars.owner ?? "").trim();
  return { subject: m.subject, text: owner ? `${FROM_LINE[lang] || FROM_LINE.en} ${owner}\n\n${text}` : text };
}
