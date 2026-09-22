# Tasks 5.2–5.5 — dashboard semantic trace

Candidate contract recorded 22 September 2026, before aggregate implementation.
Approved base: `952a4c54f873fee6881eec15c15cf1ed4540db42`. The owner's direct
one-time batching exception covers these four tasks only. TASKS stays unchanged.

## Evidence and limits

Retained exports are in `D:/chatGPT/Litigation-Database/analysis_direct` and
`analysis/catalogs`. The direct export metadata dates them to 19 August 2026,
from `Litigation database - analysis.accdb`. They are retained design evidence,
not newly recovered proof of full equivalence to the frozen migration binary.
D51 remains unchanged: historical source SHA-256
`1a1da8d573ca92ad67efbe638f2c043d02df278e88563c31eea8ce4a4f07b4bc`, derivative
`d25fb958ffc42d09b962d36e69de723d4595d960725540a96f01767601ec4a86`;
neither has been opened or changed for this investigation. Exact file bodies,
hashes and separately decoded form properties/XML are retained under
`test-results/task52-55-20260921T211339Z/source-trace/`.
No macro/VBA code was executed. No import or migration was rerun.

## Resolved source definitions and current translation

| Metric | Actual trace and source facts | Current interpretation |
| --- | --- | --- |
| Open decisions | `Dashboard` → `Dashboard item قرارات مفتوحة` → query `قرارات مفتوحة جميع الجهات`. `nextHearing < Date()`, matter status exactly `سارية`, hearing `تقرير = Yes`; order next date ascending. No administrative task, latest-step or latest-per-matter predicate. | Each unarchived hearing with `report IS TRUE`, next date strictly before the represented Cairo date, and associated active matter. Current matter/client archive does not hide it. A missing client remains visible under the adopted missing-reference requirement; a missing matter cannot satisfy active-matter status. This intentional left-client translation differs from the old inner join. Count hearing IDs, retain multiple hearings per matter; order next date then stable hearing ID ascending. Show 25 with exact total and dated list access. |
| Lawyer workload | `Dashboard` embeds BOTH `إحصائية أعداد الدعاوى لكل محامي أ` and `إحصائية أعداد الدعاوى لكل محامي ب`. Their queries use active matters, separate lawyerA/lawyerB substring membership, and LawyerID order. They count non-null matterAR; no employment/login predicate. | Replace obsolete name/team joins under D5/D6 with current, non-retired person-ID membership and distinct active matter IDs. Display separate lead/co-lead/support counts, keeping co-lead visibly distinct under the approved role mapping, and the union per person. All positive person groups, including inactive/external/non-login references, remain. Current person ID order preserves identity ordering. Report unique eligible matters and unassigned matters separately; person totals overlap. Archive-independent statistics; NULL/closed status excluded. Missing case-number text never discards a real current matter identity. |
| Top clients | `Dashboard` → `اكبر 5 عملاء` → same-named query: TOP 5, active matters, count matterAR descending, grouped by client name; no client-status predicate. Access TOP count-only ordering includes ties at fifth place. | Count distinct active matter IDs per current client ID, not names or branches. Preserve all fifth-place ties, ordered score descending then client ID; title/help disclose ties. No zero/filler clients. Missing-client count is separate. Archived/disabled clients remain; missing case-number text retains the real identity. These ID-based translations follow the adopted scope and D56. |
| Current-year outcomes | `Dashboard صالح-ضد السنة الحالية` has inline hearing SQL: `Year(التاريخ)=Year(Now()) AND [صالح/ضد] Is Not Null`. Pivot measure is `Count of صالح/ضد`. | Count recorded hearing IDs by hearing date in the complete Cairo calendar year, separate exact صالح/ضد and NULL/empty/other coverage. Multiple outcomes per matter remain distinct. No parent/status/archive filter. Months are presentation buckets; future months describe stored records, not forecasts or completed performance. |
| Five-year outcomes | Both `Dashboard- win-lose last 5y` forms reference the same crosstab. It filters only non-null outcome, groups by hearing date and counts non-null legacy case-number text. Neither saved query nor pivot table/chart defines a five-year endpoint; the title alone says last five years. | **Owner decision, 22 September 2026:** current Africa/Cairo calendar year Y plus four preceding calendar years, five annual buckets, from 1 January Y−4 inclusive to 1 January Y+1 exclusive. Thus 2026 displays 2022–2026, dynamically. The current year is explicitly incomplete; counts are not annualized. The adopted current-ID counting requirement replaces obsolete nullable case-text counting. Recognized outcomes, unknowns, undated/outside coverage and hearing-date field match the current-year view. No claim of byte-for-byte Access chart parity. |

The retained Dashboard closure names the first three metrics directly; the two
outcome forms are retained separately and explicitly named in Task 5.5's adopted
scope. Their absence from that older closure is disclosed rather than silently
inventing an embedding. Original source bodies remain evidence even where D5,
D6, D56 and the direct current-identity requirements supersede old joins/counts.

## Independent expected examples and protection

- Open decisions: yesterday/true/active qualifies; today, tomorrow, NULL next
  date, false/NULL report, closed/NULL matter status do not. Subject archive
  excludes; parent archive does not. Two qualifying hearings for one matter
  count twice. No task-step fixture affects this hearing metric.
- Workload: one active matter assigned to two people counts once in each
  person's total and once in the unique population. Retired memberships do not
  count; a support-only matter is not unassigned. Duplicate joined hearings or
  party rows cannot increase counts. Separate same-name IDs stay separate.
- Clients: independent fixture scores 9,8,7,6,5,5 return six client identities;
  fewer than five positive groups remain fewer. NULL client never gets a client
  link. Archive and business status are independent.
- Outcomes: two صالح and one ضد hearings for a single matter count 2 and 1,
  not one case. Unknown outcome or missing date is not a loss. Counts, chart
  bars and table use one result. Literal boundary dates and a separate fixture
  oracle establish year/month assignment, never the production helper itself.

Fresh authorization precedes every aggregate inside a repeatable-read/read-only
transaction. Ordinary query failure is local; authorization errors propagate.
Each panel has its own snapshot; one captured server instant anchors the new
date-dependent panels. No page-wide atomic database snapshot is claimed.

## Explicit resolution of the missing legacy date restriction

After source investigation, Khaled approved the current Cairo year and four
preceding calendar years in this same implementation chat. His instruction
specified five annual buckets, inclusive 1 January Y−4 and exclusive 1 January
Y+1, dynamic Cairo Y, an incomplete-current-year label and no annualization.
He also required preserving the established hearing-date field, hearing-ID
counting unit, exact outcome definitions and unknown/undated treatment, with
matching chart/table values. This is a new explicit business decision resolving
the missing legacy filter, not an inferred historical rule. The source evidence
and D51 limitations above remain unchanged. The exact decision is retained in
the task evidence and will accompany the implementation review package.
