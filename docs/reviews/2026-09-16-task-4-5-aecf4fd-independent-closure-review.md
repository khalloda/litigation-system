# Task 4.5 — independent correction, closure, activation and publication review

16 September 2026. Reviewed here against the approved T45-A1 mandate, the original readiness finding, the exact delivered source and the supplied operational evidence.

**Verdict: PASS. T45-A1 is independently closed. Task 4.5 is complete and accepted within the agreed local Windows development scope. No required review attachment is missing.** Findings: MUST FIX 0 / SHOULD FIX 0 / MINOR 0. The earlier T45-R1 and T45-N1 closures remain valid. Task 4.6 and Ubuntu deployment remain unstarted.

The owner already authorized and accepted this combined correction, activation and publication. This review completes the independent review gate; it does not perform another implementation, migration, activation, commit or push. Original reports describing independent review as pending remain accurate historical records.

## Exact reviewed chain

| Checkpoint | Commit | Tree | Tracked paths |
|---|---|---|---:|
| Published activation base | `cd89148d546bca61f2f0243cc433adcb7b4d2d7a` | `dc1711618688e84047c9153cd62307852f39631e` | 707 |
| Filter correction A | `b7fc7c7a6afc412ad5a8dc42d72ef2109380b1fb` | `ae3c76059ae3ac3463380c0cf1db1056dbab70aa` | 709 |
| Documentation closure B | `aecf4fd4bca22fe697f489a9827d6c46edb917fa` | `ece05a2dee8fa99781b529835d30f14d651411b4` | 711 |

Each child has exactly the preceding commit as its sole parent. Correction A changes four paths: the POA list page, the new filter-clear component, the new browser regression script, and its existing driver integration. Only two are production files. Closure B changes the eight authorized documents. Combined scope is **12 paths, +828/−10**; the other **699 existing base paths** retain their identities.

The entire 8,216-byte combined-matrix prefix and the 8,021-byte imported readiness review are exact. All **86 checkbox lines** are unchanged, including checked Tasks 4.4 and 4.5 and unchecked Task 4.6. Governance, D1–D64, schema, migrations 1–70, dependencies, query/service/mutation/editor behavior, strings and earlier reports remain unchanged.

## What was independently verified here

1. **Delivery integrity.** Reopened and checked every current outer and inner archive member for exact membership, safe unique paths, CRC, size and SHA-256: 33 outer members, all 32 receipt-listed artifacts, 1,192 inner members and all 2,761 catalog mappings. The final delivery-verification and exclusion-scan sidecars now bind this same archive. The second receipt is byte-identical to the first.
2. **Git and patches.** Rehashed the raw commits, recursive trees and supplied blobs; checked sole parents, exact changed paths and frozen paths. After inspecting the supplied verifier, executed its individual and combined forward/reverse patch reconstruction in temporary repositories. All supplied bodies reconstruct **705→707→709→707→705**, with complete index-tree identities also matching. The two unchanged D59 bodies are represented by exact opaque identities; the separate full Windows plaintext reconstruction is reported evidence.
3. **Correction logic.** Read the complete production change and regression source. Ran **17 offline control groups** using the exact click/effect callback bodies in a Node VM with explicit DOM/window mocks. These cover all six controls, repeated Clear, filtered versus bare URLs, modified clicks, ordinary editing, persisted history restoration, popstate, coalescing and cleanup. Only TypeScript annotations were erased. These are callback checks, not React rendering, native browser execution or a database test.
4. **Source and evidence bindings.** Rehashed 406 unchanged runtime/source bindings, compared 272 original backend dependencies to the original candidate, and rehashed 14 reused receipt files. Verified the final executed regression script against correction A and the captured browser driver/operation against the delivered helpers. All 248 file bindings across 16 operation directories match; 13 failed directories remain disclosed alongside the successful red and final green runs.
5. **Supplied state comparisons.** All 23 dated public owner-state samples compare equally, including five complete before/after pairs. Each has 128 table entries and 48 complete sequence vectors. There are **127 visible table digests**: the `user_accounts` digest is intentionally withheld, while its public account fields/count are supplied. Full account/credential equality remains an inspected Windows-helper/receipt claim, not a private-data calculation performed here. Recomputed all 70 completed migration checksums, retaining only the documented migration-33 newline exception; the historical rolled-back row remains separate and unfinished migrations are zero.
6. **Fresh publication observation.** Independently read GitHub `refs/heads/main` at **11:34:34.773–11:34:35.253 UTC on 16 September 2026**: it points to closure B. Fresh reads of A and B also match their exact supplied trees, parents and subjects. This independently corroborates publication, not the current cleanliness of the owner's checkout or continuous remote state.

Reviewer output files are `source-verifier-result.json`, `evidence-verification.json`, `offline-control-verification.json`, `sidecar-verification.json` and `fresh-remote-observation.json` in the accompanying reviewer package. The original supplied execution records retain their separate provenance.

## Why T45-A1 is closed

The original defect was that Clear changed the URL/results while an uncontrolled client selection could remain visible; Search then reapplied that stale value. The unchanged-build reproduction records client 325 with two results, Clear returning the bare URL and 752 results while retaining 325, then Search restoring the filter.

`src/app/powers-of-attorney/page.tsx` now keys the GET form by the received URL parameters. `poa-filter-clear.tsx` explicitly clears the search text and five selects, with `archive=current` and the other selects `all`. This handles unsent drafts even when the URL is already bare. It suppresses only the redundant same-URL navigation; a filtered URL still navigates normally. Modified-link clicks preserve normal behavior.

History restoration resets controls to that document's applied defaults. Ordinary edits do not trigger that reset. Listener and animation-frame cleanup are present. Search interpretation, result ordering, page size, authorization and persistence remain unchanged. The fix therefore addresses the original defect without changing POA business semantics.

The regression uses raw fixture rows to calculate expected IDs/counts rather than calling the production parser/list/query. It tests real Clear clicks, Search after Clear, unsent same-URL drafts, repeated Clear, filter intersections, missing/unknown options, both digit forms, pagination, Back/Forward and detail/editor/confirmation returns. The expected search normalization still uses the database's unchanged `ar_normalise`; this is not a wholly separate implementation of Arabic normalization.

## Windows execution evidence reviewed, not rerun here

The authoritative final run is `green-2026-09-16T10-30-05-929Z`. It reports **263 observations across four roles**: Lawyer 65, Administrator 67, Litigation Assistant 65 and Paralegal 66. This is an observation count, not 263 independent tests. Reported keyboard/focus and 320-pixel RTL checks pass, with zero external requests and page errors. Inspected the supplied narrow-screen Administrator image; it shows the archived fixture result and controls within the viewport.

The supplied command records and logs report **141 historical checks plus 15 setup checks** for the fresh owner backup boundary, the pristine restored copy, and the final disposable copy. The pristine result from the earlier red attempt is explicitly reused only after checking that the same dump/restored state and invariant sources match. Production build and project gates are recorded as passing. These suites were not executed on the reviewer's system.

Prior **448 permission decisions, 123 canonical checks**, backend/concurrency/corruption/retry proofs, the R1 native invalid-draft proof, and prior create/edit/archive/restore smoke are reused through the verified unchanged source boundaries. They are not fresh A1 reruns. Earlier harness, timing, artifact-selection and no-JavaScript attempts remain visible; the successful final run is bound to the final production source.

### Tested build versus activated build

The final disposable browser run used build `oOSSnbFyWjU2XcdrDJhei`. The stable activated artifact was freshly built from correction A as **`WvgH-6nuin9o1QPJrPst4`**. The two 709-path source inventories differ only in the regression script refined after the test artifact was built; its final executed bytes match the committed script. Application inputs match. All 60 generated-source inventory entries match between builds.

Against the supplied raw Git bodies, 699 accepted input fingerprints match directly and two PowerShell files match after the declared LF-to-CRLF conversion. Six unchanged historical Markdown working copies reportedly contain partial newline conversion; their exact working bodies are not supplied. Their raw Git bodies and unchanged identities are independently verified, while their Windows normalization check is attributed to the inspected helper. Two D59 bodies remain opaque. These historical documentation/private-body limits do not leave an unexplained application-source difference. Generated/dependency/compiled-artifact inventories are metadata; this review did not open the actual Windows installations or compiled files.

## Recovery, migration and activation

The supplied owner checkpoint remains cluster `7676117521894273062`, `litigation-db`, loopback port 5433, **migration 70**. The exact migration-70 SQL remains 36,411 bytes, SHA-256 `58bc280c9697b46936cc93263b68a48a4907b9a06c11d6dcefe161a6ba916955`.

**No owner migration was applied in this A1 run; no migration 71 was added.** This is correct for the authorized UI correction on an already migrated database. Fresh protected backup and distinct-cluster restore verification preceded activation. The helper checks a positively identified empty disposable target before restoring. It distinguishes restored logical sequence equality from restore-related WAL `log_cnt` representation; actual owner comparisons preserve all 48 full vectors.

Protected recovery is recorded at `D:\Projects\LitigationData\DB-Backup\migration63\pre-task45-a1-2026-09-16T09-28-44-446Z-ff80c725-d38e-4708-bce1-9f02556db846`. Dump SHA-256: `00d7fa9b83f2c3456951a6bcbd7ea1fd9703a4b538881c241b81d10bf7dd7f90`. Private manifest SHA-256: `5cd293093ec50fd12dbde0bc096568cd5dfe249779084cf5f9c64330b5a9ea95`. Private dump/configuration/role recovery bytes are intentionally excluded from this review.

The stable artifact is `D:\Projects\LitigationData\task45-a1-accepted-20260916T103752Z`. The operational receipts identify PID **67728**, loopback `127.0.0.1:3000`, correction-A source and build `WvgH-6nuin9o1QPJrPst4`. The final runtime receipt is dated **10:59:06.045 UTC** and reports the expected process/build, migration 70, no unfinished migration, 709 source files and 490 build files compared, Arabic login health and empty runtime stderr. The prior app was positively reidentified before replacement. These are dated supplied observations; current owner runtime health was not accessed here.

The legitimate existing Administrator observation runs **10:45:41.709–10:48:19.223 UTC**. Its 24 structured observations cover Clear→Search, same-URL drafts, history navigation, filtered returns, create/edit/archive Cancel and earlier-module reads. Independently matched all 15 recorded list observations to the separate supplied SQL oracle. The record is a structured transcription, not a HAR or independent browser replay. No new login or owner business submission is claimed. The authenticated and anonymous public-state pairs are exact; private credential comparisons are performed in memory by the supplied helper and reported as passing.

The protected-file receipt reports all 2,392 inventoried files exact from **09:32:26.577352 through 10:59:40.709590 UTC**, including earlier evidence/artifacts and protected inputs. It is a bounded inventory/window, not a claim that every filesystem byte or all earlier times was examined. Cleanup reports removal of identified disposable resources while retaining the owner container, accepted artifact, rollback artifact and backups.

## Publication and documentation closure

The inspected command ledger records one ordinary, non-forced push of explicit closure-B SHA to `https://github.com/khalloda/litigation-system.git`, `refs/heads/main`, from **10:58:10.137847 to 10:58:13.751679 UTC**. All recorded command exits are zero. The fresh pre-push remote is base cd89148; the outgoing suffix is exactly A then B. Recorded post-push local HEAD/origin/main/remote agree, clean 0/0. The separate fresh reviewer GitHub observation confirms the published tip and ancestry.

The documentation keeps the local acceptance, scope, evidence reuse, prior failures and outstanding independent-review gate distinct. It preserves original reports/matrix content and does not claim the historical Windows tests were rerun during documentation closure. No further acceptance commit or another push is needed to close this independent review.

## Retained limits

- **JavaScript disabled:** both unchanged and corrected browser evidence show the same streamed Arabic loading shell. Inspected both screenshots. GET form/anchor/default markup is retained, but usable visible interaction without JavaScript is not established. This is documented existing behavior, not a new correction regression or a claimed capability.
- **Actual restore:** there are no archived owner POAs, so actual restore was not exercised or fabricated. Disposable restore evidence remains applicable.
- **Private and local state:** no direct owner Windows/database/browser access here. Private credentials, full account digest, recovery contents, compiled binaries and two unchanged D59 source bodies are excluded; corresponding equality/security assertions are reported Windows evidence. D59's accepted risk is unchanged, not remediated.
- **Accessibility/deployment:** keyboard, focus and narrow RTL evidence is bounded; screen-reader speech is not certified. Ubuntu production deployment and Access cutover are outside this review.
- **Exclusion scan:** the supplied final scan reports 5,665 inspected members across nine nested archives and six protected values checked. The current outer/inner archive integrity was independently verified; the secret-value scan was not rerun with unavailable private values. A bounded scan is not a universal guarantee that no sensitive information exists.

These limits do not require another T45-A1 correction or an additional attachment for this agreed review. Task 4.5 is closed locally. Any Task 4.6 work requires its own scope and owner instruction.

## Delivery identities

| Artifact | Bytes | SHA-256 |
|---|---:|---|
| Original complete A1 delivery ZIP | 35,750,756 | `9424864be3d1ad067dc1100356b10d6b47c3c89d1692b7ad80931ba00969c289` |
| Original inner review ZIP | 35,595,289 | `c450d40500f9ca4b31d371807a5d7a211dfec0b51ca7dc743f4d24c831114312` |
| Duplicate final delivery receipt | 6,071 | `d1e7399e9a6a05e0347f67deb110af117935aa754d110687a66714d48bdece16` |
| Final delivery-verification sidecar | 626 | `16897cf6edaa9a5ad2f83939e598be8dd8b8ae4bd1332fbefceceae4fd4f7155` |
| Final complete-exclusion sidecar | 11,028 | `74f63b388792acd17d15867a18e9c829df54e4fed9e7b123ba6005fbae768492` |

The reviewer package preserves this report, independent results and relevant exact evidence/source references. The original supplied archives remain separate and hash-bound. No original evidence or repository file was changed during this review.
