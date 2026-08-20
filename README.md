# Sarie Eldin & Partners — Litigation Management System

A web application replacing a Microsoft Access database that has run the firm's
litigation practice since 2010.

**Status:** Stage 0 complete — the application skeleton, the database, and
the Arabic right-to-left layout all run. Stage 1 (the database schema) is
next. Progress is tracked in `TASKS.md`.

---

## Read this first

The owner of this project is **not a programmer**. Every explanation, question
and status update must be in plain language. See `CLAUDE.md` / `AGENTS.md` for
the rules on how to communicate.

## What is being replaced

An Access file holding **35,343 rows** of live data — 13,279 hearings, 4,207
administrative tasks, 1,730 matters, 313 clients — still used every day.

Of those, **30,553 rows migrate**; the remaining 4,790 are archived tables the
firm dropped (meetings and old copies). See `docs/MIGRATION.md`.

The application is **Arabic only**, right-to-left, with English data retained
in the database for a possible future bilingual version.

## Documentation map

| File | What it covers |
|---|---|
| `docs/PRD.md` | What the system must do. Start here. |
| `docs/DATA-MODEL.md` | Every table and column |
| `docs/MIGRATION.md` | Moving the old data across without losing any |
| `docs/REPORTS.md` | The 45 reports that must be reproduced |
| `docs/REPORT-LAYOUTS.md` | House style for printed reports, from real samples |
| `docs/DECISIONS-ADDENDUM.md` | Merged into `DECISIONS.md` — kept as a pointer |
| `docs/PERMISSIONS.md` | The four user roles |
| `docs/BRAND.md` | Colours, fonts, right-to-left rules |
| `docs/DATABASE.md` | Running the database, and what to do when it complains |
| `docs/DECISIONS.md` | Decisions already made, and why. **Do not re-open these.** |
| `docs/GLOSSARY.md` | Arabic legal terms explained |
| `TASKS.md` | The build order. Work through it top to bottom. |

## Technology

TypeScript everywhere. Next.js, PostgreSQL, Prisma, Auth.js, Docker.
Excel via ExcelJS. PDF via Playwright. Rationale in `docs/DECISIONS.md`.

## Running it

```bash
cp .env.example .env
npm install
npm run db:up             # PostgreSQL 17 in Docker, on port 5433
npm run db:migrate        # build the schema inside it
npm run db:check          # confirm the application can reach it
npm run dev               # http://localhost:3000
```

`npm run db:verify` confirms the database is set up correctly — every line
must read PASS. Full details, including what to do when something is wrong,
are in `docs/DATABASE.md`.

### Before every commit

```bash
npm run check
```

That runs four things in one go: the TypeScript type check, ESLint, the
formatting check, and `check:rtl`. All four must pass. `npm run format` fixes
formatting automatically; `npm run lint:fix` fixes what ESLint can fix.

`check:rtl` catches the two mistakes that are invisible until someone opens
the screen: a physical CSS direction (`margin-left` instead of
`margin-inline-start`), and an Arabic string written inside a component
instead of in `src/strings.ts`.

Note: since Next.js 16, `npm run build` no longer runs ESLint. `npm run check`
is the gate.

### Requirements

Node.js 22 or newer (see `.nvmrc`). Docker Desktop on Windows, Docker Engine
on the Ubuntu server.
