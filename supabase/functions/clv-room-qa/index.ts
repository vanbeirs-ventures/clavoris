// supabase/functions/clv-room-qa/index.ts
// Data-room Q&A. A member asks a question (optionally about one file, optionally to one answerer); the
// room's answerers (members tagged "answers questions" in the admin console, else the company's admins)
// answer it. Questions are private between the asker and the answerers; an answerer can share a question
// with its answers with every member of the room (the asker's identity stays hidden there).
// Every new question mails the answerer(s); every answer mails the asker (setting "qa", on by default).
// Comments on the NDA (topic "nda") are open before the NDA is signed: a member who has not signed yet can
// only ask NDA-topic questions and only sees NDA-topic questions (own ones, and those the company shared).
//   { action: "list", room_id }                                        -> questions visible to the caller
//   { action: "ask", room_id, body, directed_to?, file_name?, topic? } -> new question (topic "nda": on the NDA)
//   { action: "answer", question_id, body, share? }                    -> answer (answerers / staff)
//   { action: "share", question_id, shared }                           -> share with all members or not
// Deploy: supabase functions deploy clv-room-qa --no-verify-jwt
import { adminClient, APP_URL, cors, isStaff, json, requireUser, sendMail } from "../_shared/clv.ts";
import { FROM_LINE, pickLang } from "../_shared/room-mail.ts";
import type { Lang } from "../_shared/mail-i18n.ts";

const MAIL: Record<string, Record<Lang, { s: string; t: string }>> = {
  question: {
    en: { s: "New question in the data room \"{room}\"", t: "Dear {name},\n\n{asker} asked a question in the data room \"{room}\"{file}:\n\n\"{body}\"\n\nAnswer it in the data room:\n{link}" },
    nl: { s: "Nieuwe vraag in de dataroom \"{room}\"", t: "Beste {name},\n\n{asker} stelde een vraag in de dataroom \"{room}\"{file}:\n\n\"{body}\"\n\nBeantwoord ze in de dataroom:\n{link}" },
    fr: { s: "Nouvelle question dans la data room « {room} »", t: "Cher/Chère {name},\n\n{asker} a posé une question dans la data room « {room} »{file} :\n\n« {body} »\n\nRépondez-y dans la data room :\n{link}" },
  },
  answer: {
    en: { s: "Your question in the data room \"{room}\" has been answered", t: "Dear {name},\n\n{author} answered your question in the data room \"{room}\":\n\nYour question: \"{question}\"\n\nAnswer: \"{body}\"\n\nOpen the Q&A in the data room:\n{link}" },
    nl: { s: "Uw vraag in de dataroom \"{room}\" is beantwoord", t: "Beste {name},\n\n{author} beantwoordde uw vraag in de dataroom \"{room}\":\n\nUw vraag: \"{question}\"\n\nAntwoord: \"{body}\"\n\nOpen de vragen en antwoorden in de dataroom:\n{link}" },
    fr: { s: "Votre question dans la data room « {room} » a reçu une réponse", t: "Cher/Chère {name},\n\n{author} a répondu à votre question dans la data room « {room} » :\n\nVotre question : « {question} »\n\nRéponse : « {body} »\n\nOuvrez les questions-réponses dans la data room :\n{link}" },
  },
};
const FILE_PART: Record<Lang, string> = { en: " about the file {f}", nl: " over het bestand {f}", fr: " au sujet du fichier {f}" };
const NDA_PART: Record<Lang, string> = { en: " about the non-disclosure agreement (NDA)", nl: " over de geheimhoudingsovereenkomst (NDA)", fr: " au sujet de l'accord de confidentialité (NDA)" };
const FALLBACK: Record<Lang, string> = { en: "investor", nl: "belegger", fr: "investisseur" };
const fill = (s: string, v: Record<string, string>) => s.replace(/\{(\w+)\}/g, (_, k) => v[k] ?? "");
const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s);
const memberId = (id: string) => "M-" + String(id).replace(/-/g, "").slice(0, 6).toUpperCase();

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method" }, 405);
  const admin = adminClient();
  const me = await requireUser(admin, req);
  if (me instanceof Response) return me;
  const body = await req.json().catch(() => ({}));
  const action = String(body.action || "list");

  // The room: from room_id, or from the question for answer / share.
  let roomId = String(body.room_id || "");
  let question: any = null;
  if (action === "answer" || action === "share") {
    const { data } = await admin.from("clv_room_questions").select("*").eq("id", String(body.question_id || "")).maybeSingle();
    if (!data) return json({ error: "not-found" }, 404);
    question = data; roomId = data.room_id;
  }
  if (!roomId) return json({ error: "room-required" }, 400);
  const { data: room } = await admin.from("clv_rooms").select("id, name, company_id, qes_nda_required, company:clv_companies(name)").eq("id", roomId).maybeSingle();
  if (!room) return json({ error: "not-found" }, 404);
  const owner = (room as any).company?.name || "Clavoris";

  // Who may take part: staff, or a member with an active, unexpired assignment. Without the required signed
  // NDA the member is limited to comments and questions on the NDA itself (ndaOnly).
  const staff = isStaff(me) && (me.role === "super" || me.company_id === room.company_id);
  const { data: asg } = await admin.from("clv_room_assignments").select("user_id, expires_at, answers_questions, revoked_at, kyc_waived, nda_waived").eq("room_id", roomId).is("revoked_at", null);
  const mine = (asg || []).find((a: any) => a.user_id === me.id);
  let ndaOnly = false;
  // Staff of another company are ordinary members here (no access without an assignment).
  if (!staff) {
    if (!mine) return json({ error: "forbidden" }, 403);
    if (mine.expires_at && new Date(mine.expires_at) < new Date()) return json({ error: "expired" }, 403);
    if (room.qes_nda_required) {
      const { data: nda } = await admin.from("clv_signed_documents").select("id").eq("room_id", roomId).eq("user_id", me.id).eq("doc_type", "nda").maybeSingle();
      // "NDA off" for this person (after identity verification, or "KYC off"): the full Q&A is open.
      if (!nda && !(mine.nda_waived && (me.status === "verified" || mine.kyc_waived))) ndaOnly = true;
    }
  }
  // Answerers: members tagged in the admin console; without any, the company's admins answer.
  let answererIds = (asg || []).filter((a: any) => a.answers_questions).map((a: any) => a.user_id);
  const tagged = answererIds.length > 0;
  if (!tagged) {
    const { data: adm } = await admin.from("clv_profiles").select("id").eq("role", "admin").eq("company_id", room.company_id);
    answererIds = (adm || []).map((p: any) => p.id);
  }
  const canAnswer = staff || answererIds.includes(me.id);

  async function profiles(ids: string[]) {
    const uniq = [...new Set(ids.filter(Boolean))];
    if (!uniq.length) return {} as Record<string, any>;
    const { data } = await admin.from("clv_profiles").select("id, email, full_name, company, lang, notify, member_private").in("id", uniq);
    return Object.fromEntries((data || []).map((p: any) => [p.id, p]));
  }
  const nameOf = (p: any, id: string) => (p?.full_name || "").trim() || memberId(id);
  const link = `${APP_URL}/room.html?id=${roomId}&qa=1`;

  if (action === "list") {
    let q = admin.from("clv_room_questions").select("*").eq("room_id", roomId).order("created_at", { ascending: false }).limit(300);
    if (!canAnswer) q = q.or(`asker_id.eq.${me.id},shared.eq.true`);
    if (ndaOnly && !canAnswer) q = q.eq("topic", "nda");
    const { data: qs } = await q;
    const ids = (qs || []).map((x: any) => x.id);
    const { data: ans } = ids.length ? await admin.from("clv_room_answers").select("*").in("question_id", ids).order("created_at", { ascending: true }) : { data: [] as any[] };
    const P = await profiles([...(qs || []).map((x: any) => x.asker_id), ...(qs || []).map((x: any) => x.directed_to), ...(ans || []).map((a: any) => a.author_id), ...(tagged ? answererIds : [])]);
    return json({
      ok: true, can_answer: canAnswer, me: me.id, nda_only: ndaOnly && !canAnswer,
      answerers: tagged ? answererIds.map((id: string) => ({ user_id: id, name: nameOf(P[id], id) })) : [],
      questions: (qs || []).map((x: any) => {
        const own = x.asker_id === me.id;
        // Other members see a shared question without the asker's identity; answerers always see who asked.
        const asker = canAnswer || own ? { name: nameOf(P[x.asker_id], x.asker_id), company: P[x.asker_id]?.company || "", self: own } : { name: "", company: "", self: false };
        return {
          id: x.id, body: x.body, file_name: x.file_name, topic: x.topic || null, status: x.status, shared: x.shared, created_at: x.created_at, own, asker,
          directed_to: x.directed_to ? { user_id: x.directed_to, name: nameOf(P[x.directed_to], x.directed_to) } : null,
          answers: (ans || []).filter((a: any) => a.question_id === x.id).map((a: any) => ({ id: a.id, body: a.body, created_at: a.created_at, author: nameOf(P[a.author_id], a.author_id), self: a.author_id === me.id })),
        };
      }),
    });
  }

  if (action === "ask") {
    const text = String(body.body || "").replace(/\r/g, "").trim().slice(0, 4000);
    if (!text) return json({ error: "empty" }, 400);
    const hourAgo = new Date(Date.now() - 3600000).toISOString();
    const { count } = await admin.from("clv_room_questions").select("id", { count: "exact", head: true }).eq("asker_id", me.id).gte("created_at", hourAgo);
    if ((count || 0) >= 30) return json({ error: "too-many" }, 429);
    const to = typeof body.directed_to === "string" && answererIds.includes(body.directed_to) && tagged ? body.directed_to : null;
    // Before the NDA is signed every question is a comment on the NDA, never about a document of the room.
    const topic = ndaOnly || body.topic === "nda" ? "nda" : null;
    const fileName = topic ? null : String(body.file_name || "").trim().slice(0, 300) || null;
    const { data: row, error } = await admin.from("clv_room_questions").insert({ room_id: roomId, asker_id: me.id, directed_to: to, file_name: fileName, topic, body: text }).select("id").single();
    if (error) return json({ error: error.message }, 400);
    // Notify the chosen answerer, or every answerer.
    const P = await profiles(to ? [to] : answererIds);
    for (const id of to ? [to] : answererIds) {
      const p = P[id];
      if (!p?.email || id === me.id || p.notify?.qa === false || p.notify?.qa_question === false) continue; // "new question" switched off
      const L = pickLang(p.lang), m = MAIL.question[L];
      const v = { name: p.full_name || FALLBACK[L], asker: `${me.full_name || me.email}${me.company ? " (" + me.company + ")" : ""}`, room: room.name, file: topic ? NDA_PART[L] : fileName ? fill(FILE_PART[L], { f: fileName }) : "", body: clip(text, 1500), link };
      await sendMail(p.email, fill(m.s, v), `${FROM_LINE[L]} ${owner}\n\n` + fill(m.t, v), L).catch((e) => console.error("qa question mail:", (e as Error).message));
    }
    return json({ ok: true, id: row.id });
  }

  if (!canAnswer) return json({ error: "forbidden" }, 403);

  if (action === "answer") {
    const text = String(body.body || "").replace(/\r/g, "").trim().slice(0, 8000);
    if (!text) return json({ error: "empty" }, 400);
    const { error } = await admin.from("clv_room_answers").insert({ question_id: question.id, author_id: me.id, body: text });
    if (error) return json({ error: error.message }, 400);
    const patch: Record<string, unknown> = { status: "answered", updated_at: new Date().toISOString() };
    if (body.share === true) patch.shared = true;
    await admin.from("clv_room_questions").update(patch).eq("id", question.id);
    const P = await profiles([question.asker_id]);
    const p = P[question.asker_id];
    if (p?.email && question.asker_id !== me.id && p.notify?.qa !== false && p.notify?.qa_answer !== false) { // "answer to my question" switched on
      const L = pickLang(p.lang), m = MAIL.answer[L];
      const v = { name: p.full_name || FALLBACK[L], author: `${me.full_name || me.email} (${owner})`, room: room.name, question: clip(question.body, 600), body: clip(text, 2500), link };
      await sendMail(p.email, fill(m.s, v), `${FROM_LINE[L]} ${owner}\n\n` + fill(m.t, v), L).catch((e) => console.error("qa answer mail:", (e as Error).message));
    }
    return json({ ok: true });
  }

  if (action === "share") {
    await admin.from("clv_room_questions").update({ shared: body.shared === true, updated_at: new Date().toISOString() }).eq("id", question.id);
    return json({ ok: true, shared: body.shared === true });
  }

  return json({ error: "bad-action" }, 400);
});
