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
| عدد النسخ | Number of copies | Drives the yellow-row highlighting on the POA report |
| جرد | Inventory flag | Yes/no. 1 on 680 rows, 0 on 55. **What the two states mean is not yet confirmed by the firm** |

The powers-of-attorney report prints the reference as **`982 / أ / 2009`** —
number / letter / year.

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

## Case number suffixes

`ق` (قضائية, judicial year) and `J` mean the same thing — 695 matters use `ق`,
92 use `J`. The search normaliser folds them together.

## Values that are not names

Found in attendee fields; treat as "no attendance recorded":

`**` (4,143 times) · `لا يوجد حضور` · `متابعة`
