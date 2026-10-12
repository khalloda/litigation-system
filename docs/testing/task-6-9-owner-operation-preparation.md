# Task 6.9 — bounded owner-operation preparation

This child of independently reviewed `47835ca` adds an explicit local operation
entry point. It does not accept Task 6.9 or authorize owner writes. The accepted
owner app remains on migration 78 and its retained production artifact.

## Original behavior and scoped changes

1. The original fixture-only constructor and cluster checks remain the default.
   A separately sealed owner/rehearsal contract requires a connection-scoped
   capability. An app request or environment flag cannot create that capability.
2. Initial owner preflight uses a forced READ ONLY snapshot. It checks all 3,465
   original sources, 13,283 guard occurrences, exact lookup cardinalities,
   complete memberships and dynamically enumerated inbound normalization keys.
   It registers nothing, allocates no IDs and changes no account or session.
3. Execution requires a separate, hash-bound mandate, exact server/cluster/DB,
   source/schema/approved contract and preserved recovery. A PROPOSED operation
   is not an execution mandate. Rehearsal always rejects the actual owner target.
4. The entry point reuses the reviewed executors, two-phase ordering, journal,
   audit, retry and compensation rules. Immediately before registration it locks
   the complete relevant catalog and compares a fresh full-state witness.
   Locks are acquired before the first SELECT establishes the SERIALIZABLE
   snapshot. The preflight table list supplies that first lock statement; only
   then are identity, catalog and complete state read. This prevents a concurrent
   pre-lock writer being hidden by an earlier snapshot.
   Preparation and first apply also require equality with the sealed snapshot,
   including unrelated business rows, account/audit changes and sequences. The
   mandate, source and genuine session are rechecked after deferred constraints
   and before COMMIT. A missing COMMIT response is UNKNOWN, never a claim that
   rollback succeeded and never an instruction to compensate automatically.
5. Migrations 1–94 are frozen. No schema addition is needed. Owner78 preparation
   is deliberately non-executable: a separately authorized future migration must
   be followed by pristine94 preflight and final operation sealing. This captures
   the additive canonical relationship baseline honestly for later compensation.

The authority file is a hash-bound operator record of a distinct human mandate,
not a cryptographic signature by the owner. It cannot be obtained from an app
request; protected local files and the migration principal remain necessary.
The caller must preserve the genuine authorization text and must not manufacture
an owner mandate from this preparation instruction.

## Commands and future operation order

All commands run in the reviewed, clean preparation candidate, never the owner
checkout. The command takes only an action and an explicit absolute request JSON;
connection files and tokens are protected local inputs. The final review delivery
provides exact request, proposed-manifest and child identities. No environment
variable enables owner mode.

```powershell
node node_modules/tsx/dist/cli.mjs scripts/task69-owner-operation.ts preflight <absolute-request-json>
node node_modules/tsx/dist/cli.mjs scripts/task69-owner-operation.ts prepare <absolute-request-json>
node node_modules/tsx/dist/cli.mjs scripts/task69-owner-operation.ts inspect <absolute-request-json>
node node_modules/tsx/dist/cli.mjs scripts/task69-owner-operation.ts parents <absolute-request-json>
node node_modules/tsx/dist/cli.mjs scripts/task69-owner-operation.ts remaining <absolute-request-json>
node node_modules/tsx/dist/cli.mjs scripts/task69-owner-operation.ts compensate <absolute-request-json>
```

These are command forms, not authorization. Only the later explicitly adopted
owner-execution mandate may unlock parents, remaining or compensation on owner.
Before that run, bind exact final command paths, commit, operation UUID and all
hashes in the sealed operation/mandate pair; do not reuse a rehearsal mandate.

1. Verify independent preparation review and the exact local chain. Recheck the
   owner checkout, accepted app artifact/build, port/PID, DB cluster and migration
   ledger including the historical rollback and migration33 newline exception.
   Preserve every later legitimate change. A changed original guard is a conflict,
   not permission to rewrite the authority or restore an old snapshot over it.
2. Coordinate a maintenance pause. Capture a genuine Administrator or Litigation
   Assistant sign-in through normal authentication, if needed. Keep credentials
   and the encrypted session local. Identify normal account/audit bookkeeping
   separately. Require at least three hours of remaining genuine session validity
   before every phase; normal eight-hour policy is unchanged. Reauthenticate
   normally if needed and record the new session; never extend or fabricate it.
3. Capture fresh complete read-only state and source/reference preflight. Verify
   the complete protected recovery (DB, logos, configuration/runtime identity and
   ACLs). If state differs from retained recovery, make and verify a fresh backup.
   Ensure no writers remain and identify the exact owner app process before
   stopping it. Preserve the artifact and source. A backup on this laptop is not
   an off-machine disaster-recovery claim.
4. Under the separate later migration mandate, apply only frozen79–94 in order,
   preserving1–78 and the rollback row. No provisioning, synchronization or saved
   selection seeding is included. Check exact checksums, fresh schema/invariants
   and additive delta. Uncertain migration outcome means inspect the ledger first.
5. Run pristine94 read-only preflight and seal the actual execution operation and
   its baseline with the newly verified recovery identity. Bind the distinct
   future mandate to this exact operation, source, target and permitted actions.
   A migration78 proposal cannot pass the execution gate. Do not edit a sealed
   artifact in place; retain superseded proposals and explain any changed state.
6. Execute parents/dependencies (1,598 receipts), then remaining stages (1,987),
   with log/progress/result paths retained across app interruptions/compactions.
   Do not run competing writers. Exact original guards and receipt transitions
   remain in force. On disconnect, inspect the operation and exact receipt sets;
   then retry the same action/operation only if its complete contract and current
   postimages pass. Partial or conflicting receipt sets require investigation.
7. Capture all3,585 physical effects and rerun the independent source oracle for
   every3,465 decision and120 dependencies. Reconcile originals3960=3465+411+84,
   retained evidence, audits, all selection scopes and hearing11003's archive.
   Run database gates and actual Arabic consumer/report smoke. Reuse unchanged
   rendering evidence only with exact application/schema/effect identity proof.
   Ordinary owner previews/exports require the later operation's explicit scope
   and exact authentication/report bookkeeping; no fake or replayed owner login.
8. Activate only the independently reviewed candidate artifact under that later
   mandate. Verify source/build/process/listener and actual HTTP/login health,
   then the authorized owner checks. A200 login page is not authenticated proof.
   Release normal use only after reconciliation and health pass. Capture actual
   observation intervals; owner use afterwards is legitimate, not a frozen DB.

## Failure, compensation and maintenance planning

Keep commands alive independently of the chat where appropriate, with hidden
Windows helpers, durable logs and precise resource identities. Progress reports
identify every50 stage entries and the deferred-constraint/commit boundary.
If that boundary is slow, inspect the exact task connection read-only; do not
assume a client timeout proves rollback. A process interruption is not permission
to run a new operation UUID or discard a still-running transaction.

### T69-OP-R1: recognized committed boundaries

The correction derives exact issue/dependency identity sets from the sealed
allowlist and stage contract. A count alone cannot authorize recovery. Inspect
with the same sealed operation UUID and a new output filename for each attempt:

| Observed receipts | Permitted next step under a separate valid execution mandate |
| --- | --- |
| No apply or inverse receipts | No compensation. If no executor is in flight, diagnose a failed attempt and retry parents with the same UUID. |
| Exact complete parent/dependency set (1,598 apply; no inverse) | Continue remaining only if wanted and all original guards pass; otherwise compensate the entire committed parent set. |
| Exact complete full set (3,585 apply; no inverse) | Reconcile the full operation or compensate the entire set. |
| Exact matching inverse set for either complete boundary | Retry compensation with the same UUID to verify existing receipt identities and current postimages. Apply refuses. |
| Arbitrary subset, duplicate, foreign identity, unknown phase or partial/mixed inverse | Refuse. Preserve evidence and investigate; do not fill the gap merely to qualify for compensation. |
| Any relevant executor still in flight, or unresolved COMMIT response | Observe server activity and receipts read-only first. No automatic compensation and no new UUID. |

Use `inspect` before deciding after uncertainty. Its activity and receipt result
is a dated observation, not a continuing writer freeze. The existing five-second
lock timeout, lock-before-first-SELECT order and complete fresh-state comparison
remain additional execution gates. An uncommitted phase is not a malformed
partial committed phase; keep observing it without starting competing writes.

For an exact parent boundary, `remaining` is safe continuation only under the
existing authority, source, actor, references and current-state checks.
`compensate` uses the same request structure for either complete boundary and
creates an inverse for every committed identity together. A second `compensate`
uses a fresh output filename and the same UUID, source and contract; it must add
no effects. Never reuse the previous output file or edit a sealed contract.

A genuine session must still have at least three hours remaining at phase start
and remain valid at commit. If renewal is needed, sign in normally within the
existing eight-hour policy, retain/account for those auth events and update only
the protected session input. Do not alter the sealed UUID, sources or decisions,
and do not extend a token lifetime. Reconcile any unrelated state change before
resuming. Parent-only compensation timings belong to its actual correction-run
evidence; the earlier full-operation measurement is not a substitute.

Compensation uses complete audited postimage guards. Later native edits cause
refusal, preserving that work. It retains truthful receipts, audit, metadata,
sequences and archived/retired source objects; it is not a byte rewind and does
not remove migrations79–94. The original accepted app's mutation behavior on94
is not certified by this preparation. Do not switch that old binary back onto94
as an assumed rollback. Use a reviewed compatible candidate or remain in
maintenance while resolving the explicit recovery decision.

Restoring a full pre-operation DB is a different operation. Never restore it over
newer user work. It would require a still-quiescent verified boundary and separate
explicit recovery authority, preserved current evidence and a tested plan. Do not
confuse source-row retirement with schema downgrade or whole-database recovery.

Previous measured isolated timings were25.15min parents,52.79min remaining,
82.31min committed compensation and13.00min compensation retry. A provisional
successful maintenance allowance is2–3hours, with4–5hours reserved if full
compensation/reverification is needed, assuming comparable load and no material
drift. These are planning ranges, not an approved maintenance window or promise.
Fresh new-entry measurements in the external report supersede only estimates.
Do expensive build/static checks before the future maintenance window.

## Publication proposal and stop

Later publication would be a normal non-force push to the repository's existing
`khalloda/litigation-system` origin/main, after explicit commit-specific approval,
fresh remote/main identity checks and all operational gates. The exact reviewed
child and any later acceptance-documentation child must be named then. No main
movement, fetch solely for cached inspection, push or acceptance occurs here.

Task6.9 remains HOLD for independent owner-operation review. S1/S2 saved choices
remain deferred; Stage7 is unstarted. N1 remains accepted/unresolved/NOT FIXED;
PDF copying is accepted/unfixed and search is not certified. No diagnosis reopened.

## Completed preparation evidence

Executable source `a62ff92cfe33a3e127a9fd54502e2b03963de3c4` completed the
new-entry full-volume rehearsal on a fresh, separately identified cluster restored
from the refreshed owner backup. The final documentation child changes no runtime
source. External evidence retains exact commands, source hashes and observation times.

- Apply: 1,598 parent/dependency entries and 1,987 remaining entries, producing
  3,585 exact apply receipts. An injected missing COMMIT response was reported as
  unknown; read-only inspection and the same-operation retry proved the commit
  without adding state or sequence effects.
- The independent source oracle passed all 3,465 approved decisions and 120
  dependencies, preserving the 3,960 = 3,465 + 411 + 84 partition and the 97 subset.
- Guarded compensation produced 3,585 linked inverse receipts. Its retry had
  zero full-state/sequence effects; all 19,553 original business rows and protected
  source/selection digests were preserved. Compensation retains source objects as
  archived/retired/inactive and does not rewind metadata or sequences.
- Real native-edit probes refused compensation before and after compensation.
  Their transactional changes rolled back, and both probes left the complete
  state unchanged. Sequence states are separately compared in the evidence.
- Focused authority checks (27), real database boundary checks (15), and the
  two-connection lock-before-snapshot regression (4) passed. Full static checks,
  production build, schema validation and the required database gates passed.
- Application, UI/font and schema bytes remain identical to the accepted
  implementation. Seven dated consumer/browser/fee/catalog proofs are reused only
  with exact dependency and fresh physical-reconciliation evidence. No new owner
  authentication/export or PDF copying/search claim is made.

Measured phase times were 23.755 minutes for parents, 70.278 for
remaining, 81.998 for compensation and 14.266 for its retry. The external
runbook adds explicit recovery, migration, reconciliation, owner smoke and activation
allowances; these measurements are not promises of an owner maintenance duration.

Earlier partial fixtures and failed attempts are preserved. A demonstrated
SERIALIZABLE snapshot-before-lock race caused a controlled rollback of the obsolete
remaining-phase attempt; only its allocated task-action sequence advanced. The
corrected source locks before any SELECT, and the fresh run above uses that source.
No old partial operation was resumed under changed executable code.

The owner remained on migration 78 and the accepted source `20ae566` artifact,
with build `nX8tceCzk9kmMQNThtYZA` running on loopback port 3000. Read-only final
preservation and HTTP/login-page health checks passed. The owner's legitimate
11:07 Cairo desktop sign-in was preserved and exactly accounted in two audit events,
account timestamps and counters; a refreshed backup includes it. Observation times
are recorded; this does not claim a continuously frozen owner database.

Recovery includes a full protected dump, configuration/runtime identity and all
54 logos, verified through isolated restoration. Four PostgreSQL constraint
deparsing differences have explicit equivalence proofs. No runner preflight was
normalized or weakened. Recovery stays on this laptop; no off-machine claim is made.

Review limitations remain explicit: the supplied handoff had an internal manifest
but no external companion manifest; 22 unchanged CSS/icon/PowerShell/TOML files
were proved separately because historical command witnesses captured executable
source suffixes only. Every historical witness is retained unchanged. The receipt-
inclusive verifier checks recorded artifacts; it does not execute PostgreSQL or
browser tests and grants no owner authority.

Compensation emits no per-entry counter. Exact-target read-only activity witnesses
record its active, unblocked deferred-constraint phase without exposing query text
or claiming commit/percentage progress. The transaction remains intact until its
recorded result; all constraints and genuine-session checks remain enabled.

Owner migration, repair, restoration, candidate activation, main movement,
acceptance closure and publication remain NOT_APPLIED. Task 6.9 is HOLD for
independent owner-operation review; S1/S2 selections remain deferred and Stage 7
remains unstarted.
