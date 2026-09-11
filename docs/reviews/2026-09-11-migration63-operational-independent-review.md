# Migration 63 — independent operational review

**Review date:** 11 September 2026  
**Verdict:** **PASS for the local Windows development migration and bounded loopback activation.**  
**Source:** `2b866bae7929149c1ad200661225f4c2098f366d`  
**Owner acceptance of this operational delivery:** pending.  
**Production deployment:** not assessed or accepted.

The supplied evidence supports successful application of migration 63 once, a verified coherent local recovery point, an isolated restore and migration rehearsal, preservation of the protected project state, and the intended application running on loopback at the recorded checkpoint. No blocking defect was found within that approved development scope. No additional file is needed to complete this review.

Khaled clarified during review that the laptop and Windows environment are for application development; the final application and database will run on an **Ubuntu VM with Docker inside it**. This also agrees with the existing Stage 7 deployment direction in `TASKS.md`. This review does not turn the Windows laptop into a production deployment target or require an additional Windows hardening project. The clarification does not waive protection of the existing data and recovery evidence, and it does not prove that the future Ubuntu environment has been deployed or tested.

## Evidence and method

The review used the delivered sanitized execution ZIP, its separate receipt and supporting attachments, the approved execution mandate and readiness review, the preserved readiness captures and source-derived expected migration delta, and the committed migration/boundary-verification sources already obtained for the earlier review. Implementation helper scripts were read, not executed.

An independent offline Python comparison performed **101 checks; all 101 passed**. These are evidence comparisons, not another run of the application's tests or database checks. The reviewer did not access the Windows machine, execute migration SQL, restore a database, change permissions, authenticate, restart the app, fetch or push. Local process and Git observations below are dated Codex evidence, not a fresh observation of the owner's machine.

| Delivered input | Bytes | SHA-256 |
| --- | ---: | --- |
| `migration63-execution-evidence.zip` | 1,098,187 | `655273f3dd0993d0b55b2cac07094a270a4571d83981527afae9cf9732585478` |
| `delivery-receipt.json` (uploaded as `delivery-receipt(10).json`) | 2,954 | `94024e5827ba47ef108e8f2a1799aff6406045bec0ab668d60063e0e1d868089` |
| `migration63-operational-report.md` | 10,629 | `3c1d59827b2459233fa200a29827dde4fc43d9f98e53d7bbed19d9fbf5711463` |
| Execution `MANIFEST.json` | 17,699 | `dc2d1c3fe163d6fa64d2ca510c8c577fa9169d32eb7ff14711c3c3cdb75ec483` |

The ZIP has **103 payload files plus its manifest: 104 members**. Member paths, CRCs, uniqueness, exact membership, byte sizes and all payload hashes verified. The six receipt-listed deliverables are available separately or inside the ZIP, including `execution-addendum.md`. Raw dumps, environment files and raw runtime logs intentionally remain outside the sanitized package; they are not missing review attachments.

## Migration and recovery results

| Area | Independent assessment of the supplied evidence |
| --- | --- |
| Pre-window baseline | The fresh `live-before.json` exactly equals the previously accepted readiness receipt. The source is the expected cluster `7676117521894273062`, with 62 applied migrations, one historical rollback and no unfinished migration. |
| Backup consistency | Complete source state is unchanged across initial, post-backup and immediately pre-migration captures, allowing only the selected logo-root path change. A maintenance transaction held SHARE locks on all 107 project tables; captured writer checks were clear. |
| Recovery package | The fresh custom-format dump is 16,029,355 bytes, SHA-256 `5aa5095cd52a22701b4402e16460dd6f97332af71c7459fd3945d4f46c07edce`. Its identity matches the archive restored on the isolated target. All 54 original logo paths, sizes and hashes match the backup manifest. The package has 56 payload files: dump, logos and source receipt. |
| Isolated restore | Cluster `7684292889900052518` is distinct from the source. All 107 table contents, original migration ledger, roles, memberships, ownership/grants, functions, columns, indexes, triggers, logo provenance and files match the source. Logical sequences match. |
| Restore exceptions | Exactly 45 internal sequence `log_cnt` values differ; definitions, `last_value` and `is_called` match. Exactly three known constraint renderings differ: `attendee_source_cell_column`, `audit_events_device_shape`, `user_accounts_lockout_shape`. Inspection of the shown pairs finds Boolean regrouping and equivalent constant-array cast rendering. No other catalog difference was accepted. |
| Rehearsal | Native receipts show 116 invariant checks and 15 setup checks at restored 62, then 121 invariant checks and 15 setup checks after isolated 63. Complete successful result rows and exit codes agree with the summaries. |
| Actual execution | The source invocation began at `2026-09-11T15:10:48.1916160Z`, ended at `15:10:56.9997288Z`, and exited 0. The native log identifies only `20260910140000_recoverable_client_logos` as applied. The attempt record is 1; no replay is recorded. The completed ledger row has the approved checksum and one applied step. |
| Live delta | Exactly two tables were added, giving 109. All 104 unrelated old table digests and all three explicitly defined old-row projections match. All old ledger entries and all 48 complete live sequence states, including `log_cnt`, remain exact. |
| Exact catalog/security delta | All old functions, constraints, columns, indexes and triggers remain unchanged. The 4 added function bodies, security-definer/search-path/execute grants, 16 constraints, 20 columns, 9 indexes and 6 triggers match the accepted source-derived definitions. Only the expected two existing relation ACLs changed; new evidence tables have the expected restricted grants. |
| Registered data | Evidence records 54 retained imports, zero submissions, zero invalid initial rows and 602 audit classifications. The registration check reports zero invalid registrations and a final ledger of 63 applied, one historical rollback, zero unfinished. |
| Final validation | Source native receipts contain all 121 successful invariant rows and all 15 successful setup rows. The full post-migration and final source captures are identical. |

The maintenance guard was released immediately before the migration so it would not block the required DDL. The sequence of backup, successful rehearsal, build, security gate, release and source invocation is consistent. The review does not claim that table locks continued during migration; preservation is supported by the full before/after comparisons and recorded writer exclusion.

The exact local recovery root is:

`D:\Projects\LitigationData\DB-Backup\migration63\predeploy-20260911T150003164Z-0d643b99-9a2f-40c2-ab0c-d91a627d1d23`

The selected local-only package is authorized for this development task. It is not an off-machine backup and does not establish future production backup compliance.

## Storage, application and preservation

The new logo root is exactly `D:\Projects\LitigationData\client-logos`. The captured new data tree and artifact/config ACLs allow only the approved owner, Administrators and SYSTEM. The scoped `D:\Projects` change adds a this-folder-only Authenticated Users DENY DELETE entry; existing access entries remain, with ACL serialization reordering and the auto-inherited flag recorded. The original logo tree and other captured ancestors remain unchanged. The supplied same-volume probe passed private write/flush, hard-link publication, no-overwrite and adopter read-write/flush checks, and was removed.

All **3,352 protected inventory entries** match before and after, including bytes, timestamps and ACLs. The production-build receipt's **484 source file hashes** agree with the protected checkout inventory. The historical recovery package's 146 manifest entries, 147 files and three discovered archive hashes remain unchanged. The source database container's captured identity, configuration, mounts, network, ports and start time match.

The source remains clean `main`, tracking `origin/main`, at cached **0/0** and the approved commit, with no operation or lock. This task did not refresh the remote; no new publication is inferred.

The production-mode build succeeded with build ID `OQmfCgj6BGR1QINTIc5XP`. Here, “production build” describes the build mode, not acceptance of a production deployment. The captured process is PID 54172 under `KHELMY-PERSONAL\Khaled`, using the specified artifact and one listener at `127.0.0.1:3000`. Constructed build/runtime configuration contains the runtime database principal rather than the migration credential; the protected runtime-config hash remains unchanged.

The narrow smoke evidence shows Arabic/RTL login rendering, explicit unauthenticated client-page redirects to login, and a 401 empty response from the logo endpoint. The initial helper incorrectly demanded a redirect HTTP status from every protected page after starting the app. The corrected diagnostic verifies the streamed redirect instructions; it does not conceal a second migration or app launch. Next.js documents client-side meta redirects in a streaming context, so the HTTP-200-plus-redirect observation is consistent with the framework. [Next.js redirect reference](https://nextjs.org/docs/app/api-reference/functions/redirect).

The owned rehearsal container, volume, temporary credentials, fixture copy and probe were recorded as removed. The intended application, runtime configuration, new backup and historical recovery evidence were retained.

## Bounded observations and production handoff

**Development runtime dependency reliance.** The artifact uses a junction to the checkout's `node_modules`. The captured checkout and `litigation-client-builds` parent permit broader local access than the protected artifact leaf. The final ACL scan does not certify every resolved dependency path or ancestor. A junction references another directory, and Node resolves linked module paths; protecting the artifact leaf alone therefore does not make the runtime a self-contained trust boundary. [Microsoft junction documentation](https://learn.microsoft.com/en-us/windows/win32/fileio/hard-links-and-junctions), [Node module resolution](https://nodejs.org/api/modules.html#package-manager-tips).

This is a real limitation of the temporary development runtime, not a demonstrated compromise or a migration-integrity failure. No effective-access exploit or Windows rename attack was run. Following the owner's development/production clarification, no further laptop-wide ACL change, Windows service setup or private dependency copy is recommended as a prerequisite to closing this local milestone. Preserve the dependency relationship while this specific app instance is being used; a later authorized development task can deliberately stop/rebuild it if dependencies change. Do not ship this Windows artifact as the Ubuntu deployment image or treat these checks as certification against hostile local accounts.

**Authenticated views.** Actual authenticated client/logo/recovery screens remain unobserved on this running instance. The execution mandate explicitly allowed disclosure when no existing session was available. Broad accepted application tests remain historical evidence. This is neither a claimed pass nor an additional missing file. No credentials need to be uploaded and no reset or synthetic real-client mutation is recommended merely to close this review.

**Storage durability and backup scope.** Windows directory-entry durability across sudden power loss was not proved. Do not assume Ubuntu/Docker automatically resolves it. When production deployment is authorized, validate the selected Linux filesystem and actual mounted storage, image/dependency contents, runtime identity/permissions, secret separation, network exposure, authenticated workflow, and coordinated database-plus-logo restore on that target. Keep the existing Stage 7/D15/D16 off-VM backup, retention, integrity monitoring and spare-machine/printed-logo recovery obligations. The laptop's local-only backup exception does not satisfy those production obligations.

These items define the limits of this PASS. They do not authorize a production rollout or a new Windows hardening phase. All screen-reader speech actions remain excluded under the owner's instruction.

## Recommendation and next stop

**1. Recommend owner acceptance of this completed local-development operational milestone, followed by a narrow documentation record.** Record migration 63 as applied to the development database, preserve this review and the original operational evidence, identify Windows development versus Ubuntu VM/Docker production, and retain the disclosed authenticated-view and production obligations. Do not rerun migration 63 or repeat the backup/rehearsal merely to update documentation. The benefit is an accurate checkpoint before further feature work; the tradeoff is that production-specific verification remains for its actual deployment phase. For example, a subsequent Task 4.2 development prompt should expect the local schema at 63 while keeping the Ubuntu deployment task unchecked.

A later documentation mandate should allow routine document-validation fixes and evidence packaging, with no application/DB operation, permission change, dependency installation, fetch/push or production activity. It should use the existing Codex conversation and the lowest sufficient available configuration. No new purchase or service is required. This review recommends that next step; it does not record the owner's acceptance or itself authorize a repository commit.

The separate reviewer evidence archive contains the offline comparator, its results, input identities, this review and reproduction notes. Original implementation, correction, acceptance, publication, readiness and execution artifacts remain unchanged. Stop for the owner's operational-acceptance decision.
