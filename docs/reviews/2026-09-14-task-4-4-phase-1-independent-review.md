# Task 4.4 Phase 1 — independent review of 886c37e

Reviewed 14 September 2026 against the original adopted prompt, the Task 4.3 publication review, project context v1.56, exact patch/postimages, repository authorities and supplied execution evidence. This review was performed in the existing conversation. No implementation, activation, publication, new chat or subagent work was performed.

**VERDICT: fix these first — one bounded search correctness finding (P2).**

The delivery is authentic and reviewable: archive integrity, patch identity, commit/parent/tree identity and changed-file scope pass independent checks. One new search branch does not follow the established Arabic digit normalization contract. Correct that branch and its test expectation before Phase 1 acceptance. I found no additional blocking authorization, mutation, data-presentation or scope defect in the reviewed source. This is not owner acceptance or authority to execute corrections. Overall Task 4.4 remains unchecked.

**MUST FIX — 1 item**

**R1 / P2 — Normalize record-ID search input consistently.** In `source/src/lib/admin-work-query.ts`, line 159, both `a.id::text=${f.q}` and `a.legacy_id::text=${f.q}` compare the original query text. The surrounding text-search branches normalize the query through `public.ar_normalise()` (the pattern function and adjacent text predicates). The form advertises record identifiers as searchable (`source/src/strings.ts`, line 447).

Consequently, entering Arabic-Indic digits can miss a record that the equivalent Western digits find. As a constructed example, consider an otherwise eligible task with PostgreSQL ID 140 whose other searched fields do not contain 140: `q=140` matches its ID, while `q=١٤٠` does not. The same defect applies to a matching legacy ID. An incidental match in another field can conceal the omission. This is a source-established counterexample, not a claim that these particular two queries were executed against the owner's data.

The original prompt §4(b) requires query normalization using established rules. At the accepted base, the Arabic-search section of `docs/DATA-MODEL.md` defines the shared normalizer, including `٠-٩ → 0-9`; the Western-numeral presentation convention does not require rejecting Arabic digit input in the search box. The existing hearing implementation also uses raw ID equality. That explains the inherited pattern but does not resolve the inconsistency in this newly added search. This review does not require expanding the correction into the accepted hearing feature.

The supplied search test cannot detect the issue: `source/scripts/test-admin-work-read-only.ts` includes `١٤٠` at line 234, but its expected-result calculation also uses `String(a.id) === q` and `String(a.legacy_id) === q` at lines 254–255. It therefore treats the same omitted ID match as correct. The reported search PASS is evidence that this implementation and expectation agree, not proof that both digit forms find an ID.

Recommended correction: apply the canonical query normalization to both exact ID comparisons, retaining parameterization, exact ID matching and unchanged stored values. Add focused fixture expectations proving that Western and Arabic-Indic forms find the same PostgreSQL and legacy IDs when no other field supplies an accidental match. Preserve literal-wildcard handling and the established no-`J → ق` rule. Refresh the exact source inventory identities and affected verification evidence as necessary. No schema, migration, data repair, credential operation or policy change is needed.

Practical impact: a lawyer using an Arabic keyboard can incorrectly conclude that a known administrative work is absent. This is a normal-priority search defect, not evidence of disclosure or data loss. Estimated correction and focused verification: roughly 1–2 hours if the existing local fixture environment is available; no new purchase or paid service is needed. That is an estimate, not an execution mandate or deadline.

**SHOULD FIX — 0 additional items. MINOR — 0 additional items.**

The proof limitations below are recorded limitations, not a request to repeat the entire implementation or earlier accepted phases.

**What I independently verified**

The TXT and original patch are byte-identical. The original ZIP was subsequently readable in the scratch workspace, so its integrity is now **VERIFIED**, no longer pending. I recomputed all member sizes and SHA-256 hashes against the external manifest, checked the exact member set and uniqueness, and checked extraction-path safety. All 117 members match; there are no duplicate, missing or unlisted members, unsafe paths or symlink entries. The embedded patch and implementation report match their standalone attachments; the preserved Task 4.3 publication review matches the original supplied review.

| Artifact | Bytes | Independently recomputed SHA-256 |
| --- | ---: | --- |
| Original patch and byte-identical TXT | 118,693 each | `5e1f16e62671a66932c801e83adfc4418a5bd3fba82a22610aa698c99c005c23` |
| Original review ZIP | 1,680,388 | `1b3acdf6857507ea43d9de90f03417baf209cf123cef393c81a6bd90c2a4d001` |
| External ZIP manifest | 20,004 | `070d1c57977412ec55ef9112bd54df1e4f5edd6004ef0884e1197936dde56bbf` |
| Original Phase 1 prompt | 17,539 | `4b817a0d7e4fb923a874f78e83fef10d5fd44cafbc44770bf5dcdcf275b573c2` |
| Original Task 4.3 publication review | 7,562 | `c9db1a5958304571f28d0515b79918e3dcb355d9a6027eddfab2bf88dfd71826` |
| Supplied implementation report | 12,837 | `bbe9e8301f0ea5c402828ad3fb2cc7ecd39fca01da2e1f88c91197bcaa8876d5` |

I reconstructed the Git commit object from the supplied raw object and the complete final tree from its 614 file entries. I reconstructed changed-file preimages in memory, verified the old and new full-index blob hashes, and reconstructed the accepted parent tree. This is stronger than trusting the abbreviated filename or delivery receipt alone.

| Identity or scope check | Independently verified result |
| --- | --- |
| Commit | `886c37e3a66de654bc41bf4a00d5fbff4608e151` |
| Sole parent | `98ba737300f1c0cefce361cb3da4e250b11b71d2` |
| Subject | `feat: add read-only administrative work screens` |
| Candidate tree | `3059d9f072d2781b43692ddff7e822c46666837d` |
| Reconstructed accepted parent tree | `f30acf3df2f0a28dd25ab7be63e237f3bcb15e06` |
| Exact patch scope | 24 files, +2,167 / −13; per-file statistics match |
| Packaged source postimages | All 49 match their Git blob identities |
| Other final-tree paths | 590 unchanged |
| Existing task checkboxes | All 86 lines unchanged, including overall Task 4.4 |
| Reverse patch applicability | `git apply --reverse --check` succeeds; patch not applied |

The changed paths contain the permitted read services, pages, navigation, centralized strings, exact route/SQL inventories, focused test infrastructure and status/review documents. No schema, migration, lockfile, credential/configuration, governance, permission-policy, glossary or decision change occurs in the commit. The complete applicable governance and relevant data/permission/visual authorities were reviewed at the exact accepted base; six fetched authority postimages were independently matched to their base Git blobs. These were pinned file reads, not a new observation of remote main or a publication action.

**Source assessment against the product contract**

| Requirement | Independent source assessment |
| --- | --- |
| All four usable roles; direct server protection | Both pages invoke the existing view wrapper. Query helpers check authorization and expiry, then recheck the live account/person, role, session version, enabled/login/active state and forced-password state before business reads. No policy broadening; future Paralegal editing remains intact. |
| Read-only operations | The shared service opens a repeatable-read transaction and first sets it read-only. Business SQL is parameterized SELECT access. No new mutating action or endpoint. Seven exact SQL inventory entries and two view-route entries are added without a broad exception. |
| Complete, bounded list | LEFT JOINs preserve missing related context. No parent-archive exclusion silently removes tasks. Page size is 25 with stable business-date/ID ordering, count/cardinality checks and bounded, validated parameters. The 4,000-option limit fails explicitly and is disclosed. |
| Search and navigation | Matter/client/person/status filters, escaped wildcard input, active-alias existence search and list/detail/back query-state handling are present. R1 is the exception to query normalization. |
| Correct business fields | Business creation and execution dates are selected as date text; `createdAt` is not substituted. Follow-up remains multiline text. Required work, result, previous decision, deadline, court/circuit/destination, status and alert are presented without reinterpreting raw values. |
| Missing/inactive/archived context | Canonical and raw person context remains readable; inactive people and independently archived matter/client state are identified. Stored text is rendered through React text output and existing fields, not injected as HTML. |
| Steps | Action date, performer, result and report are displayed; 25 steps per page, source ordinal ascending with NULLs last and PostgreSQL ID as stable tie-breaker. Dates are not used to reorder the history. Empty histories have a readable state. |
| Preservation of imported meaning | No writes repair source records or release quarantine. `nextAppointment` is absent from the query projection and UI. Court 26 is not manufactured as a court; circuit and raw source values remain separate in the data contract. PostgreSQL route IDs remain distinct from legacy provenance. |
| Arabic/RTL presentation | Existing shared styles, logical layout patterns, bundled typography and central strings are reused. Representative supplied desktop, narrow-width and browser-zoom screenshots were visually inspected. |

**Reported execution results, independently audited as evidence**

The following are supplied Windows/disposable-fixture run results. I read the relevant source, logs, JSON receipts and screenshots and checked their internal consistency and available source hashes. I did **not** rerun the Windows application, production build, PostgreSQL fixture suite, browser or scanner here, and did not access the actual owner database/app.

| Supplied evidence | Result it records and review qualification |
| --- | --- |
| `evidence/run1/service-results.json` and test source | Four service groups pass. All four roles traverse 148 list pages; every one of 3,694 task details and 3,483 linked steps is compared to an independent SQL baseline. The exhaustive detail/step traversal uses the Lawyer session; four-role list and representative detail/edge coverage is separate. |
| `evidence/source-profile.json` | 3,694 tasks, 3,483 steps, no detached target step or task missing its matter, 1,741 missing assignees, 1,338 multiline follow-ups, largest history 53 steps. Counts agree arithmetically with historical 4,238 = 3,694 + 544 and 4,252 = 3,483 + 769 reconciliation. These are audited reported counts, not a fresh live count by this reviewer. |
| Run1 search/filter proof | Reported PASS for Arabic/diacritics/digits/JTI/literal wildcards, filters and intersections. R1 exposes a shared error in the record-ID expectation; the blanket normalization claim is not accepted for that branch. |
| `evidence/run2/edge-results.json` | Fixture-only duplicate work text, unresolved raw names, NULL parent/person, NULL versus empty status, long literal multiline text and 27 NULL-ordinal steps with conflicting dates pass for all four roles. These are explicitly synthetic cases; absent source cases are not presented as observed live data. |
| `evidence/run2/permissions.log` | Permission suite passes, including 448 policy decisions and direct URL/action/helper refusals, live role refresh and forced-password/disabled/inactive-account controls. |
| `evidence/run2/browser-results.json` | 27 recorded outcomes, including 22 states with scanner results and zero reported violations. All four roles open list/detail; navigation, malformed queries, missing records, empty histories, keyboard interaction and 320px reflow are covered. All 279 recorded target measurements are at least 44px in each dimension and inline-visible. |
| Native zoom receipts and screenshots | Both list/detail receipts record unchanged outer width 1440, inner width 1440→720, device pixel ratio 1→2, browser zoom 2 and CSS zoom 1. These support genuine 200% browser zoom in the supplied run. They do not establish full accessibility conformance. Screen-reader speech remained excluded. |
| Production builds | Run1 and run2 build logs report success. Their 156-entry build-source manifests are identical and each matches the SHA-256 in its build identity receipt. The tested candidate artifact is separate from the preserved owner build. |
| `evidence/static-check.log` | Final required static gates report PASS, including typecheck/lint/format, RTL, authorization inventory, exact audit inventory and rejecting controls, read-only/account checks, encoding and ignore checks. This is an inspected log, not a fresh `npm run check` by this reviewer. |
| `evidence/run3/invariants67.log` | The corrected invariant-only run reports all 131 permanent checks passing before synthetic fixture population is introduced. |
| `evidence/run1/query-plans.json` | Ten measured execution times range from 0.085 to 96.529 ms on the supplied local fixture. Default page 8.509 ms, selected search page 96.529 ms, selected detail 0.217 ms. These figures are not a production performance guarantee. |

**Source binding, failures and reuse**

I independently matched every available packaged source file selected by the four binding rules: 26 of 156 build inputs, 9 of 41 service-read dependencies, 15 of 266 browser/test dependencies excluding the corrected orchestration runner, and 37 of 410 final script/application inputs. These groups overlap; they are not additional distinct files. The remaining bytes are not packaged locally. Their manifest consistency and the implementer's final binding receipt were audited; I did not independently rehash unavailable installed dependencies or the 58 generated Prisma files. The bounded dependency receipt names the lockfile and 24 package manifests, not a full installed dependency-content inventory.

The reused run1 service result hash matches run2's reuse receipt. All 41 service-read manifest entries agree across the three runs. Run2 and run3 execution manifests differ only at `scripts/test-admin-work-read-only.ts`; available final application and corrected runner postimages match the applicable manifests. Documentation was finalized later. The final report accurately distinguishes the earlier successful business/browser paths from the corrected invariant-only path exercised in run3.

The relevant failed attempts are retained. Run1's browser check counted the loading state before the rows appeared; the corrected browser helper waits for rendered rows, and run2 passed. Run2's later historical check rejected synthetic fixture actor population; run3 moved the permanent check before fixture actor/synthetic setup, without changing the invariant or imported rows. Other bounded tooling/audit failures and cleanup receipts are recorded. I found no evidence that the changed source weakens a protected invariant to obtain these passes. The receipt explains that an unchanged fixture helper was omitted from the ZIP after a strict packaging scan rejected its URL construction template; its baseline identity remains in the complete tree and manifests. No credential-scan exception was added.

**Protected-state evidence and its exact limits**

I compared the supplied initial actual-state object to run1/run2/run3 before objects and the run3 after object. All five representations agree: all 119 table count/full-row digest entries, aggregate table digest, sequence metadata/last-value digest and catalog digest. The table coverage includes account/session-version, audit and migration data. This establishes equality of the supplied receipts; it does not independently recompute the protected database or expose its credentials.

The supplementary sequence receipts agree for 48 sequences and explicitly cover `last_value`, `log_cnt` and `is_called`. Their common complete-sequence digest is `8026a55af2546b9fdd98078e10d97c36abe2890bf2a8e74aae86e0f59e07cdd2`. The recorded window is **08:46:47.398–08:51:29.533 UTC on 14 September 2026**. The initial inherited sequence digest did not record every internal field; this final-window comparison cannot retroactively establish those unrecorded initial values.

The midpoint and final preservation receipts agree for all 19 prior-input and 54 logo path/size/hash entries, and for the owner process creation identity, PID 70060, loopback listener 3000 and build `6STn5JeaidE5AnbLqEJc8`. Private configuration equality is reported from a mid-task baseline; the private baseline bytes are intentionally not supplied. A midpoint `configContentsUnchanged: false` is not evidence of a detected alteration: that capture establishes the comparison baseline, and the final receipt reports equality. Do not describe it as proof of full-task private-configuration byte equality.

Three isolation receipts identify distinct fixture clusters and non-owner ports against the same source cluster. Browser cleanup reports removed test mirrors, stopped listeners, reusable ports, unchanged bounded dependency metadata and no external requests. Final fixture/owner preservation and container/volume/network absence are reported in cleanup/delivery receipts. These are dated supplied observations, not new host observations by this reviewer.

The delivery receipt reports clean local main, one ahead/zero behind observed origin at `98ba737...`, no operation/lock and no push. I verified the candidate commit relationship, but did not independently observe the current Windows worktree, process state or remote main. No publication or activation is inferred from archive identity.

**Recommended next stop**

Keep Phase 1 acceptance pending R1. A later, expressly authorized correction should remain limited to administrative-work ID search, its independent expectations and the affected source-bound evidence/status records. Reuse unchanged valid proof; no replay of accepted migration/lifecycle/backup work is justified by this finding. Submit the correction for review before acceptance. Activation, publication, Phase 2 editing/lifecycle and later tasks remain outside this review.

The verification supplement `task44-phase1-reviewer-verification.zip` contains the independent check ledgers and offline verification scripts. Its 1,904 successful checks are artifact/commit/evidence audit assertions, not additional product, database or browser tests. The same project-context document is advanced to v1.57 to record this review and its pending-acceptance stop while preserving earlier history.
