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

**Scale:** 54 logos today, 771 KB total. All 313 clients would be roughly 5 MB.

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
