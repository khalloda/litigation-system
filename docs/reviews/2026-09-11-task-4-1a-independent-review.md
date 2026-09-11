# Task 4.1a — independent implementation review

Date: 11 September 2026  
Reviewer: ChatGPT, independent of the local Windows Codex implementer  
Disposition: **CHANGES REQUIRED — R1 and R2 remain open.**

This review concerns commit `9bac6c6f0c0472771c8cf8c07f93b2025e415693`, sole parent `25e318c9b7da8e939f3eea96c2ded83ad85ac0bb`, subject `feat: add recoverable client logo management`: **55 files, +4,757 / −96**. The package is complete for this review; no additional attachment is required.

The feature should remain unaccepted and unpublished until the two findings below are corrected and independently reviewed. Task 4.1 and its four previously accepted phases remain accepted. This report is evidence and a recommendation, not a new implementation, publication or deployment mandate.

## Findings

| ID | Priority | Required correction | Practical effect |
| --- | --- | --- | --- |
| R1 | High / P1 | Coordinate publication and failure cleanup for concurrent uploads using the same submission ID. | An earlier request can delete the logo file that a concurrent retry has already obtained for successful publication. |
| R2 | Medium / P2 | Make the current staff-regression fixture adapter handle the explicitly validated migration-63 checkpoint. | The full current regression path stops with `63 !== 62` before the staff mutation tests run. |

### R1 — an upload failure can delete the file returned to a concurrent retry

**Source:** `src/lib/client-logo-storage.ts`, lines 57–89 and 114–127; publication call site in `src/lib/client-logo-management.ts`, lines 133–169.

The generated filename is deterministic for the client and submission ID. The first request creates that path exclusively, writes the bytes, and waits for its file flush. Another request with the same submission ID can encounter the existing file, read and verify its complete bytes, and return the same path without waiting for the first writer's flush or cleanup outcome. Only the creating branch performs the file flush.

If the first request's flush then fails, its catch block removes the file when the inode/device identity still matches its exclusive creation. That identity check proves which file was created; it does not prove that another request has not already adopted it. The comment that SQL has not started is true only for the failing call. The second caller can already have entered or committed its database transaction. The SQL submission lock is acquired after file persistence and does not protect this earlier filesystem interval.

**Deterministic reproduction on the submitted function:**

1. Request A exclusively creates a file and writes the complete prepared bytes. Hold A at its first file flush.
2. Request B supplies the same client, submission ID and bytes. B returns the existing path successfully; its file contents match exactly.
3. Treat B's returned path as the reference available to its subsequent database publication.
4. Release A's flush with an injected `EIO`.
5. A reports a storage failure and unlinks the path. B's previously returned file no longer exists.

The reproduction executed the submitted storage function with unchanged function logic and controlled import wiring. It used real temporary files, intercepted the first writer's flush, and verified both the successful duplicate return and subsequent deletion. **Database publication was simulated; this was not a PostgreSQL or browser reproduction.** The service source establishes the unprotected publication path after the storage function returns.

Source identity verified by the reproduction:

- SHA-256: `8531e37fa093e576de5b1c324337f6f3f4e59b878f440a9858790879c7473176`
- Git blob: `1ea4675ee9f83df2a9df7ac15696946499d50cf1`

**Impact:** an overlapping retry after a slow response can receive success while the current/retained metadata refers to a deleted generated image. The interface falls back to the client name, but that fallback does not restore the missing retained file. This is a failure in the core recoverability promise. The reproduction did not touch the project or its 54 original logos.

The supplied tests cover successful duplicate requests, database/audit failure after persistence, lost commit responses, process termination and competing mutations. They do not force the first-writer flush failure while an identical retry adopts its file. Those passing cases therefore do not close R1. The documented Windows directory-durability limitation and the owner's actual power outage are separate matters.

**Required outcome:** establish ownership and readiness rules that remain correct across overlapping requests/processes. No request may publish a file that another participating request can subsequently remove as its own failed creation. Every path accepted for publication must have completed the required persistence steps. A process-local mutex alone, the existing late SQL lock, or a non-atomic “currently unreferenced” database check is insufficient.

The implementer should select the narrowest sound protocol after inspecting the existing architecture. Possible approaches include coordination spanning storage and publication, or private attempt files with safe publication and conservative cleanup. Do not apply a guessed deletion rule to an indeterminate commit. Preserve original imports and committed recovery versions.

**Correction proof:** reproduce the interleaving before the fix, then prove the corrected outcome with an actual task-owned database fixture and controlled overlapping requests/processes. Include matching-content replay, conflicting content under the same submission ID, failure/termination at the chosen publication boundaries, exactly one committed result/audit where applicable, and existence/hash checks for every referenced file. Retain the existing successful recovery tests whose dependencies change.

### R2 — the current regression adapter rejects migration 63

**Source:** `scripts/lib/current-client-fixture.ts`, lines 26–43, especially line 37. Dispatch: `scripts/test-client-contacts.ts`, lines 299–334, especially lines 317–323. Consumer: `scripts/test-staff-mutations.ts`, which calls `withCurrentClientFixture`.

The task extends `assertCurrentClientSource` to recognize the strictly validated migration-63 checkpoint. The current client/contact regression wrapper also selects the corresponding audit profile. Its staff branch invokes `scripts/test-staff-mutations.ts --restored-client-fixture`.

However, `withCurrentClientFixture` still requires:

`assert.equal(await assertCurrentClientSource(db), 62);`

The same module's other adapter, `createCurrentClientFixture`, was changed to accept validated 62 or 63. The staff adapter was left behind. A valid current-63 source therefore fails before its staff test database is created and before the test callback is reached.

**Independent control-flow reproduction:** the original adapter was executed with dependency seams providing an already validated checkpoint. Checkpoint 62 reached the test callback; checkpoint 63 raised `ERR_ASSERTION`, actual 63 / expected 62, with no fixture SQL issued. Database calls were mocked; no PostgreSQL instance or full regression suite was started. Source SHA-256: `224ae63a8f4bd91081be039c4422a1e3dd575dfbbc969d6eb086581f496abaa2`.

**Impact:** this does not itself show that staff application behavior is wrong. It shows that the committed verification entry point cannot test that behavior on the new schema. The Task 4.1a-specific regression run exercised its selected children and 16 client/contact groups; it did not execute this complete staff dispatch. The final dependency map expressly identifies the client/contact wrapper as changed after those runtime runs. Static checks cannot establish that its dispatch succeeds.

**Required outcome:** support the exact approved current-63 fixture through the existing ownership and complete-checkpoint validation. Preserve historical-62 behavior and the distinct historical upgrade/canonical replay contracts. Do not remove the guard or accept arbitrary migration numbers.

**Correction proof:** run the staff branch through the actual current regression wrapper on a task-owned migration-63 copy. Confirm the staff test callback executes, its assertions pass, and cleanup/preservation succeed. Retain a valid 62 control or existing applicable 62 evidence; inspect the adjacent profile dispatches so another accepted checkpoint is not silently substituted. Use only disposable fixtures.

## What was independently verified

### Artifact integrity and exact scope

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| Implementation patch | 290,501 | `54e20ed2db335ce676848e99bfd2fb946a9a5f8abb13bb3c1f8fe68f7991cca0` |
| Final implementation review ZIP | 3,900,394 | `6cebf2d15ec6b63c1d63792e945c145b32822f196006d743dccce4db6d4d5851` |
| Attached final manifest | 144,775 | `55bd69ede11754e934800e39080d9c92dadeaa4bd9f3f5c86734c021c69520b8` |
| Separate delivery receipt | 13,616 | `0969dfbf8d9562cae6ff5022e5b560f117be9d8a7acff9e1af67d0a4968a9978` |
| Implementation report | 13,979 | `be2bc8987c17d1a4c8f05c43cd4fea0f61d6ba706b1424535db5f27d284e86f0` |
| Final acceptance matrix | 14,240 | `fc0bae38cc1ad2a306603a261ffc73e4284a93ef2d696aa6bbccb2941def424b` |

- The ZIP has 799 members: 798 payload files plus `MANIFEST.json`. Every payload filename, byte count and SHA-256 matches. There are zero missing, duplicate or unlisted entries. The attached `MANIFEST-final.json` is byte-identical to the internal manifest.
- Git's per-file statistics match 55 files, +4,757 / −96. All 55 final source blobs match the patch's full-index identities.
- The patch passed reverse checking and was reversed **only in an isolated scratch copy** to reconstruct its parent; forward applicability there also passed. All 421 supplied reconstructed parent files match the pinned GitHub tree at `25e318c...`. No Windows checkout was altered.
- All 62 old migration files and AGENTS, CLAUDE and DECISIONS remain byte-identical. The candidate migration is `20260910140000_recoverable_client_logos`.
- The 86 recorded checkbox lines comprise 83 in TASKS and three in PATCHES. Only Task 4.1a changed from unchecked to checked, recording local verification pending independent review. That checkbox is not owner acceptance.
- The initial acceptance matrix identity matches its receipt and predates the first recorded database attempt.
- The three dependency maps were reconciled against all 447 supplied source files per run. Two unchanged PowerShell files match the recorded Windows hashes after precisely the LF-to-CRLF conversion required by the repository attributes. Thirty-one inventory-only support files are not included as source bytes; their metadata was not promoted into independently examined file contents. All changed files and the dependencies needed for these findings are supplied.
- The final service/browser application dependencies match their recorded tested versions. Disclosed later documentation, lockfile flags and regression-wrapper changes were examined. R2 is the concrete uncovered wrapper defect.

### Supplied execution evidence

These are reviewed Codex execution records, **not runtime suites rerun by ChatGPT**.

| Evidence | Recorded result and review assessment |
| --- | --- |
| Service attempt 7 | 22 focused groups pass, including valid/invalid images, permissions, replay/no-op, recovery, concurrency, failures and integrity checks. R1's interleaving is absent. |
| Regression attempt 3 | 448 permission decisions, current-63 database/audit checks, audit-event regressions, 60 Gate 4 tests and 16 client/contact groups pass. This is not proof that the complete current regression wrapper's staff branch succeeds. |
| Browser attempt 6 | Four roles; 13 zero-violation accessibility scans; corresponding control/tree evidence; preview/cancel, save/archive/restore, stale refresh, disabled-session and request-boundary checks. |
| Build/static commands | Seventeen recorded commands exit zero: generation steps, eleven static checks, three guard self-tests and production build. |
| Narrow layout and zoom | 320-pixel reflow and native 200% browser zoom are recorded. Zoom changes inner width 1440→720 and device-pixel ratio 1→2, with CSS zoom remaining 1. |
| Visual examination | Eight supplied screenshot files inspected, including management, confirmations, archive fallback, recovery history, validation, narrow layout and zoom. No additional blocking visual defect identified in those images. |
| Cleanup | Successful suite receipts and the final process/resource checks report removal of task fixtures, mirrors and temporary logo trees. The first invalid process-check result is superseded by the separately recorded successful scoped retry. |

The database design uses constrained gateways, fresh actor/session checks, independent logo permissions, immutable import/version/submission evidence, optimistic versions and bounded history reads. The request/image handling applies body and file limits, validates content, prepares the image before persistence and retains explicit preview/confirmation. No additional blocking issue was identified in the examined paths; this is not a claim of exhaustive correctness.

### Preservation and the reported outage

The original complete before/after receipts remain byte-identical at SHA-256 `05a164f773ee7f9ade66b7db9886f110f8c50e11fb655cb6f28ad9ac3a0b89d6`.

A separate final observation differs from that baseline in exactly three places: Docker network EndpointID, network MacAddress and container start time. The remaining receipt contents match, including **107 tables, 48 complete sequence states, catalogs/configuration/migration evidence and all 54 original logos**. The protected-file comparison records 2,589 unchanged files in seven roots.

The owner confirmation, “Yes, network and power outage,” is preserved. The strict complete service-identity equality check remains a recorded failure; it has not been reclassified as a pass or hidden by replacing the baseline. The explanation is consistent with the three observed transient differences. No further owner explanation is required for this review.

The supplied final Git receipt records clean main, origin/main upstream, local HEAD `9bac6c6...`, sole parent/recorded fetched origin `25e318c...`, 1 ahead / 0 behind, no operation/lock and no push. These are dated supplied Windows observations. The independent pinned-parent lookup does not constitute a fresh observation of current remote main.

Actual project migration 62 remains applied and candidate 63 remains pending. This review executed no project database query, application build, browser session, migration or push.

## Remaining boundaries

- Windows power-loss directory durability remains a disclosed limitation. It is not used to excuse R1; ordinary overlapping request cleanup must still be correct.
- Fully written files from indeterminate/uncommitted operations must not be deleted by guesswork. Preserve the documented reconciliation boundary and retained evidence.
- All screen-reader speech actions remain excluded by the owner. No speech follow-up or blocker is introduced. Other accessibility obligations remain.
- Later matter/report integration, backup/deployment and cutover obligations remain assigned to their existing tasks.
- The supplied report, matrix, failed attempts, successful logs, outage evidence and original package must remain intact. Correction evidence should identify what was rerun and why.

## Recommended next decision

**1. Authorize a bounded R1/R2 correction in the SAME local Windows Codex Task 4.1a chat, followed by independent correction review.**

This directly addresses the recoverable-file failure and restores useful verification of the new schema. For example, if a litigation assistant retries a slow logo save, a failure in the earlier request must not remove the logo accepted by the retry.

The alternative is to defer the correction while leaving Task 4.1a unaccepted, unpublished and undeployed. That avoids immediate engineering usage but delays the feature and leaves the known defects unresolved. Accepting the current implementation is not recommended.

The main effort is coordinating file readiness, publication and failure cleanup and proving the concurrent failure cases; R2 is a narrower adapter and regression-run correction. Expect additional implementation and isolated-test usage, with no new purchase, paid scanning service or user-training requirement proposed. A reliable duration depends on the selected R1 protocol; an exact time or credit estimate is not established.

A later approved mandate should preserve `9bac6c6...` and the original artifacts, create one separate correction commit, run fresh tests for affected dependencies and the two demonstrated gaps, and deliver a correction report/patch/manifested evidence package. The actual project should remain at migration 62 with its original logos unchanged. Stop for independent correction review; do not push, deploy or start later work.

## Reviewer reproduction package

The accompanying `task41a-independent-review-evidence.zip` contains this report, the two unit reproduction scripts and their recorded outputs, the exact submitted source files needed for those reproductions, source-path context and the independent verification receipt. Its README describes the runtime, layout and scope.

The reproductions are independent fault/control-flow checks. They do not substitute for the required corrected Windows and disposable-database proof. This review itself changes no repository file and grants no new execution authority.
