# Task 4.1a — independent correction review

Date: 11 September 2026

Reviewer: ChatGPT, independent of the local Windows Codex implementer.

**Verdict: PASS within the reviewed correction scope. R1 and R2 are closed. No must-fix finding, additional correction commit or missing attachment is required.** This is technical review, not owner acceptance, publication or deployment. The implementation and correction remain local according to the supplied Git receipt.

## Reviewed checkpoint and scope

| Item | Verified identity |
| --- | --- |
| Correction | `0bb729562c96668bc8f5e37789eef9ac68d69c16` |
| Sole parent | `9bac6c6f0c0472771c8cf8c07f93b2025e415693` |
| Earlier published checkpoint | `25e318c9b7da8e939f3eea96c2ded83ad85ac0bb` |
| Subject | `fix: close client logo recovery and regression gaps` |
| Git scope | 15 files, +1,068 / −69 |
| Mandate | The owner's approval of both findings and the prepared SAME-chat correction prompt; one correction commit, isolated proof and independent review |
| Actual project schema, per supplied records | Migration 62 applied; candidate 63 pending; no additional migration |

The editor's 23-file activity panel includes external preparation scripts. It does not replace the exact 15-file commit statistics, which match the patch and receipt.

## R1 — concurrent publication and cleanup: closed

The corrected `src/lib/client-logo-storage.ts` writes each request's attempt to a unique private filename. It writes, flushes and closes that file before creating the deterministic published name with a hard link. Publication does not overwrite an existing winner. A request adopting that name verifies file identity, exact length and hash, then independently flushes it before returning to the unchanged SQL service.

Cleanup is confined to the caller's private filename and checks its recorded identity. It never unlinks a published filename. Consequently, a later failure in request A cannot remove the published file returned to request B. A private name left by process termination can be inspected during quiesced reconciliation; it is not treated as permission to delete a retained version. No process-local mutex, stale-lock removal, extra SQL gateway or schema change was introduced.

**Independent reviewer execution:** the original and corrected functions were executed with unchanged function bodies and controlled import wiring on a real Linux temporary filesystem. The original function again lost B's returned file when A's held flush failed. Under the same interleaving, the corrected function retained the exact file. Additional checks passed for two prepared writers colliding at the final hard link, an adopter's own flush failure, conflicting content under the same submission, and creator failure after publication followed by recovery. All temporary reviewer files were removed. These were filesystem checks in one Node process; SQL publication was simulated, and no Windows or live PostgreSQL test was run by ChatGPT.

**Supplied Windows/database proof:** `runs/r1-before-attempt-1` reproduces the original loss with distinct processes and a real committed PostgreSQL current/retained reference. `runs/r1-final-attempt-2` tests the corrected implementation and checks exact bytes/hash, current metadata, retained version, submission receipt, registered audit actor and one audit event. Its process identities match the owned IPC workers. The evidence covers:

- B committing while A waits, followed by A's injected flush failure and stable replay;
- hard-link publication failure without a database change, followed by successful retry;
- process termination at private flush, before the link, after the link, and after commit before response;
- an adopting request's flush failure without loss of the existing reference;
- conflicting valid content without replacement of the published bytes.

The final source matches the tested storage and service dependencies. The existing 22-group logo service suite was also rerun. Its duplicate/no-op, database/audit failure, lost-response, actor/session/parent races, retained integrity and recovery checks provide adjacent coverage.

The implementation's writable verification handle is consistent with Windows' requirement that `FlushFileBuffers` receive a handle with write access; this code performs no content write through that handle. [Microsoft FlushFileBuffers documentation](https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-flushfilebuffers). Hard links refer to one underlying file and are constrained to the same volume. [Microsoft CreateHardLinkW documentation](https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-createhardlinkw). These platform facts support the examined mechanism; they are not a claim of hardware power-loss testing.

## R2 — current regression checkpoint: closed

`withCurrentClientFixture` now accepts precisely the complete validated 62/63 profiles. The isolated-cluster identity check and `assertCurrentClientSource` remain in place. It does not accept a migration count alone or bypass source validation.

**Independent reviewer control-flow check:** the corrected adapter was run with simulated validated checkpoint dependencies. Both 62 and 63 reached the callback and its modeled fixture cleanup. Checkpoints 61 and 64 were rejected before any modeled fixture SQL. This checks adapter control flow; it does not substitute for a real database run.

**Supplied integration proof:** both `staff63-attempt-1` and `staff62-attempt-1` run the actual `scripts/test-client-contacts.ts --regression-proof --suite=staff` wrapper against explicit owned source fixtures. The unchanged source-selection logic restores the supplied fixture through its descriptor, so the 63 run does not silently fall back to the project at 62. The logs show exact checkpoints, zero implicit migration applications, entry into the staff adapter, real staff assertions, 448 permission decisions, 121/116 invariants respectively, and fixture cleanup. The corresponding wrapper/adapter source hashes match the final code.

The adjacent 61→62 path previously used unrestricted pending-migration deployment. The correction selects an exact 1–62 mirror for the existing approved fixture targets. Config validation still checks the owned isolated cluster, loopback/non-project target, approved configuration name, real paths, no symlinks, exact directory membership and every migration's bytes. The supplied canonical control starts at exactly 61, stops at 62 with 63 absent, and rejects an arbitrary target/checkpoint. This is a justified neighboring fixture correction within the approved scope. The full old historical-61 application acceptance suite was not rerun or claimed fresh; current 62/63 staff execution and the affected migration-helper path were exercised.

## Artifact integrity and tested-source linkage

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| Correction patch | 82,293 | `7b4e20f27e44bc12fc064eb74d87dcab4d4ab7a3de4d2b490db48ca4ddcac9af` |
| Correction review ZIP | 2,137,101 | `c079c234578543d54858008b0df5744d35a520fb70ef62a13268afe1918bb4f3` |
| Attached/internal manifest | 44,422 | `0744ef336486703fd62de8bcc15bf34d4117b6f4c1354e57c50d9fdf733d0e43` |
| Correction report | 11,330 | `104492622508ed84a693429906dbd808ad65d7537aacced71d2a60c5b9b2ca53` |
| Final Git delivery receipt | 4,830 | `6aecc503edceb124fafcbf7d8aee2c8f1ed543f0404924e92ff2b75ece4cdf8d` |

The archive contains 250 payload files and one manifest: all 251 members independently verified, with no missing, duplicate or unlisted entries. The external manifest and patch match their internal copies exactly. Every listed delivery artifact identity matches the supplied bytes.

All 15 patch preimages match the previously reviewed implementation source; all 15 postimages and per-file statistics match the correction source and receipt. All 52 included source files match the reconstructed corrected tree. Forward checking/application and reverse checking were performed only in an isolated scratch reconstruction. The Windows repository was not accessed or changed.

Five final-run dependency maps were reconciled with their inventories and available source: four contain 483 entries/452 available source files, and the earlier staff-63 run has 481 entries/450 available files. Thirty-one unchanged supporting items are inventory-only, as in the original package; they are not represented as independently examined file bytes. No missing item prevents this correction review. Two unchanged PowerShell files require precisely the repository's LF-to-CRLF conversion to match their Windows hashes.

The final R1, service and browser runs predate only the correction report's final prose. The staff runs additionally predate changes to the separate publication-test assertions and status documents; those files do not change the staff path. The earlier audit/audit-events/Gate4/client-contact results remain labeled historical. They are not counted as fresh execution of the changed orchestration or storage code.

## Other verification, preservation and cleanup

- The final application record contains 17 zero-exit commands: two generation steps, all eleven static checks, three checker self-tests and the isolated production build.
- The supplied production browser proof contains 14 evidence records across four roles, 13 accessibility scans with zero reported violations, no remote request, 320-pixel reflow and native 200% zoom. The zoom record changes inner width 1440→720 and device-pixel ratio 1→2 while CSS zoom stays 1. Three screenshots were independently inspected: retained-version confirmation, narrow reflow and zoom. No additional blocking visual defect was found in those images. ChatGPT did not run a browser suite.
- All 63 migration files, governance/business decisions and the 86 complete checkbox lines remain unchanged: 83 in TASKS and three in PATCHES. The original report and matrix remain exact byte prefixes of the extended files. The independent review remains byte-identical at SHA-256 `6eace117b5c1d9a9b27f1739be21e2f83ad3d9366f03aff965afff1d1ec42f37`.
- The initial matrix hash matches its timestamped receipt and predates the recorded correction proof. Failed attempts are retained: the test-only account-versus-audit-actor assertion, the first browser invocation's missing installed paths, and the external scope-helper errors. Successful reruns supersede them without relabeling them as passes.
- The original pre-outage A receipts and strict service-identity failure remain preserved. The known post-outage B observation differs from A only in Docker EndpointID, MacAddress and start time. Owner confirmation of the power/network outage was already supplied; no further explanation is needed.
- Fresh correction C-before, C-after and B are byte-identical: 40,324 bytes, SHA-256 `4d16a6d54e69975ce80af4c0285bb1db70a24fb593345f9dc069fcd3ed33d942`. They cover 107 tables, 48 complete sequence states, catalogs/roles/configuration/migration/audit/service evidence and all 54 original logos.
- The 4,559-entry protected-file inventory includes all 2,589 original entries exactly. Its supplied verifier checks each file's bytes, hash, modification timestamp, security descriptor and unexpected additions across eight roots and records no difference. This is review of supplied evidence and checker code, not independent live Windows ACL inspection.
- The forced-read-only actual-project check records all 116 invariants passing at migration 62, with 63 pending. Per-run and final cleanup evidence records no task containers, volumes, networks, logo/checkpoint trees, application mirrors or matching task processes remaining. The reviewer executed no project database query or migration.

The only patch whitespace warning is the two Markdown hard-break lines in the byte-preserved original independent review. Retaining them follows the owner's exact-byte requirement. No correction or renewed approval is needed for that documented exception. A focused package scan found no concrete private-key, GitHub-token or Argon2-hash pattern; this is not an exhaustive secret-detection certification.

## Remaining operational boundaries

1. **Windows directory-entry power-loss durability remains limited.** The request-failure race is fixed, but the evidence does not establish survival of every abrupt hardware/OS power failure. Preserve the coherent database-plus-logo backup and recovery obligations; do not describe a file flush as a cross-system atomic commit.
2. **Deployment must use a supported filesystem and stop old writers first.** This protocol relies on local hard-link support. A future rollout must quiesce the previous implementation so its old cleanup code cannot run alongside new requests. These are deployment requirements, not additional R1/R2 defects. No deployment was performed or authorized by this review.
3. **No automatic orphan deletion.** After a crash, retain private and published orphans until quiesced reconciliation establishes their status. Retained recovery versions remain protected.
4. Actual project migration 63 is pending. Owner acceptance of implemented code, publication, controlled migration/operational verification and subsequent tasks are distinct gates. Later matter/report integration and cutover obligations remain assigned to their existing tasks.
5. All screen-reader speech actions remain excluded by the owner. No speech follow-up or acceptance blocker is introduced; other accessibility requirements remain in force.

## Recommended owner decision

**1. Accept the corrected Task 4.1a implementation and record that acceptance in one documentation-only local commit — Recommended.** Both concrete findings are closed by the code, independent focused checks and supplied Windows/database evidence. Preserve this review and the original report/matrix history. No further application correction or repeat runtime suite is recommended for that documentation step.

For example, when an assistant retries a slow logo save, failure of the earlier request can no longer remove the file returned to the retry. The regression entry point can now validate staff behavior on the candidate logo schema.

The alternative is to defer acceptance and leave the reviewed implementation local; this avoids immediate documentation work but delays the feature without addressing any remaining blocker identified here. Acceptance adds a small documentation/checking task and normal Codex usage, with no new purchase, service or training requirement. It does not authorize a push, migration, deployment, live use or Task 4.2. Those remain subsequent bounded decisions.

**Stop:** await the owner's acceptance decision. This review itself grants no new implementation or publication authority.
