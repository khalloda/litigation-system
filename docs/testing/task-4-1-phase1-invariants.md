# Task 4.1 Phase 1 — invariant inventory and isolated test profiles

Migration 62 is implemented and verified on isolated databases; it is not
deployed to the project. D52–D57 own business policy; `TASKS.md` owns status.

| Exact state | Historical profile | Canonical profile |
| --- | --- | --- |
| Complete migration 61, repository 62 solely pending | 107 | 89 |
| Complete migration 62 | 116 | 98 |

DB-001–DB-093 retain the existing executable inventory. All 14 STAFF checks
remain mandatory in both profiles. The [prior inventory](task-4-0a-phase1-invariants.md)
identifies the 18 historical-only DB checks; their artifact requirements and
original frozen digests are unchanged. A clean replay has no extraction,
review-answer or high-impact application payload and must not claim otherwise.

DB-052–DB-056 reconcile the exact original 318 clients and 188 contacts through
immutable original-row views after migration 62. Those views retain the old
column shape and original IDs, values, timestamps and actors. At checkpoint 61,
the checks still use the actual original live rows. Live edits and native rows
are checked separately; changed imports are never exempted from reconciliation.
Task 2.9 protected-state and high-impact workbook lookup checks use the same
historical projection, preserving their original byte digests and labels.

`scripts/lib/client-contact-checkpoint.ts` adds these nine required checks:

| ID | Required in both profiles |
| --- | --- |
| CLIENT-01 | Exact migration identity/checksum, complete boundary surfaces and correct profile |
| CLIENT-02 | Original system/Access IDs, exact initial values and staging payloads/keys/fingerprints |
| CLIENT-03 | Imported/native populations distinct; legacy/raw/branch and D39 evidence retained |
| CLIENT-04 | Fixed contact ownership; optional same-client unarchived main contact; required native names |
| CLIENT-05 | Positive database versions, original creation provenance and continuous attributed audit events |
| CLIENT-06 | Immutable creation receipts, exact payload hashes, native result/actor/parent ownership and one creation event |
| CLIENT-07 | Exact function bodies, fixed paths, trusted ownership and exactly three runtime gateways |
| CLIENT-08 | Exact public/private constraints, indexes, immutable/lifecycle triggers and private privileges |
| CLIENT-09 | Exact ten added audit field classifications; historical classifications unchanged |

The helper fails as a whole if any assertion fails; no failed check is caught
and reclassified as historical-only. Partial, unfinished, extra, mismatched or
unknown states fail closed. The older staff 60→61 proof retains its exact source
guard and a byte-verified 61-file migration mirror; it never deploys 62 as part
of that proof.

## Commands

- `npm run test:client-contacts`: one task-owned PostgreSQL 17.11 cluster;
  read-only in-memory project copy at 61 upgraded to 62, then separate canonical
  replay through 62. Includes forced migration rollback, malformed-state
  refusals, native/imported mutations, actual lock contention at all three
  isolation levels, audit rollback, legacy-transform refusal and exact Gate 4
  imported accounting after native additions.
- `npm run test:client-regressions`: serial current authentication, 448
  permission decisions, accounts, staff reads/mutations, audit/event and pure
  Gate 4 regressions. Authentication/accounts/audit/events each run on both
  independent canonical replays and exact historical-62 clones. Staff proofs
  use the normal read-only entry point and bounded borrowed mutation fixtures.
  The outer source must be the complete historical profile at exactly 61 or 62.
  Only a disposable 61 clone is upgraded. Complete 62 reuses its boundary and
  never invokes migration deployment or the untouched-live-row import oracle.
  Immutable imports and valid operational changes are checked separately.
  `--suite=authentication|accounts|staff|audit|gate4` selects a focused rerun when
  passed directly to `scripts/test-client-contacts.ts --regression-proof`.
- `npm run test:audit` and `npm run test:audit-events`: current migration-62
  isolated wrappers accepting the same exact historical 61/62 source states;
  `test:audit:historical` remains the separate exact 53–60
  historical proof and is unavailable from the project migration-61 source.
- `npm run db:check -- --profile=historical-full-state-upgrade`: read-only
  project predeployment verification (107), or explicit upgraded fixture (116).
- Canonical checking requires the generated fixture URL and explicit
  `--profile=canonical-clean-replay` (98); it cannot stand in for historical proof.
- `npm run test:staff-read-only` and `-- --project-read-only`: derive the exact
  supported 61/62 checkpoint from actual database evidence, independently of
  fixture borrowing. The project-only option retains forced read-only connections.
- `npx --no-install tsx scripts/test-client-regression-source.ts --entry-points`: start from
  actual historical 61, prove exact 61/62 handling and rejected malformed states,
  invoke migration deployment exactly once for the owned 61 copy and zero times
  for complete 62, then run the ordinary npm entries against 62 after legitimate
  imported edits, native additions and archive/restore. Normal staff is exercised
  on both states. Omit the flag for the focused source proof. This separate proof
  never forges an earlier migration ledger or removes the boundary to simulate 61.

The wrappers independently check cluster identity, task ownership, PostgreSQL
version, isolated storage/network and a loopback-only port other than 5433.
They remove their own databases, credentials, container, volume and network.
An existing isolated descriptor selects that verified source's `litigation`
database for read-only copying; default invocation selects the project. A mismatched
connection/descriptor fails before fixture creation. No source is silently replaced.
No Access file is read. The full `reconcile:gate4` Access comparison is outside
this phase; its affected PostgreSQL accounting and pure fixture suite are tested.
