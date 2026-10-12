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
