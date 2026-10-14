# Clavoris app — base

The signed-in side of Clavoris, ported from the Minerva cloud application
(`steveminerva/minerva-website`: `assets/vip.js`, `login.html`, `account.html`,
`admin.html` and the `admin-*` edge functions) and reduced to what Clavoris needs.
Static pages, no build step; served with the website at `/app/` on Bunny CDN.

## Backend

Dedicated Supabase project **Clavoris** (`gihetiiuqawfhlwixncn`, eu-central-1; moved from the shared Minerva project on 2026-10-14). Everything
Clavoris lives in the `clv_*` tables (`clv_profiles`, `clv_companies`, `clv_rooms`,
`clv_room_assignments`, `clv_signed_documents`, `clv_access_log`, `clv_audit`,
`clv_downloads`, `clv_kyc_events`, `clv_contracts`, `clv_contract_parties`, …) behind Row Level
Security; the full schema is in `supabase/migrations/20261014_clv_schema_baseline.sql` plus the
later migrations in the same folder.

| Role | Status | Meaning |
|---|---|---|
| `super` | — | Owner. Sees every company; may create and change staff. |
| `admin` | — | Company staff. Sees only their own company's rooms, contracts and members; may enrol investors. |
| `user` | `registered` → `kyc_pending` → `verified` / `kyc_retry` / `rejected` / `suspended` | Investor; identity verification via Didit |

## Files

| File | Purpose |
|---|---|
| `config.js` | Public project URL + publishable key + app URL. Loads first. |
| `clavoris-access.js` | Session/role engine (`window.ClavorisAccess`): sign in/out, password recovery and change, profile update, edge-function calls, page gating. The session is kept in `sessionStorage`, so it ends when the browser page is closed (not only on sign-out) and is per tab. One signed-in user per computer: signed-in pages write a heartbeat to `localStorage` (`clv_active`); the sign-in page asks for confirmation (naming the active user) before a different user signs in, then broadcasts `clv_kick` and every open tab of the previous user signs out (`login.html?kicked=1`). Session reads are single-flight with back-off and never clear a valid session on a transient error. |
| `shell.js` | Top band for signed-in pages, shared helpers (downloads, dates, extension dialog), the "manage notifications / unsubscribe" pop-up, and the inactivity guard: 10 minutes without activity → 60-second countdown dialog ("Stay signed in" restarts the 10 minutes) → sign-out (`login.html?idle=1`). |
| `app.css` | App styles on top of `../assets/colors_and_type.css`; phone layout (single-column grids bounded to the viewport, file rows wrap). |
| `login.html` | Sign in + "forgotten password". Routes staff to `admin.html`, investors to `portal.html`. `?unsubscribe=1` (from mail footers) triggers the notification-settings pop-up after sign-in. |
| `reset.html` | Landing page for recovery/activation links; sets a new password (show/hide on both fields). |
| `account.html` | Profile (full name; private person or organisation — then role and legal-representative yes/no are mandatory), password change, verification status, e-mail notification preferences, personal audit trail. `?next=room.html?…` returns the user to the room once the profile is complete. |
| `portal.html` | Data rooms home: KYC banner and the rooms the user has been granted. |
| `room.html` | One data room: profile-completeness gate, NDA gate (signatory card with capacity, typed-name confirmation with live match), PDF list from Nextcloud, watermarked downloads, members with presence dots, access end date + "Request extension". |
| `kyc.html` | Identity verification (Didit hosted flow, embedded; breaks out of the frame on return). Pulls the decision from the provider on load and every 30 s, so a missed webhook never leaves a user pending. |
| `contracts.html` / `contract.html` | Contracts with qualified electronic signatures: draft → parties → launch → embedded signing (itsme / Evrotrust) in signing order → executed PDF, audit trail, certificate of completion. |
| `admin.html` | Users console (status, roles, KYC), companies, data rooms (invite by email, members, NDA status, revoke, extension requests), document storage. |
| `../supabase/functions/clv-admin-*` | Server-side admin operations (service role; caller role verified; audited). |
| `../supabase/functions/clv-auth-mail` | Password-recovery mail from the Clavoris sender (public, non-enumerating, throttled). |
| `../supabase/functions/clv-room` | Room view: info, NDA status, members + presence, Nextcloud tree (PDF only, after NDA), extension requests. |
| `../supabase/functions/clv-room-nda` | NDA text/PDF + KYC-attested signing → PDF in `<room>/_users/<email>/`, `clv_signed_documents`. |
| `../supabase/functions/clv-room-file` | Gated download, PDF only: every page stamped with name, e-mail, UTC time and download code; SHA-256 of source and delivered file in `clv_downloads` + `clv_access_log`; first-download mail. |
| `../supabase/functions/clv-admin-rooms` | Rooms list, members, invite-by-email (enrol + invitation with the step-by-step flow and the access end date), revoke, reactivate, extension decisions, reminders. |
| `../supabase/functions/clv-kyc-token` / `clv-didit-webhook` / `_shared/kyc.ts` | Creates/resumes the Didit session; signed webhook (`X-Signature` raw body or `X-Signature-V2` canonical JSON) → verified / kyc_pending / kyc_retry; `{sync:true}` pulls the decision from Didit (own session, or any user for staff); "you are verified" mail on the transition. |
| `../supabase/functions/clv-contracts` / `clv-esign-webhook` / `_shared/contracts.ts` | Contracts via e-Signature.eu: one request per contract, embedded signing links handed out in signing order, `remind`, `cancel` (releases the reserved credit), `balance`; callback re-verified against the provider API; executed PDF + audit trail + certificate stored next to the original. `clv-sumsub-webhook` is legacy and can be deleted. |
| `../supabase/functions/_shared/clv.ts` / `mail-i18n.ts` | Shared helpers and the EN/NL/FR mail templates. Mails go out base64-encoded with RFC 2047 subjects (the SMTP library's quoted-printable path corrupts long subjects and folded lines). Every mail ends with the footer: Antwerp · Luxembourg, assistance address, notification-settings/unsubscribe link, privacy link. |

## Data rooms

A room is a `clv_rooms` row whose `nextcloud_folder` points at a folder on the group
Nextcloud (e.g. `Documents/Clavoris/Data Rooms/Minerva Luxury Motors 1`). The folder tree is read
live over WebDAV; `_users/` inside it holds each member's signed NDA and is never listed.

**PDF only.** Members see and receive only `.pdf` files; any other file type placed in the folder
is neither listed nor downloadable. Reason: every delivered page is watermarked with the
recipient's name, e-mail, UTC time and a unique download code, and the SHA-256 of the exact
delivered file is recorded, so a leaked file can be traced to one download record. Export Word
drafts to PDF before placing them in the room folder.

Flow for an investor (as described in the invitation mail): activation link → password →
profile → identity verification → sign the room NDA → documents open.

**Profile and signing capacity.** The full name is mandatory (it is the name that signs). The
user registers as a private person or on behalf of an organisation; with an organisation the
role (free text) and the answer to "are you a legal representative authorised to sign on behalf
of this organisation?" (yes/no, `clv_profiles.legal_rep`) are mandatory too. The NDA step is only
shown once the profile is complete (`clv-room-nda` enforces the same rule); the acceptance
wording, the signature page of the stored PDF and `clv_signed_documents.validation` record the
capacity: on behalf of the organisation, in a personal capacity although employed by it, or as a
private person. The typed name is compared ignoring case, accents and extra spaces.

Access has an end date (room default, e.g. 90 days); the member can request
an extension from inside the room, company staff accept or reject from Admin › Data rooms, and
reminders go out 7 days and 24 hours before the end. Member presence: green = active in the room
in the last 3 minutes, orange = visited before, red = never.

## Contracts (qualified electronic signatures)

Staff create a contract from a PDF, add signatories (in order) and auditors, and launch it. One
request is created at e-Signature.eu for all signatories; Clavoris hands each signatory their
embedded signing link only when it is their turn (itsme® or Evrotrust on the phone). Every
signatory needs a full name and mobile number in their profile. A credit is **reserved** at
launch and **released** on cancel; only a completed signature consumes it. When the last
signatory has signed, the provider delivers the signed PDF and audit trail; Clavoris stores both
untouched and adds its own certificate of completion, then mails all parties. Mails name the
staff member and the company account that sent the contract.

## Mails

All automated mails come from `noreply@clavoris.com` (reply-to `access@clavoris.com`) in the
recipient's language (EN/NL/FR, `clv_profiles.lang`). Transactional mails (invitations, signature
requests, settlements, KYC result) are always sent; the other categories (new files, updated
files, contracts assigned, new investments, portfolio events) can be switched off under
Account › E-mail notifications, which the "unsubscribe" link in every footer leads to.

## Page gating

```html
<head> … <script>document.documentElement.classList.add('clv-checking');</script></head>
<body data-clv-restrict="full|verified|admin">
```

The engine reveals `<main>` only to a session with that clearance and sends
everyone else to `login.html?next=…`. Restricted content should still be
fetched at runtime behind RLS, never shipped in the HTML.

## Deployment and caching

Pushes to `main` deploy the site to Bunny (`.github/workflows/deploy.yml`) and every `clv-*`
function to Supabase (`deploy-functions.yml`, when `supabase/functions/**` changes). Commit
messages containing `[skip deploy]` skip the site deploy. The deploy sets Bunny edge rules so
that HTML, CSS and JS are revalidated by browsers on every load (deploys are visible
immediately); images and fonts keep the long browser cache. Browsers that cached a file before
2026-10-14 18:05 CEST need one hard reload.

## One-time setup (Supabase dashboard)

1. **Auth → URL configuration:** Site URL `https://www.clavoris.com/app`; Redirect URLs
   `https://www.clavoris.com/app/reset.html` and `https://www.clavoris.com/app/**`. Sign-ups off.
2. **Edge functions:** deployed by `.github/workflows/deploy-functions.yml`
   (repo secret `SUPABASE_ACCESS_TOKEN`, a token scoped to the Clavoris project).
3. **Mail sender:** every Clavoris mail is sent by the edge functions from
   **noreply@clavoris.com**, never by Supabase Auth's project-wide sender. Set the edge
   function secrets `CLAVORIS_SMTP_HOST`, `CLAVORIS_SMTP_PORT` (465),
   `CLAVORIS_SMTP_USER`, `CLAVORIS_SMTP_PASS` for that mailbox (at mailbox.org the login is
   `info@clavoris.com`; `noreply@` and `access@` are aliases of it); optional
   `CLAVORIS_MAIL_FROM` and `CLAVORIS_APP_URL`.
4. The first super-admin was created directly in the database; set its
   password via Login › "Forgotten your password?".
5. **Nextcloud (data rooms, contracts):** connected from Admin › Document storage (stored in
   `clv_settings`); the secrets `NC_URL`, `NC_USER`, `NC_PASS` are only a fallback. Renew the app
   token before 14 January 2027.
6. **Didit (KYC):** secrets `DIDIT_API_KEY`, `DIDIT_WEBHOOK_SECRET`, `DIDIT_WORKFLOW_ID`;
   register the webhook `https://<project>.supabase.co/functions/v1/clv-didit-webhook`
   in the Didit console. Until set, the KYC page shows "being set up" and status can be set by
   an admin. The NDA signature is a KYC-attested electronic acceptance.
7. **e-Signature.eu (contracts, QES):** secrets `ESIGN_API_KEY`, `ESIGN_USER_ID` (optional
   `ESIGN_METHODS`, default `itsme-qes-signature,evrotrust-signature`); set the Callback URL
   `https://<project>.supabase.co/functions/v1/clv-esign-webhook` under My account › Signatures API
   (without it, completion is only picked up by the contract page's polling).
