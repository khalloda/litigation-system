# Tasks 4.6–4.7 correction report

Date: 16 September 2026. This correction is based on candidate
`f8751a0133f2d618ff0a1bb18c6a53ebaebf2afa` and addresses independent-review
findings T4647-R1 through T4647-R6. It remains an unactivated candidate for
independent correction review. Tasks 4.6 and 4.7 remain unchecked.

## Corrections

- **T4647-R1 — filter synchronization.** Both list forms now have a
  query-dependent remount key and a shared client-side Clear control. Ordinary
  activation resets every draft control even at an already-bare URL; modified
  clicks retain native link behavior. `pageshow` and `popstate` synchronize all
  six controls with Back/Forward history. The production-browser proof checks
  applied filters, unsent same-URL drafts, repeated Clear, complete default
  results, history, and Control-click for all four roles and both modules.
- **T4647-R2 — exact relationship retries.** Covered-matter and matter-side
  reference editors freeze the exact serialized request and UUID across a
  thrown or generic uncertain outcome, disable mutable controls, focus Arabic
  recovery feedback, and provide an exact retry. Database tests prove exact
  retries after later retire/restore, replace/clear and archive, for both writer
  roles collectively, and prove fresh authorization withdrawal refuses receipt
  reuse. The browser test drops a response after a committed relationship
  change, compares the original/retry UUID and exercises recovery.
- **T4647-R3 — global token ownership.** Migration 71 adds one immutable global
  submission-owner boundary shared by all three gateways. One advisory-lock
  namespace serializes the UUID, and owner, actor, gateway, operation, entity,
  payload and result are bound atomically to the local receipt. Sequential and
  observed-lock-overlap cross-gateway reuse are refused; legitimate exact
  retries still return their original result.
- **T4647-R4 — semantic receipt validation.** Permanent validators now bind
  operation, subject, version, changed values, lifecycle facts, relationship
  arguments, global ownership, local receipts, histories and current state.
  Rollback-only disposable fault injections alter operation, subject, version,
  values, relationship arguments and orphan relationships; each is rejected by
  the final checker before rollback.
- **T4647-R5 — retained reverse evidence.** Fee-letter detail renders current
  reverse references separately from retained original/retired history and
  shows the raw source reference. Matter detail separately renders the current
  matter-side reference and the preserved original raw value, resolved fee
  letter and identifier namespace. The editor explicitly names the old and new
  fee letters. Browser proof clears, replaces and sets an imported reference,
  checks that cleared current data remains unrecorded, and confirms all readers
  can still see the original evidence.
- **T4647-R6 — proof and delivery.** The correction harness records commands,
  timestamps, exit status, tool versions and cleanup. A raw-data oracle derives
  expected complete IDs independently of the application query builders for
  all four roles, 16 document and 16 fee-letter archive/search/filter cases,
  every page and the last-page edge; it also compares every forward and reverse
  relationship row. Observed PostgreSQL lock waits cover document and fee-letter
  edit/edit, edit/archive and restore conflicts; competing covered-matter order;
  competing matter-side replacement; shared matter/client archive; responsible
  person deactivation; account/session invalidation; exact duplicate reuse; and
  changed-payload cross-gateway UUID reuse. The package includes final-source
  runs, failed/resumed attempts, owner observations, exact pre/postimages,
  patch, manifest, verifier result and receipt. Claims below distinguish new
  execution from reused evidence.

During correction testing, the production browser exposed one additional real
migration-71 defect: a committed covered-matter retirement changed the
audit-managed `updated_at`/`updated_by` fields, but the deferred replay validator
incorrectly treated those expected audit changes as unauthorized business
changes. The corrected validator excludes only those audit-managed fields while
still binding the membership identity, order, matter and retirement transition.
A new committed retire/restore regression and the final browser run both prove
the corrected deferred constraint. Earlier environment, timing and validator
failures remain in the evidence package rather than being overwritten.

## Historical evidence recovery and limits

The original `verification-result.json` was recovered byte-for-byte from
`D:\Projects\LitigationData\review-evidence\tasks46-47-combined-20260916T152647Z`:
483 bytes, SHA-256
`68895b570670bc9c1edec0824fd622c3b553829d85cca3f04dc008937c638662`.
The original package and candidate remain unchanged.

The original accepted runtime records also still exist. `accepted-launch.json`
records PID 67728, start time 10:44:42.671 UTC, working directory
`D:\Projects\LitigationData\task45-a1-accepted-20260916T103752Z` and build
`WvgH-6nuin9o1QPJrPst4`; `actual-health.json` is the later Task 4.5 health
receipt. A fresh read-only process observation confirms the same PID, creation
time, command path, loopback port and accepted-artifact build. The value
`Cl3PZ1Ejw8O-lhYlVMAJP` belongs to the development workspace's `.next` tree,
not PID 67728. The original implementation report incorrectly attributed that
workspace build to the owner process; the owner app was not replaced.

Some requested original records never existed. There is no original Tasks
4.6–4.7 dated owner before/after digest pair or full protected-resource
inventory behind the hard-coded summary, and no preserved file whose SHA-256
is `66992ab0eff4144b4586d5321ecfd2649f6630e41dee591b8ac4733b4d186a87`.
The canonical executed-source copy that does exist has a different hash, and
the later final browser manifest only refers to the missing hash. These gaps
are reported, not reconstructed or backdated. Fresh correction observations
have their own timestamps and do not pretend to be the missing historical
records.

## Evidence classification

Fresh correction evidence consists of the correction historical-copy run,
canonical migration run, production-browser run, permanent-checker faults,
independent full-population oracle, project gates, fresh read-only owner state
and runtime observations, and final package verification. Reused evidence is
limited to the unchanged original verification result, the independently
verified reviewer bundle, original candidate/package, original canonical and
browser artifacts that still exist, and the Task 4.5 accepted launch/health
records. Reused evidence is never relabelled as a new execution.

The fresh owner database observation uses one repeatable-read, read-only,
deferrable transaction and emits only row counts and aggregate SHA-256 digests,
all 48 sequence states, account-set and logo-set aggregates. It emits no row
bodies, credentials or tokens. The owner remains on 70 migrations. The app is
observed only through process/listener/file metadata; it is not opened,
restarted or changed.

## Disposition

No owner migration was applied, no candidate was activated, no remote was
pushed, no task checkbox changed, and Task 4.7a/4.8 were not begun. Stop after
the single local correction commit and return the supplied package for
independent correction review.
