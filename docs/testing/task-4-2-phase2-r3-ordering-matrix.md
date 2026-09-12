# Task 4.2 Phase 2 — R3 nullable order verification matrix

12 September 2026. Parent `4aee985dabc01db7142fe08bdc2b4fa9d83ba049`.
See the [follow-up report](../task-reports/2026-09-12-task-4-2-phase-2-r3-ordering.md).
An external initial matrix preceded edits/tests; this is the final evidence index.
Phase 1 acceptance remains valid. Phase 2 is not accepted.

| Requirement | Result | Exact evidence |
| --- | --- | --- |
| Unchanged parent reversals | Reproduced, four expected failures | `reproduction-1/browser-results.json`, both roles, side change and Add |
| Mixed/NULL, all-NULL, numbered/empty destinations | PASS, 24 cases | `fixed-1/browser-results.json`, both directions and Add, both roles |
| DOM/save/reload/detail order and identities | PASS | Exact IDs, sides, ordinals, names, gender, capacities and untouched group assertions |
| Unchanged-null/same-side save | PASS, four complete no-ops | All table digests, complete sequences/catalogs equal |
| R1 lawyer/capacity A/B/A | PASS, four complete no-ops | Established browser assertions reused on nullable relationships, both roles |
| Unrelated scalar edits | PASS, both roles | Party/capacity IDs and nullable positions exact |
| Within-side movement and validation recovery | PASS, both roles | Boundary buttons disabled; keyboard movement, retained draft/order, feedback focus, exact save |
| RTL/labels/keyboard/320px/actual 200% zoom | PASS | Six zero-violation scans; six screenshots, three visually inspected; no speech |
| Production build and source provenance | PASS | `fixed-1/production-build.log`, inventories and `final-source-evidence.json`; 181 critical dependencies |
| Controlled setup/historical invariants | PASS, both fixtures | 15 setup checks and 125 final checks per run; exact owned restore/delta/rollback |
| R2/migration/permissions/concurrency and unaffected behavior | Qualified reuse | `reuse-map.json`, 296 unchanged dependencies; prior artifact identities verified |
| Repository static gates | PASS | `static-final.log` |
| Real migration-63 database, logos, prior evidence and owner app | PASS | `preservation-comparison.json`; full fresh before/after captures, only existing runtime.log exclusion |
| Scoped cleanup | PASS | Per-run cleanup plus `cleanup-final.json`; no broad deletion |
| Commit, patch, ZIP and receipt | Verify at export | Separate receipt: sole parent, exact scope, reverse check, unique membership/sizes/hashes |

The original and previous correction report/matrix bytes are wholly unchanged.
All migration files, schema/gateway, decisions, governance, checkbox lines and
Phase 1 acceptance are preserved. Stop at independent follow-up review.


## Owner acceptance addendum — 12 September 2026

Khaled Helmy explicitly accepted Task 4.2 Phase 2 at
`6771218164c992781902374efb62f0b2f54b2a20` in the direct implementation mandate.
The final R3 independent PASS review is preserved byte-for-byte at
`docs/reviews/2026-09-12-task-4-2-phase-2-r3-ordering-independent-review.md`
(9,907 bytes; SHA-256 `3d7ed89346e8831a9b1280e9ccc37cbb7d0624a832910a0ae3d5e1aaeda27de5`).
R1–R3 are closed. The original matrix above is an exact historical prefix.
This acceptance is recorded in the single authorized Phase 3 implementation
commit. Phase 1 acceptance stands; Phase 3 and overall Task 4.2 acceptance
remain pending independent review and owner decision. The actual database
remains at 63, with accepted migration 64 pending; no publication or deployment
is claimed. D58 records the separately approved matter lifecycle contract.
