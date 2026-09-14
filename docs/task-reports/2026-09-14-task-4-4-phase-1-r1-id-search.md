# Task 4.4 Phase 1 — R1 exact ID-search correction

14 September 2026. **R1 corrected; pending independent correction review.**
This is not Phase 1 acceptance or activation. Current work order remains in
[TASKS.md](../../TASKS.md); overall Task 4.4 and all existing checkboxes are unchanged.

## Authority and run configuration

Khaled expressly approved the [independent review](../reviews/2026-09-14-task-4-4-phase-1-independent-review.md)
and adopted `task44-phase1-r1-correction-prompt.txt` in this same active task.
The review is 19,137 bytes, SHA-256
`6b842c3aaf3bb2853818096a60fc0b568ff299ad4b5e84d8d2c5427f991b19e5`.
Its recommended correction is evidence; the owner's accompanying message supplies
execution authority. The attached project context is background, not authority
to replay earlier tasks. Original mandate and delivery identities were verified.

- Local Windows: `D:\Projects\litigation-system`; same Codex Desktop task.
- Model/effort selector not independently verified or changed. The adopted
  recommendation was GPT-5.6 Sol / Medium; no Ultra or subagents were requested
  or used. Expected usage low to moderate; no purchases or new services.
- Least-cost safe approach: one shared predicate correction, independent focused
  red/green proof and browser coverage, required static/permission/checkpoint gates;
  reuse unchanged detail/history/layout and accepted migration/lifecycle evidence.
- Starting commit `886c37e3a66de654bc41bf4a00d5fbff4608e151`; tree
  `3059d9f072d2781b43692ddff7e822c46666837d`; sole parent
  `98ba737300f1c0cefce361cb3da4e250b11b71d2`.
- Final commit: the one local correction containing this report, subject
  `fix: normalize administrative work ID searches`; sole parent is the starting
  commit above. Its full SHA, tree, raw commit object and recursive tree inventory
  are in the external delivery/identity receipts, avoiding a self-hash in this file.
- No fetch: origin/main is the **previously observed/cached** `98ba737...`, not a
  fresh remote observation. No push. Final measured branch/clean/ahead/behind state
  is recorded in the separate delivery receipt.
- Stop: one correction commit, exact new-commit patch, report/matrix, verified
  correction ZIP/external manifest and separate delivery receipt. Independent
  correction review is next; no acceptance, activation, Phase 2 or later task.

## Defect and correction

A lawyer searching with an Arabic keyboard could miss a known work. PostgreSQL
record 808 and its imported legacy ID 11470 demonstrate both branches on the
current copied source: Western digits found the selected record, while `٨٠٨`
and `١١٤٧٠` missed it in the reviewed implementation. Independent selection proves
that the selected row has no matching searched text/alias or equal opposite ID.

Both exact comparisons now normalize only their input with the existing
`public.ar_normalise()`. Rows and count share that corrected predicate. Stored
IDs/text, route parsing, legacy provenance, parameterization, NULL behavior,
pagination/filter state and exact equality remain unchanged. No substring ID
search, numeric coercion, new normalizer or Latin-J-to-Arabic-ق mapping was added.

The original service suite's independent expectation now compares IDs with the
normalizer's result and explicitly excludes NULL legacy IDs. A new focused
regression obtains its baseline from copied SQL records and the canonical
normalizer, without importing production query builders. It checks complete
ordered result-ID sets, counts and every result page, including legitimate
text matches on other records rather than assuming each query has one result.

## Changed files

- `src/lib/admin-work-query.ts`: the two ID comparisons in the shared predicate.
- `scripts/test-admin-work-read-only.ts`: normalized independent ID expectations
  and NULL legacy handling; no other existing suite behavior changed.
- `scripts/lib/audit-source-inventory.ts`: exact whole-service pin updated only
  after reviewing the narrow diff and passing the new behavior. The seven
  low-level call fingerprints remain unchanged; no rejecting rule was weakened.
- `scripts/test-admin-work-id-search.ts`,
  `scripts/lib/admin-work-id-search-proof.ts`,
  `scripts/lib/admin-work-id-browser-proof.mjs`: correction runner, independent
  baseline/candidate/refusal controls and focused browser assertions.
- `README.md`, `TASKS.md`, `docs/PRD.md`: dated correction status additions.
- `docs/testing/task-4-4-phase1-acceptance-matrix.md`: dated correction addendum;
  prior matrix entries retained as historical evidence.
- [R1 matrix](../testing/task-4-4-phase1-r1-correction-matrix.md), this report and
  exact review preserved above. Original implementation reports/reviews remain
  byte-identical.

No UI, permission policy, schema/migration, shared/hearing search, dependency,
credential/configuration, governance or decision change. Editing, lifecycle,
export and quarantine release remain outside scope.

## Verification and meaningful failures

Evidence root: `D:\Projects\LitigationData\review-evidence\task44-phase1-r1-20260914`.
Run commands use `ADMIN_ID_EVIDENCE_DIR` pointing there. Browser paths use the
already available Playwright 1.62.0 and Chromium 1234; no installation.

| Command/proof | Outcome and retained evidence |
| --- | --- |
| Git identity/status/upstream/effective remote and named source hashes | Exact clean starting checkpoint and original artifacts; cached origin explicitly labelled; no fetch |
| `node node_modules/tsx/dist/cli.mjs scripts/test-admin-work-id-search.ts --red` | PASS detecting **48 expected failing equality assertions** against unchanged 886c37e production code: 12 existing candidates x four roles; Western controls succeed and selected IDs are absent only in Arabic-form failures |
| Same runner without `--red` | PASS corrected search: four roles, both digit forms, exact independent full-ID sets/counts and matter intersections; all result pages checked with no duplicate/missing IDs |
| Focused exactness controls | Partial IDs, suffixed IDs and leading-zero input cannot retrieve selected records through ID coercion; candidate selection excludes incidental text/opposite-ID matches for these negatives too |
| Existing normalization/input controls | Canonical `٠١٢٣٤٥٦٧٨٩ → 0123456789`, Arabic/diacritics, `JTI`, distinct `140J`/`140ق`, literal `%`/`_`/backslash, empty query, invalid/oversized input and NULL text controls |
| Direct refusal controls | Anonymous, expired, stale session-version and forced-password contexts refused by list and detail helpers; unchanged full permission suite also run in the isolated copy |
| `scripts/check-db.ts --profile=historical-full-state-upgrade` | PASS all 131 migration-67 permanent checks with forced read-only connections before fixture actor preparation |
| Production build and focused authenticated browser | PASS build `VuOM-Tsj6l89TLCeqxP6k` and all four branch/digit-form interactions; separate owned mirror/loopback port/secret and fixture Lawyer session; expected visible counts/IDs and list/detail/back query preservation |
| `scripts/test-permissions.ts --restored-fixture` | PASS fresh permission and rejecting controls, separate from business-read state comparisons |
| `npm run typecheck`, focused Prettier; final `npm run check`; `git diff --check` | PASS final required static gates and exact source pin/rejecting tests, retained in `static-check.log`; final documentation formatting/encoding/diff checks also required before commit |
| Preservation, final source binding, patch and ZIP verification | Full before/after comparison, byte-bound tested sources, exact patch statistics/reverse check, raw commit/tree and complete external member manifest; final results/identities in separate delivery receipt |

The selected candidates cover all ten digit mappings independently in each ID
branch: five PostgreSQL IDs and seven existing imported legacy IDs. No native
business fixture or imported-ID modification was needed. Red evidence records
actual versus independent expected IDs and the selected missing ID, not a
constructed illustration. The red runner succeeds only when it detects both
reviewed branch defects; this is an expected regression failure, not a product
PASS. Initial TypeScript callback typing was corrected by using the established
JavaScript browser-helper boundary and explicit context keys. This did not alter
the production predicate or the independent red-test assertions.
An evidence-helper comparison initially treated pre-existing CRLF endings in
`docs/DECISIONS.md` as a Git-blob mismatch. Direct inspection established that
the file was unchanged: the corrected comparison requires both the exact initial
working-file hash and the Git blob identity under `.gitattributes`. No authority
file was edited and no preservation check was waived.

## Exact reuse and protected state

The old whole-file query hash is **not** reused as proof of the corrected search.
Fresh executed-source and build manifests bind the new query bytes. An exact
source comparison establishes that replacing only the two reviewed raw-ID
comparisons reproduces the new query file byte-for-byte: all detail/step
projection, date/multiline handling, source ordering, authentication snapshot and
unsurfaced `nextAppointment` behavior are unchanged. Their original full-volume
3,694-detail/3,483-step evidence is reused, not rerun or relabelled fresh. Original
four-role screen access, 320px/200%/scanner layout evidence and accepted Task 4.3
migration/lifecycle/race proofs are likewise reused by unchanged dependencies.
No screen-reader speech or general UI redesign/testing was reopened.

For this correction, the initial configuration/logo/process receipt precedes
fixture operations and production edits. The initial actual receipt includes all
119 tables, account/session-version/audit/migration/catalog digests and all 48
complete `last_value`/`log_cnt`/`is_called` sequence states. Red and green runs use
forced-read-only source access and coherent exported snapshots into positively
identified separate clusters/volumes/networks. Actor preparation and independent
test sessions occur only in those copies. Controlled business reads compare
state after setup, separating permission/fixture effects from read effects.

Final receipts compare the complete correction window, including source account
state and complete sequences, named original review/delivery inputs, private
configuration identities and 54 logo files. No private configuration receipt,
raw credentials, password hashes, sessions/cookies, environment file, database
dump or copied old full package is included in the correction ZIP. Earlier
Phase 1 midpoint/final-window limitations remain historical; this correction
does not retroactively repair or relabel their capture windows.

The owner app remains accepted67, build `6STn5JeaidE5AnbLqEJc8`, PID 70060 with
its verified creation identity on 127.0.0.1:3000. No actual account/login/password,
session, database, ACL, environment, artifact or listener operation occurred.
Existing backups remain untouched. Only task-owned test resources are removed;
cleanup and final host/Git observations are in the delivery receipt.

## Remaining stop and limits

R1 requires independent correction review before any Phase 1 acceptance.
Automated historical accessibility evidence is not full conformance; speech stays
excluded. The original 4,000-option bound and quarantines remain unchanged.
No deployment, activation, publication, Phase 2 or later task is authorized here.
