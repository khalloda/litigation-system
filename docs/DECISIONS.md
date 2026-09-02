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
