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
Arabic/RTL checker is complete; no core Stage 4 screen has started. Resume at
**Task 4.0a Phase 2 — read-only staff roster**. Phase 1 is operationally
complete: migration 61 is deployed and verified on project PostgreSQL 17.11,
with 61 applied migrations, zero pending or unfinished, 15/15 database checks
and 107/107 permanent historical-profile invariants. The task, Phases 2–4 and
Task 4.1 stay unchecked. See the
[deployment acceptance report](docs/task-reports/2026-09-07-task-4-0a-phase-1-migration-61-deployment.md)
for the separate implementation, recovery and deployment checkpoints.
The Litigation Department continues using Access; this deployment was not final
cutover. Final delta reconciliation remains governed by D43 and D51. D51's
historical source identity and derivative disposition remain unchanged; the
deployment had separate owner authorization. Do not restart earlier work or
treat the former handoff's obsolete governance instructions as active.
