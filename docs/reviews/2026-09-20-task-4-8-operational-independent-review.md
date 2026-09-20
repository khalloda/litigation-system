# Task 4.8 — independent acceptance, migration, activation and publication review

**Review date: 20 September 2026 UTC**  
**Verdict: PASS. Corrective findings: 0. Missing required files: 0.**

Task 4.8's operational delivery satisfies the approved handoff. Its independent review is closed at the supplied checkpoint. No further correction, migration, activation or publication run is requested. Task 4.9, Stage 5 and Ubuntu deployment remain unstarted and require their own scope and authorization.

This review was performed in the existing ChatGPT conversation, without subagents, implementation changes, owner-system access or publication. “Verified” below means archive/source checks or recomputation from delivered evidence. Windows execution, private-state collection, live browser observations and GitHub command results remain supplied evidence, not operations independently rerun here.

## Verified identity and scope

| Item | Independently checked value |
| --- | --- |
| Acceptance commit | `ba360643937fd0af9d11b12b7f18f8ddec093aac` |
| Sole parent | `90d0219aeffdd8e32b51ff60380e4edcc7e404b9` |
| Acceptance tree | `b62269996ff46fc34bb054e5fdb5ebf881c08e0e` |
| Published starting base | `c7de44a03710022ac7c47f4dbc4b093838afc31b` |
| Change | Eight authorized documents, +436/−2; 793→795 tracked paths; 787 existing paths unchanged |
| Task markers | Only Task 4.8 changes to checked; the other 85 checkbox lines are exact |
| Original matrix | Exact 4,836-byte prefix preserved |
| Imported implementation review | Exact 11,676-byte PASS report preserved |
| Migration 72 | `20260918100000_billing_arabic_labels` |
| Migration SHA-256 | `ff0c27c0102d7c8f72cb756277efe2c0b12fe83bce23425aa77f95767b0e2d95` |

All application/test source, migration bodies, schema, governance, dependency/lock files and older reports are unchanged by the acceptance child. The five PowerShell source representations used in the external artifact match the existing Git-archive CRLF conversion exactly; raw Git blob identities are separately preserved. No blanket newline normalization was used to approve an unrelated source change.

The complete documentation diff, current-versus-historical wording, D67 boundary and next-task restrictions were reviewed. A report's inability to contain its own future commit/publication outcome is correctly handled through external receipts. Two original Markdown hard-break lines in the mandatory verbatim review explain the narrow whitespace qualification; other document paths passed and no guard/hook/configuration was disabled.

## Archive and reconstruction checks performed here

The supplied ZIP is **58,525,911 bytes**, SHA-256 `7ab350dd81fcedcc03a940f5dc4ef76338c290eedd0a41b37f4f07a6ef6d9f95`. Its external manifest is SHA-256 `a6ff6198b3ab7cf88dff8f6cae97e41eaf59fdcfe0bff210105b8d057e722a90`.

A separate reviewer-authored check verified all **2,102 members**: exact membership, safe unique regular paths, Windows case/path restrictions, CRC, compressed/uncompressed size and SHA-256. All **2,101 internal receipt bindings** and four external receipt-listed companion identities match. All five requested upload files are present. The original implementation archive is included unchanged; no missing input or reviewer dependency was identified.

The supplied standalone verifier was read before execution and passed here. It reconstructs the raw commits and recursive Git trees, validates supplied source blobs and applies the exact acceptance patch forward and backward in a temporary Git directory. The two unchanged D59 file bodies are deliberately excluded from the shareable source; their opaque Git identities match. Full local reconstruction including those private bodies is a supplied Windows result, not a byte-level proof performed here.

The original adopted handoff prompt and candidate are exact. Separate reviewer checks recomputed changed paths, final document hashes, migration differences, old audit/ledger preservation, full read-window equality, catalog-row hash/count consistency, build/recovery bindings, protected-file equality and recorded publication chronology. These checks passed independently of the implementer's summary PASS fields.

## Migration, recovery and preservation

The capture helper was inspected. It uses a forced-read-only repeatable-read transaction, enumerates every non-system table, hashes full rows and every column, captures all sequence definitions plus `last_value/log_cnt/is_called`, and records named catalog/grant categories. Namespace ACLs use the actual catalogs and sequence defaults use lowercase `acldefault('s', owner)`. Prior audit and migration-ledger rows are additionally bound by individual IDs and full-row hashes.

The supplied owner captures span all **138 tables**, four schemas and **48 full sequence vectors**. The pre-gate, post-backup and immediate predeployment states are equal. Only the following six tables differ across actual migration:

- Three lookup tables: the eleven exact approved Arabic labels and `updated_at` values. Their other fields, IDs and codes remain exact.
- `public.audit_events`: eleven correctly attributed successful label-only events. All **869 earlier rows** remain exact by ID/full-row digest.
- `_migration.matter_lifecycle_audit_counter`: `last_value` increases by eleven; its other fields remain exact.
- `public._prisma_migrations`: one successful row with the reviewed checksum and one applied step. All **72 earlier ledger rows**, including the legitimate historical rolled-back record, remain exact. Completed migrations increase **71→72**; total ledger rows increase **72→73**.

The other **132 tables**, complete sequence vectors and supplied catalog/grant categories remain exact. This covers 543 invoices, 597 payments, 47 allocations, accounts, sessions and all other captured business/source data. The post-migration, post-gate, pre-browser, post-browser and final owner snapshots compare equal. No test business write or login exception is needed in that window.

The fresh protected recovery is retained at:

`D:\Projects\LitigationData\DB-Backup\migration63\pre-migration 72-20260920T091457Z-0e0368fb`

The space in that actual directory name is retained deliberately in this record. The exact dump hash is `16d2614e0df12e2e5e1f1cbc5d74617b6956ea4014e40dfc12bb7ba3d31562cb`. Its receipt binds 68 recovery members plus a separately hashed manifest; all 54 logo identities match. The recorded 127 recovery ACL entries restrict access to the existing owner SID, SYSTEM and Administrators. Private recovery/configuration/password bodies remain excluded.

The final isolated rehearsal uses that exact dump and a distinct PostgreSQL system identifier and port. Named grants, rows and logical sequence properties match after restoration. The 285 explicitly retained restore differences are narrowly explained: 45 WAL cache counters reset to zero, two namespace and 147 relation NULL/default ACL representations, 88 dropped-slot column-number compactions, one exact equivalent constraint cast and two generated fixture credentials. These allowances are not applied to the actual migration or read windows.

The protected-file inventory verifies **37,829 static existing files**, **98 root ACLs**, one link identity and two separately classified runtime logs; the total existing-file set is **37,831**. The final scan ran 10:25:38–10:32:32 UTC, after publication. Newly created build/recovery members are separately accounted for. The 68 recovery members, manifest and all 1,405 accepted-artifact output identities match that scan. These are recomputations of supplied inventories; their original private bodies and collection on the Windows host were not independently observed here.

## Supplied tests and runtime observations

| Evidence | Supplied result and precise scope |
| --- | --- |
| Owner pre-migration gates | 147 historical checks and 15 setup checks passed at migration 71 |
| Owner migration | One guarded deployment recorded 09:58:47.473–09:58:54.218 UTC; exact delta checked |
| Owner post-migration gates | 148 historical checks and 15 setup checks passed before activation |
| Pristine rehearsal gates | 147/148 historical and 15 setup checks passed in rehearsal-03; explicitly reused in final rehearsal-06 |
| Final rehearsal | Fresh exact-dump restore, identity/deploy/delta checks, four-role same-build browser smoke, read-window equality and cleanup |
| Project gates | Earlier aggregate components passed; aggregate exited 1 at sandbox Git-child EPERM. The remaining Gitignore and encoding components then passed unchanged through supported command-scoped execution |
| Actual browser | Existing legitimate Administrator session, 10:04:15–10:13:21 UTC; no new login, cookie/token access, account reset or business submission |

The stable artifact binds **793 source inputs, 25 dependency metadata files and 1,405 inventoried artifact files (including source)** to build **`l02XdOB10LpyGNufC8_Fs`**. The passing disposable browser copy used these same compiled outputs without rebuilding. All four roles exercised common list/search/Clear/history/pagination/detail-return flows, eleven labels, recorded 7.5% allocation, missing type and related navigation. The extra fresh paired-digit ID and combined-filter assertions are in the Administrator branch; broader previous implementation coverage is explicitly reused.

Actual owner evidence comprises **35 contemporaneously transcribed CUA observations**, with four transient/loading observations separately excluded from PASS. It supports Western/Arabic internal and legacy searches, Clear and history synchronization, pagination, labels, genuine links, missing values, separate Credit/Debit and the recorded 7.5% share. It is not an exported automated trace or video. Complete owner state remains equal across that session's read window.

Two supplied isolated screenshots were viewed here. The desktop image shows readable RTL invoice/payment/allocation content and 7.5%; the mobile image shows the top filter-form viewport without visible horizontal overflow. It is not evidence for everything below the fold or an actual owner screenshot.

The earlier exhaustive population/filter/security/permission/canonical/accessibility results remain dated reuse, not new tests by this reviewer. Speech testing remains excluded. No new JavaScript-disabled guarantee, full accessibility certification or complete response-body inspection is claimed. The inherited native-row SQL grants remain unchanged; application read-only does not assert that every conceivable direct native SQL write is impossible.

## Publication and final observed checkpoint

Raw command arguments and logs show **one ordinary non-forced push** from c7de44a to ba360643, containing only candidate 90d0219 and its single acceptance child. The exact push ran **10:21:55.776–10:22:01.563 UTC**. A post-push fetch and live ref observation completed by **10:22:03.710 UTC**, showing remote main, cached origin/main, local main and HEAD equal, clean worktree, divergence **0/0**. Destination is the approved `https://github.com/khalloda/litigation-system.git`, `refs/heads/main`.

The recorded runtime observation at **10:23:12.802 UTC** identifies PID **52576**, the stable external artifact and build **`l02XdOB10LpyGNufC8_Fs`**, listening only on **127.0.0.1:3000**. The owner database container identity/start time are unchanged and health is reported healthy. Startup logs captured at 10:25:53 UTC show readiness; the error log is empty. This is a dated supplied observation, not continuous monitoring or a fresh reviewer connection to GitHub/Windows.

Meaningful unsuccessful attempts remain preserved and explained: the existing migration-33 terminal-LF checksum exception, Date-versus-JSON helper comparison, concrete restore representations, browser import and oracle corrections, exact archive newline qualification, streamed redirect handling, the Git-child permission retry and verbatim-review hard breaks. The accepted application was not changed to resolve those helper issues.

**Closure:** Task 4.8 is accepted, checked and published at the verified supplied commit; independent operational review is PASS. No corrective Codex run or additional upload is required for Task 4.8. The next repository item is Task 4.9 — Audit history UI — and it has not begun.

## Reproduction and evidence record

The accompanying reviewer ZIP contains this report, input identities, reviewer checkers/results, the inspected-verifier result, selected exact operational records, screenshots, original manifest/receipt/verifier companions and context-preservation evidence. It is a review record, not a replacement for the complete 58,525,911-byte operational ZIP. Use that original ZIP to reproduce full archive, source, patch and evidence comparisons. No source file, owner resource, Git history or original evidence was modified during this review.
