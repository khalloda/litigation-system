# Task 4.2 Phase 3 — matter archive and restore

Implementation began 12 September 2026; verification/delivery continued on
13 September (Africa/Cairo). Sole parent: `6771218164c992781902374efb62f0b2f54b2a20`.
Khaled directly accepted Phase 2 on 12 September and approved D58. The adopted
attachment provides the lifecycle contract; its model advice and historical
context are not unrelated execution authority. No subagents were used.

## Result

Administrator can confirm matter archive/restore with identity and current
related counts. The ordinary list defaults to unarchived, with archived/all
filters. All roles retain complete archived read-only access. Restoration
precedes aggregate editing; Litigation Assistant retains unarchived editing
even under an archived client. Neither transition changes status, dates,
business fields, associations, related records, money or client state. Reports
retain their existing contents/criteria/totals. Counts distinguish current
associations from retained retired history.

Migration 65 adds the default-false matter flag and its index, four row triggers,
six lifecycle routines, one audit classification and four explicit replacements
of existing functions. It reuses row version, submission receipts, trusted
audit and complete history. Historical JSON is normalized only when read,
never rewritten. All migrations 1–64 remain unchanged. Locking, version/count
checks and current account/session validation govern committing races.
No-ops create no history; exact retries return the original outcome.
A private singleton counter (three columns, a second index and three constraints) allocates audit
IDs transactionally through the common audit writer. Existing audit IDs and
the old sequence are unchanged. The failure proof found that the former
identity sequence consumed two IDs on rollback; a counter rollback now preserves
all sequence/counter state. This affects the common audit insertion path;
identifier allocation serializes audited writes, while read-only screens do
not acquire this lock. Shared audit, account, retry and browser flows are
rechecked; no audit append/actor/permission guard is removed or relaxed.
The list's compatibility expression supports old checkpoints while retaining
server paging at current real volume.

## Verification

Fresh verification passed on positively identified disposable PostgreSQL 17.11
clusters. `canonical-final` passed 107 invariants before/after; the restored
profile passed 125, with 448 permission cases. Both paths applied frozen 64
then new 65, proved a late migration failure rolls back the complete state,
verified the exact schema/data/ACL/sequence delta and a repeat deployment,
and preserved pre-65 native create/edit history through archive/restore/edit.
The staged review then caught CRLF-to-LF checksum normalization in candidate65.
Only line endings changed. `lf-migration-final` and `lf-canonical-final` repeat
the affected migration/native-history/delta/rollback/retry/invariant checks
using the exact final Git-canonical LF bytes; prior business/browser proof is
retained through an explicit source bridge. No frozen migration is normalized.

Five retention cases include native empty/NULL/gapped/retired associations,
an imported matter with 119 hearings, an imported matter without external
related records, and a financial-linked matter with 70 hearings, 17 works,
nine steps and one fee letter. SQL business digests, complete aggregate IDs,
ordering and related-table contents remain exact. Transitions, effective
no-ops, exact retries and post-restore editor no-ops are checked separately.

Fresh committing-boundary tests cover non-administrator, disabled,
forced-password, changed-role and revoked accounts; stale/count/payload
refusals; atomic audit failure; real blocked edit/archive, archive/restore
and duplicate-archive operations; expiry and session-revocation races.
Six nonempty report result sets stay byte-for-byte equivalent in their
stable projections (82/752/2/12,848/3,694/1,140 rows). D52 client independence
and 11 R1/R2 regression controls pass at 65, including all six protected
court changed/cleared cases and the complete D39/D40/D41 verifier.

The final isolated production build and browser proof passed 19 recorded
results, including eight clean accessibility scans and one actual 200%
browser zoom contract. All roles retain archived read access; direct edit,
archive/restore pages and forged actions obey permissions. Confirmation,
Cancel/Escape/focus, success, stale reload, lost-response retry, audit-error
recovery, filters/client return, last-row empty pages and independent client
state pass. Four representative screenshots were inspected, including
320 CSS pixels and zoom; the long modal scrolls vertically at small sizes.
No speech test was performed or scheduled.

`npm run check` passed: TypeScript, lint/format, RTL (60 files; 78 rules,
21 rejecting and five clean fixtures), authorization (68 entries), audit
(105 runtime sources; six schema and 67 semantic/D35 rejecting fixtures),
user management (eight rejecting fixtures), staff (nine), client (21),
Git exclusions and encoding (542 files). The final real-project check
passed all 121 invariants with read-only enforced in both connection URLs.
Final documentation/selector formatting, lint and encoding are recorded
separately; they do not replace the complete static gate.

The external initial matrix preceded application edits/tests/database execution:
2,041 bytes, SHA-256 `f99b38227d7ddc22f94dac552fecca141278e247161f5214088bbb1fa93a3701`.
The package pins executed sources and preserves all attempts. Accepted R3
editor/CSS and parser function bodies are unchanged. Its 24 ordering cases,
eight full-state no-ops, six scans and two zoom contracts are reused; fresh
post-restore no-ops prove retained ordering at 65. See the final matrix and
external reuse-map.json for the exact dependency identities.

## Preservation and authority

The one authorized narrow fetch observed origin/main at
`d84aa4b916e41e15abf543fc7dd2d4155bea7acf`. The first attempt could not write
FETCH_HEAD and stopped before network access; the scoped retry succeeded.
No push or governance edit. Phase 2's final PASS review is copied byte-identically
and its report/matrix acceptance addenda preserve exact historical prefixes.
Earlier packages, reviews and failed evidence remain intact.

Strict final comparison passed with no normalizations: all 109 table digests/
projections, 48 complete sequences (including log_cnt/is_called), catalog,
principals/grants, audit/ledger, container identity/configuration, 54 logos,
4,007 protected entries and 40,571 runtime/dependency entries match their
single current-run baselines. The real ledger remains 63 applied, one historical
rollback and zero unfinished. Owner PID54172, creation time and loopback
port3000 are unchanged. Its exclusively locked runtime.log remains the one
disclosed exclusion; no claim is made about those unread bytes. All task-owned
containers/volumes/networks/mirrors/cache files were removed with ownership
checks. No raw dump file was created, and no real source or owner-app mutation
was performed. See preservation-comparison.json and cleanup-final.json.
The final after-captures were refreshed after the LF-only migration follow-up;
earlier passing receipts remain under `pre-lf-*`. The original before baseline
was never reset or replaced. `final-capture-reason.json` records this exception
to the planned single after-capture.

## Remaining obligations

Phases 1/2 remain accepted. Phase 3 and overall Task 4.2 owner acceptance remain
pending independent review. This is one local candidate commit. Real 64/65
application, owner-app activation, Ubuntu deployment and Access cutover remain
outside scope. Future hearing/task/document matter pickers must exclude
archived new choices and retain existing references; none exists currently.
Stage 6 reports/exports must preserve D58 inclusion with nonempty exact-content
and totals proof. No new report UI or child-record mutation policy. POAs are
client-linked, so no matter-POA count is invented. No speech actions/follow-up
or full accessibility conformance claim. The historical locked owner
runtime.log exclusion remains unchanged.

## Owner acceptance and direction — 13 September 2026

Khaled Helmy explicitly accepted Task 4.2 Phase 3 and Task 4.2 overall at
`b2ac2187b762e7db82b190e6f5d522506e676292`, following the
[independent PASS review](../reviews/2026-09-13-task-4-2-phase-3-independent-review.md).
Phases 1 and 2 retain their earlier acceptances. The complete preceding document
is preserved as an exact byte prefix: its pending-acceptance wording and test
results describe the earlier execution checkpoint. Historical PASS evidence is
reused unchanged; no application, database or browser tests ran in this
documentation-only acceptance task.

C1 is **Owner-accepted risk — unchanged; not technically remediated**, under
[D59](../DECISIONS.md#d59--existing-development-repository-credential-exception).
The owner accepts the existing development password remaining in the repository
and directs no credential/configuration/service changes. The unused rotation
handoff was not sent and is superseded. The known value remains present; its
reported active match was not disproved or freshly retested. C1 is not a pending
fix or an acceptance/development/publication gate for this existing development
credential. The review's earlier MUST FIX recommendation remains historical;
the later owner decision supplies the current disposition, without changing the
review's bytes or claiming a technical fix.

This task changed documentation only. No database connection, runtime inspection,
password/configuration/service change, fetch, push, migration or deployment
occurred. Preservation of runtime/data here follows from no operational activity,
not a fresh database/runtime comparison. The last delivered observation was
migration 63, with 109 tables, 48 complete sequences and 54 logos; migrations
64/65 remained pending and the owner app was the migration-63 development
artifact. Those observations are historical, not newly measured.

Feature acceptance does not authorize publication, applying 64/65, activating
the new app, Ubuntu deployment or final Access cutover. Future child selectors
and report/export screens retain D58 integration obligations; shared audit-write
serialization remains a documented production-sizing consideration. Task 4.3
and later work remain unstarted here. Speech actions remain excluded.
The current stop is independent documentation review after one local acceptance
commit and its verified review package.
