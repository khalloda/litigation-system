# Task 4.1a — R1/R2 corrections

11 September 2026. Corrections to implementation commit
`9bac6c6f0c0472771c8cf8c07f93b2025e415693`; independent correction review, owner
acceptance and deployment remain separate. The supplied
[independent review](../reviews/2026-09-11-task-4-1a-independent-review.md) is
preserved byte-for-byte. Its two findings were authorized for correction by the
owner; the review itself is evidence, not an execution mandate.

## R1: private preparation and immutable publication

The original storage function let a concurrent request adopt a deterministic
path while its creator was still flushing. A later creator failure could unlink
that adopted path. The original function was reproduced unchanged in the
reviewer's real-file unit harness and then with two processes and actual
PostgreSQL publication in a verified disposable migration-63 copy. Request B
committed one current/retained reference and one submission/event; request A's
injected flush failure removed B's exact file. This was not a project-data test.

The correction writes each attempt to a unique private `.tmp` name in the same
client directory. After writing, flushing and closing it, the application uses
an atomic hard link to publish the deterministic submission filename. A hard
link adds another name for the same already prepared file; creating it fails
when the destination exists and never overwrites the winner. The application
then verifies the published inode, length and hash, and independently flushes
the adopted file before calling SQL. This happens for both a new publication
and reuse of an existing filename. On Windows, the verification handle permits
writing solely because FlushFileBuffers requires it; no bytes are written.

Cleanup can unlink only the unique private name with its recorded inode/device
identity. Even after publication, unlinking that name leaves the separate final
name intact. No participating request ever unlinks a published filename. A
failed post-publication flush, SQL error, process exit or lost commit response
therefore cannot authorize deleting a possible committed version. Private
orphans and unreferenced published files remain detectable by the existing
integrity walk and are retained until quiesced reconciliation proves what may
be cleaned. No automatic stale-lock deletion or history garbage collection is
introduced.

This coordination uses the filesystem across processes. It has no shared mutex,
polling loop, database lock or transaction around decoding/persistence. Existing
SQL lock ordering, current actor/session/parent/version checks and idempotent
submission receipts are unchanged. The storage filesystem must support local
hard links (tested on Windows NTFS; the same primitive is supported on Linux
filesystems such as ext4). Unsupported publication fails closed. Stop old writer
processes before a future deployment: an older implementation still has its old
unsafe cleanup rule. Deployment itself is outside this correction.

POSIX still flushes the publication directory; Windows still has the documented
directory-entry power-loss limitation. This does not excuse ordinary request
failures. Filesystem and PostgreSQL remain separate durability systems; coherent
database-plus-all-logo backups and retained historical versions remain required.

## R2: verified current staff dispatch and exact historical targets

The original staff adapter rejected an actually validated migration-63 source
before its callback, reproducing `63 !== 62`. It now accepts only the existing
complete 62/63 profiles after the unchanged isolated-cluster identity and full
checkpoint validation. Invalid numbers and sources remain refused. The sibling
adapter and production permissions are unchanged.

The real `test-client-contacts.ts --regression-proof --suite=staff` entry point
is exercised on explicit owned source fixtures. Its outer fixture already
selects the supplied isolated source through the existing descriptor; it does
not silently copy the migration-62 project when a verified 63 source is given.

Inspection also found the historical 61-to-62 callback used an unrestricted
pending-migration deployment. With candidate 63 present, that would advance too
far. Historical smoke/acceptance/current-upgrade paths now select an exact
1–62 migration mirror. The existing D35 config validator recognizes its precise
client62 filename only for the two existing client-fixture target names, checks
every directory/file against the repository and retains ownership/realpath/
no-symlink checks. Old 56/60/61 selections are unchanged. Current 62/63 paths do
not call migration deployment. No original migration or checksum is changed.

## Verification and evidence

The external sibling `task41a-correction-review` package holds the immutable
pre-test matrix (4,772 bytes, SHA-256
`8d197bf5622cbd627fb43f99342a24c2ec45fccb14d11fbb84b7306cf0e03708`),
recorded at 08:08:30 UTC before correction tests/queries. Its final matrix is a
separate file. Per-run inventories and `dependency-reuse-map.json` map exact
tested SHA-256 values to final files; the delivery receipt gives final commit
and artifact identities without embedding a self-referential hash here.

| Proof | Evidence and result |
|---|---|
| Original R1 | `r1-before-attempt-1`: unchanged original storage, two processes, actual SQL commit, exact file subsequently missing; reviewer unit reproduction separately retained. |
| Corrected R1 | `r1-final-attempt-2`: overlapping A flush failure/B commit, failed publication link, process termination during private flush, before link, after link and after commit/lost response; exact bytes/hash, current/retained metadata, actor association, one receipt/event/version and stable replay. Adopted-file flush failure and conflicting valid content fail closed. |
| Original R2 | `r2-before-attempt-1`: actual complete migration-63 validation followed by original adapter's `63 !== 62`, before staff callback. |
| Current 63 | `staff63-attempt-1`: actual `test-client-contacts.ts --regression-proof --suite=staff`, explicit owned 63 source restored by its outer fixture, zero implicit migrations, real staff child/body/assertions, 448 permission decisions and 121 permanent invariants. |
| Current 62 | `staff62-attempt-1`: same actual wrapper/adapter, explicit owned 62 source, zero implicit migrations, staff assertions, 448 permission decisions and 116 invariants. |
| Neighboring profile | `staff62-attempt-1/canonical-61-to-62.json`: canonical exact 61 then exact 62, candidate 63 absent; arbitrary checkpoint 63 and unapproved database target refused. |
| Existing logo failure suite | `service-attempt-1`: all 22 groups, full-volume reads, decoder bounds, owned ACL denial, role/session/parent races, duplicate/replay/no-op, current/retained recovery, audit failure, uncertain response, immutable imports and corruption detection; canonical 1–63 replay also passes. |
| Actual project | `project-final-db-check.json`: forced-read-only historical check passes all 116 invariants at 62, with 63 pending. |

The permanent dedicated test entry is
`scripts/test-client-logo-corrections.ts --publication`, `--staff-63` or
`--staff-62`, each requiring a new external `CLIENT_LOGO_EVIDENCE_DIR`. The
`--publication-before` and `--r2-before` modes intentionally assert the original
defects and are for reproducing the parent code in a separate owned checkout;
they are not passing regression modes for the corrected implementation. Fault
hooks exist only in a separate test worker requiring IPC, a verified owned
database and a temporary logo root. No real request reads those test controls.

`browser-attempt-2` passes all 11 static gates, three checker self-tests and the
isolated production build, then the existing production browser suite on full
Chromium 151.0.7922.34: 14 evidence states, all four roles, 13 accessibility
scans with zero violations, 320px reflow and genuine 200% native browser zoom.
Save/replace/retry/reload/archive/restore, stale and invalid input, preserved
previews and parent archive behavior pass. No remote request was observed.
Direct screenshot inspection confirms the recovery dialog and readable,
unclipped reflow/zoom views. Browser, server, profile and mirror cleanup pass.

Earlier audit, audit-events, Gate4 and client/contact behavioral results are
reused from original `regressions-attempt-3` only for unchanged enforcement and
business dependencies. All old SQL bytes, gateway/catalog definitions and
permission policies remain identical. The changed source pin and storage have
fresh service/browser proof; the changed fixture orchestration has real 62/63
staff dispatch and precise canonical target proof. The complete historical 61
application acceptance suite is not claimed fresh. Final documentation changes
do not alter tested behavior and receive fresh scope/encoding/diff checks.

Failed attempts remain evidence. `r1-final-attempt-1` failed a new test assertion
that incorrectly equated a login account ID with its distinct audit actor ID;
the assertion now checks the registered human actor and attempt 2 passes.
`browser-attempt-1` passed all static checks/self-tests and its production build,
then refused to start the browser because the invocation omitted the installed
Playwright/Chromium paths. The next attempt supplies the existing paths. Both
attempts cleaned their owned resources; neither is relabelled as a full pass.
A read-only scope helper's Git child was sandbox-denied before execution; the
supported command-scoped retry ran, exposed a `docs/PATCHES.md` path typo in the
helper, and passed after correction. Actual tool/child exits and permission
decisions are retained in the command ledger.

The original pre-outage A receipts remain intact. The known post-outage B
observation and owner confirmation remain intact. Fresh correction-before C
matches B exactly, including all 107 tables, all 48 complete sequence states and
the original 54 logos. The known three restart differences between A and B are
not new drift and are not silently erased by rebasing A. The fresh protected
inventory contains 4,559 files across eight roots, including the prior 2,589
files and every original Task 4.1a evidence file.

Fresh correction-after C matches correction-before C and B byte-for-byte
(40,324 bytes each, SHA-256
`4d16a6d54e69975ce80af4c0285bb1db70a24fb593345f9dc069fcd3ed33d942`).
All 4,559 protected files across eight roots retain exact hashes, lengths,
timestamps and file permissions, with no unexpected additions. All prior
2,589 protected files are included. Final read-only resource inspection finds
no owned fixture container, volume, network, temporary logo/checkpoint tree,
application mirror or test process. No temporary credential file or database
dump was created; fixture roles/credentials disappeared with their owned
clusters. Original A/B/outage and independent-review artifacts remain intact.

Actual project migration 62 remains applied and migration 63 pending. This
correction adds no schema migration, privilege or SQL gateway. All 83 TASKS
checkbox states and the three additional PATCHES checkbox states are preserved.
Task 4.1a's checked marker remains local verification, not owner acceptance.
No speech action, push, deployment, Access operation or later task is included.

## Owner acceptance addendum — 11 September 2026

Khaled Helmy explicitly accepted the implementation at
`9bac6c6f0c0472771c8cf8c07f93b2025e415693` and its correction at
`0bb729562c96668bc8f5e37789eef9ac68d69c16`. The preserved
[independent correction review](../reviews/2026-09-11-task-4-1a-correction-independent-review.md)
is PASS and closes R1/R2. This addendum records owner acceptance only; the
resulting documentation commit is identified in its external delivery receipt.

R1 now writes and flushes a private file before no-overwrite hard-link
publication; an adopter independently verifies and flushes the published file,
and cleanup is restricted to the creator's private name. R2 retains complete
checkpoint validation, supports only the verified 62/63 fixture dispatches and
explicitly stops the historical upgrade path at 62.

The service, concurrency/recovery, staff-wrapper, permission, static/build,
browser, preservation and cleanup results above are historical reviewed evidence.
No runtime suite was repeated for this acceptance-documentation record. At that
reviewed checkpoint, project migration 62 was applied and candidate migration 63
was pending. Acceptance of the code does not claim that migration 63 or logo
management has been deployed to the project.

Windows directory-entry durability after power loss remains a documented
limitation. A future deployment requires hard-link-capable storage, old writer
processes stopped, coherent database-plus-all-retained-logo backup and
reconciliation. Retained or orphaned files must not be guessed safe to delete.
These are separate operational obligations, not new work in this documentation
task.

All screen-reader speech actions remain excluded by the owner's standing
instruction. Historical speech is untested, with no pending speech follow-up or
blocker. Other accessibility requirements and future matter/report integration
remain unchanged. The immediate stop is independent acceptance-documentation
review; publication, controlled migration/deployment/operational verification and
Task 4.2 remain separate decisions.
