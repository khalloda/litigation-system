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

## Case number suffixes

`ق` (قضائية, judicial year) and `J` mean the same thing — 695 matters use `ق`,
92 use `J`. The search normaliser folds them together.

## Values that are not names

Found in attendee fields; treat as "no attendance recorded":

`**` (4,143 times) · `لا يوجد حضور` · `متابعة`
