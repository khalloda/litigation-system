# Superseded historical checkpoint

> **Do not use this file as the current starting point.** Its former contents
> described the project at the end of 23 August 2026, before Stage 2, Gate 4,
> authentication and server-side authorization were completed. Git history
> preserves that historical version.

Use these current authorities instead:

- [`README.md`](README.md) — concise project entry point and authority map.
- [`TASKS.md`](TASKS.md) — work order, completion status and exact return point.
- [`docs/DECISIONS.md`](docs/DECISIONS.md) — approved product and data decisions.
- [`docs/reviews/2026-09-01-project-continuity-recovery-audit.md`](docs/reviews/2026-09-01-project-continuity-recovery-audit.md)
  — dated continuity evidence, not a current priority authority.
- [`docs/reviews/2026-09-06-task-4-0a-staff-roster-readiness-audit.md`](docs/reviews/2026-09-06-task-4-0a-staff-roster-readiness-audit.md)
  — complete Task 4.0a readiness evidence and owner-resolution map; decisions
  and status remain canonical elsewhere.
- [`docs/reviews/2026-09-07-access-source-identity-discrepancy.md`](docs/reviews/2026-09-07-access-source-identity-discrepancy.md)
  — sanitized evidence for the Access-source derivative disposition in D51.

**Current return point:** Stages 2 and 3, including the accepted Task 3.5
high-impact quarantine checkpoint, are complete. Task 4.0's structural
Arabic/RTL checker is complete. Task 4.0a Phase 1 is deployed, verified and
operationally complete: its 7 September migration-61 acceptance passed 15/15
database checks and 107/107 historical-profile invariants. Phase 2's read-only `/staff` roster and
`/staff/[id]` detail are implemented, locally verified and checked. Phase 3's
Administrator mutations passed independent review and are published. Phase 4
completes interaction, accessibility and final verification; Task 4.0a overall
and Phase 4 are checked and published at `6579799`. The Task 4.1 contract is
approved in D52–D57; its [dated readiness review](docs/reviews/2026-09-08-task-4-1-clients-readiness-review.md)
preserves the original remote-freshness limitation separately from the later
owner resolutions. Task 4.1 Phase 1 is checked, deployed, verified and operationally
complete. Project PostgreSQL 17.11 has 62 applied migrations, zero pending or
unfinished, one approved historical rollback, 15/15 database checks and 116/116
historical invariants. The earlier isolated proof passed 116 historical and 98
canonical invariants. Its current-regression correction separates exact 61→62
upgrade proof from current 61/62 source selection and preserves valid operational
client/contact changes. Task 4.1 Phase 2 is implemented and locally verified: read-only client/contact
pages, distinct search/filter/paging and independently guarded existing-logo display
for all four roles. See the [Phase 2 implementation report](docs/task-reports/2026-09-09-task-4-1-phase-2-read-only-clients.md).
The next development return point is **Task 4.1 Phase 3 — Authorized mutations and archive/restore**, unstarted. Stop for independent review of the Phase 2 implementation.
Task 4.1 overall, Phases 3–4 and Task 4.1a remain unchecked.
The [migration-62 acceptance report](docs/task-reports/2026-09-09-task-4-1-phase-1-migration-62-deployment.md)
separates the retained migration-61 recovery package, authorized deployment and fresh checks.
See the [client Phase 1 report](docs/task-reports/2026-09-09-task-4-1-phase-1-database-foundation.md)
and [116/98 invariant inventory](docs/testing/task-4-1-phase1-invariants.md), and the
[deployment acceptance report](docs/task-reports/2026-09-07-task-4-0a-phase-1-migration-61-deployment.md)
for the separate Phase 1 implementation, recovery and deployment checkpoints,
and the
[Phase 2 implementation report](docs/task-reports/2026-09-08-task-4-0a-phase-2-read-only-staff-roster.md)
for its read-only implementation and local verification, and the
[Phase 3 report](docs/task-reports/2026-09-08-task-4-0a-phase-3-administrator-staff-mutations.md)
for mutation, concurrency, browser, audit and preservation evidence, and the
[Phase 4 completion report](docs/task-reports/2026-09-08-task-4-0a-phase-4-staff-roster-completion.md)
for final acceptance and artifact hashes. The Litigation
Department continues using Access; this is not final cutover. Final delta
reconciliation remains governed by D43 and D51. D51's
historical source identity and derivative disposition remain unchanged; the
deployment had separate owner authorization. Do not restart earlier work or
treat the former handoff's obsolete governance instructions as active.
