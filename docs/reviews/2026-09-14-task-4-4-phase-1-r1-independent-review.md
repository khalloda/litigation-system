# Task 4.4 Phase 1 — independent R1 correction review

14 September 2026. **PASS — R1 (P2) closed. No further blocking finding.**

The corrected Phase 1 implementation is ready for owner acceptance. This review is not owner acceptance, an acceptance-documentation commit, activation, publication or authorization for Phase 2. Overall Task 4.4 remains unchecked.

The review was performed HERE in the existing conversation against the original prompt, the immutable Phase 1 independent review, the approved correction mandate, and the attached correction artifacts. No new chat or subagent was created. The reviewer performed source, archive, Git-object, hash and evidence-consistency checks in scratch; no application implementation or Windows/database/browser execution was performed. The attached context v1.58 was byte-identical to the saved canonical preimage.

## Verdict and findings

**MUST FIX:** None remaining in this correction.

**SHOULD FIX:** None identified that warrants another correction cycle before Phase 1 acceptance.

**R1 closed:** both exact ID branches now normalize the search input, and the independent expectations no longer reproduce the original omission. Fresh supplied regression evidence demonstrates the defect against the reviewed production bytes and success against the corrected bytes. The unchanged portions of the original Phase 1 review continue to apply.

**Minor observations and evidence limits:** the dated preservation windows, partial availability of executed dependency bytes, four Gzip listener warnings, and unchanged historical accessibility/option limits are disclosed below. They are not evidence of another defect in the two-comparison correction.

**What is good:** the production change is restricted to one shared predicate; the regression deliberately selects existing records that expose each ID branch, checks complete ordered result sets rather than only one visible row, retains legitimate text matches, covers every digit in both branches and exercises all four usable roles. Historical evidence is reused with an exact source comparison and is not relabelled as a new full traversal.

## Verified delivery identity and integrity

| Item | Independently verified result |
| --- | --- |
| Commit | `1df53838063b1d9466bd2da0582c7ffc9b7bbf85` |
| Sole parent | `886c37e3a66de654bc41bf4a00d5fbff4608e151` |
| Final tree | `c7f411c8f6ea3bb47029210764ee7d66e43b2dd5` |
| Parent tree | `3059d9f072d2781b43692ddff7e822c46666837d` |
| Subject | `fix: normalize administrative work ID searches` |
| Exact commit scope | 13 files, 844 insertions, 4 deletions |
| Archive | All 90 unique members match the complete external path/size/SHA-256 manifest; no missing, unlisted, duplicate, unsafe or symlink member |
| Git binding | Raw commit object rehashed; full final and reconstructed parent trees rehashed; all 620 final tree paths accounted for, including 607 unchanged paths |
| Patch | Exact embedded/external bytes; every full-index preimage/postimage blob and per-file statistic verified; reverse applicability checked without applying the patch |
| Packaged source | All 46 packaged source files match their Git blob identities |
| Retained state in source | All 86 existing task checkbox lines unchanged; original independent review and protected parent tree entries preserved |

The editor panel's “11 files, +432/−20” is not the commit scope. The verified Git objects, patch and delivery receipt consistently establish **13 files, +844/−4**. This is a presentation-scope discrepancy, not an additional code change or a failed delivery check.

| Supplied artifact | Bytes | Independently computed SHA-256 |
| --- | ---: | --- |
| `task-4-4-phase-1-r1-1df5383-review.zip` | 665,700 | `f371b269095c74ada45cd71d82c1dae5e2b169adc960614bf8bbd2da3b2622fb` |
| `task-4-4-phase-1-r1-1df5383.patch` | 62,422 | `535d1214f8367d6e021a721c9a605d904ed6db29c24d7a435e10ba983273d0dd` |
| `review-zip-manifest(2).json` | 15,247 | `78f602a881f1cc30a4661524e3b72f0b74e41263cd83102195c9ad25ae9b3ab7` |
| `delivery-receipt(20260914-102645).json` | 5,595 | `42081364bda83441b51b207d03b4bdf0e833a18ec69045bb562dd2e10be87c91` |
| `2026-09-14-task-4-4-phase-1-r1-id-search.md` | 11,585 | `41ce59ccd1efa301e5568774415a911f02d6533f2d38fab8bac141ac6f45de5d` |

ZIP integrity is **verified**, not pending. These checks establish the identity and consistency of the submitted bytes; they do not independently witness their execution on Windows.

## R1 source closure

At `src/lib/admin-work-query.ts` line 159, the only production difference is:

```sql
OR a.id::text=public.ar_normalise(${f.q})
OR a.legacy_id::text=public.ar_normalise(${f.q})
```

The previous comparisons used raw `${f.q}`. An exact byte substitution of those two comparisons in the verified parent reproduces the entire corrected query file. Its SHA-256 changes from `5e7cf47e602bfb45bb09f31fa7fe59f058412aad403c0422445a3f1e6038ef82` to `9986177ad7a68fe7be5739ceff393ba244d9a8934bae9b4f35eaf470cc2a9ca8`.

Both the result count and result rows use this predicate. Exact text equality and parameterization remain; stored IDs, NULL semantics, route identity parsing and the canonical normalizer are unchanged. There is no integer coercion, partial ID comparison, new normalization mapping or J-to-ق conversion. Detail/step projections, source ordering, authorization and UI code are unchanged.

The two independent ID expectations in `scripts/test-admin-work-read-only.ts` now use `normalized`; legacy equality additionally excludes NULL explicitly. These are its only changes. `scripts/lib/audit-source-inventory.ts` changes only the whole-file query hash: the seven SQL call fingerprints and all rejecting rules remain unchanged. The supplied sequence places this hash refresh after the green service proof and before the final static gate.

The new `scripts/lib/admin-work-id-search-proof.ts` obtains its baseline directly from the copied SQL rows and canonical normalizer. It imports the service under test, but not its query-building or expected-result logic. Candidate selection excludes incidental searched text/alias matches and equality through the opposite ID on the selected row. Each query's expected set still includes legitimate matches on other records. Negative selection similarly excludes incidental matches that could conceal coercion or partial matching.

The collector checks all result pages, stable totals, complete ordered identities and uniqueness. The regression covers normalized digit forms and matter-filter intersections for all four roles. Additional search/exactness and invalid-session controls are focused checks; this report does not describe every such control as repeated for all four roles. Synthetic account setup is confined to positively identified disposable copies and precedes the controlled business-read before/after comparison.

## Execution evidence: supplied runs, not reviewer reruns

| Evidence examined | What it supports |
| --- | --- |
| `evidence/red/red-results.json`, candidate records and run log | 48 meaningful expected failures: 12 Arabic-form cases for each of Administrator, Lawyer, Litigation Assistant and Paralegal. The selected ID is actually absent in every recorded failure. All expected IDs agree with the candidate records, and actual results are ordered subsets of those sets. Western comparisons did not produce a recorded equality failure. |
| Identical red/green candidate JSON | Five PostgreSQL candidates and seven existing legacy-ID candidates independently cover digits 0–9 in each branch. No imported-ID rewrite was needed. Candidate SQL assertions and successful execution are supplied evidence; the underlying copied database is not present for reviewer recomputation. |
| Green result and completion log | Corrected complete ID sets, counts, pagination, matter intersections, exactness negatives, normalization/wildcard/NULL controls and direct-read refusals pass. The final no-read-effects assertion completes before the reported successful run. |
| Permanent checkpoint log and runner ordering | All 131 migration-67 permanent checks pass on the fresh restored copy before fixture account preparation. |
| Permission log | All 448 decisions and the accompanying refusal/inventory/rejecting controls pass in the isolated copy. |
| Build identity, build log, browser results and screenshots | Separate production build `VuOM-Tsj6l89TLCeqxP6k`; four branch/digit-form browser interactions using the fixture Lawyer session; expected IDs/counts and query preservation through list/detail/back. |
| `evidence/static-check.log` | Final type/lint/format/RTL/auth/audit/user/staff/client/admin-read-only/gitignore/encoding gates and their rejecting controls complete successfully. Final documentation/diff checks are also reported by the delivery. |

The browser records are specific and consistent:

| Queries | Expected ordered IDs | Count |
| --- | --- | ---: |
| `808` and `٨٠٨` | `808, 2618, 697, 1018, 2112, 2964` | 6 |
| `11470` and `١١٤٧٠` | `808` | 1 |

The reviewer visually inspected both legacy-ID screenshots and the Arabic PostgreSQL-ID screenshot. They agree with the recorded queries and results. Four screenshots are packaged; this statement does not imply four were visually inspected or that screenshots independently prove every recorded interaction.

The red runner exits successfully when it detects the expected defect. That exit is not a product PASS. The manifest binds red execution to the exact old production query and the same independent regression helper used by green. The runner itself changed between red and green to resolve the disclosed TypeScript browser-callback typing issue by using the existing MJS boundary; its earlier full bytes are not packaged. This does not invalidate the unchanged regression helper's source binding.

The supplied server log contains four `MaxListenersExceededWarning` messages concerning Gzip drain listeners. The focused browser assertions still complete successfully. This review neither establishes a memory leak nor claims warning-free or long-duration runtime stability; the warning is not shown to result from the ID predicate correction.

## Source binding and justified reuse

The complete Git objects bind all committed paths. Executed-source hashes provide a separate bridge from the supplied test runs to those bytes. Every available packaged file in each relevant group below was independently rehashed and matched. The larger group-wide final working-directory comparison remains supplied Windows evidence because most dependency/generated bytes are not in this bounded archive.

| Executed group | Manifest entries | Packaged files independently rehashed |
| --- | ---: | ---: |
| Green runtime/tests, excluding the separately verified audit-pin refresh | 412 | 30 |
| Production build inputs | 156 | 22 |
| Browser dependencies, excluding that pin | 269 | 12 |

These groups overlap; their counts are not additive source-file counts. The build manifest's own hash matches the production identity. The 58-file generated Prisma inventory is present, but the full generated tree and built output bytes were not independently reconstructed here. The dependency preservation claim is bounded to the lockfile and 24 package manifests, not a complete dependency-content scan.

`docs/DATA-MODEL.md` and `docs/PERMISSIONS.md` have working-file hashes different from the packaged Git blobs. The same working hashes appear in all three original Phase 1 execution manifests and both correction manifests, and the packaged Git blobs equal the verified original tree identities. Thus no new authority change is evidenced. Exact working bytes are absent, so this review does not assert a particular byte-level transformation as their cause. The supplied helper's Git-filter-aware comparison is separately reported.

The exact two-comparison production diff supports reuse of original exhaustive evidence for 3,694 details and 3,483 steps, plus the original four-role screen access and 320px/200%/scanner checks. Relevant projections, ordering, UI, policy and authorization dependencies remain unchanged. Accepted Task 4.3 migration/lifecycle/race evidence is also unaffected. The corrected original full-volume suite expectation was inspected, but its full historical detail traversal was **not rerun**. The old whole-query file hash is not used as evidence for corrected search.

The original 4,000-option limit, quarantine boundaries and historical accessibility qualification remain unchanged. No fresh general layout or screen-reader speech test is claimed; speech remains excluded under the standing owner instruction.

## Preservation, cleanup and scope

The reviewer compared the entire supplied 119-table vector across the initial, red before/after, green before/after and final actual-state receipts and independently recalculated its aggregate digest. The table, catalog and sequence-metadata values also agree with the original reviewed baseline. All correction receipts agree on 48 sequences, fields `last_value`, `log_cnt`, `is_called`, and complete-sequence digest `8026a55af2546b9fdd98078e10d97c36abe2890bf2a8e74aae86e0f59e07cdd2`, which also matches the original final capture.

The public package contains the complete-sequence digest, not the full sequence-value vector. Equality of that digest is independently verified; reading the database and computing it are supplied Windows actions. The source runner and final helper use forced read-only access. No fresh owner account, password, login or session action was performed by the reviewer.

The dated windows matter:

- Database state: **10:07:30.372–10:21:32.714 UTC** on 14 September 2026.
- Configuration/logo/owner-process receipt: **10:04:17.6763371–10:17:22.6861093 UTC**.
- Delivery receipt: **10:24:22.648662 UTC**. The earlier receipts do not constitute continuous monitoring through delivery.

Initial and final process/listener/build fields agree: owner PID 70060 with the same creation/command identity, `127.0.0.1:3000`, accepted migration-67 build `6STn5JeaidE5AnbLqEJc8`. The initial 54-logo path/size/hash vector equals the original final vector. The correction's final logo/configuration equality is asserted in its receipt; private configuration bytes and a repeated final logo vector are not packaged, so that final comparison cannot be independently recomputed here. Earlier Phase 1 capture-window limitations remain historical and are not retroactively repaired.

All six named original inputs were independently rehashed against their preserved records, including the immutable 19,137-byte independent review, original prompt, Task 4.3 publication review, original patch, original ZIP and original manifest. The original 117-member package remains intact.

Red and green identify distinct fixture clusters, both different from the actual source cluster. Their completion logs and final receipt name the same owned containers and report container/volume/network removal. The separate browser mirror receipt reports removal, stopped listener, reusable port, successful build and no remote requests. These are consistent supplied cleanup observations, not a fresh inspection of Docker or Windows by this reviewer.

Git source scope is compliant: no UI, schema, migration, normalizer, hearing query, permission policy, dependency, governance or task-checkbox change. The reported final clean main state, no operation/lock and two-ahead/zero-behind relation are consistent with the verified ancestry through `886c37e` to cached `98ba737300f1c0cefce361cb3da4e250b11b71d2`. Current Windows cleanliness and remote freshness are not independently observed. No new fetch, push, activation, owner-runtime replacement, Phase 2 work or backup operation is evidenced or authorized by this review.

## Reviewer verification record and next step

The accompanying `task44-phase1-r1-reviewer-verification.zip` preserves this review, the reviewer scripts and three ledgers: 192 artifact assertions, 1,372 identity assertions and 325 source/evidence-consistency assertions, **1,889 passing offline assertions in total**. These are reviewer verification checks, not 1,889 newly executed application tests. Its payload manifest records each included file's exact bytes and SHA-256.

**Recommendation:** accept the corrected Task 4.4 Phase 1 implementation at `1df5383`. If accepted, prepare the bounded documentation-only acceptance step under the owner's decision. Overall Task 4.4 stays unchecked. No additional correction attachment or another implementation/test cycle is required to close R1 on the evidence reviewed. Activation, publication and Phase 2 remain separate decisions.
