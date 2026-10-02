# Task 6.8: proved source contract

Implementation candidate above published `eb79d5dc7c721165345ba64374542b0383b9c62c`.
Owner acceptance and activation remain separate. No schema change is required.

## Source identity and limitation

Read-only original: `D:\Projects\LitigationData\Access-Review\2026-09-27\Litigation database (ID 23194).accdb`,
60,424,192 bytes, SHA-256
`5b0ee4419e81b8f8f1c66834d0a24e2c023912acb1efd2617b58a435332b7dfd`.
All Access import/design attempts used task-owned copies. Original bytes were
unchanged. The owner used a separate Access copy for the new PDF samples;
identical current populations are not asserted.

| Route | Exact object | Meaning |
| --- | --- | --- |
| Command153, صالح/ضد → تقرير مفصل حسب المحامي | صالح-ضد مفصل حسب المحامي | New Task 6.8, all current principal sections |
| Command250, المحامين → الأحكام (صالح/ضد) | rptصالح-ضد مفصل | Existing Task 6.3, selected lawyer |
| Command128, detailed decision report | rptJudgmentsForAgainst | Existing judgment detail; different NULL/empty scope |

The query joins clients → matters → hearings. Dates are bounded by dashboard
Text106/Text108, and outcome is `<> ""`. There is no selected-lawyer parameter,
latest-hearing restriction, archive exclusion or report-selection flag.
38 recovered controls establish printed fields, visible groups and totals.
The query's renamed fields and several older control bindings do not match;
that is observed source evidence, not a diagnosis of the owner's unspecified
Access error. Import/SaveAsText and module-reading failures remain in evidence.
No conditional-format rule was found. Detail.OnFormat points to an unreadable
event procedure; its hidden behavior was not proved absent.

The owner answered **“Approve proved contract (Recommended)”** after being
asked to use the recovered query and visible layout as the complete contract
with no additional hidden row suppression. This explicitly resolves the
remaining business uncertainty. It does not claim recovery or repair of VBA.

## Current stable-ID mapping

| Printed value / rule | Current source |
| --- | --- |
| Client | `matters.client_id → clients.id/name_ar` |
| Complete case number, subject | `matters.case_number_ar`, `subject` |
| Court/circuit | `hearings.court_id → lookup_court.id/label_ar`, `hearings.circuit` |
| Parties/capacities | Current non-retired `matter_parties` and party-role links, stable IDs and established ordinal order |
| Dated judgment, notes | `hearings.hearing_date`, `decision`, `notes`; exact text/line breaks retained |
| Lawyer section | DISTINCT `(matter_id, person_id)` current non-retired `lead`/`co_lead`, then people ID/name; support and attendance excluded |
| No principal | Explicit unassigned section; hearing retained |
| Grain | `(current principal ID or unassigned, hearing ID)`; same matter may have several judgments |
| Period | Both entered dates inclusive; SQL lower bound inclusive, next-day upper bound exclusive |
| Outcome | NULL/exact empty excluded, other nonempty values retained exactly, including whitespace |
| Archive/native | No archive exclusion and no legacy-only restriction |
| Counts | Per-principal favourable/against/other/all; distinct overall hearing/outcome totals plus clearly labelled attribution count |

The query selects partner text but no visible target control prints it. No
historical-partner column, current partner relation or manual blanks are
invented. There is no new selection scope or schema migration.

The unchanged restored source had 13,384 hearings and 1,744 matters. Its
all-date oracle found 752 distinct hearings/752 attributions in seven sections,
including 556 unassigned. The deliberately labelled fixture edge records add
two matters and ten hearings; the combined full oracle becomes 759 distinct /
765 attributed rows. For the leap-day overlap case, five distinct hearings
produce nine attributed rows across three sections. These are fixture facts,
not changes to the owner database.

The 2010-03-01–2010-12-01 current fixture has ten hearings (4/6), all currently
unassigned. The supplied decision PDF also has ten (4/6), but matching totals
do not prove identical snapshots or lawyer assignments. The selected lawyer7
comparison checks 44 current rows against its independent oracle; it is not
the owner's selected Dr. Ahmed Abdullah five-row sample.

## Review evidence

Evidence root: `test-results/task68-reports-catalog-20261002T112022Z`.
`handoff/samples/identities.json` binds all three original PDFs and three PNGs;
all original pages/screenshots were inspected. `access-current-unknown-properties.json`
and the retained query definitions record successful trace, while the failed
module/import attempts remain distinct. Independent fixture row oracles,
edge-service receipts, full typed workbook inspection, saved PDF hashes and
visual inspection are included in the review ZIP. Credentials, session bodies
and recovery dumps are excluded.

PDF copying remains accepted but unfixed; search is not certified. N1
intermittent downloads remain owner-accepted, cause unresolved, NOT FIXED.
