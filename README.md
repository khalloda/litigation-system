# Sarie Eldin & Partners — Litigation Management System

A web application replacing a Microsoft Access database that has run the firm's
litigation practice since 2010.

**Current status — 11 September 2026:** Khaled Helmy accepted the reviewed
migration-63 local-development milestone after independent operational PASS.
Task 4.1a implementation/correction/acceptance is published through
`2b866bae7929149c1ad200661225f4c2098f366d`. The captured development database
has 63 applied migrations, one historical rollback and zero unfinished, with
121 invariant and 15 setup checks passed. The immediate stop is independent
review of this new, unpublished documentation commit. See the
[development acceptance record](docs/task-reports/2026-09-11-migration63-development-acceptance.md)
and preserved [operational review](docs/reviews/2026-09-11-migration63-operational-independent-review.md).
Windows is development; the final app and database target an Ubuntu VM with
Docker. Production validation and final Access cutover remain separate.
See the
[implementation report](docs/task-reports/2026-09-10-task-4-1a-client-logos.md)
and [acceptance matrix](docs/testing/task-4-1a-acceptance-matrix.md), with the
[R1/R2 correction report and acceptance addendum](docs/task-reports/2026-09-11-task-4-1a-corrections.md#owner-acceptance-addendum--11-september-2026)
and preserved [independent correction review](docs/reviews/2026-09-11-task-4-1a-correction-independent-review.md).

**Earlier accepted checkpoints:** Stages 2 and 3 are complete. Task 3.5's high-impact quarantine
checkpoint is completed and accepted: migration 60 and the approved Task 3.5B
real application each executed exactly once against the local project
PostgreSQL database, producing 1,744 matters and 13,382 hearings while retaining
the original quarantine and source evidence. This was not the final Access
cutover; the Litigation Department continues to use Access. Task 4.0's
structural Arabic/RTL checker is complete. Task 4.0a Phase 1's D44–D49 database
foundation is **deployed and
verified**: its 7 September acceptance passed 15/15 database checks
and 107/107 permanent historical-profile invariants at migration 61. Phase 1 is operationally
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
results and project-preservation evidence. Task 4.1 Phase 1 is now deployed,
verified and operationally complete. At that acceptance, PostgreSQL had 62 applied migrations,
zero pending or unfinished, 15/15 database checks and 116/116 historical invariants.
The Access-source derivative disposition is recorded in
[D51](docs/DECISIONS.md#d51--access-source-derivative-and-migration-61-readiness)
with its [dated evidence summary](docs/reviews/2026-09-07-access-source-identity-discrepancy.md).
Task 4.1's approved contract is recorded in D52–D57 and its
[dated readiness review and owner resolutions](docs/reviews/2026-09-08-task-4-1-clients-readiness-review.md).
Task 4.1 Phase 2 was accepted by Khaled Helmy on 9 September 2026 after independent
implementation and correction review: read-only client/contact
pages, distinct search/filter/paging and independently guarded existing-logo display
for all four roles. See the [Phase 2 implementation report](docs/task-reports/2026-09-09-task-4-1-phase-2-read-only-clients.md).
Phase 2 and its acceptance documentation were subsequently published through
`82ca95c439e554bc8b55ffb3de0873827f8f3751`. Task 4.1 Phase 3 implements authorized
client/contact creation/editing and Administrator archive/restore through the
existing gateways. Its [independent review](docs/reviews/2026-09-10-task-4-1-phase-3-independent-review.md)
passed, and Khaled Helmy accepted Phase 3 on 10 September 2026 at
`77baf2af2d079457f28ce1632f68e3f411cbdc48`; see the [dated acceptance addendum](docs/task-reports/2026-09-10-task-4-1-phase-3-client-contact-mutations.md#acceptance-addendum--10-september-2026).
Phase 3 is accepted and published through
`9f61ba481fbebdb2b0d54e470e43cd8d26014265`, verified by the preserved
[publication review](docs/reviews/2026-09-10-task-4-1-phase-3-publication-independent-review.md).
The separately authorized Phase 4 final verification passed locally; its
[report](docs/task-reports/2026-09-10-task-4-1-phase-4-final-acceptance.md) and
[pre-execution matrix](docs/testing/task-4-1-phase4-acceptance-matrix.md) distinguish
fresh evidence, accepted evidence reuse and historical limitations.
Independent Phase 4 review passed, and Khaled Helmy accepted Phase 4 and
Task 4.1 overall on 10 September 2026 at
`d4eed39612cf16b3a44808e056a21857642dc167`. See the preserved
[independent review](docs/reviews/2026-09-10-task-4-1-phase-4-independent-review.md),
[report acceptance addendum](docs/task-reports/2026-09-10-task-4-1-phase-4-final-acceptance.md#owner-acceptance-addendum--10-september-2026)
and [matrix acceptance addendum](docs/testing/task-4-1-phase4-acceptance-matrix.md#owner-acceptance-addendum--10-september-2026).
Task 4.1 publication review is closed; its supplied
[publication review](docs/reviews/2026-09-10-task-4-1-publication-independent-review.md)
is preserved byte-identically. Task 4.1a's R1/R2 correction review passed and
Khaled Helmy accepted the corrected implementation on 11 September 2026. The
current stop is independent review of the migration-63 development-acceptance
documentation commit. Older report/review wording records earlier checkpoints.
See the [migration-62 deployment acceptance report](docs/task-reports/2026-09-09-task-4-1-phase-1-migration-62-deployment.md), its
[implementation report](docs/task-reports/2026-09-09-task-4-1-phase-1-database-foundation.md)
and [116/98-check profile inventory](docs/testing/task-4-1-phase1-invariants.md).
Task 4.1 overall and Task 4.1a remain accepted and checked. Task 4.1a is
published through the reviewed source above; migration 63 and bounded loopback
activation are accepted for local development. Production deployment is separate.
The Phase 3 report retains its
historical late-matrix and untested screen-reader speech limitations. Phase 4
preserves its initial matrix, proves nonempty archive/report visibility and
records its browser evidence. Actual screen-reader speech actions are excluded
by the owner: do not plan, set up, run, observe, coordinate or request speech
testing unless Khaled explicitly reopens that scope. Historical speech remains
untested, with no pending speech follow-up or acceptance blocker and no claim
of full accessibility conformance. Keyboard use, labels, focus, programmatic
status/error announcements, Arabic/RTL, zoom, reflow and existing implementation
remain required. Tasks 4.2 and 6.2 retain future matter/report screen and export
integration checks, including archive-independent visibility.
R1/R2 are closed; see the [correction review](docs/reviews/2026-09-09-task-4-1-phase-2-correction-independent-review.md)
and [dated acceptance addendum](docs/task-reports/2026-09-09-task-4-1-phase-2-navigation-correction.md#acceptance-addendum--9-september-2026).
The preceding Task 4.1 acceptance record added one documentation-only commit;
its runtime evidence was historical. Task 4.1a's reviewed implementation and
correction are published; the reviewed local migration and activation now have
owner acceptance. This documentation commit remains unpublished. Task 4.2 needs
a separate mandate after the documentation/publication checkpoint; production
deployment and final Access cutover remain separate.
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
