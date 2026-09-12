# Task 4.2 Phase 2 — independent correction review

Date: 12 September 2026

**Verdict: R1 and R2 CLOSED; R3 needs one narrow follow-up before Phase 2 acceptance.** The original cross-side movement defect is corrected. A remaining nullable-position case still changes the displayed party order after save. This is an ordering defect, not evidence of lost records, unauthorized access or damage to the real development database.

The supplied package is complete. No additional attachment is required to understand or reproduce this finding. The recommendation is to finish this one editor case, preserve the successful correction, and reuse valid unaffected evidence. Phase 1 acceptance remains valid. Phase 2/overall Task 4.2 acceptance, publication and live migration are separate later decisions.

## 1. Exact reviewed candidate and scope

| Item | Verified or supplied identity |
| --- | --- |
| Correction commit | `4aee985dabc01db7142fe08bdc2b4fa9d83ba049` |
| Sole parent | `9b2d63ad542f8e81af00995debd283840849e919` |
| Subject | `fix: preserve matter editing invariants` |
| Git scope | **16 files, +1,191 / −53** |
| Supplied final Git | Clean main, three ahead/zero behind recorded origin/main `d84aa4b916e41e15abf543fc7dd2d4155bea7acf`, no operation/lock |
| Real development database | Migration 63; candidate 64 remains unapplied there |
| Candidate 64 SQL SHA-256 | `afd0ebc8c9c98e4de2eaa594668eb8dd7e7c216d8b1fdb093a44ebb50ff99034` |

The editor activity panel's nine-file count is not the committed scope. All 16 full-index old/new Git blob identities and per-file statistics match the supplied patch and retained parent evidence. All 44 additional unchanged supplied source files match that parent. Forward and reverse applicability checks succeed without applying the patch. The complete raw commit object was not independently recomputed; commit/sole-parent/current-Windows status remain supplied receipt identities supported by the checked tree and chain.

| Delivered artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| Correction patch | 99,678 | `b806a6c949ee2d7736160910a042fc955d39461dd529ef91494f23403b2f3d96` |
| Correction review ZIP | 9,149,819 | `6b219df4c69ef367e7d4e9e3d9c4f303feb3944e0ccdef458863319ee213a077` |
| Manifest | 34,211 | `cd800e968d4cd5ffc6b734169d0eceb8d4ee628497c38a810a6eb709bfe3b47e` |
| Separate delivery receipt | 13,092 | `a8cf29626095b3feb14b13b42f63d27c51dc7f6b92ba6737ad90ec4650f915d5` |
| Correction report, all copies | 12,851 | `f898a0ffdd9c9bf8fcfee138bcf60064649e0158b7ecceccc51bd8ce0c143f01` |
| Correction matrix, all copies | 5,201 | `d16bcc907bbeac9363b4477ac76ac250b523cf366923f78e6b2860d17b58d2c6` |

All **192 unique ZIP members = 191 payload files plus manifest** match exact names, sizes and hashes. No duplicate, missing, unsafe or unlisted member was found. The original independent review is byte-identical to the retained 14,182-byte source, SHA-256 `deaf85d465b27ca459262451e7697e399c3b8eb4859882b61c99c96d5e5bf816`. Original Phase 2 report/matrix byte prefixes, Phase 1 acceptance and all TASKS checkbox lines are preserved.

## 2. Finding disposition

| Finding | Result | Evidence and practical behavior |
| --- | --- | --- |
| R1 — selection round trips create false edits | **Closed** | Exact editor handlers restore the original lawyer/capacity IDs. Gateway validation and identity resolution precede canonical comparison. Supplied service/direct-gateway and both-role browser tests show complete no-op equality. Real selection changes and restorations still make real edits. |
| R2 — D41 courts can conflict with the permanent verifier | **Closed** | The existing three-court restriction is enforced by the value validator and row guard and explained by the disabled form control. Service, direct-gateway and direct audited-row tests reject changed and cleared values. Other field edits and ordinary court changes remain allowed. |
| R3 — displayed party order differs after save | **Original cross-side case closed; nullable-position case remains** | Side-local Up/Down and ordinary side changes pass. Appending into a group containing a valid NULL ordinal still disagrees with the unchanged database reading order. See the single finding below. |

### R1 closure detail

The retained original-candidate tests reproduced both false edits before correction. The corrected helper performs full shape/duplicate/ownership/eligibility checks, then resolves existing lawyer and capacity IDs before deciding whether anything changed. It does not identify a party by its name. Effective relationship arrays use the same stable ordering as the snapshot.

No-op return precedes parent version changes, child writes, sequence allocations, submission/change receipts and audit insertion. The original request remains intact for exact committed-submission replay; canonicalization does not weaken payload reuse or stale-version checks.

Independently compared receipts show identical complete service states for both round trips and four identical browser before/after states: lawyer/capacity for Administrator/Litigation Assistant. Inspected assertions additionally cover direct gateway no-ops, forged relationship IDs, changed-payload retry refusal, stale requests and legitimate change/restoration. The separate selection-controls run binds the final test bytes and proves two real edits per change-and-restore pair with original relationship IDs retained.

### R2 closure detail

| Access identity | PostgreSQL matter ID in the supplied fixture | Protected court ID |
| --- | ---: | ---: |
| 467 | 5093 | 32 |
| 468 | 5094 | 32 |
| 515 | 5095 | 32 |

The approved court remains `نيابة الشئون المالية والتجارية`. Access IDs are not used as PostgreSQL IDs. Six changed/cleared service attempts are present, and the executed assertions check the same cases through direct gateway and audited row updates with full-state equality after each refusal. Unrelated edits for all three matters and a normal matter's court change succeed. The permanent D39/D40/D41 verifier, source/release/workbook evidence and decisions remain unchanged. Both editing roles see the restriction and Arabic explanation.

## 3. Remaining finding R3a — append order with an unnumbered party

**Priority P2, narrow correctness follow-up.** Locations: `src/app/matters/matter-editor.tsx:103` for side change and `:479` for Add party; snapshot ordering in candidate migration 64 at `migration.sql:256`; canonical relationship ordering at `:349`.

The editor appends the selected party to the end of the destination array and assigns `max(existing ordinal, treating NULL as 0) + 1`. An existing unnumbered party keeps its NULL ordinal. The database reload sorts by side, then ordinal with **NULLS LAST**, then ID. Consequently the newly numbered party moves ahead of the existing unnumbered one.

This state is allowed by the application's actual input contract, not a malformed input invented to bypass it: `MatterParty.ordinal` is `Int?`; the exact TypeScript parser's `order()` accepts null; the gateway calls `_migration.matter_edit_positive(..., true)`, whose nullable branch accepts JSON null. No change to those contracts is recommended merely to hide the issue.

**Reproduction with synthetic valid records:**

1. Start with an opponent group containing Opponent A at position 1 and Opponent B with no recorded position.
2. Change Client A's side to opponent.
3. The form shows Opponent A → Opponent B → Client A and says that a side change moves the party to the selected group's end.
4. The submitted positions are 1, NULL, 2. Saving and reading by the existing query yields Opponent A → Client A → Opponent B.
5. Add party has the same cause when the client group contains an unnumbered party. The form appends the new named party, but reload places it before the unnumbered one.

The reviewer executed the exact delivered side-change/Add-party handlers, submit function and parser using Node type erasure and state/action captures. The unchanged ordering clause was also executed on synthetic rows in in-memory SQLite, reproducing both reversals. These are source-level executable proofs, **not a fresh React, Chromium or PostgreSQL run**. The supplied browser correction fixture uses numbered positions, so its successful test does not cover this case. No claim is made that any of the owner's current 1,744 matters has a NULL party ordinal or has experienced the defect.

**Focused correction:** when an explicit side change or Add-party operation appends within a group, encode that intended display order consistently for that operated group. Assigning deterministic positive ordinals in current display order is one suitable approach and is already how the existing within-side movement works. Preserve stable party/capacity IDs, names, legal sides and unrelated-group order. Do not normalize an untouched form or unrelated save, change historical imports, change NULLS LAST reading semantics, or weaken validation. Avoid a new migration or gateway change for this UI ordering fix.

Before edits, reproduce on a disposable native matter created through the existing gateway with nullable positions. Cover mixed-numbered/NULL and all-NULL destination groups, both directions of side change, and Add party. Include ordinary numbered and empty-group controls. After the fix, verify visible order, exact saved IDs/sides/capacities and reload/detail order for both editing roles. Keep an unchanged-null no-op control and retained-draft validation recovery. A small focused browser/service run and the required static/build gates are sufficient when unchanged dependencies justify reusing R1/R2 and migration/concurrency evidence.

## 4. Verified evidence, provenance and preservation

There are **83 passing independent artifact/preservation/provenance checks** and **10 passing exact-source editor controls** for the corrected ordinary paths. The two nullable append counterexamples are recorded separately; they are not counted as passing closure tests.

The correction's production browser run has **43 records and 16 zero-violation scans**. Its original-candidate reproduction is a different run with 14 records and two scans; counts are not combined into a fictitious single run. Supplied fresh logs cover 125 historical-profile invariants, 107 canonical-profile invariants, 15 setup checks, 448 permission decisions, mutation/retention/concurrency/audit controls, static checks and production build. Five representative screenshots were inspected: protected court, grouped party controls, 320px layout, genuine 200% zoom and validation feedback. No blocking visual issue was identified in those regions. Speech actions remain excluded.

Final application/schema/migration dependencies match the executed build inventory. The three exact assertion-source snapshots also match that inventory. Two final test files differ from the earlier build because additional selection controls were introduced later; the separate selection run pins both final files and the same 177 product dependencies. The optional proposed browser addition is explicitly unexecuted. No unexecuted assertion is counted as passed.

All 64 earlier migration/lock identities and 17 reused behavior dependencies match the prior and current build receipts. Historical read/archive visibility and unaffected client/contact/logo/staff/account evidence is qualified reuse. The R1/R2 changed gateway/migration behavior was tested fresh. The proposed next UI-only follow-up should preserve this distinction and avoid rerunning the whole project without a changed dependency or required gate.

The correction's source/live before/after receipts are byte-identical: **109 tables, 48 complete sequences and 54 logos**. All **3,770 protected records** and **40,571 runtime records** compare exactly as decoded values; JSON property order is not a data change. The preceding 3,428 protected records are an exact subset. Original evidence/review/Phase 1 acceptance/checkboxes are preserved. The exclusively locked historical runtime log remains the explicit existing exclusion.

The current baseline differs from the previous delivery in exactly three already reported container fields: start time `2026-09-12T11:05:35.831674827Z`, network endpoint ID and MAC address. These differences were captured before the correction tests. Current before/after equality does not erase that prior difference. Its cause is not independently established and must not be described as an owner-confirmed outage. The database state and owner runtime match the prior records. Cleanup reports no remaining task containers, volumes, networks, mirrors or caches and the same owner listener/process.

A targeted secret-pattern screen found only two source-code connection-string interpolation templates, not embedded credential values. This is not a guarantee that every possible secret format was detected. No credential, raw environment file or raw database dump is needed for the follow-up.

## 5. Recommendation and review limits

**Recommendation:** finish the remaining R3 append-order case in the SAME correction chat, then review that small delta. Keep R1/R2 closed unless their dependencies change. Expected effort is low-to-moderate, chiefly the existing isolated browser build; no new schema, purchase, service or real-data migration is needed. Deferring this case would avoid the immediate run but leave a supported-input ordering contract wrong, so it is not the recommended acceptance path.

Recommended configuration: **GPT-5.6 Sol / Medium; SAME Codex Desktop chat; Local Windows `D:\Projects\litigation-system`; no subagents**. The narrow source change and known fixture patterns support lower reasoning effort than the earlier migration correction. This is a recommendation, not a verified change to the user's selector. Official guidance documents Sol/Medium and advises using sufficient, proportionate effort; client availability may vary. [OpenAI model guidance](https://learn.chatgpt.com/docs/models).

The prepared follow-up prompt defines one local `fix: keep nullable party order stable` commit with sole parent `4aee985dabc01db7142fe08bdc2b4fa9d83ba049`, focused proof, complete preservation and a small verified review package. No fetch, push, live migration/deployment, owner-app operation, acceptance checkbox change, speech or later phase is part of that proposal. Routine in-scope troubleshooting and supported scoped permissions are included. The report is evidence; the owner's ordinary chat mandate remains the execution authority.

This review does not freshly observe the Windows checkout, live PostgreSQL, browser, owner app or GitHub. It independently checks supplied artifact bytes, retained tree evidence, source/assertion logic, reported preservation and synthetic exact-source controls. The remaining case should receive the focused real browser/PostgreSQL proof described above before being called closed.
