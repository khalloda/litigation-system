# Task 4.0a Phase 1 — database boundary and operational invariants

- Implementation acceptance evidence: 6 September 2026.
- Model: GPT-6 Astra; reasoning: High; environment: Local.
- Subagents/delegation: prohibited; none used.
- Expected usage: High in the original mandate, medium in its continuation, High for the bounded correction.
- Starting commit: `b3500d0403ef15056cce404fb8cb478119f3ccd2`.
- Original implementation commit: `2d25f937b4a70b2d1d478a2ba17818079185fc7f`, preserved unchanged.
- Correction: the enclosing commit with subject `fix: decouple staff boundary from operational drift`; section 21 records its separate evidence. Its full SHA and patch checksum are reported after creation.
- Push: prohibited; not pushed.
- Authorized correction stop: one additional local commit and its full-index binary-safe patch outside Git, then independent review. No push or deployment.
- Current return point: **Task 4.0a Phase 2 — read-only staff roster**; not started.

This is fixed implementation/test evidence. Its migration-60 preservation,
pending-deployment statements and command results describe that earlier work.
The separate [7 September deployment acceptance report](2026-09-07-task-4-0a-phase-1-migration-61-deployment.md)
records recovery readiness, real migration-61 deployment and post-deployment
verification: project PostgreSQL is now at 61, with 107/107 permanent historical
invariants. Phase 1 is operationally complete. [TASKS.md](../../TASKS.md) owns
current status; [DECISIONS.md](../DECISIONS.md) owns policy. Access remains the
department's active system; final cutover remains separate under D43/D51.

## Configuration, authority and scope

One local agent retained the stopped task's evidence and avoided repeating
successful pre-edit reproductions. High reasoning was appropriate to immutable
migration evidence, PostgreSQL concurrency, least-privilege changes and
historical replay. No additional agent, dependency or external service was
needed. Work exceeded a simple migration because the existing audit fixtures
also needed safe, exact historical checkpoints; no usage total is invented.

Khaled Helmy authorized Phase 1 on 6 September 2026, then explicitly authorized
a separate disposable PostgreSQL 17.11 Docker cluster and independently
mandatory historical/full-state and canonical/clean profiles. The retained
conversation approvals govern those operations. D44–D49 supply the business
contract; D50 browser evidence remains Phase 4. Existing D35 principal controls,
D38 account safety, D43 durable source identity and the audit contract remain
binding. No new decision ID or changed business policy was required.

Scope: one forward migration, Prisma representation, permanent checks,
internal database gateways, isolated fixture infrastructure, regressions and
documentation. Prohibited scope stayed untouched: project database/container
writes or deployment, Access/cutover, staff routes/actions/UI, Phases 2–4,
Task 4.1, browser work, dependencies/lockfiles, governance edits, subagents,
amend/rebase/squash and remote writes.

## 1. Preflight state

The original fail-closed preflight passed on clean `main`, including untracked
files, with no active Git operation. One `git fetch origin` established
HEAD = origin/main = `b3500d0403ef15056cce404fb8cb478119f3ccd2`, ahead/behind
0/0. Its subject was `docs: clarify Task 4.0a identity invariants`; parent
`2fd77aa21442efa9344572bd460b28a2de093480` had subject
`docs: approve Task 4.0a staff roster contract` and parent
`98d20ae4494aa7085f0e29086cfebe9b4070abe9`.
Task 4.0a, all four phases and Task 4.1 were unchecked.

Continuation preserved the two specifically authorized uncommitted fixture
files and original successful reproduction evidence. Fresh read-only repository
and source-state comparisons matched the original baseline; this was not a
restart. Migration 60's bytes remained unchanged throughout (section 17).

## 2. Pre-edit reproduced gaps

All reproduction writes were confined to the original disposable fixture
`litigation_task40a_preedit_57564_1788704634230`, which was removed. They were
not repeated against the project database.

- Deactivating imported staff changed the old active baseline from 21 to 20;
  a legitimate canonical rename changed three reviewed alias mappings.
- Runtime creation could retain imported/native `false` and no primary alias.
- All four cross-table normalized-name races allowed both competing commits.
- Email case/whitespace variants could coexist.
- Imported alias spelling and ownership could be changed.
- An inactive reviewer could remain assigned.
- Person deactivation left its account enabled with session version 1; person
  reactivation restored stale account eligibility.

These were observed failures of the old boundary, not merely inferred risks.

## 3. Schema and migration design

Migration 61 runs transactionally with UTC interpretation, locks the four
roster/account tables and blocks audit-event/actor writers during the snapshot.
It requires the approved direct migration principal,
the exact migration-60 ledger/checksum and no partial Phase 1 objects. Independent
original roster projections and explicit source-profile evidence gate creation.

Seven columns are added: people `row_version`, `alias_epoch`,
`application_modified_at`, `application_modified_by`; alias `is_retired`
and `retirement_reason`; team `row_version`. Four immutable private snapshot
tables, one serialization row/table and one append-only full-row change ledger
provide the boundary. Six narrow public `staff_*` gateways own runtime writes.
No application mutation endpoint was exposed.

Runtime loses direct roster DML and the three roster sequences. Fixed-search-path
definer functions perform authorized mutations; deferred constraints enforce
the final cross-table state. The existing account-derived login trigger retains
its exact body, now running as its definer after roster UPDATE revocation.
The change does not rewrite original business values or timestamps.

## 4. Immutable boundary counts and digests

The snapshot preserves all 137 original people, explicitly distinguishing 135
imported (64 internal, 71 external) and two existing native people; all 350
aliases, distinguishing 348 imported and two native; both teams; 20 source-table
fingerprints; three full roster-source payloads; and the prior audit boundary.
The reviewed protected historical prefix ends at event 824. The deployed
boundary captures the actual valid predeployment maximum, not a fixed total.
Every original primary flag is kept. `prior_event_count` and
`prior_events_sha256` freeze every complete pre-boundary event, including its
timestamp, through `last_prior_event_id`. The full reviewed 824-event prefix is
independently pinned to SHA-256
`e49706d35eeae3dcb15bc08f1da8196528924d40495c7e092864ad71393cbf29`.

Original reviewed-state full-value snapshot SHA-256 (operationally changed
predeployment state has its own actual full-value digest):

| Snapshot | SHA-256 |
|---|---|
| People | `b4fa2bbc9ed20cbcb71acc947733008271adf092573cfde6ad5aa16fb3a26bdd` |
| Aliases, including imported classification | `476d1a683fec3c9a73072df200beddc6d898308d4f83e31b963fb8af27a081df` |
| Teams | `901982a8dfe38843eb2e32740368cc420de204ac3db6c6210c32035f53e55eed` |

Independent business projections exclude audit metadata; people additionally
exclude account-derived `can_login`. All those excluded values remain in the
complete snapshot/digest. Current `can_login` is independently checked against
active employment and an enabled account; enabled accounts require active
internal people. No value is reset to make the migration pass.

| Projection | SHA-256 |
|---|---|
| People business evidence, both profiles | `073f4cf16867bf56f02366f908ee22fe025d0711a6130159428f2da09c2f2647` |
| Teams, both profiles | `494f8d73dbe6da5bf4aa1aa0b170f06e21abf40caa7e064c8a6f37a1044bcb60` |
| Historical aliases | `a7466bda93ea6045822f55bed90e93f00561f3fc60dd2922cbb780d6d799091d` |
| Canonical aliases | `716fea9249b0faeda9285e3881bce60d9b5f5a73341a77b97d3dbec3e8eda6c8` |

Historical alias sequence consumption explains the final imported/native IDs
349/350/351 versus canonical 348/349/350. Actual IDs are preserved, not renumbered.
Canonical full-row snapshots include that replay's genuine seed timestamps;
they are verified against the captured rows and independent core projections,
not falsely claimed byte-identical to historical timestamps.

## 5. Provenance and row-version behavior

Runtime native creation is hardcoded and database-enforced. Existing
imported/native/internal classification and stable IDs cannot be changed.
Application modification time and immutable human actor attribution are
database-owned. Alias changes advance the owning person's version; controlled
rename may advance it more than once and returns the final version.

No-op save/rename changes no row, timestamp, version or event. Two sessions
using the same old version cannot overwrite silently. A private append-only
ledger ties complete current row hashes to unique audit events; unexplained
current-state drift fails permanent checks. UTC-canonical JSON was tested from
a Cairo-timezone session. D43 future differential cutover is not implemented.

## 6. Identity, alias and email enforcement

The approved `ar_normalise()` is unchanged, including rejection of the old
global Latin J-to-Arabic fold. One real serialization row covers canonical
creation/rename, aliases/restoration, reviewer and linked account transitions.
Different owners cannot collide across either table, including inactive and
external identities. Same-owner equivalent spellings remain allowed.

The statement-level mutex covers **every user-account write**, including
successful/failed-login state updates, not only staff lifecycle operations.
It favors race safety and can introduce brief contention between login and
roster activity. It is retained unchanged for the present firm scale. Measure
that contention during the later service/UI phase before proposing narrower
locking; the existing audit benchmark does not measure mutex performance.

Every person must finish with exactly one active primary matching the canonical
Arabic name. Runtime cannot edit external people. Imported aliases cannot
disappear, change spelling/owner/provenance or retire; original primary flags
remain immutable evidence. Controlled rename retains the stable person ID and
former spelling, and changes the primary atomically. Only native non-primary
aliases retire/restore, with reasons, audit evidence and renewed collision checks.

Email is trimmed and lowercased; blank becomes null; normalized non-null values
are unique under concurrent writes. The original unique constraint remains.
Identical official names fail closed; no merge, suffix or shared-email exception
was invented.

## 7. Staff/account and Administrator safety

D46 deactivation retains relationships, disables the linked account, clears
lockout, increments its session version and records structural/semantic facts
atomically. Employment restoration never enables the account. Existing
authentication tests prove database-refreshed eligibility/session invalidation.

Current usable human Administrator context is revalidated after serialization.
Self-deactivation, removal of the last usable Administrator, stale actor
demotion and concurrent account enable/create versus person deactivation are
rejected safely. Existing `/users` remains the only account-management surface.
Future staff services still need their own server authorization and stale-response
workflow; database proof is not claimed as completed Phase 3 service evidence.

## 8. Team/reviewer enforcement

Exactly two original teams remain; no runtime create/rename/archive/delete path
exists. Membership remains nullable. One person may review both teams and need
not belong to either. Reviewers must be active internal non-trainees.
Replacement is required before deactivation or becoming a trainee. Reassignment
versus deactivation/trainee races passed in both profiles.

## 9. Audit and database-principal enforcement

Direct roster DML, physical deletion, private evidence/helper access and roster
sequence access are denied to runtime/PUBLIC. Gateway execution, ownership,
fixed search paths, role memberships, schema/column/sequence ACLs and trigger
enablement are permanently checked. Twenty-four constraint definitions and
ten indexes have independent exact catalog expectations.

Seven new audit-field classifications are explicit; the original 583
classifications and frozen historical/canonical digests remain unchanged.
Late event failure rolls back business rows, aliases, versions and events.
Existing password/hash/token/cookie/URL redaction and immutable actor tests passed.

The original D35 principal verifier remains the entry point for migration and
runtime clients. Temporary exact migration-56/60 mirrors are accepted only by
an identity-bounded runner that checks target isolation, config, directory
inventory, every original SQL byte and absence of symlinks. No principal guard
was relaxed. Existing compromised-process GUC impersonation is a reproduced
residual trust boundary, not fixed or overstated; a trusted database superuser
can also bypass application guards.

## 10. Historical-upgrade result

Final acceptance run 79998: full-state read-only source dump restored only into
the separate instance; all 97 source-table fingerprints matched before upgrade.
All **93 original invariants passed before 61**, then **107 passed after 61**
and after legitimate roster mutations. All original table values and timestamps
were preserved by migration, except the explicit migration-ledger entry and
seven audit-field additions. Added operational columns have declared defaults.

Complete extraction, 744 review answers, Task 3.5B release/resolutions, original
relationships and protected histories remained present and exact. Missing,
altered or unclassified historical artifacts fail; this profile cannot become
canonical by omission. Frozen historical digests were not regenerated.

## 11. Canonical clean-replay result

The approved empty PostgreSQL 17.11 state uses UTF-8, Arabic ICU `ar-EG` and
`C.UTF-8`. The complete Git migration history through 61 passed. Exact
migration-owned identities, passwordless initial accounts, schema/principals
and snapshots were asserted before generated fixture credentials were installed.

**89 invariants passed:** 75 universal original checks plus all 14 Phase 1 checks.
The [107-entry inventory](../testing/task-4-0a-phase1-invariants.md) positively
classifies 18 original historical-only checks by their unavailable non-Git
artifact. Both profiles are mandatory; there is no generic empty/missing skip.

Canonical source fingerprint, historical review-answer and release payload
absence is asserted explicitly, alongside exact Git-owned reconciliation rules.
A single copied historical source row was rejected as a hybrid. Synthetic
disposable rows supply operational/security tests without pretending to be
historical source data.

## 12. Concurrency, adversarial and atomicity results

Both profiles passed the same **22 mutation groups** (44 reported group passes):

- Atomic native creation, one matching primary, truthful immutable actor.
- No-op save/rename.
- Database-owned provenance/version, normalized email and stale save refusal.
- Blank/null email behavior.
- Native rename plus reasoned alias retirement/restoration.
- Imported rename/identity preservation and retirement refusal.
- Direct DML/deletion/private/helper/sequence denial and current Admin checks.
- Both-team reviewer without membership; self/invalid reviewer refusal.
- Four normalized collision directions at READ COMMITTED.
- The same four directions at REPEATABLE READ.
- The same four directions at SERIALIZABLE.
- Two-session normalized-email uniqueness.
- Two-session optimistic version race.
- Alias restoration after a competing identity claim.
- Reviewer assignment versus deactivation/trainee change.
- Atomic D46 deactivation and employment-only restoration.
- Person deactivation versus account enablement/creation.
- Actor demotion plus self/last-Administrator concurrency.
- Late audit failure fully rolls back rename and events.
- Disabled constraints/triggers and broadened ACLs fail permanent checks.
- Cairo-session full-row/event continuity.
- All permanent checks after legitimate edits and rejected attacks.

At READ COMMITTED the second writer waits and sees the committed state; at
stronger isolation a stale snapshot fails serialization rather than committing
a collision. Both profiles separately passed deliberately late migration failure
with no partial boundary, and invalid-prestate refusal without silent repair.

## 13. Implementation checkpoint preservation and resource cleanup

At the implementation checkpoint, final forced-read-only verification matched
the original baseline:

| Protected surface | Before = after |
|---|---|
| Applied migrations / invariants | 60 / 93; 61 is the sole expected pending repository migration |
| All original table fingerprints | 97 tables; `d0f6314f73fded3a0b1de352b4d704f91406ab857b2406df6b6448fafcdc24e0` |
| Roles, memberships, database ACLs, role settings, parameter ACLs | `27fb62b80c3e72acfcd331d4dde46532d8f84fb175985b045738eccb116f3832` |
| Schema-only normalized dump | `6b3f62da95243e1287a0d16860788bf2e4c328c83ea50bff3db294b7a648b661` |
| Logo/runtime storage inventory | 54 files, 1,541,428 bytes; `7a1ef4943a8f74ace2b001e81f533df083690b179bfb0b3439a1f54604787405` |
| Protected business/timestamps | 5,209 rows; `b50879f52200275e70515cb4e1daa76594c304237a40b864205108e15490aeab` |
| Audit attribution | `edf4be9e8668fc65005deaa69cababf79dec1ac1b3e12f2356b9e6da892c009d` |
| Billing canonical rows | `81f1d4176828d109f5af1bd90a397408c32dc967751254e172312de74c330925` |
| Billing stable IDs/timestamps | `a4e35c491255067d824aff6085a095d92d02bcf0946490c72c081632d4b200f2` |
| Attendance | `f6971cca7139e191d1fc192d290d496436d8bbc0c6153dd27d00c295e6b10ab5` |
| Logo source/result | `5fa708e0a5ade8bb1b9b81cc16d4a9a3d225d7226e0043e71968ca128c7bdf1f` |
| Extraction | `40ebf988d4c952a676a4a00a403ae9576d87c18e35d4f7e3bad0a62df92d5979` |
| Review associations | 744; `bebf8f20140a63d272f80d454d8363d68e1dc7bf12d82b43a45096281b059f51` |
| Review answer payload | 668 + 76; `cd19213bcad7ad24912c6067384f25aade84f5a1d479be37f0608755d9f75a35` |
| Existing audit events | 824; `d36565f0c1676642fe481c73d4029fa021ef652aea4260b71be4b362054b9003` |

People stayed 137: 66 staff (23 active, 43 inactive), 71 external; imported/native
135/2. Aliases stayed 350: imported/native 348/2, primary 137. Teams/accounts/
actors/events/original audit-field classifications stayed 2/4/7/824/583.
No Phase 1 object or migration-61 ledger row exists in the project database.

Project container `litigation-db` retained ID
`788259eb84a756ef0f7ddb2d8b1984297e04208e118884c5bcf80b448305a929`,
start time `2026-09-05T07:52:28.565340199Z`, image, config, localhost port 5433,
`litigation-db-data` volume and original Compose network. Its roles, catalog
settings and other client-session inventory were unchanged; no pre-existing
client sessions were terminated or modified. Verification connections closed.

The existing official local `postgres:17-bookworm` image resolved to
`sha256:84560e3b9c6874893fc4e2854f5dc3e7c1a37bc9d1dfd7a8c641310ae22ba5ad`
and PostgreSQL 17.11 (Debian 17.11-1.pgdg12+2, linux/amd64). No pull was needed.
Each instance used a unique `litigation-task40a-UUID` ownership label, its own
single volume/network/cluster, generated credentials and localhost-only ephemeral
port other than 5433. Before startup and before migration, identities/mounts/
networks/ports/cluster IDs were validated. Project storage was never mounted.

Final acceptance, auth and audit containers respectively ended in
`b1015fb8-916c-43e5-abeb-d256c27b4128`,
`f12f590a-7628-45ec-b85e-ac033dd473ff` and
`d47c83a3-a1b1-49d1-b5aa-c60601cf6ded`; each cleanup passed.
All earlier task instances also passed identity-bounded cleanup. Global
pre-existing Docker resource-name inventories and project identity matched
before/after. Every task database/role/session disappeared with its isolated
cluster and volume. No task container, network or volume remains.

Dumps went memory-to-stdin only; buffers were zeroed and no dump file existed.
Credentials were never reported/committed; task processes and environments ended.
Temporary exact migration mirrors and the build mirror were removed. Build
cleanup first refused three generated junctions: their targets were inspected,
only the owned junctions unlinked without traversal, then the validated mirror
removed. Original dependencies, storage and existing `.next` were preserved.
The requested external review patch is the sole retained task export.

## 14. Original twelve ranked risks

Ranks and real-world consequences are unchanged from the
[readiness audit](../reviews/2026-09-06-task-4-0a-staff-roster-readiness-audit.md).

| Rank | Risk and original consequence | Disposition and evidence |
|---|---|---|
| 1 | Live roster frozen by Stage 2: a valid rename/departure breaks checks, or weakening them loses migration evidence. | **Closed by Phase 1.** Immutable stable-ID evidence and current-state checks; historical 107 checks pass after legitimate changes. |
| 2 | Account stays enabled after deactivation: an old JWT revives when the person is restored. | **Database foundation completed; later service/UI evidence required.** Atomic disable/version invalidation and auth regression pass; Phase 3 must invoke this boundary and prove staff workflow. |
| 3 | Normalized duplicate race: two Administrators create Arabic spellings resolving to one identity. | **Closed by Phase 1.** All four directions at all three isolation levels reject different owners in both profiles. |
| 4 | Imported alias changes/reassignment: hearings, matters, POAs or cutover resolve the wrong person. | **Database foundation completed; later service/UI evidence required.** Immutable 348 imported aliases and atomic rename proved; Phase 3 controlled rename workflow remains. |
| 5 | Reviewer becomes inactive/unsuitable: both teams retain someone who should not approve work. | **Database foundation completed; later service/UI evidence required.** Eligibility and replacement races proved; Phase 3 replacement interaction remains. |
| 6 | New application row is classified imported: final cutover overwrites or misclassifies a hire. | **Closed by Phase 1.** Gateway and database guard force native creation, immutable classification and audited modification. D43 cutover itself is deferred. |
| 7 | Last/acting Administrator deactivated: the firm loses administrative access. | **Database foundation completed; later service/UI evidence required.** Self/current-actor/last-Admin races and existing user suite pass; staff-service coverage remains Phase 3. |
| 8 | Stale form overwrites newer work: one Administrator silently reverses another's edit. | **Database foundation completed; later service/UI evidence required.** Database-owned versions, no-ops and two-session conflict proved; Phase 3 stale-response UI remains. |
| 9 | Genuine people share a normalized name: strict uniqueness rejects a legitimate hire. | **Database foundation completed; later service/UI evidence required.** D49 fail-closed behavior proved; Phase 3 must explain and escalate the owner exception without fabricated suffixes. |
| 10 | Staff entry omitted from permission inventory: a page/action evades structural authorization. | **Explicitly deferred to Phase 2/3.** No new entry exists; existing 448 decisions and inventory regression pass. |
| 11 | Static-only accessibility: keyboard, focus or mobile reflow defects reach users. | **Explicitly deferred to Phase 4 under D50.** No browser/UI proof claimed. |
| 12 | Alias joins duplicate people: pagination counts/ordering confuse users. | **Explicitly deferred to Phase 2.** Distinct stable IDs, deterministic ordering and query-plan evidence remain required. |

No Phase 1 blocker remains. Trusted-process/GUC and superuser limitations are
explicit in section 9. No claim is made that Phase 1 completes staff services,
deploys the migration or resolves future owner exceptions.

## 15. Original implementation changed files

```text
HANDOFF.md
README.md
TASKS.md
docs/DATA-MODEL.md
docs/DATABASE.md
docs/DECISIONS.md
docs/MIGRATION.md
docs/PERMISSIONS.md
docs/PRD.md
docs/VISUAL-DIRECTION.md
docs/task-reports/2026-09-06-task-4-0a-phase-1-database-boundary.md
docs/testing/task-4-0a-phase1-invariants.md
prisma/schema.prisma
prisma/migrations/20260906180000_staff_roster_database_boundary/migration.sql
scripts/check-db.ts
scripts/lib/attendee-audit-plan.ts
scripts/lib/attendee-audit-reconciliation.ts
scripts/lib/audit-event-structure.ts
scripts/lib/audit-structure.ts
scripts/lib/auth-structure.ts
scripts/lib/fixture-migration-checkpoint.ts
scripts/lib/isolated-postgres-fixture.ts
scripts/lib/legacy-audit-fixture-checkpoint.ts
scripts/lib/matter-relationship-reconciliation.ts
scripts/lib/permanent-invariant-inventory.ts
scripts/lib/read-links.ts
scripts/lib/staff-roster-baseline.ts
scripts/lib/staff-roster-catalog.ts
scripts/lib/staff-roster-checkpoint.ts
scripts/lib/staff-roster-fixture-tests.ts
scripts/lib/staff-roster-structure.ts
scripts/lib/staff-roster-test-adapter.ts
scripts/run-prisma-migration.ts
scripts/test-audit-events.ts
scripts/test-audit.ts
scripts/test-auth.ts
scripts/test-permissions.ts
scripts/test-staff-roster.ts
scripts/test-user-management.ts
```

No governance, application `src`, dependency/lockfile, Docker Compose or
pre-existing migration file changes. The two original uncommitted fixture files
were included in original implementation commit `2d25f937`. The correction's
separate nine-file scope is recorded in section 21.

## 16. Original implementation verification and resolved failures

All mutation commands below were dispatched through the isolated harness, not
against project port 5433. The profile flags and exact classification are in
the [testing document](../testing/task-4-0a-phase1-invariants.md).

| Exact command or bounded command family | Final result |
|---|---|
| `git fetch origin` | One preflight fetch; expected checkpoint, 0/0. No push. |
| `node node_modules/prisma/build/index.js format` | Passed using the installed Windows schema engine. |
| `node node_modules/prisma/build/index.js validate` | Passed. |
| `node node_modules/prisma/build/index.js generate` | Passed; ignored generated client only, dependencies unchanged. |
| `node node_modules/tsx/dist/cli.mjs scripts/test-staff-roster.ts --profile-acceptance` | Exit 0, run 79998: 93 before / 107 historical after / 89 canonical after; 22 groups each; both atomicity proofs; hybrid refusal; source preservation and cleanup. |
| `node node_modules/tsx/dist/cli.mjs scripts/test-staff-roster.ts --regression-proof` | Exit 0, run 63522: auth, 448 permission decisions, route/action static negatives and user/account lifecycle suite. |
| `node node_modules/tsx/dist/cli.mjs scripts/test-staff-roster.ts --audit-regression-proof` | Exit 0, run 10248: both audit suites, migration principal rejection, historical 53–60 checkpoint replay, canonical 61, every inbound ADMIN/INHERIT/SET combination and ACL bypass tests, atomic events and redaction. |
| `npm run db:check -- --profile=historical-full-state-upgrade` with `PGOPTIONS=-c default_transaction_read_only=on` | Exit 0, final source run 25228: exactly 93 at migration 60; sole pending 61 is reported, not represented as deployed. |
| `npm run check` | Exit 0, final run 32699: TypeScript, ESLint, Prettier, RTL, auth/audit/user inventories, ignore checks and 345 correctly encoded files. |
| `npm run build` | Passed on a byte-identical 362-file disposable copy with generated secrets and unreachable localhost database URLs; compiled 8 routes, 8/8 static outputs; compile 9.1 s, TypeScript 9.7 s. Existing project `.next` and all copied source hashes unchanged. |
| `git diff --check` / `git diff --cached --check` | Required clean before the single commit. |
| `git diff --name-only`, `git ls-files --others --exclude-standard`, targeted `rg` and SHA-256 checks | Phase 1 scope only; no dependency/governance/source UI drift, credential, raw-data, export, storage or workstation-path addition. |
| Read-only `applicationInventory` + exact migration reconciliation + normalized `pg_dump --schema-only` + role/ACL/storage SHA-256 comparison | All section 13 values match before/after; no Phase 1 source object. Source reads use READ ONLY transactions and default read-only PG options. |
| Identity-filtered `docker inspect`, `docker ps -a`, `docker volume ls`, `docker network ls`, process/temp inventory | Task-owned resources removed; pre-existing resources unchanged. |

Prisma's installed engine is selected with
`PRISMA_SCHEMA_ENGINE_BINARY=node_modules/@prisma/engines/schema-engine-windows.exe`.
Migration-ledger status is proved by exact repository-file/checksum reconciliation
at the two explicit checkpoints. At that implementation checkpoint the project
source still had migration 61 pending; these test results did not establish
project deployment.

The audit benchmark appended 45,463 events in 11,228.5 ms and retrieved an indexed
50-row entity page in 0.140 ms. Keyset pagination across equal timestamps had no
duplicates/gaps. These are fixture measurements, not a staff-search benchmark.

Earlier attempts were not silently counted as acceptance:

- Initial isolated locale was not the approved Arabic ICU state. Corrected;
  final acceptance 79998 and final regressions use the correct state.
- Historical/canonical alias sequence and account-ID differences were resolved
  from exact identity evidence, not by renumbering or changing frozen digests.
- PostgreSQL template cloning did not inherit database ACLs; exact approved ACLs
  are now copied and compared. Arabic ICU sort order is handled explicitly.
  Principal expectations were not relaxed.
- A valid Cairo-session write initially failed full-row continuity. Reproduced,
  then fixed with UTC-canonical serialization. Both final profiles pass it.
- Old audit fixtures refused deletion of protected historical relationship and
  audit-classification rows. Guards were not disabled. The fixtures now restore
  the independently frozen historical partition or replay exactly through 56
  before testing 57 rollback. All mutation stays in isolated databases.
- One early audit failure left an owned idle child. Its exact PID/parent/command
  were verified before termination; finalization was corrected. No project
  session or process was terminated.
- Static checks caught direct Prisma spawning and a direct PostgreSQL import
  outside the D35 gateways. Both were routed through the existing verified
  principal/runner boundary; the checker was not weakened.
- Sandboxed `npm run check` could not spawn Git (EPERM); the authorized local
  run passed. The build itself exited 0; its outer cleanup initially stopped at
  three unrecognized generated junctions. Identity-verified cleanup then passed,
  preserving their original targets.
- The final broad text scan flagged three pre-existing storage-path lines and
  two generated-credential URL templates. Exact comparison proved the path
  lines unchanged; code review proved the two passwords are separately generated
  random values, not embedded credentials. The final scan passed for all 39
  Phase 1 files and 19 new relative documentation links, with no new workstation
  paths or secret/raw/runtime export files.

No mandatory profile was reduced. Browser/staff-service/Access/deployment checks
were not run because they are explicitly outside this phase.

## 17. Migration identity and SHA-256

New migration:
`20260906180000_staff_roster_database_boundary`

SHA-256:
`87e04320badc5bc71de1c30eae02c72f82ae0e59f2088b42cb0806f6b25c8904`

The original implementation/pre-edit reproduction used
`588f23fdecaa497599773eacec8c302fbbca426dc0c888151fef5f2e64f89959`.
Section 21 distinguishes correction verification from that earlier evidence.

Unchanged migration 60:
`20260904180000_prepare_high_impact_application`

SHA-256:
`7921c9b168549928185bfd0b915ccc725ba363787158990c614420e0e3bbbee5`

Only the disposable instances applied 61 during this implementation work.
The separately authorized project deployment is recorded in the
[deployment acceptance report](2026-09-07-task-4-0a-phase-1-migration-61-deployment.md).

## 18. Commit and review export

The correction authorizes exactly one additional local commit after complete
unstaged/staged review and final checks. Original commit `2d25f937` must not be
amended, rewritten or replaced. The external binary-safe full-index patch represents
exactly its parent-to-commit diff. Final SHA, patch absolute path, byte size,
SHA-256, full-index entry count and `git apply --reverse --check` result are
reported after creation, outside this self-referential commit record.

## 19. Final Git state

Required handoff state: `main`, clean including untracked files; no active Git
operation; HEAD exactly one correction above original Phase 1 commit `2d25f937`;
origin/main unchanged at `b3500d0403ef15056cce404fb8cb478119f3ccd2`;
ahead/behind 2/0. Nothing pushed. The final
conversation report records the actual full commit and verified state.

## 20. Exact return point

**Task 4.0a Phase 2 — read-only staff roster**; not started.

Only the Phase 1 checkbox is complete. Task 4.0a itself, Phases 2–4 and Task 4.1
remain unchecked. No staff route, UI, Access cutover or later-phase work started.

## 21. Bounded deployment-readiness correction — 7 September 2026

The owner separately authorized one correction commit, not a rewrite of
`2d25f937b4a70b2d1d478a2ba17818079185fc7f`. Sections 1–2 and the original test
records above retain the original Phase 1 evidence; the corrected design,
checksum and handoff rules are stated in sections 3–4 and 17–19. No owner
decision was added or modified, and D44–D50 remain unchanged.

### Fresh preflight and mandatory pre-edit reproduction

Authorities were read in the required order. One fetch confirmed clean `main`,
including untracked files; no active Git operation; HEAD `2d25f937`, parent and
origin/main `b3500d0403ef15056cce404fb8cb478119f3ccd2`, ahead/behind 1/0;
exact subject `feat: enforce staff roster database boundary`; original migration
61 SHA-256 `588f23fdecaa497599773eacec8c302fbbca426dc0c888151fef5f2e64f89959`;
unchanged migration 60 SHA-256 from section 17; 93/93 read-only source checks.
All 97 table fingerprints, schema, role/catalog and storage fingerprints matched
the original preserved state before edits.

Two independent complete migration-60 clones reproduced the defect before any
repository edit. Each matched all 97 source table fingerprints. The existing
restricted-runtime services, not fabricated event INSERTs, performed:

| Reproduction | Valid actual change | Old migration 61 refusal |
|---|---|---|
| Unknown-username authentication | `authenticateCredentials` returned null and appended one `login_failed` event; 824 → 825 | `Historical profile evidence is absent, partial or unexpected` |
| Non-Administrator account disable | `disableManagedAccount` disabled the exact account resolved by stored username `IHamdy`, person 4; `can_login` true → false; events 825/826/827 are account row, person row and `account_disabled` | `Original roster identity/state differs; no automatic correction is permitted` |

Both failures were P0001 and left no partial Phase 1 surface. The complete prior
audit prefix, immutable people business projection, aliases, teams, source
evidence and every unrelated table remained unchanged. Existing authentication,
audit structure/data and runtime-principal checks passed before the attempted
migration. The first clone retained the old people projection; only the second
changed it. Its independently measured business-only projection was
`073f4cf16867bf56f02366f908ee22fe025d0711a6130159428f2da09c2f2647`.
The old projection including derived `can_login` was
`1c80a3dc7aadbf2ff121de59f0d1a3970d5fcdc323e7f394f1968c24c4b774fd`.
These are distinct named projections, not a relabeling of a frozen digest.
The reproduction cluster and all its owned resources were removed.

### Correction contract and permanent proof

Migration 61 pins the reviewed prefix's complete timestamp-inclusive digest;
checks the existing baseline and installed event constraints; validates later
actor/target identities, event-time username/role snapshots, bounded classified
structural fields and the approved semantic action/outcome/target shapes.
Captured after-values must also connect to the next before-value or the actual
final row; a known earlier captured value anchors subsequent before-values.
Timestamp-with-time-zone fields compare instants, not timezone spelling.
Mutable username/role evidence is resolved at event time, not guessed from the
current role. Valid later events do not change historical extraction profile
classification. A shared lock on the audit-event and actor tables blocks writers
while the four locked roster/account tables and full prior trail are captured.
Sequence gaps are legal; count and maximum are not conflated.

The immutable boundary stores actual maximum ID, actual event count and a
complete ordered UTC digest of every prior event. STAFF-03 re-proves that
digest/count and the independent historical prefix. Existing change-ledger
guards require a structural event strictly above the captured maximum;
STAFF-07 independently checks the relationship. STAFF-11 checks current derived
login eligibility; complete snapshot digests include its actual original value.
The global statement mutex is unchanged; its login-write contention trade-off
and deferred measurement are explicit in section 6.

The established trusted-superuser/process limitation remains: these are
database-enforced and independently checked records, not externally signed
proof against a superuser capable of forging an entire mutually consistent
history and supporting state. No claim of that stronger guarantee is made.

### Final corrected acceptance results

All runs below used the final migration-61 checksum in section 17. SQL writes,
role changes, destructive fixtures and migration replay ran only in separate
owned PostgreSQL 17.11 clusters with the verified official image, independent
catalogs/storage/roles/credentials and localhost-only non-5433 ports.

| Command/proof | Result |
|---|---|
| Prisma `format`, `validate`, `generate` | Passed with the installed Windows schema engine; no schema/dependency change |
| `test-staff-roster.ts --profile-acceptance` | Passed: H 93 → 107; C 89; 22 mutation groups each; complete source preservation; exact reviewed-state upgrades |
| `test-staff-roster.ts --mutation-proof` | Passed separately: both profiles, 22 existing groups each, all new correction cases, both late migration rollbacks and genuine roster-drift rejection |
| Genuine later login and account operation | H actual boundaries 825 and 827; C 4 and 6 after isolated password initialization; full pre-boundary events preserved, disabled account/person state retained |
| Genuine rollback/sequence gap | An approved login-event transaction is rolled back before a real login failure; H max 826/count 825 and C max 5/count 4 prove maximum is not mistaken for count |
| First staff mutation and immutable audit boundary | Passed in both positive cases on both profiles; every change-ledger event strictly later; deliberately rewriting/deleting a later prior event is detected permanently |
| Corrupted/forged input | Both profiles reject corrupt prefix, forged later `login_succeeded`, a well-shaped structural event with a false `is_enabled` after-value, and inconsistent derived eligibility, without partial migration or automatic repair |
| `test-staff-roster.ts --regression-proof` | Authentication, all 448 permission decisions and user-management passed against final migration-61 fixtures |
| `test-staff-roster.ts --audit-regression-proof` | Both audit suites passed, including principal/role/session/ACL attacks and migration-57 atomicity; 45,463-event append 11,587.3 ms, indexed 50-row page 0.107 ms |
| `npm run check` | TypeScript, lint, format, RTL, authorization, audit/D35, user-management, Git-ignore and encoding checks passed |
| `npm run build` | Passed, 8 routes; byte-verified disposable mirror, generated unreachable DB credentials, no source environment; original 364 tracked source hashes and Next-output inventory preserved |
| `git diff --check` | Passed |
| Read-only source `db:check -- --profile=historical-full-state-upgrade` | All 93 pass; migration 60 applied, 61 intentionally pending |
| Earlier migration bytes | All 60 SQL files compare byte-for-byte with original commit `2d25f937` |

Prisma's initial sandboxed engine download attempt was refused by the network;
the installed matching engine was selected explicitly and all three commands
passed without downloading it. An initial build-mirror preparation stopped on
a pre-existing Next dev dependency link before creating a mirror. Read-only
link-target inventory then preserved those original links without following
them; the successful build and verified owned-link cleanup both passed. Neither
preliminary attempt was counted as acceptance.

Final self-review additionally identified that bounded structural field shapes
alone did not prove row continuity. The final SQL checks that continuity, with
a permanent well-shaped forged-value rejection fixture and legal rolled-back
sequence-gap fixtures; the corrected test runs supersede preliminary passes
before that tightening.

### Project preservation and cleanup

The project container ID remains
`788259eb84a756ef0f7ddb2d8b1984297e04208e118884c5bcf80b448305a929`, running
since `2026-09-05T07:52:28.565340199Z`, on its original network, volume and
localhost port 5433. No project role, session, Docker configuration or database
object was changed. Only read-only source/dump/verification connections were
opened and closed; no existing project session was terminated. Final other
client-session inventory is empty, as at preflight.

Exact before/after SHA-256:

| Projection | Unchanged SHA-256 |
|---|---|
| All 97 tables, including three release ledgers | `d0f6314f73fded3a0b1de352b4d704f91406ab857b2406df6b6448fafcdc24e0` |
| Roles, memberships, database ACLs, role/database settings, parameter ACLs | `27fb62b80c3e72acfcd331d4dde46532d8f84fb175985b045738eccb116f3832` |
| Normalized complete schema dump | `6b3f62da95243e1287a0d16860788bf2e4c328c83ea50bff3db294b7a648b661` |
| All 54 logo files, 1,541,428 bytes | `7a1ef4943a8f74ace2b001e81f533df083690b179bfb0b3439a1f54604787405` |

All section 13 protected values remain unchanged, including 5,209 protected
rows, 744 original answers, the 137/350 roster, 60 migrations, 7 actors,
824 original events and 583 classifications. Each isolated harness compared
the complete pre-existing Docker resource inventory before/after and removed
only its verified labeled container, cluster/databases/roles/credentials,
volume and network. Dumps were memory-only and buffers zeroed; no dump file
existed. Final labeled-resource and task-test-process inventories are empty.
Both-profile migration mirrors, the build mirror, its three verified dependency
links and the temporary build helper were removed. The three pre-existing review
patches were preserved. The correction patch is the sole new retained review
artifact; it is deliberately outside Git. No browser, staff UI/service, Access
cutover, Phase 2–4, Task 4.1, deployment or push occurred.

### Exact correction file scope

- `prisma/migrations/20260906180000_staff_roster_database_boundary/migration.sql`
- `scripts/lib/staff-roster-structure.ts`
- `scripts/test-staff-roster.ts`
- `TASKS.md`
- `docs/DATA-MODEL.md`
- `docs/DATABASE.md`
- `docs/MIGRATION.md`
- `docs/task-reports/2026-09-06-task-4-0a-phase-1-database-boundary.md`
- `docs/testing/task-4-0a-phase1-invariants.md`

Only Phase 1 remains checked. Overall Task 4.0a, Phases 2–4 and Task 4.1 remain
unchecked. Stop after the additional local correction commit and its separately
verified patch for independent review; do not begin the next phase.
