// supabase/functions/clv-sumsub-webhook/index.ts
// RETIRED on 15 October 2026. Identity verification runs on Didit (clv-didit-webhook); no profile uses Sumsub.
// This endpoint now refuses every call with 410 Gone and reads no secret. The historical Sumsub events stay in
// clv_sumsub_events and remain visible in the audit trail. The function, its folder and _shared/sumsub.ts can
// be deleted, together with the SUMSUB_* secrets and the webhook URL in the Sumsub dashboard.
// Deploy: supabase functions deploy clv-sumsub-webhook --no-verify-jwt
Deno.serve(() => new Response(JSON.stringify({ error: "retired" }), { status: 410, headers: { "content-type": "application/json" } }));
