// Didit identity verification: shared status handling for the webhook and the on-demand sync.
// Status mapping (vendor_data = Clavoris user id):
//   Approved                      -> verified   (+ "you are verified" mail on the transition)
//   In Review / In Progress /
//   Awaiting User / Not Started   -> kyc_pending (only from registered / kyc_retry)
//   Declined / Abandoned / Expired-> kyc_retry   (never for staff; a hard "rejected" is set by an admin)
//   Kyc Expired                   -> registered  (verification lapsed; user must redo it)
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { APP_URL, sendMail } from "./clv.ts";
import { type Lang, pickLang } from "./mail-i18n.ts";
import { raiseRedFlag } from "./alerts.ts";

export const DIDIT_URL = "https://verification.didit.me";

// "You are verified" mail (en / nl / fr), sent once on the transition to verified.
const VERIFIED: Record<Lang, { s: string; t: string }> = {
  en: { s: "Clavoris: your identity is verified", t: "Dear {name},\n\nYour identity verification (KYC) has been completed successfully. Your Clavoris account is now fully activated.\n\nSign in to open the data rooms and instruments you have been invited to:\n{link}\n\nIf a data room still asks for its non-disclosure agreement, you sign it once inside the room; the documents open immediately afterwards." },
  nl: { s: "Clavoris: uw identiteit is geverifieerd", t: "Beste {name},\n\nUw identiteitsverificatie (KYC) is met succes afgerond. Uw Clavoris-account is nu volledig geactiveerd.\n\nMeld u aan om de datarooms en instrumenten te openen waarvoor u bent uitgenodigd:\n{link}\n\nVraagt een dataroom nog om haar geheimhoudingsovereenkomst, dan ondertekent u die eenmalig in de dataroom; de documenten openen meteen daarna." },
  fr: { s: "Clavoris : votre identité est vérifiée", t: "Cher/Chère {name},\n\nVotre vérification d'identité (KYC) a été réalisée avec succès. Votre compte Clavoris est désormais pleinement activé.\n\nConnectez-vous pour ouvrir les data rooms et instruments auxquels vous avez été invité(e) :\n{link}\n\nSi une data room demande encore son accord de confidentialité, vous le signez une seule fois dans la data room ; les documents s'ouvrent immédiatement après." },
};
const FALLBACK: Record<Lang, string> = { en: "investor", nl: "belegger", fr: "investisseur" };
const fill = (s: string, v: Record<string, string>) => s.replace(/\{(\w+)\}/g, (_, k) => v[k] ?? "");

export type Decision = Record<string, unknown> & {
  id_verifications?: Array<Record<string, unknown>>;
  liveness_checks?: Array<Record<string, unknown>>;
  face_matches?: Array<Record<string, unknown>>;
  aml_screenings?: Array<Record<string, unknown>>;
  reviews?: Array<Record<string, unknown>>;
};
// Compact, non-sensitive summary kept on the profile (no document images, no numbers).
export function summarize(d: Decision | undefined, status: string): Record<string, unknown> {
  const idv = d?.id_verifications?.[0] || {};
  const pick = (o: Record<string, unknown>, keys: string[]) => Object.fromEntries(keys.filter((k) => o[k] !== undefined).map((k) => [k, o[k]]));
  return {
    status,
    id_verification: pick(idv, ["status", "document_type", "issuing_state", "issuing_state_name", "first_name", "last_name", "date_of_birth", "expiration_date", "nationality", "warnings"]),
    liveness: pick(d?.liveness_checks?.[0] || {}, ["status", "score", "method"]),
    face_match: pick(d?.face_matches?.[0] || {}, ["status", "score"]),
    aml: pick(d?.aml_screenings?.[0] || {}, ["status", "total_hits", "score"]),
    review: pick(d?.reviews?.[0] || {}, ["new_status", "comment", "created_at", "user"]),
  };
}

// Official name from an approved identity verification. The document's given names and family name are
// stored in first_name / last_name; the name shown everywhere on the platform (full_name) is the first given
// name plus the family name ("Benoit Casimir Alexandre Louis" + "Morand" -> "Benoit Morand"). Names read in
// capitals are put in normal case. When the invitation already spelled the first given name and the document
// reading matches it except for accents or one dropped letter (a known OCR slip: "Benoî"), the invitation's
// spelling is kept. The name is then locked: the member can no longer change it (database trigger).
const norm = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
function tidyName(s: unknown): string {
  const t = String(s || "").replace(/\s+/g, " ").trim();
  if (!t || /\p{Ll}/u.test(t)) return t;
  return t.toLowerCase().replace(/(^|[\s'\-])(\p{L})/gu, (_m, a, b) => a + b.toUpperCase());
}
export function kycName(idv: Record<string, unknown>, invited: { first_name?: string | null }): { first_name: string; last_name: string; full_name: string } | null {
  const given = tidyName(idv.first_name), family = tidyName(idv.last_name);
  if (!given || !family) return null;
  let first = given.split(" ")[0];
  const inv = String(invited.first_name || "").trim().split(/\s+/)[0] || "";
  if (inv) {
    const a = norm(inv), b = norm(first);
    if (a === b || (a.startsWith(b) && a.length - b.length === 1)) first = inv;
  }
  // The corrected first given name also replaces the misread one in the stored given names.
  return { first_name: [first, ...given.split(" ").slice(1)].join(" "), last_name: family, full_name: `${first} ${family}` };
}

// Outcome of each check only (no names, dates or document data), for the staff alert.
function checks(sm: unknown): string {
  const o = (sm || {}) as Record<string, Record<string, unknown> | undefined>;
  const part = (label: string, k: string) => (o[k]?.status ? `${label}: ${o[k]!.status}` : "");
  return [part("ID document", "id_verification"), part("liveness", "liveness"), part("face match", "face_match"), part("AML", "aml")].filter(Boolean).join(" · ") || "—";
}

// Apply a Didit session status to the user's profile. Returns the new profile status (or null when
// the user is unknown). On the transition to "verified" the user gets the confirmation mail.
export async function applyKycStatus(admin: SupabaseClient, userId: string, sessionId: string, status: string, decision?: Decision): Promise<string | null> {
  const { data: p } = await admin.from("clv_profiles").select("id, email, full_name, first_name, lang, status, role, kyc_session_id").eq("id", userId).maybeSingle();
  if (!p) return null;
  const upd: Record<string, unknown> = { kyc_provider: "didit", kyc_session_id: sessionId || p.kyc_session_id, kyc_level: "didit-kyc" };
  const staff = p.role !== "user";
  if (status === "Approved") {
    upd.status = "verified"; upd.kyc_review_answer = "GREEN"; upd.kyc_reject_type = null; upd.kyc_reviewed_at = new Date().toISOString();
    upd.kyc_summary = summarize(decision, status);
    const nm = kycName(decision?.id_verifications?.[0] || {}, p);
    if (nm) Object.assign(upd, nm, { kyc_name_at: new Date().toISOString() });
  } else if (status === "Declined" || status === "Abandoned" || status === "Expired") {
    upd.kyc_review_answer = "RED"; upd.kyc_reject_type = "RETRY"; upd.kyc_reviewed_at = new Date().toISOString();
    upd.kyc_summary = summarize(decision, status);
    if (!staff && p.status !== "verified") upd.status = "kyc_retry";
  } else if (status === "Kyc Expired") {
    upd.kyc_summary = summarize(decision, status);
    if (!staff) upd.status = "registered";
  } else if (["In Review", "In Progress", "Awaiting User", "Not Started", "Resubmitted"].includes(status)) {
    if (p.status === "registered" || p.status === "kyc_retry") upd.status = "kyc_pending";
  }
  const { error } = await admin.from("clv_profiles").update(upd).eq("id", p.id);
  if (error) { console.error("profile update:", error.message); return p.status; }
  const now = String(upd.status || p.status);
  // A declined verification is a red flag for the staff concerned (once per verification session).
  if (status === "Declined") {
    await raiseRedFlag(admin, "kyc", { userId: p.id, key: `kyc:${sessionId || p.id}`, dedupeHours: 24 * 365, vars: { provider: "Didit", session: sessionId || "n/a", summary: checks(upd.kyc_summary) } }).catch((e: Error) => console.error("red flag:", e.message));
  }
  if (now === "verified" && p.status !== "verified" && p.email) {
    const L = pickLang(p.lang);
    const v = { name: String(upd.full_name || p.full_name || "") || FALLBACK[L], link: `${APP_URL}/login.html` };
    await sendMail(p.email, fill(VERIFIED[L].s, v), fill(VERIFIED[L].t, v), L).catch((e: Error) => console.error("kyc mail:", e.message));
  }
  return now;
}

// Pull the current decision for a session from Didit and apply it (used when a webhook was missed).
export async function syncKycSession(admin: SupabaseClient, userId: string, sessionId: string): Promise<{ status: string; profile: string | null } | { error: string }> {
  const apiKey = Deno.env.get("DIDIT_API_KEY");
  if (!apiKey) return { error: "kyc-not-configured" };
  const res = await fetch(`${DIDIT_URL}/v2/session/${encodeURIComponent(sessionId)}/decision/`, { headers: { "x-api-key": apiKey, accept: "application/json" } });
  const d = await res.json().catch(() => ({})) as Decision & { status?: string; vendor_data?: string };
  if (!res.ok) { console.error("didit decision:", res.status, JSON.stringify(d).slice(0, 300)); return { error: "kyc-sync-failed" }; }
  if (d.vendor_data && String(d.vendor_data) !== userId) return { error: "kyc-session-mismatch" };
  const status = String(d.status || "");
  await admin.from("clv_kyc_events").upsert({
    provider: "didit", event_id: `sync:${sessionId}:${status}`, webhook_type: "decision.synced", session_id: sessionId, user_id: userId,
    status, environment: null, payload: { status, synced: true, summary: summarize(d, status) }, processed_at: new Date().toISOString(),
  }, { onConflict: "provider,event_id", ignoreDuplicates: true }).then(() => {}, (e: Error) => console.error("kyc event:", e.message));
  const profile = await applyKycStatus(admin, userId, sessionId, status, d);
  return { status, profile };
}
