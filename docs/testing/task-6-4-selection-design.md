# Task 6.4 approved continuation and bounded candidate design

30 September 2026. Implements the owner's adopted continuation SHA-256
`73c2168200064e8f1c001d065c7a28ea6137188ec6b5bfe5edd6aef98288c770`.
The earlier incomplete checkpoint remains dated history. D64-1, revised D64-2,
D64-3 and D64-4 are approved; no earlier automatic-only proposal applies.
This design was written before candidate migration77 SQL.

## Purpose, population and grain

`lawyer` is a third shared selection purpose, independent of `client` and
`closed`, not owned by a user or lawyer. One row per matter records selected,
an optional hearing ID, and an optimistic version. No initial choices or
legacy flags are imported. Client and matter filters in the editor select
what is visible; explicit Save changes exactly one matter, never hidden rows.

Five new reports accompany the preserved upcoming report:
`lawyer-principal-matters` merges A/copy; `lawyer-supporting-matters` preserves
B; `lawyer-all-matters` replaces the all-lawyers entry;
`lawyer-current-position` uses the source hearing-date period; and
`lawyer-new-matters` uses matter start dates. The nested A/all-lawyer summary
is not another menu entry. No report is an attendance or assignment-change log.

All qualifying is the default. For the four hearing-position reports, All
chooses latest hearing overall (date descending NULL last, ID descending),
then applies any hearing-date period. Selected uses the deliberately saved
hearing. A/B/all-lawyers retain active status; current-position has no status
restriction. New-matter distribution requires a current principal assignment
and a qualifying start date; Selected does not add a hearing requirement.
Upcoming keeps every qualifying next-date hearing and has no selected mode.

An otherwise applicable selected matter without a valid dated member hearing
blocks a position report with a correction link. Unrelated clients/assignees
or ineligible statuses do not block the requested population. A valid chosen
hearing outside the period is counted as excluded, never replaced. Empty
Selected stays empty and explains how to enter lawyer-report choices.
Archived report records remain eligible under the source qualifications,
but existing archived-matter/hearing write prohibitions remain enforced.

All position cells use the same hearing identity. A/all/current use hearing
court/circuit without matter fallback. B explicitly labels its matter court.
Matter distribution uses no hearing fields. Full-parent totals distinguish
matters and hearing records. Principal summary credits each distinct current
lead/co-lead once per matter, excludes support, preserves unassigned overall,
and explicitly discloses overlapping credits. It is independent of preview50.

## Authority and state integrity

All four existing roles may read/run/export subject to existing permissions.
Only Administrator and Litigation Assistant may save with both matter-update
and hearing-update authority. Page/action/service and database gateway enforce
the boundary. The gateway verifies the trusted human actor and fresh account,
person, role, session version, expiry, password and staff/login eligibility;
locks committing account/person and exact matter/client/hearing membership and
versions. No permissions or authentication mechanisms are expanded.

Serializable save and the existing bounded retry wrapper preserve atomicity.
Each changed save has one version, exact before/after history, receipt and
matching audit event; unchanged save has a receipt but no new version/event.
Exact lost-response retries return the original result. Changed payload or
different actor with the same submission fails. UI retains dirty drafts and
pending retry identity; navigation prompts before discarding changes.

Cross-purpose UUID uniqueness uses a private immutable registry, initialized
only from existing client/closed receipts (not choices). A unique primary key
and purpose-tagged INSERT trigger on all three receipt tables serialize even
concurrent attempts with stale snapshots. Existing migration76 cross-purpose
functions and triggers remain byte-exact and active. No runtime raw writes or
registry access are granted. New registry rows must correspond exactly to a
receipt, enforced by deferred constraints and ongoing db:check. Old receipt
bytes remain unchanged. Old selection checks accept only the precise added
registry trigger when migration77 is applied, and continue checking every old
function, constraint and trigger.

## Candidate77 object and privilege delta

Migration77 requires the direct migration principal and exactly76 successful
migrations. Migrations1–76 are immutable. Candidate objects:

- `public.lawyer_report_selections` (matter PK, optional hearing FK, selected,
  positive version), private change/submission tables, indexes, immutable and
  deferred completeness/parent triggers, audit field/table registrations.
- `public.lawyer_report_selection_save` and private account, validation,
  completeness, hearing-parent and immutable functions, following the accepted
  selection pattern without the closed-status restriction.
- `_migration.lawyer_report_submission_scope` registry plus associated insert,
  immutable and correspondence constraints; one added insert trigger on each
  of the three receipt tables. No replacement of old functions.
- `public.lawyer_report_historical_reviewer(integer[])`, a stable read-only
  SECURITY DEFINER accessor returning only matter ID, preserved team key,
  source-state discriminator and exact reviewer text. Stable source IDs and
  at-most-one team match are checked, never names; absent joins return a row.
  Duplicate source keys fail rather than multiply report rows. NULL, empty,
  missing key and unmatched key remain distinguishable. No raw payload or
  general staging access is exposed. Historical output is labelled
  `المراجع — كما ورد في المصدر`; it is not a current responsibility.

Runtime receives SELECT only on the new current table and EXECUTE only on the
two public gateways. PUBLIC/private/runtime write permissions remain revoked.
No roles, passwords, existing rows, sequences or source payloads change.
There is no new selection sequence. Prisma describes only the current table.
Read-only ongoing structural checks verify exact SQL, owner, config, privileges,
columns, constraints, triggers, indexes and receipt/audit correspondence.

## Isolated proof and preservation

Fresh intake found main at the unchanged published base, clean local d9d3784,
and the original owner PID/build, migration76 and1094 events. New evidence is
under `test-results/task64-continuation-20260930T202946Z`; earlier evidence is
retained. Candidate SQL is frozen, reviewed and hashed before applying only
to a positively owned disposable fixture. Changed SQL requires clean restore
and fresh upgrade proof, not ledger editing. Prove exact76 upgrade, empty new
choices, exact old selections/history/receipts and bounded catalog delta;
test refusal/rollback and all three purpose directions concurrently.

The adopted seven-part mismatch matrix is mandatory: independent All/Selected
IDs and coherent hearing fields; chosen-vs-latest/ties/newer/undated; date and
assignment distinctions; complete parties and historical absence; full-parent
totals beyond50/zero/shared/unassigned; independently decoded full XLSX and
visual PDF; four-role workflow, dirty state, stale/no-op/replay/history/zoom.
Client245 is checked against actual restored choices, not historic10/38 counts.
All15 accepted report IDs/meanings and upcoming are preserved; affected shared
paths receive fresh regressions. Every fixture effect/export is accounted.

This same mismatch checklist is recorded for later families but is **not yet
validated there**. No later-task implementation is included. Owner access
remains read-only. No owner migration, selection seed, activation, acceptance
or push is authorized. PDF copying remains accepted and unfixed; search is not
certified and neither diagnosis is reopened.
