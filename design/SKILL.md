---
name: clavoris-design
description: Use this skill to design or build any Clavoris surface — website pages, investor-portal screens, documents, decks — so it is on-brand. Contains the design tokens, fonts, logo assets, voice rules and a reference portal implementation.
user-invocable: true
---

Read `README.md` in this folder first. It states the brand in one paragraph,
the voice rules and where every file is.

Then:

1. **Tokens.** Link `tokens.css` (or consume `tokens.json`) and use its
   variables for every colour, size, radius, shadow and typeface. Do not
   redeclare hex values in components.
2. **Fonts.** EB Garamond for headlines, instrument names and the wordmark;
   Poppins for interface and body; the monospace data face for every figure,
   ISIN, date, hash and identifier. Files are in `../fonts/`.
3. **Assets.** Logos and the key mark are in `../assets/`. Use the reversed
   versions on navy.
4. **Portal patterns.** For app screens, start from `portal/`: the top band
   (`.nav`), cards, buttons (`.btn-primary`, `.btn-gold`, `.btn-ghost`), chips,
   metric tiles, the navy-header instrument tile and the subscribe modal are
   the reusable building blocks. Copy the patterns; keep the components small.
5. **Voice.** Third person for the platform, claims anchored to a framework or
   mechanism, British spelling, sentence case, no exclamation marks, no emoji.

Rules that bite: navy always dominant; gold never more than ~15% of a
composition and never body text on parchment; radii near-square (10 px max,
pills only for status chips); status is colour + label, never colour alone;
touch targets at least 44 px; text contrast 4.5:1 (3:1 at 24 px and above).

If the user invokes this skill without further instructions, ask what they want
to build, then act as an expert designer producing either static HTML mock-ups
or production code against these tokens, depending on the need.
