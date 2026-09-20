# Task 4.8 — pre-execution requirements and evidence matrix

Prepared 18 September 2026 before application coding and fixture execution.
Completed with observed evidence on 20 September 2026.
Base: `c7de44a03710022ac7c47f4dbc4b093838afc31b`. Status: candidate for independent
implementation review, not accepted. All 86 task-checkbox lines remain unchanged. Actual owner migration,
activation, publication, Task 4.9 and Stage 5 are outside scope.

| ID | Requirement | Planned fresh evidence | Status |
|---|---|---|---|
| B01 | Verified handoff and exact clean local/remote base | ZIP/member hashes; supplied verifier; 61 source bindings; narrow fetch | Passed; external input/Git records |
| B02 | Preserve actual owner state and earlier evidence | Four-schema full-row/all-column digests, 48 complete sequence vectors, actual ACLs/catalog identities; protected files and exact artifact/process before/after | Passed: owner/files/runtime before-resume-after; `commands/preservation-final.*`. 138 tables, 48 sequences, 36,401 static files; disclosed external container start during inactive gap; app stayed stopped |
| B03 | Exact D67 labels; bounded forward migration only | Full-data upgrade delta, canonical replay, permanent map check and late rollback | Passed: `isolated-11` upgrade/rollback/lookup/audit vectors; `canonical-03` 130 checks; historical candidate 148 checks |
| B04 | Invoice/payment list/detail and genuine parent links | Independent SQL oracle for all retained records and every ordered page, four roles | Passed: `isolated-11/historical-oracle.json`, `service-results.json`; 543/597/47 rows, 184 pages and 4,560 details |
| B05 | Missing values and exact financial representation | Separate credit/debit, decimals, currencies and actual share tests, including 21819 and NULL types | Passed: historical/edge oracles and service/browser records; eight exact formatter cases in `check-05`; negative formatting without weakening native nonnegative constraints |
| B06 | Search/filter validation and literal escaping | Independent query cases, digits 0–9, exact IDs separated from text, invalid/repeated/unknown/date/range/page parameters | Passed: `isolated-11/filter-oracle.json` 1,065 cases, source-bound service edge cases and exact-ID fixtures |
| B07 | Fresh authorization and no billing writes | All roles; anonymous/expired/stale/disabled/reset/invalid principals; direct SQL/sequence/private-helper refusal; native/legacy provenance | Passed: `isolated-11` permissions 448, service refusals and full read pairs; `security-01` twenty faults/full-state pair and 15 setup checks. Inherited SQL grants accurately distinguished from application no-write boundary |
| B08 | Hidden fields absent from public DTOs and payloads | Explicit allowlists, static boundary checks, browser HTML/RSC inspection | Passed within declared scope: complete DTO comparisons, static closure, 298 inspected bodies/no matches; 413 unavailable background/aborted responses explicitly retained, not claimed inspected |
| B09 | Browser URL/control/result agreement | Native GET, Clear before/after submit, Back/Forward, page/detail/back and cross-module links | Passed: `isolated-11/browser-results.json` four-role native flows; source-bound expected controls and ordered IDs |
| B10 | Arabic/RTL accessibility and visual behavior | Four-role production browser, keyboard/focus/labels, desktop/mobile/zoom, long values and bounded table overflow; no speech testing | Passed within declared scope: 53 axe/target/reflow records, zero violations, native keyboard scroll/200% zoom, six screenshots and `visual-inspection.md`; no speech or no-JavaScript claim |
| B11 | Gates and unchanged regression boundaries | Full project check, permissions, billing checks, exact source bindings for reused earlier module proof | Passed: `commands/check-05.*`, final docs-only gates; `reused/reuse-scope.json` binds seventeen unchanged sources to dated September 17 backend/race proof, not fresh billing/UI proof |
| B12 | One clean local child and complete delivery | Whole diff, unchanged migrations/decisions/checkboxes, raw commit/tree, exact patch reconstruction, complete archive/manifest/verifier/result/receipt | Source ready for single commit; final exact commit/tree/clean-status and reconstruction results are recorded externally after commit in `git/checkpoint.json` and the sealed verification/receipt, avoiding a circular self-hash claim |

No earlier application/database/browser PASS is claimed as fresh. Reused proof
is named and source-bound in the report; fresh results and material failed
attempts are retained in the external evidence namespace. The final envelope
verifier recomputes archive/Git/source/patch, preservation, migration and oracle
relationships; private-state body collection remains explicitly receipt-limited.

## Operational acceptance supplement — 20 September 2026

This append-only supplement supersedes the candidate-only status above without
changing its exact 4,836-byte original body. Khaled accepted `90d0219` after the
[independent PASS](../reviews/2026-09-20-task-4-8-90d0219-independent-review.md).
See the [operational report](../task-reports/2026-09-20-task-4-8-acceptance-activation.md).

| ID | Fresh operational evidence | Result |
| --- | --- | --- |
| O01 | Separate handoff manifest, all 38 members, inspected supplied verifier and original implementation envelope | PASS; complete source/input bindings retained |
| O02 | Full migration-71 prestate, 147 historical + 15 setup gates; frozen protected file/ACL/link set | PASS; 138 tables, 48 sequences; 37,831 existing files inventoried |
| O03 | Fresh protected recovery, all members and 54 logos verified; restore exact dump to identified separate PG17 cluster | PASS; raw/default ACL, physical column/cast, WAL log-count and fixture credential differences explicitly recorded only across restore |
| O04 | Unchanged migration 72 rehearsal and candidate gates | PASS; exact eleven-label/event/counter delta; 148 + 15 gates in rehearsal-03 reused within this run; final rehearsal-06 fresh restore/deploy/browser/cleanup |
| O05 | Stable exact-source production build and fresh four-role same-compiled-output browser/read windows | PASS; build `l02XdOB10LpyGNufC8_Fs`; no recompilation of mirror; complete per-role state equality |
| O06 | Actual guarded deployment, 71→72, exact before/after delta and old-row preservation | PASS; 09:58:47–09:58:54 UTC; 869 old audit rows exact, eleven added; counter +11; all 48 full sequences exact; 148 + 15 actual checks |
| O07 | Actual activation and anonymous route/login smoke | PASS; stable artifact, loopback only, PID 52576 at start; restricted runtime; old artifact preserved |
| O08 | Existing legitimate owner Administrator read-only navigation | PASS within bounded scope; both digit forms, controls/results/Clear/history, paging/detail return, genuine links, missing type and 7.5%; no login/account/business mutation; full state equality |
| O09 | Exact eight-document child, only 4.8 marker, original matrix prefix, verbatim review, full/shared patch reconstruction and publication | Commit, fresh live remote outcome, reconstruction and final runtime/database/file verification are bound in external receipts after this document is committed |

The original exhaustive oracle, 448 permission decisions, 130-check replay,
late rollback, 53 accessibility observations and earlier backend/concurrency
proof remain dated, verified reuse—not fresh execution. No screen-reader speech,
JavaScript-disabled, exhaustive actual payload or full accessibility certification
is claimed. Private recovery/database bodies stay local; supplied digests and
capture code are verifiable but do not independently witness collection.
Only Task 4.8 is newly checked. Independent operational review is pending;
Task 4.9, Stage 5 and Ubuntu deployment remain outside scope.
