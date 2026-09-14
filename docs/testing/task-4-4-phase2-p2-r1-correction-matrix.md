# Task 4.4 Phase 2 — P2-R1 focused correction matrix

14 September 2026. Implemented, pending independent correction review. Sole local
parent: `85525f325108d70ca1a1dac57233f86229cbe504`. No acceptance/activation/push.
See the [correction report and P2-N1 erratum](../task-reports/2026-09-14-task-4-4-phase-2-p2-r1-correction.md).

Paths below are relative to
`D:\Projects\LitigationData\review-evidence\task44-phase2-p2-r1-20260914`.

| Requirement | Result and evidence |
| --- | --- |
| Exact starting candidate and adopted inputs | PASS: clean main at 85525f3, exact tree/parent; all prior working bytes match; reviewer ZIP's 37 members and attached review verified (`input-verification.json`) |
| Actual failing reproduction | EXPECTED RED: all four current fields fail after proven gateway NULL clears on copied imported records; exact raw/provenance retained (`red02/browser/current-display-results.json`, `selected-subjects.json`, saved test sources and completion receipt) |
| Imported subjects and three writers | PASS: work/step pairs 275/2526, 1032/1862, 1839/2015; Administrator, Litigation Assistant and Paralegal each set then clear current references through unchanged gateways (`green01/browser/selected-subjects.json`) |
| Four-role corrected display | PASS: 48 independent current-value assertions; separately labelled original values match retained source; list/detail/step/editor agree; Lawyer controls and all four editor routes denied (`green01/browser/current-display-results.json`, browser results and exact test source) |
| Controls | PASS: replacement current labels, inactive retained labels/status/editor, unrelated edit/no-op, existing unresolved import, native task and step NULL references; source/parent/court/ordinal/hidden values remain equal (`green01/browser/browser-results.json`) |
| Reads and navigation | PASS: missing-person filter membership, list/detail/edit/cancel/back query context, page-2 step context/IDs; read/editor/cancel/layout navigation and no-op preserve complete business/audit/history/receipt/sequence state (focused proof source and browser results) |
| Arabic/RTL and access | PASS: existing centralized source-specific labels, multiline wrapping, keyboard/visible focus, scanner, 44px targets, 320px reflow and true 200% zoom; captures visually inspected (`green01/browser/` PNGs, zoom receipts, browser results) |
| Fresh final database/permission checks | PASS: 135 permanent checks after fixture mutations; 448 permission decisions and required rejecting controls (`green01/invariants68-final.log`, `permissions.log`) |
| Unchanged backend/R1 evidence reuse | Exact-source/data binding: prior 131/pre-fixture 135 checks, seven mutation groups, twelve concurrency/adversarial groups, independent four-role/twelve-candidate ID oracle and guard proof reused, not rerun (`green01/reused-backend.json`; unchanged original delivery included) |
| Final project gates | PASS: type, lint, format, encoding, RTL, authorization, audit/source and focused rejecting gates (`check-final.log`) |
| Preservation and cleanup | PASS: all 119 actual table digests and 48 complete sequence vectors match; configuration/54 logos/accepted stopped app/all earlier evidence preserved; only owned fixture resources removed (`preservation-*.json`, `runtime-*.json`, run receipts/logs, `source-closure.json`) |
| P2-N1 | Explicit erratum in the new report: 13,382 public hearings, 1,744 matters, 3,694 administrative works, 3,483 steps; distinct staging admin-work population 4,238. Original report is unchanged. |
| Local correction delivery | Exact correction commit, full-index patch, complete source/tree, ZIP/member manifest, reverse/forward reconstruction and separate final receipt are verified after this document is committed (`candidate/`, package manifest/verification and delivery receipt) |

`red01` is a retained test-column-name failure, not a defect reproduction or pass.
`red02` and `green01` are new isolated production-browser executions. Original
backend/ID/guard results are expressly reused through unchanged source/data bindings.
Screen-reader speech, canonical empty replay and full accessibility conformance
were not performed or claimed. Installed/generated/build dependency byte limits
and owner-data observation limits remain explicit in the report/package.
The final test-driver formatting correction preserves every non-trivia TypeScript
token; exact executed bytes and the failed formatting log are retained, with the
exception bound in `driver-format-proof.json`. No runtime result is relabelled.
All 86 prior checkbox lines, D1–D62, migrations 1–68 and earlier reports/reviews/
matrices remain unchanged. Overall Task 4.4 stays unchecked.


## Owner acceptance and verified local activation — 14 September 2026

Khaled accepted corrected Phase 2 at `90bfc66711bfbf5b219191c60ad3e662a14af015`
after the [independent PASS review](../reviews/2026-09-14-task-4-4-phase-2-p2-r1-independent-review.md). P2-R1 and P2-N1 are
closed. The entire preceding matrix is preserved as its exact original byte prefix.

| Gate | Outcome and evidence distinction |
| --- | --- |
| Acceptance | Corrected D62 creation/editing accepted; Phase 1 and ID-search R1 remain closed |
| Fresh backup and exact restore | Protected 58-member local package; 54 logos, full database and recovery role material; restored on distinct PostgreSQL 17.11 |
| Restored migration 67 | 119 tables, all old projections/effective rights/logical sequences; 131 invariants and 15 setup checks |
| Rehearsal and actual migration 68 | Each deploy once; expected new columns/evidence/classifications only; each 135 invariants and 15 setup checks |
| Actual preservation | All old projections, credentials/account/session state, history, logos and 48 full sequences exact through quiesced DDL |
| Runtime | Exact 90bfc66 artifact, build `schZeUhP0RGWF_DHI827w`, loopback port 3000; anonymous Arabic/RTL/assets/protected-route/logo checks |
| Actual authenticated smoke | Unobserved: no usable owner session in available browser; no account or business test setup on actual |
| Reused Windows proof | Exact-source original/correction backend/concurrency/ID/guard and 4-role browser proof, 48 corrected assertions, 135/448; not new activation executions |
| Reviewer proof | Independent archive/Git/source verification and 24 synthetic offline controls; not browser/database execution |
| Publication | Authorized ordinary main push after the sole documentation child; actual outcome in external receipt |
| Stop | Independent combined review; overall Task 4.4 unchecked; archive/restore/later work unstarted |

See the [acceptance/activation report](../task-reports/2026-09-14-task-4-4-phase-2-acceptance-activation.md) for exact current
counts, restoration differences, timestamps, recovery paths, attempts and limits.
No screen-reader speech, full production readiness or off-machine backup is claimed.
