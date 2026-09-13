# Task 4.3 Phase 3 — recoverable hearing archive and restore

13 September 2026. Implemented; awaiting independent review and owner acceptance.
Actual development remains at migration66 with the accepted Phase2 app running.
Candidate migration67 has been applied only to positively identified disposable copies.

## Authority and acceptance

The owner accepted Phase2 local activation/documentation at
`5f0552f9dd98a55f4050c988c154a6b8cd18b30c` and adopted the nine-clause
HEARING LIFECYCLE CONTRACT. [D61](../DECISIONS.md#d61--hearing-archive-and-restore-lifecycle)
records that mandate; D59/D60 and the preceding decision prefix are unchanged.
The [activation independent review](../reviews/2026-09-13-task-4-3-phase-2-activation-independent-review.md)
is copied byte-for-byte (14,142 bytes; SHA-256
`6f21e5266c6dfacd02a22df37a1c8a2ea1992c77f1944911b20c03824236afb2`).

N2 is corrected only in the old activation report: six localized punctuation
substitutions at its former lines1,16,31,98,102,105 (two em dashes, a minus sign,
two en-dash ranges and a right arrow), followed by an acceptance addendum.
The original report remains in the old review package. Reversing those six
substitutions recovers its original prefix. The Phase2 matrix acceptance is appended.
All86 existing TASKS checkbox lines and states are preserved; overall4.3 remains unchecked.

Starting main was clean at5f0552f, sole parent34a9fd8, tree
`a6fbffadd7dd982736874ba875cd8cf28479c2df`; cached origin/main remained93fd304,
three ahead/zero behind. The implementation is delivered as one local child commit
with subject `feat: add recoverable hearing archive and restore`. Its exact identity,
statistics and artifact hashes are in the separate delivery receipt. No fetch occurred.

## Delivered behavior

An Administrator can archive a hearing after reviewing its identity, date/matter
context and current/retired attendance counts, then restore it later. Archiving
removes it from ordinary operational lists. It does not cancel, complete or
reschedule the hearing and does not introduce a legal outcome.

The list defaults to current hearings and offers archived/all filters independently
of search, date field/range, matter/client/court/attendee and paging. Validated return
context survives detail/edit/lifecycle navigation. Archived detail remains readable
to all four roles and distinguishes hearing archive from parent matter archive.
It shows retained attendance separately. Linked matter hearing counts remain
historical totals and link to `archive=all`.

Administrator and Litigation Assistant can edit only an unarchived hearing under
an unarchived matter. Administrator alone can archive/restore. A parent matter must
be restored before a new hearing edit/archive/restore, including by Administrator.
Unassigned hearings have no parent prerequisite; an archived client does not block
an otherwise eligible hearing. Parent and hearing transitions never cascade.

Dates, outcomes, raw/source values, matter bindings, attendee IDs, imported ordinals,
current order, retirement, inactive people and duplicate memberships are retained.
Restore never reactivates attendance or people. The twelve D41 hearing protections
remain exact. Confirmation text explains that historical counts and reports are
unaffected. Future Task6 reports must use the historical query boundary rather than
inherit the operational list default; no new report/calendar/export screen is built.

## Database and concurrency boundary

Migration `20260913160000_hearing_archive_restore` adds an unarchived default to
every hearing, an operational index, a private immutable pre67 history boundary,
five lifecycle routines and two row triggers. Four existing hearing routines are
replaced to understand the archive field and reject archived edits. Runtime access
remains through narrow authenticated gateways; function ownership, fixed search
paths, PUBLIC/runtime privileges and exact definitions are continuously checked.
Migrations1–66 are unchanged, including accepted66's30,067 LF bytes and checksum
`c8c161b78855d95338ede877fb7521721b1a5d4f65872e0e206cc017036a1db8`.

Old import/change snapshots and row versions are never rewritten. Only snapshots
at the frozen pre67 version boundary receive their original implicit `false`
meaning during verification; new snapshots require an explicit boolean archive
field. The existing historical reconciliation and D39/D40/D41 proofs remain active.

The committing gateway checks current account, session, Administrator role, trusted
audit actor, version, parent and exact confirmation facts. Locks follow the existing
staff/account, submission, parent, hearing and attendance order. A changed transition
advances the aggregate once and atomically records the changed row, semantic
archive/restore event, history and receipt. The accepted65 common audit allocator
is reused; no sequence rewinding is introduced.

A current-version same-state request changes nothing, including audit/history,
receipt and sequence state. An exact owned retry is authenticated afresh and may
acknowledge its old result after a later opposite transition; it cannot replay the
write. The UI reloads current detail after success. Changed payload/action, another
actor's token and stale confirmation are refused. Archived attendee/direct write
paths are guarded, and physical deletion remains prohibited.

## Fresh verification and source binding

The timestamped initial matrix and expected migration delta were saved outside Git
before database/test execution. The external `task43-phase3` evidence directory
contains original run receipts and source inventories. The delivered matrix maps
individual successful controls rather than treating a partially failed run as PASS.

| Evidence | Observed result |
| --- | --- |
| Historical coherent restore66→67 | All118 prior table projections exact, including privately compared accounts;13,382 hearings,48 sequence value/called states. Dump streamed into the task cluster; no dump file created. |
| Migration/late-failure rollback | Declared catalog/grant delta only; no removed objects, no old projection/version/history rewrite; all complete fixture sequence states unchanged. Late transaction failure restores rows/catalog/sequences exactly. |
| Historical invariants | All131 passed before and after the final browser run and the explicit retention run: the129 prior checks plus2 lifecycle checks. |
| Canonical replay | All113 canonical checks and15 setup checks passed in `canonical3`; migrations1–66 replayed before67. Only non-KHelmy fixture accounts prepared for readiness. |
| Broad lifecycle proof | Native/unassigned archive/read-only/restore; no-op/exact retry/opposite transition; forged identity/fields/version/counts; all-role denials; audit/history/receipt faults; competing submissions/edit race; Phase2 selection no-op;12 D41 rows; parent/client behavior; all-role reads/filter round-trip; four structural tamper negatives. |
| Adversarial supplement | Positive-control non-KHelmy Administrator followed by disabled/forced/role/revoked refusal; other actor receipt; archived direct row writes; missing receipt/current-history/import tamper; observed parent lock overlap against edit/archive/restore; old Phase2 edit retry after archive. |
| Explicit retention supplement | Imported hearing3 inactive-person references; hearing92 duplicate memberships; hearing8932 NULL matter and missing court/action context. Hearing92 then combines retained imported attendance, a retired imported row73 and a new current-order membership. Exact retained fields, unrelated table contents and Phase2 selection no-op pass. |
| Reporting boundary | Six existing Gate4 datasets compared before/during/after hearing and parent transitions, with nonempty source results; all-record hearing count remains constant while ordinary current count drops by one. Archived-client independence exercised. |
| Production browser | `browser4`: own generated Prisma client/build, four roles, confirmation/cancel/Escape/focus, archived/all filters, actual archived detail/edit refusal, stale and failed action recovery, return context,320px and genuine200% zoom. Six accessibility scans report no violations. |
| Static gates | TypeScript, lint, formatting, RTL/self-test, authorization, audit/self-test, user-management/self-test, staff/client/hearing boundaries, Git exclusions, encoding and448 permission matrix/source checks. Final command/source receipts accompany delivery. |

The broad successful controls in `full3-browser` precede its later supplementary
fixture failure. They are retained as observed evidence. `supplement2-browser`
finishes the strengthened database controls before its browser cookie setup fails.
`browser4` completes the corrected browser run and final131 checks. `retention1`
binds the final explicit category tests to their executed source and finishes131.

Executed source manifests are preserved for each proof family. Final product and
migration bytes match the successful browser4 build. Subsequent changes are the
explicit retention test branch and accurate test description, exercised in retention1,
plus review documentation. Earlier broad service/SQL proof uses the same final
service/migration bytes; later changes concern test actor/runtime ownership,
static inventories, browser waiting/cookie setup and a corrected progress string.
The source reuse map identifies exact differences and retains their historical test
postimages. Added tests are not claimed as executed by an earlier loaded runner.

Unchanged authentication/login, unrelated client/staff/matter functional suites and
historical review proof are reused from accepted34a9fd8/5f0552f through unchanged
source identities. Mandatory current static gates and affected lifecycle checks are
fresh. The permission runner's explicit `--static-only` mode omits its historical
KHelmy-mutating database fixture; new authorization controls use other copied accounts.

## Attempts and practical limits

Meaningful unsuccessful attempts are retained: a legacy mixed-case table identifier
rejection; escaped dollar-quote fault-injection syntax; migration dispatch initially
ending at66; historical wrapper querying the new shape; canonical profile/readiness
setup; copied non-owner account readiness; a self-disable fixture guard; external
dotenv resolution; invalid browser cookie fields; and browser waits that captured
loading/route-announcer content. Each was corrected within the authorized fixture or
harness scope. No failed attempt is relabelled successful and no guard override was used.

The final read-only actual checker initially counted a retained rolled-back historical
ledger entry as an applied migration. Its corrected predicate confirms66 completed,
zero unfinished and the unchanged full ledger. This was a checker assertion, not an
actual migration. An earlier dotenv failure stopped before a connection.

There are zero missing-person attendee references in the fresh full-volume copy.
The positive missing-reference control is the real NULL matter/court/action context;
no nonexistent attendee case is claimed. No invalid historical data was fabricated
by weakening the retained source constraints. Inactive/duplicate/retired/mixed-order
attendance controls are positively selected and asserted, not inferred from the old
OR-selected sample. No future Task6 report UI is claimed tested. All speech setup,
observation and follow-up are excluded. Automated accessibility scans and inspected
screenshots do not substitute for an unperformed screen-reader/speech assessment.

Browser sessions are signed with a disposable fixture secret against copied accounts.
They do not test the owner's actual password or submit an actual owner business write.
KHelmy is never the target of password/account mutation tests, even in copies.

## Actual preservation and cleanup

Actual `localhost:5433/litigation`, container `litigation-db`, cluster
`7676117521894273062` stays at66. Task connections are forced read-only. Fresh before/
after captures show zero changed tables, exact catalog/complete sequence state,
ledger, roles and54 logo files. Private comparisons confirm unchanged password hashes,
session versions and database role credentials without exporting values or fingerprints.
KHelmy remains enabled/unlocked, `must_change_password=false`, session_version4.
The frozen accepted66 hearing checker also passes independently against that target.

Accepted source34a9fd8, artifact
`D:\Projects\LitigationData\accepted-task43-phase2-34a9fd8-20260913T133055Z`,
build`Xn1dOi5xfU18918vhx403`, PID73380 and127.0.0.1:3000 remain unchanged;
fresh login-page HTTP200 is observed. No app restart or replacement occurred.
All1,162 recorded protected files match content/size/mtime, including294 accepted
source inputs,335 accepted build outputs, relevant configuration/manifests and prior
evidence. The browser mirror checks35,005 shared dependency file metadata entries.
The recorded289 prior backup files match size/mtime; earlier accepted dump/manifest
hashes are reused. This is not a new full dependency hash or ACL inventory.

Task containers/clusters/databases/roles/credentials, labelled volumes/networks,
browser mirrors and their listeners are removed through exact ownership checks.
Pre-existing Docker resources remain unchanged; the successful browser cleanup also
confirms a reusable task port and unchanged shared dependencies. No raw dump, real
environment, credential value/fingerprint, cookie or token belongs in the review ZIP.
D59 remains accepted unchanged risk; D60 remains in force. Existing backup/evidence,
logo and configuration destinations are preserved.

See the [Phase3 acceptance matrix](../testing/task-4-3-phase3-acceptance-matrix.md).
The patch, verified manifest-covered ZIP and separate receipt accompany this report.
Candidate67 is unactivated. No fetch, push, Ubuntu deployment or Task4.4 occurred.
Stop for independent Phase3 review; overall acceptance, publication and any later
activation require separate owner decisions.
