# Administrative report choices — candidate migration 78

The owner approved separate, initially empty administrative-report choices on
1 October 2026. Multiple hearings within a matter and multiple steps within a
work may be chosen. These are shared only by the new administrative reports
whose source has the corresponding manual flag. Existing client, closed and
lawyer selections and all legacy flags remain unchanged.

## Storage and write contract

Two current tables hold an exact hearing ID or exact task-action ID, a boolean
choice and a monotonically increasing choice version. Their primary keys are
foreign keys to the corresponding records. Each has immutable change history
and exact submission receipts, including no-op receipts. No current row means
not selected; the migration inserts no new choices. Retained false rows are
not deleted. Nothing changes hearing, work, step, matter or client fields.

The hearing gateway requires existing hearing-update authority (Administrator
or Litigation Assistant), a live staff account/session, matching audit actor,
the exact client/matter/hearing membership and current matter/hearing versions.
The step gateway requires administrative-work update authority (also available
to Paralegal), exact client/work/step membership and the work's current aggregate
version. D62 advances that version for every step edit; a separate synthetic
step version is unnecessary. Lawyer is read-only. Archived selected records
remain reportable, but changing a choice requires an unarchived record and its
unarchived work/matter ancestors. Client archive is independent.

Requests have strict keys and types, one UUID submission token, one source
record and an expected choice version. Fresh authority precedes receipt lookup.
An exact retry by the same actor returns its recorded result; changed payloads,
actors or purposes fail. A unique five-purpose token registry covers existing
client/closed/lawyer and new hearing/step receipts, including concurrent writes.
It supplements the existing registries without changing their function bodies
or receipts. Deferred constraints enforce its exact receipt correspondence.

A changed choice emits exactly one ordinary audit event and one history row;
its version advances once. A no-op or exact retry emits no additional event.
Deferred checks require contiguous history, exact before/after states and
field-level audit correspondence. Runtime receives SELECT on the two current
tables and EXECUTE on two narrow gateways; no direct DML, private-table access,
sequence access or public execution grants are introduced. Ongoing db:check
checks the exact functions, structures, privileges, triggers and invariants.

## User interaction and report meaning

The existing report UI provides separate hearing and step choice lists, scoped
by an exact parent identity, with pagination and individually explicit Save.
Each row shows enough current context to distinguish its source record and the
saved choice; a dirty draft does not alter another row or report. Page opening,
filter changes and report generation do not save choices. Read-only roles see
the same saved population without controls that imply editing authority.

Reports preserve their other source predicates. Chosen hearing and step
contexts are aggregated independently before joining works: one work remains
one row even when both child collections contain several choices. The
destination-work report's maximum-date steps remain its own source predicate;
they are not replaced with chosen steps. The follow-up report has no manual
choice predicate. Empty choices produce empty qualifying results, never All,
legacy flags, another family or a latest-record fallback.

## Isolated verification and hold

Migration 78 is a candidate applied only to a positively identified disposable
full-state copy of owner migration 77. Verification covers initially empty
choices; all four roles; stale versions; cross-parent and malformed requests;
archived ancestors; no-op/exact/lost-response retries; competing and cross-scope
submissions; account changes; history/audit/privilege tamper refusal; ongoing
checks; and complete reconciliation. Existing selections and owner data remain
unchanged. Independent implementation review precedes owner migration or use.

## Working-piece evidence — 1 October 2026

The isolated 77-to-78 upgrade adds seven tables, two audit classifications and
six classified fields. All prior table rows, sequences, credentials, ledger
entries and catalog rows compare exactly. Both new choice tables start empty;
the new token registry contains only the 13 existing purpose-tagged receipts.

The first save test proved strict request/session/version refusals and one
atomic hearing choice with an exact retry. The copied non-Administrator
accounts still required password changes, so the Assistant save was correctly
refused. Full-state reconciliation established exactly one choice/event and no
other effects before four fixture accounts received independent test passwords.
The remaining campaign resumed from that recorded state; the initial evidence
was retained. Four-role reads, multiple choices, Paralegal step saves, no-ops,
same-record races, cross-purpose replay and a five-purpose token race passed.
Existing client/closed/lawyer current choices and histories remain exact.

Eighteen immutability and transaction-local structural-tamper controls pass.
Every deliberate defect is rolled back and the permanent checks pass afterward.
The 148 historical database checks also pass at candidate78. Initial comparison
harness fixes (the actual audit-counter table, JSON timestamp serialization and
explicit prior-audit-plus-one correspondence) are retained as evidence limits,
not reported as database defects. Browser, native-edge and final combined gates
remain outstanding at this working-piece checkpoint.
