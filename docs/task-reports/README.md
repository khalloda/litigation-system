# Task-report evidence from Task 3.3 onward

This directory preserves one dated acceptance record for each completed task
from Task 3.3 onward. A task report is **evidence**, not a new source of project
priority or product decisions:

- [`../../TASKS.md`](../../TASKS.md) owns status, work order and the exact return
  point.
- [`../DECISIONS.md`](../DECISIONS.md) owns approved product and data decisions.
- Subject documents such as [`../MIGRATION.md`](../MIGRATION.md),
  [`../PERMISSIONS.md`](../PERMISSIONS.md) and
  [`../GLOSSARY.md`](../GLOSSARY.md) own their stated policies and meanings.

Reports must link to mutable current state rather than copying it. Record fixed
task evidence exactly as it stood at acceptance. Use a dated filename such as
`YYYY-MM-DD-task-3-3-audit-population.md`.

## Required evidence

Every accepted task report must contain:

1. **Task identity** — task number, exact title and acceptance date.
2. **Run configuration** — Codex model, reasoning effort, environment (`Local`,
   `Worktree` or `Cloud`), whether subagents were permitted, whether any were
   used, expected qualitative usage (`low`, `medium` or `high`), and why this
   was the least expensive safe configuration for the task.
3. **Git checkpoints** — full starting commit and full final commit.
4. **Scope** — the approved scope and the explicitly prohibited scope.
5. **Authorized stop point** — the exact point at which the accepted task was
   required to stop.
6. **Authority** — relevant decision IDs, owner approvals, approver and approval
   date where applicable; never reconstruct approval evidence that was not
   retained.
7. **Principal outputs** — what changed and the complete changed-file list.
8. **Verification** — every command run and its exact result, including an
   honest note for a required suite that was not run and why.
9. **Protected state** — counts, hashes, digests, invariants or other contracts
   affected, with their evidence source and before/after meaning.
10. **Unresolved items** — quarantines, follow-up decisions, deferred checks,
   known limitations and who must resolve them.
11. **Remote state** — whether the final commit was pushed and, if authorized,
   where. Never imply that a local commit is remote.
12. **Exact next return point** — the first task or prerequisite that may be
    started next, consistent with `TASKS.md`.

## Template

```markdown
# Task N.N — title

- Accepted: YYYY-MM-DD
- Codex model: model name
- Reasoning effort: effort level
- Environment: Local / Worktree / Cloud
- Subagents: permitted yes/no; used yes/no
- Expected qualitative usage: low / medium / high
- Least-expensive safe configuration rationale: concise reason
- Starting commit: full SHA
- Final commit: full SHA
- Push status: not pushed / pushed to named authorized remote
- Exact authorized stop point: precise task boundary
- Exact next return point: Task N.N

## Run configuration and cost rationale

## Approved and prohibited scope

## Decisions and owner approvals

## Principal outputs and changed files

## Verification and exact results

## Protected counts, hashes, digests and invariants

## Unresolved items
```

## Content restrictions

Never include credentials, passwords, tokens, connection strings, private keys,
raw operational records, workbook contents, database exports, ignored source
artifacts, client documents, logos or other runtime binaries. Record safe
identities, counts and digests and link to tracked evidence instead.
