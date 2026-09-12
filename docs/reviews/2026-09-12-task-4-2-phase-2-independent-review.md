# Task 4.2 Phase 2 — independent review

Date: 12 September 2026. Reviewer: ChatGPT Work, independently of the local Codex implementation. **Verdict: NEEDS CORRECTION — three P2 correctness findings.** The review package is complete; no additional attachment is required to act on these findings.

Phase 1 owner acceptance remains valid. Phase 2 and overall Task 4.2 are not accepted by this review. Keep migration 64 pending on the real development database and preserve the existing owner runtime. One focused correction run is recommended before acceptance; this review does not authorize publication, deployment or another phase.

## Reviewed identity and scope

| Item | Verified or supplied identity |
| --- | --- |
| Supplied commit | `9b2d63ad542f8e81af00995debd283840849e919` |
| Supplied sole parent | `2f8820a3053ab65a60ee183882cbd6a2462559bc` |
| Subject | `feat: add matter creation and editing` |
| Exact Git diff scope | 44 files, +4,358/−68 |
| Recorded fetched origin checkpoint | `d84aa4b916e41e15abf543fc7dd2d4155bea7acf` |
| Supplied final local state | Clean main, two ahead/zero behind that checkpoint, no push or live migration |
| New candidate migration | `20260912120000_matter_editing_boundary` (64) |

The patch is present inside the ZIP as `change.patch`. It is a full-index raw Git diff, not a mail-format patch; the commit metadata is supplied separately. The activity panel's edited-file/line counts are not the committed statistics.

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| Phase 2 ZIP | 13,846,808 | `bcf5dc8fb27bfdb5664ed9b87b5a25c718c84e77a1274d91f7f0240aa7b17dc1` |
| Included patch | 264,703 | `42e78b7b994e4ea9e9ddb15e5801c2a84e83a8860de151c7e1b7fc23ef9ff0a2` |
| Manifest | 66,639 | `a39beb7dbfd6a5bec8476073233679e2f10cff7db79ffe4d7a950d71efe88a5c` |
| Implementation report | 15,664 | `6223f33c1507e53af774284b590c2b962bf5b5c2f2123081baffe03e3602afbe` |
| Final matrix | 7,101 | `5dae0f59735c7de1f8fdf91cd460d311436ebf8568e674535ca498a58100c986` |
| Separate delivery receipt | 18,793 | `eb62bb0babac74c334c859a67fd3986d8938947c9e5c08d2b3b7f6b9e82879c3` |

## R1 — Reverting a selection can create a false matter edit (P2)

**Location:** `src/app/matters/matter-editor.tsx`, capacity selector lines 369–374, lawyer selector near line 460 and `submit`; migration 64's `matter_edit_save`, change decision at line 302 and subsequent identity resolution.

Open an existing matter. Change its selected lawyer from A to B, change it back to A, and Save. The handler resets the existing relationship ID to null on both changes. All business values, person, role and position are again the originals, but the submitted JSON is different. The same issue occurs when changing a capacity and changing it back.

The database decides `changed` by comparing that raw relationship JSON with the snapshot **before resolving the existing relationship identities**. A null ID is distinct from the original ID, so the save takes the edit branch. Later it finds the original lawyer by person ID, or the original capacity by role ID, and retains that row. Nevertheless, it has already incremented the matter version and will insert change/submission evidence and the parent audit event. The result reports a change even though the effective relationship was never changed.

**Practical effect:** users who undo a selection before saving generate misleading edit history and can unnecessarily stale another user's open form. This violates the approved no-op contract. It is not evidence that real project records have been damaged; the candidate remains undeployed.

**Independent proof:** the exact delivered selector handlers, `submit` function and TypeScript input/form parser were executed using Node type erasure with state/action captures. Both round trips produced accepted payloads differing only in retained relationship IDs. Untouched forms correctly omit the arrays. The committed SQL then establishes the version/history consequence by source inspection; no PostgreSQL transaction was executed by this reviewer.

**Required correction:** preserve or restore original relationship identity when returning to the original selection, and make the gateway's no-op decision use the validated, resolved effective aggregate. Keep forged-ID rejection, inactive/reference rules, actual retirement/restoration and exact submission replay intact. Do not remove a real change merely to obtain a no-op.

**Closure proof:** real disposable PostgreSQL service/gateway and browser tests for both selection round trips. Assert unchanged full aggregate, relationship IDs, row version, edit/submission/audit counts and sequence state. Include a genuine selection change, retained removal/restoration, forged ID, stale save and lost-response replay as controls. Existing exact-snapshot and decimal no-op tests do not cover this path.

## R2 — The court editor and permanent D41 rule disagree (P2)

**Location:** migration 64's `matter_edit_validate_values`, `matter_edit_state` and matter update guard; `scripts/check-db.ts` calling `verifyHighImpactApplication`; unchanged `scripts/lib/high-impact-operational-proof.ts` ending with `D41 matter court changed`.

D41 explicitly binds Access matter IDs **467, 468 and 515** to the exact court `نيابة الشئون المالية والتجارية`, together with the twelve specified hearing destinations and the approved workbook. It requires permanent checks of that contract. These are legacy Access IDs, not interchangeable with current PostgreSQL IDs.

The new form offers other active courts for these matters. Its parser and gateway treat `court_id` as a general editable active lookup; neither the candidate guard nor the value validator contains the D41 exception. The older released-row update trigger records the change and its audit digest, but does not prohibit this court change. Meanwhile, `verifyHighImpactApplication` is called with the current database and its unchanged final query still requires zero such court differences. The historical matter-query adapter does not wrap this call.

**Practical effect:** a court change allowed by the editor/write path can leave the application state failing its permanent legal-record check. Simply preserving the old court in an import snapshot does not satisfy the existing current-state assertion.

**Independent proof:** the exact editor/submit/parser accepts another positive court ID. On synthetic rows, the unchanged D41 count query gives zero initially and one after changing each of the three protected matters to another active court; an unrelated matter is a zero-violation control. SQLite executed that query with only PostgreSQL's `::integer` cast removed. The old checker, application verifier, migration-60 trigger and DECISIONS bytes were matched to the successful final browser build's source inventory. Full PostgreSQL write-path behavior remains to be reproduced in the correction fixture; the absence of the write refusal is established by source review, not a fresh server run.

**Required correction:** preserve the existing D41 court contract at the write boundary and give the form an appropriate protected-field state/message. Refuse changed or cleared courts for these exact protected matters while allowing legitimate unrelated fields and ordinary court edits elsewhere. Resolve current records through the established legacy/release evidence. Keep all twelve hearing destinations, note, workbook and historical release evidence unchanged. Do not weaken D41, rewrite the permanent check, or turn this finding into a new blanket restriction on every matter. If the owner later wants the D41 court rule changed, that is a separate business decision.

**Closure proof:** identify all three current matter IDs on an owned full migration-63 copy; demonstrate the original conflict through the real service and the permanent checker, then verify corrected service/direct-gateway rejection with no partial business/history changes. Prove other fields on those matters and court changes on an ordinary matter still work. Run the complete current/historical checks after the valid and refused attempts. A browser proof should demonstrate the protected-field behavior.

## R3 — A party move across sides is undone on reload (P2)

**Location:** `src/app/matters/matter-editor.tsx`, global party movement at lines 414–419; migration 64's `matter_edit_state` ordering `p.side, p.ordinal NULLS LAST, p.id`.

The editor renders one parties array and gives each row Up/Down controls against the entire array. With a client party followed by an opponent party, moving the opponent up displays and submits opponent-first order. The snapshot sorts by side before ordinal, so saving and reopening puts the client first again. The ordinal changes may be recorded, but the order the user just selected is not preserved.

**Independent proof:** the exact move handler and submit/parser changed synthetic IDs `[501, 502]` to `[502, 501]` with ordinals `[1, 2]`. Executing the exact read ordering clause returned `[501, 502]`. Making both parties the same side preserved `[502, 501]`, confirming the side boundary causes the reversal. This is a handler/query reproduction, not a new browser run.

**Required correction:** make movement match the established client/opponent grouping—for example, move within each side and disable the control at that side's boundary. Keep explicit side changes distinct and predictable. Preserve stable identities, names, capacities and valid within-side ordering; do not silently change the global reading convention to fix a button.

**Closure proof:** browser Save/reload tests with at least two parties on each side, keyboard-operated moves, side boundaries and an explicit side change. Compare exact IDs/order/capacities in editor and detail; include validation-error recovery. The existing capacity reorder test does not establish this party behavior.

## Checks that passed and evidence limits

The independent artifact validator passed **117 checks**. The ZIP contains exactly **384 payload files plus one manifest**, all unique and hash/size exact. All 44 patch postimages, existing-file preimages against the previously verified parent tree, new-file absences, per-file statistics, and 23 unchanged supplied source files agree. Forward and reverse applicability checks passed without applying the patch. The exact Phase 1 PASS review and original report/matrix prefixes remain preserved. Phase 1 acceptance is recorded; Phase 2 is locally verified only; overall Task 4.2 and later work remain unchecked.

The source/live receipts are byte-identical; parsed complete protected/runtime inventories also match without value normalization: **109 tables, 48 complete sequences, 54 logos, 3,428 protected entries and 40,571 runtime entries**. The pre-existing locked runtime.log is explicitly excluded. The documented temporary cache file and directory timestamp corrections are covered by the final exact comparison. Supplied cleanup and owner-listener receipts are consistent. These are independent comparisons of supplied evidence, not fresh observations of Windows, Docker, the real database or the remote branch.

The delivered logs and assertions support full-volume restore/migration and mutation tests, **125 historical-profile invariants**, **107 canonical-profile invariants**, **15 setup checks**, **448 permission decisions**, required static checks and a separate production build. The exact replay, audit rollback, observed lock races, role denials and retained-history controls are meaningful. They do not cover the three cases above.

Browser run 2 records 79 states/proofs, 45 scans and zero reported violations; run 5 records 19 states/proofs, eight scans and zero violations. They are separate runs. Final run 5 matches the final application/service/migration source; later differences are documented test/report work, including the separately passing supplemental proof. The earlier full run and dependency-qualified historical evidence are reused explicitly. Five representative crops from four final screenshots were inspected: Arabic/RTL, mixed text, alerts, 320-pixel stacking and genuine 200% zoom appear usable. Screen-reader speech remains excluded by owner instruction.

No raw database dump/environment file or unresolved characteristic secret-pattern match was found in the reviewed payload. The one connection-string match is a source template interpolating a temporary password variable, not an embedded password. This screen cannot prove absence of every arbitrary secret value; the reviewer did not read actual credentials.

The reviewer did not reconstruct the raw commit object, run the full React/Next.js application, execute PostgreSQL, operate the owner runtime, or make a new GitHub observation. Commit/sole-parent/current local-state claims come from the supplied receipts; reviewed tree content and artifact consistency were independently verified. All executable counterexamples use exact delivered handlers/parser or identified SQL clauses with synthetic records and explicit doubles/adaptations.

## Recommended next action

Complete R1–R3 together in **one correction commit**, preserving the original implementation package. Reuse unaffected Phase 1/client/logo/staff/report evidence by dependency; rerun the changed write/migration checks and affected browser paths. This is a bounded correction of the approved phase, not a new business feature or another planning/acceptance-documentation cycle.

Expected cost is moderate implementation/testing usage, with no new paid service or installation. Accepting the phase as delivered saves that run but retains misleading edit records, the D41 conflict and non-persistent ordering; that option is not recommended. No live migration, owner-runtime operation, push or deployment should be included.

The accompanying correction prompt is prepared for the SAME local Codex Desktop conversation, GPT-5.6 Sol / High, no subagents. Sending its short direct authorization with the full prompt and this review starts the bounded correction. This review itself is evidence, not an execution mandate.
