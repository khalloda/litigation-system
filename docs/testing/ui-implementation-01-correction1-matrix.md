# UI Implementation 01 correction 1 — evidence matrix

Overall: **BLOCKED_NOT_COMPLETE**. Package integrity is separate from feature acceptance. Evidence paths are relative to `test-results/ui-implementation-01-correction1-20260929T062959Z`. Final application build: `fnwn1IKUwe0XBh2wyb_8e`.

| ID | Result | Evidence and scope |
| --- | --- | --- |
| I01 | PASS | input-verification.json; original-delivery-verification.json. Verified 1036 handoff members, 955 identities/953 bodies; D59 bodies omitted. |
| I02 | PASS | owner-before-summary.json; owner-runtime-before.json. Fresh protected baseline; actual owner listener/build identified. |
| I03 | PASS | route-coverage.json; route-smoke.json. 71 routes and 23 contextual audit families retained. |
| F01 | PASS_WITH_REUSE | final-states2/states.json; source-reuse-map.json. Actual custom Noto 400/600/700 platform fonts proven via CDP. Original licensed bundled assets unchanged. |
| F02 | PASS | final-visual/comparisons; visual-checkpoint.json. Six real type roles, measured 80px header/96px rail, logical layout and control hierarchy. |
| N01 | PASS | browser-final-smoke.json; ui-last-proof2.json. Four genuine roles, all permitted navigation; mobile Enter/Escape and focus. |
| N02 | PASS_WITH_REUSE | permissions2-result.json; browser-final-smoke.json; source-reuse-map.json. Complete fresh permissions plus genuine direct forbidden edit routes. Original unchanged lifecycle invariants retained. |
| M01 | PASS_WITH_REUSE | final-navigation.json; source-reuse-map.json. Page2 canonical filters preserved; unchanged query normalization/input/paging logic. |
| M02 | PASS | final-navigation.json; ui-proof-1790672163170/results.json. Desktop/mobile list-selection-full-record-return exact filter/page/scroll/focus; Back/Forward/reload; bounded 24h ten-entry UI-only session storage. |
| M03 | PASS_WITH_REUSE | final-visual/53-2-full.png; route-smoke.json; source-reuse-map.json. Complete multiline subject/case in result and reading pane; all secondary fields/actions in canonical full record. |
| D01 | PASS_WITH_REUSE | semantic-checks/results.json; source-reuse-map.json; final-visual/65-5-full.png. Fresh six semantic suites; existing Today boundary fixtures/source unchanged. Two real rows initially, expansion preserves 25/full links; actual today empty. |
| D02 | PASS | semantic-checks; ui-last-proof2.json. Full-data independent outcomes and exact chart/table values; unchanged Cairo/unknown/ties/overlap contracts. |
| D03 | PASS | final-navigation.json; final-navigation-one-panel-failure.png. Real isolated matter_lawyers grant denial/recovery; analytics refresh/retry keeps validated view; unrelated panel remains; full state unchanged. |
| C01 | PASS_WITH_REUSE | forms-proof2.json; final-states2/71-214.png; browser-final-smoke.json. All fields/actions retained; required-name reject, genuine edit+restore, dirty discard; unchanged broader lifecycle invariants retained. |
| C02 | PASS | final-visual/65-8.png; browser-final-smoke.json; readonly-window.json. Context name/ID, nine catalog links, prefill/navigation has no report generation. |
| R01 | PASS | report-downloads-4/results.json; report-downloads-5/results.json; ui-proof-1790672163170/results.json. Nine real parameter forms, independent previews, searchable selected ID retained, all defaults/values preserved. |
| R02 | PASS_WITH_REUSE | browser-oracle.json; report-downloads-5/results.json; source-reuse-map.json. All active remains default; two modes exact 38/10 status and 36/10 matters; no fixed limit. Incomplete backend gate source-bound. |
| S01 | PASS_WITH_LIMITATION | selection-proof.json; selection-readonly5.json. Actual out-of-page saved hearing/date/decision, read-only and archived controls. Existing out-of-page fallback lacks court/action metadata; its unavailable fields use generic missing display, not an extra backend fetch. |
| S02 | PASS_WITH_REUSE | selection-proof.json; fixture-reconciliation.json. Explicit/no-op saves, completed identical retry and changed-payload UUID; pending fieldset contract retained. |
| S03 | PASS | selection-proof.json; workflow-comparisons. Two-tab stale and both before/after dispatch failures preserve draft; established outcome before retry; explicit discard page navigation. |
| E01 | PASS_WITH_REUSE | forms-proof2.json; selection-readonly5.json; ui-proof-1790672163170/results.json. Client/matter reject+save+restore and actual archive/restore confirmations. Unchanged shared lifecycle invariants retained. |
| A01 | PASS_WITH_REUSE | final-states2/71-407.png; route-coverage.json; source-reuse-map.json. Whole event field tables, all filters and 23 subject families retained; UTC not silently changed. |
| A02 | PASS | audit-download-4/results.json; ui-proof-1790672163170/results.json. Admin without separate capability: 403 with zero event; genuine authorized exports; Escape/return, native modal semantics maintained. |
| P01 | BLOCKED | pdf-diagnostics/decoder.json; manual-viewer-observation2.json. Actual Chromium text shaping/rendering investigated; exact Arabic search/copy fails. No font-only or universal viewer root-cause claim. |
| P02 | PARTIAL_BLOCKED_BY_R4 | report-downloads-4; report-downloads-5; pdf-inspection/results.json. 14 saved ordinary variant PDFs; preview/XLSX exact against oracle. Full independent Arabic PDF field/order fidelity not established. |
| P03 | PARTIAL_BLOCKED_BY_R4 | audit-download-4; render-edges; pdf-inspection. Genuine capability-authorized output and typed long/null/empty/absent/space/redaction probes. Arabic PDF Unicode fidelity remains blocked. |
| P04 | PARTIAL_BLOCKED_BY_R4 | pdf-inspection/results.json; visual-inspection.json. 17 PDFs, 126 pages, landscape/portrait, 49-page largest, 23-page audit stress / 6-page card stress; representative visual pages only. No every-page/content fidelity claim. |
| P05 | BLOCKED | pdf-diagnostics; manual-viewer-observation1.json; manual-viewer-observation2.json. PyMuPDF exact hamza/diacritic search fails; Acrobat Pro 2022.003.20282 copied first row with spaces/order changes. Search success owner-reported generally, both terms not individually confirmed. |
| X01 | PASS | report-downloads-4/results.json; report-downloads-5/results.json; render-edges/results.json. All 14 ordinary XLSX exact typed values/order/RTL; audit typed numeric/null/space/redaction probes; unchanged Excel typography. |
| Q01 | PASS | final-check.json; permissions2-result.json; pristine-gates.json. Final production build/full check; complete permissions; pristine 148+15 gates and equality. |
| Q02 | PASS_WITH_LIMITATION | browser-final-smoke.json; semantic-checks; source-reuse-map.json. All six queries unchanged, no eager duplicate aggregate introduced; one authorized client-context read added to catalog. Actual request durations retained, no benchmark guarantee. |
| U01 | PASS | ui-proof-1790672163170/results.json; final-navigation.json. Actual200%zoom,390/320 reflow, keyboard focus/modal recovery; no whole-page overflow. |
| U02 | PASS_WITH_LIMITATION | final-visual/comparisons; final-states2/comparisons; workflow-comparisons; visual-inspection.json. All unique reviewed views and captured important real states compared. 47:2/3 live unavailable, verified portable references used. No-op asserted behavior, no separate no-op screenshot. |
| U03 | PASS_WITH_LIMITATION | ui-proof-1790672163170/results.json; final-states2/states.json. 35 checks, automated axe/labels/status/errors/focus; screen-reader speech excluded; no universal conformance claim. |
| B01 | PASS_WITH_REUSE | route-smoke.json; browser-final-smoke.json; source-reuse-map.json. 71 routes, shared-only modules retain unchanged workflows; full real forms tested where affected. |
| B02 | PASS | fixture-reconciliation.json; append-only-reconciliation.json; readonly-window.json. 111 events, 30 saved exports, 14 previews, 1 failed generation without completed export; exact authentication and fixture modifications. |
| Z01 | PASS | owner-preservation.json; protected-preservation.json. Owner 145 tables / 48 sequences / all 1052 audits exact; migration 75 / TASKS 86/governance and config unchanged. |
| Z02 | PASS | app-cleanup.json; fixture-cleanup.json; copy-cleanup.json. Exact owned resources removed; previous evidence/recovery preserved. |
| Z03 | PENDING_SEAL | final-git.json; package-result.json. Local ordered children only; final package verifier and receipt-inclusive reopen reported separately; integrity pass is not acceptance. |

Original matrix and failures are retained unchanged. The separate final receipt/verifier resolves Z03 after the documentation commit; this table does not claim a precomputed package seal.
