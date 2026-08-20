# Reports

49 reports must be reproduced. Every one exports to **Excel** and **PDF**.

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

## Shared behaviour

- Right-to-left page layout; page numbers mirror
- Firm logo in the header, emerald green headings
- Most reports take parameters — commonly a date range (`من` / `إلى`), and one
  of client, branch, team or lawyer
- Several embed sub-reports; these become nested queries

## Reports needing sample PDFs before building

Six reports could not be exported from Access — their **data sources and
columns are known, but their page layout is not**. The firm will supply printed
samples. Do not guess at their layout.

- `تقرير عملاء 2`
- `تقرير عملاء 6`
- `تقرير عملاء 8`
- `تقرير عملاء -جميع الدعاوى سارية ومنتهية`
- `صالح-ضد مفصل حسب المحامي`
- `Copy Of صالح-ضد temp-JTI`

## Two reports are hard-coded snapshots

`توزيع جلسات أولي 31-12-2020` and `توزيع جلسات نهائي 31-12-2020` have a fixed
date in their name. Build **one parameterised report**, not two literal copies.

## Full list

- `Contact list for active clients`
- `Copy Of cases`
- `Copy Of تقرير فردي لفريق العمل بالمحامي أ`
- `Copy Of صالح-ضد temp-JTI`  **(layout unknown — see below)**
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
- `تقرير عملاء -جميع الدعاوى سارية ومنتهية`  **(layout unknown — see below)**
- `تقرير عملاء 2`  **(layout unknown — see below)**
- `تقرير عملاء 6`  **(layout unknown — see below)**
- `تقرير عملاء 8`  **(layout unknown — see below)**
- `تقرير فردي لفريق العمل بالمحامي أ`
- `تقرير فردي لفريق العمل بالمحامي ب`
- `توزيع جلسات أولي 31-12-2020`
- `توزيع جلسات نهائي 31-12-2020`
- `توزيع دعاوى جديدة للمحامين خلال فترة`
- `جلسات الشهر حسب الفريق`
- `صالح ضد -إحصائيات مجمعة`
- `صالح-ضد شهور -تقرير فرعي`
- `صالح-ضد محامين -بالنسبة`
- `صالح-ضد مفصل حسب المحامي`  **(layout unknown — see below)**
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

Look for similar collapses elsewhere, but **ask before merging two reports** —
the firm may want both in the menu out of habit.
