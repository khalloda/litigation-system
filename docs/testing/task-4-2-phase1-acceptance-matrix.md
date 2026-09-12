# Task 4.2 Phase 1 — final acceptance matrix

12 September 2026. Phase 1 locally verified; independent review and owner acceptance pending.
The immutable external initial matrix and its identity are recorded in the
[phase report](../task-reports/2026-09-12-task-4-2-phase-1-read-only-matters.md).
All paths below are relative to the external Task 4.2 evidence root.

| Requirement | Actual proof / evidence | Outcome |
| --- | --- | --- |
| Current source and isolated full-state restore | `source-before.json`, `live-before.json`, `proof-attempt-3/restore-equivalence.json`, `isolation.json` | PASS: current 63; complete rows and reviewed portable equivalence |
| All records, ordered details, explicit unassigned and missing fields | `proof-attempt-3/matter-service-results.json`; independent source-field/lookup/relationship oracle in `scripts/test-matter-read-only.ts` | PASS: 1,744 / 1,000 unassigned / 312 multiline / 42 multiple-capacity / 224 multiple-lawyer |
| Alias/normalization/literal J/search/filter bounds, distinct paging | Same service proof; 23 inputs, 404 choices, combined/null filters and page limits | PASS |
| D52 new service integration | Same service proof: client IDs 12 and 111, 82/378 exact records/content, all four roles active/archive/restored; rejecting exclusion counterexample | PASS |
| D52 browser integration and client/logo reads | `browser-attempt-4/browser-results.json` and exact row text/identity assertions | PASS: archive/navigation run 4; final states/rendering run 7 |
| Direct list/detail/client returns and paging | Browser navigation assertions including two-way client links | PASS: archive/navigation run 4; final states/rendering run 7 |
| Independent authorization; expired/unusable sessions; parameter tampering | `proof-attempt-3/permissions-isolated.log` and matter service denied-before-read assertions | PASS: unchanged 448-decision matrix; guarded pages and services |
| Production build and source/dependency isolation | Production build logs, `build-source.json`, `browser-cleanup.json` | PASS: final run 7 build/source hashes, 35,003 dependency records unchanged, listener/fixture removed |
| RTL, mixed text, keyboard/focus, contrast, labels, AX status/error, empty/loading/query error/retry, 320 CSS px, genuine 200% zoom | `browser-final-7/` JSON/screenshots; 17 scans plus 27 scans in run 4; actual AX tree and extension-driven tab zoom | PASS: archive/navigation run 4; final states/rendering run 7; speech excluded |
| Static gates and checker self-tests | `static-attempt-2.log`, `static-final.log`; final affected typing/lint/format/RTL/audit checks | PASS aggregate and final affected checks |
| Current profile invariants/setup | `proof-attempt-3/database-invariants.log`, `database-setup.log` | PASS 121 / 15 |
| Bounded performance | `proof-attempt-3/matter-query-plans.json`; list/detail each three business queries in one snapshot, no per-row application query | PASS local plans; no production latency claim |
| Unaffected regressions | `reuse-map.json`, exact archived inventory/artifact SHA-256 values | Historical reuse: unchanged mutations/auth/audit/storage; changed navigation and inventories tested fresh |
| Complete live/project/backup/logo/governance/runtime preservation and cleanup | Final preservation comparison plus per-attempt cleanup receipts | PASS: full source/live equality; 3,260 protected and 2,161 supplemental runtime records exact |
| Delivery | One local commit, exact parent/subject/scope; patch reverse-check; ZIP manifest exact members including separate manifest hash | Verified by the separate post-commit delivery receipt; no push or later phase |

The overall Task 4.2 checkbox remains unchecked. Local verification is not
independent review, owner acceptance, live activation or production deployment.
