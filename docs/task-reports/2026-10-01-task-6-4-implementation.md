# Task 6.4 — complete local implementation candidate

1 October 2026, Africa/Cairo. **Independent implementation review pending.**
Published base: `2d9a7c48a1633e38015f0de80e13a98049c64951`.
The original upcoming-report commits and `d9d3784` checkpoint are preserved.
Application source: `d4ee1d9d1055ba805e9e6b6d9d7a19bf961cfab3`, isolated build
`dV6wkGfF2-SxHassEZNGj`. The final documentation child's exact identity belongs
in the external receipt, not a prospective self-reference in this document.

## Delivered behavior and approved decisions

The owner adopted the original mandate and the approved continuation (SHA-256
`73c2168200064e8f1c001d065c7a28ea6137188ec6b5bfe5edd6aef98288c770`).
D64-1, revised D64-2, D64-3 and D64-4 replace the earlier pending proposals.
The [source map](../testing/task-6-4-report-semantics.md) records all eight
literal Access entries and their six standalone destinations, version 1:

- `lawyer-principal-matters`: merged complete A/copy layout.
- `lawyer-supporting-matters`: distinct support role and labelled matter court.
- `lawyer-all-matters`: current principal groups, including eligible unassigned matters.
- `lawyer-current-position`: hearing-date period, without an active-status restriction.
- `lawyer-new-matters`: matter start-date period, without a hearing requirement.
- `lawyer-upcoming-hearings`: unchanged every-qualifying-next-date-hearing behavior.

The first five default to **All qualifying**; **Selected for report** reads
only the dedicated lawyer choices and their deliberately chosen hearing.
All selects the latest hearing overall before applying the hearing period.
Selected never borrows client/closed choices, substitutes a later hearing or
falls back to All. A missing or invalid relevant position choice gives an
actionable correction; an out-of-period hearing is a filter exclusion.
Matter-only distribution permits a selected matter with no hearing.

Court, circuit, decision and hearing date come from one correct hearing,
except the explicitly different source-defined matter court in B. Missing
hearing fields remain missing. Historical reviewer text is labelled as source
history, never a current assignment. Missing history cannot remove a matter.
Complete linked party and capacity lines are retained. Principal credits use
distinct person and matter IDs from the full qualifying result, including rows
beyond preview 50. Shared credits overlap; the overall matter count does not.

The 27 September Access copy proves retained definitions and source text,
not today's department selections or live data. Client 245 is a regression
context, not a hard-coded business exception. Snapshot differences are not
repaired by report generation. All 15 accepted IDs/versions remain, yielding
21 registered definitions. The other 37 entries of the full 45-entry catalog
retain their earlier disposition. No Task 6.5+ work is included.

## Candidate database boundary

The [selection design](../testing/task-6-4-selection-design.md) preceded SQL.
Migration `20260930210000_lawyer_report_selection` is candidate 77, SHA-256
`3e917b8d0f709ac6b98f8c7a1c1becda5e34a4c7ebb2e2532e7ffa5fde70c3b0`.
It creates empty current/history/receipt tables and a private cross-purpose
submission registry, initially containing only 13 existing receipt identities.
Those identities are not selection seeds. A narrow read-only accessor exposes
only the historical reviewer fields. No broad raw-provenance grant is added.

All four roles retain read/run/export access. Administrator and Litigation
Assistant may explicitly save with both required update authorities; Lawyer
and Paralegal cannot save. The gateway revalidates the human actor, current
account/person/role/session, expiry, password state, parent membership and exact
versions. Archive write prohibitions remain. Serializable concurrency, stale
draft conflicts, no-op receipts and exact retries are preserved. One submission
UUID cannot replay across any of the three selection purposes, even concurrently.

Existing selection functions and applied migrations 1–76 remain byte-exact.
The ongoing checks validate exact new objects, rules, grants, triggers and
current/history/receipt/audit correspondence. Final validation found two
incomplete checker expectations (migration-77 staff boundary and the new ID's
entity-key audit classification); these were corrected without changing the
frozen SQL or reducing checks. The legacy fixture checkpoint reader also now
recognizes exact migration 77 while retaining its older target restrictions.

## Isolated evidence and preservation

New evidence root:
`test-results/task64-continuation-20260930T202946Z`.
Earlier evidence under `test-results/task64-20260930T171244Z` is preserved.
The original full-state migration-76 recovery was reused only after its hashes
and complete agreement with a fresh owner snapshot passed. The old populated
fixture dump was not restored or described as pristine in this continuation.

The new isolated cluster `7691431658251071526`, loopback port 52978, used its
own container, storage, credentials, dependency copy, browser cache and app on
3164. The pristine restore passed complete comparison and 148 historical plus
15 setup checks. Candidate 77 passed runtime-principal refusal, deliberate
pre-COMMIT rollback and additive-upgrade preservation checks. New choices
started empty. Complete final fixture gates passed at 77 with 152 tables,
48 full sequence vectors and 1,362 audit events.

Fresh owner checks passed at 76 with 148 tables, 48 sequences and 1,094 events.
Complete owner state matched the continuation baseline. All TASKS bytes and
86 checkbox lines, governance, applied SQL, protected configuration, 54 logos,
recovery members and 2,608 accepted artifact source/compiled/generated identities
were freshly checked. Dependency evidence reuses the earlier complete 35,183-file
inventory rather than claiming another full final scan. The exact owner process
was observed at PID 68632, accepted build `_RzjAkHqwy8M9tcZ9AF2I`; final dated
availability and post-package observations belong in the receipt.

## Validation and meaningful limits

- The final full project gate and production build passed; 480 permission
  decisions passed. Source/audit inventory includes the new guarded routes.
- Independent full-volume models cover 858 lawyer/report comparisons across
  all 137 person IDs, initially 1,744 matters and 13,384 hearings. They compare
  exact IDs, order, fields, groups and totals. A fresh upcoming oracle adds
  141 comparisons; unchanged earlier native 0/1/50/51 and date-edge evidence is
  explicitly reused.
- Five labelled native matters across two clients and seven hearings prove
  older-chosen/newer-expert behavior, ties, undated/missing hearings, inclusive
  periods, principal/support/retired roles, archives, unassigned matters, shared
  credits, party lines and absent history. Duplicate-role and equal-name read
  cases are literal defensive models; the real write gateway refuses duplicate
  people within one matter. They are not fabricated invalid database rows.
- Selection tests cover both permitted roles, denied and stale sessions/parents,
  six cross-purpose replay directions, cross-actor reuse, exact/no-op retry,
  concurrent token and stale-version races, least privilege and tampered invariant
  detection. Existing client/closed choices and history remain exact.
- Genuine fixture browsers cover five purposes under all four roles with saved
  PDF/XLSX for each, required fields, empty/full results, explicit execution,
  retry/Clear/history/reload behavior and accepted client/closed editors.
  Browser selection tests prove dirty-draft navigation cancellation, explicit
  saves, conflict retention, lost-response exact retry and restoration.
- Final corrected layouts use bounded horizontal table scrolling at 320/390px,
  desktop and genuine 200% browser zoom. Accessibility checks and keyboard
  scrolling accompany visual inspection. Saved-response replay is labelled as
  reflow evidence, not a new backend report test. Spoken screen-reader output
  remains outside scope; true browser back-forward-cache restoration was not observed.
- Independent inspection covers 34 saved XLSX and 33 saved PDF files in this
  continuation. XLSX checks cover complete typed rows, metadata, RTL, formula
  defenses and totals. PDF inspection uses font checks and actual raster pages,
  with 22 sampled pages visually reviewed across new layouts and affected old
  reports. It does not claim every page was visually inspected. General judgment
  retains its 80-row full population, 63/17 split and 78.75%/21.25% chart/table,
  beyond the 50-row preview.

The original upcoming four-role campaign and ten saved outputs are reused
separately. The 15 accepted definitions and upcoming produce byte-identical HTML
under the focused old/new PDF-renderer contract. Fresh client-245 All/Selected,
closed and judgment browser/export regressions validate affected shared paths.
The approved UI, Noto font and audit PDF timestamp direction remain unchanged.
**PDF copying remains an accepted limitation, not fixed. Search is uncertified.**
Neither was diagnosed or tested in this task.

## Failed attempts and exact accounting

Failed attempts remain in the evidence, with bounded fixes and no relabelling.
Notable failures were an initial oversized PDF banner (HTTP 413), a transport
failure after one PDF had completed, harness expectations for retry feedback and
Next Server Action status, and checker expectations for candidate 77. The new
PDF explanation was moved intact below the bounded repeated banner, without
relaxing its 115px limit. Narrow-width visual inspection later caught CSS
specificity overriding the intended table minimum; the final selector fixes it.

Next Server Action denial is wrapped as HTTP 500/Flight digest while the server
records AuthorizationError status 403/reason forbidden. Direct report routes
still return their specified 401/403 statuses. No authorization was weakened.
One browser no-write count assertion overlapped two legitimate fixture report
events; serial final denials and complete event reconciliation resolve its
limited observation. The original failed assertions remain failed records.

The fixture's 268 added events are exactly: 34 record updates, four password
resets, four password changes, 17 creates, 14 relationship additions, two
archives, one relationship update, 12 successful genuine logins, 112 report
executions and 68 export completions. The 112 executions comprise 43 previews
and 69 export executions. There are 67 saved/inspected outputs, one completed
but unsaved PDF and one rejected render with no completion. The unsaved receipt
was established before one bounded replacement; it is not claimed as inspected.
All unrelated rows, all full sequence state, old audit rows, catalogs, ledger,
roles, credentials apart from explicit fixture setup, and selection effects
are reconciled. Owner writes are zero.

Only positively identified task resources and temporary credentials are cleaned
up. Protected recovery and evidence are retained locally. The package verifier
checks exact membership, native Git objects/ancestry, forward/reverse patches,
protected bytes, evidence and fresh final receipt bindings; integrity PASS is
not independent implementation acceptance. The final five file names and exact
candidate/parent/tree, clean state, unchanged remote and cleanup result are
external receipts. **NOT PUSHED. Stop for independent Task 6.4 implementation
review. No owner migration, activation, acceptance closure or Task 6.5.**
