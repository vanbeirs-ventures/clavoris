# Clavoris — design source

The single source of truth for how Clavoris looks, shared by the public website
(this repository's root) and the investor-portal app. Anything that renders a
Clavoris surface should read its colours, type and spacing from here rather than
redeclaring them.

| Path | What it is |
|---|---|
| `tokens.css` | Canonical token sheet: `@font-face`, colour palette, semantic foreground/background, type scale, spacing, radii, borders, elevation, motion, and the `.cl-*` text-style classes. Identical to `assets/colors_and_type.css` used by the website, with font paths rebased to `../fonts/`. |
| `tokens.json` | The same tokens as structured data, generated from `tokens.css`, for build tooling (Tailwind preset, Style Dictionary, native apps). Regenerate it when `tokens.css` changes; never edit by hand. |
| `portal/` | Reference implementation of the investor portal: login / KYC gate, portfolio, marketplace, instrument detail with the T+0 subscribe flow, documents. React 18 + Babel standalone, no build step — open `portal/index.html`. Mock data only. |
| `SKILL.md` | Agent skill so Claude Code (or any agent) designs and codes on-brand from this folder. |
| `../fonts/` | EB Garamond (variable, roman + italic) and Poppins 300–700 as self-hosted woff2. |
| `../assets/` | Logo lockups and the key mark, normal and reversed, plus the website hero image. |

The design canvas for the website and portal screens, and the browsable design
system with specimen cards, live as Claude artifacts
("Clavoris — Website & App" and "Clavoris Design System"). Changes to the look
are made there first, then brought into `tokens.css`.

## The brand in one paragraph

Clavoris is the *bearer of keys*: institutional, precise, reserved. European
financial-manuscript tradition meets institutional fintech. Deep **Clavis Navy**
(`#1A3A5C`) is always dominant; **Seal Gold** (`#B8860B`) is a precision accent
used like a wax seal and never more than about 15% of a composition;
**Parchment** (`#F7F3EC`) replaces pure white on branded surfaces, with pure
white reserved for on-screen content cards. Headlines and instrument names are
set in EB Garamond, interface text in Poppins, and every financial figure,
ISIN, date and hash in a monospace data face. Radii stay near-square, borders
hairline, shadows soft and navy-tinted. No photography-led backgrounds, no
gradients as decoration, no emoji.

## Voice

The platform speaks in the third person ("Clavoris provides…", never "we").
Claims are anchored to a framework or mechanism (MiFID II, AMLD6, Canton,
Daml, T+0, EURC, CSSF). British/EU spelling, sentence case for UI and body,
uppercase tracked eyebrows, no exclamation marks, no superlatives without
evidence, no promise of returns.

## Using the tokens

```html
<link rel="stylesheet" href="design/tokens.css">
```

```css
body { background: var(--bg-page); color: var(--fg-1); font-family: var(--font-ui); }
h1   { font-family: var(--font-display); color: var(--clavis-navy); }
.isin, .amount { font-family: var(--font-data); font-variant-numeric: tabular-nums; }
```

For a Tailwind or native build, consume `tokens.json`.

## Status chips, in colour and label only

| State | Colour token | Background |
|---|---|---|
| Verified / settled | `--status-verified` | `--verified-bg` |
| Pending | `--status-pending` (= seal gold) | `--pending-bg` |
| Alert / failed | `--status-alert` | `--alert-bg` |
| Informational | `--status-info` | — |

Status is never conveyed by colour alone: pair the colour with a label and,
where used, a Lucide line icon (`check-circle`, `clock`, `alert-triangle`).

## Iconography

Lucide (MIT), 1.5–2 px stroke, sizes 16 / 20 / 24, inheriting text colour.
The key mark (`../assets/clavoris-mark.png`) is the hero glyph: favicon,
watermark at 6–8% opacity, email signature. Never rotated, distorted or
gradient-filled.

## Deploy note

Everything in this repository outside `.git/`, `.github/` and `README.md` is
uploaded to the website CDN on push to `main`. `design/` is excluded from that
upload by the workflow, so it never reaches the public site.
