# Task 4.1 publication — independent review

Date: 10 September 2026. Scope: the owner's manual publication and Codex's subsequent verification receipts. This is an external review, not an instruction to edit the repository, publish again or begin the next task.

**Result: PASS for the publication outcome and supplied artifact-preservation evidence. No blocking finding or missing file.** GitHub confirms the exact reviewed target and two-commit chain. The supplied local receipts record clean main at the same target, 0/0. The receipt's narrower command/preflight coverage is disclosed below; this review does not certify unrecorded Windows checks.

Task 4.1 and Phases 1–4 remain owner accepted and are published. No new commit, push, fetch, runtime test or correction run is recommended for this closure. The prior automatic-review rejection remains preserved as history. Screen-reader speech actions stay excluded, and the future Tasks 4.2/6.2 integration requirements remain in force.

## Supplied files and independently calculated identities

All six files are readable UTF-8. The JSON documents parse without duplicate keys. The four reported receipt hashes match the uploaded bytes exactly.

| File | Bytes | SHA-256 |
| --- | ---: | --- |
| `publication-verification.json` | 259,126 | `5219e1300dddaee6fcfecb06794ef607eb8366ce15b7d92f7c3736c55dee8af8` |
| `publication-verification.md` | 816 | `d10f5d6054a15c45c4b94aad10c267864f67954e55a4467f61cb9881022469cd` |
| `pre-fetch-evidence.json` | 127,177 | `4ec003ee63eed9ea6c967a8e369461d1d6d3e4205f1a7bd218918294df1163f8` |
| `blocked-publication-receipt.json` | 4,223 | `925028c889ad6385f4601e547d21af0c08e83de31022adadd96a03177b8325b9` |
| `blocked-publication-receipt.md` | 1,225 | `ec86a9dba5559123c617be8275eacdf6919b096e6fce923fec70fbfdc41f3cf8` |
| `verify-owner-publication.mjs` | 8,923 | `c4a92eaf9ea7e6b2c3cd34f9907956b0604b73ce10ec2b8c87a1884905105f72` |

Separate before/after inventory attachments are unnecessary: both complete inventories are embedded in `publication-verification.json`, and the standalone pre-fetch file supplies the original before inventory. The uploaded files therefore satisfy the earlier request for the receipts and preservation evidence.

## Published checkpoint and local observations

A fresh read-only GitHub ref lookup recorded at **2026-09-10T12:18:26.827Z** confirms `refs/heads/main` at `25e318c9b7da8e939f3eea96c2ded83ad85ac0bb`. Read-only Git commit lookups independently confirm both subjects and each sole parent. The exact commit identities preserve the already reviewed contents; no new application review or runtime execution is necessary.

| Commit | Sole parent | Subject | Reviewed patch scope |
| --- | --- | --- | --- |
| `d4eed39612cf16b3a44808e056a21857642dc167` | `9f61ba481fbebdb2b0d54e470e43cd8d26014265` | `test: verify Task 4.1 Phase 4 acceptance` | 12 files, +1,206 / −40 |
| `25e318c9b7da8e939f3eea96c2ded83ad85ac0bb` | `d4eed39612cf16b3a44808e056a21857642dc167` | `docs: accept Task 4.1` | 6 Markdown files, +258 / −29 |

Sources: [main ref](https://api.github.com/repos/khalloda/litigation-system/git/ref/heads/main), [Phase 4 commit](https://github.com/khalloda/litigation-system/commit/d4eed39612cf16b3a44808e056a21857642dc167), [acceptance commit](https://github.com/khalloda/litigation-system/commit/25e318c9b7da8e939f3eea96c2ded83ad85ac0bb). These are point-in-time observations; recheck relevant state before future work.

The pre-fetch record is timestamped `2026-09-10T12:08:04.729Z`; the final receipt is timestamped `2026-09-10T12:08:54.672Z`. Both record branch main, HEAD and origin/main at the target, ahead/behind represented as `0\t0`, empty porcelain status, and the sole direct origin fetch/push URL `https://github.com/khalloda/litigation-system.git`. Tracking was already synchronized before the verification fetch, consistent with the preceding owner-managed Desktop publication. Those are reviewed supplied local observations, not direct access by this reviewer to the Windows checkout.

The owner reported making the push in GitHub Desktop. The remote target is independently confirmed; its presence alone does not identify the person/client that performed the push. The reviewer made no remote or Windows repository change.

## Preservation checks

The standalone pre-fetch inventory is identical in content to both embedded before/after inventories. All entries have unique paths, valid sizes and SHA-256 values, with no missing or changed record.

| Protected directory | Matching records |
| --- | ---: |
| `task41-phase4-review` | 349 |
| `task41-acceptance-review` | 53 |
| Original `task41-publication` | 8 |
| **Total** | **410** |

The pre-fetch and final proof objects, local-state objects and blocked-copy identities also match. After normalizing the common root, the 349 Phase 4 records additionally match the earlier baseline preserved inside the accepted acceptance-evidence ZIP. This establishes continuity with the previously reviewed preservation record.

All eight original Phase 4/acceptance patch, ZIP, manifest and delivery-receipt identities agree with the actual earlier uploaded artifacts, the current inventory and the receipt's proof list. Read-only patch statistics agree with both recorded commit scopes. The earlier accepted ZIP/member reviews are reused because the ZIP/manifest identities are unchanged; no patches were applied or re-exported in this review.

The attached acceptance review still matches 9,879 bytes and SHA-256 `7685429ace61cd0f7fe47a5cf2cb53e0b265ff31f75f16d406299bdd1142ca7d`. The supplied destination-evidence identity matches 1,839 bytes and SHA-256 `154e5bbf032f2d300b4b5b9c78b5a806f8599f4a2b16c1f6148c92909d8f2204`.

Both uploaded blocked receipts match their original reported identities and their entries in the original-publication inventory and copy lists. The original JSON records two successful narrow fetches, zero executed pushes and one push request rejected by automatic approval review before process creation. Its final remote remains the historical `9f61ba4...` base. That history is consistent with the subsequent separate owner publication and verification. Do not overwrite it with a success claim.

## Receipt coverage and non-blocking observations

The new receipt supplies the intended narrow fetch command and the resulting tracked ref but does not retain a separate command exit status, command timestamp or attempt/retry ledger. The uploaded helper has preflight/finalize modes and does not itself execute the fetch. Its finalize mode reads origin/main and writes the fresh-fetch wording. Because tracking already pointed at the target before this step, these files alone cannot independently prove the intervening fetch's execution or its exact attempt count. Codex reports that it ran; the fresh GitHub observation in this review independently confirms the publication outcome.

The helper also does not explicitly inspect the configured upstream or Git operation/lock state, force `--untracked-files=all`, or compare per-file statistics. It checks the branch, HEAD, origin/main, divergence, default porcelain status, exact origin URLs, commit parents/subjects/aggregate statistics and artifact hashes. Do not expand that into a claim that every requested local preflight item was freshly evidenced. Exact published commit IDs and the previously reviewed patches support the content/scope conclusion; the next separately authorized task should perform its normal fresh local preflight.

The inventories use absolute Windows paths consistently. Equality is validated by path/size/hash, with root normalization where comparing an earlier relative-path baseline. Historical blocked-receipt paths and relative links remain unchanged by design; they are not new output defects requiring a rewrite of preserved evidence.

These traceability limits do not change the confirmed published target or matching preservation evidence and do not justify another fetch, runtime run, patch, commit or receipt-repair cycle. Improve command/outcome recording in a future authorized receipt task. No Windows directory, database, logo, runtime process or current lock state was directly inspected by this reviewer. Database and browser evidence remains historical, and no screen-reader speech action was performed.

## Next planned task

Close this publication review. The accepted TASKS document identifies **Task 4.1a — Client logo upload** as the next unchecked item: Administrator/Litigation Assistant access; PNG/JPG/GIF up to 2 MB; preview and print-size handling; storage under D15; text fallback for a missing file; and recoverable removal retaining the file/evidence under D25. Its implementation requires a separate owner-approved prompt and fresh reading of the applicable repository authorities.

The benefit of proceeding in that order is completing client-logo management before the larger Matters screen. The implementation needs focused upload, authorization, storage/recovery and browser checks. No new purchase or service is proposed; development and Codex usage remain to be scoped in that next mandate. This review does not authorize Task 4.1a, later screens, deployment or final Access cutover.
