# Clavoris — Investor Portal UI Kit

A high-fidelity, interactive recreation of the **Clavoris investor portal** — the primary product surface (Portfolio · Instruments · Marketplace · Documents).

> **Source note.** This kit is reconstructed from the brand guidelines and the platform's domain language. It faithfully applies the brand's visual system; it is *not* a copy of an existing implementation. Treat it as the reference design for the portal. All data is mock data.

## Run it
Open `index.html` (served over HTTP so the sibling files load). It boots at the **KYC access gate** → click *Unlock portal* → lands on the **Portfolio dashboard**. Navigate via the top band. Click any holding or marketplace tile to open an **Instrument detail** page, then *Subscribe* to run the T+0 settlement flow (form → confirm → settled).

## Screens
1. **Login / KYC gate** (`Login.jsx`) — navy authority panel + access form. Compliance trust row, Sumsub/eIDAS framing.
2. **Portfolio dashboard** (`Portfolio.jsx`) — metric tiles (holdings value, instruments, next coupon, settlement) + holdings table with theme chips and settlement status.
3. **Marketplace** (`Marketplace.jsx`) — filterable grid of instrument tiles (navy header + mono data + min-investment footer).
4. **Instrument detail** (`InstrumentDetail.jsx`) — full instrument record, sticky subscribe rail, and the multi-step **SubscribeModal** (atomic DvP, EURC, Canton).
5. **Documents** (`Documents.jsx`) — confirmations, compliance records, AIFMD reports with Lucide doc icons.

## Architecture
- React 18 + Babel standalone (inline JSX), no build step.
- `data.js` → `window.PORTAL` (mock holdings, marketplace, documents, investor, formatters).
- `components.jsx` → shared primitives exported to `window`: `Icon` (Lucide hydration), `Wordmark`, `Eyebrow`, `Chip`, `Nav`, `StatPair`.
- `portal.css` imports `../tokens.css` and adds shell/nav/card/btn/chip/modal styles.
- Each screen exports its component to `window`; `App.jsx` orchestrates screen state and mounts.

## Brand application notes
- **Navy dominant, gold scarce** — gold appears only on the wordmark *s*, key data accents, focus rings, the single high-emphasis action.
- **Every figure is monospace** — ISINs, amounts, coupons, dates, tx hashes.
- **EB Garamond** for instrument names, page titles, panel headlines; **Poppins** for all UI/body.
- **Lucide** icons at 1.75 stroke; key-round is the recurring "unlock/subscribe" glyph echoing the mark.
- Parchment page, parchment-dark nav band with gold underline, soft navy-tinted card shadows, near-square radii.

## Components worth reusing
`Nav`, `Chip`, `StatPair`, `InstrumentTile` (Marketplace.jsx), `SubscribeModal` (InstrumentDetail.jsx), the metric-tile pattern, and the navy-header card pattern are the most reusable building blocks for new Clavoris surfaces.
