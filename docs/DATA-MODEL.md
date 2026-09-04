# Data model

“17 tables in scope” means the Dashboard-traced **Access business-source
scope** in D1, not the complete PostgreSQL physical schema. Gate 1 names that
extraction scope as 15 migration-source tables plus two reference-only tables.
PostgreSQL also contains target, lookup, junction, staging, quarantine, review,
authentication and evidence structures; do not use 17 as a physical-schema
count. Ten other Access user tables are archive-only and are not application
features.

Naming: physical columns are **snake_case ASCII**. Arabic is the display label,
held in `src/strings.ts` — not the column name. The Access data has 122 Arabic
column names and 139 containing spaces (`الموقف الحالي`, `Cash/probono`,
`Inv-No`), which are legal in Access and hostile to everything else.

Thirty-seven current application tables plus `person_name_alias` carry
`created_at`, `created_by`, `updated_at` and `updated_by`. This exact 38-table
Task 3.3A boundary has secure actor attribution and now also feeds Task 3.3B's
append-only row/relationship event store. Staging, quarantine, immutable
migration evidence, infrastructure and audit-foundation tables keep their
purpose-specific provenance instead.

---

## People and organisation

### `people` — 137 rows after Task 3.1
The single roster. Replaces both Access lawyer tables and also holds people
created natively by the application.

**Protected Stage 2 roster: 135 canonical people — 64 firm staff (21 current,
43 former) + 71 external. Task 3.1 adds two current native staff separately.**

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
| `is_application_native` | boolean | false for all 135 protected Stage 2 people; true for application-created people |

### `person_name_alias` — 350 rows after Task 3.1
Every spelling ever typed, mapped to one person. Makes historical search work.

The reviewed Stage 2 baseline contains 348 aliases. Task 3.1 adds the exact
self-aliases for the two native people. **Zero people are unfindable by their
own name**, which rule 15 depends on: matching through the alias table only
works if every name is in it. Samy Khattab's exact self-alias was already
present from task 1.2a and is asserted rather than duplicated.

### `user_accounts`
One username/password account per person. Usernames keep their approved display
case but are matched through a separately stored lowercase value with a unique
constraint. Email is not a login identifier.

| Column | Type | Notes |
|---|---|---|
| `person_id` | integer, unique FK | Exactly one account per person |
| `username` | text | Approved display spelling |
| `username_normalized` | text, unique | Lowercase login key |
| `password_hash` | text, null | NULL until initialized locally; Argon2id only afterward |
| `role_code` | checked text | Exactly the four fixed roles; not a PostgreSQL enum (D8) |
| `is_enabled` | boolean | Disabled accounts cannot authenticate |
| `must_change_password` | boolean | true after initialization or administrative reset |
| `failed_login_attempts` | integer | 0–5; the fifth failure creates a 15-minute lock |
| `locked_until` | timestamptz, null | Required exactly when the counter is 5 |
| `session_version` | integer | Incrementing it invalidates every older JWT session |
| `password_changed_at` | timestamptz, null | NULL only before initial password setup |
| `last_login_at` | timestamptz, null | Successful credential verification time |

Passwords use Argon2id v19 with 19,456 KiB memory, two iterations, parallelism
one and a 32-byte result. Auth.js JWTs contain only account/person ids,
username, Arabic display name, role, password-change state, session version, an
independently generated non-secret audit-session UUID and absolute timestamps;
no password hash or email is placed in the session.

Task 3.4 keeps this table append-only in identity terms: accounts are disabled
and reactivated, never deleted. Migration
`20260903160000_secure_user_account_lifecycle` makes one fixed-search-path
database gateway the runtime's only account-creation path. It re-reads one
eligible existing active staff person by ID and atomically creates both the
account and its immutable human actor. The actor uses its own sequence and has
no arithmetic relationship to the account ID. Direct runtime `INSERT`,
`DELETE` and `TRUNCATE` are denied.

Username/role changes, disablement, reactivation and administrative password
reset use serializable transactions, row locks, stale-version checks and
ordered semantic events. Changes that affect identity or access increment
`session_version`; disablement and password operations also clear lockout.
Reactivation always supplies a fresh temporary password and requires an
ordinary password change at the next login. Database guards protect both
account changes and later person deactivation from removing the last usable
Administrator.

---

## Task 3.3 audit foundation

Task 3.3A actor attribution and Task 3.3B append-only events are implemented.
The original readiness inventory and owner resolution are preserved in the
[`Task 3.3 readiness audit`](reviews/2026-09-01-task-3.3-implementation-readiness-and-scope-reconciliation-audit.md).

### Alias baseline versus current population

The **348-row reviewed migration baseline** and the **350-row current
application table** answer different questions:

- [`reviewed-links.json`](../scripts/baselines/reviewed-links.json) protects 348
  reviewed Stage 2 alias-to-person outcomes.
- Task 3.1 migration `20260831100000_authentication` adds exactly two
  application-native people and one primary self-alias for each.
- Its standing postcondition requires 135 protected people, two native people
  and 350 aliases. A 1 September aggregate-only read-only database check proved
  348 aliases owned by protected people and two primary self-aliases owned
  one-to-one by the two native account identities.

The two native rows are not additions to the reviewed migration baseline and
do not indicate baseline drift.

### Task 3.3A — actor attribution (implemented)

Migration `20260901120000_secure_audit_actor_attribution` implements **D30**
and **D33** on the exact 38-table application boundary. `audit_actors` began
with seven immutable identities and is now an evolvable registry:

- three system actors: `system_migration`, `system_authentication` and
  `system_administration`;
- four original human actors, one for each Task 3.3 `user_accounts.id`, keyed as
  `user_account:<id>` and linked by a restricted foreign key.

Every later account receives exactly one human actor through the Task 3.4
creation gateway, and every human actor remains linked to exactly one account.
The three system actors and original four human actors stay exact historical
anchors while legitimate account/activity growth is allowed. Permanent checks
reject orphan or multiply linked accounts/actors and separately preserve the
frozen Task 3.3 attribution baseline rather than recalculating it from growing
current state.

The two additional system identities are purpose-specific, not application
users or a fifth role. Failed/successful login and lockout state use
`system_authentication`; controlled local password initialization/reset uses
`system_administration`; only migration, import, seed and proved backfill work
uses `system_migration`. Authenticated self-password changes use the linked
human actor.

The registry stores `id`, immutable `actor_key`, constrained `actor_kind`,
optional unique `user_account_id`, immutable `identity_label`, exact `purpose`
and `registered_at`. Update, delete and truncate are refused. Every application
actor column references it with `ON UPDATE RESTRICT ON DELETE RESTRICT` and has
a supporting index. The registry itself deliberately does not receive the
four-column application audit pattern.

All 38 application tables now have `created_at`, `created_by`, `updated_at`
and `updated_by`; `person_name_alias.updated_at` was truthfully initialized
from its existing `created_at`. A shared before-insert/update trigger obtains
the actor from transaction-local validated context, overwrites caller-supplied
actor/timestamp values, preserves `created_by`/`created_at` on update, and fails
restricted-runtime writes with missing or invalid context.

Historical backfill records 45,463 creations and 45,459 last updates as
`system_migration`. The four pre-existing `user_accounts.updated_by` values
remain null because their later password/authentication history cannot prove a
human or system actor. No human attribution was fabricated.

Staging, quarantine, immutable migration evidence, `_prisma_migrations`, the
actor registry and the event table retain their purpose-specific provenance
models. They do not receive the application four-column pattern.

The web runtime connects as restricted `litigation_runtime`; migration and
controlled administration use D35's isolated, directly authenticated
PostgreSQL superuser through `MIGRATION_DATABASE_URL`. The superuser secret is
absent from the production web process. The runtime has no explicit inbound or
outbound role-membership edge, and no path to `SET ROLE` elsewhere. The
application exposes no request-controlled actor selector. A semantic
capability-flow check allows raw SQL only in the six fingerprinted direct
`$queryRaw` calls with `Prisma.sql` tagged templates; aliases, wrappers, reflection,
request-selected callables and migration-only imports fail closed. PostgreSQL
custom settings remain a documented trust boundary for a fully compromised
runtime process; this is database-enforced anti-spoofing for external
application inputs, not cryptographic proof against that process.

### Task 3.3B — append-only events (implemented)

Migration `20260902180000_append_only_audit_events` implements the frozen
owner-approved event foundation (**D30**, **D32**). Forward migration
`20260903100000_close_task33b_review_gaps` closes the independent-review gaps
without changing migrations 1–57 or the original checkpoint. The four
purpose-specific tables are:

- `audit_events` is the immutable chronological record;
- `audit_event_table_rules` classifies all 38 tables as records or
  relationships and fixes each structured key to `id`;
- `audit_event_fields` retains the frozen 262-rule value/redaction baseline and
  now classifies all 583 columns in the 38 audited tables exactly once: 261
  captured values, one change-fact-only redaction, 38 entity keys, 152
  structural audit columns and 131 precisely reasoned exclusions; and
- `audit_event_checkpoints` protects the one-event deployment boundary plus
  the event and allowlist digests.

The action taxonomy covers:

- create, update, archive and restore;
- field-level before/after values and relationship changes;
- user and role lifecycle;
- password-change facts without passwords or hashes;
- successful and failed login attempts, including lockouts;
- report execution, exports and downloads.

Every event has a bigint identity, microsecond timestamp, stable actor and
immutable identity/role snapshots, optional target snapshots, action/outcome,
optional structured entity key, changed fields, bounded before/after JSON,
request/correlation and independent audit-session UUIDs, optional PostgreSQL
`inet` address, and bounded request/resource metadata. User agents are limited
to 512 characters with a truncation flag; attempted usernames to 64;
resource identifiers to 256; field strings to 64–2,048 according to the
allowlist; before/after documents to 64 KiB each; and flat semantic parameters
and metadata to 32 primitive keys, 256 characters per string and 16 KiB each.

Per-field classifications exclude only exact columns with a precise reason;
there is no wildcard or naming-rule exclusion that can hide a future business
field. Any unclassified column in the 38-table boundary fails both permanent
verification and a row insert/update involving that column. Secret-shaped
strings and structured values are replaced by explicit redaction markers;
overlong strings keep a bounded prefix plus truncation and original-character
metadata. SQL `NULL`, an empty string and an absent field remain distinct.
Ordinary views, searches, list loading and navigation generate no event.

Events and their rules/checkpoint are retained indefinitely. Update, delete
and truncate triggers reject changes; the runtime has no direct event, actor or
sequence access and can execute only the reviewed context setter and
account-target semantic gateway. That gateway resolves the target actor through
`audit_actors.user_account_id`, never account-ID arithmetic. Row triggers append
through internal fixed-search-path functions. Human/authentication paths must
supply explicit server-created request, correlation and audit-session IDs;
missing, partial or malformed context rolls the business transaction back.
Entity, actor, time, action/outcome, request and correlation indexes support
microsecond-preserving `(occurred_at, id)` keyset retrieval without an
unrestricted JSON GIN index.

Deployment writes exactly one truthful `audit_baseline_established` event as
`system_migration`, containing aggregate counts and existing protected digests.
It creates no historical row, login, password, report, export or download
events. Current authentication paths emit real events. The atomic wrapper is
limited to database-reversible archive, restore and account/role lifecycle
work. Future report/export/download events are server-observed facts emitted at
a truthful point after the relevant fact; they cannot make filesystem, response
or network effects atomic with PostgreSQL, and a download event cannot prove
client receipt. The approved viewer/export UI and D31 capability remain Task
4.9 work.

---

## Clients

### `clients` — 318 rows (313 on 19 August; the file grows)

Client identity has two independent key spaces: Access `ID_client` is retained
in `clients.legacy_id`, while `clients.id` is generated by PostgreSQL. Resolve
through the stored relationship, never an offset or a name. Task 3.5A v2
choices display both IDs and protect their association with the exact label;
duplicate-name clients remain distinct.

**D39, approved 4 September 2026, not yet applied:** the 13 Sigma matters retain
Access/legacy 188 → system client 197, and the Alpha matter retains Access/legacy
2 → system client 11. Three exact historically misclassified branch values
must later be added/mapped with parent compatibility enforced in Task 3.5B.

**D40, approved 4 September 2026, not yet applied:** ten exact reviewed matters
have an intentional NULL branch, not a synthetic lookup. Two exact hearing
decisions approve the distinct court `أسرة مصر الجديدة`, with no database ID
until Task 3.5B creates it. M-000111 confirms Access client 133 / system client
142 (`ماسترز`) despite its blank source client. The circuit and hearing-note
corrections are recorded in D40. These are workbook decisions only; no schema,
lookup, relationship or project row changes in Task 3.5A.
No new branch row, parent constraint, renamed client or released record exists
as a result of this Task 3.5A workbook correction. The current 15-branch count
and historical migration evidence below remain unchanged.

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

The current, application-facing table holds `client_id`, `relative_path`,
`file_name`, `content_type`, `byte_size` and `sha256`. **Never the image
itself.** `relative_path` is always `{client_id}/{filename}` and is resolved
against `CLIENT_LOGO_ROOT` — no absolute machine path enters PostgreSQL.

Task 2.11 also created `migration_client_logo_import` with **54 immutable
historical rows**. It records the exact source parent, durable source identity,
extraction fingerprint, original filename/path, detected type, bytes, SHA-256,
resolved client and original destination. This is deliberately separate from
`client_logos`: Task 4.1a may later replace a client's current logo without
rewriting or erasing the Access migration evidence. The original imported file
remains available for that audit; a native current file is checked through its
own `client_logos` metadata.

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
| `case_number_ar_normalised` | Trigger-maintained shadow, for search |
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
`matter_id`, `required_work`, `assigned_to_person_id`, `task_created_date`,
`execution_date`, `result`, `previous_decision`, `last_followup`, `court`,
`circuit`, `destination`, `status`, `alert`, `deadline`.

`task_created_date` is Access `تاريخ الإنشاء`: the task's business creation
date. It is nullable and has no database default. Of the 3,694 migrated tasks,
1,906 carry an exact source date and 1,788 carry a genuine source NULL; the
migrated range is 22 February 2018 through 18 August 2026. `created_at` remains
the PostgreSQL insertion/audit timestamp and is never a substitute.

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

### `powers_of_attorney` — 752 rows in the current Stage 2 extraction
Includes `المحامون الصادر لهم التوكيل`, which names several lawyers in one
field and is the main source of the 71 external people.

### `documents` — 407 rows in the current Stage 2 extraction
A register of **paper** documents: description, document date, original and
typed page count, deposit date, notes, responsible person, movement card, and
where the hard copy is stored. Task 2.9C also preserves the typed client name
and matter reference beside their resolved IDs.

`mfiles_id` is an optional reference to the firm's M-Files document system,
with `legacy_mfiles_id_raw` beside it. The current `المستندات` source table has
no M-Files column, so both are null for all 407 migrated rows; the fields are
available for future application-native records. Precedent exists:
`خطابات الأتعاب.mfilesID` is filled on 306 of 331 rows.

### `fee_letters` — 331 rows
`contract_id` **must survive migration unchanged** — future invoicing attaches
to these records. Still actively used (latest entry Nov 2025). Task 2.9D
transformed all 331 and preserved `mfilesID` independently in both its typed
and byte-exact raw forms.

### `fee_letter_matters` — 231 transformed rows, 57 quarantined sources
From the Access multi-value column `خطابات الأتعاب.Matter` — **288 values
across 195 parent rows**. Values are case-number *strings* (`1039 / 20ق`), not
IDs.

**They match `الدعاوى.matterAR`, the Arabic case number — not `matterID`,
which is a surrogate integer.** Task 2.9D created **231 target links**. Of the
remaining 57, 32 match no matter, 24 match a matter already quarantined by
Task 2.6, and 1 matches *two* matters. All 57 remain in immutable quarantine
with the complete source evidence; none are dropped or guessed.

> **Corrected 23 August 2026.** This section previously said matching "will
> produce unmatched rows" without a figure, and the summary table below gave
> the impression that all 288 were unmatched. Measured against `matterID` they
> are: 288 of 288. That is not a data-quality figure — it is the shape of a
> wrong column. See "A join that fails for every row" in `docs/MIGRATION.md`.

**There is a second, separate link in the other direction.**
`الدعاوى.[خطاب الأتعاب]` → the fee letters: **412 matters carry a value and
all 412 resolve.** These are two different relationships and two different
numbers; do not try to reconcile 288 against 412.

### `matter_fee_letter_references` — 393 rows

The resolved application relationship for that second direction. The other
19 source references remain in immutable quarantine because their parent
matters are already quarantined. Every row records whether the reviewed rule
used `contractID` or `mfilesID`, and retains the original reference and full
matter-source payload. References created later in the application use the
same relationship table with all legacy provenance fields left null.

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

Task 2.9D enforces both rules permanently in `npm run db:check`.

**That assertion must also survive into Phase 2 data entry.** The moment anyone can
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
| `currency` + `legacy_currency_raw` | `Currency` | 100% — exact ` USD` is the one reviewed normalization to usable `USD`; no generic trimming |
| `details` | `Inv-Details` | 100% |
| `status_id` | `Inv-Status` | 100% |
| `type_id` | `Inv-Type` | 541 / 543 — invoices `21269` and `21772` are exact NULL and remain NULL |
| `vat` | `VAT?` | 100% — **boolean**, 1 on 289 / 0 on 254 |
| `report` | `report` | 100% — **boolean**, 535 zeros / 8 ones. Not surfaced |
| `received_amount` | `R-#` | 49% nominally, but 278 blank + 244 zero — **21 real rows, 3.9%** |
| `amount_usd` | `USD$` | 4% |
| `received_currency` + `legacy_receipt_currency_raw` | `R-$` | 21 `EGP`; two reviewed raw `0` values become usable NULL only because their receipt amounts are zero |
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

Task 2.10A preserves each invoice and payment currency in a raw partner. The
only reviewed normalization is exact source ` USD` → usable `USD`, covering
invoice `21352` and its two payments. It is not a general trim or case-fold.
Likewise, raw receipt-currency `0` on invoices `21225` and `21226` becomes
usable NULL only while its receipt amount is zero; a non-zero pairing is
unsafe and must not be silently accepted.

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
Staff leave/location register. Task 2.10B transformed all 4,022 source rows and
quarantined none. `legacy_id`, `person_id`, `legacy_person_raw`,
`attendance_date`, `situation`, `legacy_situation_raw`, durable source key,
extraction fingerprint and complete source payload. The ten exact legacy name
values resolve only through `person_name_alias`. `situation` is the original
free-text `AttSituation`, not a status lookup; all 873 distinct values and all
NULL/empty, case, line-break and whitespace distinctions are preserved.
**Not meeting attendance** — see D2.

### `invoice_allocations`
Task 2.10A transforms the 47 rows in `تقسيم التحصيلات` into this table.
`LawyerShare4Invoices` is a reference-only source table and is asserted to be
exactly empty; it produces no target row. `invoice_id`, `person_id`, `share` —
shares per invoice must sum to 1.

The source `Percent` decimals are already fractional shares. Every complete
invoice group sums to exactly `1.000` before any conversion, so the migration
copies them directly and preserves the source representation in
`legacy_percent_raw`; it never divides by 100. Exact source English name
`Ahmed Abdullah` is the one owner-reviewed legacy crosswalk to person 25
(`Dr. Ahmed Abdullah`), covering 11 rows across nine invoice groups. It does
not alter the person or create an application-wide alias.

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

### `powers_of_attorney` — 752 rows, 15 Access columns

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
task **2.9B** created 87 reviewed lawyer rows. Every row keeps the complete
source cell and exact reviewed rule/member order; unreviewed text stays in
immutable relationship evidence rather than being guessed.

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

**The three meanings are approved — D29, 1 September 2026.** `الصفة` is the
principal's legal capacity/status and remains the maintained source field.
`صفة الموكل بالتوكيل` is an abandoned duplicate of `الصفة`; its source value
is preserved but must not become a second competing business meaning. `حرف` is
the letter/series component of the power-of-attorney identifier. The Arabic
source column remains recorded against each field, so the migration evidence
stays reversible.

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
| Transformed matters with no target lawyer relationship | **981 of 1,689** (the earlier 834 of 1,730 was the planning snapshot) |
| Hearings with no matter | 4 |
| Powers of attorney with no client | 1 |
