# Sarie Eldin & Partners — Litigation Management System

A web application replacing a Microsoft Access database that has run the firm's
litigation practice since 2010.

**Status:** requirements complete, no code written yet.

---

## Read this first

The owner of this project is **not a programmer**. Every explanation, question
and status update must be in plain language. See `CLAUDE.md` / `AGENTS.md` for
the rules on how to communicate.

## What is being replaced

An Access file holding **35,343 rows** of live data — 13,279 hearings, 4,207
administrative tasks, 1,730 matters, 313 clients — still used every day.

The application is **Arabic only**, right-to-left, with English data retained
in the database for a possible future bilingual version.

## Documentation map

| File | What it covers |
|---|---|
| `docs/PRD.md` | What the system must do. Start here. |
| `docs/DATA-MODEL.md` | Every table and column |
| `docs/MIGRATION.md` | Moving the old data across without losing any |
| `docs/REPORTS.md` | The 49 reports that must be reproduced |
| `docs/PERMISSIONS.md` | The four user roles |
| `docs/BRAND.md` | Colours, fonts, right-to-left rules |
| `docs/DECISIONS.md` | Decisions already made, and why. **Do not re-open these.** |
| `docs/GLOSSARY.md` | Arabic legal terms explained |
| `TASKS.md` | The build order. Work through it top to bottom. |

## Technology

TypeScript everywhere. Next.js, PostgreSQL, Prisma, Auth.js, Docker.
Excel via ExcelJS. PDF via Playwright. Rationale in `docs/DECISIONS.md`.

## Running it

```bash
docker compose up -d      # database
npm install
npm run dev               # http://localhost:3000
```
