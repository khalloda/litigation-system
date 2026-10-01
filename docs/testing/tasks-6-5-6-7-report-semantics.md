# Tasks 6.5–6.7 source map and candidate contract

Status: implementation in progress; no acceptance or activation. Published base
`186fd91d4528ac4da480a0699bd0fd44b4fb4749`, migration77. The owner's combined
instruction is the specific batching exception; all TASKS bytes remain frozen.

## Source evidence

The retained direct Access exports and catalogs under
`D:\chatGPT\Litigation-Database\analysis_direct` and `analysis\catalogs` were
traced before assigning production IDs. Evidence root:
`test-results/task65-67-20261001T104114Z`.

`source-trace.json` records all18 exact report names, source hashes, property
locations, SQL, callers and dependencies. A fresh read-only copy of
`D:\Projects\LitigationData\Access-Review\2026-09-27\Litigation database (ID 23194).accdb`
has SHA256 `5b0ee4419e81b8f8f1c66834d0a24e2c023912acb1efd2617b58a435332b7dfd`.
Only report definitions were imported into a new blank disposable Access database;
no source report/form/startup macro or business action ran. Named query definitions
were read through DAO. Both source and copy hashes remain exact.

The newer definitions confirm all material source predicates/controls. Three
exports differ only in an equivalent AND-join term order or an empty label's
serialization nesting. `source-definition-comparison.json` preserves these
differences; it does not claim byte equality. The old monthly-team report still
references obsolete column names. Its purpose survives, but D6's current
person-level team model prevents literal execution of that old SQL.

All nine original PDFs were located in ignored `docs/report-samples` and hashed
in `sample-inventory.json`. Movement cards are print-only: no custody transaction,
signature, stock decrement or invented movement history. PDF copying remains an
accepted limitation, NOT FIXED; PDF search remains uncertified.

## Eighteen-entry disposition and rules

The previously accepted45-entry catalog remains authoritative. Its21 production
reports retain their IDs and meanings. This table replaces only the18 deferred
6.5–6.7 entries; a subreport does not become an extra standalone screen.

| Source entry | Candidate disposition | Grain, predicates and fields | Grouping, order and parameters |
|---|---|---|---|
| `rptHearingsBetween2Dates` | `hearings-by-next-date` | Every linked hearing in next-hearing-date period; no status/manual/archive filter. Hearing court/circuit, current parties, subject, `previous_decision`, recorded current attendees. | Date headers; next date, hearing court/circuit, complete case number, hearing ID. Required inclusive civil period. |
| `rptHearingsDecisionsBetween2Dates` | `hearing-decisions-by-date` | Every linked hearing in hearing-date period; no status/manual/archive filter. Same hearing court/circuit and actual `decision`, not previous/short decision. | Hearing date, hearing court/circuit, case number, ID. Required period. |
| `توزيع جلسات أولي 31-12-2020` | `hearing-distribution-preliminary` | Every next-date-qualified hearing of a `سارية` matter. Short decision plus hearing date, except exact source first-hearing marker; current principal/support assignments, not actual attendees. | Next date, hearing court, case number, ID. Required period replaces no data: the legacy query already used date parameters. |
| `توزيع جلسات نهائي 31-12-2020` | `hearing-distribution-final` | Same active/next-date population; hearing court/circuit and dated short decision, recorded attendees. No manual flag or latest-row shortcut. | Source orders by matter court/circuit after next date, although it displays hearing court/circuit. Preserve and disclose this distinction. Required period. |
| `جلسات الشهر حسب الفريق` | Team-period adapter, attribution decision pending | Hearing-date period and active matters. Old matter-team filter cannot be silently converted to attendance or current principal/support membership. D6 requires people.team_id and an unassigned group. | English weekday/date headers, exact team identities, per-team deduplication and unduplicated overall totals required. |
| `rptSubNeededDecisions` | Embedded second section of destination administrative report | Source chooses max next date among court-action hearings per matter, joins every hearing at that date, then applies overdue-at-Cairo-today, hearing destination, active matter and hearing report flag. Not the dashboard overdue rule. | Hearing court/date/circuit. Short decision plus hearing date and next date. No unrelated standalone entry. Manual flag policy pending. |
| `أعمال إدارية` | Destination report, manual-flag decision pending | Non-null status other than `منجزة`; task destination; flagged matter hearings. Steps are all ties at maximum non-null action date, with absent step retained. Separate task/hearing/step contexts must not multiply rows. | Court, case number. Two always-visible sections: `أولاً: الأعمال الإدارية`, `ثانياً: القرارات المفتوحة`. |
| `أعمال إدارية جميع الجهات -جديد` | All-destination administrative report, policy pending | Same noncompleted/non-null task statuses; source requires flagged hearings and flagged steps, not merely newest steps. Includes client association. | Task destination groups; full work, result/action date, dated hearing decision, task court/circuit and business task age. |
| `أعمال إدارية حسب العميل` | Client administrative report, policy pending | Same legacy flag/status rules as all-destination variant, with exact client identity replacing the old name-based form filter. | Court/case order. Required client; client, destination, creation date/status, full task/step/hearing content. |
| `قرارات مفتوحة` | Destination-period open decisions, policy pending | Active matter; flagged hearing; next-date interval and hearing destination. Source does NOT additionally require next date before today. | Next date, hearing court/circuit. Full decision, hearing date, next date, parties. |
| `قرارات مفتوحة جميع الجهات` | All-destination overdue decisions, policy pending | Active matter; flagged hearing; next date strictly before Cairo today; linked client. | Source matter destination grouping and matter court/circuit, dated short decision. Preserve source distinctions explicitly. |
| `متابعة القرارات` | Notification-follow-up adapter; period decision pending | Active matter, hearing decision IS NOT NULL (empty is distinct), client_notified IS FALSE, linked client and resolved principal assignment. Legacy lower boundary1October2019, through print date. | Hearing date/court, case ID tie-breaker; previous/current decisions, notice state and attendees. No notification side effect. |
| `rptAllPOAs` | `poa-inventory` | One POA per row. `show_on_poa_report IS TRUE` per confirmed report-setting decision, independent of copies/archive. Retain source client storage qualification `poa_location <> تم تسليمه للعميل` including SQL NULL behavior. | Storage location descending, client ID/name, serial/ID. Full count plus explicitly labelled nonzero-known-copy POA count; zero-copy whole row yellow. |
| `تقرير التوكيلات` | `client-poas` | One included POA per row, required exact client ID; report flag true, zero/unknown copies independent. Number/letter/year separate; current capacity, never abandoned duplicate. | Serial/ID. No client logo per REPORT-LAYOUTS. Complete lawyers, notes, authority and issue date. |
| `تقرير المستندات` | `client-documents` | One document per row; exact client ID. No report-selection, stock or archive filter. | Serial/ID; stored description/date/page count/deposit date/responsible person/notes, complete case reference. |
| `تقرير جميع المستندات` | `document-inventory` | Every client-linked document. Stored Toyota Filter is inactive: both definitions have FilterOnLoad=0 and caller adds no filter. Do not hardcode Toyota. | Client sequence/name/file number, serial/ID, numbering resets per client. Includes client storage location. |
| `بطاقة حركة توكيل` | `poa-movement-card` | Exactly one selected POA as explicitly adopted, irrespective of list inclusion/copies. Header holds exact current record; named lawyers plus honest unresolved history. | Portrait single record, six manual-grid headings, blank rows. Original sample has25 complete ruled intervals (226.50–749.88pt), plus an unruled trailing margin; reproduce25 complete rows. |
| `بطاقة حركة مستند` | `document-movement-card` | Exactly one selected document; fixed stored header and three numbered out/return pairs. | Portrait, one record/page, blank writing fields only. No database movement fields or synthetic history. |

## Shared semantics and acceptance obligations

Civil DATE values retain their exact calendar date. Required periods use an
inclusive start and exclusive next-day end; NULL dates fail period predicates.
Cairo governs one captured generation instant, overdue comparisons and task age.
Task age uses `task_created_date`, never inserted `created_at`; unknown/future
business dates remain explicit. Dynamic dates are tested across Cairo midnight.

Current relations use IDs, non-retired assignments/parties/attendees and preserved
ordering. Inactive/external people retain valid report relationships. Archive is
not a report-selection or business-status filter. Cleared canonical fields are
never repopulated from raw text. Historical/unresolved source text is labelled
separately. Original strings, marks, line breaks, NULL and empty remain distinct.

Every list counts its actual grain from the complete result, independently of
the50-row preview. Any nested contexts are aggregated before joining parent rows;
no task × hearing × action multiplication. Team overlaps must be visible and the
overall hearing count unduplicated. Excel has typed complete values, RTL and
appropriate print setup; Playwright PDFs use accepted bundled Noto Sans Arabic,
readable wrapping/repeated headers and exact visible values. Cards are portrait,
ordinary lists landscape. The accepted per-part/per-line identifier display is
used for filters, metadata, preview and exports.

All four roles may run/export through existing server authority. Form opening
does not execute or write a report. No new durable selection storage is assumed;
client, closed and lawyer selections remain separate and unchanged. Any approved
new selection workflow requires isolated candidate migration review first.

Each production adapter needs an independent full-volume row oracle, exact edge
cases, four-role genuine fixture previews and saved PDF/XLSX exports, inspected
representative pages for each layout, narrow/zoom/keyboard/accessibility checks,
full authentication/report audit reconciliation and quiet-window fixture equality.
Final combined source/permissions/build/148+15 database gates and preservation
checks follow the last changes. Earlier evidence is reused only by exact hashes.

## Initial decision evidence

`decision-evidence.json` measures875 true,12507 false and2 NULL hearing flags;
1379 true and2104 false step flags. Some matters have two flagged hearings and
some tasks three flagged steps. These are deliberate legacy selections, not a
safe synonym for the latest row. Existing accepted editors do not maintain these
legacy flags; borrowing any accepted report selection would change its purpose.

There are4 people in each current team and129 with no team. Matter1713 has
assigned lawyers in both teams; matter1722 (`105 / 2019` and `1061 / 52ق`) has
both team-B and unassigned lawyers. Choosing principal-only, all assigned lawyers
or attendance therefore changes the report population and is a business choice.

The follow-up predicate before its fixed date restriction finds3947 hearings,
including661 before1October2019. Replacing that cutoff without an explicit
period decision would change the business population. These decisions do not
block the four fully traced period/distribution reports or document/POA work.

### Owner resolution — 1 October 2026

All three questions are now resolved in the same chat: all currently assigned
matter lawyers for team attribution; separate maintained administrative-report
choices that start empty; an explicit date interval for unnotified decisions,
capped at Cairo today. The initial source table above retains its trace-time
status; these choices supersede its pending labels. See the
[exact decision record](../approvals/2026-10-01-tasks-6-5-6-7-report-decisions.md).

The first working piece adds the four independently resolved period/distribution
adapters. A fresh isolated oracle checks16 full-population/date-boundary runs,
all row IDs/cells/order/date groups and distinct-matter totals. Its first attempt
omitted the required preview-format parameter and was refused before querying;
the corrected attempt passes. Native-edge and browser/export checks remain for
the combined implementation; this is not a final verification claim.
