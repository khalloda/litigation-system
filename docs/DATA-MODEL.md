# Data model

17 tables in scope: 14 active, 3 deferred. Ten more are archived, not built.

Naming: physical columns are **snake_case ASCII**. Arabic is the display label,
held in `src/strings.ts` — not the column name. The Access data has 122 Arabic
column names and 139 containing spaces (`الموقف الحالي`, `Cash/probono`,
`Inv-No`), which are legal in Access and hostile to everything else.

Every table carries: `id`, `created_at`, `created_by`, `updated_at`,
`updated_by`.

---

## People and organisation

### `people` — 135 rows
The single roster. Replaces both Access lawyer tables.

**64 firm staff (21 current, 43 former) + 71 external.**

Was 140, then 138, now 135. Two hamza duplicates went first —
`احمد إسماعيل`/`أحمد إسماعيل` and `احمد سعيد`/`أحمد سعيد`, differing only at
character 0. Both were *current* staff, so current staff is **21**, not 23.
Three more went at task 1.2b: `احمد عبدالله`, `احمد فرحات` and `خالد عطية`,
all created by a generator that matched a merge target as an exact string
instead of through the alias table. Every old spelling survives as an alias.

| Column | Type | Notes |
|---|---|---|
| `name_ar` | text, unique | |
| `name_en` | text, null | Partially filled in the old data |
| `is_staff` | boolean | false = external counsel from powers of attorney (71) |
| `is_active` | boolean | false = has left the firm (43 of 135) |
| `is_trainee` | boolean | |
| `can_login` | boolean | Former staff never log in |

### `person_name_alias` — 347 rows
Every spelling ever typed, mapped to one person. Makes historical search work.

339 originals + 6 people whose own name was missing from the table + 2 spacing
variants the firm confirmed (task 1.2a). **Zero people are now unfindable by
their own name**, which rule 15 depends on: matching through the alias table
only works if every name is in it.

### `users`
Login accounts. Linked to `people`. Role is one of the four in
`docs/PERMISSIONS.md`.

---

## Clients

### `clients` — 318 rows (313 on 19 August; the file grows)

> **Transformed 23 August 2026, task 2.5.** Three columns are deliberately
> empty and `db:check` asserts they stay that way: `branch_id`,
> `legacy_branch_raw` and `contact_person_id`. See "A client can have several
> branches" below and task 2.5.
>
> **`legacy_contact_lawyer_raw`** was added (migration 0027) to preserve
> `العملاء.contactLawyer` — the firm lawyer responsible for the client, on 123
> of 318. It has no modelled column: `contact_person_id` references
> `contacts` and means the client's *own* contact person, not one of ours.
> Whether the model should gain a `responsible_person_id` is on the review
> workbook.

#### A client can have several branches, so the branch belongs on the matter

`clientBranch` is a column on **`الدعاوى`, the matter** — 560 matters, 32
distinct values, 12 clients. **Eight of those twelve carry more than one:**

| Client | Distinct branch values |
|---|---:|
| أدخنة النخلة | 8 |
| الفطيم | 6 |
| فرانكي | 5 |
| تويوتا إيجيبت | 3 |
| أوراسكوم, سيجما, إسماعيل القرقاوي, CAF | 2 each |

D19 removes the values that were never branches, but أدخنة النخلة still has
five genuine sites and الفطيم five subsidiaries. **`clients.branch_id` cannot
represent that, and `clients.legacy_branch_raw` could keep only one of eight
original texts** — which is the `_raw` rule failing outright, not a rounding.

The branch therefore belongs on the **matter**, where Access put it: *which
site of this client does this matter concern?* Task 2.6 writes the reviewed
branch to `matters.branch_id` and the exact Access text to
`matters.legacy_branch_raw`. The older nullable client columns remain empty;
they are not used to guess one branch for a client that has several.

**`legacy_branch_raw`** — the original clientBranch text, byte for byte.
Not optional. The 32 original values resolve to 15 (**D19**): 9 move to
`matter_category`, 1 to `matter_type`, 1 to `degree`, 4 are quarantined and 2
are discarded. That is heavily many-to-one, and without this column the
original text is unrecoverable — including for the 14 matters whose branch was
a document heading and is deliberately dropped.

`name_ar` (100% filled), `name_en` (73%), `full_name`, `branch`,
`cash_or_probono`, `status`, `poa_location`, `documents_location`,
`contact_person_id`, `client_start`, `client_end`.

### `client_logos` — 54 rows
Extracted from an Access Attachment column.

Stored as **files in a folder on the server** — not in the database and not in
cloud storage. See decision **D15**.

```
/var/lib/litigation/client-logos/{client_id}/{filename}
```

The table holds `client_id`, `relative_path`, `file_name`, `content_type`,
`byte_size`. **Never the image itself.**

Mandatory safeguards (D15):

- the database and this folder are backed up in **one** operation
- a weekly job lists any client whose logo file is missing
- a missing file prints the client's name in text, never a broken image

See `docs/MIGRATION.md` for extraction. **A normal CSV export destroys these
(D11).**

### `contacts` — 188 rows
Client contact people. Note `Contacts.Attachments` in Access is **empty**.

---

## Matters

### `matters` — 1,689 transformed + 55 quarantined from 1,744 source rows
The central table. The extracted source has 38 columns mixing identity, court
logistics, money, classification and free text. Task 2.6 gives every source
row exactly one durable outcome; none is discarded.

| Column | Notes |
|---|---|
| `case_number_ar` | **Multi-line. 18% hold several case numbers. Do not split — see D9.** |
| `case_number_ar_normalised` | Generated, for search |
| `case_number_en` | Original `matterEN`, retained for a future bilingual version |
| `subject` | 98% filled |
| `client_id` | FK |
| `branch_id` | FK to the reviewed matter branch — D19 |
| `matter_type_id` | FK, defaults to تقاضي |
| `matter_category_id` | FK, nullable |
| `degree_id` | FK, nullable |
| `venue_id` | FK, nullable |
| `importance_id` | FK, nullable |
| `status` | سارية 507 / منتهية 1,223 / null 14 in this extraction |
| `legacy_category_raw` | Original Access text, never overwritten |
| `legacy_degree_raw` | Original Access text, never overwritten |
| `legacy_branch_raw` | Original Access `clientBranch`, never overwritten |
| `court_id` | FK to `lookup_court` — **D20** |
| `legacy_court_raw` | The original court text, never overwritten |
| `circuit` | **Text, not a list — D20.** 255 filled rows / 122 exact values after task 2.6 |
| `legacy_source_record_key`, `legacy_source_extraction_sha256` | Durable complete-row identity and extraction fingerprint |
| `legacy_source_payload` | All 38 source columns, preserving Arabic, line breaks, NULL and empty text |
| `start_date`, `end_date`, `asked_amount`, `judged_amount`, `notes_1`, `notes_2` | Typed scalar values retained from Access |
| `court_floor`, `court_hall`, `court_shelf`, `court_secretary_room` | Court logistics — **D21**, they stay here |
| `fee_letter_ref` | `الدعاوى.[خطاب الأتعاب]`, text not a FK. 412 carry a value and **all 412 resolve** — 289 by `contractID`, 123 by `mfilesID`. **Corrected 23 August 2026; it said "289 match nothing", which was the wrong column.** See "Two key spaces" below |
| `legacy_id` | The Access `matterID`. See "Legacy identifiers" below |

`court_id` and `circuit` are two columns, not one. Reports join them for
display: `الإدارية العليا (11 موضوع)`,
`المحكمة الاقتصادية (الدائرة: (9) استئناف)`.

Source: `docs/REPORT-LAYOUTS.md`, "Type 4 — Client status report", which
records that the samples show court and circuit rendered together but stored
apart. **This is not D18** — D18 is the parameterised client report. Earlier
drafts cited D18 here and were wrong.

**Court detail columns stay on the matter — D21.** They were previously marked
"optional, discuss before doing it"; that is settled.

### `matter_lawyers`
Replaces `lawyerA` / `lawyerB` and the combination strings.
`matter_id`, `person_id`, `role` (`lead` / `co_lead` / `support`), `position`,
`legacy_source`. Task 2.7 also records the durable source key and extraction
fingerprint, the exact source field, reviewed split-rule id and ordered member
position. **At most one `lead` per matter.**

Task 2.7 result: 927 relationships on 708 matters. Another 180 source lawyer
cells are retained for review because they match neither an exact alias nor a
reviewed split rule; none was guessed. Migration reconciliation covers only
rows with non-null legacy provenance, so future lawyer assignments created in
the application are valid native rows rather than false migration extras.

### `matter_parties`  +  `matter_party_roles`
Replaces `client&Cap` and `opponent&Cap`, which held name and legal capacity in
one field (92% and 83% multi-line).

`matter_parties`: `matter_id`, `side` (client / opponent), `party_name`,
`gender`, `ordinal`, `legacy_raw`, durable source identity, source field and
fragment ordinal.
`matter_party_roles`: `party_id`, `role_id`, `ordinal`, `legacy_role_raw` —
several roles per party, with the exact capacity fragment preserved.

Task 2.7 result: 2,615 parties and 2,199 roles. Unreviewed or structurally
ambiguous source cells remain in `quarantine.matter_relationship_transform`.
The same legacy-provenance scope applies to parties and their roles.

Across all staged matters there are 4,576 populated lawyer/party cells: 4,418
on the 1,689 transformed matters, and 158 on the 55 matters still held in the
task 2.6 parent quarantine. Those 158 remain in their complete parent payload;
they do not create relationship rows or duplicate task 2.7 evidence.

---

## Hearings

### `hearings` — 13,055 transformed + 327 quarantined from 13,382 source rows
Largest table. Task 2.8 gives every source row exactly one durable outcome.

`matter_id`, `hearing_date`, `next_hearing_date`, `action_id`, `decision`,
`report`, `previous_decision`, `outcome` (صالح / ضد), `court_id` +
`legacy_court_raw`, `destination_id` + `legacy_destination_raw`,
`next_attendance_raw`, `circuit` + `legacy_circuit_raw`, `notes` +
`legacy_notes_raw`, `short_decision`, `client_notified`.

The less obvious direct fields are still source facts, not inferred meanings:
`report` is Access `تقرير` (a boolean); `previous_decision` is
`lastDecision`; `next_attendance_raw` is `حضور الجلسة القادمة`; the destination
raw value is `الجهة`; and `short_decision` is `shortDecision`. All are retained
even where the first web screen does not surface them.

`destination_id` is set only by a firm-reviewed court rule saying that the raw
court value is actually a destination. It never overwrites Access `الجهة`.
A reviewed court split may fill `circuit` or `notes` only when the separate
source field is empty; a conflicting source fact quarantines the hearing with
both values intact.

Every transformed row also keeps `legacy_source_record_key`,
`legacy_source_extraction_sha256` and `legacy_source_payload`. The payload has
all 21 Access columns and preserves NULL, empty text, Arabic and line breaks.

`matter_id` is **nullable** — 4 hearings have no matter and must still load.

Indexed on `matter_id`, `hearing_date` and `next_hearing_date`: 13,382 source rows,
and the dashboard reads the next date every time anyone opens it.

**`legacy_action_raw`** — the original الإجراء text, byte for byte.

Added 21 August 2026, and it is not optional. Three hearing actions were
merged into two that day (محكمه and مجكمة into محكمة, رفع الدعوي into
رفع الدعوى), which affects 18 hearings. Before that merge the mapping was one
to one and nothing could be lost; now it is many to one, and without this
column the original text is **unrecoverable** — the merge could never be
reversed if it were later judged wrong. See D10 and the `_raw` rule in
`docs/MIGRATION.md`.

### `hearing_attendees` — 8,884 rows across 39 people
Replaces `الحاضر` and `حاضر 1`–`حاضر 4`, which held free text — 373 distinct
spellings for 135 people, plus multi-person strings with no consistent
separator.

`hearing_id`, `person_id`, `ordinal`, plus the durable hearing source key and
extraction fingerprint, exact source column and column order, immutable source
cell id, immutable person-span id and span sequence. `legacy_name_raw` holds
the **complete original cell**, not the separated name fragment.

Task 2.8 consumes only Correction B's proved `person` spans; it does not parse
the original text again. All 12,732 non-empty source cells remain accounted
for: 12,432 belong to transformed hearings and 300 to quarantined hearings.
The latter retain 229 person spans in the immutable audit without creating a
detached attendee.

**`**` appears as the complete value of 4,130 cells and means "no attendance
recorded".** It becomes an
absence of rows, not a person. Same for `لا يوجد حضور` and `متابعة`.

---

## Administrative works

### `admin_tasks` — 4,238 staged; 3,694 transformed; 544 quarantined
`matter_id`, `required_work`, `assigned_to_person_id`, `execution_date`,
`result`, `previous_decision`, `last_followup`, `court`, `circuit`,
`destination`, `status`, `alert`, `deadline`.

**This is the only area Paralegals can edit.**

### `task_actions` — 4,252 staged; 3,483 transformed; 769 quarantined
Steps within a task. 36 rows have an orphan `ID_Task` and 39 have none. They
remain in immutable quarantine with their complete source payload. Steps whose
parent administrative task is quarantined remain there too; no detached legacy
step is created.

`آخر متابعة` is text, not a date. In this extraction it commonly holds a date
followed by a multi-line administrative note. Task 2.9A preserves that complete
text and does not guess a date out of it.

---

## Documents, powers of attorney, contracts

### `powers_of_attorney` — 735 rows
Includes `المحامون الصادر لهم التوكيل`, which names several lawyers in one
field and is the main source of the 71 external people.

### `documents` — 405 rows
A register of **paper** documents: description, page count, deposit date,
responsible person, movement card, and where the hard copy is stored.

**Add `mfiles_id`** — an optional reference to the firm's M-Files document
system. Precedent exists: `خطابات الأتعاب.mfilesID` is filled on 306 of 331 rows.

### `fee_letters` — 331 rows
`contract_id` **must survive migration unchanged** — future invoicing attaches
to these records. Still actively used (latest entry Nov 2025).

### `fee_letter_matters` — 288 rows
From the Access multi-value column `خطابات الأتعاب.Matter` — **288 values
across 195 parent rows**. Values are case-number *strings* (`1039 / 20ق`), not
IDs.

**They match `الدعاوى.matterAR`, the Arabic case number — not `matterID`,
which is a surrogate integer.** Matched correctly, **256 of the 288 resolve
and 32 do not**; one resolves to *two* matters and is queued. Quarantine the
32; do not drop them.

> **Corrected 23 August 2026.** This section previously said matching "will
> produce unmatched rows" without a figure, and the summary table below gave
> the impression that all 288 were unmatched. Measured against `matterID` they
> are: 288 of 288. That is not a data-quality figure — it is the shape of a
> wrong column. See "A join that fails for every row" in `docs/MIGRATION.md`.

**There is a second, separate link in the other direction.**
`الدعاوى.[خطاب الأتعاب]` → the fee letters: **412 matters carry a value and
all 412 resolve.** These are two different relationships and two different
numbers; do not try to reconcile 288 against 412.

#### Two key spaces in one column

`الدعاوى.[خطاب الأتعاب]` does not point at one column. It points at
**`contractID` for some rows and `mfilesID` for others**:

| Resolves against | Range | Matters |
|---|---|---:|
| `contractID` — the dense internal key | 1 – 332 | **289** |
| `mfilesID` — the document-management id | 1 – 59,225 | **123** |
| both | | **0** |
| neither | | **0** |

**This is a hazard, not merely an explanation.** Two values already exist in
*both* key spaces, so a value could be genuinely ambiguous — today none is,
but nothing prevents one. The transform must therefore:

1. Resolve by an explicit, recorded rule the firm has confirmed, never by
   "whichever column happens to match".
2. **Assert that no value resolves both ways**, and fail loudly if one does.
   A silent pick attaches a matter to the wrong fee letter and nothing looks
   wrong afterwards.

**That assertion must survive into Phase 2 data entry.** The moment anyone can
type a fee-letter reference into a form, the same ambiguity can be created by
hand — so the check belongs in `npm run db:check` and in the entry validation,
not only in the migration that first found it.

---

## Billing — historical, read-only

### `invoices` — 543 rows (2010 – Dec 2021), 14 Access columns

**An invoice attaches to a FEE LETTER, not to a client.** `الفواتير` holds
`contractID` and no `clientID`; the client comes through the fee letter. That
is the link **D3** requires so Phase 2 invoicing can attach to the existing
contracts.

| Column | Access | Filled |
|---|---|---:|
| `invoice_no` | `Inv-No` | 100% |
| `fee_letter_id` + `legacy_contract_id` | `contractID` | 100% |
| `invoice_date` | `Inv-Date` | 100% |
| `amount` | `Amount` | 100% |
| `currency` | `Currency` | 100% |
| `details` | `Inv-Details` | 100% |
| `status_id` | `Inv-Status` | 100% |
| `type_id` | `Inv-Type` | 100% |
| `vat` | `VAT?` | 100% — **boolean**, 1 on 289 / 0 on 254 |
| `report` | `report` | 100% — **boolean**, 535 zeros / 8 ones. Not surfaced |
| `received_amount` | `R-#` | 49% nominally, but 278 blank + 244 zero — **21 real rows, 3.9%** |
| `amount_usd` | `USD$` | 4% |
| `received_currency` | `R-$` | 4% — the same 21 rows, `EGP` |
| — | `Pay-Date` | 23%, **not migrated (D4)** |

**Do not migrate `Pay-Date`** (D4) despite it being 23% filled: it stops in
September 2019 while payments run to December 2021.

**`VAT?` is a flag** — VAT applies to this invoice — and `report` is a flag on
eight invoices whose meaning is unknown. Both boolean, both migrated (D10),
neither surfaced.

**`VAT?` is migrated as-is and replaced in Phase 2.** The firm's ruling,
23 August 2026. In Phase 2 it becomes a field recording *whether VAT is
included in the invoice amount*, separate from the flag — because if `1` means
the amount already includes VAT, **any report summing `Amount` mixes gross
figures with net ones, and the total looks plausible while being wrong.** Not
a date rule: every pre-2016 invoice is `0`, but 2018 alone is 46 no against
67 yes. It is a per-invoice decision. See `docs/GLOSSARY.md` and the Phase 2
invoicing task.

**`R` stands for Received** — confirmed by the firm, 23 August 2026. `R-#` is
an amount received and `R-$` its currency, so both are the opposite of what
their names suggest: an **amount** despite the `#`, a **currency** despite the
`$`. Invoice 21408 is the case that shows it — 3,000 received against 33,000
invoiced, status *Partially Paid*.

**21 invoices of 543 carry either — a 3.9% fill rate**, recorded here because
a column this empty is easy to mistake for one that failed to migrate.
Migrated, neither surfaced.

### `payments` — 597 rows (2013 – Dec 2021)

**Money is `numeric(14,2)`, never a floating-point type.** A double cannot
hold 0.1 exactly; summing 597 payments in one gives a total that is close and
wrong, in a report a partner sends to a client. Gate 4 reconciles totals
against Access and that comparison only means anything if both sides add up
exactly. `currency` is kept on both tables because Gate 4 reconciles **per
currency** — a total across mixed currencies is a meaningless number.

`invoices.client_id` and `payments.invoice_id` are nullable: a row whose
parent cannot be resolved loads with a null link and goes to the review queue.

## Arabic search — `ar_normalise()`

One database function, built at task 1.6. **It is the only definition of
"normalised" in the system**; the copies that used to sit inline in
`scripts/check-db.ts` and migration 0006 were removed when it arrived.

Every searchable Arabic field has a shadow column holding its normalised form,
kept in step by a **trigger**, with a `pg_trgm` GIN index on it. The user's
query goes through the same function, so the two sides cannot drift.

| Table | Field | Shadow column |
|---|---|---|
| `clients` | `name_ar`, `full_name` | `name_ar_normalised`, `full_name_normalised` |
| `matters` | `case_number_ar`, `subject` | `case_number_ar_normalised`, `subject_normalised` |
| `people` | `name_ar` | `name_ar_normalised` |
| `person_name_alias` | `alias_ar` | `alias_ar_normalised` |
| `contacts` | `contact_name` | `contact_name_normalised` |

**Why a trigger and not a generated column.** Prisma does not know about
generated columns, so it would include them in every `INSERT`, and PostgreSQL
refuses an insert into a generated column — every create would fail. A trigger
is invisible to Prisma in the way a CHECK constraint is, so the shadow column
is an ordinary column Prisma can read and filter on while the database
guarantees its content. `npm run db:check` asserts the triggers exist and that
no stored value disagrees with the function.

**Folded:** diacritics and tatweel · `أ إ آ ٱ → ا` · `ة → ه` · `ى → ي` ·
`ؤ → و` · `ئ → ي` · Arabic-Indic digits `٠-٩ → 0-9` · Latin lowercased ·
the space inside a compound name.

**`J` is NOT folded to `ق`** — removed 23 August 2026 after it turned the
client **JTI** into `قTI`. See `docs/GLOSSARY.md`.

**Never folded: a dropped middle name.** `سامي خطاب` and
`سامي إبراهيم خطاب` stay apart. Asserted as a negative test in the migration
and in `db:check`, because it is the one property a future "improvement" would
quietly destroy. See "The four classes of Arabic name variation" in
`docs/MIGRATION.md`.

---

## Deferred — tables built, screens later

### `attendance` — 4,022 rows
Staff leave register. `person_id`, `date`, `status`.
**Not meeting attendance** — see D2.

### `invoice_allocations`
Replaces `تقسيم التحصيلات` (47 rows) and `LawyerShare4Invoices` (empty).
`invoice_id`, `person_id`, `share` — shares per invoice must sum to 1.

---

## Legacy identifiers

Every migrated table carries **`legacy_id`** — the Access primary key —
**unique where present**. PostgreSQL allows many NULLs in a unique column, so
rows the firm creates in the new system simply have none.

It exists because Gate 4 must reconcile **row for row** against Access rather
than merely count (`docs/MIGRATION.md`), and because a re-run of a transform
has to be able to find the row it wrote last time. The Access key names are
`ID_client`, `matterID`, `ID_hearings`, `ID_Task` and `contractID`.

`fee_letters.contract_id` is the exception that is not merely useful:
**it must survive migration unchanged** because Phase 2 invoicing attaches to
those records and the Excel kept since Dec 2021 refers to them by that number
(D3).

## Fill rates — record them beside the column

**Every column here carries how much of it is actually filled in the live
data.** A fill rate is a design fact, not trivia.

`Contacts.Home Phone` has **one row in 188**. `خطابات الأتعاب.Status` has
**three rows in 331**. `إجراءات المهام.الموعد القادم` has **seven rows in
4,130**. Those are not features. A screen or a report built around any of them
would be blank almost always, and the only way to know that before building it
is to have the number written down next to the column.

They are all still migrated — nothing is deleted (**D10**). They are simply
never surfaced.

The rates below were counted in the Access file by the firm. Add the
percentage whenever a column is added.

### `contacts` — 188 rows, 17 Access columns

| Column | Access | Filled |
|---|---|---:|
| `legacy_id` | `ID` | 100% |
| `client_id` | `clientID` | 100% |
| `contact_name` | `Contact1` | **97%** |
| `email` | `E-mail Address` | 75% |
| `mobile_phone` | `Mobile Phone` | 73% |
| `city` | `City` | 68% |
| `address` | `Address` | 67% |
| `country_region` | `Country/Region` | 65% |
| `state_province` | `State/Province` | 65% |
| `job_title` | `Job Title` | 60% |
| `business_phone` | `Business Phone` | 47% |
| `fax_number` | `Fax Number` | 25% |
| `web_page` | `Web Page` | 14% |
| `full_name` | `Full_name` | **10%** |
| `zip_postal_code` | `ZIP/Postal Code` | 6% |
| `home_phone` | `Home Phone` | **1% — one row** |
| — | `Attachments` | 100%, **0 files** |

**`Contact1` is the real name field at 97%; `Full_name` is 10%.** Do not
assume from the names which is primary — the firm checked.

`Attachments` looks fully populated and holds nothing. It is an Access complex
column (**D11**) and is **not migrated**. `db:check` asserts the column does
not exist.

### `powers_of_attorney` — 735 rows, 15 Access columns

| Column | Access | Filled |
|---|---|---:|
| `client_id` | `clientID` | 100% |
| `client_name` | `العميل` | 84% |
| `serial_no` | `مسلسل` | 82% |
| `principal_name` | `اسم الموكل` | 100% |
| `principal_capacity` | `صفة الموكل بالتوكيل` | 77% |
| `capacity` | `الصفة` | 100% |
| `poa_number` | `رقم التوكيل` | 99% |
| `poa_letter` | `حرف` | 99% |
| `poa_year` | `السنة` | 99% |
| `issuing_authority` | `جهة الإصدار` | 100% |
| `issue_date` | `تاريخ الإصدار` | 100% |
| `copies_count` | `عدد النسخ` | 99% |
| `notes` | `ملاحظات` | 53% |
| `show_on_poa_report` | `جرد` | 100% — **boolean, a report setting.** See below |
| `legacy_lawyers_raw` | `المحامون الصادر لهم التوكيل` | 100% |

`المحامون الصادر لهم التوكيل` holds **up to twelve lawyers in one string** and
is where the 71 external people in the roster came from. It stays **text**;
the split into rows happens at task **2.9** and needs the same treatment as
the hearing attendees.

`عدد النسخ` **drives the yellow-row highlighting on the powers-of-attorney
report** (`docs/REPORT-LAYOUTS.md`). It is stored as an integer and asserted to
be one — comparing it as text would order 10 before 2.

**`جرد` is a REPORT SETTING, not a fact about the power of attorney.**
Confirmed by the firm's litigation assistant, 23 August 2026: it is a checkbox
controlling whether the record appears on the **POA list report** (task 6.7).
Nothing to do with copies, courts or deposits — which is exactly why it
contradicted `عدد النسخ` in every direction. It is migrated as
`show_on_poa_report`, named for what it does, with `جرد` recorded as the
Access source. See "A column can be a report setting" in `docs/MIGRATION.md`.

**Two names still need the firm to confirm them:** `الصفة` against
`صفة الموكل بالتوكيل` (two capacity fields, and which is which is not
obvious), and `حرف`. They are not in `docs/GLOSSARY.md`, so they are
translated literally and the Arabic source column is recorded against each one
— the mapping is unambiguous whatever the English label turns out to be.

### `fee_letters` — 331 rows, 10 Access columns

| Column | Access | Filled |
|---|---|---:|
| `contract_id` | `contractID` | 100% |
| `client_id` | `clientID` | 100% |
| `contract_details` | `Cont-Details` | 98% |
| `contract_type` | `Cont-Type` | 94% |
| `contract_date` | `Cont-Date` | 93% |
| `mfiles_id` | `mfilesID` | 92% |
| `contract_structure` | `Cont-Structure` | 85% |
| `client_name` | `Client` | 65% |
| `status` | `Status` | **1% — three rows** |
| — | `Matter` | 100%, multi-value |

`Matter` is the Access multi-value complex column — **288 values across 195
parents** (**D11**) — and becomes the `fee_letter_matters` table at task 1.4,
not a column here.

`Status` at three rows is effectively unused. Migrate it; **do not build a
screen around it.**

### `task_actions` — 4,130 rows, 7 Access columns

| Column | Access | Filled |
|---|---|---:|
| `legacy_id` | `ID_process` | 100% |
| `task_id` + `legacy_task_id_raw` | `ID_Task` | 99% |
| `report` | `تقرير` | 100% |
| `result` | `النتيجة` | 99% |
| `action_date` | `تاريخ الإجراء` | 97% |
| `performed_by_person_id` + `legacy_performed_by_raw` | `القائم بالعمل` | 96% |
| `next_appointment` | `الموعد القادم` | **0% — seven rows** |

`القائم بالعمل` is a **person name** — the fourth such mapping in this
project. Resolve it through `person_name_alias`, never by matching
`people.name_ar` (**rule 15**), and keep `legacy_performed_by_raw` so the
spelling each row used survives.

`الموعد القادم` at seven rows is effectively dead. Migrate it; do not surface
it.

## Courts — `lookup_court`, 308 entries

Seeded 23 August 2026 from `sql/lookup-court-and-crosswalk.sql`, the firm's
review of all **401** distinct court names in `الدعاوى.matterCourt`,
`الجلسات.المحكمة` and `admin work table.المحكمة`:

| Outcome | Count |
|---|---:|
| KEEP — a real, distinct court | 307 |
| MERGE — a spelling of another court | 52 |
| SPLIT — a court with something else attached | 35 |
| WRONG — not a court at all | 7 |
| | **401** |

**308, not the 309 the source file states.** `هيئة الاستثمار` appeared in the
list *and* was a merge source for `الهيئة العامة للاستثمار والمناطق الحرة`;
the seed generator had taken it from a SPLIT's court part without checking. The
firm's review was consistent — the generator was not. `npm run db:check` now
asserts permanently that **no lookup value is also a crosswalk source**,
however it reached the list.

Never retype this list: `npm run generate:court-seed -- <new migration.sql>`.

**Four rules for Stage 2** are in the source file: a SPLIT writes to more than
one column and the remainder is never discarded; three raw values carry an
individual's name and belong on a **hearing** note (`الجلسات.ملاحظات`), not a
matter note, so task 2.6 quarantines those matters rather than guessing a
hearing; `(السودان)` on `الجيزة الابتدائية` loads as circuit text and is
flagged at Gate 3; and a court in neither the crosswalk nor the list is a
quarantine case.

## Lookups

All are **tables, not enums**, each with `label_ar`, `label_en`, `sort_order`,
`is_active`. Seed data is in `sql/lookups-and-crosswalk.sql`.

`matter_type` (14) · `matter_category` (21) · `degree` (12) · `venue` (7) ·
`importance` (3) · `party_role` (11) · `hearing_action` (20) ·
`matter_destination` (32) · `client_branch` (15) — **135 rows total**

`matter_destination` went 27 → 31 on 23 August 2026: four of the seven values
the court review found to be "not a court" are real places where something
happened, and that list already holds exactly this kind of value. See
`sql/court-wrong-destinations.sql`. Task 2.6 added the 32nd destination named
by the firm's structured matter-category split.

A tenth list, **`lookup_court`**, holds **308** courts and is **not** counted
in the 135. See below.

Was 150, then 146, then 130 after the branch resolution. Court destinations
and the structured matter split brought the current total to 135. Four values
were merged on 21 August 2026 after
three lists were found to have been marked "already clean" without inspection
(`sql/lookup-corrections.sql`). Then `client_branch` was resolved from 31
values to 15 — a branch is a site or subsidiary of a client and nothing else
(**D19**, `sql/client-branch-resolution.sql`).

---

## Known data-quality issues

These are **expected**. Load them; do not try to fix them silently.

| Issue | Count |
|---|---|
| Matters whose `الدعاوى.[خطاب الأتعاب]` reference matches no fee letter | **0 of 412** — was recorded as 289, which was the wrong column |
| Fee-letter multi-value entries (`خطابات الأتعاب.Matter`) matching no matter | **32 of 288** — was implied to be all 288, same fault |
| ...and matching *two* matters | **1** |
| Fee-letter → matter multi-value entries (`خطابات الأتعاب.Matter`) | 288 across 195 parents |
| Orphan task actions | 36 |
| Task actions with no parent id | 39 |
| Matters with no lawyer recorded | 834 |
| Hearings with no matter | 4 |
| Powers of attorney with no client | 1 |
