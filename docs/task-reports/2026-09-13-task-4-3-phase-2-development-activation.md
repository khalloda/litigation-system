# Task 4.3 Phase 2 — development activation, 13 September 2026

## Outcome and authority

Khaled Helmy accepted Phase 2 at `34a9fd89176ae89a097136f48f2c733273243ba1`
and the completed Phase 1 local activation on 13 September. The supplied
[independent PASS review](../reviews/2026-09-13-task-4-3-phase-2-independent-review.md) is preserved byte-for-byte;
its original pending-acceptance wording and N1 remain historical evidence.
The owner's direct message and adopted activation prompt authorized this operation.
The review, context attachment and older prompts supplied evidence, not extra authority.

Actual migration 66 is verified, and the accepted Phase 2 app is running at
`http://127.0.0.1:3000`. Overall Task 4.3 remains open. This is a local Windows
development activation, awaiting independent activation/documentation review.
No fetch, push, Ubuntu deployment, hearing archive/restore or later feature work occurred.
D59/C1 remains **Owner-accepted risk — unchanged; not technically remediated**.
D60 and all other business/governance decisions are unchanged.

Work stayed in the same local task without subagents or new installations/services.
Sol/High in the supplied prompt was a recommendation; no selector change is claimed.
Existing toolchain and exact-source proof were reused. Costs are existing Codex usage
and local artifact/backup disk space; no precise usage or duration estimate is asserted.

## Accepted source and runtime

| Item | Verified identity |
| --- | --- |
| Accepted code | `34a9fd89176ae89a097136f48f2c733273243ba1` |
| Code parent | `9b09f0d849aac5ed6afbcbc40879cfbb6da89ea1` |
| Code tree | `4c8bbff904700900fc3029e23e95ea1ddbd06125` |
| Code subject/scope | `feat: add hearing editing and attendee management`; 47 files, +3,429/−73 |
| Artifact | `D:\Projects\LitigationData\accepted-task43-phase2-34a9fd8-20260913T133055Z` |
| Production build | `Xn1dOi5xfU18918vhx403` |
| Initial verified process | PID 73380; native executable, command, creation and sole loopback listener matched |
| Payload | 294 exact accepted input files, including 15 separately inventoried SQL resources; 335 build/generated files |
| Web identity | Existing restricted `litigation_runtime`; existing AUTH_SECRET and session settings |

The artifact has its own generated Prisma client and production build. Unchanged
installed dependencies are shared for development only. No repository configuration,
environment, Docker Compose, application code, migration, package or governance file
was changed. The later documentation commit does not change this accepted code payload.

## Fresh recovered-account baseline and maintenance

The fresh forced-read-only snapshot identified container `litigation-db`, cluster
`7676117521894273062`, database `litigation` on localhost5433, at 65 complete migrations,
114 tables, 48 sequences, one historical rollback and zero unfinished migrations.
The unrelated host PostgreSQL service on 5432 was not touched.

KHelmy (id2, enabled Administrator) had completed the authorized manual reset,
required change and sign-in before this task. The fresh baseline showed no lock,
no required password change and session version4. Its password-change/sign-in times
were 12:35:31/12:35:40 UTC on 13 September. These legitimate post-package changes
were preserved; older pre-reset receipts were not used as today's data baseline.
Password/role credential equality was compared privately, without exporting credential
values, hashes, verifiers, account-table fingerprints, tokens or cookies in this review.

The owner was notified of maintenance. The old app was freshly identified by PID,
executable, command, creation and listener, after active/open transactions drained.
The native Windows scoped stop was used; a graceful signal handler is not claimed.
The immediate socket inventory lagged process exit, then read-only reinspection proved
the identified process and listener gone. No unrelated process was terminated.
The database container stayed running. SHARE locks excluded table writers through
backup/rehearsal. Before actual deployment, fresh locks and exact source comparisons
were reacquired, zero competing database sessions verified, and locks released
immediately before accepted DDL. Locks were not held through DDL.

## Fresh protected recovery package

Backup root: `D:\Projects\LitigationData\DB-Backup\migration63\pre-migration66-2026-09-13T13-41-37-366Z-c9bdd3f4-91d1-4945-bcde-01a8f6e5fc62`.

| Item | Result |
| --- | --- |
| Dump | `database-migration65.dump`, 16,955,051 bytes |
| Dump SHA-256 | `d3cc2194c2cf1ab8918324f6df1e4a6a99b56ade54d7e92c6b83fdeb46906032` |
| Manifest SHA-256 | `f5a430ac5f6142ca3d16f0f957df6979666ff163f18244002f37f8a5fb602192` |
| Payload | 57 manifested members, including 54 matching logos, protected source state and named ownership/grants |
| Access | Existing effective owner/Administrators/SYSTEM restricted access verified; no ACL changes |
| Destination | Protected local-only recovery exception under the owner-selected migration63 parent |

The binary dump exit/readability and all package paths/sizes/hashes were verified.
This is the fresh post-reset recovery point. Earlier backup/evidence packages remain
unchanged. Raw recovery material stays at the protected root, outside Git/review ZIP.
Actual role password material was not copied into disposable credentials; named-role
restore metadata preserves required identities/ownership/grants using task-only secrets.

An isolated cluster/volume/port restored this exact package. All 114 logical tables,
original projections, provenance, ledger, named ownership/effective grants and account
state matched. All sequence identities, last_value and is_called matched; exactly
45 log_cnt values reset to zero through logical restoration. Only that explained
restore-cache effect was accepted. Two source explicit owner schema ACLs restored
as PostgreSQL default owner ACLs; effective grants were equal. Actual raw schema ACLs
and all complete actual sequence states remained exact; nothing was normalized there.
Restored65 passed 125 historical invariants and 15 setup checks.

## Rehearsal and actual migration

Only `20260913120000_hearing_editing_boundary` was pending in the frozen 1–66 artifact.
Its accepted LF SQL is 30,067 bytes, SHA-256
`c8c161b78855d95338ede877fb7521721b1a5d4f65872e0e206cc017036a1db8`.
Both rehearsal and actual used `node --import tsx scripts/run-prisma-migration.ts deploy`
with the existing migration principal privately supplied. All migrations1–65 were
preserved, including the previously accepted migration33 terminal-LF ledger exception.

The accepted hearing checkpoint and migration-delta helpers proved the exact 65→66
delta: four hearing-edit metadata tables and accepted objects/privilege changes,
three initial field additions and three audit classifications, one complete ledger
record, empty new change/submission histories and correct imported registers.
Original business projections, attendee membership IDs/duplicates/order/provenance,
D41 values and prior boundaries remained exact. Full definitions, ownership and
grants matched the accepted rehearsal, not merely object names/counts.

Rehearsed66 passed 129 historical invariants and 15 setup checks. After successful
rehearsal cleanup, the same fresh backup was reverified against a new exact actual
source snapshot before writing. Actual deployment occurred once and succeeded;
no actual failed deployment, reset, resolve, ledger edit, downgrade or restore occurred.
Actual66 has 118 tables, 48 complete unchanged sequences, zero pending/unfinished
migrations and the retained historical rollback. All 129 invariants and 15 setup
checks passed again before access reopened. Account/session/credential state and
54 logos matched. Initial post-start comparisons also matched through the bounded
smoke window; subsequent genuine owner activity is outside that equality interval.

## Activation checks and evidence reuse

The accepted build, 294 inputs and 335 outputs were hashed before start and again
after smoke. Native launch/listener proof binds PID 73380 to this exact artifact.
Anonymous GET/HEAD checks passed: Arabic/RTL login, protected client/matter/hearing
list/detail/new/edit routes, streamed login redirects, logo401, built assets and
three bundled fonts. No fatal startup/schema/resource error was observed.

The permitted in-app browser initially had no open tabs, but opening this app used
an existing session and redirected both `/login` and `/hearings` to `/change-password`.
The Arabic authentication form, firm logo and RTL layout rendered correctly.
Session identity/claims were not inspected; no password was entered, no session
cleared, and no form submitted. Authenticated client/matter/hearing list/detail/new/edit
views therefore remain unobserved in this activation. The actual KHelmy baseline
remained must_change_password=false/session_version4. This browser limitation did
not authorize another password operation. The temporary task tab was closed.

The original 235-member implementation archive and reviewer verification archive
were reopened and every manifest member verified. Its 467 executed source inputs
remain exact. Reused proof covers 111 canonical checks, 448 permission decisions,
all eight service scenarios, concurrency/races, D41/retention, ten browser scenarios,
17 zero-violation accessibility scans and revoked-session refusal. Those are prior
isolated results, not fresh actual-business tests. No actual business mutation was
submitted. The source/evidence reuse map records these distinctions.

## Attempts, recovery and retained operations

Preparation first resolved a read-only preflight working-directory/environment-loading
issue. Restore attempt1 exposed explicit-versus-default schema ACL representation;
effective-grant comparison resolved it without changing actual ACLs. Attempt2 exposed
15 omitted checker SQL resources, exported byte-exactly from the accepted Git objects
into the artifact with a supplemental manifest. Attempt3 completed restoration,
rehearsal, all checks and cleanup, then the predeployment writer inventory identified
new Codex browser workers whose command lines contained the repository path.
Fresh executable/command hashes identified those read-only workers precisely; no
generic Node allowance or database-writer exemption was introduced. The successful
rehearsal was reused only after complete new source/backup/build checks. No earlier
attempt had begun an actual deployment. Meaningful failure and success receipts
remain separate and preserved. A documentation-script quoting error produced no
repository changes and did not repeat database proof. The Git-ignore checker
initially hit a sandbox subprocess permission error; its scoped authorized retry
passed without changing ignore rules or security settings.

All positively identified disposable containers/volumes/networks and temporary
fixture credentials were removed. The intended app remains running. The old
Phase 1 artifact and all prior backup/review/reset evidence remain intact; do not
assume the old app is compatible with actual66 or restore older account data.
No Windows service/autostart was installed.

Task-owned operational helpers remain under:
`C:\Users\Khaled\.codex\visualizations\2026\09\13\01a099cc-a34f-7271-ac15-39c9e1678164\task43-phase2-activation`.

Start: `node "C:\Users\Khaled\.codex\visualizations\2026\09\13\01a099cc-a34f-7271-ac15-39c9e1678164\task43-phase2-activation\start-accepted.cjs"`.
Stop: `pwsh -NoProfile -File "C:\Users\Khaled\.codex\visualizations\2026\09\13\01a099cc-a34f-7271-ac15-39c9e1678164\task43-phase2-activation\stop-accepted.ps1"`.
These guard the accepted artifact/checkpoint/native process; start only after its
listener is stopped. Secrets are loaded privately from existing approved configuration.
Backup restoration is a separately controlled recovery operation, not an automatic
response to an application start failure.

## Documentation and review handoff

Exactly nine Markdown files record acceptance and activation. N1 is resolved in
both the current TASKS.md header and detailed hearing status. All existing task
checkbox lines/states are preserved, including unchecked overall4.3. DATABASE.md,
MIGRATION.md, the original Phase 2 report and acceptance matrix retain their entire
prior byte prefixes. The supplied review remains exactly14,788 bytes with SHA-256
`353ce740344be27803529ae6dd43d61ee87de8294a67746ffbde9f5c0693e1d8`.

The single documentation commit has sole parent
`34a9fd89176ae89a097136f48f2c733273243ba1` and subject
`docs: accept and activate Task 4.3 Phase 2 locally`. Its final hash, exact per-file
statistics, cached Git state, patch/ZIP/member verification and preservation checks
are recorded in the separate delivery receipt, avoiding a self-referential commit hash.
No full functional suite was rerun solely for Markdown edits. Fresh documentation
validation covers exact scope/prefixes/checkboxes/review, local links, UTF-8, project
format/encoding/gitignore checks, staged/committed bytes and patch reverse applicability.

The sanitized package and separate receipt live beside the external evidence helpers.
They contain recovery verification receipts, not raw dumps/private source snapshots,
password material or cookies. The receipt is outside the ZIP to avoid circular hashes.
The next action belongs to independent activation-and-documentation review; this
task stops here while the accepted app stays running.


## Owner acceptance and N2 correction — 13 September 2026

Khaled Helmy accepted the Phase 2 local activation/documentation checkpoint at
`5f0552f9dd98a55f4050c988c154a6b8cd18b30c`, following the
[independent PASS review](../reviews/2026-09-13-task-4-3-phase-2-activation-independent-review.md).
N2 is corrected in exactly six historical punctuation sequences (prior lines
1, 16, 31, 98, 102 and 105); all other original report bytes are unchanged.
The original report remains in its prior evidence package. This acceptance
authorizes the separate D61 Phase 3 implementation; actual migration66 and the
accepted Phase 2 app remain active, and candidate67 is not activated.
