# Instructions for Codex / coding agents

You are building a litigation management web application for a law firm in
Cairo, replacing a Microsoft Access database.

**Before doing anything: read `README.md`, then `docs/PRD.md`, then
`docs/DECISIONS.md`, then `TASKS.md`.**

## Who you are working with

The owner is **not a programmer**. They run a law firm. They have never built
software before.

They can decide anything about **how the firm works** — what a matter is, who
should see what, which report matters. They cannot evaluate a technical
trade-off unless you explain it in ordinary language.

### How to communicate

**Always:**
- Plain language. No jargon without an everyday explanation.
- Concrete examples using their real data ("a lawyer searches for case
  1061/52ق and finds nothing because...").
- When there is a choice: give the options, the pros and cons, the **cost in
  time or money**, and then **your recommendation**.
- **Push back if you think a decision is wrong.** Say so directly and explain
  why. Do not quietly implement something you believe is a mistake.
- Separate "this needs your decision" from "this is just me telling you what
  I did". They should never have to hunt for the part that needs them.

**Never:**
- Ask them to choose between two technical options with no recommendation.
- Assume they know what a foreign key, a migration, an index or an ORM is.
- Show them a stack trace and ask what to do.
- Say "it depends" and stop.

### Example of the right tone

> I need a decision from you.
>
> Right now a lawyer can see every client's billing. Should a lawyer only see
> billing for clients they work on?
>
> - **See everything** — simplest, matches how Access works today. No extra work.
> - **See only their own** — more private, but 834 of your 1,730 matters have no
>   lawyer recorded, so their billing would be visible to nobody until someone
>   fills that in. About 2 days of work plus the data cleanup.
>
> **My recommendation: see everything for now.** Narrowing it later is easy;
> starting with a rule that hides half your matters would cause daily friction.

## Working rules

1. **Read `docs/DECISIONS.md` before proposing anything.** Those decisions were
   made after long analysis of the real data. If you think one is wrong, say so
   and explain — but do not silently do something different.

2. **Work through `TASKS.md` in order.** Each task is sized to one session.
   Do not jump ahead. Do not do three tasks at once.

3. **Commit after every working piece.** Small commits with clear messages. The
   owner's safety net is being able to undo. Never leave the repo broken.

4. **Never invent data.** If a value is missing, ask. Do not put in placeholder
   clients, lawyers or matters that look real.

5. **Never guess at Arabic legal terminology.** Check `docs/GLOSSARY.md`. If a
   term is not there, ask.

6. **The data is real and confidential.** Live client and case records. Do not
   copy it to any external service. Do not commit database dumps.

7. **Nothing is ever deleted in migration.** If a value cannot be mapped, it is
   parked in a review table with its original text intact. See
   `docs/MIGRATION.md`.

8. **Test with real volumes.** 13,279 hearings. A screen that is quick with 20
   rows may be unusable with thousands.

9. **Arabic first.** Every screen is right-to-left. Use CSS logical properties
   (`margin-inline-start`, not `margin-left`). Never hardcode a text string in
   a component — put it in the strings file. See `docs/BRAND.md`.

10. **When stuck, ask.** A short clear question costs the owner two minutes. A
    wrong guess can cost days.

## Technical baseline

- **Next.js** (App Router) + **TypeScript**
- **PostgreSQL** with **Prisma**
- **Auth.js** for login and roles
- **ExcelJS** for `.xlsx` export
- **Playwright** (headless Chromium) for PDF — required for correct Arabic
  rendering. Do not substitute another PDF library.
- **Docker Compose**

## If you are reviewing rather than building

The owner may ask you to review code written by another tool. In that case:

- Look for security problems, missing permission checks, and performance
  issues at real data volumes
- Check Arabic and right-to-left handling specifically
- Verify against `docs/DECISIONS.md` — flag anything that contradicts a
  recorded decision
- Report findings in plain language, ranked by how much they matter, with a
  clear "this is fine" or "this needs fixing before you use it"
