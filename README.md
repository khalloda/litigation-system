# Sarie Eldin & Partners — Litigation Management System

A web application replacing a Microsoft Access database that has run the firm's
litigation practice since 2010.

**Status:** Stage 2 migration and Gate 4 reconciliation are complete. Stage 3
authentication, server-side role permissions and Task 3.3A secure actor
attribution are complete. **Task 3.3B — Append-only event foundation is
approved but not started, and is the exact return point.** The owner-readable
migration result is in
[`docs/reconciliations/2026-08-30-gate-4.md`](docs/reconciliations/2026-08-30-gate-4.md);
current progress and work order are in [`TASKS.md`](TASKS.md). The dated
continuity evidence is preserved separately in
[`docs/reviews/2026-09-01-project-continuity-recovery-audit.md`](docs/reviews/2026-09-01-project-continuity-recovery-audit.md),
and the approved Task 3.3 contract and its readiness evidence are in
[`docs/reviews/2026-09-01-task-3.3-implementation-readiness-and-scope-reconciliation-audit.md`](docs/reviews/2026-09-01-task-3.3-implementation-readiness-and-scope-reconciliation-audit.md).

---

## Read this first

The owner of this project is **not a programmer**. Every explanation, question
and status update must be in plain language. See [`AGENTS.md`](AGENTS.md) and
[`CLAUDE.md`](CLAUDE.md) for the rules on how to communicate and perform work.

## What is being replaced

At the 19 August 2026 planning snapshot, the Access file held **35,343 rows**
of live data — 13,279 hearings, 4,207 administrative tasks, 1,730 matters and
313 clients. The file remains in daily use, so current migration counts are in
`TASKS.md` rather than frozen here.

Those are the dated planning figures. Gate 4 measured the authoritative source
at **35,638 rows**: 30,847 migration-source rows, 38 reference-only rows and
4,753 archive-only rows. See `docs/MIGRATION.md` for the distinction.

The application is **Arabic only**, right-to-left, with English data retained
in the database for a possible future bilingual version.

## Documentation map and authority

| Authority | What it owns |
|---|---|
| [`AGENTS.md`](AGENTS.md) | Current highest Codex/project operating instruction: how work must be performed and which durable rules apply. |
| [`CLAUDE.md`](CLAUDE.md) | Shared durable development rules incorporated by `AGENTS.md`, including the binding working rules. |
| [`docs/DECISIONS.md`](docs/DECISIONS.md) | Approved product and data decisions. Do not silently override or reopen them. |
| [`TASKS.md`](TASKS.md) | Work order, completion status and the exact current return point. |
| [`docs/GLOSSARY.md`](docs/GLOSSARY.md) | Approved Arabic field meanings and terminology. |
| [`docs/MIGRATION.md`](docs/MIGRATION.md) and [Gate 4](docs/reconciliations/2026-08-30-gate-4.md) | Migration identities, source accounting, reconciliation and reproducible evidence. |
| [`docs/PERMISSIONS.md`](docs/PERMISSIONS.md) | Authorization and lifecycle policy for the four roles. |
| [`docs/PRD.md`](docs/PRD.md) | What the system must do. |
| [`docs/DATA-MODEL.md`](docs/DATA-MODEL.md) | Logical schema and field semantics. |
| [`docs/REPORTS.md`](docs/REPORTS.md) and [`docs/REPORT-LAYOUTS.md`](docs/REPORT-LAYOUTS.md) | The 45-report inventory and authoritative printed layouts. |
| [`docs/BRAND.md`](docs/BRAND.md) and [`docs/VISUAL-DIRECTION.md`](docs/VISUAL-DIRECTION.md) | Arabic/RTL design rules and agreed visual direction. |
| [`docs/DATABASE.md`](docs/DATABASE.md) | Safe database operation and verification. |
| [`docs/STAGE-2-PLAN.md`](docs/STAGE-2-PLAN.md) | Owner-approved historical Stage 2 plan and completion context. |
| [`docs/task-reports/README.md`](docs/task-reports/README.md) | Required dated acceptance-evidence format for Task 3.3 onward. |

`AGENTS.md` and `CLAUDE.md` govern how work is performed;
`docs/DECISIONS.md` governs approved product and data decisions; and `TASKS.md`
governs work order and status. Code, migrations and tests prove what is
implemented, but cannot silently override an owner decision. Dated files under `docs/reviews/`,
`docs/reconciliations/` and `docs/task-reports/` are evidence snapshots, not
current task or decision authorities. `HANDOFF.md` is a superseded historical
checkpoint; use this README and `TASKS.md` to resume work.

## Technology

TypeScript everywhere. Next.js, PostgreSQL, Prisma, Auth.js, Docker.
Excel via ExcelJS. PDF via Playwright. Rationale in `docs/DECISIONS.md`.

## Running it

```bash
cp .env.example .env
# Set a private AUTH_SECRET of at least 32 random bytes.
# Set both database URLs to different principals, set CLIENT_LOGO_ROOT to a
# local folder; production uses
# /var/lib/litigation/client-logos.
npm install
npm run db:prepare-local-runtime # existing local setups only; does not print the generated password
npm run db:up             # PostgreSQL 17 in Docker, on port 5433
npm run db:migrate        # build the schema inside it
npm run db:provision-runtime # set and verify the restricted runtime password
npm run db:check          # confirm the application can reach it
npm run auth:set-password -- KHelmy  # interactive; repeat for each approved username
npm run dev               # http://localhost:3000
```

`MIGRATION_DATABASE_URL` is the privileged schema/administration connection;
the web application uses the separate restricted `DATABASE_URL` as
`litigation_runtime`. The application accepts usernames, not email addresses. The four initial
accounts have no password in Git or in their migration; the owner initializes
each one locally with `auth:set-password`, which hides input and forces a
change at first login. See `docs/DATABASE.md` for the complete procedure.

Server authorization is defined once in `src/lib/auth/permissions.ts` and
enforced through the Auth.js-backed guards and wrappers in
`src/lib/auth/authorization.ts`. Every App Router page and Route Handler, and
every project-owned Server Action in the repository, is listed in
`src/lib/auth/route-inventory.ts`. The permission test fails if a future entry
point is unclassified, uses the wrong import or permission, authorizes after
protected work, relies only on `proxy.ts`, or uses a mutable/aliased protected
export; each exported HTTP method is checked separately. The only permitted
routing root is `src/app`: root `app`, root `pages` and `src/pages` fail the
check. JavaScript and TypeScript source in `.js`, `.jsx`, `.ts`, `.tsx`,
`.mjs`, `.mts`, `.cjs` and `.cts` is inspected; App Router `page.*` and
`route.*` follow the statically verified `pageExtensions` setting (the current
Next.js default is `tsx`, `ts`, `jsx`, `js`). An extension or configuration
the checker cannot prove fails closed. Generated Prisma output is the only
narrow source-tree exclusion. The lightweight inventory check is also part of
`npm run check`; run the full `npm run test:permissions` after adding any route
or action.

`npm run db:verify` confirms the database is set up correctly — every line
must read PASS. Full details, including what to do when something is wrong,
are in `docs/DATABASE.md`.

### Before every commit

```bash
npm run check
```

That runs seven checks in one sequence: TypeScript, ESLint, formatting,
Arabic/RTL rules, authorization inventory, Git-ignore/storage rules and file
encoding. All seven must pass. `npm run format` fixes formatting automatically;
`npm run lint:fix` fixes what ESLint can fix.

`check:rtl` catches the two mistakes that are invisible until someone opens
the screen: a physical CSS direction (`margin-left` instead of
`margin-inline-start`), and an Arabic string written inside a component
instead of in `src/strings.ts`.

Note: since Next.js 16, `npm run build` no longer runs ESLint. `npm run check`
is the gate.

### Requirements

Node.js 22 or newer (see `.nvmrc`). Docker Desktop on Windows, Docker Engine
on the Ubuntu server.
