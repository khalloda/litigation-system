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
- `صالح-ضد مفصل حسب المحامي`  **(layout unknown — original PDF/scan required before Task 6.8)**
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
