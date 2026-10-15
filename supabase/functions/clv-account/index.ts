// supabase/functions/clv-account/index.ts
// Self-service actions of a member on their own account.
//   { action: "leave_room", room_id }      -> the member leaves a data room: their membership ends (as if revoked)
//                                             and they no longer appear among the room's members; the account stays.
//   { action: "delete", typed_name }       -> the member closes their Clavoris account. Confirmed by typing the full
//                                             name exactly as on the profile (same rule as the NDA signature).
// Deleting: all data-room memberships, extension requests and Q&A of the member are removed; the profile is
// emptied (name, e-mail, organisation, role, mobile, preferences) and marked deleted, so the member's name no
// longer appears anywhere on the platform; the member is signed out everywhere. What the law requires Clavoris to
// keep (identity-verification result under AMLD, signed NDAs, the audit trail) is moved to a sealed retention
// record (clv_retention, no user access) for the legal period. Holders of an instrument cannot delete their account
// while they hold units (the register must name them). Staff accounts are closed by a super-admin, not here.
// Deploy: supabase functions deploy clv-account --no-verify-jwt
import { adminClient, APP_URL, audit, cors, isStaff, json, requireUser, sameName, sendMail } from "../_shared/clv.ts";
import { pickLang, type Lang } from "../_shared/mail-i18n.ts";

const BYE: Record<Lang, { s: string; t: string }> = {
  en: { s: "Your Clavoris account has been closed", t: "Dear {name},\n\nAs you requested, your Clavoris account has been closed. Your name and personal details have been removed from the platform and from every data room you were a member of.\n\nWhat the law requires Clavoris to keep (the result of your identity verification, the non-disclosure agreements you signed and the activity record) is stored securely, out of reach of any user, for the legal retention period and then deleted.\n\nThis is the last message you receive from Clavoris. Questions: access@clavoris.com." },
  nl: { s: "Uw Clavoris-account is afgesloten", t: "Beste {name},\n\nZoals u vroeg, is uw Clavoris-account afgesloten. Uw naam en persoonsgegevens zijn verwijderd van het platform en uit elke dataroom waarvan u lid was.\n\nWat Clavoris wettelijk moet bewaren (het resultaat van uw identiteitsverificatie, de geheimhoudingsovereenkomsten die u ondertekende en het activiteitenoverzicht) wordt veilig en buiten bereik van elke gebruiker bewaard gedurende de wettelijke bewaartermijn en daarna verwijderd.\n\nDit is het laatste bericht dat u van Clavoris ontvangt. Vragen: access@clavoris.com." },
  fr: { s: "Votre compte Clavoris a été clôturé", t: "Cher/Chère {name},\n\nComme vous l'avez demandé, votre compte Clavoris a été clôturé. Votre nom et vos données personnelles ont été supprimés de la plateforme et de toutes les data rooms dont vous étiez membre.\n\nCe que la loi impose à Clavoris de conserver (le résultat de votre vérification d'identité, les accords de confidentialité que vous avez signés et le relevé d'activité) est conservé en sécurité, hors de portée de tout utilisateur, pendant la durée légale de conservation, puis supprimé.\n\nCeci est le dernier message que vous recevez de Clavoris. Questions : access@clavoris.com." },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method" }, 405);
  const admin = adminClient();
  const me = await requireUser(admin, req);
  if (me instanceof Response) return me;
  const body = await req.json().catch(() => ({}));
  const action = String(body.action || "");

  if (action === "leave_room") {
    const roomId = String(body.room_id || "");
    const { data: a } = await admin.from("clv_room_assignments").select("id").eq("room_id", roomId).eq("user_id", me.id).is("revoked_at", null).maybeSingle();
    if (!a) return json({ error: "not-member" }, 404);
    const { error } = await admin.from("clv_room_assignments").update({ revoked_at: new Date().toISOString(), revoked_by: me.id, answers_questions: false }).eq("id", a.id);
    if (error) return json({ error: error.message }, 400);
    const { data: room } = await admin.from("clv_rooms").select("slug").eq("id", roomId).maybeSingle();
    await audit(admin, me as any, "room-left", me.id, { room: room?.slug || roomId });
    return json({ ok: true });
  }

  if (action === "delete") {
    if (isStaff(me)) return json({ error: "staff" }, 400);
    if (!sameName(String(body.typed_name || ""), String(me.full_name || ""))) return json({ error: "name-mismatch" }, 400);
    const { data: held } = await admin.from("clv_holdings").select("units").eq("user_id", me.id).gt("units", 0).limit(1);
    if (held && held.length) return json({ error: "holdings" }, 400);

    const { data: p } = await admin.from("clv_profiles").select("email, full_name, first_name, last_name, company, lang, kyc_summary, kyc_session_id").eq("id", me.id).maybeSingle();
    if (!p) return json({ error: "not-found" }, 404);
    // 1. Sealed retention record (legal obligations), then the farewell mail while the address is still known.
    const { error: rErr } = await admin.from("clv_retention").upsert({ user_id: me.id, email: p.email, full_name: p.full_name, first_name: p.first_name, last_name: p.last_name, company: p.company, kyc_summary: p.kyc_summary, kyc_session_id: p.kyc_session_id, deleted_at: new Date().toISOString() });
    if (rErr) return json({ error: rErr.message }, 500);
    const L = pickLang(p.lang), m = BYE[L];
    await sendMail(p.email, m.s, m.t.replace("{name}", p.full_name || ""), L).catch((e) => console.error("delete mail:", (e as Error).message));

    // 2. Everything that shows the member to others goes.
    await admin.from("clv_room_answers").delete().eq("author_id", me.id);
    await admin.from("clv_room_questions").delete().eq("asker_id", me.id);
    await admin.from("clv_access_requests").delete().eq("user_id", me.id);
    await admin.from("clv_room_assignments").delete().eq("user_id", me.id);
    await admin.from("clv_mfa_codes").delete().eq("user_id", me.id);

    // 3. The profile is emptied and closed (status suspended: no further sign-in on Clavoris).
    const placeholder = `deleted-${me.id.slice(0, 8)}@deleted.clavoris.invalid`;
    const { error: pErr } = await admin.from("clv_profiles").update({
      email: placeholder, full_name: null, first_name: null, last_name: null, salutation: null, company: null, job_title: null, legal_rep: null,
      mobile: null, notify: {}, features: {}, member_private: true, kyc_summary: null, status: "suspended", suspended_at: new Date().toISOString(), deleted_at: new Date().toISOString(),
    }).eq("id", me.id);
    if (pErr) return json({ error: pErr.message }, 500);

    // 4. The sign-in account: a Clavoris-only account is anonymised and locked; an account shared with the
    //    group's other platforms (same e-mail) keeps working there and only loses Clavoris.
    const { data: u } = await admin.auth.admin.getUserById(me.id);
    if ((u?.user?.app_metadata as any)?.app === "clavoris") {
      await admin.auth.admin.updateUserById(me.id, { email: placeholder, user_metadata: {}, ban_duration: "876000h" } as any).catch(() => {});
    }
    const jwt = (req.headers.get("authorization") || "").replace("Bearer ", "");
    await admin.auth.admin.signOut(jwt, "global").catch(() => {});
    await admin.from("clv_audit").insert({ actor: me.id, actor_email: placeholder, event_type: "account-deleted", target: me.id, detail: {} }).then(() => {}, () => {});
    return json({ ok: true, redirect: `${APP_URL}/login.html` });
  }

  return json({ error: "bad-action" }, 400);
});
