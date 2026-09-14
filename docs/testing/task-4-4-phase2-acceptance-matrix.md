# Task 4.4 Phase 2 acceptance matrix

Owner-authorized bounded implementation over `fbf47d7fc0e5a1405a8798838243289d2d31898f`.
Prepared 14 September 2026 before mutation/browser testing; completed after execution.
Implemented, pending independent review; not activated/pushed. Overall Task 4.4 remains unchecked.

Evidence paths below are relative to
`D:\Projects\LitigationData\review-evidence\task44-phase2-20260914`.
The [implementation report](../task-reports/2026-09-14-task-4-4-phase-2-editing.md)
explains source reuse, failed attempts and limits.

| Area | Executed result | Evidence |
| --- | --- | --- |
| Preservation | PASS: all 119 actual tables, 48 individual complete sequence vectors, sequence/catalog digests; 54 logos, 166 original evidence files, protected configuration and stopped accepted owner app preserved | `actual-before.json`, `run07/actual-after.json`, `preservation-cross-window.json`, `preservation-before.json`, `preservation-after.json` |
| Foundation | PASS on fresh full-state copy: 131 baseline checks, forced late migration rollback equality, migration 68, 135 checks; four new permanent checks preserve original reconciliation separately from current state | `run05-console.log`, `run05/invariants67.log`, `run05/deploy68.log`, `run05/invariants68.log`, `run07/invariants68-final.log` |
| Authority | PASS: three writers create/edit both types; Lawyer refusals; four-role reads; disabled/stale/expired/must-change/invalid staff/audit actor; direct runtime and internal gateway bypass denied | `run05/mutation-results.json`, `run05/adversarial-results.json`, `run07/browser/browser-results.json`, `run07/permissions.log` |
| Fields | PASS: all 13 task and 4 step fields; omission/NULL/clear; Unicode/multiline/date exactness; retained inactive references; legacy description gap; completeness; strict excluded/extra fields and bounds | `run05/mutation-results.json`, `run05/adversarial-results.json`, exact proof sources |
| Parent/order | PASS: explicit unassigned task, fixed task/step parents, archived matter gate, archived client allowance, active eligibility, imported ordinals and separate stable native append through paged production reader | `run05/mutation-results.json`, `run05/adversarial-results.json` |
| Safe save | PASS: exact owned retry, altered/foreign token refusal, aggregate conflicts, complete no-op equality, failed update rollback, failed insert with exactly one disclosed sequence reservation | `run05/mutation-results.json`, `run05/adversarial-results.json`, `run07/browser/browser-results.json` |
| Races | PASS with observed lock overlaps and precise error codes: task/task, task/step, account revocation, staff deactivation, lookup deactivation and matter archive | `run05/adversarial-results.json`, `scripts/lib/admin-edit-adversarial.ts` |
| Invariants | PASS: original provenance, parent/ordinal/current-history corruption and dropped uniqueness/check constraints rejected; final state and shared checks pass | `run05/adversarial-results.json`, `run07/invariants68-final.log`, `check-final.log` |
| Search | PASS: independent R1 oracle, twelve candidates, four roles, Western/Arabic-Indic digits, complete IDs/counts across pages/filters, exact negative controls | `run05/green-results.json`, `run05/id-candidates.json`, `scripts/lib/admin-work-id-search-proof.ts` |
| Browser | PASS on final production build: task/step create/edit/cancel/save/validation/conflict, all roles, lost-response retry, return context, RTL, keyboard/focus, scanner/targets, 320px reflow and genuine 200% zoom; screenshots visually inspected | `run07/browser/browser-results.json`, PNGs/zoom receipts, `production-build.log`, `production-build-identity.json`, `browser-cleanup.json` |
| Gates | PASS: final type/lint/format/encoding/RTL/permission/source controls; 448 permission decisions and negative controls; 12 parser + 10 guard cases on separate empty owned cluster | `check-final.log`, `run07/permissions.log`, `guard/guard.log`, `guard/isolation.json`, `guard/cleanup.json` |
| Source binding | PASS: frozen execution; final code equals final runtime manifest; backend reused from exact unchanged `run05` code and data; editor predecessor reconstructed/hashed, exact old driver supplied | `run07/executed-source.json`, `run07/source-binding-pass.json`, `run07/reused-backend-binding.json`, `source-closure.json`, `recovered-run05/` |
| Cleanup | PASS: owned mirrors/listeners and isolated containers/volumes/networks removed; no dump file; pre-existing Docker resources unchanged | `run07-console.log`, `run07/browser/browser-cleanup.json`, `guard/cleanup.json`, final delivery receipt |
| Protected sources | PASS: AGENTS/CLAUDE, D1–D61, all 86 checkbox lines, migrations 1–67, supplied attachments and verbatim publication PASS preserved | `protected-source-pass.json` |
| Delivery | Exact local commit, patch/reverse check, complete committed tree/source, ZIP/external manifest and independent reopening verification are bound in the external final receipts, produced after this document is committed | `candidate/`, `task44-phase2.patch`, `task44-phase2-review.zip`, `package-manifest.json`, `package-verification.json`, `delivery-receipt.json` |

`run05` is newly executed final backend evidence. `run07` is newly executed final
browser/build, final invariants and permissions evidence with guarded exact-source
backend reuse. `run06` also passed completion gates before the final instruction
visibility correction. Historical broad read/layout evidence is retained supporting
context, not relabelled as a new execution. Failed attempts remain documented in
the report and package; broad `run03` rejection assertions are not relied upon.

No source step had both result and report missing; the incomplete-step edge case
was a labelled scalar fixture. Canonical empty replay, screen-reader speech and
full accessibility conformance were not tested. Dependency binding covers the
lockfile and 25 declared metadata files; generated/build bytes are represented by
manifests, not supplied runtime trees. No new exports, archive/restore implementation,
actual migration/activation, remote push, PR or later task is included.
