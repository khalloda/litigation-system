# Task 4.1 Phase 1 — migration 62 deployment acceptance

- Acceptance date: 9 September 2026; **DEPLOYED AND VERIFIED; operationally complete**.
- Authority: Khaled Helmy accepted the independently reviewed deployment evidence
  and expressly authorized this documentation-only acceptance and one local commit.
- Owner-requested configuration: GPT-5.6 Sol, High reasoning, Local Windows Codex
  Desktop. Actual runtime model/effort were not independently verified.
- Delegation: one bounded read-only documentation reviewer used; the primary agent
  performed all edits and Git mutations. Expected usage: low to medium, using
  installed tools and retained evidence, with no additional licensing.
- Starting/deployment commit and cached `origin/main`:
  `0ab7fd88acdf49fb1b4a52c1446776ad686356e7`.
- Starting parent: `46846646c27746383280ab1dbb074e7f15658c99`.
- Starting grandparent: `156d4221b21ee31d2d0dcd3b586a92143a6e1799`.
- Final documentation commit: the enclosing `docs: accept Task 4.1 Phase 1 deployment`
  commit. Its full SHA, parent and patch identity are recorded in the external
  delivery receipt and final response, avoiding a self-referential hash.
- Remote state for this documentation task: cached refs only; no fetch or push.
- Authorized stop: exactly one local documentation commit and a verified full-index,
  binary-safe patch containing only that commit; stop for independent review.
- Next development return point: **Task 4.1 Phase 2 — Read-only client/contact screens and existing-logo display**, unstarted.

[TASKS.md](../../TASKS.md) owns status and work order; [D52–D57](../DECISIONS.md#d52--client-and-contact-archive-lifecycle)
own the client/contact contract. D1–D57 remain byte-for-byte unchanged, with no new
decision ID. Task 4.0a remains complete. Task 4.1 Phase 1 remains checked; overall
Task 4.1, Phases 2–4 and Task 4.1a remain unchecked. All existing checkbox states
are preserved. This report records five separate checkpoints below.

## 1. Isolated implementation and correction verification

The [implementation report and correction addendum](2026-09-09-task-4-1-phase-1-database-foundation.md)
retain their original dated evidence. Implementation commit
`46846646c27746383280ab1dbb074e7f15658c99` changes 36 files; correction commit
`0ab7fd88acdf49fb1b4a52c1446776ad686356e7` changes 12. Neither is amended or rewritten.
Independent historical 61→62 acceptance passed 116/116 and canonical replay passed
98/98. Mutation, concurrency, rollback, authentication, 448 permission decisions,
account, staff, audit/event, Gate 4, static and production-build evidence belongs
to those earlier runs. The correction also proved current regression entry points
retain legitimate client/contact changes and never redeploy a complete 62 source.

The canonical 98-check, regression and build evidence was reused for recovery and
deployment acceptance; those suites were not freshly rerun during deployment or
this documentation task. The [frozen profile inventory](../testing/task-4-1-phase1-invariants.md)
retains the strict historical-source and separate canonical-replay requirements.

## 2. Retained migration-61 recovery package and restore proof

External evidence label: `2026-09-09-task-4-1-phase1-predeploy-v1`. Its
`package-manifest.csv` lists 146 entries; there are 147 retained files including
the manifest. The archive `database/litigation-migration61.dump` was captured once:
15,898,992 bytes, SHA-256
`938d8460e2cbd401f41114b81b22e79de795ffdcd4f1b2e60cb20f57714f7591`.
It is the **migration-61 PREDEPLOYMENT backup**, not a new migration-62 backup.
The package includes 54 matching logos, 1,541,428 bytes, and protected recovery
metadata. The accepted audit and restore summary record exact equality of all
103 restored table contents, named ownership/grant semantics, logical sequence
definitions/values and logo paths/references/sizes/hashes.

The owner's logical-restore clarification is limited to source-versus-isolated
restore comparison: 45 sequence `log_cnt` resets, compaction of previously dropped
column slots, and three constraint expressions proved semantically equivalent.
Explicit owner ACLs were reconstructed; random dump restriction tokens are recorded
as dump-rendering differences. Literal catalog/schema-dump and full internal
sequence-state equality were therefore not claimed for the restored copy. Every
unexplained difference remained a stop condition. These exceptions **were not
applied to live-project preservation**.

The final completed restore attempt (attempt 5) passed 15/15 and 107/107 at 61,
then applied only 62 in its owned isolated cluster and passed 15/15 and 116/116.
There were **two isolated migration-62 invocations overall**, on separate owned
clusters: attempt 4 applied successfully but stopped before complete verification
because its helper compared Date objects with retained ISO strings; attempt 5
completed independent full-precision ledger verification. Only attempt 5 is
acceptance evidence. Earlier failures/stops remain in `evidence/attempt-record.json`.
All owned recovery fixture resources and fresh role credentials were removed;
the archive and evidence were retained unchanged.

The protected archive contains application account password hashes; none is
displayed or copied into this report. Recovery needs fresh independent PostgreSQL
role credentials and a separately supplied `AUTH_SECRET`, as explained in the
package's `RECOVERY-INSTRUCTIONS.md`. Changing `AUTH_SECRET` invalidates existing
web sessions. Role provisioning must preserve restored application account hashes.
No archive contents were extracted or displayed during documentation acceptance.

## 3. Separate owner-authorized project deployment

External evidence label: `2026-09-09-task-4-1-phase1-migration62-deployment-v1`.
The earlier blocked attempt remains intact in `stop-result.json` and
`evidence-manifest.csv`: automatic approval review rejected its fetch before
process start, so it completed zero fetches and zero deployment invocations and
opened no database session. Explicit owner resumption authorized continuation;
the rejection was not bypassed.

The resumed deployment task completed **exactly one successful `git fetch origin`**
and **exactly one project `npm run db:migrate:deploy` invocation**. These counts
belong to the deployment task, separately from the recovery task's own fetch and
the documentation task's zero fetches. Deployment started at
`2026-09-09T11:01:13.778Z` and completed with exit 0 at
`2026-09-09T11:01:24.200Z`. Only
`20260909120000_client_contact_database_boundary` was applied, with reviewed SHA-256
`88ab034517f76e152e944f1a0949edc175a286c7bfeefe82fba0672c6b86f6c1`.

Fresh preflight and immediate prewrite checks established the exact original
103-table migration-61 state and immutable recovery identity. The documented
migration-33 historical extra-terminal-LF checksum compatibility is an existing
accepted rule in [MIGRATION.md](../MIGRATION.md), not a new exception or a changed
checksum. The helper's preliminary mount ordering, logo ordering, ACL ordering
and added-object comparison corrections are retained in the verification-method
notes; none relaxes data or permission equality.

## 4. Fresh post-deployment verification and preservation

| Deployment check | Before | After |
| --- | --- | --- |
| Migration ledger | 61 applied; only 62 pending; zero unfinished | 62 applied; zero pending/unfinished |
| Approved historical rollback | One retained | Same prior row retained |
| Database verification | 15/15 | 15/15 |
| Historical permanent invariants | 107/107 | 116/116 |
| Original table preservation | 103 tables | 99 unrelated complete tables and four original projections exact |
| Complete sequence state | 48 sequences | All 48 exact, including `last_value`, `is_called`, `log_cnt` and definitions |
| Logos | 54 files; 1,541,428 bytes | References, paths, sizes, hashes and modification times exact |

The four projected tables are `clients`, `contacts`, `audit_event_fields` and
`_prisma_migrations`. Every original column/value is retained; only the approved
columns or rows are added. Prior ledger rows retain all columns, logs and
microsecond timestamp precision. Actual account and audit data remain exact;
no fixed audit-event count is substituted for comparing the current history.

Expected additions are four private tables: one `client_contact_boundary` receipt,
318 `client_contact_client_import` snapshots, 188 `client_contact_contact_import`
snapshots, and zero `client_contact_submission` rows at deployment. Two historical
views preserve the original client/contact row shapes. Each live table gains
`is_application_native`, `is_archived`, `row_version`, `application_modified_at`
and `application_modified_by`. Existing imports remain non-native, unarchived,
version 1, with both modification fields NULL. Ten explicit value classifications
are added; all prior audit classifications remain exact.

Catalog checks verify the reviewed constraints, indexes, immutable-evidence and
lifecycle guards, same-client main-contact enforcement and three fixed-path
gateways: `client_contact_create`, `client_contact_update` and
`client_contact_set_archived`. Direct runtime writes and client/contact sequence
access are revoked; trusted actor/account eligibility and the existing role matrix
are enforced by the gateways. Private evidence remains inaccessible to runtime
and PUBLIC. All other named role, membership, database, default-ACL, extension,
collation and policy evidence is unchanged. The original contacts' physical column
slots are preserved, with new fields in slots 25–29; restore compaction was not
accepted on the live project.

The retained verifier used the D35 principal gateway, forced read-only sessions,
repeatable-read snapshots and PostgreSQL-generated UTC JSONB full-row SHA-256
aggregates. It checked complete named catalogs and original projections rather
than count-only equality or JavaScript millisecond dates. The final stability
receipt repeats equality for all 107 resulting tables, 48 sequences, catalog,
ledger, audit/accounts, logos and recovery evidence.

Cleanup records removal of the temporary helper, closed database sessions and no
remaining task/project processes. The inert helper source is retained as evidence.
No container, volume or network was created by deployment; the existing healthy
project container was not stopped or reconfigured. Deployment left Git clean and
unchanged at `0ab7fd88acdf49fb1b4a52c1446776ad686356e7`, then-current `origin/main`,
ahead/behind 0/0. All 146 recovery manifest entries and the earlier blocked-attempt
files were preserved. This documentation task reads those receipts without
re-inspecting PostgreSQL or Docker.

## 5. Documentation-only acceptance and validation

The starting preflight matched clean `main`, including untracked files, exact
HEAD/parent/grandparent, cached ahead/behind 0/0, no active Git operation/lock,
36/12 reviewed commit scopes, unchanged D1–D57 and the required task states.
Migration 60 remained SHA-256
`7921c9b168549928185bfd0b915ccc725ba363787158990c614420e0e3bbbee5`;
migration 61 remained
`87e04320badc5bc71de1c30eae02c72f82ae0e59f2088b42cb0806f6b25c8904`;
migration 62 matched the deployment checksum above.

All 38 deployment manifest entries were verified by byte size and SHA-256,
together with the two primary evidence identities and the recovery manifest.
External evidence remains unchanged. Current-state paragraphs and links now agree
on deployed 62/116 and Phase 2 next; dated 61/107 results remain historical evidence.
The prior implementation report gains a dated deployment addendum.

| Documentation validation | Result |
| --- | --- |
| `npm run check` | Exit 0; all ten existing checks passed, including 78 RTL rules, 29 authorization entry points, audit/D35 negative fixtures, Git-ignore rules and encoding |
| Installed Prettier Markdown parser and local link/anchor validator | All 13 Markdown files parsed; 131 relative links/anchors resolve; all 13 retain configured formatting exclusions |
| Scope, provenance and encoding validator | Exactly 13 Markdown files; valid UTF-8 without BOM; 83 checkbox states unchanged; both frozen invariant table inventories unchanged; decisions/governance and migration hashes unchanged |
| Evidence identities | 38/38 deployment entries and 146/146 recovery entries plus both manifests unchanged |
| `git diff --check` and staged counterpart | Pass; primary staged-diff review completed before commit |
| Bounded read-only documentation review | No blocking findings; minor historical-tense clarifications applied |

The initial static chain stopped at the established Git-child sandbox `EPERM`
in the Git-ignore check; the first local Markdown validator had the same error.
Identical reruns through the normal execution permissions expressly authorized
by the owner passed. No approval rejection or safety guard was bypassed. The
external delivery receipt records exact changed-file statistics and the new
commit/patch identity, size, SHA-256 and reverse-applicability result.
Markdown remains excluded from Prettier reflow by the existing `.prettierignore`;
no formatting configuration is changed. Added prose is checked for secrets, raw
data and absolute machine paths. Governance, application code, tests, scripts,
schema, migrations, dependencies and configuration are unchanged.

The authorized changed-file inventory is exactly these 13 Markdown files:

- `HANDOFF.md`
- `README.md`
- `TASKS.md`
- `docs/DATA-MODEL.md`
- `docs/DATABASE.md`
- `docs/MIGRATION.md`
- `docs/PERMISSIONS.md`
- `docs/PRD.md`
- `docs/VISUAL-DIRECTION.md`
- `docs/testing/task-4-0a-phase1-invariants.md`
- `docs/testing/task-4-1-phase1-invariants.md`
- `docs/task-reports/2026-09-09-task-4-1-phase-1-database-foundation.md`
- `docs/task-reports/2026-09-09-task-4-1-phase-1-migration-62-deployment.md` (new)

## Primary external evidence identities

Names are sanitized labels within the two external evidence directories above,
not repository links. `resumed-evidence-manifest.csv` is the complete 38-entry
deployment inventory; `package-manifest.csv` is the complete recovery inventory.

| Evidence | Bytes | SHA-256 |
| --- | --- | --- |
| Deployment: `resumed-final-result.json` | 17,840 | `ff3ddab840adfeced169ed7336da9b704e77223f8a7bee535b013d170ac0ffde` |
| Deployment: `resumed-evidence-manifest.csv` | 4,107 | `39286c03a92450c0f4358ad8430f81683d2b0a06f58833120952a4b1ea1308ac` |
| Deployment: `resumed-deployment-invocation.json` | 316 | `a18f10dd1995ec3fde56381e66223eee7a3edda453604348fe5e636510aa64e1` |
| Deployment: `resumed-deployment-command.txt` | 574 | `2cc3350158f56c34207cf89ac93d7f8bf63a6cec26baf3a519d1ab4509adf8e6` |
| Deployment: `resumed-preservation-result.json` | 16,002 | `47c2bb1a57e53486bd5c74b64c8e804b334f561bff0f365d40ac29116fb4a325` |
| Deployment: `resumed-postflight-invariants.txt` | 16,242 | `7c3fbe00717bdbbf43882ff173356e20a652257e9a95170278255b4aa0421de6` |
| Deployment: `resumed-verification-method-and-attempts.json` | 1,972 | `12ec48a9229fbd6d794a4b2c8f9321c05c42da8b187628bcdaf5c40aa4df3d5a` |
| Deployment: `resumed-cleanup.json` | 592 | `9b6ffc8b04509eeb18dc96a84fb02748297b607d6f5d3752d002bf2d7bec2fa8` |
| Recovery: `package-manifest.csv` | 16,805 | `aaffc0eabb7d5d749fb132a4ac144edbf8c4d44d51a49a0c58188fae2c9833f2` |
| Recovery: `audit-result.json` | 11,308 | `074caa07f7c4d66fb3d58a51ae73364a19c1ded093ff10e669a081c2dcd9208f` |
| Recovery: `retained-package-restore-summary.json` | 7,122 | `9784a458b705c3d84b5920a39707e93fb99a6a5b51d7602e90367597ff5c2845` |
| Recovery: `evidence/owner-approved-logical-restore-clarification.json` | 1,084 | `84b30fda911dd255d815546ab8d73678911413eaf6dc6a020f58063a0eb0e5d3` |

## Remaining boundaries

This task performs no fetch, push, PostgreSQL, Docker, Access, migration, browser,
regression-fixture, production-build or application runtime operation. It implements
no client/contact screens, handlers or Phase 2 work. Current regression commands
may copy a complete migration-62 source without redeploying it. Strict historical
61→62 proof still needs an actual untouched migration-61 source restored and
verified in isolation; current project 62 cannot substitute. Older staff 60→61
and audit 53–60 guards and all frozen inventories remain intact.

Access remains in departmental use. D43/D51 final source identity, freeze, delta
reconciliation and cutover need their separate controlled authorization. Task 7.2
nightly coordinated database/logo backups, off-machine retention, weekly integrity
notification and the separate go-live printed-logo restore acceptance remain
outstanding. Logo mutations remain Task 4.1a. Stop for independent review of this
documentation commit; the next development task remains Phase 2, unstarted.
