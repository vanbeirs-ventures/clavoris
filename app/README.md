# Clavoris app — base

The signed-in side of Clavoris, ported from the Minerva cloud application
(`steveminerva/minerva-website`: `assets/vip.js`, `login.html`, `account.html`,
`admin.html` and the `admin-*` edge functions) and reduced to what Clavoris needs.
Static pages, no build step; served with the website at `/clavoris/app/`.

## Backend

Dedicated Supabase project **Clavoris** (`gihetiiuqawfhlwixncn`, eu-central-1; moved from the shared Minerva project on 2026-10-14). Everything
Clavoris lives in the `clv_*` tables (`clv_profiles`, `clv_rooms`,
`clv_room_assignments`, `clv_signed_documents`, `clv_access_log`, `clv_audit`,
`clv_downloads`, `clv_kyc_events`, …) behind Row Level Security; the full schema is in
`supabase/migrations/20261014_clv_schema_baseline.sql`.

| Role | Status | Meaning |
|---|---|---|
| `super` | — | Owner. May create and change staff. |
| `admin` | — | Staff. May enrol investors and change investor status. |
| `user` | `registered` → `kyc_pending` → `verified` / `kyc_retry` / `rejected` / `suspended` | Investor; KYC via Didit |

## Files

| File | Purpose |
|---|---|
| `config.js` | Public project URL + publishable key + app URL. Loads first. |
| `clavoris-access.js` | Session/role engine (`window.ClavorisAccess`): sign in/out, password recovery and change, profile update, edge-function calls, page gating. |
| `shell.js` | Top band for signed-in pages. |
| `app.css` | App styles on top of `../assets/colors_and_type.css`. |
| `login.html` | Sign in + "forgotten passphrase". Routes staff to `admin.html`, investors to `portal.html`. |
| `reset.html` | Landing page for recovery links; sets a new passphrase. |
| `account.html` | Profile, passphrase change, verification status. |
| `portal.html` | Data rooms home: KYC banner and the rooms the user has been granted. |
| `room.html` | One data room: NDA gate (KYC-verified users only), folder/file tree from Nextcloud, downloads, members with presence dots. |
| `kyc.html` | Identity verification (Didit hosted flow, embedded). |
| `admin.html` | Users console + data rooms: invite by email, members, NDA status, revoke. |
| `../supabase/functions/clv-admin-*` | Server-side admin operations (service role; caller role verified; audited). |
| `../supabase/functions/clv-auth-mail` | Passphrase-recovery mail from the Clavoris sender (public, non-enumerating, throttled). |
| `../supabase/functions/clv-room` | Room view: info, NDA status, members + presence, Nextcloud tree (after NDA). |
| `../supabase/functions/clv-room-nda` | NDA text + KYC-attested signing → PDF in `<room>/_users/<email>/`, `clv_signed_documents`. |
| `../supabase/functions/clv-room-file` | Gated download: unique code, PDF watermark, `clv_downloads` + `clv_access_log`, first-download mail. |
| `../supabase/functions/clv-admin-rooms` | Rooms list, members, invite-by-email (enrol + invitation), revoke. |
| `../supabase/functions/clv-kyc-token` / `clv-didit-webhook` | Creates/resumes the Didit session; signed webhook → verified / kyc_pending / kyc_retry. |
| `../supabase/functions/clv-contracts` / `clv-esign-webhook` | Contracts with qualified signatures via e-Signature.eu (one request per contract, embedded signing links handed out in signing order; callback re-verified against the provider API). `clv-sumsub-webhook` is legacy and can be deleted. |

## Data rooms

A room is a `clv_rooms` row whose `nextcloud_folder` points at a folder on the group
Nextcloud (e.g. `clavoris/datarooms/Minerva Luxury Motors 1`). The folder tree is read
live over WebDAV; `_users/` inside it holds each member's signed NDA and is never listed.
Flow for an investor: invitation mail → set passphrase → profile → KYC (Didit) → sign the
room NDA (text in `clv_rooms.annex_text`) → documents listed → downloads logged and
watermarked. Member presence: green = active in the room in the last 3 minutes, orange =
visited before, red = never.

## Page gating

```html
<head> … <script>document.documentElement.classList.add('clv-checking');</script></head>
<body data-clv-restrict="full|verified|admin">
```

The engine reveals `<main>` only to a session with that clearance and sends
everyone else to `login.html?next=…`. Restricted content should still be
fetched at runtime behind RLS, never shipped in the HTML.

## One-time setup (Supabase dashboard)

1. **Auth → URL configuration:** Site URL `https://www.clavoris.com/app`; Redirect URLs
   `https://www.clavoris.com/app/reset.html` and `https://www.clavoris.com/app/**`. Sign-ups off.
2. **Edge functions:** deployed by `.github/workflows/deploy-functions.yml`
   (repo secret `SUPABASE_ACCESS_TOKEN`, a token scoped to the Clavoris project).
3. **Mail sender:** every Clavoris mail (enrolment invitations, passphrase
   recovery) is sent by the edge functions from **noreply@clavoris.com**, never
   by Supabase Auth's project-wide sender (which Minerva uses). Set the edge
   function secrets `CLAVORIS_SMTP_HOST`, `CLAVORIS_SMTP_PORT` (465),
   `CLAVORIS_SMTP_USER`, `CLAVORIS_SMTP_PASS` for that mailbox (at mailbox.org the login is
   `info@clavoris.com`; `noreply@` and `access@` are aliases of it); optional
   `CLAVORIS_MAIL_FROM` and `CLAVORIS_APP_URL`. Until they are set, recovery
   mails cannot be sent and enrolment shows the one-time passphrase in the
   console instead.
4. The first super-admin was created directly in the database; set its
   passphrase via Login › "Forgotten your passphrase?".
5. **Nextcloud (data rooms):** connected from Admin › Document storage (stored in
   `clv_settings`); the secrets `NC_URL`, `NC_USER`, `NC_PASS` are only a fallback.
6. **Didit (KYC):** secrets `DIDIT_API_KEY`, `DIDIT_WEBHOOK_SECRET`, `DIDIT_WORKFLOW_ID`;
   register the webhook `https://<project>.supabase.co/functions/v1/clv-didit-webhook`
   (v3, signature `X-Signature-V2`) in the Didit console. Until set, the KYC page shows
   "being set up" and status can be set by an admin.
   The NDA signature is a KYC-attested electronic acceptance.
7. **e-Signature.eu (contracts, QES):** secrets `ESIGN_API_KEY`, `ESIGN_USER_ID` (optional
   `ESIGN_METHODS`, default `itsme-qes-signature,evrotrust-signature`); set the Callback URL
   `https://<project>.supabase.co/functions/v1/clv-esign-webhook` under My account › Signatures API.
   Credits are consumed per completed signature (itsme/Evrotrust 1 each), not per request; every
   signatory needs a full name and mobile number in the profile.
