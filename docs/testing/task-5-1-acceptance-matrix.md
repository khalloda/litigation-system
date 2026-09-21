# Task 5.1 — pre-execution acceptance matrix

Frozen before feature testing on 21 September 2026. Candidate only; Task 5.1
remains unchecked. Base: `c96bd7229b005b0c7472b1ad64d1d5c4eb48726d`.
Evidence: `test-results/task51-20260921-implementation/`. Private evidence:
`C:/Users/Khaled/.codex/visualizations/2026/09/21/01a0c33c-6cb1-7752-a6f4-0d4ffea37895/task51-private`.
All mutation and browser tests use a separately identified disposable cluster.

| Group | Expected result | Required evidence | Initial status |
| --- | --- | --- | --- |
| T51-DATE | One server Cairo Gregorian date; winter/summer midnight, UTC disagreement, month/year/leap/DST cases; independent of host/browser timezone | Explicit date oracles, runtime versions, controlled clock tests | Pending |
| T51-ROWS | Exact next-date hearing IDs/order; no archived hearings; archived/missing/inactive/closed parents retained; NULL/adjacent dates excluded; duplicates by matter retained | Independent SQL oracle and synthetic edge cases on full copy | Pending |
| T51-BOUND | Exact totals at 0/1/25/26/larger; at most 25 preview; all matches reachable through existing pagination | Exact ordered IDs and links; bounded query count | Pending |
| T51-AUTH | Four roles same scope; anonymous/password-change redirects; expired/revoked/mismatched/disabled/inactive/no-login denied before protected work | Genuine fixture browser login; service denial instrumentation; exhaustive permission suite | Pending |
| T51-NAV | Dated View all; detail/back; genuine parents; home; role navigation; sign-out | Production browser assertions | Pending |
| T51-FRESH | Old snapshot retains date; reload reads new day/data; revoked sessions denied; failure distinct from empty with navigation/recovery | Controlled fixture clock/data/failure windows | Pending |
| T51-UI | Arabic RTL/Western digits; full multiline/mixed text; keyboard/focus; 1280/390/320 widths and 200% zoom | Inspected screenshots, DOM/axe counts; speech excluded | Pending |
| T51-VOLUME | Full restored volume; selective/empty/dense days; indexed bounded reads | Independent results, timings and EXPLAIN ANALYZE BUFFERS | Pending |
| T51-REGRESSION | Production build, full check, permissions, historical 148 and setup 15 gates; affected hearing/home navigation | Source-bound commands and fixture identity | Pending |
| T51-PRESERVE | Complete owner before/after database/sequence/catalog and protected-file/runtime equality; authentication separated from reads | Private full captures, public comparisons; exact resource cleanup | Pending |
| T51-DELIVERY | Local task-only commits; complete five-file review delivery; safe ZIP and Git reconstruction | Receipt-inclusive verifier; unchanged TASKS/governance/schema/migrations/config/lock | Pending |

Results and failed attempts will be appended without replacing these expectations.

## Executed candidate results — 21 September 2026

All paths below are under the evidence root above. These are fresh implementation
proofs, not owner acceptance. `pre-execution-matrix.md` retains the original bytes.

| Group | Actual evidence and outcome |
| --- | --- |
| T51-DATE | PASS `dates-01`: 12 literal cases × four host timezones; `browser-06` uses Los Angeles/Tokyo/UTC browsers and crosses controlled Cairo midnight while retaining the old visible date until refresh. |
| T51-ROWS | PASS `core-01/results.json`: exact SQL IDs/order and exclusion traps, NULL parents/court, duplicate matter and archived/closed parents. `status-01` proves existing Disabled business client inclusion. |
| T51-BOUND | PASS `core-01`: 0/1/25/26/84/mixed4 and complete existing pagination. `bounds-01`: four statements at each boundary, no attendee/options reads. |
| T51-AUTH | PASS `dates-01`, `core-01`, `auth-extra-01`, `permissions-02`, `browser-06`. Actual disabled/inactive current-version denials stop before hearing SQL. No-login-person substitution also involves an account/person mismatch; explicit predicate is pinned. |
| T51-NAV | PASS `browser-06/results.json`: genuine four-role logins, dated list/detail/back, matter/client/home links, role navigation, refresh and four sign-outs. |
| T51-FRESH | PASS `browser-06`: Cairo midnight, refreshed new fixture record, query failure with preserved navigation, exact grant restoration/recovery, revoked session and genuine password-change redirect. |
| T51-UI | PASS within stated limits: seven zero-violation axe scans, 16 focus checks, AX tree, 1280/390/320 and native 200% zoom; actual screenshots inspected. No OS speech claim or timed loading-announcement proof. |
| T51-VOLUME | PASS 13,382 restored hearings before native fixtures; independent exact result sets, four-statement instrumentation and six full EXPLAIN plans in `core-01/query-plans.json`. |
| T51-REGRESSION | PASS `build-02`, `check-03`, `permissions-02` (480 decisions), `gates-02` (148+15). `check-final` binds final documentation; frozen `built-02` source matches candidate application bytes. |
| T51-PRESERVE | Full local comparisons are recorded in `preservation.json`, including completed read/auth windows. Complete owner table/column/sequence/catalog state, protected file metadata/bytes and runtime identities are compared. Private raw bodies and per-descendant ACL limitations are explicit. |
| T51-DELIVERY | External manifest/receipt/verification record the local commit, exact source/patch reconstruction, unchanged protected boundaries, resource cleanup, clean Git state and receipt-inclusive seal. Task 5.1 remains unchecked. |

The [candidate report](../task-reports/2026-09-21-task-5-1-implementation.md)
explains scope, failed attempts, private-evidence limits and the review stop.
