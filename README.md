# Sarie Eldin & Partners — Litigation Management System

A web application replacing a Microsoft Access database that has run the firm's
litigation practice since 2010.

**Status:** Stages 2 and 3 are complete. Task 3.5's high-impact quarantine
checkpoint is completed and accepted: migration 60 and the approved Task 3.5B
real application each executed exactly once against the local project
PostgreSQL database, producing 1,744 matters and 13,382 hearings while retaining
the original quarantine and source evidence. This was not the final Access
cutover; the Litigation Department continues to use Access. Task 4.0's
structural Arabic/RTL checker is complete. Task 4.0a Phase 1's D44–D49 database
foundation is **deployed and
verified**: project PostgreSQL is at migration 61, with 15/15 database checks
and 107/107 permanent historical-profile invariants. Phase 1 is operationally
complete. Its earlier disposable proof passed 93 checks before historical
upgrade and 107 after; canonical replay passed 89. Phase 2 implements the
read-only `/staff` roster and `/staff/[id]` detail for all four roles, with
distinct alias search, filters and pagination. Phase 3 adds Administrator-only
staff creation, editing, canonical rename, native alias lifecycle, team/reviewer
assignment and active/former transitions through the existing migration-61
gateways. Task 4.0a is complete and published, including Phase 4 browser interaction,
accessibility and final verification. See the
[Phase 4 completion report](docs/task-reports/2026-09-08-task-4-0a-phase-4-staff-roster-completion.md)
for the final browser matrix, five focused accessibility corrections, regression
results and project-preservation evidence. Task 4.1 remains unstarted.
The Access-source derivative disposition is recorded in
[D51](docs/DECISIONS.md#d51--access-source-derivative-and-migration-61-readiness)
with its [dated evidence summary](docs/reviews/2026-09-07-access-source-identity-discrepancy.md).
Task 4.1's approved contract is recorded in D52–D57 and its
[dated readiness review and owner resolutions](docs/reviews/2026-09-08-task-4-1-clients-readiness-review.md).
Task 4.1 and all four implementation phases remain unchecked and unstarted.
The next return point is **independent review of the Task 4.1 documentation
contract**, followed by separately authorized Phase 1 work. This checkpoint
authorizes neither implementation nor project-database deployment.
See the [deployment acceptance report](docs/task-reports/2026-09-07-task-4-0a-phase-1-migration-61-deployment.md),
[Phase 1 implementation report](docs/task-reports/2026-09-06-task-4-0a-phase-1-database-boundary.md)
and [complete invariant inventory](docs/testing/task-4-0a-phase1-invariants.md).
The Litigation Department continues using Access. Migration 61 was not final
Access cutover; final delta reconciliation remains governed by D43 and D51.
The owner-readable
migration result is in
[`docs/reconciliations/2026-08-30-gate-4.md`](docs/reconciliations/2026-08-30-gate-4.md);
current progress and work order are in [`TASKS.md`](TASKS.md). The dated
continuity evidence is preserved separately in
[`docs/reviews/2026-09-01-project-continuity-recovery-audit.md`](docs/reviews/2026-09-01-project-continuity-recovery-audit.md),
and the approved Task 3.3 contract and its readiness evidence are in
[`docs/reviews/2026-09-01-task-3.3-implementation-readiness-and-scope-reconciliation-audit.md`](docs/reviews/2026-09-01-task-3.3-implementation-readiness-and-scope-reconciliation-audit.md).
The complete Task 4.0a readiness evidence, recommendations and owner-resolution
map are preserved in
[`docs/reviews/2026-09-06-task-4-0a-staff-roster-readiness-audit.md`](docs/reviews/2026-09-06-task-4-0a-staff-roster-readiness-audit.md);
that dated review is evidence, while `docs/DECISIONS.md` and `TASKS.md` remain
the canonical decision and work-order authorities.
Task 3.3B's implementation and verification record is
[`docs/task-reports/2026-09-02-task-3-3b-append-only-event-foundation.md`](docs/task-reports/2026-09-02-task-3-3b-append-only-event-foundation.md).
Task 3.4's implementation and verification record is
[`docs/task-reports/2026-09-03-task-3-4-user-management.md`](docs/task-reports/2026-09-03-task-3-4-user-management.md).
Task 3.5A's package and validation record is
[`docs/task-reports/2026-09-03-task-3-5a-high-impact-review-package.md`](docs/task-reports/2026-09-03-task-3-5a-high-impact-review-package.md).
Task 3.5B's contract, disposable proof and accepted application checkpoint are recorded in
[`docs/task-reports/2026-09-04-task-3-5b-quarantine-application.md`](docs/task-reports/2026-09-04-task-3-5b-quarantine-application.md).

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

`MIGRATION_DATABASE_URL` is D35's isolated superuser migration/administration
connection; it must be absent from the production web process. The web
application uses only the separate restricted `DATABASE_URL` as
`litigation_runtime`. Every controlled non-test database script now obtains its
connection through the reviewed migration gateway: the gateway connects and
verifies the direct superuser identity before it exposes Prisma or invokes a
PostgreSQL work callback. Application database URLs accept only `postgres:` or
`postgresql:`. The application accepts usernames, not email addresses. The four initial
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

That runs ten checks in one sequence: TypeScript, ESLint, formatting,
Arabic/RTL rules, authorization inventory, audit structure, user-management
structure, staff structure, Git-ignore/storage rules and file encoding. All ten must pass.
`npm run format` fixes formatting automatically; `npm run lint:fix` fixes what
ESLint can fix.

`check:rtl` structurally parses `.tsx` and `.jsx` components with TypeScript and
`.css` stylesheets with PostCSS. It catches physical direction, directional
four-value shorthand, visible literal text outside `src/strings.ts`, raw colour
bypasses and malformed source. SCSS fails closed until the project deliberately
adopts a structural SCSS parser.

Note: since Next.js 16, `npm run build` no longer runs ESLint. `npm run check`
is the gate.

### Requirements

Node.js 22 or newer (see `.nvmrc`). Docker Desktop on Windows, Docker Engine
on the Ubuntu server.
