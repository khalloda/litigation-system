# Task 4.2 Phase 2 — R1–R3 corrections

12 September 2026. Bounded local correction for independent review; **Phase 2 is
not owner accepted**. Phase 1 acceptance remains unchanged. The owner's ordinary
chat message supplies authority; the attached review supplies evidence.

## Checkpoint and evidence

Base and sole parent: `9b2d63ad542f8e81af00995debd283840849e919`,
`feat: add matter creation and editing`. The starting checkout was clean `main`,
two ahead/zero behind the unchanged recorded `origin/main`
`d84aa4b916e41e15abf543fc7dd2d4155bea7acf`. No fetch was performed.
One correction commit uses subject `fix: preserve matter editing invariants`;
the separate delivery receipt records its resulting hash and exact statistics.

Evidence is local, outside Git:
`C:\Users\Khaled\.codex\visualizations\2026\09\12\01a094ba-eb44-7451-8524-b7749d95e213\task42-phase2-corrections`.
All evidence names below are relative to that directory. The original sibling
`task42-phase2` and preceding packages remain intact. All six original delivery
artifact sizes/hashes were checked before work (`original-identities.json`).
The [independent review](../reviews/2026-09-12-task-4-2-phase-2-independent-review.md)
is preserved byte-for-byte: 14,182 bytes, SHA-256
`deaf85d465b27ca459262451e7697e399c3b8eb4859882b61c99c96d5e5bf816`.
The supplied reviewer receipt and correction prompt are preserved externally.

The initial correction matrix was saved before implementation edits or test/database
execution. Its SHA-256 is `0910726f9f2791c708e37df5b2fed2c55a7603aa1fed85c8eee07f0dd17ddb4f`. The
[final correction matrix](../testing/task-4-2-phase2-correction-matrix.md)
maps each finding and preservation/delivery requirement to actual evidence.

## R1 — Undoing a selection does not create an edit

On the unchanged candidate, both lawyer A→B→A and capacity X→Y→X reset the
relationship ID to null. `reproduction-1` reproduced the accepted parser/gateway
false edit on PostgreSQL and both authorized roles in the production browser.
Untouched and numerically equal decimal saves were positive no-op controls.

The editor now restores the original relationship ID when returning to an
original selection, including a retained former selection. The gateway performs
complete relationship shape, duplicate, ownership and active-reference validation
before deciding whether anything changed. It resolves existing lawyer/capacity IDs
and compares the effective aggregate in the same stable reading order as the
snapshot. It does not resolve a party by name. Retired relationships remain
eligible for restoration only under the existing reference rules.

An unchanged save returns before any business write, version increment, child
allocation, change/submission receipt or audit insert. The original request JSON
is not replaced by this resolved form: replay of a committed submission still
requires the exact original payload, and account/version checks remain enforced.
Null, empty, omitted and decimal semantics are unchanged.

`correction-browser-1/correction-results.json` proves both null-ID round trips
through the real service and direct gateway with full table/catalog and complete
sequence equality, including `log_cnt`. It rejects supplied forged IDs before
no-op return. A real edit with resolved IDs replays exactly; a different payload
under that committed submission and a stale new submission are refused without
partial changes. Browser results prove both selector round trips for Administrator
and Litigation Assistant with the same complete state comparisons.
`mutations-1` additionally proves ordered relationships, role changes, stable IDs
through removal/restoration, inactive/external selection refusal, actual overlapping
writes and audit-failure rollback. Fresh supplemental tests include existing foreign
party/lawyer IDs and malformed direct gateway requests.

`selection-controls-1` passes actual new lawyer and capacity selection changes,
then restoration using null submitted IDs. It asserts retained original IDs,
exactly two real versions/changes/submissions/audit events per change-and-restore
pair, and the complete current/original aggregate boundary.

## R2 — The existing D41 court rule is enforced when writing

The full fixture resolves the approved released rows through their immutable
release evidence. Access IDs are not PostgreSQL IDs:

| Access legacy ID | PostgreSQL matter ID | Current court ID |
| --- | --- | --- |
| 467 | 5093 | 32 |
| 468 | 5094 | 32 |
| 515 | 5095 | 32 |

The court is exactly `نيابة الشئون المالية والتجارية`. `reproduction-1`
changed and cleared the court for each matter through the real service, observed
the unchanged permanent verifier's `D41 matter court changed` refusal, restored
the fixture court through an attributable save, and verified the contract again.
It also demonstrated ordinary-matter court changes and unrelated protected-matter
field edits as positive controls. No real project row was edited.

The pending migration now rejects changed or cleared courts for these immutable
legacy identities in the value validator and the row-level update guard. The form
receives a server-derived protected-court flag, disables that selection and associates
an Arabic explanation with the control. Other fields and ordinary courts remain
editable. The current D41 verifier is unchanged; it was not redirected to an old
snapshot. The exact twelve hearing destinations, note, approved workbook identity,
D39/D40/D41 release/source/branch evidence and `DECISIONS.md` are unchanged.

The corrected fixture refuses all six changed/cleared attempts through the service,
direct gateway and direct audited row update. Complete state comparisons prove no
partial writes or sequence changes. Unrelated edits on all three protected matters
and a normal court change succeed. The complete high-impact verifier and full
historical/current invariants pass afterward. Both authorized browser roles see
all three restrictions and their explanatory text.

## R3 — Party movement matches the client/opponent grouping

The unchanged browser reproduced a cross-side move that was reversed on reload.
The editor now keeps clients and opponents grouped and enables Up/Down only within
the current side. It never changes legal side as a movement shortcut. Explicitly
changing side appends that party to the chosen group's end; the form explains this
behavior. Names, IDs, capacities and unaffected within-side order are retained.
The established detail/snapshot reading convention is unchanged.

Both authorized roles tested two parties per side, keyboard moves in both groups,
all side boundaries, retained input after decimal validation failure, explicit
side change and save/reload/detail. Assertions compare exact party IDs, sides,
order and capacity identities. These are actual browser/database assertions,
not handler-only simulations.

## Fresh verification and qualified reuse

- `reproduction-1`: original candidate, all three findings, real PostgreSQL and
  production browser, positive controls, 125 final invariants and exact source cleanup.
- `mutations-1`: corrected 63→64 full-volume restore, complete transaction rollback,
  exact named catalog delta and unchanged complete sequences, 125 before/after
  historical invariants, full mutation/retention/replay/concurrency/audit controls.
- `canonical-1`: fresh empty canonical database at exact 63, deliberate late failure
  rollback, corrected 64 deployment and all 107 canonical invariants.
- `correction-browser-1`: focused service/direct gateway/row-guard cases, all 15 setup
  checks, 448 permission decisions, separate production build and 43 browser
  evidence entries. All 16 scans have zero automated violations; 16 screenshots
  cover desktop, 320 CSS pixels, genuine Chromium 200% zoom, protected court and
  validation states. Representative screenshots were visually inspected.
  The original editor proof was also rerun: actual lost-success-response retry,
  stale retained draft/reload and forged real action denial for both read-only roles.
  Supplemental account/reference/checker controls and all 125 final invariants pass.
- `static-2.log`: complete required typing/lint/format/RTL/authorization/audit/user/
  staff/client/storage-ignore/encoding checks. `static-final.log` repeats the complete gate against the final added proof
  sources (524 correctly encoded files); final documentation encoding/whitespace
  checks also pass.

`reuse-map.json` identifies exact unchanged dependencies and dated artifacts for
Phase 1's complete 1,744-matter read/navigation/archive-independent proof, the
82/378 client sets and prior client/contact/logo, staff/account and report evidence.
All 64 original migration/lock files match the parent byte-for-byte. Changed
write/state/migration behavior is tested fresh. No old full suite is described as
rerun merely because its shared checkpoint recognizes candidate 64.
`final-source-evidence.json` binds final application/schema/migration dependencies
to the production build and explains later test/documentation-only differences.

## Preservation, troubleshooting and limits

The real database remained at 63 applied migrations, one historical rollback and
zero unfinished. Its cluster is `7676117521894273062`, with 109 tables, 48 complete
sequences and 54 logos. Forced-read-only source captures include all row digests,
full sequence state, migration/audit/catalog/schema/function/role/grant evidence.
Protected inventories include the backup, logos, original Phase 2 package, preceding
packages, governance and environment file bytes/timestamps/permissions. Runtime
inventories cover dependencies, `.next` and the existing separate owner artifact.
The pre-existing exclusively locked owner `runtime.log` remains explicitly excluded;
no claim is made about its contents and it was never unlocked.

Before tests, the fresh source, previous protected entries and all 40,571 runtime
entries matched the original Phase 2 delivery exactly. The same database container
had already restarted at `2026-09-12T11:05:35.831674827Z`; its network endpoint and
MAC address differed from the earlier receipt. `prior-container-discrepancy.json`
retains the exact old/new values. This was observed before task writes and was
reported; no repair or value normalization was made. Final preservation compares
against the complete fresh baseline and retains that historical difference.
The owner remains on `127.0.0.1:3000`, PID 54172, with the same executable/creation
identity and separate migration-63 artifact.

The final complete comparison passes for all four receipts: 109 tables, 48
complete sequences, 54 logos, 3,770 protected entries and 40,571 runtime entries.
Every decoded key/value is compared; JSON object serialization order can differ,
but no value was normalized or newly excluded. `cleanup-final.json` confirms no
remaining task resource and the unchanged owner listener/process.

`static-1` initially failed the unchanged audit checker on two state-array index
expressions. Equivalent `.at()` access passed the existing checker and rejecting
self-tests; no rule was weakened. A late optional browser-test addition occurred
after the runner loaded its callback. Source comparison caught the mismatch: the
exact executed callback was archived and restored, the proposal is explicitly
unexecuted, and the extra positive selection controls run in a separate named proof.
No unexecuted assertion is counted as a pass. The final product source was unaffected.
`attempts.json` retains actual outcomes and evidence; no automatic approval rejection,
safety override or shared-cache contamination occurred. Build processes set
`JITI_FS_CACHE=false` before execution. Only identified owned fixtures/mirrors/ports
were created and removed; no raw dump file was written.

The original reports/matrices retain exact byte prefixes with correction pointers.
Phase 1 acceptance, all TASKS checkbox states, migrations 1–63, governance and
approved decisions remain unchanged. Candidate 64 alone was revised while still
unapplied outside disposable fixtures; its final SQL SHA-256 is
`afd0ebc8c9c98e4de2eaa594668eb8dd7e7c216d8b1fdb093a44ebb50ff99034`.

The correction ZIP contains sanitized evidence, exact relevant committed source
postimages and the correction-only full-index binary patch. Its manifest and separate
receipt record every payload's bytes/hash, exact membership and patch reverse-check.
Final Git state and commit/sole parent/statistics are in that receipt. Independent
R1–R3 correction review is the next stop. No fetch, push, live migration, deployment,
owner-app operation, speech, subagent, matter archive/restore or later-phase work
is included. Windows disposable testing makes no Ubuntu production-readiness or
latency guarantee.
