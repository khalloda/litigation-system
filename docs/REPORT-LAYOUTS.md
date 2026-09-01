# Report layouts

**This file is authoritative for report LAYOUT.**
`docs/VISUAL-DIRECTION.md` section 5 adds the branding treatment on top —
watermark, double rule, alternating row tint, signature blocks — and changes
nothing structural here. Where the two appear to disagree about layout, this
file wins.

Extracted from nine real printed reports supplied by the firm. This is the
house style — follow it rather than inventing one.

Sample PDFs live in `docs/report-samples/`. They are not committed to Git:
binary report samples are raw reference material that would enlarge permanent
history and create integrity and accidental-distribution risks.

---

## Branding — one rule

**Use the current logo everywhere:** `assets/logo.png` for report headers,
`assets/emblem.png` where a square mark is needed.

The samples contain **two different logos**. The documents and powers-of-attorney
reports carry an older gold Kufic mark; the administrative and hearings reports
carry the current emerald wordmark. Access reports were branded one at a time
and the update never finished across all 131.

In this system the logo belongs to a **single shared report header component**.
Never place a logo file inside an individual report.

---

## Page setup

| | |
|---|---|
| Direction | RTL. Column order runs right to left; `م` (row number) is the **rightmost** column |
| Orientation | **Landscape** for list reports. **Portrait** for cards and letters |
| Paper | A4 |
| Body text | Black, small (≈8–9pt equivalent). These are dense working documents, not presentations |
| Borders | Thin grey on every table cell |
| Colour | Used sparingly — grey fills for headers, yellow only for conditional highlighting |

---

## Standard header

Three zones across the top:

```
[logo, outer edge]        [TITLE — centred, bold, large]        [optional box]
                          [SUBTITLE — centred, bold]
```

- **Title** — the report name, e.g. `بيان بجميع مستندات العملاء`
- **Subtitle** — the entity the report is filtered to: client name (`المكتب`),
  destination (`التجمع الخامس`), or the period
  (`للفترة من 2026/08/22 حتى 2026/08/27`)
- **Optional right-hand box** — an attachment label such as `مرفق (1)`,
  `مرفق (2)`, or a file-number box `رقم الملف   1`

### Manual completion fields

Some operational reports print blank lines for the person using them:

```
القائم بالعمل: ........................................
التاريخ:  ...... / ........ / .................
```

Reproduce these as printed dotted lines. They are filled in by hand after
printing — do not turn them into data fields.

---

## Standard footer

A single line across the bottom, in three parts:

```
[date]  [time]              [report title]              [Page n of N]
8/20/2026  11:32 AM    بيان بجميع مستندات العملاء       Page 1 of 54
```

Some reports use Arabic paging (`صفحة 1 من 1`) and some English (`Page 1 of 54`).
**Standardise on Arabic**, keeping Western digits per `docs/BRAND.md`.

---

## Report types

There are three distinct shapes. Build one reusable component for each.

### Type 1 — Grouped list

The most common. A table with a repeating group header.

**Example: `بيان بجميع مستندات العملاء`** (54 pages)

Group header row, filled grey, spanning the table width:

```
-1   المكتب                                     رقم الملف   1
-2   الفطيم                                     رقم الملف   2
```

The group header carries a **sequence number**, the **client name**, and the
client's **file number**. Row numbering (`م`) **restarts at 1 within each group**.

Columns, right to left:

`م` · `مسلسل` · `رقم الدعوى` · `بيان المستند` · `تاريخ المستند` ·
`عدد الأوراق` · `تاريخ الإيداع` · `المحامي المسئول` · `ملاحظات` ·
`مكان المستندات`

Note `بيان المستند` is a long free-text column that **wraps to many lines** and
drives row height. Rows are not fixed height.

**Others of this type:** `بيان بجميع توكيلات العملاء`, `بيان بمستندات العميل`,
`بيان بتوكيلات العميل`.

### Type 2 — Grouped list with date headers

**Example: `بيان توزيع الجلسات الأسبوعي`**

Same shape, grouped by hearing date, with the group header showing the
**English day name and the date**:

```
Saturday 2026/08/22
Sunday 2026/08/23
Wednesday 2026/08/26
```

Keep the English day name — it is what the firm uses. Dates with no hearings are
omitted entirely.

Columns: `م` · `رقم الدعوى` · `المحكمة` · `الموكل وصفته` · `الخصم وصفته` ·
`موضوع الدعوى` · `آخر قرار` · `المكلف بالحضور`

### Type 3 — Card / blank form

One record per page, mostly blank, for manual completion.

**Example: `بطاقة حركة مستند`** — document movement card

- Top block: the document's stored data (client, case number, file number, page
  count, description, responsible lawyer, deposit date), with the document ID in
  a heavy black box
- Section heading on a grey band: `حركة المستند`
- Then **three identical numbered blocks**, each with a `خروج` (out) row and a
  `عودة` (return) row, filled with dotted lines for handwriting: recipient name,
  job title, purpose, expected return date, signature, and the safe-keeper's
  name on return

**Example: `بطاقة حركة توكيل`** — power-of-attorney movement card

- Top: a grid of boxed label/value pairs (office, year, letter, POA number,
  principal, capacity, lawyers named, notes, issuing office, issue date, copies)
- Then an **empty table** of roughly 25 blank rows with headed columns:
  `تاريخ الاستلام` · `توقيع المستلم` · `الغرض من استلام التوكيل` ·
  `تاريخ الرد المتوقع` · `تاريخ الرد الفعلي` · `توقيع الإداري`

These print the stored header data and leave the movement log blank on purpose.
Do not attempt to fill the movement rows from the database.

---

## Type 4 — Client status report (parameterised)

**`بيان بموقف [client]`** — the client-facing matter status report. This single
report replaces the four Access copies `تقرير عملاء 2 / 6 / 8` and
`تقرير عملاء -جميع الدعاوى سارية ومنتهية`.

### Header — two logos

```
[firm logo, outer edge]     بيان بموقف            [CLIENT LOGO, opposite edge]
                          [client name, bold]
```

The **client's own logo** prints opposite the firm logo. This is what the
`العملاء.logo` attachments are for — they are not decorative.

**Where the client has no logo — 264 of the current 318 transformed clients —
print the client's name in text in that position.** This is the normal case,
not the exception, so build and test it first. The earlier 259 of 313 figure
was the planning snapshot.

Client logos appear on client-facing reports **only**. Not on the documents or
powers-of-attorney reports.

### Parameters

| Parameter | Behaviour |
|---|---|
| Client | required |
| Date period | optional |
| Matter status | **active only (default)**, or include all |
| Lawyer | optional |

### Columns, right to left

`م` · `رقم الدعوى` · `المحكمة` · `الموكل وصفته` · `الخصم وصفته` ·
`موضوع الدعوى` · `قرار آخر جلسة/إجراء`

### Behaviour

- **Flat list, no grouping** — it covers one client
- **Sorted by date of last action**, most recent activity first
- **`رقم الدعوى` may hold several case numbers stacked**, one per line — the
  sample shows three in one cell (`83066 / 69ق`, `10714 / 72ق`, `9239 / 72ق`).
  This is D9 in practice: never collapse it to one line
- **`المحكمة` shows the court and its circuit**, e.g.
  `الإدارية العليا (11 موضوع)`, `المحكمة الاقتصادية (الدائرة: (9) استئناف)`.
  Circuit is stored **separately** from court name and joined for display
- **`قرار آخر جلسة/إجراء` is pulled automatically** from the matter's most
  recent hearing. It is not typed on the report
- **Party capacity prints in quotation marks** beneath the party name:
  `تويوتا مصر للتجارة` then `"طاعن"`
- **Count row at the foot**, in a bordered box:
  `إجمالي عدد الدعاوى     4`

### Column header spelling

The Access original reads `ر قم الدعوى`, with a stray space inside the word.
**Fix it to `رقم الدعوى`.** Check other reports for the same defect.

---

## Conditional highlighting — required behaviour

**`بيان بجميع توكيلات العملاء` highlights entire rows in yellow when
`عدد النسخ` (copies held) is `0`.**

Verified in the sample: rows F, G, I, N, O, P and Q all have a copy count of
zero and are highlighted; every other row is white.

Meaning: the power of attorney is **not physically in the safe** — it is out
with a lawyer, was deposited at court, or was cancelled. The `ملاحظات` column
then explains where it went (`عهدة إيهاب حمدي`,
`تم إيداعه بالنقض رقم 11544 / 88ق`).

This is a working control, not decoration. Reproduce it.

---

## Section reports

**`بيان بالأعمال الإدارية والقرارات المفتوحة بجهة`** prints two numbered
sections in one document, each with its own table:

```
أولاً: الأعمال الإدارية
ثانياً: القرارات المفتوحة
```

A section prints its heading **even when it has no rows** — the sample shows
`ثانياً` empty. Do not hide empty sections.

Within `أولاً`, rows group by court (`القاهرة الجديدة`).

### Computed column

That report has a column `الحالة / عُمر المهمة` showing:

```
جارية
141 يوم
```

`عُمر المهمة` (task age in days) is **calculated at print time** — days between
the task's creation date and today. It is not stored. Compute it in the query;
do not add it as a column.

---

## What the samples confirm about the data model

All consistent with `docs/DECISIONS.md`:

**Party capacity prints in quotation marks** beneath the party name:

```
سنابل للتنمية العقارية والسياحية
"مدعي"
```

Matches D7 — name and capacity are separate values rendered together, not one
text field.

**Case numbers appear in both scripts in the same report:** `J2391/18`,
`J37503/79`, `55534 / 74ق`, `2103 لسنة 18 قضائية`.

This was once cited as confirming a `ق ↔ J` fold in the search normaliser.
**There is no such fold** — it was removed on 23 August 2026 because it also
turned the client **JTI** into `قTI`. What these samples confirm is that a
report must RENDER both scripts side by side, which it does. Searching is a
separate matter: each spelling is found by its own form.

**Powers of attorney split the number into three columns** — `رقم التوكيل` ·
`حرف` · `السنة` — matching the Access fields. In the combined report they render
as `982 / أ / 2009`.

**The lawyers named on a POA are a long comma-separated list** of up to twelve
people. Confirms these are multi-person fields needing the split rules.

---

## Still needed from the firm

Only **one** report has an unknown layout, and D27 requires an original
representative PDF export or clear scan before Task 6.8:

- `صالح-ضد مفصل حسب المحامي`

Its query is only 59% similar to the client report and pulls four extra columns —
the for/against outcome (`صالح/ضد`), the lead lawyer, hearing notes and the
matter partner — so it is genuinely its own report. Do not guess at it or
design a replacement layout without further owner approval.

`تقرير عملاء 2 / 6 / 8` and `تقرير عملاء -جميع الدعاوى سارية ومنتهية` are the
**same report with different filters** (proven: two have byte-identical queries).
Their layout is the client report documented below.

`Copy Of صالح-ضد temp-JTI` has been **dropped entirely** by the firm.

## Count rows — required on every list report

The firm has confirmed that **all** list reports carry a total count at the
foot, in the same bordered-box style as the client report. The Access originals
are inconsistent about this; the new system is not.
