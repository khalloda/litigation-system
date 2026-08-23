# Brand, language and layout

## Colours — two layers

The palette has **two layers**, and they are governed differently. Collapsing
them was the mistake this section used to make.

**Layer 1 — the brand palette.** Fixed, twelve colours, from the firm's
identity guidelines. Governs identity: the logo, report headers, the Kufic
motif, anything a client sees as the firm's mark. **Nothing may be added here
without the firm.**

**Layer 2 — UI tokens.** Derived, extensible, governs the interface. Every
token must trace to a Layer 1 colour, say which one and why, and be **named by
role, never by appearance** — `--row-alt`, not `--light-cream`.

### Why two layers

Twelve colours are right for an identity. They cannot run an interface. A
working screen needs hover and active states, focus rings, disabled text,
selected rows, several weights of divider, a scrim behind a dialog, and
colours that pass contrast as small text on white — none of which identity
design considers. `#46A398` fails as body text on white; `#0F6E56` exists
because of it.

This section used to read "use these and nothing else". Left that way it
guaranteed the opposite of what it intended: by Stage 4 there would be thirty
undocumented colours, invented one at a time across different files, because
somebody needed a hover state and had nowhere to put it.

### The rule

> **Layer 1 is fixed and requires the firm. Layer 2 may be extended during the
> build, but every token must derive from Layer 1, be named by role, and record
> why it exists. A colour that appears in a component without a token is a
> defect.**

**`npm run check:rtl` enforces the last sentence** and fails on any raw hex in
a `.tsx` file, or in a stylesheet anywhere except the line that defines a
token. That is what makes the rule real rather than aspirational — the same
reasoning as the right-to-left checks: a violation is invisible until somebody
opens the screen.

A deliberate exception needs an `rtl-ok` comment saying why. There is exactly
one in the codebase, on the task 0.4 page, where the hex is the *expected
value* being verified rather than a style.

## Layer 1 — the brand palette

Fixed. From the firm's brand guidelines.

| Role | Name | Hex |
|---|---|---|
| Primary | Emerald Green | `#214B4B` |
| Primary dark | Dark Emerald | `#163232` |
| Primary mid | | `#2B605C` |
| Accent | Teal | `#46A398` |
| Accent warm | Light Gold | `#B6AA92` |
| Accent warm dark | | `#9C9174` |
| Background | Off-white | `#EEEDE8` |
| Surface | White | `#FFFFFF` |
| Text | Charcoal | `#1E1E1E` |
| Text muted | | `#333333` |
| Border | | `#C7C7C7` |
| Alert / destructive | Terracotta Red | `#802F1C` |

**Balance: 60% background, 30% primary, 10% accent.** The interface should read
mostly light, with emerald green for headers, navigation and primary actions.
Terracotta red is reserved for warnings and destructive actions — never
decoration.

## Layer 2 — UI tokens

Derived from Layer 1. Extensible during the build, one token at a time, each
disclosed and each recording its derivation.

| Token | Value | Derived from | Why it exists |
|---|---|---|---|
| `--row-alt` | `#FBFAF7` | off-white `#EEEDE8` | alternating row, screen and print |
| `--panel-inset` | `#F6F4EE` | off-white `#EEEDE8` | inset panel background |
| `--hairline` | `#DDD9CE` | border `#C7C7C7` | divider on white; pale motif fill |
| `--text-positive` | `#0F6E56` | teal `#46A398` | teal fails contrast as small text on white |
| `--text-attention` | `#993C1D` | terracotta `#802F1C` | same reason |

**The rest of the token set is deliberately not built yet.** Real screens
reveal what is actually needed, and a palette designed in advance guesses
wrong. Further tokens are derived at Stage 4 as each screen demands one — each
disclosed, each with its derivation added to this table.

The values live in `src/app/globals.css`, which is the only file allowed to
contain a raw colour.

## Logo

- `logo.png` — full lockup, bilingual. Use on login and printed report headers.
- `emblem.png` — square Kufic mark. Use as favicon and collapsed sidebar.

## Language and direction

**Arabic only. Right-to-left everywhere.**

```html
<html lang="ar" dir="rtl">
```

### Rules

1. **Use CSS logical properties.** `margin-inline-start`, not `margin-left`.
   `padding-inline-end`, not `padding-right`. This costs nothing now and saves a
   full restyle if a left-to-right version is ever needed.

   **Enforced.** `npm run check:rtl` fails on any physical direction in a
   stylesheet, and is part of `npm run check`. A deliberate exception needs an
   `rtl-ok` comment on the line or the one above it, saying why.

2. **No hardcoded strings in components.** Every visible string lives in
   `src/strings.ts`:

   ```ts
   export const t = {
     matters: { title: 'الدعاوى', newMatter: 'دعوى جديدة' },
     clients: { title: 'العملاء' },
   } as const;
   ```

   No i18n library in Phase 1 — one language does not need one. But this file
   makes a future second language a mechanical change.

   **Enforced.** `npm run check:rtl` fails on any Arabic character inside a
   `.tsx` file outside a comment.

3. **Numbers are Western (0–9) everywhere. SETTLED, 23 August 2026.**

   The interface displays Western digits. So do the reports. The mockups used
   Arabic-Indic (`٤٩٣`, `٢٠٢٦`) because they read naturally in an Arabic
   interface, and the firm considered it properly before ruling against it.

   **The reasoning, so this is not reopened:**

   - **Print continuity decides it.** This firm's work leaves the system on
     paper constantly, and the existing printed reports are Western. Western
     everywhere is the only option where a screen and a printout from it
     agree.
   - Mixing them splits the interface against itself: a matter count in `٤٩٣`
     above a case number in `1039` on the same screen.
   - Converting on display means the first missed conversion shows a bare
     `493` in an otherwise Arabic-Indic screen — which reads as a bug rather
     than a choice.
   - The data agrees: **zero** Arabic-Indic digits in all 35,343 rows.

   **Search accepts `٠-٩` regardless, and that is built** — `ar_normalise()`
   folds them, and `npm run db:check` asserts it. A user may type Arabic-Indic;
   the interface never displays it.

4. **Mixed direction is normal.** Case numbers look like `1039 / 20ق`; client
   names like `شركة هيوليت باكارد HP`. Let the browser's bidirectional algorithm
   handle it. Do not reverse strings manually — that is always wrong.

5. **Multi-line fields must show all lines.** Case numbers, party names and
   capacities contain deliberate line breaks. Never collapse to a single line.

## Fonts

**Noto Naskh Arabic**, variable weight 400–700, bundled in `public/fonts/` —
never loaded from a CDN and never relying on the user's system fonts. Three
subsets: Arabic, Latin and Latin Extended. See `public/fonts/README.md`. The PDF renderer runs
on a server with no fonts installed; if the font is not bundled, Arabic will
render as empty boxes.

## Printed reports

- Right-to-left page layout; page numbers mirror
- Firm logo in the header
- Emerald green headings, charcoal body text
- Generated by rendering HTML in headless Chromium (Playwright)
