# Clavoris app — base

The signed-in side of Clavoris, ported from the Minerva cloud application
(`steveminerva/minerva-website`: `assets/vip.js`, `login.html`, `account.html`,
`admin.html` and the `admin-*` edge functions) and reduced to what Clavoris needs.
Static pages, no build step; served with the website at `/clavoris/app/`.

## Backend

Shared Supabase project **Minerva Website** (`ojwvdfdkybutuflwbutd`). Everything
Clavoris lives in the `clv_*` tables (`clv_profiles`, `clv_rooms`,
`clv_room_assignments`, `clv_signed_documents`, `clv_access_log`, `clv_audit`,
`clv_downloads`, `clv_sumsub_events`) behind Row Level Security. Clavoris users
get a `clv_profiles` row only; they never appear in Minerva's `profiles`.

| Role | Status | Meaning |
|---|---|---|
| `super` | — | Owner. May create and change staff. |
| `admin` | — | Staff. May enrol investors and change investor status. |
| `user` | `registered` → `kyc_pending` → `verified` / `kyc_retry` / `rejected` / `suspended` | Investor; KYC via Sumsub |

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
| `portal.html` | Investor home: KYC banner, tiles, assigned data rooms, holdings placeholder. |
| `admin.html` | Users console: list, enrol, change role/status, send recovery link. |
| `../supabase/functions/clv-admin-*` | Server-side admin operations (service role; caller role verified; audited). |
| `../supabase/functions/clv-auth-mail` | Passphrase-recovery mail from noreply@clavoris.com (public, non-enumerating, throttled). |

## Page gating

```html
<head> … <script>document.documentElement.classList.add('clv-checking');</script></head>
<body data-clv-restrict="full|verified|admin">
```

The engine reveals `<main>` only to a session with that clearance and sends
everyone else to `login.html?next=…`. Restricted content should still be
fetched at runtime behind RLS, never shipped in the HTML.

## One-time setup (Supabase dashboard)

1. **Auth → URL configuration → Redirect URLs:** add
   `https://vanbeirsventures.com/clavoris/app/reset.html` (recovery links land there).
2. **Edge functions:** deployed by `.github/workflows/deploy-functions.yml`
   (needs the `SUPABASE_ACCESS_TOKEN` org secret, as for Minerva).
3. **Mail sender:** every Clavoris mail (enrolment invitations, passphrase
   recovery) is sent by the edge functions from **noreply@clavoris.com**, never
   by Supabase Auth's project-wide sender (which Minerva uses). Set the edge
   function secrets `CLAVORIS_SMTP_HOST`, `CLAVORIS_SMTP_PORT` (465),
   `CLAVORIS_SMTP_USER`, `CLAVORIS_SMTP_PASS` for that mailbox; optional
   `CLAVORIS_MAIL_FROM` and `CLAVORIS_APP_URL`. Until they are set, recovery
   mails cannot be sent and enrolment shows the one-time passphrase in the
   console instead.
4. The first super-admin was created directly in the database; set its
   passphrase via Login › "Forgotten your passphrase?".
