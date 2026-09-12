# Task 4.2 Phase 2 — final acceptance matrix

Base: `2f8820a3053ab65a60ee183882cbd6a2462559bc`. This is local implementation
verification for independent review, not owner acceptance of Phase 2 or Task 4.2.
Evidence paths are relative to the external `task42-phase2` directory identified
in the [implementation report](../task-reports/2026-09-12-task-4-2-phase-2-matter-editing.md).

The initial matrix was saved before application edits/tests/database execution
at `2026-09-12T08:30:41.7341663Z`, SHA-256
`d1e9beca0ad5dd2e6cd33142307e6f5c02276dce5df97959cb96009c2b67e634`.
Its original requirement IDs remain below. Source assertions are included as
postimages; attempt logs retain unsuccessful runs and cleanup outcomes.

| ID | Requirement | Actual evidence / result |
| --- | --- | --- |
| P1 | Phase 1 acceptance, exact review and sole implementation commit | Review byte/hash identity in report; acceptance addenda and checkbox comparison; post-commit delivery receipt |
| P2 | Real source at 63 and owner runtime preserved | Complete `source-before/after.json`, `live-before/after.json`, `protected-before/after.json`, `runtime-before/after.json`; exact `preservation-comparison.json`. Exclusively locked owner `runtime.log` content excluded explicitly |
| D1 | Immutable original boundary and exact allowed upgrade | `browser-2/migration-catalog-delta.json`, `results.json`; original four-table projection checks; `canonical-3` rollback and 107 canonical invariants; historical 125 before/after in `proof-10` |
| D2 | Native provenance and imported/released evidence | `proof-10/adversarial-results.json`, before/after historical invariants; supplemental released-matter edit and full immutable/current boundary assertions |
| D3 | Narrow runtime and current account/permission contract | Fresh permission matrix at 64; `proof-10` expired/forced/stale-role/version denials and raw runtime write refusal; supplemental gateway account-state and observed revocation checks; full authorization/audit static gates |
| D4 | Atomic aggregate versions and retained child identities | `proof-10/overlap-update-outcomes.json`, `adversarial-results.json`; observed locks, one winning update, reordered/retired/restored same IDs, zero-change no-op, injected audit failure rollback |
| D5 | Exact scoped submission identity and uncertain response | `proof-10/overlap-create-outcomes.json`, exact replay/conflicting payload assertions; supplemental full table/sequence/catalog and exact audit/receipt counts; final browser lost-success-response retry |
| V1 | Strict nullable/text/date/decimal contract | Parser duplicate/unknown/protected/oversized/File assertions; native/imported saves; measured `existing-field-lengths.json`; supplemental long mixed text, null/empty/omitted values, exact signed decimal and leap date; browser validation draft/focus retention |
| V2 | Fixed client and archived/null association | Reparent forgery refused; `proof-10/client-archive-overlap.json`; observed archive/save lock race and existing archived-client edit; exact D52 82/378 read proof |
| V3 | Independent lookups/default/compatible branches | Service/gateway default and independent selection checks; missing/null/inactive-selection supplemental checks; incompatible branch refusal and unchanged branch/source reconciliation |
| V4 | Ordered parties/capacities/lawyers and eligible IDs | `proof-10` several capacities, all lawyer roles, lead swap, removal/restoration and duplicates/foreign/nonexistent IDs; supplemental actual foreign-row substitution; browser keyboard reorder and all role labels |
| U1 | Guarded form/action and usable recovery | Final browser create/edit/save/cancel/validation/uncertain response/stale reload for Administrator and Assistant; read-only-role controls/direct pages/forged action denial; production mirror build and own generated client |
| U2 | Preserved list/detail/client return context | Fresh all-record read oracle and `browser-2` role/archive/navigation results; editor cancellation and successful return preserve filter/page; stale/invalid form retains input |
| U3 | Arabic/RTL/focus/labels/reflow/genuine zoom | Final browser scans and complete screenshots, real extension-driven 200% tab zoom, 320 CSS pixels, focus/alert assertions. Representative desktop/reflow/zoom screenshots inspected. Speech excluded entirely |
| R1 | Real volumes and bounded behavior | Exact 1,744 imported identities, every detail scalar/ordered child and every page for four roles; normalization/literal J, all lookup choices, combined filters; 82/378 sets with intentional fixture native rows separate; local query plans and action timings |
| R2 | Required safety gates and checkpoint controls | Complete static aggregate/self-tests; fresh 15 setup and 448 permission decisions, 125 historical and 107 canonical invariants. Negative boundary fixtures reject disabled guards and altered function search path |
| R3 | Honest reuse and failed attempts | `reuse-map.json`: exact prior inventories/artifact hashes and current dependency comparisons; all original migration files unchanged; numbered failed logs plus successful affected reruns; no claim of fresh old durability permutations |
| E1 | Cleanup and exactly one local commit | Per-attempt isolated cleanup logs, browser cleanup receipts, scoped task-cache recovery receipt, final cleanup/preservation and post-commit receipt; exact sole parent and clean main two ahead/zero behind recorded fetched checkpoint |
| E2 | Independently reviewable delivery | Full-index binary patch and reverse check; exact changed-file/per-file statistics, source postimages, reports/matrices/assertions/logs/screenshots; reopened ZIP exact membership/hash/size verification and separate manifest/receipt identities |

Migration 64 remains pending on the real database. Overall Task 4.2, later matter
archive/restore and subsequent task checkbox states remain unchecked. Phase 1 is
owner accepted; Phase 2 stops for independent review. No push, deployment, real
data write, owner-runtime operation, subagent or speech action is included.

The final run index, exact preservation result and artifact identities are
recorded in the post-commit delivery receipt. Reused tests retain their original
dates; changes to shared checkpoint/schema/audit dependencies are covered by fresh
64 invariant, permission and static checks rather than described as unchanged.

Final fresh successes: `proof-10`, `canonical-3`, the exact read/archive portion
of `browser-2`, focused editor `browser-5`, `supplemental-1`, `measure-1`,
`input-envelope.log`, `static-final.log`, `final-affected-2.log` and
`encoding-final.log`. Supplemental proof passes all 125 final historical
invariants; canonical proof passes 107. Final preservation compares every value
in all four complete receipts: 109 tables, 48 full sequences, 54 logos, 3,428
protected entries and 40,571 runtime entries, with no value normalization.
JSON object serialization order can differ; all decoded keys and values are
compared. The explicitly excluded active owner log remains excluded on both sides.
