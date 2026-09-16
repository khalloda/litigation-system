# Task 4.5 — published checkpoint and correction readiness

Reviewed 16 September 2026 in the existing ChatGPT review task.

**Disposition: artifact/source checks and the supplied state comparisons pass; T45-A1 remains open and is authorized for correction.** This is a bounded readiness review for the combined correction/activation/publication handoff. It is not a new Windows execution, a fresh observation of GitHub or the owner app, or advance independent acceptance of code that has not been written.

The owner subsequently instructed: “OK, proceed to fix, complete and close T45 including migration, acceptance, activation and publication”. The accompanying mandate authorizes that combined outcome in the same local Codex Desktop task. The independent correction/closure/activation/publication review follows its delivery here; no additional intermediate owner approval is requested for the stated scope.

## Verified checkpoint and delivery

| Item | Independently checked result |
| --- | --- |
| Documentation/publication commit | `cd89148d546bca61f2f0243cc433adcb7b4d2d7a` |
| Sole parent | `e4806160bf70184526e3a8bc10e18b0d7e6f953f` |
| Tree | `dc1711618688e84047c9153cd62307852f39631e` |
| Commit scope | Eight documents, +409/−22; 699 other existing paths unchanged |
| Source inventory | 705 parent paths; 707 child paths |
| Checkbox change | Only Task 4.5 unchecked→checked; the other 85 lines preserved |
| Historical matrix | Original 6,041-byte prefix preserved |
| Imported correction review | Exact 11,279-byte independent PASS review preserved |
| Complete outer archive | 5,124,835 bytes; 27 members; all 26 receipt artifacts supplied |
| Outer SHA-256 | `a5b1c96dfceccf77780d7cc366ea389a0cae8f292a00f6067639c45d897c328a` |
| Inner archive | 1,051 members; 1,812 verified logical catalog mappings |

All archive paths, exact membership, CRCs, sizes and SHA-256 values were checked. Separate report/patch/receipt/publication/documentation copies match their packaged counterparts. Both separate final verification/exclusion results identify the same verified outer archive. Earlier input packages remain available. No required review attachment is missing.

After inspecting the supplied standalone verifier, the reviewer ran it successfully in a task-owned temporary reconstruction. Both raw commit identities, recursive trees and supplied blobs passed, along with forward/reverse application of the exact patch and both complete index-tree identities. There are 703→705→703 supplied source bodies; the two unchanged D59-bearing bodies, `.env.example` and `docker-compose.yml`, are deliberately opaque. Their Git identities are verified unchanged; their private contents and the full local 705→707→705 execution remain outside this review.

## Supplied operational evidence: independently recomputed portions

The reviewer compared the supplied JSON snapshots rather than relying only on their PASS labels:

- All 124 captured old-column projections match from the migration-69 source to actual migration 70.
- All 48 captured full sequence states and sequence metadata match. Captured account and role snapshots also match.
- The only changed old full-table digests are `powers_of_attorney`, `power_of_attorney_lawyers`, `audit_event_fields` and `_prisma_migrations`; all other old table digests match.
- Four new private POA tables are present. The import inventory contains 839 entries, the boundary contains one row, and new change/submission tables are empty. Initial POA and link flags are consistent with the reviewed migration.
- The rehearsal and actual portable catalog representations match. This does not claim equality of every raw cluster-specific catalog field.
- The complete supplied anonymous before/after snapshots match, and the complete supplied authenticated before/after snapshots match: each contains 128 tables and 48 sequences.
- Migration 70 remains the reviewed 36,411-byte file, SHA-256 `58bc280c9697b46936cc93263b68a48a4907b9a06c11d6dcefe161a6ba916955`.

These are independent comparisons of supplied observations, not independent database capture. Private backup bytes, credential values, underlying owner data and the live Windows system were not accessed here.

## Reported Windows outcomes and their limits

The supplied command records show exit status 0 for the actual and final isolated invariant/setup runs; the invariant logs explicitly end with “All 141 checks passed.” The implementer reports 15 setup checks, the protected recovery/restore rehearsal, fixture mutation/browser success, and owner preservation. No such application, SQL or browser suite was rerun by this reviewer.

The publication receipt reports one ordinary non-forced push of `8c0cdf1 → e480616 → cd89148`, with fresh remote equality at 08:40:52 UTC on 16 September. The runtime receipt at 08:41:27 UTC reports migration 70, no unfinished migration, PID 21700 and build `lMSctpvPZP2Yn99F0XmmD` from source e480616, served on loopback port 3000. These are dated reported observations; Desktop must refresh them before changing the app.

Actual authenticated observations are a contemporaneous summarized browser record, not an exported raw DOM/HAR archive. They report an existing legitimate Administrator session, no login or business submissions, and the filter defect below. Actual restore was not exercised because there was no archived owner POA. Isolated restore proof is explicitly separate. Historical 448 permission decisions, 123 canonical checks, full backend/concurrency/corruption/retry results and the independently closed T45-R1/T45-N1 correction are reused with source bindings.

## T45-A1 — SHOULD FIX: clearing filters can leave stale selections

Affected source: `src/app/powers-of-attorney/page.tsx`, list-filter form. Verified source SHA-256: `933b66e866db064b3ebb384d324178a1d67191fc28fba403a0ac4fa47e3f1c36`.

The GET form uses uncontrolled `defaultValue` inputs/selects and a Next `Link` to clear the URL. The form has no navigation-derived identity or explicit control-state synchronization. This source structure supports the reported browser defect: after starting at `?client=325`, Clear changes the URL and results to the default list while the client control can still show 325. A subsequent Search may unexpectedly restrict the list again. This is misleading filtering, with no demonstrated business-data corruption or permission bypass.

The implementer reproduced client, report and archive selections. This reviewer inspected the source and evidence but did not independently reproduce the native browser behavior. Client325/two matches and the 752/697/55 population counts are dated observations, not fixed future test oracles.

The correction must keep URL, visible controls and results consistent for every POA filter. Include unsubmitted drafts while already at the bare URL, Clear followed immediately by Search, repeated Clear, and browser Back/Forward. A key based only on the URL can miss clearing drafts when the URL does not change. A form reset alone can restore the original filtered defaults. The implementer should choose the smallest maintainable solution and prove the complete behavior without changing query meaning, permissions or database state.

The local task checkbox is already checked under the prior owner acceptance. Preserve it and all 85 other checkbox lines. Record T45-A1 as corrected and locally verified only after the required tests pass; do not preclaim the later independent closure review.

## Next authorized operation

Follow `task45-a1-correction-closure-prompt.txt` in the SAME local Windows Codex task. Verify migration 70 rather than repeating an already applied migration. Correct and test the UI, accept the successful correction under the owner's instruction, activate its exact tested build, publish only the bounded correction/closure commits, and return complete evidence for independent review. Task 4.6, Ubuntu deployment and unrelated changes remain outside this mandate.
