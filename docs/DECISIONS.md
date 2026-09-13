# Decisions already made

Every decision here was made by the firm after analysis of the real data.
**Do not re-open them.** If you believe one is wrong, say so and explain why —
but do not quietly build something different.

---

## D1 — Scope comes from the Dashboard, not the object list

The Access file contains 122 forms, 131 reports and 290 queries. Tracing what
the Dashboard actually reaches gives **31 screens, 49 reports, 29 queries and
17 tables**. The rest is abandoned or test material.

*(Those 49 reports later reduced to **45** — four were the same report copied
with a hard-coded filter, one was dropped. See **D17**.)*

*Why it matters:* build only what is traced. If something seems missing, ask —
do not go looking in the old file for extra features.

## D2 — Meetings dropped entirely

Three tables (`اجتماع`, `حضور الاجتماع اليومي`, `meeting_attendance`, 3,230
rows) are archived, not migrated. Nothing in the live system used them.

**Do not confuse this with staff attendance.** `Attendance` (4,022 rows) is a
*leave register* — different feature, deferred not dropped.

## D3 — Attendance and invoicing deferred, tables built now

The firm runs both in Excel today. Their tables are created in Phase 1 with
correct keys so the screens can be added later without a database migration.

Fee letters (`خطابات الأتعاب`) are still live in Access as of Nov 2025, but
invoices stop Dec 2021 — so four years of billing has run in Excel, detached
from the contracts it belongs to. The invoice tables must attach to the
**existing** contract records; contract IDs must survive migration unchanged.

## D4 — Historical invoices migrate, read-only

543 invoices (2010–2021) and 597 payments (2013–2021) are migrated so old
billing questions can be answered in the new system. Nobody can create or edit
invoices in Phase 1.

**Do not migrate `الفواتير.Pay-Date`.** It stopped in Sept 2019 and holds 126
stale values superseded by the payments table.

## D5 — One lawyer roster, joined by ID not name

Access had two tables: `lawyers` (23 real people) and `المحامين` (38 rows that
were mostly *combinations* of lawyers — a workaround for Access not supporting
many-to-many).

`المحامين` is **not migrated**. Lawyers attach to matters through a junction
table with a role. Names are never used as keys.

*Evidence:* `احمد سعيد` and `أحمد سعيد` differ by one hamza and Access treated
them as two people, detaching 3 matters.

### Clarification, 23 August 2026 — `المحامين` is still EXTRACTED

**The decision above does not change. This adds what it did not say.**

Not migrating a table is not the same as not reading it. The first extraction
run (task 2.1) exported the Access relationships, and they show:

```
المحامين.lawyer_name  →  الدعاوى.lawyerA     enforced
المحامين.lawyer_name  →  الدعاوى.lawyerB     enforced
```

**`المحامين` is the enforced parent of both lawyer fields on every matter.**
Every value in `الدعاوى.lawyerA` and `.lawyerB` is a name drawn from that
38-row list, and most of those 38 are *combinations* of lawyers rather than
people. It is the list that turns a matter's lawyer field into real people.

So it must still be extracted. **Drop it and task 2.7 has nothing to expand
the combination strings from** — the matters would keep a name that resolves
to nobody, which is the exact failure this decision exists to prevent.

Gate 1 therefore expects **17 tables in two named groups**: 15 *migrated*, and
2 *reference-only* — `المحامين` and the empty `LawyerShare4Invoices` — which
are extracted and never migrated. See `docs/MIGRATION.md`.

## D6 — Teams dropped from the matter

87% of matters (1,507 of 1,730) were on "team 1". A field where almost
everything has the same value carries no information. Lawyers attach to matters
directly. A team label may exist on the *lawyer* record, never on the matter.

**Settled.** The team label lives on `people.team_id`. Two teams
(`الفريق أ`, `الفريق ب`) with their membership recovered from the Access
`فريق العمل` text blob — see `sql/lookups-part2-and-teams.sql`.

- A **null team is valid**. Team-grouped reports must show those people under
  an "unassigned" heading, **never drop them**.
- Access "team 3" overlapped teams 1 and 2, was used by only 3 matters and had
  a different reviewer. It is an abandoned duplicate and is **not created**.
- The firm confirms final membership before Stage 6.

## D7 — Party capacity is a role, not a text string

`client&Cap` and `opponent&Cap` held the party name and their legal capacity in
one field, producing 242 distinct capacity strings — mostly Arabic grammatical
inflections of about 11 roles.

Model: **11 roles**, with masculine/feminine forms rendered from the role plus
an optional gender flag. Dual and plural forms collapse to the base role
(confirmed by the firm: `مستأنفتان` → `مستأنف`).

`طاعن` and `متظلم` are **different roles**. Do not merge them.

A party with two roles (`مستأنف ضده، مستأنف`) becomes two rows.

## D8 — Four classification lists, not two

Access had `matterCategory` (50 values) and `matterDegree` (40 values), each
holding several different concepts. These become four independent lists:

| List | Question it answers | Values |
|---|---|---|
| `matter_type` | What kind of work? | 14 |
| `matter_category` | Which practice area? | 21 |
| `degree` | Which court instance? | 12 |
| `venue` | Which forum? | 7 |

*Evidence:* 22 of 23 matters with `category=لجنة` **also** had `degree=لجنة` —
the same fact typed into whichever box was free.

All lists are **database tables, never PostgreSQL enums**, so an administrator
can add a court without a code change.

## D9 — Case numbers stay as one text field

308 matters (18%) hold several case numbers stacked with line breaks — the
matter's journey up through the courts:

```
1002 / 2015 -
3511، 3610 / 134ق
```

The firm decided **not** to split these. Parsing 1,730 legally significant
identifiers risks corrupting the one thing lawyers use to find a case, for no
real gain: search still works through the normaliser, and "which matters are at
appeal" is answered by the `degree` field.

**The field must display as multiple lines.** Do not collapse it to one line.

## D10 — Nothing is deleted during migration

Every record keeps its original text in a `_raw` column. Values that cannot be
mapped are parked in a review table with the reason. See `docs/MIGRATION.md`.

## D11 — Complex Access columns need special extraction

`العملاء.logo` and `خطابات الأتعاب.Matter` are Access "complex columns". A
normal CSV export produces a column that **looks full** but contains internal
pointers (`136`, `42`), silently destroying 54 client logos and 288 matter
references.

They must be read through the Access object model. Never use `mdbtools`, plain
ODBC, or a Python `.accdb` reader for these.

## D12 — Arabic only, English data retained

No interface translation, no i18n library. But **no Arabic string is hardcoded
in a component** — all strings live in one file, so a future bilingual version
is a mechanical change rather than an excavation.

## D13 — One language for the whole stack: TypeScript

An earlier proposal used .NET for the back end and Next.js for the front. Two
languages doubles the surface area for confusion, and the owner cannot diagnose
a toolchain problem. Next.js covers both ends in TypeScript.

## D14 — Billing visible to everyone

All four roles can see invoices and payments, for all clients. This matches how
Access works today. Restricting it would be a change to how the firm operates,
not just to the software.

## D15 — Client logos live in a folder on the server

Not in the database, and not in cloud storage.

The firm weighed this against storing images in the database and chose the
folder. It is a legitimate choice — files can be seen and replaced directly —
but it carries one risk that must be engineered away.

**The risk:** the database and the folder are two separate things. If they are
restored from different points in time, a client record can point at a file that
no longer exists. The report then breaks, and nothing warns anyone until a
partner tries to print.

**Three safeguards are mandatory:**

1. **One backup operation covers both.** A single script snapshots the database
   and the logo folder together. They must never be backed up separately.
2. **A weekly integrity check** lists any client whose logo file is missing and
   emails the result.
3. **Graceful failure.** A missing file prints the client's name in text —
   exactly as when no logo exists. It must never break a report or show a broken
   image.

**Layout:** `/var/lib/litigation/client-logos/{client_id}/{filename}`
The database stores the relative path, original filename, content type and byte
size — never the image itself.

**Measured scale:** 54 logos, exactly **1,541,428 bytes** (about 1.47 MiB).
The earlier 771 KB figure was a planning estimate. Task 2.11 replaced it on
26 August 2026 with the independently summed, manifest-backed extraction; all
54 CSV references, files, byte sizes, content signatures and hashes agree.

## D16 — Backup policy

The firm takes a **weekly or monthly VM snapshot**. That is the disaster layer —
it rebuilds the machine. It is **not** sufficient on its own.

Measured evidence: the Access data grows by roughly **100 records a day**. A
week-old snapshot loses about 700 records; a month-old one about 3,000. Those
records cannot be reconstructed — the hearings already happened.

**Three layers, all required:**

1. **Nightly automated backup** of the database *and* the logo folder, in one
   operation. 30 nights retained.
2. **Copied off the VM** — another machine, a network share, or cloud storage.
   A backup stored on the server dies with the server.
3. **The VM snapshot** stays as the disaster layer.

**A restore must be tested before go-live** — onto a spare machine, verifying
that a client logo actually appears in a printed report. Untested backups fail
often, and always at the worst moment.

## D17 — Report count is 45, not 49

Four reports were the **same report copied and given a hard-coded filter**.

Proven from the recovered Access metadata: `تقرير عملاء 2` and `تقرير عملاء 8`
have **byte-identical** record sources (the same 556-character query).
`تقرير عملاء -جميع الدعاوى سارية ومنتهية` is 92% identical.
`تقرير عملاء 6` reads the same data through a query named `Clients report`.

These four become **one parameterised report**. Its layout is documented in
`docs/REPORT-LAYOUTS.md`.

`Copy Of صالح-ضد temp-JTI` is **dropped entirely** by the firm — a temporary
copy made for one client.

`صالح-ضد مفصل حسب المحامي` is **not** a duplicate. Its query is only 59%
similar and pulls four columns the client report does not: the for/against
outcome (`صالح/ضد`), the lead lawyer, hearing notes, and the matter partner. It
stays as its own report.

**Watch for the same pattern elsewhere.** Three reports still carry `Copy Of` in
their name, and two carry a hard-coded date (`31-12-2020`). Before building any
of them, compare their record sources — if two match, ask the firm before
building both.

## D18 — The client report is parameterised

The client report takes: **client**, **date period**, **active matters only or
all** (active is the default), and **lawyer**. One report, one filter form —
not a copy per combination.

Every list report gets a **count row** at the foot (`إجمالي عدد الدعاوى`).

## D19 — A client branch is a site, not a practice area

**Historical decision preserved. D39 (4 September 2026) supersedes only the
separate-client classification and blanket wrong-client claim for the three
exact values `سيجما للصناعات الدوائية`, `سيجما للإعلام (تليفزيون الحياة)`
and `ألفا مصر للتجارة`. The text below, migration 0007 and its crosswalk and
quarantine evidence remain historical evidence, not the current interpretation
of those three values. D39's data application is deferred to Task 3.5B.**

`clientBranch` had become a box people typed anything into. Its 31 values held
at least four different concepts at once — the same overloaded-column pattern
as `matterDegree` (D8), affecting 560 matters.

**A branch is a site or subsidiary of a client. Nothing else.**

`lookup_client_branch` is reduced from 31 values to **15**, all of them genuine
sites: the Toyota, Al-Futtaim and Orascom subsidiaries, the Mansoura and
Alexandria offices, and the three sites of أدخنة النخلة — `المصنع المحلي`,
`المركز الرئيسي` and `المنطقة الحرة`.

**`المنطقة الحرة` is a branch**, not a venue. An earlier note had it moving to
`lookup_venue`; the firm corrected that. `lookup_venue` stays at 7 values.

The other 16 values move, each recorded in `migration_crosswalk` so Stage 2
still maps the old text:

| What it really was | Values | Where it goes |
|---|---:|---|
| Practice areas | 9 | `matter_category` |
| A kind of work | 1 | `matter_type` |
| A court instance | 1 | `degree` |
| Too vague to map | 1 | quarantine |
| **Separate clients** | 3 | **quarantine — see below** |
| Headings pasted from a document | 2 | discarded |

Nothing is lost. Every client keeps its original branch text byte for byte in
`clients.legacy_branch_raw`. Fourteen matters lose their branch outright — the
two document headings — and the firm has agreed to that.

**Two rules that are correctness, not tidying:**

1. **Never overwrite an existing `matter_category`.** Where a branch moves to
   `matter_category` and the matter already has one, **quarantine the
   conflict** for the firm.

2. **The three "separate client" values are a correctness problem.**
   `سيجما للإعلام (تليفزيون الحياة)`, `ألفا مصر للتجارة` and
   `سيجما للصناعات الدوائية` are clients in their own right. **Any matter
   carrying one of them is attached to the wrong client entirely.** Those
   matters are quarantined at task 2.6. **Do not guess** which client they
   belong to.

Both rules are recorded on tasks 2.5 and 2.6 and in the `reviewer_note` of
every affected crosswalk row.

**`آراء قانونية` is a `matter_type`, not a `matter_category`.** The written
instruction said category; `رأي قانوني` does not exist in that list and does
exist in `matter_type`. The firm confirmed: a legal opinion is a kind of work,
which is exactly the distinction **D8** draws, and `رأي قانوني` is distinct
from `استشارات` — settled during the classification review. **No new practice
area was created.**

Full detail and reasoning: `sql/client-branch-resolution.sql`.

## D20 — A court is a list, a circuit is text

Two facts that look alike and behave nothing alike. The firm counted both in
the real data before deciding.

**The court is a list.** `lookup_court`, Administrator-managed, filled at
Stage 2.

305 distinct court names across 13,205 hearings, repeating heavily —
`القاهرة الاقتصادية` 1,982 times, `شبين الكوم` 1,192, `شمال القاهرة` 1,134.
Egypt has a finite number of courts, `docs/PERMISSIONS.md` already promises
the Administrator manages the court dropdown, and "which court" is a report
filter the firm needs.

Expect roughly 300 entries needing a spelling-variant cleanup at Stage 2, the
same as every other Arabic list in this project — `القضاء الإداري` and
`القضاء الإداري بالعباسية` may be one court with a location suffix. **Every
table that references a court therefore keeps `legacy_court_raw`**, so that
cleanup stays reversible.

**The circuit is text. Do not make it a list.**

1,281 distinct values in the hearings table alone. More telling than the
count is what they are: `1 عمال`, `12 عمال`, `8 تجاري`, `7 استئناف`,
`4 أفراد` — a circuit *number* plus a *specialism*, two facts in one field,
varying by court. A 1,281-option dropdown is unusable, and a list would fight
the data.

**Splitting it into number + specialism is a question for after the data
lands**, not before. That would give perhaps 15 specialisms and a free number,
which is a real improvement — but it is a decision to take with the values in
front of us. Recorded on task 2.6. **Do not attempt the split now.**

**Court and circuit are stored apart and joined for display.** Reports render
them together — `الإدارية العليا (11 موضوع)`,
`المحكمة الاقتصادية (الدائرة: (9) استئناف)` — but they are two columns.
Source: `docs/REPORT-LAYOUTS.md`, "Type 4 — Client status report".

## D21 — Court detail columns stay on the matter

Floor, hall, shelf and secretary room stay as four columns on `matters`. They
are not moved to a `matter_court_details` table.

Four columns on one row per matter. A separate table buys nothing until
something needs many of them per matter, and it would add a join to every
matter screen and every matter report.

`docs/DATA-MODEL.md` carried this as "optional, discuss before doing it".
It is now decided and the note is removed, so it stops reappearing.

## D22 — Every lookup value gets human review. Courts are the proof

The 401 distinct court names in the Access data were reviewed **one at a
time** by the firm: 307 kept, 52 merged, 35 split, 7 not courts at all. That
review cannot be replaced by any amount of cleverness, and the court list is
the clearest evidence in the project of why.

**Ten spellings collapse into one court.**

```
الهيئة العامة للاستثمار          هيئة الاستثمار
الهيئة العامة للأستثمار في صلاح سالم    هيئة الأستثمار بمدينة نصر
الهيئة العامة للاستثمار بالمنطقة الحرة   هيئة الاستثمار - المنطقة الحرة
…
```

They differ by the definite article, by hamza, **and by branch location**. No
normaliser reaches that: `في صلاح سالم` and `بمدينة نصر` are different strings
saying the same thing, and only somebody who knows the institution can say so.

**And in the other direction, three names that a fuzzy match would have merged
on sight are deliberately kept apart:**

```
القضاء الإداري  ·  القضاء الإداري بالعباسية  ·  القضاء الإداري بالإسكندرية
```

Same court name, different buildings in different cities. An algorithm
confident enough to fold the ten would certainly have folded these three.

**That pair is the argument.** A tool cannot tell the two cases apart, because
the difference is not in the text — it is in the world. Both directions are
asserted in the migration, in both directions: the ten must be one, and the
three must be three. Asserting only the fold would not notice the over-merge.

Every lookup list in this system is reviewed value by value for the same
reason, and `sql/` holds those reviews as the source of truth.

## D23 — Billing source interpretations are explicit and reversible

The firm reviewed the live Task 2.10A staging evidence on 25 August 2026 and
settled five billing rules. They override the earlier assumption that
`تقسيم التحصيلات.Percent` needed division by 100.

1. **Allocation values are already fractions.** All 15 complete invoice
   groups sum exactly to `1.000` as stored. Copy values such as `0.250`
   directly to `invoice_allocations.share`; never divide them by 100. Keep the
   exact source text in `legacy_percent_raw`. Invoice `21819` is a permanent
   named proof: `0.060 + 0.110 + 0.100 + 0.100 + 0.240 + 0.315 + 0.075 =
   1.000`. Never assume every co-lead receives `0.375`.
2. **`Ahmed Abdullah` is one exact legacy-only crosswalk.** The exact source
   text maps to person 25, whose canonical English name remains
   `Dr. Ahmed Abdullah` and Arabic name remains `أحمد عبد الله`. The crosswalk
   applies only to the migration's English allocation field. It is not fuzzy,
   transliterated, inferred from Arabic aliases or inherited automatically by
   application-native records. It covers 11 rows across nine invoice groups.
3. **A missing invoice type stays missing.** Invoices `21269` and `21772`
   carry SQL NULL in `Inv-Type`; both migrate with NULL type. Do not invent a
   type, turn NULL into an empty string or quarantine an otherwise valid row.
4. **Receipt-currency `0` is evidence, not a currency.** On invoices `21225`
   and `21226`, raw `R-$` text `0` is preserved byte for byte and the usable
   receipt currency is NULL because `R-#` is zero. This reviewed interpretation
   is allowed only when no non-zero receipt needs a currency. A `0` paired with
   a non-zero receipt must quarantine or fail safely.
5. **Only exact leading-space ` USD` normalises to `USD`.** Preserve the raw
   invoice/payment currency, and use `USD` for reporting for the confirmed
   invoice `21352` and its two payments. This is an explicit source-value
   crosswalk, not trimming, case-folding or general cleanup. Any other malformed
   currency needs separate review or quarantine.

These rules are migration rules, not permission to rewrite source evidence.
Staging remains unchanged. `الفواتير.Pay-Date` remains absolutely excluded by
D4: it is neither migrated nor used to infer any billing fact.

## D24 — Login is username-only, with short absolute sessions

The Phase 1 application uses Auth.js v5 Credentials with one account linked to
one person. Login accepts the approved username and password only: email is
stored as contact information and is never accepted as a login identifier.
There is no registration, OAuth, magic link, email reset or user-management
screen in Task 3.1.

The four role codes are fixed checked text — Administrator, Litigation
Assistant, Lawyer and Paralegal — rather than a PostgreSQL enum, consistently
with D8. Task 3.1 stores the role in the account and session. Task 3.2 remains
responsible for enforcing the complete permission matrix on the server.

Passwords use Argon2id v19 with 19,456 KiB memory, two iterations,
parallelism one and a 32-byte result. A fifth consecutive failed attempt locks
the account for 15 minutes. Initial and administratively reset passwords must
be changed on first login; changing a password invalidates every older session.

A normal session expires absolutely eight hours after authentication. The
optional, unchecked “Remember me” choice expires absolutely after seven days.
These are server-enforced non-sliding limits carried inside the encrypted JWT;
the account's database session version independently invalidates older tokens
after password or enablement changes.

## D25 — Phase 1 uses recoverable archive and restore, never physical deletion

The Administrator may archive and restore operational records: clients,
contacts, matters, hearings, administrative works, powers of attorney,
documents, fee letters and client logos. Archive means recoverable removal
from ordinary use. It is not physical deletion from PostgreSQL. Permanent
deletion of Phase 1 business records through the application is prohibited,
and every other role is denied archive and restore everywhere.

Billing remains view-only for all roles. Staff and user removal means
disable/deactivate while retaining the row; dropdown removal likewise means
deactivate while retaining the value, even when unused. Client-logo removal
must be recoverable and retain both the file and its evidence. The interface
must call these operations archive and restore rather than misleadingly
describing archival as permanent deletion.

This decision establishes authorization and lifecycle policy, not its storage
or interface design. Task 3.2 adds the archive and restore permission decisions
only. It does not add archive columns, migrations, handlers, controls or
strings. The visibility of archived records and the filters and reporting
behavior around them must be designed with each relevant Stage 4 screen using
the real workflow; those rules are deliberately not invented here.

## D26 — Quarantine decisions have two mandatory review checkpoints

**Approved by Khaled Helmy on 1 September 2026.** Evidence:
[`2026-09-01-project-continuity-recovery-audit.md`](reviews/2026-09-01-project-continuity-recovery-audit.md),
gaps 9.2 and the owner-resolution addendum.

After Task 3.4 and before Stage 4, the firm reviews the high-impact quarantine:
all **55 matters**, prioritising the **14 `separate_client` / wrong-client
cases**, and all **327 hearings**, including the **313** quarantined because
their parent matter is quarantined. Only explicit firm decisions may be
applied. Missing business facts must never be inferred.

A second explicit checkpoint is required before the final migration rehearsal
and cutover. It covers lower-impact administrative-task, task-action, fee-link,
relationship-cell and ambiguous-attendee evidence. Neither checkpoint implies
that a quarantined value has been resolved; `TASKS.md` records when each review
is due.

## D27 — The unknown report needs an original sample before Task 6.8

**Approved by Khaled Helmy on 1 September 2026.** Evidence:
[`2026-09-01-project-continuity-recovery-audit.md`](reviews/2026-09-01-project-continuity-recovery-audit.md),
gap 9.10 and the owner-resolution addendum.

An original representative PDF export or clear scan of
`صالح-ضد مفصل حسب المحامي` is required before Task 6.8. Its known query and
columns do not establish grouping, pagination, emphasis or manual-completion
areas. Do not design a replacement layout without further owner approval.

## D28 — All 11 billing codes need firm-approved Arabic display labels

**Approved by Khaled Helmy on 1 September 2026.** Evidence:
[`2026-09-01-project-continuity-recovery-audit.md`](reviews/2026-09-01-project-continuity-recovery-audit.md),
gap 9.9 and the owner-resolution addendum.

Before Task 4.8, the firm must approve Arabic display labels for all 11 exact
source codes: five invoice statuses, two invoice types and four lawyer-share
roles. Temporary English labels are not permitted. The source code and its
established meaning must be presented together for review; Arabic legal or
financial terminology must never be invented.

## D29 — Power-of-attorney field meanings are settled

**Approved by Khaled Helmy on 1 September 2026.** Evidence:
[`2026-09-01-project-continuity-recovery-audit.md`](reviews/2026-09-01-project-continuity-recovery-audit.md),
gap 9.8 and the owner-resolution addendum.

- `الصفة` is the principal's legal capacity or status.
- `صفة الموكل بالتوكيل` is an abandoned duplicate of `الصفة`.
- `حرف` is the letter or series component of the power-of-attorney identifier.

The exact Arabic source fields and their values remain preserved. This decision
settles their documented meaning; it does not authorise rewriting historical
source evidence.

## D30 — Task 3.3 is two ordered audit-foundation checkpoints

**Approved by Khaled Helmy on 1 September 2026.** Evidence:
[`2026-09-01-task-3.3-implementation-readiness-and-scope-reconciliation-audit.md`](reviews/2026-09-01-task-3.3-implementation-readiness-and-scope-reconciliation-audit.md),
including the original readiness assessment and the owner-resolution addendum.

**Context:** the former task text, “Audit columns populated everywhere,” could
be satisfied without the chronological event history the owner had already
approved, and “everywhere” incorrectly implied that staging and immutable
migration evidence should use the application audit shape.

**Decision:** Task 3.3 is split, in order:

1. **Task 3.3A — Secure actor attribution.** Cover the 37 current
   four-column application tables plus `person_name_alias`; add its missing
   columns; create a stable actor registry and `system_migration`; backfill only
   truthful attribution; permit documented historical unknowns; add actor
   foreign keys, trusted transaction-local context, spoofing protection and
   permanent checks.
2. **Task 3.3B — Append-only event foundation.** Record create, update,
   archive, restore, field before/after values, relationships, user/role
   lifecycle, password-change facts, login success/failure/lockout, report
   execution, exports and downloads. Do not record ordinary views, searches,
   list loading or navigation, and never record secrets.

Staging, quarantine, immutable migration evidence, infrastructure tables, the
actor registry and the event table keep purpose-specific provenance models; the
four-column pattern is not retrofitted onto them. Unprovable historical events
or human attribution must not be fabricated. Task 3.4 begins only after 3.3A
and 3.3B are accepted. Audit UI is later work.

**Rationale and rejected alternatives:** columns-only would leave the firm
unable to reconstruct what changed; one combined columns/events/full-UI task
would be too broad and would jump ahead of screens that do not exist. Applying
the four columns to every physical table would weaken rather than improve
migration evidence. Revisit only through a new explicit owner decision.

**Implementation evidence, 1 September 2026:** Task 3.3A is implemented by
migration `20260901120000_secure_audit_actor_attribution` and the code/tests
recorded in
[`2026-09-01-task-3-3a-secure-actor-attribution.md`](task-reports/2026-09-01-task-3-3a-secure-actor-attribution.md).
It establishes the exact 38-table actor boundary and seven immutable actors,
including the minimum distinct migration, authentication and controlled
administration system purposes. Task 3.3B events remain approved but not
started; no event table, UI or export was added.

## D31 — Administrators view audit history; export is an account capability

**Approved by Khaled Helmy on 1 September 2026.** Evidence: the Task 3.3
readiness audit linked in D30.

All Administrators may view audit history. Export requires an explicit
account-level audit-export capability, initially granted only to `KHelmy`.
The schema field name is an implementation detail; authorization must not be
hard-coded to the username string.

**Rationale:** “Owner” is not one of the four application roles. Giving every
Administrator export rights would silently weaken the owner-only rule when a
second Administrator is added; adding a fifth Owner role would contradict the
fixed four-role model. The account capability keeps those concerns separate.

The existing four roles and 448 Task 3.2 authorization decisions remain
unchanged until the capability is implemented and its exact effect is
documented and tested. Revisit only by explicit owner decision.

## D32 — Audit events are retained indefinitely

**Approved by Khaled Helmy on 1 September 2026.** Evidence: the Task 3.3
readiness audit linked in D30.

Audit events are retained indefinitely. There is no automatic deletion,
rolling expiration or purge. No application role may update, delete or truncate
events. Disabling an account and archiving or restoring a record must retain its
complete history.

**Rationale and rejected alternative:** an earlier finite-retention period was
only a recommendation and is not approved. Indefinite retention prevents routine
retention deletion from defeating a legal hold and avoids destructive policy
machinery without a later owner decision. Any future retention change requires
a new explicit owner decision and must itself leave durable audit evidence.

## D33 — The web application and migrations use different database principals

**Approved by Khaled Helmy on 1 September 2026.** Evidence: the Task 3.3
readiness audit linked in D30.

The running web application must use a restricted, non-superuser PostgreSQL
runtime principal. The privileged migration/administration principal must not
be used by the web runtime. Exact role names and secret-provisioning mechanisms
remain implementation details for Task 3.3A; credentials and connection strings
must never enter Git.

**Rationale and rejected alternative:** the current application connection is a
superuser and table owner, which can bypass grants, triggers and append-only
protections. Keeping that one principal would make append-only behavior a
convention rather than an enforceable security boundary. Task 3.3A must prove
the final privileges, ownership, fixed-search-path security-definer functions,
fixtures and deployment procedure before this control is described as
operational.

**Implementation evidence, 1 September 2026:** Prisma migrations and
controlled tools use the owning `litigation` principal through
`MIGRATION_DATABASE_URL`; the web runtime requires restricted
`litigation_runtime` through `DATABASE_URL`. Exact catalog and adversarial
fixtures prove role attributes, ownership, grants, fixed-search-path helper
functions and refused runtime bypass attempts. The residual PostgreSQL custom
setting available to a fully compromised application process is documented as
a trust boundary rather than overstated as cryptographic attribution. See the
Task 3.3A report linked in D30.

## D34 — The hybrid audit-history interface direction is approved and deferred

**Approved by Khaled Helmy on 31 August 2026; recovered evidence confirmed and
classified by the owner on 1 September 2026.** Evidence: the Task 3.3 readiness
audit linked in D30, under its owner-resolution and UI-correction sections.

The later audit interface uses both a contextual Arabic/RTL entity-history
drawer and a global Administrator audit page. Changes are grouped by save
event, with before/after field differences, date grouping, date/user/action
filters, field-or-value search, pagination or load-more behavior, Arabic action
labels, icons accompanied by text, a full-screen mobile sheet, keyboard/focus
accessibility, Sarie Eldin branding and typography, and archive/restore
terminology.

**Boundary:** this direction is approved but remains deferred until a later
explicit implementation prompt. It is not part of Task 3.3A or 3.3B. Particular
dimensions and component choices in the recovered Figma artifact describe that
artifact; they are not automatically universal product requirements. Revisit
screen-specific details with real data when the later UI task begins.

## D35 — Migrations require an isolated superuser administration principal

**Approved by Khaled Helmy on 2 September 2026.** Evidence: the final Task
3.3A acceptance-correction mandate and the Task 3.3A report linked in D30.

Preserve applied migrations 53–55 byte-for-byte. Every canonical Prisma
migration command must authenticate through `MIGRATION_DATABASE_URL` as a
separate, directly connected PostgreSQL superuser migration/administration
principal before Prisma starts and before the runtime role is made unavailable.
`session_user` proves the real connection identity; `current_user` must be the
same superuser rather than a role assumed after connecting.

The running web application continues to use only the restricted,
non-superuser `litigation_runtime` principal through `DATABASE_URL`. The
superuser credential is for migrations and controlled database administration
only. It must remain outside Git and logs, be access-restricted and securely
stored, be rotated after suspected exposure, and never be present in the
production web process environment.

**Context and operational risk:** PostgreSQL 17 permits an inbound role grant
with `ADMIN TRUE, INHERIT FALSE, SET FALSE`. That member cannot immediately
assume the runtime role, but its `ADMIN` option can delegate a new `SET TRUE`
membership to another role, which can then execute `SET ROLE
litigation_runtime`. The prior effective-membership check therefore missed a
real delegation path. A non-superuser `CREATEROLE` migration principal also
cannot reliably terminate an already connected runtime session, so the
fail-closed deployment sequence could not be completed under the narrower
credential.

**Rationale:** migration 53 has a valid isolated historical ownership
precondition, but the complete forward chain through migrations 54 and 55 uses
cluster-level role and session controls. The approved superuser contract makes
those existing immutable migrations deployable and lets forward migration 56
enforce zero explicit inbound runtime membership regardless of member,
grantor, `ADMIN`, `INHERIT` or `SET` options. The early authenticated-principal
preflight prevents a partial deployment under an incapable credential.

**Rejected for now:** a separate least-privilege fresh-install baseline;
rewriting any applied migration; changing a recorded migration checksum; a
compensating `pg_signal_backend`, membership, `SET` or similar grant to a
non-superuser; and accepting either confirmed enforcement gap. D35 completes
the operational detail required by D33 and preserves D30's attribution scope;
it does not authorize Task 3.3B or alter the four application roles.

## D36 — Task 3.4 creates accounts only for existing active staff

**Approved by Khaled Helmy on 3 September 2026 through the Task 3.4 owner
mandate.**

An account candidate must already exist in `people`, have `is_staff=true` and
`is_active=true`, and have no existing `user_accounts` row. `can_login=true` is
not an eligibility precondition because login eligibility is derived from
account existence and enablement. External people, former or inactive staff,
ambiguous identities and people with an account are ineligible.

The application selects and re-reads the person by database ID. It never
matches or accepts a supplied Arabic name. Task 3.4 does not create or edit
people, aliases, teams, employment status or staff information. New hires and
staff identity maintenance belong to the separate future **Task 4.0a — Staff
roster management**, which must have its own reviewed contract before go-live.

**Rationale:** an account is an authentication identity linked to an already
reviewed staff identity, not a second staff roster. Keeping these concerns
separate prevents a mistyped or ambiguous Arabic name from creating a duplicate
person and preserves the one-account-per-person model.

**Boundary and rejected alternatives:** Task 3.4 may create the account and its
immutable audit actor only. It does not create a new person as a convenience,
reactivate former staff, accept external people, infer identity from names, or
fold staff maintenance into the user-management screen.

## D37 — Last-Administrator and self-lockout protection

**Approved by Khaled Helmy on 3 September 2026 through the Task 3.4 owner
mandate.**

An Administrator cannot disable or demote their own account through the
application; another Administrator must perform that operation. No account or
person mutation may leave the system without a usable Administrator. At the
relevant mutation boundary, usable means an Administrator-role account that is
enabled, has an initialized password, and is linked to an active,
login-eligible person.

The safeguard is enforced in both the server service and database, serializes
competing changes so two Administrators cannot disable or demote one another
concurrently, and also guards a later attempt to deactivate the linked person
through future staff management. UI control hiding is supplementary, not the
security boundary.

**Rationale:** losing the last usable Administrator would make ordinary account
recovery impossible. A database guard is necessary because a future service or
concurrent transaction could bypass an interface-only count.

**Boundary and rejected alternatives:** migration 59 does not require an
initialized Administrator unconditionally because canonical clean replay must
first create passwordless accounts. Availability is enforced when a mutation
could reduce it, while operational readiness is checked separately. Rejected
alternatives are self-demotion/self-disablement with a warning, an interface-
only check, a non-serialized count, and coverage limited to account rows while
ignoring later person deactivation.

## D38 — Account lifecycle policy

**Approved by Khaled Helmy on 3 September 2026 through the Task 3.4 owner
mandate.**

Administrators may correct usernames. Username and role changes increment
`session_version` and invalidate every existing target session. Disabling
clears failed-login and lockout state, increments `session_version`, immediately
invalidates sessions and retains the account, person, actor and history.
Reactivation requires a new temporary password, clears lockout, increments
`session_version`, sets `must_change_password=true` and retains the same account
and immutable actor. Administrative password reset has the same password and
session behavior and records the actual human Administrator.

There is no manual-unlock action: a locked user waits for the 15-minute expiry
or an Administrator performs a password reset. Administrators use the ordinary
self-password-change workflow for themselves and cannot administratively reset
themselves. Temporary passwords are entered twice in hidden fields. They are
never generated into logs, displayed after submission, returned by the server,
preserved in form state, placed in a URL, or recorded—nor is their hash—in
audit evidence. Username correction has the explicit semantic action
`username_changed`; username format and normalization remain the existing D24
and database contract.

**Rationale:** each lifecycle action has one unambiguous security and audit
meaning, invalidates stale sessions where identity or access changed, and
retains the evidence needed to explain past activity.

**Boundary and rejected alternatives:** exactly four roles, Argon2id, the
12-character minimum, five-attempt/15-minute lockout and existing absolute
session durations remain unchanged. Rejected alternatives are physical
deletion, manual unlock, self-administrative reset, password generation or
redisplay, email reset, OAuth, registration, magic links, a fifth role, custom
roles and username-hard-coded authorization. A generalized break-glass command
for accounts created after the original four is a separate pre-go-live owner
decision, not a Task 3.4 capability.

## D39 — Reviewed Sigma and Alpha branches retain their existing parent clients

**Approved explicitly by Khaled Helmy on 4 September 2026 through the bounded
Task 3.5A client-review contract correction mandate.**

For these migration records, main Sigma is the existing client with Access
`ID_client=188`, `clients.legacy_id=188` and new-system `clients.id=197`.
Its current full name is `شركة سيجما للصناعات الدوائية` and short name is
`سيجما`. All Sigma entities appearing in these 14 records are branches or
subsidiaries of that parent, including `سيجما للصناعات الدوائية`,
`سيجما للإعلام (تليفزيون الحياة)` and `سيجما تك للصناعات الدوائية`.

`ألفا مصر للتجارة` is a branch or subsidiary of existing `الفطيم`: Access
`ID_client=2`, `clients.legacy_id=2`, new-system `clients.id=11`.

All 14 historically `separate_client` matters already identify the correct
parent: the 13 Sigma matters retain client 197 and the Alpha matter retains
client 11. No new client or client reassignment is required. Do not rename main
Sigma; an official-name change requires a separate owner decision. Sigma Tech
occurs in party text, which must retain its ordinary relationship transformation;
do not invent a `clientBranch` lookup solely from that party text.

**Rationale and relationship to D19:** the earlier blanket interpretation
treated a branch label as proof of an unrelated client. The owner has now
confirmed the parent identities and branch/subsidiary relationships explicitly.
D39 supersedes only that interpretation for the three exact previously
misclassified branch values named in D19. All other D19 rules remain in force.
D19's historical text, migration 0007, existing crosswalk rows, complete source
payloads and historical quarantine evidence must not be rewritten or deleted.

**Task 3.5A scope:** record the decisions in a separately versioned workbook,
using `الارتباط الحالي صحيح`, the same protected current-client target,
reviewer `خالد حلمي` and date 2026-09-04. Only hearings whose sole reason is
`parent_matter_quarantined` and whose parent is one of these 14 matters may
receive `يتبع القرار المعتمد للدعوى`, with the exact parent review ID. The
independently verified eligible population is 161 hearings. This records owner
answers only: it does not apply a branch, release a record or close Task 3.5.

**Deferred enforcement — Task 3.5B, not implemented here:** add/map exactly
`سيجما للصناعات الدوائية`, `سيجما للإعلام (تليفزيون الحياة)` and
`ألفا مصر للتجارة` as reviewed branches with the approved parent associations.
Determine the smallest correct database/application mechanism that prevents
pairing them with an unrelated client during application. Preserve historical
D19 and quarantine evidence, append truthful audit events, and reconcile every
released matter, hearing, person relationship, administrative task, task step
and fee reference. Lower-impact evidence is not implicitly released. Task
3.5B and Stage 4 remain unstarted and require separate authorization.

## D40 — Remaining high-impact owner decisions and explicit pending court creation

**Approved explicitly by خالد حلمي on 4 September 2026 in the bounded
Task 3.5A owner-answer integration mandate.** The filled workbook is immutable
owner evidence: 195,913 bytes, SHA-256
`fcd78d0498b4250ecacf25430a8c7215e09e582c059d7a62b9f1dc0c58e29d58`.
This decision records only the supplied resolutions; it does not authorize
Task 3.5B application or Stage 4.

### Intentional absence of a branch

`لا يوجد فرع معتمد` means an intentional NULL branch for exactly:

| Review ID | Access matter ID |
|---|---|
| M-000057 | 87 |
| M-000058 | 208 |
| M-000059 | 253 |
| M-000060 | 356 |
| M-000071 | 636 |
| M-000072 | 637 |
| M-000074 | 773 |
| M-000077 | 1114 |
| M-000078 | 1121 |
| M-000079 | 1123 |

The raw `دعاوى قضائية` denotes a work type, not a branch. Preserve that raw
value and the owner's note `لا يوجد فرع`. The replacement target must be
blank, with reviewer and date. No synthetic branch is approved. This status
is invalid on another target kind or outside these exact approved identities.

### A distinct new court, not the generic court

H-000080 (Access hearing 15778) and H-000232 (15766) approve exactly
`أسرة مصر الجديدة`. Existing court 123 — `مصر الجديدة` is not the approved
target. Task 3.5B must create the distinct exact court and resolve its actual
generated ID before applying these two decisions; no ID is reserved or invented.
The workbook status `محكمة جديدة معتمدة — بانتظار الإنشاء`, exact label,
reviewer/date and preserved owner note form the approval. Its protected lookup
entry is classified as `approved_new_court`, `database_backed=false`, with
review-only code `D40-court-1`, never a database identifier. Missing/changed
approval evidence, wrong target kinds and fake/reused IDs cannot complete it.

### Exact target corrections and confirmation

- H-000123 (Access 2396): `جنح العجوزة` followed by a line break and
  `دائرة الاثنين`.
- H-000139 (2339) and H-000214 (2340): `جنح العجوزة` followed by a line
  break and `دائرة السبت`.
- M-000111 (Access matter 1777) belongs to `ماسترز`: Access client 133 /
  new-system client 142, despite the blank source client. Preserve its existing
  approved target, reviewer and date.
- M-000064 (467), M-000065 (468) and M-000067 (515) target the hearing note
  `وكيل نيابة/ أسامة الطنطاوي`. The frozen court crosswalk separately extracts
  `نيابة الشئون المالية والتجارية` as the court; it is not the hearing note.

### Dependent hearings and deferred application

After proving the exact parent and a complete valid decision, the 152 blank
sole-parent-reason hearings receive `يتبع القرار المعتمد للدعوى`, reviewer
`خالد حلمي`, date 2026-09-04 and the exact parent review ID. They comprise
116 hearings under the 31 ordinary matter decisions (two have zero hearings)
and 36 under the ten no-branch matters. No independently problematic hearing
inherits an answer. Preserve the existing 161 dependent decisions and all
175 D39 baseline answers without changes.

The successor accounts for 382 owner decisions, including all 313 dependents,
with no incomplete or invalid decisions. Owner completion is not database
application readiness: the two new-court approvals and D39's three branch
prerequisites remain. All 382 records still await separately authorized,
implemented and reconciled Task 3.5B work. Historical source values, crosswalks,
quarantine evidence and all earlier decisions remain intact. No PostgreSQL
write, migration, Task 3.5B or Stage 4 work is part of this approval.

## D41 — Exact hearing destinations for D40's prosecution note

**Approved explicitly by Khaled on 4 September 2026 in the Task 3.5B
unblocking instruction.** This is owner-supplied legal-record evidence, not
an inferred association. It supplements D40 by resolving the previously
unspecified hearing destinations.

Every hearing in this exact set receives the exact note
`وكيل نيابة/ أسامة الطنطاوي`:

| Matter review ID | Access matter ID | Access hearing IDs |
|---|---|---|
| M-000064 | 467 | 7072, 7071, 7237, 7383, 7451 |
| M-000065 | 468 | 7073, 7070, 7219, 7351 |
| M-000067 | 515 | 7129, 7159, 7382 |

The instruction applies individually to all twelve hearings, not to only
one hearing per matter and not merely to a matter-level note. It authorizes
no hearing outside this set. The court remains exactly
`نيابة الشئون المالية والتجارية`. Existing source text, including circuit
text, is preserved; this clarification does not authorize another correction.

Application must fail closed if a listed hearing is missing, duplicated,
belongs to a different matter, or if an additional hearing would receive
the note. The contract and permanent tests must bind the exact set, note,
court and approved D40 workbook identity together.

The D40 workbook is not modified, resaved or replaced: filename
`task-3-5-high-impact-quarantine-review-2026-09-04-d40.xlsx`, 172,273 bytes,
SHA-256 `0dc23134639e0bc6477fe1f39613bd7575b56cdcd0085d2f2831a96693f2376b`.
This instruction authorizes implementation and disposable-database proof
only. Real application still awaits independent review and owner approval;
Task 3.5B is not fully complete and Stage 4 must not start.

## D42 — Task 3.5 high-impact quarantine application is accepted

**Applied on 5 September 2026 after Khaled Helmy's explicit authorization and
accepted through the 6 September 2026 documentation checkpoint.** The
independent evidence review is accepted. Migration 60
(`20260904180000_prepare_high_impact_application`) and the exact approved
Task 3.5B real-application command each executed once against the local project
PostgreSQL database. The approved plan digest is
`4a1fee01d011b960f48204102e28ed71731a5f1d682006141749460828e33da3`.

All 55 reviewed matters and 327 reviewed hearings are current target rows. The
382 source-to-target resolutions, the application batch, initial values and
hashes, and 808 application events are retained in append-only evidence. The
original 55 matter and 327 hearing quarantine/source rows remain preserved as
historical evidence; release does not rewrite or delete them. Lower-impact
administrative, task-action, fee-link, relationship and ambiguous-attendee
evidence is not implicitly released.

Permanent verification passes 93/93. All 313 dependent hearings match their
reviewed parents; the exact twelve D41 destinations have no missing, unexpected,
wrong-note or wrong-court result; the 13 Sigma and one Alpha parent decisions
have zero mismatch; one distinct `أسرة مصر الجديدة` court serves exactly two
approved hearings; and exactly ten reviewed matters retain an intentional NULL
branch. The current application ledger correctly contains zero
`high_impact_row_proof` rows because no released row has subsequently been
modified; immutable initial snapshots and hashes remain stored. This decision
completes Task 3.5 and Stage 3. It does not start Stage 4.

## D43 — Final Access cutover uses source-identity differential reconciliation

**Approved explicitly by Khaled Helmy on 6 September 2026.** The Task 3.5B
application was not the final Access cutover. The Litigation Department
continues using Access, and the exact final snapshot and cutover window remain
future controlled work.

At final cutover, reconciliation is based on durable source identity rather
than blindly repeating the historical import:

- previously migrated records whose source values are unchanged must not be
  duplicated;
- only genuinely new or changed Access records are candidates for import;
- changed, deleted, ambiguous or conflicting records must be reconciled or
  quarantined with their original evidence intact, never blindly overwritten;
- the final source snapshot, freeze, differential plan and cutover execution
  require their own controlled verification and authorization.

This preserves ordinary Access work performed after the 23 August extraction
without duplicating the records already present in PostgreSQL. It does not
request the final Access database now and does not alter the existing Stage 7
cutover gates.

## D44 — Task 4.0a manages firm staff only

**Approved explicitly by Khaled Helmy on 6 September 2026 through the Task
4.0a readiness-audit resolution.** The approved evidence and all seven owner
questions are preserved in
[`2026-09-06-task-4-0a-staff-roster-readiness-audit.md`](reviews/2026-09-06-task-4-0a-staff-roster-readiness-audit.md).

Task 4.0a manages the **66 firm-staff identities: 23 active and 43
former/inactive**. The 71 external people remain preserved in the single
people table and visible wherever their historical work is relevant, but they
are outside this editing interface. External-person maintenance requires a
separately reviewed future task.

All four roles may view the staff roster. Only an Administrator may create,
edit, rename, maintain aliases or teams, deactivate, or reactivate staff.
Staff management never creates or manages login accounts; it may show an
Administrator whether a linked account exists and direct them to `/users`.

**Rationale and practical example:** staff employment and external-counsel
identity are different workflows. A former external lawyer remains visible on
the power of attorney where that person acted, but does not appear as an
editable employee. Keeping account controls in `/users` preserves D36's rule
that an authentication account links to an already reviewed staff identity
rather than becoming a second roster.

**Accepted disadvantage and rejected alternative:** correcting an external
identity later needs a separate reviewed task. The owner accepts that narrower
scope and rejects one combined 137-person maintenance screen, which would mix
employment, external counsel, account eligibility and migration evidence.

**Development, testing and cost:** this choice is included in Task 4.0a's
overall **7–11 development-day** estimate. It requires staff-only query and
mutation guards plus negative external-person fixtures, but no separate data
cleanup. Infrastructure and licensing cost: **zero**. All D44–D50 estimates
overlap inside the 7–11 day total and must not be added together.

## D45 — Controlled canonical Arabic-name correction

**Approved explicitly by Khaled Helmy on 6 September 2026 through the Task
4.0a readiness-audit resolution.**

An Administrator may correct the canonical Arabic name of an imported or
application-native staff member only when the record remains the same human
identity. The imported application-boundary value remains immutable evidence;
the former canonical spelling becomes a retained alias; and the new canonical
spelling becomes the person's one current active primary alias. For every
imported alias, its spelling, person ownership, source provenance, continued
existence and history are immutable. Its current `is_primary` designation may
be demoted only within the same atomic controlled-rename transaction, while the
immutable boundary snapshot retains its original primary status.

A current primary alias of either provenance cannot be retired directly. The
controlled rename installs the new primary before completion, demotes the old
primary if necessary, and commits only when the person has exactly one active
primary alias matching the current canonical Arabic name.

A rename must serialize and check canonical names and aliases across both
tables. Any ambiguous identity or collision with another person fails closed
for human review. It must never auto-merge people, reassign an identity,
restore the prohibited Latin `J` to Arabic `ق` normalization, or invent a
numeric or other artificial suffix.

**Rationale and practical example:** correcting a hamza or completing a
staff member's official name should not require direct database work or make
old hearing text unsearchable. The displayed name can change while the former
spelling continues to resolve to the same stable person and the reviewed
Stage 2 value remains independently provable.

**Accepted disadvantage and rejected alternative:** permitting correction
requires the current name-based Stage 2 baseline to be separated from editable
live state. The owner accepts that work and rejects locking every imported
canonical name, which would turn ordinary corrections into recurring bespoke
migrations.

**Development, testing and cost:** approximately **1–2 overlapping days** for
boundary evidence, transactional rename behavior, collision/concurrency tests
and historical-search proof, already included in the overall 7–11 days.
Infrastructure and licensing cost: **zero**.

## D46 — Staff deactivation and linked-account lifecycle

**Approved explicitly by Khaled Helmy on 6 September 2026 through the Task
4.0a readiness-audit resolution.**

Staff deactivation retains the person and every historical relationship. If
the person has a linked account, the same atomic transaction must disable the
account, clear lockout state, increment `session_version`, invalidate existing
sessions, and record all required structural and semantic audit events.

Reactivating the person restores employment status only. It must not enable a
linked account. Account reactivation remains exclusively in `/users` and
requires a fresh temporary password under D38. An Administrator may not
deactivate their own linked person. Existing last-usable-Administrator
protection remains mandatory at both service and database boundaries and must
cover concurrent operations.

**Rationale and practical example:** merely setting a lawyer inactive blocks
the old JWT while that status remains false, but an unchanged enabled account
and session version would make that JWT valid again after person reactivation.
When a lawyer leaves, employment and account access therefore close together;
if the lawyer returns, employment and login access are deliberately restored
as two separate steps.

**Accepted disadvantage and rejected alternative:** account access later
requires a second Administrator action and a temporary password. The owner
accepts that deliberate friction and rejects leaving the account enabled while
the person is inactive because it permits stale-session revival.

**Development, testing and cost:** approximately **1–2 overlapping days** for
the shared lifecycle path, serializable concurrency, self/last-Administrator
negative fixtures and audit atomicity, already included in the overall 7–11
days. Infrastructure and licensing cost: **zero**.

## D47 — Alias immutability and retirement

**Approved explicitly by Khaled Helmy on 6 September 2026 through the Task
4.0a readiness-audit resolution.**

For every imported alias, its spelling, person ownership, source provenance,
continued existence and history are immutable. It may never be deleted,
rewritten, retired or reassigned. Its current `is_primary` designation may be
demoted only within the same atomic D45 controlled rename, while the immutable
boundary snapshot retains its original primary status. An Administrator may
retire or restore only a non-primary application-created alias and must supply
a reason. Retirement is reversible, fully audited, and removes the alias from
ordinary active search without removing its row, history, or evidence.
Restoration repeats every current identity-collision check.

No alias, imported or application-created, may ever be physically deleted or
moved to another person. A current primary alias of either provenance cannot
be retired directly. A controlled canonical rename under D45 first installs
the new canonical spelling as the new active primary, preserves the former
canonical spelling as an active alias rather than retiring it, and completes
only with exactly one active primary alias matching the current canonical name.
That permanent invariant covers every person, including all 71 external
people. External people remain outside Task 4.0a editing and must not be mutated
merely to enforce or test the invariant.

**Rationale and practical example:** a newly entered misspelling can stop
affecting search without being erased, while an imported alias explaining
thousands of historical attendee references cannot be silently moved or
withdrawn. Provenance distinguishes those two cases.

**Accepted disadvantage and rejected alternative:** this requires alias
provenance, lifecycle state and a reasoned retirement interface. The owner
accepts that complexity and rejects both physical deletion and a UI with no
safe way to correct a newly created typo.

**Development, testing and cost:** approximately **1–2 overlapping days** for
schema semantics, search filtering, retirement/restoration collision tests and
audit proof, already included in the overall 7–11 days. Infrastructure and
licensing cost: **zero**.

## D48 — Fixed teams and reviewer maintenance

**Approved explicitly by Khaled Helmy on 6 September 2026 through the Task
4.0a readiness-audit resolution.**

The two existing teams remain the only teams. Task 4.0a may change staff
membership and maintain each team's reviewer. Team creation, renaming,
archiving and deletion remain outside scope. Null staff-team membership is
valid.

A reviewer must be active, internal firm staff and not a trainee. A reviewer
need not belong to the reviewed team, and the same person may review both
teams, preserving the current approved arrangement. A reviewer cannot be
deactivated until every affected team has first received an eligible
replacement.

**Rationale and practical example:** the current reviewer is intentionally
unassigned to either team and reviews both, so a same-team constraint would
reject correct data. Conversely, allowing that person to become inactive
without reassignment would leave both teams with an invalid approval path.

**Accepted disadvantage and rejected alternatives:** deactivation may require
a prior reviewer reassignment. The owner accepts that safety step and rejects
read-only reviewer data, which could not be maintained when responsibility
changes, and full team CRUD, which would reopen D6 and expand reporting and
migration scope.

**Development, testing and cost:** approximately **1–2 overlapping days** for
eligibility/reassignment enforcement, concurrency tests and the bounded team
interface, already included in the overall 7–11 days. Infrastructure and
licensing cost: **zero**.

## D49 — Arabic-name collision policy

**Approved explicitly by Khaled Helmy on 6 September 2026 through the Task
4.0a readiness-audit resolution.**

When shorter staff names normalize identically, the firm supplies a
sufficiently complete official Arabic name that distinguishes the people. The
application never appends invented numbers or other artificial text and Task
4.0a does not introduce a new owner-managed or business-facing staff-number
system. This rejects a new staff-number field and invented suffixes in the
displayed name; it does not reject the existing internal identity. Stable
`people.id` remains mandatory for identity, URLs, authorization, mutations,
relationships, auditing, concurrency control and D43 reconciliation. A
submitted Arabic name is never a mutation identity.

If two genuine staff members have identical complete official Arabic names,
the second identity must not be created under this contract. The operation
fails closed and requires a new owner decision about a durable
disambiguation model.

Task 4.0a also preserves the existing uniqueness of every non-null person
email. Accepted email is trimmed of surrounding whitespace and normalized for
case; uniqueness of the normalized non-null value is enforced at the database
boundary and concurrent duplicates are rejected. The existing unique
constraint must never be weakened or removed. Supporting shared addresses
requires a future owner decision.

**Rationale and practical example:** two people commonly called `أحمد محمد`
must be entered using their fuller official names. That preserves the present
human-readable identity and alias model without pretending that an invented
suffix is part of either person's name.

**Accepted disadvantage and rejected alternative:** the firm may sometimes
need to provide additional official name components. The owner accepts that
operational step and rejects adding a staff-number field, selectors and
training during Task 4.0a.

**Development, testing and cost:** approximately **0.5–1 overlapping day**
for fail-closed validation and normalized-collision fixtures, already included
in the overall 7–11 days. There is no current data-cleanup requirement.
Infrastructure and licensing cost: **zero**.

## D50 — Local browser interaction testing

**Approved explicitly by Khaled Helmy on 6 September 2026 through the Task
4.0a readiness-audit resolution.**

Local browser testing is authorized for Task 4.0a. It must cover RTL
rendering, keyboard order, visible focus, validation focus, confirmation focus
restoration, Arabic accessible labels, zoom, contrast and 320-CSS-pixel
reflow. Browser evidence complements rather than replaces database,
authorization, audit and source checks.

Any browser test that performs a mutation must use an isolated disposable
database created for that test and must never mutate the real project
database. No project data may leave the local machine.

**Rationale and practical example:** static source checks can prove logical
CSS and centralized Arabic strings, but they cannot prove that focus returns
to the deactivate button after a cancelled confirmation or that the edit form
remains usable at 320 CSS pixels. The actual local screen must supply that
evidence.

**Accepted disadvantage and rejected alternative:** this adds a bounded local
interaction-test step and requires fixture isolation. The owner accepts that
time and rejects static/database-only acceptance because it would leave the
user-facing behavior unproved.

**Development, testing and cost:** approximately **0.5–1 overlapping day**,
already included in the overall 7–11 days. Infrastructure and licensing cost:
**zero**; the existing local browser-test stack is used.

### Task 4.0a Phase 1 implementation checkpoint — no new decision

On 6 September 2026 the owner-authorized database foundation implementing
D44–D49 was completed locally as migration 61. It was tested only in a separate
disposable PostgreSQL 17.11 cluster; the project database remains unchanged at
migration 60. The owner additionally approved independently mandatory
`historical-full-state-upgrade` and `canonical-clean-replay` verification
profiles: 93 original checks before / 107 after historical upgrade and 89 after
canonical replay, with a fail-closed inventory naming every historical-only
artifact. This classifies verification, not business policy or a relaxation of
frozen evidence. No decision ID is added. The
[Phase 1 report](task-reports/2026-09-06-task-4-0a-phase-1-database-boundary.md)
and [inventory](testing/task-4-0a-phase1-invariants.md) record proof and limits.
Service/UI evidence remains Phase 2/3, browser accessibility remains Phase 4,
and Access remains in use. Task 4.0a itself is not complete.

## D51 — Access-source derivative and migration-61 readiness

**Approved explicitly by Khaled Helmy on 7 September 2026 after review of the
Access-source identity discrepancy evidence.** The sanitized evidence summary
is preserved in
[`2026-09-07-access-source-identity-discrepancy.md`](reviews/2026-09-07-access-source-identity-discrepancy.md).

The 46,661,632-byte file with SHA-256
`1a1da8d573ca92ad67efbe638f2c043d02df278e88563c31eea8ce4a4f07b4bc`
remains the historical identity of the frozen Access source used for the
completed migration evidence. That identity is a historical fact: it must not
be replaced, rewritten or silently redirected to a later file.

The later 46,792,704-byte file with SHA-256
`d25fb958ffc42d09b962d36e69de723d4595d960725540a96f01767601ec4a86`
is a **noncanonical post-inspection derivative**. Its additional 131,072 bytes
and changed binary hash remain unexplained. Access-internal allocation or
bookkeeping is plausible but unproved, and the derivative must never be
described as byte-identical to the historical frozen source. A bounded search
did not recover the original binary.

The owner accepts **migration-relevant semantic equivalence**, limited to the
surfaces the discrepancy audit proved exactly: all 20 frozen CSV payloads; the
17 table and complex-field exports; all 54 logos; all 194 column definitions;
all 17 relationships; the recorded table, relationship, query-definition and
report-name inventory digests; and the three client identity spot checks. The
audit's original forensic classification remains `INDETERMINATE` because the
complete Access system catalogs, indexes, form and report designs, VBA and
macros, and import/export specifications were not fully verified.

Those unverified Access-application internals are not inputs to migration 61,
which operates on the reviewed PostgreSQL migration-60 state and the reviewed
repository migration. The derivative's raw byte hash is therefore not a
migration-61 readiness gate. The PostgreSQL state, protected evidence,
recovery, restore and isolated migration verification remain mandatory. This
decision does **not** authorize migration 61 deployment or establish deployment
readiness.

The final Access cutover remains governed by D43. Under a separately approved
cutover plan, the Litigation Department must stop writing to Access, Access
must be fully closed, and a new final snapshot must be copied and independently
hashed. That snapshot receives its own identity and evidence. Only
post-baseline or newer changes may then be reconciled and migrated; already
accepted historical imports must not be duplicated, and no delta may be
applied without validation and owner approval.

## D52 — Client and contact archive lifecycle

**Approved explicitly by Khaled Helmy on 8 September 2026 through the Task
4.1 documentation mandate.** The preceding readiness review and subsequent
owner resolutions are preserved separately in the
[dated review](reviews/2026-09-08-task-4-1-clients-readiness-review.md).
This records a future implementation contract, not implemented behavior.

Client archive is non-cascading. Archived clients leave ordinary lists and new
selections. All four roles that may view clients may find clearly labelled,
read-only archived details through an explicit archive filter. Only an
Administrator may archive or restore a client or contact. Show related-record
counts before confirmation. No physical deletion is permitted.

Archive preserves related matters, billing, contacts, logos and relationships.
Existing matters remain accessible and must not disappear from reports because
their client is archived. Client business status remains independent of archive
state; `Disabled` is not an archive instruction. A client's existing matters do
not have to be closed merely to archive the client.

Archiving a client preserves its main-contact selection and each contact's
individual archive state. Restoring the client does not restore contacts that
were separately archived. The parent client must first be restored before any
contact creation, editing, archiving or restoration. Archived client business
fields are read-only until restoration; the authorized restore operation is
still available to an Administrator.

**Rationale and tradeoff:** the client can leave ordinary selection without
hiding its legal history or changing its contacts. Restoration is a deliberate
extra step before contact maintenance. This rejects cascading archive/restore
and silent report exclusions. For example, archiving a client cannot make its
ongoing matters disappear from a lawyer's work or reports.

## D53 — Client classification meanings and Arabic labels

**Approved explicitly by Khaled Helmy on 8 September 2026.** `Cash` means a
fee-paying client regardless of payment method. It does not mean cash payment.

| Stored source value | Approved Arabic display |
|---|---|
| `Cash` | بأتعاب |
| `Probono` / `probono` | بدون أتعاب |
| `Active` | نشط |
| `Disabled` | غير نشط |
| `Potential` | محتمل |

`Probono` and `probono` have one operational display/entry choice. Preserve
original spellings in historical evidence. Unrelated edits and no-op saves
must not silently normalize existing stored values. Blank values stay blank
unless deliberately changed. No default may turn a missing classification into
an asserted business fact. The labels belong in `src/strings.ts` when the UI is
implemented; this documentation task does not edit that file.

The observed `Cash/probono` population is **316 populated values, two empty
strings and zero NULLs**. These facts do not establish how the empty strings
arose. The inaccurate migration-documentation paragraph is corrected on that
basis only. Staging, earlier evidence and frozen digests are not rewritten.

**Rationale and tradeoff:** one choice removes a meaningless spelling choice
from entry while exact historical evidence remains available. Field-aware
saving is necessary so editing an address does not also recode `probono`.
The five labels above do not resolve D28's separate 11 billing-code labels.

## D54 — Responsible-lawyer text remains historical information

**Approved explicitly by Khaled Helmy on 8 September 2026.** Display the
existing `legacy_contact_lawyer_raw` source text as historical information.
Editable responsible-staff assignment and source-to-staff mapping are deferred
outside Task 4.1. Do not infer a person from a name or add an assignment field.

The firm's responsible lawyer is distinct from the client's own main contact,
which refers to `contacts`, not `people`. The readiness inspection observed
123 populated source values across 11 exact strings; it did not resolve them
to staff identities.

**Rationale and tradeoff:** useful history stays visible without treating an
unreviewed name mapping as an assignment. Current responsible-staff maintenance
will require separate future work; no such mapping or data cleanup is approved
here.

## D55 — Optional main contact and fixed contact ownership

**Approved explicitly by Khaled Helmy on 8 September 2026.** Main contact is
optional. A selected contact must belong to the same client and must not be
archived. Require explicit clearing or replacement of the selection before
archiving that contact. Never choose a replacement automatically. Client
archive/restore itself retains the selection under D52.

Contact reassignment between clients is outside Task 4.1. There is no move
workflow, and ordinary contact edits cannot change client ownership. Preserve
the original imported ownership evidence. Enforce ownership and main-contact
eligibility in the database and server, including concurrent operations; hiding
an ownership control in the interface is insufficient.

New contacts require a name in `contact_name`. Preserve the six imported
contacts without that name, without fabrication or blocking unrelated edits.
`full_name` is a separate source field, not an inferred substitute. Keep the
existing rule that `home_phone` is preserved but not surfaced.

**Rationale and tradeoff:** a client's selected contact cannot silently become
another client's person or an archived contact. Explicitly clearing/replacing
the selection adds a deliberate step; future reassignment would need a
separate reviewed contract. Existing incomplete records remain usable.

## D56 — Task 4.1 identity and feature boundaries

**Approved explicitly by Khaled Helmy on 8 September 2026.** Task 4.1 covers
client/contact lists and details, authorized creation/editing and D52–D55
lifecycle behavior, plus display of existing client logos with the client's
name as the fallback for absent or unusable images. Upload, replacement,
resizing, upload preview and recoverable logo removal remain Task 4.1a.

Distinct clients remain distinct even when their names match. PostgreSQL IDs
identify relationships, routes, mutations, auditing and concurrency targets;
Access IDs remain historical identities. Never substitute a name or an assumed
numeric offset for the stored association. Application-native records receive
no invented Access ID. Do not transfer staff-specific name/email uniqueness
or Arabic-character requirements to clients and contacts; legitimate Latin
names such as `JTI` remain valid.

Branches stay on matters. The unused client branch columns are not an entry
field. D39's restriction on renaming main Sigma remains binding. Matters,
billing, reports and audit-history UI retain their existing task boundaries.
All four roles may view; Administrator has full client/contact access,
Litigation Assistant may add/edit, and Lawyer/Paralegal may only view.
Independent server guards are required for pages, reads and mutations.

## D57 — Task 4.1 evidence, phases and acceptance boundary

**Approved explicitly by Khaled Helmy on 8 September 2026 as a documentation-only
contract.** Task 4.1 and all four implementation phases remain unchecked and
unstarted. Stop after the documentation commit for independent review; approval
of this contract does not start implementation or authorize deployment.

Implement the smallest sound separation of immutable client/contact import
evidence from editable live state. Validate original system/Access identity
associations, staging durable keys/fingerprints, exact source values and initial
transformed values before capturing them. Preserve imported ownership, raw
evidence and frozen historical digests. Historical checks must prove the exact
imported population and initial values; separate live invariants must permit
authorized native creation and edits while enforcing provenance and lifecycle
rules. Do not weaken equality checks to lower bounds, exempt edited imports,
replace historical digests or copy the entire staff-boundary design.

Extend affected permanent checks and Gate 4 client/contact accounting without
counting native additions as imported rows. Preserve accepted workbook evidence.
The old client/contact delete-and-rebuild transform must fail closed after the
operational boundary and must never serve as D43's differential cutover path.
Reuse existing actor/event infrastructure for truthful atomic writes; new
columns require explicit audit classification. Reject stale edits while
retaining unsaved input. Replayed creation submissions must return the same
created identity without another record/event; intentional same-name creations
must remain possible. No-op saves preserve values, versions and audit state.

The ordered implementation phases, recorded unchecked in `TASKS.md`, are:

1. Database foundation and operational invariants.
2. Read-only client/contact screens and existing-logo display.
3. Authorized mutations and archive/restore.
4. Final acceptance.

Database-foundation proofs use **isolated PostgreSQL instances** with distinct,
mandatory historical-upgrade and canonical-replay acceptance profiles. A clean
replay cannot substitute for historical upgrade proof or silently skip its
evidence. All future mutation, race and rollback tests stay isolated. Final
acceptance includes static, permission, audit, reconciliation, real-volume and
separately authorized local browser/accessibility evidence. Deployment to the
current project database requires separate authorization. Access remains in
departmental use; D43/D51 final cutover remains separate.

**Cost context:** the readiness estimate is approximately 6–10 development and
testing days for the bounded implementation, with overlapping component
estimates and prompt business answers assumed. This is an estimate, not an
authorization to execute or incur new infrastructure/licensing costs.


## D58 — Matter archive and restore lifecycle

**Approved by Khaled Helmy on 12 September 2026**, in the direct Task 4.2
Phase 3 mandate adopting the MATTER LIFECYCLE CONTRACT. These are new Stage 4
visibility and reporting decisions, not retrospective wording of D25.

1. Administrator alone may archive/restore, enforced by pages, server actions,
   services and committing database gateways. All four roles retain read
   access; Administrator/Litigation Assistant may edit unarchived matters.
2. Archive is reversible removal from ordinary use, never deletion or case
   closure. Its boolean is independent of status and dates. Every existing
   matter begins unarchived, including closed and archived-client matters.
3. Ordinary lists default to unarchived, with explicit archived/all filters.
   Archived matters retain direct, clearly labelled read-only access to their
   complete details and relationships. Archive, search, other filters, paging
   and client-return context remain independent through navigation.
4. An archived matter's fields, parties, capacities and lawyer assignments
   cannot be edited until Administrator restoration. Direct/forged writes are
   rejected. Editing/retry must not silently restore; restoration preserves
   the aggregate and its former editing permissions.
5. Neither transition cascades: retain hearings, administrative works/steps,
   documents, powers of attorney, fee-letter/billing links, parties/capacities/
   lawyers, import/history/audit evidence and independent retired states.
   Do not close records, clear assignments, change amounts or mutate clients.
   Related records remain accessible under their existing permissions; this
   phase adds no mutation policy outside the matter aggregate.
6. Client and matter archive states are independent in both directions. An
   archived client does not prevent archive/restore or ordinary editing of an
   unarchived existing matter. Existing null/archived-client associations
   remain valid; reassignment is excluded. New creation still excludes
   archived clients.
7. Existing report inclusion, criteria, counts and financial totals remain
   unchanged by either archive state. Future report/export screens must
   preserve this unless the owner approves an explicit report option.
   Confirmation/help explains why reports differ from the operational list.
8. Existing ordinary matter selectors must exclude archived choices, retaining
   existing references and labelled read-only access. There is currently no
   implemented child-record matter picker; future hearing/task/document forms
   inherit this obligation, without adding those forms in this phase.
9. Both transitions require deliberate confirmation naming the matter and
   accurate related-record counts, explaining retention. Commit rechecks
   identity, state, version, counts and current authorization. No prerequisite
   of zero hearings, paid bills or closed status is introduced.

The authorized implementation adds only forward migration 65 after frozen
migrations 1–64; the real project stays at 63. Row-version locking, exact
submission receipts, trusted actor context and complete current-state history
provide atomic audited transitions. Old history is interpreted with an initial
unarchived flag, never rewritten. Phase 3 requires independent review and
owner acceptance; no deployment or later task authority is implied.

**Implementation consequence of the refusal contract:** PostgreSQL sequence
allocation does not roll back. Candidate65 therefore uses a private transactional
row counter for the common audit writer. Every committed ID and the
old sequence are preserved; a failed audit transaction rolls its allocation
back with the event. No existing audit actor/append/permission guard changes.
Audited writes serialize on this small counter; ordinary read-only pages do
not. This is included in the candidate's isolated shared-audit and race proof,
not authority to apply the candidate to the actual database.

## D59 — Existing development repository credential exception

**Approved explicitly by Khaled Helmy on 13 September 2026.** He accepts the
existing development PostgreSQL password/fallback remaining in this project
repository and instructs that credentials, passwords, usernames, configuration,
local settings and services must remain unchanged.

C1 is **Owner-accepted risk — unchanged; not technically remediated**. The known
value remains present. Its previously reported active match has not been
disproved or freshly retested. This is risk acceptance, not a claim that the
password was fixed, removed, rotated, made secure or technically closed. The
[independent review](reviews/2026-09-13-task-4-2-phase-3-independent-review.md)
remains byte-for-byte historical evidence. This later owner decision supersedes
its MUST FIX recommendation: C1 is not a required remediation task or an
acceptance, development or publication gate for this existing development
credential. Do not reopen the same rotation request without a new material fact
or later owner instruction; applicable platform controls still apply.

The earlier rotation/remediation handoff was not sent to Codex and is superseded;
any operational authority in that unused proposal is revoked, not evidence of
an executed or partially completed rotation. No recovery need is inferred.

This narrow operational/security exception covers only the existing development
credential in this repository. Other secrets remain protected. It authorizes
neither new credentials in Git nor disclosure of this value in documentation,
chat or review packages. It authorizes no configuration/service operation,
fetch, push, migration, deployment or Ubuntu production credential policy.
Existing governance and automated checkers are unchanged. D58 and all other
business rules are unchanged; broader credential protections, including D33/D35,
continue outside this explicit exception.

The same direct instruction accepts Task 4.2 Phase 3 and Task 4.2 overall at
`b2ac2187b762e7db82b190e6f5d522506e676292`. Acceptance is distinct from
publication, applying migrations 64/65, activating the new app, Ubuntu deployment
and later integration work. This documentation-only checkpoint stops after one
local commit and review package for independent documentation review.


## D60 — Bounded hearing editing and retained attendee membership

**Owner approved 13 September 2026**, directly in conversation through the Task
4.3 Phase 2 hearing-editing and separate local-activation prompt. Phase 1 at
`9b09f0d849aac5ed6afbcbc40879cfbb6da89ea1` is accepted. D59 remains unchanged.

Administrator and Litigation Assistant may create and update hearings; Lawyer
and Paralegal retain viewing only. Editable fields are hearing date, next hearing
date, action, decision, outcome, court, circuit, notes and current attendees.
Dates remain nullable date-only values without inferred ordering or defaults.
Unchanged text preserves its exact original bytes and line endings. Text fields
are bounded to 10,000 characters (source maxima: decision 961, outcome 4,
circuit 64, notes 170). This is a technical bound, not a new legal workflow.

Creation requires an existing unarchived matter or explicit unassigned NULL.
An archived client does not prevent selecting its unarchived matter. Existing
matter association, including NULL, is fixed. An archived matter must be restored
before editing its hearing. No parent is changed by a hearing save.

The exact twelve D41 hearings keep their court, circuit, note, source and matter
binding immutable at the UI, service and database boundaries. Other editable
fields on those hearings remain editable. The existing exact-set D41 verifier
continues unchanged. Report, previous decision, next attendance raw text,
destination, short decision and client notification stay unchanged on existing
records and NULL on native records. No inferred status, notification or previous
decision is introduced. Legacy/source fields are never synthesized or edited.

Attendee eligibility is current internal active staff, independently of login
eligibility. Existing inactive attendees and imported duplicates remain visible
and unchanged on an unrelated save. Removal retires an explicitly selected
membership; nothing is physically deleted. Eligible restoration reuses a stable
membership ID. Imported ordinals and all raw/cell/span provenance remain intact.
Current order is separate; retained members keep their order and additions or
restorations append deterministically. A remove/reselect round trip within one
form preserves the original ID and order. Cross-hearing identities, unknown IDs,
duplicate new memberships and unbounded arrays are rejected.

Writes pass through narrowly granted database gateways, with current account,
session, role, parent and lookup/staff checks at commit. Direct runtime business
writes remain denied. Aggregate version, retained history, submission receipt and
audit commit atomically. Stale edits are refused; unchanged saves advance no
business/audit/history/submission/sequence state. Exact owned retries return the
committed result; changed payloads and another actor's token are refused. Failed
saves roll back rows; sequence reservations consumed before a failed insert are
reported honestly and never rewound. Original import reconciliation remains
separate from continuously verified native/current history.

No hearing deletion, archive/restore, bulk edit, export, audit-history interface,
notification automation or later task is included. New migration/code activation
requires independent review and subsequent owner approval. The separate accepted
app activation is restricted to migrations 64/65 and exact commit 9b09f0d, with
protected recovery backup and isolated rehearsal first. No push or Ubuntu
deployment is authorized.


## D61 — Hearing archive and restore lifecycle

**Owner adopted 13 September 2026 for Task 4.3 Phase 3.** This extends D25's
Administrator archive/restore permission with the explicit visibility and parent
behavior below. These details were not previously prescribed by D25. D59 and D60
and every earlier decision retain their original bytes and historical scope.

1. Administrator alone may archive/restore. All four roles retain read access. Administrator and Litigation Assistant retain ordinary hearing editing only when the hearing and its associated matter are unarchived. Lawyer and Paralegal cannot mutate. Enforce current account/session/role/actor at every page, action, service and committing gateway.
2. Archive is recoverable removal from ordinary operational use, never physical deletion, cancellation, completion, rescheduling or a new legal outcome. Every existing hearing starts unarchived, irrespective of date/outcome or archived parent; native creation also starts unarchived. Do not infer archive state from old data or rewrite dates/statuses.
3. Hearing and parent archive flags remain independent. Archiving/restoring a hearing changes neither matter nor client. Parent archive/restore never cascades to hearings or attendee retirement. All hearing reads remain available under existing permissions even beneath archived parents. Before any new hearing archive/restore or ordinary edit, restore an associated archived matter first; this applies to Administrator too. A NULL matter remains a valid unassigned hearing and has no parent-restoration prerequisite. An archived client does not block an otherwise unarchived matter's hearing. Existing matter bindings remain immutable.
4. Ordinary hearing lists default to unarchived hearings, with explicit archived/all filters. Keep search, date-field/range, matter/client/court/attendee filters, paging and validated return context independent. Filters and back/detail navigation must round-trip without losing state. Archived hearings retain clearly labelled read-only details, current and retained attendance/history information, and parent links. Show useful empty states and paginate correctly after a transition. Do not hide a hearing merely because its matter/client is archived. Distinguish hearing archive state from parent archive state in services and UI; the existing record.archived field previously represented the matter state.
5. Neither transition changes hearing business/raw/source fields, attendees, IDs, imported ordinals, current order, retired states, inactive-person references, duplicate memberships, source-cell/span identity, audit/provenance or related records. Restore must not reactivate retired attendees or people, nor require rewriting historically valid inactive/missing references. D41's exact twelve protected hearings retain court/circuit/note/source/matter values. No notification, billing, staff, matter or client mutation is introduced.
6. An archived hearing and its attendee selections are read-only until Administrator restores it and the parent permits editing. A stale editor opened before archive cannot save or silently unarchive. A previously committed exact owned retry may acknowledge its recorded result after fresh authentication, but may never replay a write or override a later archive/restore; return UI must refresh current state rather than misrepresent an old receipt as current state.
7. Preserve existing report inclusion, criteria, financial totals and historical relationship counts regardless of hearing, matter or client archive state. Operational hearing lists may default to unarchived; report/service sources must not silently inherit that filter. Explain the distinction in confirmation/help and document it for future Task6 reports. Existing linked hearing navigation must offer an explicit way to view archived records; total historical counts must not become misleadingly smaller. Do not implement new report/export or calendar screens.
8. Both transitions require deliberate confirmation naming the hearing and identifiable date/matter context, with accurate current/retired attendee and other relevant relationship counts discovered from the schema. Explain preservation. Recheck identity, authorization, state, version, parent and the confirmation's count/snapshot facts at commit. No prerequisite of zero attendees, completed case, paid bills or a particular hearing date/outcome is introduced. If confirmation facts change, refuse safely and refresh for confirmation.
9. Use the existing aggregate version and trusted audit/history/receipt contract. A changed transition commits exactly one version advancement, lifecycle history/receipt and the correct archive/restore audit fact atomically. An unchanged requested state with the current version is a true no-op: no new business/audit/history/submission/sequence state. Stale versions are refused; exact same-actor/same-payload retry returns the original result without duplicate work; changed payload/action or another actor's token is refused. Fresh authorization precedes receipt reuse. No effect, incomplete history or sequence adjustment may be hidden by a retry or failed operation.

Practical consequence: an Administrator may remove a hearing from the everyday list and later restore it with all attendance evidence intact. If its matter is archived, restore that matter first. This conservative parent prerequisite matches the existing D60 editing gate; independently archiving a hearing remains separate from archiving a matter. It adds one deliberate recovery step but no cleanup/re-entry of historical data. No new service cost is involved.
