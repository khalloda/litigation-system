# Data migration

Move **30,553 rows** from Access to PostgreSQL with **provable** zero loss.

**Core rule: never delete, clean or fix anything during extraction or load.**
Data that cannot be mapped is *quarantined*, not dropped.

## Which row count is the target?

Two numbers appear in this project and both are correct. They mean different
things, and confusing them makes the final reconciliation impossible to judge.

| Number | What it is |
|---:|---|
| **35,343** | Every row in the Access file, including the tables the firm dropped |
| **30,553** | The rows that actually migrate — the sum of the Gate 1 table below |
| **4,790** | The difference: archived tables. Meetings (3,230 rows, D2) plus `Copy Of العملاء`, `Follow-up`, `عهدة قسم القضايا`, `Paste Errors`, `tblMinMatterHearingDate` and the other archive-only tables the extraction script skips by default |

**Prove 30,553.** The Gate 4 reconciliation report must also show
*migrated 30,553 + archived 4,790 = 35,343*, so both numbers are visible on one
page and nobody rediscovers this gap later and reports it as lost data.

## The trap that destroys data silently

Access "complex columns" (Attachment, Multi-Value) are not stored in the
visible table. The visible column holds an internal pointer.

Exporting `العملاء` to CSV gives a `logo` column that looks fully populated —
all 313 rows have a value. The values are `136`, `42`, `1`. **Only 54 clients
have a logo**, and the real image data lives in a hidden table.

| Column | CSV export gives | Reality |
|---|---|---|
| `العملاء.logo` | 313 integers | 54 image files |
| `خطابات الأتعاب.Matter` | 331 integers | 288 case-number strings across 195 parents |
| `Contacts.Attachments` | looks populated | **empty** |

The export reports success and raises no error. Use `scripts/01_extract_access.ps1`,
which reads these through the Access object model.

**Never use `mdbtools`, plain ODBC, or a Python `.accdb` reader for extraction.**

## Stages

```
Access file (read-only copy)
   │
 [A] extract      → UTF-8 CSV + attachment files + manifest
   │  GATE 1: row counts and SHA-256 match the manifest
 [B] load         → staging schema, EVERY column as text
   │  GATE 2: staging counts equal manifest counts
 [C] profile      → quarantine tables, review queues
   │  GATE 3: every source row accounted for
 [D] transform    → typed, normalised target tables
   │  GATE 4: counts, business totals, six reports reconciled
 [E] cutover
```

### Why staging is all-text

A load can never fail on a type conversion, so **no row is rejected at the
door**. Bad dates and non-numeric numbers arrive intact and are dealt with in
Stage C, where the decision is visible and reversible.

Every staging row carries `src_row_num` and `src_file`, so any target row traces
back to its origin.

## Gate 1 — expected values

Fail the migration if these do not match.

| Table | Rows | | Table | Rows |
|---|---:|---|---|---:|
| `الجلسات` | 13,279 | | `المستندات` | 405 |
| `admin work table` | 4,207 | | `خطابات الأتعاب` | 331 |
| `إجراءات المهام` | 4,130 | | `العملاء` | 313 |
| `Attendance` | 4,022 | | `Contacts` | 188 |
| `الدعاوى` | 1,730 | | `تقسيم التحصيلات` | 47 |
| `التوكيلات` | 735 | | `lawyers` | 23 |
| `السداد` | 597 | | `فريق العمل` | 3 |
| `الفواتير` | 543 | | | |

**These 15 tables sum to 30,553 rows.** That is the migration target.

Also: **54 attachments** and **288 multi-value entries**.

**These numbers are asserted by `scripts/01_extract_access.ps1`, not printed
for a human to compare.** The script exits non-zero on any mismatch, and on
**any warning at all** — a complex-column read that throws is recorded as a
warning, and a warning in a lossless extraction is a failure. It used to print
the expected values and a note saying "if attachments = 0 the extraction
failed silently", which is advice, not a gate: nobody reads the twelfth line
of a run that says it succeeded.

If the firm's data has genuinely changed — it is in daily use and drifts about
100 records a day — update the expected counts in that script deliberately,
in the same commit as the reason.

Note: the attachment count is 54 only with the default table set. Running the
extractor with `-IncludeArchiveTables` also reads `Copy Of العملاء`, which holds
the same 54 images again, and the manifest will then total **108**. Gate 1
assumes the default.

## Never match an Arabic name without asserting the count

**Every statement that matches on an Arabic name must state how many rows it
expects to touch, and fail loudly if the number differs.**

This is not a style preference. Two real bugs in this project were both silent:

- `احمد إسماعيل` and `أحمد إسماعيل` differ only at character 0 —
  `ا` (U+0627) against `أ` (U+0623). A generator matched the wrong one,
  affected **0 rows**, reported success, and created a duplicate person
  carrying 2 mentions beside the real one carrying 1,309.
- The same for `احمد سعيد` / `أحمد سعيد` — 1 mention against 2,000.

In Access the identical defect detached 3 matters from their lawyer (D5).

**A `0 rows affected` that nobody checks is how a person disappears from 1,309
hearings.** Nothing errors. Nothing is logged. The loss is only visible months
later when a report comes up short.

### The rule

1. Match through `person_name_alias`, never through `people.name_ar`. The
   alias table exists precisely so a hamza variant cannot miss.
2. State the expected row count next to every such statement.
3. Assert it. In SQL:

   ```sql
   DO $
   DECLARE n integer;
   BEGIN
       UPDATE people p SET team_id = ... WHERE ...;
       GET DIAGNOSTICS n = ROW_COUNT;
       IF n <> 4 THEN
           RAISE EXCEPTION 'team A: expected 4 rows, got %', n;
       END IF;
   END $;
   ```

4. The same applies in TypeScript transforms: compare the returned count against
   the expected figure and throw. Never log a warning and carry on.
Apply this to seeds, transforms and reconciliation queries alike.

### The four classes of Arabic name variation

**They are not equal, and the difference decides what a machine may do.**

| Class | Example | Can a normaliser fold it? |
|---|---|---|
| Hamza | `احمد` / `أحمد` | **Yes** |
| Ta marbuta | `محكمه` / `محكمة` | **Yes** |
| Space in a compound name | `عبدالعزيز` / `عبد العزيز` | **Yes** |
| Dropped middle name | `سامي خطاب` / `سامي إبراهيم خطاب` | **No — never** |

The first three are mechanical: the same characters, written differently. A
normaliser folds them and is right every time.

**The fourth cannot be folded by any rule, and must never be attempted.** A
normaliser that dropped middle names would merge genuinely different people
who share a first and last name — which in a firm this size is a matter of
time, not chance. It can only be handled by human-recorded aliases, which is
exactly what the firm's review produced: `سامي إبراهيم خطاب` carries
`سامي خطاب`, `سامي إبراهيم`, `سامي إبراهيم محمد يوسف` and `سامي خطب`
because a person decided each one.

**Never extend the normaliser to guess at name shortening, however tempting
the pattern looks.** A fold that is right 95% of the time silently merges two
people the other 5%, and merging two people is the failure this project has
already suffered twice.

#### Why the third class was added

The space fold was added on 21 August 2026, and finding it immediately found
something else. Folding hamza, ta marbuta and spaces together across the
roster surfaced **three pairs of people whose fully-normalised names are
identical** — probable duplicates that neither fold alone would have caught.
`أحمد عبد الله` and `احمد عبدالله` differ by a hamza AND a space; either
fold on its own leaves them apart.

### A merge instruction is Arabic text too

**Normalise both sides when resolving a merge target.**

Whoever writes "merge X into Y" will spell Y however *they* spell it —
without the hamza, without the space in a compound name, with ة for ه.
Matching that target exactly finds no such person, and a generator that then
creates one has manufactured the very duplicate the merge was meant to
prevent.

That is what happened. The firm's reviewed workbook resolved four fragments
correctly:

| Fragment | Target the reviewer typed | The person they meant |
|---|---|---|
| `وأحمد عبد الله محمد` | `احمد عبدالله` | `أحمد عبد الله` |
| `والأساتذه أحمد عبد الله محمد علي` | `احمد عبدالله` | `أحمد عبد الله` |
| `ود. خالد محمود حمدي عبد العزيز عطية` | `خالد عطية` | `خالد عطيه` |
| `نبيل فرحات` | `احمد فرحات` | `أحمد فرحات` |

Three people were created that should never have existed, and both of the
first two explanations offered for them — unstripped conjunctions, a
reviewer error — were wrong. The review was right; the matching was exact
where it needed to be normalised.

**This is the third time the same fault has appeared**, after the roster
generator's "0 mentions" and the pipe-delimited inventory. Here it was in the
one file whose entire purpose is resolving name variants.

Two things follow:

- `نبيل فرحات` → `احمد فرحات` is a **dropped-name** merge. No normaliser
  could ever infer it — see the four classes above. A human made that
  judgement, which is what the alias table is for.
- Do **not** add conjunction-stripping. The و-prefixed spellings genuinely
  appeared in the source and the review already assigned each to the right
  person; they are correct as aliases and must stay.

### The cascade rule

**When an expected count changes, re-derive every figure that depends on it.
Do not edit the one you noticed.**

Merging two duplicate people moved **five** numbers, not one:

| | was | now |
|---|---:|---:|
| total people | 140 | 138 |
| firm staff | 69 | 67 |
| current staff | 23 | 21 |
| current staff with no team | 18 | 16 |
| aliases | 338 | 339 |

Four of the five were missed on the first pass, and the stale figures had been
written into a validation query. **An assertion that fails on correct data is
worse than no assertion at all**: the natural response is to loosen it until it
passes, and at that point it has stopped being a check while still looking like
one.

Re-derive figures **by parsing the data**, never by reading the comment that
describes it. Twice in one day the description was wrong and the data was
right.

### A check must be tested where it will actually run

**A safety check must be tested against the failure it exists to prevent, in
the environment where it will run.**

Six passing paths did not cover the schema the data will actually be in. The
`db:reset` guard counted rows in `public` and was proved against six
deliberately broken cases — all of them in `public`. From Stage 2 the
extracted Access data lives in `stg` and the quarantine in `qc`, so on the
day it mattered most the guard would have looked at an empty `public`, said
"nothing to lose", and destroyed the entire extraction.

Every finding in the Stage 0 review was a gap in a check that already existed
and already passed its own tests. So when writing a check, ask two questions:

1. **What is the failure this exists to prevent?** Reproduce that exact
   failure, not a convenient stand-in for it.
2. **Where will this run, and what will be true there that is not true here?**
   A different schema. A different PowerShell. A live server whose database is
   also on `localhost`. An `.env` with one line missing.

Two more from the same review, both of the same shape:

- The production guard was tested with `APP_ENV=production` and refused
  correctly. It was never tested with `APP_ENV` **unset**, which is the way it
  would actually fail on the server — and unset was accepted.
- The extraction script was read but never parsed by **Windows PowerShell
  5.1**, the version needed for Access. It reads a file without a byte-order
  mark as Windows-1252, so every Arabic table name in it was corrupt.

### Validate what you receive, never assume its shape

**A check must validate what it receives, not assume its shape. Any value the
check cannot parse is a refusal — never a zero, and never a pass.**

Three faults in this project are the same fault:

| Where | What arrived | What it was read as |
|---|---|---|
| The roster generator | a name it had failed to match | **"0 mentions"** — and two duplicate people were created, one carrying 1,309 hearings |
| Gate 1 | a manifest with a table missing | a **total that happened to add up**, so the extraction looked complete |
| The reset guard | `review|guard_fixture|3`, split on the pipe | `Number('guard_fixture')` → NaN → **an empty table**, and deletion was permitted |

Each time, something unreadable was silently treated as nothing. Nothing is
the most dangerous default a safety check can have, because "nothing here" is
exactly the answer that lets the dangerous thing proceed.

In practice:

1. **Do not use delimited text for anything whose values you do not control.**
   A delimited string cannot carry a value containing its own delimiter, so
   escaping only moves the problem. Use JSON — PostgreSQL emits it directly
   with `json_agg` and `json_build_object`.
2. **Check every field on arrival.** A count must be a whole number, zero or
   more. A name must be a non-empty string. Anything else throws.
3. **Present is not the same as correct.** Gate 1 checked that every expected
   table was present and nothing unexpected appeared, and still accepted a
   duplicate. Count what you find; do not merely look for it.
4. **A parse failure is a refusal.** Never a default value, never a warning
   that the run continues past.

### An assertion tests what it looks at, and nothing else

Two examples from the same afternoon, both about the multi-person split rules.

The assertion written was *"every member name resolves to exactly one
person"*. It fired, and found one rule whose member name resolved to nobody —
one matter, whose lawyers would have been lost.

**It could not have found the other two.** Two rules had NO MEMBER ROWS AT
ALL, because the extractor's bracket capture returned nothing. A rule with no
members has no member row to fail, so an assertion over member rows sees
perfection. Ten more matters would have lost every lawyer, silently.

So when writing an assertion, ask what it CANNOT see:

- *"every row that exists is valid"* says nothing about rows that should
  exist and do not. Assert the count as well as the content.
- *"every child resolves to a parent"* says nothing about a parent with no
  children. Assert that every parent has at least one.
- *"the typo is gone"* is satisfied by deleting both spellings. Assert the
  surviving value is present too.

Task 2.7's assertions must therefore cover all three: every rule has at least
one member, every member resolves to exactly one person, and ordinals run
from 1 without gaps.

### Prove the check catches a failure

**Before trusting any gate or assertion, break something on purpose and confirm
it fails.**

A check that has only ever seen good data is not known to work. This found a
real fault in the database setup: PostgreSQL started perfectly well with no
Arabic collation, and the health check said "healthy" — because it was only
asking whether the server answered. Dropping the collation on a running
database exposed it in seconds.

Apply this to **every one of the four migration gates**:

| Gate | Break it like this | It must |
|---|---|---|
| 1 — extract | Point it at a table with a row removed; blank an attachment | Report the count mismatch and stop |
| 2 — load | Delete a row from a staging file after extraction | Refuse to proceed, naming the table |
| 3 — profile | Add an unmappable value that no crosswalk row covers | Land it in quarantine, not in the target table |
| 4 — reconcile | Change one lawyer's matter count; drop one hearing | Fail the comparison and name the figure |

Record the result of each deliberate break next to the gate. "We ran it and it
passed" is not evidence that a gate works.

### A safety net we did not build, and must not disable

The roster seed was once written into an **already-applied migration** by
mistake — the target was chosen with `find … | sort | tail -1`, and the
folder it assumed existed had not been created because the command before it
had failed.

Nothing in this project caught that. **Prisma's shadow database did**: on the
next `migrate dev`, it replays every migration from scratch to compute a
diff, hit `INSERT INTO people` before `people` existed, and refused.

That replay is a real safety net and it is free. Anything that disables it —
`migrate deploy` alone in development, a shadow-database URL pointing at the
live database, or skipping `migrate dev` because `deploy` is quicker — throws
it away. Keep using `migrate dev` locally.

## Quarantine, don't delete

```sql
CREATE TABLE qc.quarantine (
    id serial PRIMARY KEY,
    source_table text, src_row_num bigint,
    issue_type text, column_name text, raw_value text,
    proposed_action text, resolved boolean DEFAULT false,
    resolution text, detected_at timestamptz DEFAULT now()
);
```

Known items, with measured volumes:

| Issue | Count | Handling |
|---|---:|---|
| Fee-letter links matching no matter | 289 | Load matter, link null, queue |
| Orphan task actions | 36 | Load, link null, queue |
| Task actions with no parent id | 39 | Load, link null |
| Hearings with no matter | 4 | Load to unassigned bucket |
| POA with no client | 1 | Same |
| Attendee names seen once | ~474 | Queue for human review |

## The `_raw` rule

Every normalised column keeps the original text beside it —
`legacy_category_raw`, `legacy_degree_raw`, `capacity_raw`,
`legacy_action_raw` (hearings) and `legacy_branch_raw` (clients).

### The audit — every many-to-one mapping, and whether it keeps the original

Done 21 August 2026 after `hearings.legacy_action_raw` was found missing.

| Target | Source | Keeps the original? |
|---|---|---|
| `matters.matter_type_id` / `matter_category_id` / `degree_id` / `venue_id` | `matterCategory` (50) + `matterDegree` (40) | ✅ `legacy_category_raw`, `legacy_degree_raw` |
| `hearings.action_id` | `الإجراء` (23 → 20) | ✅ `legacy_action_raw` |
| `clients.branch_id` | `clientBranch` (32 → 31) | ✅ `legacy_branch_raw` |
| `matter_parties` + `matter_party_roles` | `client&Cap` / `opponent&Cap`, 242 capacity strings | ✅ `legacy_raw` |
| `matter_lawyers.person_id` | `lawyerA` / `lawyerB` + combination strings | ✅ `legacy_source` holds the exact source string |
| **`hearing_attendees.person_id`** | `الحاضر` + `حاضر 1`–`حاضر 4`, **373 spellings → 138 people**, multi-person strings split into rows | ❌ **NOTHING** |
| **`admin_tasks.assigned_to_person_id`** | a typed name | ❌ **NOTHING** |
| **`powers_of_attorney`** lawyers | `المحامون الصادر لهم التوكيل`, up to twelve names in one field | ❌ **NOTHING** |

**The three gaps are all person-name mappings, which is the worst place for
them.** Names are the highest-ratio mapping in this project — 373 spellings
collapse to 138 people — and the one that has already gone wrong twice: a
missing hamza made `أحمد إسماعيل` into two people, one carrying 1,309
hearings. If such a merge is later judged wrong, splitting it back apart
needs to know which spelling stood in each row. `person_name_alias` records
that a spelling exists; it does not record which hearing used it.

Fix in task 1.3, before any of these tables is loaded:
`hearing_attendees.legacy_name_raw`, `admin_tasks.legacy_assignee_raw`, and
a raw column on whatever table holds the POA lawyer list.

**`legacy_action_raw` and `legacy_branch_raw` were added on 21 August 2026
and show why the rule is not optional.** Those two columns mapped one to one until four lookup values were
merged that day. A one-to-one mapping loses nothing; a many-to-one mapping
loses the original unless it is kept. **Whenever a lookup gains a merge, the
column that uses it needs a `_raw` partner, or the merge becomes
irreversible.** Even where 50
spellings collapse into one list entry, the byte-exact original stays
queryable. A wrong mapping can be corrected and re-derived without going back to
the Access file.

## Load order

Parents before children.

```
 1 people            2 lookups          3 clients
 4 client_logos      5 contacts         6 matters
 7 matter_lawyers    8 matter_parties   9 hearings
10 hearing_attendees 11 powers_of_attorney
12 documents        13 fee_letters     14 fee_letter_matters
15 invoices         16 payments        17 admin_tasks
18 task_actions     19 attendance
```

## Gate 4 — proving it worked

**Counts** are not enough. A reversed join gives the right number of rows with
the wrong content. Also check:

- Matter count per lawyer against the legacy figures: إيهاب حمدي 476,
  ناجي رمضان 200, هاني الدالي 181, أحمد سعيد 129, محمد عبد العزيز 124,
  أحمد إسماعيل 85, محمود شعبان 41
- Matters per status: سارية 493 / منتهية 1,223 / null 14
- Total invoiced and total paid, per currency
- Hearing count per year, 2009 → 2026
- SHA-256 of each of the 54 logos, before and after

**Then run six real reports** in Access and in the new system and compare row
for row — one client, one for/against, one lawyer workload, one hearings by
date, one administrative works, one financial. This is the only check that
catches a wrong join.

## Cutover

The Access file is in daily use. A stale copy drifted **325 rows in a few days**.

```
T-14d  Full dry run on a copy. All gates pass. Six reports reconciled.
T-7d   Second dry run. Firm signs off.
T-1d   Final compact + backup. SHA-256 recorded.
T-0    FREEZE Access (read-only for everyone). Run A–E. Gate 4 must pass.
T+0    Go live. Access stays available read-only for 90 days.
T+90d  Archive the .accdb to cold storage. Do not delete.
```

**Separately and urgently:** the production Access file sits at exactly
2,147,483,648 bytes — the hard limit — and compacts to 45 MB. Compact and repair
it on a backup now. A file at its ceiling can refuse to save new records.
