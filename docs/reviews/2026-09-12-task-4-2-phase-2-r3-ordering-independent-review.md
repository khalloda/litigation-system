# Task 4.2 Phase 2 — final R3 ordering independent review

Date: 12 September 2026

Verdict: **PASS. R3a is closed; R1, R2 and the original R3 remain closed. Recommend owner acceptance of Phase 2.** No further correction or missing attachment is required for this review.

This is an independent review of the supplied source, patch and evidence. It does not itself record owner acceptance, publish commits, apply migration 64 or activate the candidate application.

## Reviewed identity and scope

| Item | Verified value |
| --- | --- |
| Commit | `6771218164c992781902374efb62f0b2f54b2a20` |
| Sole parent | `4aee985dabc01db7142fe08bdc2b4fa9d83ba049` |
| Subject | `fix: keep nullable party order stable` |
| Committed scope | 9 files; 623 additions / 32 deletions |
| Product change | `src/app/matters/matter-editor.tsx` only |
| Other changes | Focused browser helper/runner, preserved prior review, report/matrix and three status documents |
| Recorded Git state | Clean main, four ahead / zero behind cached `d84aa4b916e41e15abf543fc7dd2d4155bea7acf`; no fetch or push |

The raw supplied commit object hashes to the stated commit. All nine full-index old/new blob identities and per-file statistics agree with the patch, delivered postimages and retained parent evidence. All 49 supplied unchanged source files also match the parent tree. Forward and reverse applicability checks pass without applying the patch. The editor's differing “Edited files” display is not the committed scope.

## Finding closure

| Finding | Result and evidence |
| --- | --- |
| R1 — reverted lawyer/capacity selection creates false history | Remains closed. The ID restoration, validated gateway canonicalization and exact retry rules are unchanged. Fresh supplied browser evidence adds both-role complete-state no-op checks with nullable party/capacity/lawyer positions. |
| R2 — protected D41 courts can change | Remains closed. The corrected migration, service and permanent verifier are byte-identical. The preserved prior service/gateway/row-guard and protected-control proofs remain applicable. No court policy was changed. |
| Original R3 — movement crosses legal sides | Remains closed. Movement bounds remain side-local. The fresh suite verifies group boundaries and keyboard movement with nullable positions. |
| R3a — side change/Add party reorders NULL-position parties on reload | Closed. Both append paths now call `appendParty`. It assigns 1-based positions to the destination group's current display order plus the appended party. The other group keeps its exact values. Untouched saves and selecting the existing side do not invoke that renumbering. |

For example, when a destination group contains one numbered party and one party with an unspecified position, the appended party now remains last after saving. The unchanged database ordering (`side`, `ordinal NULLS LAST`, `id`) agrees with what the user saw. Existing party IDs, capacity IDs, legal sides and unrelated groups remain intact.

No new blocking finding was identified in the changed scope.

## Verification performed by this reviewer

- **86 artifact, source-provenance and preservation checks passed.** The ZIP has exactly 136 unique members: 135 payloads plus its manifest. Every path, size and SHA-256 matches; the standalone patch, manifest and report are exact copies. The prior independent review is preserved byte-for-byte.
- **24 exact-source editor controls passed**, including 12 append combinations covering mixed numbered/NULL, all-NULL, gapped numbered and empty destinations; both side-change directions and Add party; relationship-ID/capacity preservation; unchanged/same-side/scalar behavior; and existing selection/movement controls. These execute the delivered TypeScript-erased helpers, handlers, submit function and parser with state/action captures.
- **12 additional synthetic SQLite ordering checks passed** using the unchanged `ORDER BY` over those actual handler/parser outputs. This closes the previous independently reproduced ordering counterexamples.
- Three supplied screenshots were inspected, including desktop, 320px stacking and a genuine-zoom party-control crop. Arabic labels, group guidance, enabled/disabled boundaries and focus presentation remain readable in these views.
- A targeted credential-pattern screen found no actual credential pattern; two parameterized fixture URL templates were identified. This is not a guarantee that pattern matching can detect every possible secret.

These are fresh offline reviewer checks. No fresh Windows, React/browser, PostgreSQL, owner-runtime or remote-Git operation was performed by this reviewer.

## Supplied execution evidence and reuse

The unchanged candidate was tested first with the exact archived parent editor. Four failed-before assertions reproduce side-change and Add-party reversal for Administrator and Litigation Assistant. The corrected run uses the same exact assertion files and produces 44 browser records:

| Corrected evidence | Count |
| --- | ---: |
| Exact saved party/capacity/order comparisons, including detail/edit reload checks | 24 |
| Complete-state no-op comparisons | 8 |
| Unrelated scalar edits preserving all nullable relationships | 2 |
| Keyboard/validation recovery records | 2 |
| Accessibility scans, all with zero reported violations | 6 |
| Native 200% browser-zoom contracts | 2 |

All 24 saved-row records equal their expected complete rows; all eight no-op before/after state/catalog records are equal. The two zoom contracts show browser zoom 2, unchanged outer width, halved CSS viewport width and doubled device-pixel ratio, with CSS zoom remaining 1.

Both supplied runs show separate disposable PostgreSQL cluster identities, production builds, setup checks, all 125 final historical invariants and successful owned cleanup. The final eleven-part static gate passes, including encoding over 528 files.

The final build inventory matches all 181 declared critical product/configuration/assertion identities. The 296 unchanged reuse dependencies agree with preceding evidence and the fresh build inventory. All migrations, including candidate 64, and the schema are unchanged. R1/R2 gateway, concurrency, audit, permissions, canonical replay and unrelated read/report proofs are explicitly reused rather than represented as fresh full-suite execution.

The only three changed files present in the build inventory with later bytes are README, TASKS and PRD; the two new report/matrix files were added later. No unexecuted product or assertion change is counted as tested. The disclosed package attempt stopped because `.tsx` evidence was missing from its extension allowlist; the completed package includes and verifies that exact executed source. This required no product correction.

## Preservation and remaining boundaries

The supplied current source/live before and after receipts are byte-identical and match the preceding correction's final receipts. They record migration 63, 109 tables, 48 complete sequence states and 54 logos. All 3,912 protected entries and 40,571 runtime entries have exact complete decoded equality. All 3,770 preceding protected entries remain an exact subset; the previous complete runtime inventory also matches. JSON property ordering explains the differing file hashes of some inventory receipts; no stored value was normalized away.

The owner process/listener identities agree and the final task-resource lists are empty. The already documented earlier container restart/endpoint/MAC discrepancy remains historical, with unknown cause; this run does not introduce a new discrepancy. The historical locked runtime log exclusion remains explicit.

The supplied status is clean main at 4/0 against a **cached** remote checkpoint. It is not a new observation of GitHub. The actual development database has not received candidate 64, and the owner application has not been replaced. Windows development acceptance and eventual Ubuntu VM/Docker production deployment remain separate. Screen-reader speech actions remain excluded by the owner's instruction, with no pending action or acceptance blocker.

## Recommendation

**Accept Phase 2 at `6771218164c992781902374efb62f0b2f54b2a20`.** Phase 1 acceptance remains valid; overall Task 4.2 remains incomplete because matter archive/restore is still listed separately.

To reduce administrative handoffs, combine recording Phase 2 acceptance with the next explicitly authorized matter archive/restore implementation task, as was done for Phase 1 acceptance. Preserve this PASS review exactly and retain the existing evidence. That next implementation still receives independent review; publication, real migration deployment and production activation remain separate authority boundaries.

A standalone acceptance-documentation task is also possible, but adds another commit/package/review exchange without resolving a remaining Phase 2 defect. The combined route requires no new tool purchase and avoids that extra documentation cycle. This is a recommendation awaiting the owner's decision, not an archive/restore or publication mandate.

## Delivery identities

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| Implementer's review ZIP | 7,768,287 | `edd67739290bcf0a055c54c8db1fa6455ffe3857c7e4fe6b8af6e151b796d489` |
| Implementer's patch | 48,126 | `4796672c2e07b988fc2aa9cf593cb24afd09cbd0c0e24b2b53d48a52dfcaba2a` |
| Implementer's manifest | 23,614 | `6769bcb9e7bde8bd58ce91fdf491e50902a0f44215f329959b4bf7816273367d` |
| Implementer's report | 7,170 | `4b56c91c368c5655635fb360bea19b50a89d9b9b1422c67aabd9718b60d9a84b` |
| Implementer's separate receipt | 43,015 | `1cd8408442db9246e0dceff875cf69ca4a13a9911b624137d7d579183b971a69` |

The separate reviewer evidence archive contains the reproducible offline checks and their results; it does not replace or modify the implementation package.
