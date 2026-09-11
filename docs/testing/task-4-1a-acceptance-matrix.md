# Task 4.1a — acceptance matrix

Initial plan: 10 September 2026, before any test, build, database connection,
fixture creation or browser execution. Exact capture time and SHA-256 are in
the external initial-matrix receipt. This working copy may acquire results;
the external initial copy is retained unchanged.

Mandate: owner-supplied Task 4.1a implementation prompt. Base:
`25e318c9b7da8e939f3eea96c2ded83ad85ac0bb`. One local implementation commit;
independent review, owner acceptance and project deployment remain separate.
No screen-reader speech actions. Existing speech evidence remains untested.

The immutable initial copy starts every row **NOT RUN**. This final working copy
records completed proof. Fresh proof is required unless an exact dependency
comparison justifies the specifically named historical evidence. Failed attempts
remain evidence; a later pass identifies its correction and final run.

| ID | Requirement and intended proof | Dependencies / freshness | Expected failure behavior | Cleanup / final outcome |
| --- | --- | --- | --- | --- |
| P01 | Exact main/upstream/base, all-untracked state, operations/locks and concurrency; one timestamped narrow fetch | Fresh Git and task/process receipts | Stop on drift, divergence, other writer or rejected fetch | PASS: exact preflight and one successful fetch; final Git identity is in the post-commit receipt |
| P02 | Full protected evidence, recovery, configuration, source, logo and existing build inventory; hashes and permissions before/after | Fresh filesystem inventory; compare handoff artifact identities | Stop on unexplained change; never adopt a replacement baseline | PASS: protected-files-comparison.json; 2,589 files / seven roots, exact hashes/timestamps/file ACLs and no additions |
| P03 | Forced-read-only full project receipt: 107 table contents, 48 complete sequence states/attributes, catalogs, roles/grants/owners, migration/audit/service identities | Fresh accepted-current-62 helper and handoff receipt | Stop on drift; no candidate migration against project | PASS: before.json equals after.json; 107 tables, 48 complete sequences, catalogs/roles/ledger/service; final current-62 check 116/116 |
| P04 | Original 54 files, exact paths, associations, hashes, permissions and 1,541,428 bytes | Fresh import reconciliation and filesystem comparison | Detect missing/changed files; no import rewrite | PASS: all 54 original files, 1,541,428 bytes and exact import associations preserved; service-attempt-7 and final preservation |
| P05 | Disposable historical full-state database and copied logo tree match source before accounts/migration; canonical empty replay separately | Fresh guarded ownership and source identity receipts | Fail closed on target/ownership ambiguity | PASS: source/copy row and portable catalog identities before mutation; service-attempt-7 historical upgrade and independent empty canonical replay |
| L01 | Upload PNG/JPEG/GIF for empty/imported/native clients; preview then explicit save; fresh read/restart | Fresh decoder, storage, service and production-browser proof | Preview/cancel creates no business row or success event | PASS: service-attempt-7 and browser-attempt-6; native/empty/imported, preview/cancel without writes, explicit save and fresh reads |
| L02 | Replacement retains old bytes and metadata; Administrator can recover a replaced version | Fresh version model, gateway and browser proof | No overwrite or silent history loss | PASS: retained bytes/hash assertions and actual browser replaced-version recovery |
| L03 | Administrator logo archive/name fallback/restore; client context and version confirmation | Fresh lifecycle, read path and browser | Other roles cannot clear/archive/restore through update or forged/empty payload | PASS: Administrator archive/name fallback/restore; browser caught and corrected image-memory-cache reuse |
| L04 | Archived client remains readable with logo; restore parent before every logo mutation | Fresh database locking, server and browser proof | Reject on archived parent; client lifecycle does not cascade logo changes | PASS: real parent lock race, every mutation denial, unchanged individual logo state, archived-parent browser view |
| L05 | Preserve R1/R2 list/filter/contact return paths and business fields, duplicate identities, imported unnamed contacts | Fresh affected client reads/browser; reuse only exact unchanged dependencies | No navigation loss or business-field mutation | PASS: all R1/R2 return parameters asserted in browser; 15 other client-query functions unchanged; 16 fresh client/contact groups |
| A01 | All existing 448 permission decisions plus pages, reads, routes, actions, service and database denials | Fresh full permission suite and new entry-point inventory | Deny unauthenticated/invalid/disabled/revoked and disallowed roles | PASS: 448 decisions; exact 29 client entry points; four-role browser, direct requests/service/database and real revoked-session proof |
| A02 | Spoofed actor/client/version, cross-client references and unauthorized clear/restore | Fresh direct server/database tests | No data/file/event change; no secret or path disclosure | PASS: forged role/account/person/session, cross-client version, empty/extra-field/clear requests rejected without business success |
| V01 | Byte cap 2 * 1024 * 1024; below/exact/above boundaries including multipart overhead | Fresh server validation and actual request limits | Oversize/zero input refused while valid exact-limit image accepted | PASS: actual valid below/exact/above 2 MiB files and exact/above multipart HTTP requests |
| V02 | Real signature/format and bounded complete decode; truncated/corrupt/spoofed/unsupported SVG/WebP rejected | Fresh installed Sharp API/types and adversarial images | Keep previous current logo and give recoverable error | PASS: actual corrupt/truncated/signature/extension/MIME and unsupported format cases |
| V03 | Print width/aspect ratio, no unnecessary upscale, transparency; deterministic GIF policy; dimensions/pixels/frames/output limits | Fresh image metadata/hash assertions | Bound resource use and reject unsupported output | PASS: 1,200 width/aspect/alpha/no upscale/static GIF; pixel/frame/dimension limits and below-input-limit GIF whose output exceeds cap |
| V04 | Generated immutable per-client paths; sanitized original names; traversal, ADS/reserved paths, symlink/junction and cross-client escape | Fresh local filesystem attacks against task tree | Never overwrite/escape source or committed file | PASS: unsafe names/ADS/reserved paths, linked root/client folders, exclusive file/retry and cross-client version rejection |
| C01 | Stale competing replacements, replacement versus logo archive/restore, client archive versus logo save | Fresh concurrent transactions with locks and committed-state assertions | Exactly valid winner; stale loser retains draft and prior evidence | PASS: actual concurrent replacement/archive/restore and observed parent database lock contention |
| C02 | Duplicate/replayed submissions, replay after later version, no-op version/event preservation | Fresh idempotency ledger and service/gateway proof | Same identity returned without overwriting later state or duplicate success | PASS: concurrent duplicate, replay after later save, create/update and lifecycle no-op counts/identity preservation |
| C03 | Actor/session changes during write | Fresh real race with trusted actor/session locks | Revoked/stale actor cannot commit business change | PASS: actual account-disable lock race and subsequent read denial; browser revoked sessions denied |
| F01 | Database and audit failure after durable file preparation | Fresh fault injection and subsequent recovery | Previous visible version retained; metadata/event rollback together | PASS: database-after-flush, real audit trigger failure and exact retry; all metadata/version/receipt rollback assertions |
| F02 | Write/rename failure, denied permissions and interruption at durability/commit boundaries | Fresh task filesystem/process fault tests | No database reference to incomplete bytes | PASS: actual denied ACL, occupied-path write failure, owned process termination before and after commit; no rename is used by this design |
| F03 | Indeterminate commit/response, retry/restart and recovery | Fresh fault tests plus readback of actual committed state | Never delete possibly committed bytes; no duplicate success | PASS: lost commit response then same receipt/file retry, plus independently terminated worker and fresh-process retry |
| D01 | Minimal append-only migration after 62; Prisma fields, constraints/indexes, fixed gateways and scoped runtime privileges | Fresh historical upgrade plus canonical replay | No direct broad table/sequence write or evidence mutation | PASS: service-attempt-7 historical upgrade and canonical replay; exact new catalogs, fixed gateways and runtime grants |
| D02 | Exact historical import identities/source metadata and hashes; native versions separate | Fresh permanent checks, negative corruption proof and immutable migration 1–62 hashes | Reject historical evidence change; no lower-bound/rebaseline shortcut | PASS: exact immutable 54 associations and native receipt provenance; owner mutation/truncate denials and rolled-back negative tamper detection |
| D03 | Catalog/trigger/grant/audit inventories; obsolete logo/client rebuild transforms fail closed | Fresh permanent and regression tests on candidate schema | Refuse destructive operational rebuild; correct atomic actor/event evidence | PASS: permanent exact inventory and fresh audit regression; both obsolete transforms refused before writes |
| I01 | Integrity and coherent backup account for all current/retained versions; missing/changed files detected | Fresh local file/metadata recovery on copied trees | Archived/replaced bytes never disappear from accounting | PASS: current/retained/import accounting, changed/missing detection, unavailable restore refusal and exact copied backup bytes recovery |
| R01 | Real-volume 318 clients/188 contacts and matter/report visibility, including largest 378-matter client | Fresh affected read/Gate 4 proofs; dependency-specific reuse map | Archive cannot hide existing matters/report query results | PASS: 318/188 paging and 378-matter client; 16 client/contact groups and Gate 4 60/60; later screen/export obligations retained |
| U01 | Four-role production browser, real upload/save/cancel/recovery and direct denied requests | Fresh isolated application mirror/migrated DB/copied logo root | Server denial independent of hidden UI controls | PASS: browser-attempt-6 on separate production mirror, four roles and actual mutation/denial flows; no remote requests |
| U02 | Keyboard/focus, labels/errors/status, confirmations, RTL/mixed text, genuine 200% zoom and 320 CSS pixel reflow | Fresh full Chromium, automated scans and inspected screenshots | Clear focus/errors; usable controls and no broken images | PASS: 13 zero-violation axe scans and accessibility-tree/control states, genuine 200% zoom contract, 320 px reflow; four screenshots inspected |
| Q01 | Eleven static checks and production build | Fresh separate mirror with candidate generated Prisma and fixture environment | Every command failure retained; exact final successful run identified | PASS: browser-attempt-6 all eleven checks, three guard self-tests and production build; source inventories and each command outcome preserved |
| Q02 | Relevant client/contact, audit, Gate 4 regressions; exact dependency reuse map | Fresh where schema/gateway/shared reader/runner changes invalidate evidence | Never present historical totals as fresh | PASS: regressions-attempt-3, 448 decisions / 121 current invariants / 14 audit groups / 12 event groups / 60 Gate 4 fixtures / 16 client-contact groups |
| Z01 | Full final project/file preservation, complete sequences, original logo evidence; final task-resource absence | Fresh forced-read-only current-62 receipt and file/ACL comparison | Stop/report differences; no cleanup of uncertain/original resources | PASS: final forced-read-only comparison and cleanup-final.json; no owned fixture, mirror, temporary tree or matching process remains |
| Z02 | Dated report, narrow status docs; exact checkbox comparison; governance/decisions unchanged | Fresh diff/doc checks | Only 4.1a checkbox may change after all checks pass | PASS: dated report/status updates; only Task 4.1a checkbox changes; exact final line/hash proof in scope-final.json |
| Z03 | Exactly one local commit with mandated subject/parent; binary-safe patch/reverse check; exact sanitized ZIP manifest | Fresh Git statistics, manifest member/hash checks and separate delivery receipt | Reject unlisted/missing/duplicate ZIP entries and forbidden payloads | Post-commit outcome reference: final-git.json, patch-verification.json, manifest-verification.json and separate delivery receipt. These are executed after this document is committed; no pre-execution outcome is inferred |

Planned resource policy: every disposable database, storage tree, mirror and process
receives a task-specific ownership receipt. Failed-run resources remain in the
ledger until proved removed. No reset override, source deletion, project restore,
push, deployment, Access operation, later implementation or speech action.

## Final evidence boundary

Final successful runs: `service-attempt-7`, `regressions-attempt-3`, and
`browser-attempt-6`. All earlier failed attempts remain preserved with their
corrections in the implementation report. The final actual-project check passes
116/116 at applied migration 62; candidate migration 63 remains pending.

The offline lockfile correction after the browser copy changes only required
dependency flags for the already installed Sharp dependency closure; npm
virtual-tree verification reports no flag drift and no versions changed.
Final status documents do not change tested behavior. Post-commit Git/patch/ZIP
proof is necessarily supplied in the external delivery receipt rather than
embedding a self-referential commit/archive identity in this committed file.
Independent review, owner acceptance and deployment remain separate.

## R1/R2 correction addendum — 11 September 2026

The original matrix above is preserved as an exact byte prefix. The supplied
independent review's R1/R2 findings have authorized corrections documented in
the [correction report](../task-reports/2026-09-11-task-4-1a-corrections.md).
The immutable pre-test correction matrix and final per-requirement evidence map
are in the separate task41a-correction-review package. They distinguish actual
PostgreSQL/separate-process publication proof, current-63/62 staff dispatch,
fresh service/browser/static/build verification and exact dependency reuse.
Project migration 62 and original evidence remain protected; migration 63 stays
pending. The next stop is independent correction review, not acceptance.
