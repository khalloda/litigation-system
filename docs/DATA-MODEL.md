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

### `clients` — 313 rows

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

### `matters` — 1,730 rows
The central table. In Access it was 47 columns mixing identity, court
logistics, money, classification and free text.

| Column | Notes |
|---|---|
| `case_number_ar` | **Multi-line. 18% hold several case numbers. Do not split — see D9.** |
| `case_number_ar_normalised` | Generated, for search |
| `subject` | 98% filled |
| `client_id` | FK |
| `matter_type_id` | FK, defaults to تقاضي |
| `matter_category_id` | FK, nullable |
| `degree_id` | FK, nullable |
| `venue_id` | FK, nullable |
| `importance_id` | FK, nullable |
| `status` | سارية 493 / منتهية 1,223 / null 14 |
| `legacy_category_raw` | Original Access text, never overwritten |
| `legacy_degree_raw` | Original Access text, never overwritten |
| `court_id` | FK — court name |
| `circuit_id` | FK — court circuit, stored **separately** from the court |

`court_id` and `circuit_id` are two columns, not one. Reports join them for
display: `الإدارية العليا (11 موضوع)`,
`المحكمة الاقتصادية (الدائرة: (9) استئناف)`.

Source: `docs/REPORT-LAYOUTS.md`, "Type 4 — Client status report", which
records that the samples show court and circuit rendered together but stored
apart. **This is not D18** — D18 is the parameterised client report. Earlier
drafts cited D18 here and were wrong.

Court detail columns (floor, hall, shelf, secretary room) may move to a
`matter_court_details` table — optional, discuss before doing it.

### `matter_lawyers`
Replaces `lawyerA` / `lawyerB` and the combination strings.
`matter_id`, `person_id`, `role` (`lead` / `co_lead` / `support`), `position`,
`legacy_source`. **At most one `lead` per matter.**

Expected: 896 matters with a lead, 241 with support, 834 with none.

### `matter_parties`  +  `matter_party_roles`
Replaces `client&Cap` and `opponent&Cap`, which held name and legal capacity in
one field (92% and 83% multi-line).

`matter_parties`: `matter_id`, `side` (client / opponent), `party_name`,
`gender`, `ordinal`, `legacy_raw`.
`matter_party_roles`: `party_id`, `role_id`, `ordinal` — several roles per party.

---

## Hearings

### `hearings` — 13,279 rows
Largest table. `matter_id`, `hearing_date`, `next_hearing_date`, `action_id`,
`decision`, `outcome` (صالح / ضد), `court`, `circuit`, `client_notified`.

**`legacy_action_raw`** — the original الإجراء text, byte for byte.

Added 21 August 2026, and it is not optional. Three hearing actions were
merged into two that day (محكمه and مجكمة into محكمة, رفع الدعوي into
رفع الدعوى), which affects 18 hearings. Before that merge the mapping was one
to one and nothing could be lost; now it is many to one, and without this
column the original text is **unrecoverable** — the merge could never be
reversed if it were later judged wrong. See D10 and the `_raw` rule in
`docs/MIGRATION.md`.

### `hearing_attendees`
Replaces `الحاضر` and `حاضر 1`–`حاضر 4`, which held free text — 373 distinct
spellings for 135 people, plus multi-person strings with no consistent
separator.

`hearing_id`, `person_id`, `ordinal`.

**`**` appears 4,143 times and means "no attendance recorded".** It becomes an
absence of rows, not a person. Same for `لا يوجد حضور` and `متابعة`.

---

## Administrative works

### `admin_tasks` — 4,207 rows
`matter_id`, `required_work`, `assigned_to_person_id`, `execution_date`,
`result`, `previous_decision`, `last_followup`, `court`, `circuit`,
`destination`, `status`, `alert`, `deadline`.

**This is the only area Paralegals can edit.**

### `task_actions` — 4,130 rows
Steps within a task. 36 rows have an orphan `ID_Task` and 39 have none — these
load with a null link and go to the review queue. Do not discard them.

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
IDs, so matching to `matters` will produce unmatched rows. Quarantine them; do
not drop them.

**There is a second, separate link in the other direction.**
`الدعاوى.[خطاب الأتعاب]` → `خطابات الأتعاب.mfilesID`: **412 matters carry a
value, and 289 of them match no fee letter.** These are two different
relationships and two different numbers. Both are correct — do not try to
reconcile 288 against 289.

---

## Billing — historical, read-only

### `invoices` — 543 rows (2010 – Dec 2021)
**Do not migrate `Pay-Date`** (D4).

### `payments` — 597 rows (2013 – Dec 2021)

---

## Deferred — tables built, screens later

### `attendance` — 4,022 rows
Staff leave register. `person_id`, `date`, `status`.
**Not meeting attendance** — see D2.

### `invoice_allocations`
Replaces `تقسيم التحصيلات` (47 rows) and `LawyerShare4Invoices` (empty).
`invoice_id`, `person_id`, `share` — shares per invoice must sum to 1.

---

## Lookups

All are **tables, not enums**, each with `label_ar`, `label_en`, `sort_order`,
`is_active`. Seed data is in `sql/lookups-and-crosswalk.sql`.

`matter_type` (14) · `matter_category` (21) · `degree` (12) · `venue` (7) ·
`importance` (3) · `party_role` (11) · `hearing_action` (20) ·
`matter_destination` (27) · `client_branch` (15) — **130 rows total**

Was 150, then 146, now 130. Four values were merged on 21 August 2026 after
three lists were found to have been marked "already clean" without inspection
(`sql/lookup-corrections.sql`). Then `client_branch` was resolved from 31
values to 15 — a branch is a site or subsidiary of a client and nothing else
(**D19**, `sql/client-branch-resolution.sql`).

---

## Known data-quality issues

These are **expected**. Load them; do not try to fix them silently.

| Issue | Count |
|---|---|
| Matters whose `خطاب الأتعاب` reference matches no fee letter | 289 of 412 |
| Fee-letter → matter multi-value entries (`خطابات الأتعاب.Matter`) | 288 across 195 parents |
| Orphan task actions | 36 |
| Task actions with no parent id | 39 |
| Matters with no lawyer recorded | 834 |
| Hearings with no matter | 4 |
| Powers of attorney with no client | 1 |
