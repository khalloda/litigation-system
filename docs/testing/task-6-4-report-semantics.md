# Task 6.4 lawyer reports — candidate source map

30 September 2026. Base `2d9a7c48a1633e38015f0de80e13a98049c64951`.
Implementation only: no acceptance, owner operation or publication.

## Source evidence

Evidence root: `test-results/task64-20260930T171244Z/`. The verified handoff
contains 1,008 members and binds all 995 accepted tracked identities.
`source-trace.json` binds the eight retained direct report exports and the
reports, queries, actions and dependencies catalogs. `source-compare.json`
records complete relevant control properties and the report-form controls.

The supplied 27 September Access review file remains SHA-256
`5b0ee4419e81b8f8f1c66834d0a24e2c023912acb1efd2617b58a435332b7dfd`.
Eight definitions were imported into a new blank task-owned database and
exported without opening reports/forms or executing startup macros. DAO found
zero linked tables. The source and read-only copy remained exact. All eight
reports' relevant properties agree with the retained exports. This proves
definitions, not successful historical execution. No source data was refreshed.

## Finite source-to-production map before adapters

The pending entries below are **unresolved implementation holds**, not a
partial-family completion. Production IDs for them await the explicit decisions.

| Exact source entry | Destination / status | Evidenced contract |
|---|---|---|
| `Copy Of تقرير فردي لفريق العمل بالمحامي أ` | Principal report, menu/selection decision pending | Reports Command248, caption without another lawyer. Query `تقرير فريق العمل حسب المحامي`, active matters, lawyerA contains Combo75, flagged hearings, inner historical-team join. Group client, sort client/case number; prints hearing court and circuit separately, parties, subject, hearing date/decision; final Count(*). No sole-lawyer predicate. |
| `تقرير فردي لفريق العمل بالمحامي أ` | Principal report, menu/selection/reviewer/summary decisions pending | Command146, caption with another lawyer. Exact same query. Adds lawyerA grouping, supporting lawyer and team reviewer; combined hearing court/circuit and dated decision. Footer embeds unlinked `Lawyers sub-report`. No shared-lawyer predicate. |
| `تقرير فردي لفريق العمل بالمحامي ب` | Supporting-lawyer standalone, selection/reviewer decisions pending | Command182, required Combo181, equality with source lawyerB, active matter and flagged hearing. Group lawyerB/client. Prints matter court/circuit (not hearing court), parties, subject, hearing date/decision, principal lawyer and old team reviewer. Count(*) is hearing rows in Access. |
| `Lawyers sub-report` | Nested dependency, summary decision pending | Same individual-lawyer query and Combo75 as A. Group by lawyerA combination text, group and grand Count(*). No parent linking fields. Not a standalone menu purpose. |
| `تقارير المحامين` | All-lawyers standalone, selection/reviewer/summary decisions pending | Command77, query `تقرير جميع المحامين`; both matter/hearing flags and active status, historical-team inner join. Group lawyerA/client, hearing court/circuit/date/decision, parties, subject, support and reviewer. Its unlinked footer still uses individual Combo75, so parent and footer scopes can disagree. |
| `تقرير بأعمال المحامي خلال فترة` | Current-position-period standalone, selection decision pending | Command224, caption current matter position. Required principal Combo223; inclusive hearing DATE Text227/Text229; flagged hearings; no status/completion/outcome condition. Group client; sort hearing date. Prints hearing court/circuit/date/decision, parties, subject and principal lawyers; Count(*). This is not an attendance or administrative-task report. |
| `تقرير بأعمال المحامي خلال فترة قادمة` | `lawyer-upcoming-hearings` v1, resolved | Command232. Required principal Combo223 and inclusive next-hearing DATE Text227/Text229. Every qualifying hearing, no manual flag, latest-only, active-status, archive or relative-to-today restriction. Group client; sort original hearing date (undated last), then hearing ID. Prints case, hearing court/circuit, parties, subject, next date, complete principal assignments and previous dated decision. |
| `توزيع دعاوى جديدة للمحامين خلال فترة` | New-matter-distribution standalone, selection decision pending | Command239. Inclusive matterStartDate Text235/Text237, lawyerA IS NOT NULL and matterSelect. One matter per row, group client, sort start date. Prints start date, case, subject, both assignment roles and category. It is not an assignment-change-date report. |

All legacy form selectors are name lists; replacements use current stable IDs,
including inactive/external people with current assignments. The source form
defines no default date values for these periods. A name match is never used.
D5 maps A to lead/co_lead and B to support. Retired assignments stay excluded.

## Pending material decisions

Four numbered questions were sent in this task: merge or retain A layouts;
replace or maintain legacy selection meanings; historical versus current
reviewer; and parent-scoped summary attribution. The suggested rules are not
approved merely because they appear in the questions. Earlier Task 6.2/6.3
decisions do not automatically extend to this family.

Read-only current evidence records 507 active matters, 283 with a flagged
hearing and five with multiple flagged hearings. Matter ID3269 has a newer
9 September 2026 hearing than its flagged record. This is a dated example,
not a permanent count invariant. The first source probe used an incorrect
retirement column and rolled back; corrected results use `is_retired`.
The second successful probe serializes civil DATE values directly as text.

## Resolved upcoming report

`lawyer-upcoming-hearings` has required lawyer/start/end fields. Its grain is
one hearing ID whose next date lies within the inclusive civil-date interval.
The query uses an exclusive next-day bound, independent of host timezone and
current date. It includes all qualifying hearings, so a matter may repeat.
Counts explicitly name hearing records, with an additional distinct-matter
total. A current lead/co_lead assignment qualifies through EXISTS; parties,
other lawyers and attendees cannot multiply rows. Actual attendance is not
inferred. D52/D58/D61 archive states do not remove source-qualified records.

Client grouping uses current client IDs; identical names remain separate.
Within a client, original hearing date ascends, NULL last, then stable hearing
ID. Current principal names are ordered by lead before co_lead, then recorded
position and stable IDs; inactive/external people remain visible. Parties and
capacities use accepted current ordered non-retired relations. Missing values
remain missing. No legacy court/name fallback is introduced.

Preview and both full exports use the same canonical result and approved UI,
per-line identifiers, Noto font and Cairo generation metadata. No new report
execution runs merely by loading the form. Existing engine authentication,
permission and audit boundaries remain mandatory.

## Complete catalog disposition

The unchanged complete 45-entry disposition in the accepted
[Task 6.3 source map](task-6-3-report-semantics.md#complete-authoritative-45-entry-disposition)
is the catalog baseline: nine accepted client definitions, six accepted matter
definitions, three accepted matter dependencies, these eight lawyer entries,
five Task6.5 entries, seven Task6.6 entries, six Task6.7 entries and one Task6.8
entry. This task accounts for exactly the eight deferred lawyer entries above;
the other 37 entries retain their disposition. No D17-dropped or unknown-layout
report is reinstated. Final coverage verification must check every literal
catalog entry exactly once, not infer coverage from a production-ID count.

## Boundaries

Migration76 and all earlier SQL bytes are frozen. No new migration is assumed.
TASKS, governance and recorded decisions remain unchanged. Owner access is
read-only; protected recovery and tests use a separate owned cluster/artifact.
Existing active/closed selections and all 15 accepted report IDs/versions are
preserved. PDF copying remains accepted but unfixed; search is uncertified.
Neither is tested. No speech testing is performed.

## First working piece evidence

The upcoming adapter passed an independent full-volume reconstruction:141
lawyer/date comparisons over13,384 hearings, including all137 person IDs.
The native fixture has one explicitly labelled closed matter and54 hearings.
It establishes inclusive leap-day bounds, next-day exclusion, no-next-date
exclusion, undated original hearing inclusion, exact empty/null decisions,
0/1/50/51 rows, principal/co-lead versus support, retired assignment exclusion,
and unchanged report output after hearing/matter archive. No source/manual flag
was assigned to these new records.

The first edge harness used hearing-style `facts` instead of matter-style
`counts` for its last archive request. That request failed validation before
the database action. A read-only outcome capture proved the matter remained
unarchived, its lead was already retired and one hearing was already archived.
The retained resume helper executed only the missing matter archive with fresh
counts and the original unused request, then repeated the post-creation read
assertions. The tracked test uses the corrected request. This harness failure
and the original attempt remain evidence; no failed proof is relabelled PASS.

Full project checks and all480 established permission decisions passed for
this first application piece. The edge harness was additionally typechecked
after its correction. Browser, saved exports and the remaining family are still
incomplete; these results are not final Task6.4 acceptance.
