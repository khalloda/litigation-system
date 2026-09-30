# Task 6.3 separate closed-report selections — candidate design

30 September 2026, adopted continuation. This design precedes any isolated
application. The repository has 75 migrations and no intervening candidate;
`20260930080000_closed_report_selection` is candidate 76. Owner application is
not authorized. Applied migrations 1–75 remain byte-for-byte unchanged.

Use a separate `closed_report_selections` table keyed by matter ID, with separate
immutable change and submission tables. Thus storage identity includes purpose
through the table, and each purpose has independent versions and histories.
The closed save gateway requires literal `scope: closed`; the existing client
gateway continues to reject additional fields. Both receipt tables additionally
reject a submission UUID already used by the other purpose, under the same
transaction advisory lock. This prevents replay even if a caller rewrites the
request's scope. No existing gateway, selection row, receipt or history is
rewritten. No new choice is seeded.

The dedicated database gateway follows migration 74's reviewed contract: current
account/person/session/role authorization under locks, human audit context,
serializable service retry, client/matter identity, matter/hearing versions,
archive restrictions, exact hearing membership, no-op receipt, immutable history,
deferred current/history/receipt/audit correspondence, and SELECT-only runtime
table access. A reopened matter retains its choice; the reader reports it as
ineligible and generation refuses until it is resolved or deselected. Status
is not an archive flag. Closed selections do not require a nonempty decision,
since the traced closed report does not impose that condition; an undated saved
hearing is incomplete for this required hearing-date period.

Reuse the selection editor through an explicit server-owned purpose. Dedicated
closed route/action/service bind that purpose rather than selecting a SQL table
from request input. The closed request includes the literal scope, and its title,
help, inclusion label and report metadata expose the purpose. The accepted client
route and input shape keep their meanings. Opening either route has no write.

Upgrade verification compares complete migration-75 state: exactly three empty
tables, dedicated routines/triggers/indexes/grants, one audit entity and four
field classifications, two cross-purpose receipt triggers and one ledger row
are allowed. No business/selection/authentication rows, existing sequences or
historical audit events may change. Existing invariants remain exact; candidate
checks add exact DDL/function/grant/trigger and ongoing history correspondence.
The shared-pool hazard and all mutation edge cases run only in isolated copies.
