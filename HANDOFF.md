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

**Current return point:** Stages 2 and 3, including the accepted Task 3.5
high-impact quarantine checkpoint, are complete. Task 4.0's structural
Arabic/RTL checker is complete; no core Stage 4 screen has started. Resume at
**Task 4.0a Phase 2—read-only roster, not started.** Only Phase 1's database
foundation is complete. Migration 61 was verified on a separate disposable
PostgreSQL 17.11 instance and is not deployed: the project remains unchanged at
60 applied migrations and 93 passing invariants. The task and Phases 2–4 stay
unchecked; Task 4.1 has not started. See the
[Phase 1 report](docs/task-reports/2026-09-06-task-4-0a-phase-1-database-boundary.md).
Access remains in operational use; the Task
3.5 application was not the final cutover. Do not restart earlier work or treat
the former handoff's obsolete governance instructions as active.
