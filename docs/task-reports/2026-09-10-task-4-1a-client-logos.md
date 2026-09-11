# Task 4.1a — recoverable client logos

Locally verified on 10 September 2026. Independent implementation review, owner
acceptance and migration deployment are separate steps. Task 4.1a alone is
checked for local implementation verification in the single authorized commit.

## Behavior and permissions

The client detail opens logo management with the existing list/filter/contact
return path. All four roles can view the current logo. Administrator and
Litigation Assistant can select PNG, JPEG or GIF, preview it, cancel or explicitly
save a new/replacement logo. Administrator alone can archive a logo or restore
an archived/replaced version. Confirmation shows the client name, PostgreSQL
identity and selected filename; recovery also shows its retained image, stable
version identity and timestamp. This is a focused recovery list, not a general
audit-history screen.

An archived client keeps its readable logo and matters, but must be restored
before any logo mutation. An archived logo must itself be restored by an
Administrator before another replacement. Client archive/restore and logo
archive/restore are independent. Missing, changed or archived current images
fall back to the client name. Existing protected GET/HEAD headers and routes
remain independently authorized.

The permission matrix is unchanged. Page, Route Handler, request service,
management service and fixed committing SQL each enforce their applicable
permission/session checks. Lawyer and Paralegal cannot upload; Litigation
Assistant cannot clear, archive or restore through a forged update. SQL locks
the current actor/session and parent client before checking expected versions.

## Image and storage policy

The exact input cap is 2,097,152 bytes. Multipart requests are streamed under a
separate cap of that size plus 65,536 bytes of overhead. Sharp 0.35.3 was already
locked/installed and is now declared directly at the same version; no new
package or unrelated upgrade is introduced. Real signatures, MIME/extension,
complete bounded decoding, dimensions, total pixels, frames and output size
are checked. Maximum decoded dimensions are 16,000 pixels, total decoded pixels
16 million and frames 100. Newly submitted images fit a 1,200-pixel print width
without upscaling, preserving aspect ratio and PNG transparency. JPEG uses
quality 90; a validated GIF becomes its first frame in PNG. The 54 imports are
never resized or rewritten.

The configured server-local root remains D15 storage. A PostgreSQL client ID
selects its folder; a submission UUID selects an immutable generated filename.
Sanitized original filenames are metadata only. Paths, alternate streams,
reserved Windows names and linked roots/folders are rejected. The OS account
must exclusively control this storage root; an untrusted local process must
not be able to swap directories while the application writes.

Complete validated bytes are created exclusively and flushed before SQL can
reference them. Before SQL starts, cleanup may remove only this call's proven
exclusive file with matching filesystem identity. After a committing attempt,
the application never deletes the file: loss of a commit response is not proof
of rollback. A matching retry verifies the same bytes and uses an immutable
submission receipt. A stale competing request may leave an unreferenced complete
file. Integrity reports it as an unexpected runtime file; retain it until
in-flight requests are quiesced and a database/receipt comparison proves it
uncommitted. There is no automatic history garbage collection.

This ordering is tested against process termination and transactional failures.
It does not make PostgreSQL and the filesystem one atomic transaction. Windows
uses file FlushFileBuffers through Node; Node does not expose directory fsync
there. Sudden power-loss durability of directory entries is not claimed.
Deployment retains the coherent database-plus-logo backup requirement.

## Migration and permanent evidence

Candidate migration 63 adds immutable retained versions and submission receipts,
two operational current-logo columns, exact constraints/indexes/triggers and two
fixed runtime gateways. Current logo rows retain their original identities;
immutable import evidence still proves all 54 exact imported associations,
metadata, paths and hashes. Uploaded versions are checked separately against
their exact originating receipt and actor. Native uploads never count as imports.
The two new current fields have explicit audit classifications. Successful
changes, audit evidence and receipts commit together; no-op/replayed requests
create no duplicate success.

Runtime has no direct logo table/sequence write grants and no write access to
retained/import/audit evidence. Existing owner-only trigger functions enforce
immutability. Permanent checks compare exact gateway bodies and catalog shape,
plus all old frozen evidence. Migration 1–62 files and accepted baselines are
unchanged. Legacy delete-and-rebuild transforms fail closed at the operational
boundary. The new catalog snapshot describes new objects only.

Full-state copied fixtures compare all source rows, complete logical sequence
values/attributes, owners, grants and catalogs before accounts or migration.
PostgreSQL dump/restore has three reviewed constraint deparse equivalents;
their exact source/copy forms are listed explicitly. Physical OIDs and WAL
sequence reservation counters are not portable clone identities. The separate
actual-project preservation receipt still compares the complete original
sequence state, including `is_called` and `log_cnt`, without that projection.

The actual project remains at 62 applied migrations. Migration 63 is pending,
and application testing uses a migrated disposable database and copied logo
root in a separate production-build mirror.

## Backup and recovery

Back up the database and the entire configured logo root coherently, including
all retained archived/replaced versions and original imports. Required metadata
includes `client_logos`, `client_logo_versions`, `client_logo_submissions`,
`migration_client_logo_import` and audit evidence. Do not back up only current
paths, delete replaced files, or reconstruct current metadata from filenames.
Integrity reads every retained version and still validates every original
import. Missing/changed files require restoring the exact matching backup bytes;
restoring arbitrary replacement bytes under an existing immutable path fails
hash validation. A restore operation refuses an unavailable retained image.
Task 7.2 retains scheduling, email and off-machine deployment work.

## Verification and evidence

See the [acceptance matrix](../testing/task-4-1a-acceptance-matrix.md). Evidence
is preserved outside Git under the task's `task41a-review` directory.

- `service-attempt-7`: 22 completed focused test groups, historical full-state
  upgrade and separate empty canonical replay, source unchanged and cleanup
  passed. Groups contain the actual format/size/output-cap, permissions,
  concurrent/stale/replayed/no-op, archive/restore, actor-disable, filesystem,
  database/audit failure, process-interruption, integrity and recovery assertions.
  The count is groups, not a fabricated count of individual assertions.
- `regressions-attempt-3`: all 448 permission decisions; current migration-63
  historical verification **121/121**; 14 audit PASS groups, 12 audit-event PASS
  groups, Gate 4 **60/60** fixtures, and 16 client/contact mutation groups.
  Audit-event volume was 45,463 events, with the run's measured 50-row indexed
  retrieval recorded as 0.127 ms. These are disposable measurements, not a
  production response-time promise. One inherited audit log line says
  “canonical clean replay”; this run actually selects the explicit
  `current-state-63` restored historical fixture, as its source/profile/ledger
  receipts prove. Canonical logo migration replay is proved separately above.
- `browser-attempt-5`: all eleven static checks, three guard self-tests and the
  production build passed. Browser execution found a stale image display and
  a test selector ambiguity; it is not the final browser acceptance run.
- `browser-attempt-6`: all eleven static checks, three guard self-tests and
  production build passed. Four roles, 13 automated accessibility scans with
  zero reported violations, 13 checked accessibility-tree/control states and
  one genuine zoom contract passed. Native zoom changes 1,440 CSS pixels to
  720 at the same outer width, doubles DPR and keeps CSS zoom/visual scale at 1.
  Four representative stored screenshots were inspected directly: archive/name
  fallback, retained-version confirmation, 320-pixel reflow and 200% zoom.
  Direct invalid/empty/spoofed, exact/over-limit multipart, archived-parent and
  revoked-session requests also passed. No remote browser requests occurred.
- Final forced-read-only project verification: **116/116** at migration 62,
  with candidate 63 explicitly pending. Complete before/after receipts are
  byte-identical: 107 full tables, 48 complete sequences, catalogs/roles/grants,
  audit/ledger/service configuration and 54 original logos. All **2,589** protected
  files across seven roots retain paths, bytes, hashes, timestamps and file ACLs.

The final offline npm virtual-tree check corrected exactly three transitive
optional flags required by Sharp becoming a direct dependency. Versions,
resolutions, integrity hashes and installed decoder binaries are unchanged.
This lock metadata correction follows the browser mirror copy and is verified
by npm's own flag calculation; it changes no built application code.
The existing client regression wrapper now chooses audit profile 63 only when
its verified source checkpoint is 63, retaining its prior 62 selection otherwise.
The exact profile-63 child command passed in `regressions-attempt-3`; the final
wrapper-only change passed fresh local type/lint/format checks.

The browser found that an already decoded image could remain visible after
archive despite the endpoint returning 404. Management now renders the client
name immediately for an archived logo and changes its image URL with the
operational version. Client detail uses a fresh render token for its protected
image URL. The GET/HEAD authorization and private/no-store headers remain in
place. This also prevents a just-replaced logo from displaying old cached bytes.

### Failed attempts and corrections

All failed attempts and their cleanup evidence are retained, not relabelled as
passes. Early upgrade-smoke attempts corrected test SQL composition. Catalog
attempts 1–4 established exact portable clone comparison: physical catalog IDs,
default sequence ACL representation and three exact constraint deparse forms
were distinguished from real drift. Catalog attempt 5 passed. No historical
hash or project state was rebaselined.

Application attempt 1 found TypeScript and strict source-inventory integration
errors. Service attempt 1 found a redundant runtime row lock on a read-only
staff table; the redundant lock was removed while the owner-executed committing
gateway retains its actor/session locks. Service attempt 2 correctly rejected
custom archive-event parameters under the existing audit contract; the
implementation now uses its existing empty-parameter lifecycle contract, with
version evidence in atomic row events and immutable receipts. Service attempt 5
proved a denied ACL write, then hit an empty-directory cleanup API mistake;
the outer ownership-checked cleanup removed the fixture and the helper was fixed.

Browser attempts 1–4 stopped at static gates: test-helper placement in the
existing approved test-entry layout, required worker environment typing,
formatting, and a duplicate generated source-inventory entry. Those gates were
not weakened. Browser attempt 5 reached actual interactions; its test selector
matched Next.js's route alert as well as the form alert. It also exposed the
image-memory-cache behavior corrected above. Regressions attempts 1–2 found
old exact-checkpoint and disposable probe-grant expectations; those were extended
only for the fully validated migration-63 boundary. Regressions attempt 3 passed.

Sandbox child-process denials and the unsuccessful offline lock-only package
command remain in the command/permission ledger. Scoped authorized runs used
the installed runtime; no package, browser or plugin installation was needed.

### Dependency-based reuse

No earlier Task 4.1 acceptance total is presented as a fresh result. New logo
schema, gateways, storage, shared image display and affected readers have fresh
proof. All 15 other functions in `src/lib/client-query.ts` are byte-equivalent
at function level to the recorded base; only `readLogoMetadata` changes its
archive predicate. The exact hash map accompanies the package. Existing client
ownership/main-contact/classification rules, staff styling, fonts, R1/R2 query
helpers, and future matter/report integration policy remain unchanged. Their
prior accepted design evidence is reused with that limited dependency scope;
current permission, client/contact, audit and Gate 4 behavioral proof is fresh.

The source inventories recorded at execution/mirror copy identify the code
used by successful runs. Final documentation/checkbox edits require fresh
encoding, diff, scope and Git checks but do not invalidate decoder/database or
browser behavior. The separate delivery receipt supplies final commit identity,
file statistics and artifact hashes without a self-referential commit hash in
this report.

No screen-reader speech actions were performed or requested. Historical speech
remains untested without a pending speech action or blocker. Keyboard, focus,
programmatic labels/status, RTL, reflow, genuine zoom and automated accessibility
checks remain in scope. Tasks 4.2/6.2 retain future matter/report integration and
export checks. No deployment, push, Access cutover or later task is included.

## R1/R2 correction addendum — 11 September 2026

The independent implementation review found concurrent file-publication cleanup
and migration-63 staff-regression dispatch defects. The owner's subsequent
explicit mandate authorized both corrections. See the [correction report](2026-09-11-task-4-1a-corrections.md)
for the private publication protocol, exact current/historical fixture targets,
fresh failure and wrapper proof, preservation comparison and evidence reuse.
The original report above is preserved as an exact byte prefix. Its original
results remain historical evidence; correction review, owner acceptance and
deployment are separate. No task checkbox state changes in this correction.
