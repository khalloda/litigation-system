# Tasks 4.6–4.7 — owner acceptance and local activation

17 September 2026. Khaled Helmy accepted the combined Documents and Fee letters
implementation at `3f0c6c6fc7d41296c8b55f7454cc9c82ec6fcdfb`, tree
`792533500482d9e5459d57b9fb1fac593f594f02`. The imported independent review
closed **T4647-R1–R6** and approved migration 71, local activation, the bounded
documentation child and ordinary publication. This report records local-development
acceptance. Independent operational-delivery review is next; Task 4.7a, Task 4.8,
Ubuntu deployment, public hosting and Access cutover are outside this operation.

## Accepted behavior and authority

D65 and D66 remain unchanged. Documents and Fee letters provide paged list/search/
filter/detail, creation/editing and Administrator-only recoverable archive/restore.
Current maintained values stay separate from immutable imported evidence. Current
covered-matter membership and the current matter-side fee-letter reference are
independent relationships: membership add/retire/restore does not set the matter-side
reference, and matter-side set/clear/replace does not change membership. Original
membership, raw matter reference, source payload and financial relationships remain
preserved.

All four roles can read. Administrator and Litigation Assistant can create/edit;
lifecycle and the approved relationship permissions remain server- and database-
enforced. D1–D66, governance, application/runtime source, migration bytes,
dependencies, configuration and earlier evidence were not changed in this
documentation operation. D59 remains the accepted local-development limitation.

## Exact source, handoff and independent review

The separate acceptance handoff manifest and the 7,497,320-byte ZIP, SHA-256
`d8c3205329f203a74bbe9b16b0b48880de78733d689c5b1b181d6a067ce7aa69`,
passed archive hash/size and all 38 safe unique member CRC/size/SHA checks. The
external manifest SHA-256 is
`d5b8094b5bdb9cb1bbb12be03df0c7aaf185db438e05b10ea8207cbe05e45fa6`.
Nested reviewer/correction/prior handoff packages were reopened and verified.

The raw sole-parent chain was verified:

`aecf4fd4bca22fe697f489a9827d6c46edb917fa` →
`f8751a0133f2d618ff0a1bb18c6a53ebaebf2afa` →
`0623d7cefebc5f3da1ee947c6f28dfc03b54dab0` →
`3f0c6c6fc7d41296c8b55f7454cc9c82ec6fcdfb`.

The independent review is imported verbatim: 11,223 bytes, SHA-256
`7c59c1d80c2d504ffe9320845a6439ab9488dd9f0589c31ff7a807896d91d960`.
Its reviewer verified supplied artifacts/source/receipts, not live PostgreSQL,
Windows or native-browser execution. The original owner verification pair never
existed, and the original executed-source body named by the historical `66992ab0…`
receipt was never preserved. This operation does not fabricate either item.

## Stable accepted build

All 766 candidate tracked inputs were copied by raw Git identity into
`D:\Projects\LitigationData\accepted-tasks46-47-3f0c6c6-2026-09-17T08-06-59-307Z`.
The production build completed with BUILD_ID **3OBUE7ppFmV5DINhNdi0s**; all copied
tracked input identities were unchanged after build. Installed approved dependencies
were reused without upgrade. Earlier stable artifacts remain retained. This
documentation-only child does not alter any running-app input and does not require
rebuilding the healthy accepted artifact.

## Fresh recovery and isolated rehearsal

Fresh restricted recovery package:
`D:\Projects\LitigationData\DB-Backup\migration63\pre-migration71-2026-09-17T08-10-24-157Z-4c12c7ef-07a2-4b2e-9c2c-fd98f1934133`.
It contains 60 verified members, including all 54 current logos and protected role/
ownership/configuration material. The custom-format dump is 22,132,119 bytes,
SHA-256 `0924797edf6d75140bc8db63adb1d4e9a308183f303acbf9346c850d9ce7abd1`;
private manifest SHA-256
`cdc3c625ba3f0c98c89bf46503e9aed3c844f036d5279610a1140f0fe8ed94c9`.
Dump readability, member hashes and restricted ACLs passed. Private dump, role/
config/credential bodies, account verifiers and logo bytes remain outside Git and
shareable evidence. This is local recovery, not off-machine disaster recovery.

Fresh preflight identified owner container `litigation-db`, database `litigation`,
loopback port 5433, PostgreSQL 17.11, cluster `7676117521894273062`, 128 tables,
48 complete sequences, 70 completed migrations and only exact 71 pending. The
migration-70 owner database passed 141 historical and 15 setup checks. The recovery
was restored into a positively separate task-owned PostgreSQL 17.11 cluster with
fixture-only credentials and a separate loopback port.

The exact accepted migration was rehearsed on that restore. The pristine delta,
old data, evidence/history/receipts, roles/ACLs, accounts and logical sequence state
passed. Final post-browser rehearsal gates passed 147 historical and 15 setup checks.
Focused production-build browser proof was fresh. The independently accepted
exhaustive role/oracle/corruption/concurrency/canonical/retry proof was reused
explicitly because its source and inputs were unchanged.

Task-owned attempt directories remain sealed. Attempt 3 preserved a successful
exhaustive functional run. Attempt 4 passed strict parsing, corruption/core flows,
ACL/source preservation and two true-overlap concurrency proofs before a fixed-
session fixture assumption failed; it is not represented as a pass. Attempt 7
exposed a browser-launch helper mismatch. Later task-only helper/path corrections
produced the coherent successful restore, focused browser and final gates. Every
disposable wrapper cleaned only its positively identified container, volume,
network and fixture credentials; the project Docker database stayed intact.

## Actual migration 71 and exact permitted delta

Immediately before owner DDL, the fresh complete owner capture equalled the original
preflight capture, the recovery package was unchanged, and no new writer appeared.
The previously accepted Task 4.5 app was positively identified as PID 67728 and
stopped at 2026-09-17T08:50:50.3757552Z for the authorized maintenance window;
port 3000 was clear. No broad process, service or Docker stop was used.

Migration `20260916180000_documents_fee_letters_boundary`, 76,726 bytes, SHA-256
`cc0c3fd56d5a5688bdbc9bde8a0334a3dc7e174da9b159e61eeb6f365ea45169`,
was applied once through the unchanged approved wrapper and direct migration
principal. No `migrate dev`, reset, force flag, resolve, ledger edit, manual DDL,
transform/backfill or migration 72 occurred.

The complete before/after comparison verified:

- applied migrations 70→71 and non-system tables 128→138;
- exactly the ten reviewed private `_migration` tables;
- `row_version=1` and `is_archived=false` on existing documents and fee letters;
- `is_retired=false`/`current_order=NULL` on existing covered memberships and
  `is_retired=false` on existing matter-side references;
- every old column/row in the four affected tables and every unrelated table exact;
- complete imports/boundary/reference state, four immutable old-column views and
  the reviewed functions, guards, constraints, indexes, triggers and privileges;
- seven exact audit-field additions and one successful migration-71 ledger row;
- no new sequence, with all 48 full definitions and
  `last_value`/`log_cnt`/`is_called` vectors exact; and
- accounts, credentials, sessions, configuration, source/quarantine/history/
  receipt data, financial records and all 54 logos unchanged.

Actual migration attempts: **one**. Actual gates completed at
2026-09-17T08:54:36.736Z with **147 historical and 15 setup checks passing**.

## Accepted runtime and actual browser observation

The accepted app started at 2026-09-17T08:55:35.477Z from the stable artifact,
PID **25944**, on **http://127.0.0.1:3000**. It uses the existing restricted runtime
principal and unchanged authentication/configuration/logo root; no migration
credential is present in the web environment. Launch proof binds BUILD_ID
`3OBUE7ppFmV5DINhNdi0s`, source `3f0c6c6…`, owner cluster
`7676117521894273062`, migration 71 and zero unfinished migrations.

Anonymous no-cookie observation found the expected login protection: `/` returned
307 to `/login`, and the streamed Documents response carried `NEXT_REDIRECT` to
`/login` without rendering document results. An existing legitimate Administrator
browser session was available; no password entry, reset, cookie injection, token
export or credential change was required.

Fresh actual authenticated read/navigation/form/Cancel observation covered:

- Documents: 407 current rows; Arabic text search; internal-number search with an
  explicit archive filter; applied and cleared filter state; detail/current/source
  fields and relationships; create/edit/archive-confirmation load and Cancel;
- Fee letters: 331 current rows; Arabic text and internal/reference search; explicit
  archive filters and Clear; detail/current/source/historical sections; independent
  relationship notice; create/edit/archive-confirmation load and Cancel;
- current covered-matter editor and separate matter-side reference editor load and
  Cancel; plus navigation through the existing matter detail; and
- archived filters for both modules, each correctly returning zero rows.

No actual create, edit, archive, restore or relationship write was submitted. The
complete owner comparison digest immediately after migration and after all actual
smoke checks was identically
`353d0467ed0679b2d3b1361eb9018ecdf22278197ec47e7a1228f090a0d16d0f`.
That comparison covers all 138 discovered non-system tables, complete catalogs and
migration ledger, all 48 sequence vectors, credential-safe account aggregate and
logo aggregate. Because no actual archived document or fee letter exists, no owner
record was archived merely to display a Restore screen. Restore UI/mutation proof
remains the accepted isolated evidence; this is the sole bounded actual-observation
limitation.

## Fresh versus reused proof

Fresh in this operation: handoff/source verification; complete owner baselines;
141/15 preflight gates; stable build; protected recovery; exact restore/rehearsal
and migration delta; focused isolated production-build browser proof; final 147/15
rehearsal gates; actual migration 71 and 147/15 gates; runtime binding; anonymous
protection; authenticated actual read/Cancel smoke; complete post-smoke equality;
documentation and publication gates.

Reused after identity verification: accepted exhaustive four-role 27+27-case oracle,
corruption/concurrency/canonical/retry proof, historical implementation attempts and
independent source/artifact review. Reuse is explicit and is not described as a
fresh rerun. The missing original pair/source body remain missing.

## Documentation, publication and stop

Exactly eight tracked paths change: README, TASKS, PRD, DATABASE, MIGRATION, this
report, the combined matrix append and the verbatim independent review. The complete
9,577-byte matrix prefix remains exact. Only Task 4.6 and Task 4.7 change from
unchecked to checked; all other 84 checkbox lines remain byte-identical, including
checked 4.4/4.5 and unchecked 4.7a/4.8. All runtime inputs and 760 other existing
paths remain unchanged; the expected final tracked count is 768.

The sole child subject is `docs: accept and activate Tasks 4.6 and 4.7 locally`,
directly over `3f0c6c6…`. Its future SHA/tree, exact statistics, patch reconstruction
and publication result are external to avoid a circular self-commit claim. Ordinary
non-forced publication may include only the approved unpublished suffix of
`aecf4fd… → f8751a0… → 0623d7c… → 3f0c6c6… → documentation child`.

Operational evidence root:
`D:\Projects\LitigationData\review-evidence\tasks46-47-acceptance-activation-publication-20260917\operation-20260917T080046Z-677ccb99-2443-4052-87bb-b7ee3ee6d8df`.
Private recovery content stays outside the shareable package; sanitized verification
and inventories are delivered. Leave the accepted app running. Stop for independent
operational-delivery review before Task 4.7a, Task 4.8 or deployment work.
