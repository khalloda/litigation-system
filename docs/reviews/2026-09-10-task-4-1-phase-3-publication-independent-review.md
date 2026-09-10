# Task 4.1 Phase 3 — independent publication review

Review date: 10 September 2026.

**Outcome: PASS. The two approved Phase 3 commits are published on GitHub main. The supplied preservation inventories match. Two escaping defects in the original publication receipt are corrected explicitly below; they do not require another push, a repository commit or another test run. No additional files are required for this review.**

## Independently observed publication

Read-only GitHub verification at **2026-09-10T08:42:21.219Z** returned `refs/heads/main` at:

`9f61ba481fbebdb2b0d54e470e43cd8d26014265`

This is a fresh remote observation, unlike the earlier cached `origin/main` records. The [published acceptance commit](https://github.com/khalloda/litigation-system/commit/9f61ba481fbebdb2b0d54e470e43cd8d26014265) and its [implementation parent](https://github.com/khalloda/litigation-system/commit/77baf2af2d079457f28ce1632f68e3f411cbdc48) have the exact reviewed identities and scope:

| Commit | Sole parent | Subject | Files | Insertions | Deletions |
| --- | --- | --- | ---: | ---: | ---: |
| `77baf2af2d079457f28ce1632f68e3f411cbdc48` | `82ca95c439e554bc8b55ffb3de0873827f8f3751` | `feat: add client and contact mutations` | 30 | 3,415 | 63 |
| `9f61ba481fbebdb2b0d54e470e43cd8d26014265` | `77baf2af2d079457f28ce1632f68e3f411cbdc48` | `docs: accept Task 4.1 Phase 3` | 5 | 170 | 24 |

The remote file names, full Git blob hashes and per-file additions/deletions for all 35 changed-file entries match their respective reviewed patches. The branch tip and exact parent chain establish publication of the approved two commits, with no extra intervening or subsequent commit at the observed checkpoint.

## Receipt and preservation evidence

| Supplied artifact | Bytes | Independently calculated SHA-256 |
| --- | ---: | --- |
| `publication-receipt(1).md` (original Windows name `publication-receipt.md`) | 2,939 | `c4e779cee14e9b8b8e49909326fd72d799f6687bc8bd5cb05bfa80cbe00a5173` |
| `artifact-inventory-before.json` | 93,930 | `2186c7664357826fea2e99fe7a29644fb0ae331543c945fb7d0d75ebdc98981c` |
| `artifact-inventory-after.json` | 93,931 | `89ecd58c7ea7cdc4f1b8711eedf87a72891d11a9e9ca9c19d3adeb969f0529e0` |

The receipt's size and SHA-256 match Codex's delivery message. It records completion at `2026-09-10T08:37:18.3102034Z`, following two narrow fetches and one ordinary non-forced push, all reported exit 0. It reports zero blocked attempts and zero permission-recovery retries. Requesting supported permission before executing a command is not itself a failed command attempt.

Both inventories contain **442 unique records**: 420 in the implementation artifact directory, 21 in the acceptance artifact directory and the attached acceptance-documentation review. Every relative file name, size and SHA-256 value matches between the inventories; there are no duplicate or case-colliding names. The inventory files themselves have different hashes because their timestamps and purpose text differ. This does not indicate changed artifacts.

The two patch identities, two ZIP identities, both embedded-manifest identities and attached acceptance-review identity were also matched against the previously verified files available to this reviewer. In particular, the correct acceptance ZIP SHA-256 is:

`acd755648e8919617412c0795fb3bb390a4a12a54e83c42ffcaa2a872f763080`

## Receipt correction addendum

The original receipt is preserved byte-for-byte under its delivered hash. This review supplies the following corrections without rewriting that historical artifact:

| Receipt field | Observed defect | Correct value and independent evidence |
| --- | --- | --- |
| Implementation subject | The initial `f` became a form-feed character, `U+000C`, at zero-based byte offset 557. | `feat: add client and contact mutations`, verified from published commit `77baf2af2d079457f28ce1632f68e3f411cbdc48`. |
| Acceptance ZIP SHA-256 | The initial `a` became a bell character, `U+0007`, at zero-based byte offset 2098. | `acd755648e8919617412c0795fb3bb390a4a12a54e83c42ffcaa2a872f763080`, verified from the actual previously supplied ZIP and both publication inventories. |

These substitutions are consistent with PowerShell interpreting backticks before `f` and `a` in an expandable string. The character values themselves are independently verified; their generation mechanism is an inference from the supplied command. The underlying commit and ZIP are correct. Use the verified values above and the structured inventories when preparing later prompts, rather than copying the malformed receipt fields.

No additional Codex correction round is needed to establish publication. When a future external receipt is generated, use literal text or structured serialization that preserves Markdown backticks, and check for unintended control characters before delivery. Do not modify old evidence packages to conceal the original defect.

## Verification limits and current checkpoint

The receipt reports clean local `main`, upstream `origin/main`, 0/0, no active Git operation/lock, no repository edits or new/amended commit, and no application/database/browser/Docker/migration/Access activity. Those Windows-local and execution claims remain attributed to the supplied receipt and transcript; this reviewer did not inspect the live Windows checkout or rerun the commands. The current remote tip, ancestry, published file identities, exact statistics and supplied inventory equality were independently verified.

The earlier implementation and acceptance-documentation reviews remain valid. The non-blocking 83-versus-87 checkbox-count observation and the isolated older TASKS return-point sentence remain recorded for their next relevant authorized update. Late acceptance-matrix documentation and untested screen-reader speech remain disclosed; publication does not resolve them.

Task 4.1 Phase 3 is owner accepted and published. Task 4.1 overall, Phase 4 and Task 4.1a remain unchecked. Publication is complete; no further publication or acceptance-documentation commit is requested.

## Recommended next owner decision

1. **Authorize a separately scoped Task 4.1 Phase 4 — Final acceptance task.** The published TASKS contract calls for static, permission, audit, reconciliation, concurrency and real-volume evidence; 318 clients and 188 contacts; duplicate identities and clients without contacts; the largest client with 378 matters; authorized local Arabic/RTL, keyboard/focus, form/confirmation/status-announcement, 200% zoom, 320-pixel reflow and logo-fallback checks; and proof that archiving a client cannot hide its existing matters or suppress them from reports. The next mandate should record its acceptance matrix before execution, identify valid historical evidence that can be reused, define any additional screen-reader-speech verification, and permit mutation proof only in positively identified disposable fixtures. The actual project database and original logos must remain protected.

   The recommendation is to perform that bounded final-acceptance work next, with an independent review stop before overall Task 4.1 acceptance. The benefit is closing the remaining cross-feature and real-volume acceptance requirements on the published implementation. The alternative is to keep the current accepted Phase 3 checkpoint while reviewing the evidence or arranging a particular demonstration; this avoids immediate test effort but leaves Task 4.1 incomplete. For example, archive a client in an isolated fixture and confirm that its existing matters remain visible to the relevant matter/report queries. Effort will be greater than the Git-only publication task and depends on actual evidence gaps; no new infrastructure, paid service or licence purchase is proposed. Phase 4 is recommended, not yet authorized or started. Task 4.1a logo mutations, new business rules, deployment and D43/D51 cutover remain separate.
