# Reports

**45 reports** must be reproduced. Every one exports to **Excel** and **PDF**.

Reduced from 49 — see D17. Four were the same report with hard-coded filters;
one was dropped by the firm.

## How to build them

**PDF: render HTML in headless Chromium via Playwright.** This is not a
preference. Most PDF libraries cannot shape Arabic letters or reorder
bidirectional text, and produce disconnected, reversed output. Chromium uses
HarfBuzz and implements the full Unicode bidi algorithm, so Arabic is correct
with no special handling — including mixed text like `1039 / 20ق`.

**Excel: ExcelJS.** Set the worksheet `rightToLeft` view property so sheets open
in RTL, matching the printed reports.

**Fonts must be bundled with the application.** The PDF renderer runs on a
server with no fonts installed.

**Read `docs/REPORT-LAYOUTS.md` before building any report.** It documents the
house style, taken from nine real printed samples.

## Shared behaviour

- Right-to-left page layout; page numbers mirror
- Firm logo in the header, emerald green headings
- **Client-facing reports also carry the client's own logo**, opposite the firm
  logo. Where the client has no logo — **264 of the current 318 transformed
  clients** — print the client's name in text instead. The earlier 259 of 313
  figure was the planning snapshot
- **Every list report ends with a count row**
- Most reports take parameters: a date range (`من` / `إلى`), and one of client,
  branch, team or lawyer
- Several embed sub-reports; these become nested queries
- Under D52, client archival must not remove existing matters from reports.
  Client business status, client archive state and matter status are separate
  facts. Preserve existing report criteria; do not add a silent archived-client
  exclusion. This is the approved future Task 4.1/Stage 6 contract, not a report
  implementation in the documentation task.

## The one report with an unknown layout

`صالح-ضد مفصل حسب المحامي` could not be exported from Access. Its data source
and columns are known; its page layout is not. Under D27, an original
representative PDF export or clear scan is required before Task 6.8. **Do not
guess at it or design a replacement layout without further owner approval.**

## Two reports carry a hard-coded date

`توزيع جلسات أولي 31-12-2020` and `توزيع جلسات نهائي 31-12-2020`.
The `أولي` / `نهائي` distinction (preliminary / final) is real and both are
needed — but the **date must become a parameter**, not stay in the name.

## Watch for further duplicates

Three reports still carry `Copy Of` in their names. Before building any of them,
compare their record sources against the report they appear to copy. If the
queries match, ask the firm rather than building both — this already reduced the
count by four.

## Full list

- `Contact list for active clients`
- `Copy Of cases`
- `Copy Of تقرير فردي لفريق العمل بالمحامي أ`
- `Lawyers sub-report`
- `rptAllPOAs`
- `rptClientBranches`
- `rptClientMatters1`
- `rptClientMatters1ByBranch`
- `rptClientMatters1ByBranch&Finance`
- `rptClientMattersWithEvaluation`
- `rptClients-Branches-Evaluation-Finance`
- `rptFinishedMatters`
- `rptHearingsBetween2Dates`
- `rptHearingsDecisionsBetween2Dates`
- `rptJudgmentPerClient`
- `rptJudgmentsForAgainst`
- `rptSubNeededDecisions`
- `rptصالح-ضد مفصل`
- `أعمال إدارية`
- `أعمال إدارية جميع الجهات -جديد`
- `أعمال إدارية حسب العميل`
- `الجلسات subreport1`
- `بطاقة حركة توكيل`
- `بطاقة حركة مستند`
- `تقارير المحامين`
- `تقرير التوكيلات`
- `تقرير المستندات`
- `تقرير بأعمال المحامي خلال فترة`
- `تقرير بأعمال المحامي خلال فترة قادمة`
- `تقرير جميع المستندات`
- `تقرير عملاء 2`  **(the parameterised client report — see REPORT-LAYOUTS.md)**
- `تقرير فردي لفريق العمل بالمحامي أ`
- `تقرير فردي لفريق العمل بالمحامي ب`
- `توزيع جلسات أولي 31-12-2020`
- `توزيع جلسات نهائي 31-12-2020`
- `توزيع دعاوى جديدة للمحامين خلال فترة`
- `جلسات الشهر حسب الفريق`
- `صالح ضد -إحصائيات مجمعة`
- `صالح-ضد شهور -تقرير فرعي`
- `صالح-ضد محامين -بالنسبة`
- `صالح-ضد مفصل حسب المحامي`  **(Task 6.8 contract resolved on 2 October 2026; implementation pending independent review — see addendum below)**
- `غلاف الملف`
- `قرارات مفتوحة`
- `قرارات مفتوحة جميع الجهات`
- `متابعة القرارات`

## Report families

| Family | Covers |
|---|---|
| Client reports | Client lists, by branch, with/without evaluation, with/without financial provision, contact lists, judgments per client |
| Matter reports | Active and closed matters, for/against (صالح/ضد) detail, by lawyer, by branch |
| Lawyer reports | Individual team reports, workload over a period, upcoming workload, new-matter distribution |
| Hearing reports | Hearings between dates, decisions between dates, monthly hearings by team, hearing distribution |
| Administrative works | By client, by destination, open decisions, decision follow-up |
| Documents & POAs | All powers of attorney, all documents, movement cards |

## A simplification the new model allows

Access has two separate reports — `بالاشتراك مع محامي آخر` (matters shared with
another lawyer) and `بدون اشتراك` (not shared) — only because the old schema
could not count the lawyers on a matter. With `matter_lawyers` these become one
report with a parameter:

```sql
GROUP BY matter_id HAVING count(*) > 1   -- shared
GROUP BY matter_id HAVING count(*) = 1   -- not shared
```

**Ask before merging two reports** — the firm may want both in the menu.


### Task 4.2 Phase 3 — D58

D58 preserves existing report inclusion, filters, complete related contents
and financial totals during matter or client archive/restore. The default
operational matter list excludes archived matters; that default must never be
copied into reports implicitly. Future Stage 6 screens/exports must prove this
with nonempty results and exact contents/totals, unless the owner separately
approves an explicit archive report option. No report UI/export is added by
Task 4.2 Phase 3.

## Task 6.8 source resolution and catalog candidate — 2 October 2026

Command153 opens `صالح-ضد مفصل حسب المحامي`. It is separate from
Command250 / `rptصالح-ضد مفصل` / `matter-lawyer-judgments`, and from
Command128 / `rptJudgmentsForAgainst`. The candidate adds
`matter-judgments-by-lawyer` without merging or changing those reports.

The original blank target PDF, retained query and visible report properties
establish the printed fields, lawyer → outcome → hearing-date hierarchy,
new-page lawyer sections and per-lawyer favourable/against totals. One
`Detail_Format` event procedure could not be read. After that limitation was
explained, the owner explicitly approved using the proved query and visible
layout as the complete contract, with no additional hidden row suppression.
This resolves the Task 6.7a/D27 source gate for implementation; it does not
prove the unreadable procedure's contents or close acceptance.

The report uses all distinct current non-retired lead/co_lead assignments,
with an unassigned group. Each qualifying hearing appears once per principal;
the overall hearing total and outcome totals count distinct hearing IDs.
Required inclusive date endpoints use `hearing_date`. NULL and exact empty
outcomes are excluded; unknown nonempty values are retained without trimming.
Archived and native records, all qualifying hearing dates and notes remain.
There is no selected-lawyer filter, latest-hearing reduction or saved selection.

The reports landing page places the existing 38 IDs exactly once in seven
categories and adds this genuine 39th definition to outcomes. Counts and search
use only the server-authorized catalog. Search, disclosures and Back-state
recovery do not generate reports or change saved choices. Each report's own
form continues to explain its scope.

See [source and semantics](reports/task68-source-contract.md),
[catalog design](reports/task68-catalog-design.md) and
[review checks](acceptance/task68-reports-catalog.md).

## Task 6.8 and catalog acceptance — 2 October 2026

The 39-report catalog in seven expandable categories and `matter-judgments-by-lawyer`
are accepted and activated following the independent implementation PASS and the
bounded operational checks. All 38 prior report IDs and their contracts remain
unchanged. Command153 is resolved separately from the existing Command250 report;
the unreadable `Detail_Format` limitation remains explicit. See the
[D27 supplement](DECISIONS.md), [operational report](task-reports/2026-10-02-task-6-8-reports-catalog-acceptance-activation.md)
and [acceptance evidence](acceptance/task68-reports-catalog.md).

Fresh checks cover genuine four-role catalog/navigation and previews, seven fixture
files and four owner files, independent complete data comparisons and visible PDF
output. No choice was saved or seeded. Migration 78 remains unchanged. N1 is
accepted, unresolved and NOT FIXED; PDF copying remains accepted/unfixed and search
is uncertified. Earlier candidate/blocked statuses are historical. Independent
operational review remains pending; Task 6.9 and Stage 7 have not started.
