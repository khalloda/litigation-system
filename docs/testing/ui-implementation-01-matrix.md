# UI Implementation 01 — evidence matrix

Candidate only. Overall **BLOCKED / not complete** on P01/P05. Evidence paths are inside the ignored task root or the review ZIP.

| ID | Outcome | Evidence / limit |
| --- | --- | --- |
| I01 | PASS | input-verification.json |
| I02 | PASS | owner-before-summary.json; owner-preservation.json; owner-runtime-final.json |
| I03 | PASS_WITH_LIMITS | route-coverage.json |
| F01 | PASS_ASSETS | static-fonts.json; font provenance; browser-final-smoke.json |
| F02 | PASS_WITH_LIMITS | design-source-mapping.md; UI proofs; full check |
| N01 | PASS | browser-final-smoke.json; ui-last-proof.json |
| N02 | PASS | permissions-result.json; permissions.log; audit-download-4/results.json |
| M01 | PARTIAL_FRESH | 71-route smoke, canonical unchanged filter/query code; not every filter/UI permutation freshly exercised |
| M02 | PASS_WITH_LIMITS | ui-proof-1790627073747/results.json; full-record return across route remount not independently asserted |
| M03 | PASS_SOURCE_AND_VISUAL | matter-detail extraction; screenshots; no next-hearing inference |
| D01 | PASS | semantic-checks/open-results.json; workload-results.json; top-results.json; browser screenshots |
| D02 | PASS | semantic-checks/outcome-results.json; ui-last-proof.json |
| D03 | PARTIAL_FRESH | Unchanged DashboardError/loading/empty contracts, allSettled summary; no forced one-panel runtime failure injection |
| C01 | PARTIAL_FRESH | ui-proof-1790627215741/results.json; original field/validation/lifecycle code retained; no new client Save test |
| C02 | PASS | browser-final-smoke.json; route-smoke zero POST; report-downloads4 previews |
| R01 | PASS_WITH_LIMITS | fresh picker retention + nine real form/export flows; canonical input parsers unchanged |
| R02 | PASS | browser-oracle.json; report-downloads-4/results.json |
| S01 | PARTIAL_FRESH | four-role read smoke; saved-out-of-page/archive handling source unchanged; not every edge re-exercised |
| S02 | PASS_WITH_LIMITS | selection-proof.json; changed-payload UUID path source unchanged, no separate fresh run |
| S03 | PASS_WITH_LIMITS | selection-proof.json; dirty hook fresh client/matter proof; original explicit reload retained |
| E01 | PARTIAL_FRESH | shared CSS + original fields/errors/lifecycle; representative dirty/focus/axe; not exhaustive every editor Save |
| A01 | PASS_WITH_LIMITS | fresh global/modal read; filters/query/types unchanged; typed synthetic exports |
| A02 | PASS_WITH_LIMITS | ui modal Escape/opener + audit-download4; no full fresh Tab-trap cycle claim |
| P01 | BLOCKED | font-probe-static.pdf; font-probe-static-decoder.json; font-baseline-comparison.json |
| P02 | PARTIAL_BLOCKED_TEXT | nine saved families and variants; full independent Arabic decode incomplete due P05 |
| P03 | PARTIAL_BLOCKED_TEXT | audit-download4; render-edges; P05 prevents exact Unicode pass |
| P04 | PASS_VISUAL_SAMPLE_WITH_LIMITS | pdf-inspection/results.json; visual-inspection.json; no every-page visual claim |
| P05 | BLOCKED | known-input exact search/copy failure; pending manual viewer result |
| X01 | PASS | report-downloads2/3/4 exact full workbook checks; render-edges typed envelopes |
| Q01 | PASS | build log; final-check.json; permissions-result.json; pristine-gates.json |
| Q02 | PASS_STRUCTURE_WITH_LIMITS | request-scoped cache, server paging unchanged; browser route timings; no SQL trace benchmark |
| U01 | PASS_WITH_LIMITS | 27 viewport scans; native200%zoom; representative keyboard/focus, not universal keyboard coverage |
| U02 | PASS_REVIEWABLE | final screenshots and original nested designs; density/layout adaptations documented |
| U03 | PASS_WITH_LIMITS | axe scans no violations; no screen-reader or full-conformance claim |
| B01 | PASS_WITH_LIMITS | 71-route read smoke; canonical preserved business guards/fields; limited writes explicitly recorded |
| B02 | PASS_WITH_LIMITS | fixture-reconciliation.json; one completed-unsaved export and preview response metadata omission retained |
| Z01 | PASS | owner-preservation.json; protected-preservation.json; owner-runtime-final.json |
| Z02 | PASS | app-cleanup.json; fixture-cleanup.json |
| Z03 | PACKAGE_GATE | sealed five-file verifier and receipt; candidate remains BLOCKED |
