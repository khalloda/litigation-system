# Visual direction

Agreed from mockups, 23 August 2026. **Direction only — not a specification.**
Task 3.4's bounded `/users` administrative screen now applies the relevant
direction; the Stage 4 core screens and Stage 6 reports still must be revisited
with their real data in front of us.

This file records what was decided so the decisions are not re-argued, and so
whoever builds the first screen starts from something rather than nothing.

---

## 1. Light, not dark

A dark interface was mocked up and rejected. Two reasons, both practical:

- **Eye fatigue.** The Litigation Assistant is on these screens for hours.
  Dark reads well for ten seconds and tires by hour four.
- **Print continuity.** Reports come off this system constantly and are white.
  A dark interface beside a white printed page in the same workflow jars.

**Surfaces:** off-white `#EEEDE8` page, white `#FFFFFF` cards, `#FBFAF7` for
alternating rows, `#F6F4EE` for inset panels.

Deep emerald is used **sparingly and with intent** — the darkest block on a
screen should be the most urgent thing on it. On the matter screen that is the
next hearing date.

---

## 2. Colour carries meaning, consistently

The same three signals everywhere, on screen and in print. Never decorative.

| Colour | Meaning | Screen | Print |
|---|---|---|---|
| Teal `#46A398` / `#0F6E56` | settled, favourable, `صالح` | badge, timeline segment | badge |
| Gold `#B6AA92` / `#9C9174` | waiting, pending, out of the safe | badge, dashed rule | rule, watermark |
| Terracotta `#802F1C` / `#993C1D` | needs attention, `ضد`, overdue | badge, count | badge |
| Emerald `#214B4B` / `#163232` | structure, headings, most urgent block | header, hero number | header, rules |

**A number in terracotta means someone must act.** Do not use it for emphasis.

---

## 3. Composition — what the mockups established

### The case number is the hero

In Access it is a cramped text box. On the matter screen it is the largest
element, with the stacked numbers in descending weight:

```
83066 / 69ق      30px  #163232
10714 / 72ق      20px  #2B605C
9239 / 72ق       20px  #9C9174
```

This is D9 made visible. 18% of matters hold several case numbers recording the
matter's route through the courts, and that route is what a lawyer scans for
first. **Never collapse them to one line.**

### The timeline is a spine

Hearings render as horizontal segments, coloured by outcome, with the upcoming
hearing dashed in gold. `صالح/ضد` stops being a table column and becomes the
shape of the case at a glance.

### Party capacity sits under the party name

`تويوتا مصر للتجارة` then `طاعن` beneath it, quieter. Matches how the firm's
printed reports already present it. In print, guillemets: `«مطعون ضده»`.

### Absence is stated, not blank

**981 of the current 1,689 transformed matters have no target lawyer
relationship.** Show `لم يُكلَّف أحد` in gold, not an empty cell. The earlier
834 of 1,730 figure was the planning snapshot. The same rule applies to any
field the source data genuinely lacks.

### Search says what it matched

When a search resolves through aliases or the normaliser, show it:

> يشمل البحث: أحمد إسماعيل · احمد اسماعيل · أحمد اسماعيل

This is the alias table doing visible work. Without it, a user who typed no
hamza cannot tell whether the system understood them.

---

## 4. The Kufic motif

Derived from the firm's emblem — square Kufic, strict grid, thick strokes
interlocking at right angles. Reads as calligraphic, not decorative.

### Where it appears

| Scale | Use | Treatment |
|---|---|---|
| 76px+ | Empty states | Pale `#DDD9CE`, one gold square at centre |
| 18px | Section headers | Gold `#B6AA92` on emerald band, beside the title |
| 150px | Report watermark, signature blocks | 4.5–5% opacity, bleeding off a corner |
| Full panel | Login screen only | Tonal field with sparse gold and teal accents |

### Where it must NOT appear

**Never over data.** No motif on lists, tables, or any panel containing records.
A screen full of hearings needs no ornament — the data is the interest.

### Rules

- **One accent square per glyph, at most.** The geometry carries it; colour
  punctuates.
- The login panel is the only place the motif is allowed to be bold. It sets
  the tone once, on a screen nobody works in.

---

## 5. Reports

Everything structural in the firm's existing reports is preserved — see
`docs/REPORT-LAYOUTS.md`, which remains authoritative for layout. This adds
only the branding treatment.

- **Emblem watermark** at 5% opacity, top outer corner, on every report
- **Double rule** under the header — 2px gold `#B6AA92` over 1px emerald
  `#214B4B`. Gives the page a signature without weight.
- **Alternating row tint** `#FBFAF7`, replacing per-cell borders with a single
  bottom hairline. Tracks the eye across a wide row and prints cleanly on any
  laser printer.
- **Signature blocks** carry the watermark and a gold rule — this is where a
  printed page otherwise looks most bare.

---

## 6. Settled — numerals are Western

**Decided 23 August 2026. Western digits everywhere, in the interface and in
reports.**

The mockups used Arabic-Indic (`٤٩٣`, `٢٠٢٦`) because they read naturally in
an Arabic interface. The firm ruled against it, and the reasoning is recorded
in `docs/BRAND.md` rule 3 so it is not reopened:

- **Print continuity decides it.** The firm's work leaves the system on paper
  constantly and the existing reports are Western. This is the only option
  where a screen and a printout from it agree.
- Mixing splits the interface against itself — `٤٩٣` above `1039` on one
  screen.
- Converting on display means the first missed conversion shows a bare `493`
  and reads as a bug rather than a choice.
- The 19 August planning inspection found zero Arabic-Indic digits in its
  35,343-row snapshot. Gate 4 later measured 35,638 current user-table rows;
  the earlier figure is historical evidence for this settled display choice,
  not the current migration total.

**Search accepts `٠-٩` regardless and always did** — `ar_normalise()` folds
them and `npm run db:check` asserts it. A user may type Arabic-Indic; the
interface never displays it.

**The palette gap this file exposed is also settled.** The five tints used
here were not an oversight to fold in quietly — they were the first symptom of
a real gap, and `docs/BRAND.md` is now split into two layers: a fixed
twelve-colour brand palette, and a derived, extensible UI token set. All five
are seeded as Layer 2 tokens with their derivations, and `npm run check:rtl`
now fails on any raw colour outside the token definitions.

## 7. User management — implemented Task 3.4

The Administrator-only Arabic/RTL `/users` screen uses the light surface and
emerald structure above without placing the Kufic motif over account data. It
shows approximately ten accounts as responsive cards, including disabled
accounts, with textual role, enablement, password, lock and last-login states.
Western digits are retained, while username and password controls use isolated
left-to-right treatment inside the RTL page.

Creation is visibly limited to eligible existing active staff. Username, role,
disable, reactivate and password-reset operations are separate labelled
disclosures rather than one ambiguous edit form. Disablement uses terracotta
only as an additional warning signal, names the affected person and describes
the consequence; it is never called deletion. Password fields are hidden,
uncontrolled, marked `new-password`, entered twice and reset after every server
result. Live feedback, visible focus, logical source order and a single-column
narrow-screen layout preserve keyboard and mobile use.

This is Task 3.4 evidence, not a universal component specification and not a
start on Task 4.0. Staff identity maintenance remains Task 4.0a, and audit
history remains Task 4.9.

## 8. Audit history — owner-approved direction, deferred

Recovered owner conversation evidence from 31 August 2026 confirms the hybrid
audit-history direction. It is approved visual/product direction, but nothing
in this section has been implemented. Task 3.3A and 3.3B build attribution and
events only; the UI is the later Task 4.9 checkpoint and requires a separate
implementation prompt.

### Two connected views

- A contextual Arabic/RTL entity-history drawer, opened from the record being
  reviewed.
- A global audit page available to Administrators.

Both views group field changes made in one save event, show before/after
differences, group history by date, and support date/user/action filters plus
search by changed field or value. Long histories use pagination or load-more
behavior. Actions use Arabic labels; an icon is always accompanied by text.
Archive and restore are the lifecycle terms, consistently with D25.

On mobile, the contextual history becomes a full-screen sheet. Keyboard order,
focus entry, focus return and visible focus are required. The views use the
Sarie Eldin palette, bundled Noto Naskh Arabic and the typography/composition
rules in this file; colour and icons never carry meaning alone.

Decision D31 controls access separately from layout: every Administrator may
view, while audit export requires a separate account capability initially held
only by `KHelmy`. The interface must not imply a fifth Owner role.

The recovered Figma artifact is evidence of the approved direction, but its
particular dimensions, spacing and component selections are not automatically
universal requirements. Re-evaluate those details with the real event volumes,
screen context and responsive behavior when Task 4.9 begins.

## 9. What this file is not

- Not a component library
- Not a specification anyone should build from without revisiting
- Not final — every screen gets reviewed with real data at Stage 4 and Stage 6

Fonts in the mockups were wrong (system Arabic). The real thing uses **Noto
Naskh Arabic, bundled**, per `docs/BRAND.md`.
