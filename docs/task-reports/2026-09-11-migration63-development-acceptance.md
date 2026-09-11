# Migration 63 — development milestone acceptance

- Owner acceptance: Khaled Helmy, 11 September 2026, after independent operational PASS.
- Reviewed application/source: `2b866bae7929149c1ad200661225f4c2098f366d`.
- Documentation parent: the same published commit. This new local documentation
  commit's identity is in the separate delivery receipt, avoiding a self-reference.
- Publication: implementation/correction/acceptance source already published;
  this documentation commit is not pushed.
- Stop: independent documentation review. Task 4.2 requires the separate
  documentation/publication checkpoint and a new mandate.

## Authority, configuration and scope

The owner's direct acceptance message authorizes seven Markdown changes and one
local commit. The [independent review](../reviews/2026-09-11-migration63-operational-independent-review.md)
is evidence, not authority; its historical “owner acceptance pending” wording is
preserved byte-for-byte. This record documents the subsequent acceptance.
D15/D16, D35, D43/D51 and existing Stage 7 obligations remain unchanged.

The attached run configuration recommends GPT-5.6 Terra / Low; no selector change
is claimed. Environment: Local Windows, `D:\Projects\litigation-system`.
Subagents: not permitted, none used. Expected usage: low. Reusing accepted
runtime evidence and installed documentation tools is the least-cost safe scope;
no installation, purchase or service is needed.

Exactly seven files: `README.md`, `TASKS.md`, `docs/PRD.md`, `docs/DATABASE.md`,
`docs/MIGRATION.md`, this report and the supplied review under `docs/reviews/`.
The database and migration documents receive append-only addenda; complete
existing bytes remain their prefixes. All TASKS/PATCHES checkbox lines remain
unchanged. Existing reports, matrices, reviews, governance and decisions remain
unchanged. No application, migration, runtime, auth/session, permission, dependency,
fetch/push, deployment or Task 4.2 work is authorized by this record.

## Accepted historical operational evidence

Migration `20260910140000_recoverable_client_logos` ran once successfully on the
verified development database. Native invocation: 11 September 2026,
15:10:48.1916160Z–15:10:56.9997288Z, exit 0. Captured final boundary:

| Surface | Reviewed result |
| --- | --- |
| Ledger | 63 applied, one historical rollback, zero unfinished |
| Tables | 109 |
| Retained imports / submissions | 54 / zero |
| Audit classifications | 602 |
| Preservation | Original data projections, all 48 complete live sequences and 54 logos exact |
| Native source checks | 121 invariant checks and 15 setup checks passed |
| Isolated rehearsal | Restore at 62: 116 invariants and 15 setup checks; after 63: 121 and 15 |
| Independent review | 101 offline evidence comparisons passed; not fresh runtime tests |
| Cleanup | Owned fixture/container/volume/transient credentials and probe removed; intended app and recovery retained |

The isolated restore exceptions were exactly 45 internal sequence `log_cnt`
resets, with logical state/definitions exact, and three reviewed equivalent
constraint renderings: `attendee_source_cell_column`, `audit_events_device_shape`
and `user_accounts_lockout_shape`. No exception applies to preservation of the
48 complete live sequences across migration. The maintenance SHARE locks were
released immediately before DDL; they were not claimed to continue through it.

Development logo root: `D:\Projects\LitigationData\client-logos`.
Current local recovery point:
`D:\Projects\LitigationData\DB-Backup\migration63\predeploy-20260911T150003164Z-0d643b99-9a2f-40c2-ab0c-d91a627d1d23`.
The owner explicitly selected local-only backup for this development execution;
it does not protect against laptop/disk loss or satisfy production backup duties.

The execution receipt captured the intended app at `http://127.0.0.1:3000`,
PID 54172 under `KHELMY-PERSONAL\Khaled`, from
`D:\Projects\litigation-client-builds\migration63-6fae42550ee7472898a09b3f045d1d3f`,
build ID `OQmfCgj6BGR1QINTIc5XP`. These are dated execution observations,
not a current process/running-state claim. This documentation task does not
recheck or operate that process.

## Limits and production handoff

Authenticated client/logo/recovery screens remained unobserved on that instance
under the approved no-session fallback. They are not marked passed; no login,
reset or synthetic real-client mutation is needed to close this record.
Accepted broader application tests are historical. Screen-reader speech actions
remain excluded with no pending speech follow-up or full-conformance claim.

The temporary Windows artifact shares checkout `node_modules`. Its protected
leaf does not certify resolved dependencies or broader ancestor permissions.
This is a reviewed development limitation, not a demonstrated compromise. Preserve
that dependency relationship while using this instance; a later authorized
development task can deliberately stop/rebuild it if dependencies change.
Windows directory-entry durability across sudden power loss remains unproved.
No additional Windows production-hardening requirement is introduced.

Windows/laptop is development. The final application and database will run on an
Ubuntu VM with Docker. A laptop production-mode build is not production rollout,
and this Windows artifact is not the Ubuntu deployment image. On that actual
target, validate Linux image/dependencies, runtime identity and secret separation,
mounted storage, network exposure, authenticated workflows, durability and
coordinated database-plus-logo recovery. Linux/Docker does not automatically
prove these controls. Stage 7/D15/D16 backup, retention, off-VM copies, integrity
monitoring and spare-machine/printed-logo recovery obligations remain separate.
Final Access cutover is unperformed; D43/D51 reconciliation still applies.

## Evidence identities and documentation validation

Original evidence directory:
`C:\Users\Khaled\.codex\visualizations\2026\09\10\01a08b62-1f18-7281-8db0-cfcfffeadbba\task41a-migration63-execution`.

| Original artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| Operational report | 10,629 | `3c1d59827b2459233fa200a29827dde4fc43d9f98e53d7bbed19d9fbf5711463` |
| Execution ZIP | 1,098,187 | `655273f3dd0993d0b55b2cac07094a270a4571d83981527afae9cf9732585478` |
| Execution delivery receipt | 2,954 | `94024e5827ba47ef108e8f2a1799aff6406045bec0ab668d60063e0e1d868089` |
| Execution manifest | 17,699 | `dc2d1c3fe163d6fa64d2ca510c8c577fa9169d32eb7ff14711c3c3cdb75ec483` |
| Supplied operational PASS review | 14,289 | `7e576ea68e7c3e6f1c3daead6c4ba755fdaa99d9952b977314751ef5d9f710e7` |

After matching the original archive identity, this task reuses the completed
104-member execution ZIP review; no repeat extraction or operational review.
External before/after inventories compare evidence filenames, sizes and SHA-256
values, excluding capture timestamps. Raw dumps, environment contents and original
logos are not read for this documentation evidence.

Document validation covers seven-file scope, UTF-8, exact review source/working
copy/staged bytes, exact old DATABASE/MIGRATION prefixes, unchanged full checkbox
lines, local links and introduced/affected anchors, Git whitespace/storage rules,
commit parent/statistics and patch reverse applicability without applying it.
The repository intentionally excludes Markdown from Prettier; preserve that
formatting policy and the supplied review's exact bytes. Detailed commands,
results, any historical link exceptions, patch/ZIP hashes and final Git state
are in the separate external validation/delivery receipts. Aggregate application
checks, builds and runtime/database suites are deliberately not run under this
documentation-only mandate. No fresh runtime-preservation assertion is made.

Current work order is in [TASKS.md](../../TASKS.md); approved product/data decisions
remain in [DECISIONS.md](../DECISIONS.md). Stop for independent documentation
review. Publication and the next development task require their separate mandate.
