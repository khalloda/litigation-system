# Glossary — Arabic terms in this system

For anyone reading the data or the schema. Do not guess at these.

## Core entities

| Arabic | English | Notes |
|---|---|---|
| العملاء | Clients | |
| الدعاوى | Matters / cases | The central table |
| الجلسات | Hearings | Largest table, 13,279 rows |
| المحامين / lawyers | Lawyers | Two Access tables, merged into one |
| التوكيلات | Powers of attorney | |
| المستندات | Documents | Paper register, not file storage |
| خطابات الأتعاب | Fee letters / engagement contracts | |
| الفواتير | Invoices | |
| السداد | Payments | |
| admin work table / الأعمال الإدارية | Administrative works | |
| إجراءات المهام | Task steps / actions | Children of administrative works |
| فريق العمل | Work team | Dropped — see D6 |

## Matter fields

| Arabic | English |
|---|---|
| matterAR | Case number (Arabic) — may hold several, stacked |
| matterSubject | Matter subject |
| صالح / ضد | For / against — outcome direction |
| الموقف الحالي | Current status |
| سارية | Active |
| منتهية | Closed |
| الجهة | Destination / authority |
| الدائرة | Court circuit |
| المحكمة | Court |

## Party roles (D7)

| Arabic (m / f) | English |
|---|---|
| مدعي / مدعية | Plaintiff |
| مدعى عليه / مدعى عليها | Defendant |
| مستأنف / مستأنفة | Appellant |
| مستأنف ضده / مستأنف ضدها | Appellee |
| طاعن / طاعنة | Cassation petitioner |
| مطعون ضده / مطعون ضدها | Cassation respondent |
| متظلم / متظلمة | Grievant |
| متظلم ضده | Grievance respondent |
| متهم / متهمة | Accused |
| سلطة اتهام | Prosecution |
| مدعي بالحق المدني | Civil claimant |

**`طاعن` and `متظلم` are different roles.** Both translate loosely as
"petitioner" — they are not interchangeable.

## Court degrees

| Arabic | English |
|---|---|
| أول درجة | First instance |
| ابتدائي | Primary — **distinct from أول درجة**, confirmed by the firm |
| جزئي | Summary |
| استئناف | Appeal |
| نقض | Cassation |
| طعن | Challenge |

## Venues

| Arabic | English |
|---|---|
| قضاء إداري | Administrative judiciary |
| إدارية عليا | Supreme Administrative Court |
| مجلس الدولة | Council of State |
| المحكمة الدستورية العليا | Supreme Constitutional Court |
| نيابة | Public prosecution |
| لجنة | Committee |
| تحكيم | Arbitration |

## Work types

| Arabic | English |
|---|---|
| تقاضي | Litigation — the default |
| استشارات | Consultation |
| رأي قانوني | Legal opinion — **distinct from استشارات** |
| إجراءات | Procedures (e.g. company establishment) |
| تظلم | Grievance |
| طلب | Petition |
| طلب رد | Recusal request |
| متابعة قانونية | Legal follow-up |
| منازعة تنفيذ | Execution dispute |
| إشكال | Execution objection |
| محضر إداري | Administrative report |
| تفتيش | Inspection |

## Powers of attorney (التوكيلات)

| Arabic | English | Notes |
|---|---|---|
| الموكل | The principal | The person granting the power |
| الصفة | Capacity of the principal | **Free text, 306 values. NOT the D7 party role** — see below |
| صفة الموكل بالتوكيل | Capacity — abandoned duplicate | Same field as `الصفة`, no longer maintained. Migrated, never read |
| رقم التوكيل | POA number | The number part of the reference |
| حرف | Letter-series | The letter part. 28 values, nearly all single Arabic letters — `أ` 183, `ب` 167 |
| السنة | Year | The year part |
| مسلسل | Sequence | **Latin letters — A, B, C. Not a number** |
| جهة الإصدار | Issuing authority | |
| عدد النسخ | Copies in the safe | **A LIVE COUNT, not a static figure.** See below |
| جرد | Inventory check | Yes/no. 1 on 680 rows, 0 on 55. **PROBABLE, NOT CONFIRMED:** the firm reads it as "does it pass the periodical inventory check", which fits the split — but they said "I think". **Nothing may depend on it until confirmed.** |

The powers-of-attorney report prints the reference as **`982 / أ / 2009`** —
number / letter / year.

### `عدد النسخ` is a live count, and zero is meaningful

It is **the number of copies currently in the safe**, not a static figure and
not a flag. A lawyer takes a copy out to attend court and the count drops; it
rises when the copy comes back.

That is why the report highlights **zero** in yellow — "none available" — and
why `ملاحظات` on those rows reads `عهدة إيهاب حمدي`. **Those rows are
documents signed out, not errors.**

Across the 735 rows: 0 on 113, 1 on 577, 2 on 29, 3 on 7, 4 on 2, 8 on one,
and 6 blank. So 39 rows (5%) hold more than one copy — normal practice, usually
because the original was deposited at the Cassation court and certified copies
were extracted (`تم إيداعة بالنقض وتم استخراج نسختين طبق الأصل`).

- Plain integer, nullable, **no upper bound**. Never a boolean, never a CHECK
  capping it at 1.
- **Zero is a valid state**, never missing data and never an error.
- The six blanks are **genuinely unknown** and stay NULL — a different thing
  from zero.

**`الصفة` here is not the same idea as a party's capacity under D7.**
D7 is a party's *procedural role in a matter* — plaintiff, appellant — from a
closed list of 11. This is the capacity in which someone *granted a power of
attorney*: `شخصي` (personally), or a corporate office such as
`عضو منتدب لشركة أكيومن`. Free text, no list. Keep them distinct.

## Administrative task steps (إجراءات المهام)

| Arabic | English |
|---|---|
| تاريخ الإجراء | Date of the step |
| القائم بالعمل | Who carried it out — **a person name; resolve through the alias table** |
| النتيجة | Result |
| تقرير | Report |
| الموعد القادم | Next appointment — 7 rows in 4,130, effectively dead |

## Billing (الفواتير / السداد / تقسيم التحصيلات)

These are the **only** lookups in the system whose values are Latin. They stay
exactly as Access holds them — the value is what Stage 2 matches on. The Arabic
words to show on screen are **not yet supplied and were not invented**.

| Access | Values |
|---|---|
| `Inv-Status` | Paid 460 · Unpaid 60 · Partially Paid 12 · Later 10 · Canceled 1 |
| `Inv-Type` | Service 379 · Expenses 162 |
| `LawyerAs` | Reviewer 16 · LawyerA 16 · LawyerB 8 · LawyerA+ 7 — see below |

| Arabic | English | Notes |
|---|---|---|
| رقم الفاتورة | Invoice number | On the payment, as written |
| التاريخ | Date | **Only 67% filled** — a third of payments have no date |
| العملة | Currency | Gate 4 reconciles per currency |
| بيان السداد | Payment details | |

`تقسيم التحصيلات.Lawyer` holds **English names** — `Ahmed Abdullah`,
`Nagy Ramadan`. Nine distinct people, and **the only Latin person column in the
database**. It resolves through `people.name_en`, not through
`person_name_alias`, which holds Arabic. Where `name_en` is null, quarantine —
never guess.

### `LawyerAs` and `matter_lawyers.role` are the same idea, named twice

**Record the alignment or the two will be conflated.** A collection split and a
matter assignment describe the same relationship from different sides.

| `تقسيم التحصيلات.LawyerAs` | `matter_lawyers.role` | |
|---|---|---|
| `LawyerA` | `lead` | |
| `LawyerA+` | `co_lead` | **a SECOND lead sharing the lead's allocation** |
| `LawyerB` | `support` | |
| `Reviewer` | — | the reviewing partner; no `matter_lawyers` equivalent |

**`LawyerA+` is a co-lead, not a variant of `LawyerA`.** It is always a
different person, and the structure is unambiguous — every invoice carrying one
looks like this:

```
Reviewer   0.250
LawyerA    0.375
LawyerA+   0.375
```

against an invoice without one:

```
Reviewer   0.250
LawyerA    0.750
```

The reviewer always takes 25%, and the remaining 75% goes either wholly to
`LawyerA` or evenly between `LawyerA` and `LawyerA+`.

**Do not build a rule that assumes 0.375.** Invoice 21819 has `LawyerA+` at
0.075. All 15 invoices with splits still sum to exactly 1, so it is deliberate
rather than an error — there is nothing to quarantine.

### The three invoice flags

| Access | Reading | Evidence |
|---|---|---|
| `VAT?` | **VAT applies to this invoice.** Boolean | Only `1` (289) and `0` (254). The `1` rows are `Service` invoices with ordinary amounts; nothing encodes a rate or a value |
| `report` | Unknown, effectively unused. Boolean | 535 zeros, 8 ones. Migrated (D10), **never surfaced** |
| `R-#` / `R-$` | A **receipt amount and its currency** | `R-#`: 278 blank, 244 zero, 21 round figures — 5000, 10000, 44000. `R-$`: 520 blank, 21 `EGP`, 2 `0`, on the same 21 rows |

`R-#` is an **amount despite its name**, and `R-$` is a **currency despite
its**. 21 invoices of 543 — under 4% — carry anything. Both migrated, neither
surfaced.

**The `R-` prefix suggesting "receipt" is an INFERENCE, not a fact.** The data
shows only an amount and a currency travelling together.

## Attendance (the leave register)

**Not meeting attendance** — D2 drops those entirely.

`AttSituation` is **free text, not a status list**: 865 distinct values.
`At the Office` 749 · `Nothing` 498 · `At the office` 327 (the same value in
different case) · `Annual Vacation` 132, then hundreds of one-offs like
`Admin work at Cairo economical court`. It is a daily log somebody typed into.
**Do not make it a lookup.** It needs its own review before any dropdown is
designed.

`المحامي` is a person name — resolve through the alias table, rule 15.

## Case number suffixes

`ق` (قضائية, judicial year) and `J` mean the same thing — 695 matters use `ق`,
92 use `J`. The search normaliser folds them together.

## Values that are not names

Found in attendee fields; treat as "no attendance recorded":

`**` (4,143 times) · `لا يوجد حضور` · `متابعة`
