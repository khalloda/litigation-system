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

### A count in an instruction is a claim, not a fact

**Count the items yourself and report the difference. Never let a stated total
stand in for the content it describes.**

This has now gone wrong four times in this project, and the pattern is always
the same: the *list* was right and the *number attached to it* was wrong.

| Where | The claim | The truth |
|---|---|---|
| Gate 1 | a manifest total that added up | a table was missing; the total added up anyway |
| The roster generator | "0 mentions" | the name had failed to match, and two duplicate people were created |
| The `db:reset` inventory | a table with 0 rows | the row count had failed to parse |
| `client_branch` | "13 KEEP and 19 WRONG", then "15 and 17" | the enumerated values were 15 and 16, and were right both times |

A total is a *summary* of the content. When the two disagree, the content is
the evidence and the total is a description of it — and this project has never
once found the content to be the wrong half.

The danger is not that a number is wrong. It is that a number **agrees with
itself**. `13 + 19 = 32` looks like arithmetic that has been checked, and a
manifest whose totals add up looks like a complete extraction. A self-
consistent wrong number is more convincing than an obviously wrong one, which
is exactly why it survives review.

In practice:

1. **Count the items in the list.** Not the number written above the list.
2. **Compare in both directions.** How many stated values are not in the data,
   and how many values in the data were never stated. One direction alone
   misses half the failures — the branch resolution was checked both ways and
   both came back zero, which is what made 15 and 16 trustworthy.
3. **Compare byte for byte.** These are Arabic strings; a hamza or a space
   makes two values that look identical on screen. Match through the
   normaliser or through `person_name_alias`, and print the code points when
   something does not match.
4. **Report the difference and let the owner rule.** Do not quietly adopt the
   count, and do not quietly adopt the list either. Say which one the data
   supports and why.

The same applies to a *field name* in an instruction, not only a count. The
branch resolution said `آراء قانونية` moves to `matter_category رأي قانوني`;
that value does not exist in `matter_category` and exists exactly so in
`matter_type`. The value was right and the list name was a slip — but the
migration's own assertion refused to apply it either way, which is the point.
**An instruction is evidence, not authority.** Check it against the data,
apply what the data supports, and flag what you changed.

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
and already passed its own tests. So when writing a check, ask **three**
questions:

1. **What is the failure this exists to prevent?** Reproduce that exact
   failure, not a convenient stand-in for it.
2. **Where will this run, and what will be true there that is not true here?**
   A different schema. A different PowerShell. A live server whose database is
   also on `localhost`. An `.env` with one line missing.
3. **What KIND of thing did I actually test, and is the thing I am relying on
   the same kind?** This is the variant the trigram indexes found, and it is
   the easiest of the three to miss, because the test genuinely passed — just
   on a different kind of object. Two behaviours, one test.

   `prisma migrate dev` was verified to leave a **partial unique index**
   alone. The conclusion drawn was "Prisma leaves raw-SQL indexes alone". It
   does not: it ignores a *filtered* index it cannot represent, and removes a
   *plain* one it can see. The six trigram indexes were dropped by the next
   migration.

   Not the environment, and not the failure mode — **the kind of object.** Ask
   it of anything asserted about a tool's behaviour: a constraint is not an
   index, an index is not a column, a trigger is not a constraint, and a tool
   may treat each of them differently.

   Hardening that followed: the check now asserts the index **type**, not just
   its name. A btree called `..._trgm_idx` would satisfy a name check and do
   nothing for `LIKE '%…%'`.

**A third, from 22 August 2026, and the same shape again.** Task 1.6 created
six `pg_trgm` indexes in raw SQL, because Prisma is not told about
`gin_trgm_ops` in the ordinary way. **The very next migration dropped all
six.** Prisma removes an index whose columns it manages but which is not in
`schema.prisma`.

The partial unique indexes — one primary alias per person, one lead lawyer per
matter — had survived exactly that treatment, and I generalised from them.
Wrong generalisation: Prisma ignores a *filtered* index it cannot represent,
and removes a *plain* one it can see.

Nothing was lost — an index is a speed feature and searching still worked, only
slowly. What caught it was `db:check` asserting the indexes **exist**, added
for precisely this reason: `schema.prisma` cannot see them, so nothing else
would notice. **Verifying that `migrate dev` left one kind of index alone was
not evidence about a different kind.** They are now declared in
`schema.prisma` with `type: Gin` and `ops: raw("gin_trgm_ops")`, and the check
also asserts each one really is a trigram index — a plain btree with the right
name would satisfy a name check and do nothing for `LIKE '%…%'`.

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

### An assertion that runs once is a snapshot, not an invariant

**Anything that must stay true forever belongs in `db:check` or in a database
constraint — never only in the migration that first established it.**

Migration 0005 asserted that no person had more than one primary alias. It was
true when it ran. Migration 0006, twenty-nine minutes later, merged three
phantom people into their real counterparts with

```sql
UPDATE person_name_alias SET person_id = target_id WHERE person_id = phantom_id;
```

which carried each phantom's **primary** alias onto the survivor without
demoting it. Two people ended up with two primary aliases each — two different
answers to "what is this person called?" — and **all seventeen checks passed**
for a day. The third merge escaped only by luck: that spelling already existed
on the target as a non-primary row.

0005's assertion was not wrong. It was *momentary*. It proved something about
21 August at 11:48 and could say nothing about 21 August at 12:17.

**A constraint outranks a check, and a check outranks a migration assertion:**

| | Tells you | Catches |
|---|---|---|
| Database constraint | at the moment of the mistake | everything, forever |
| `db:check` | next time anyone looks | anything already committed |
| Migration assertion | once, when it ran | only that moment |

Use the strongest one the fault allows. The one-primary rule is now a partial
unique index — `CREATE UNIQUE INDEX … ON person_name_alias (person_id) WHERE
is_primary` — so a second primary is *impossible* regardless of what a future
migration attempts. Re-running migration 0006's exact `UPDATE` against it now
fails with a unique violation instead of silently corrupting.

Keep the check as well. The Prisma schema language cannot express a filtered
index, so it is created in raw SQL and is invisible to `schema.prisma` —
nothing but `db:check` would notice it being dropped. (Verified: `prisma
migrate dev` leaves it alone and reports the schema in sync.)

#### The audit — every one-time assertion, and where its invariant now lives

Done 21 August 2026 after the review. Every `RAISE EXCEPTION` in migrations
0001–0008, asked one question: *could a later migration break this without
anything noticing?*

| Asserted once in a migration | Where it lives now |
|---|---|
| One primary alias per person | **Partial unique index** + `db:check` |
| Primary alias equals `people.name_ar` | `db:check` (new) |
| The one-primary index exists | `db:check` (new) |
| Team reviewers are the right people | **Migration 0010 postcondition** + `db:check` (new) |
| Team membership is exactly those 8 people | **Migration 0010 postcondition** + `db:check` (new) |
| Each alias points at the *correct* person | **Baseline** + `db:check` (new) — see below |
| Each crosswalk rule points at the *correct* target | **Baseline** + `db:check` (new) |
| No spelling maps to two people | Already a `UNIQUE` constraint on `alias_ar` |
| No orphaned spellings | Already a foreign key with `ON DELETE CASCADE` |
| Lookup labels are unique | Already a `UNIQUE` constraint |
| All nine lookup counts, the nine roster figures | Already in `db:check` |
| Crosswalk targets resolve; no unrecognised `target_field` | Already in `db:check` |
| Extensions and the `arabic` collation | Already in `db:check` |
| Exactly one default matter type | Already in `db:check` |
| Merged spellings gone **and** their targets present | Already in `db:check` |

Three gaps, all now closed. Everything else was already either a database
constraint or a standing check.

**One figure was invisible to every existing check:** total people with a
team. Removing a *former* staff member from a team changes none of the nine
roster figures, because those count current staff. It was only caught once
the team check compared membership as a set.

### Counting a mapping is not checking it

**A check that counts links, and proves their destinations exist, has not
looked at whether any link is correct.**

Every check in this project counted the 347 alias links and the 20 crosswalk
rules, and proved that each pointed at something real. Change

```
client_branch دعاوى عمالية  →  matter_category عمال
```

to point at `مدني` instead and **everything still passes**: the count is
unchanged, `مدني` exists, nothing dangles. The same is true of repointing a
spelling at the wrong person.

At Stage 2 the first mistake files matters under the wrong practice area and
the second attaches a lawyer's historical work to somebody else. Neither
raises an error. Neither leaves a gap. Nobody finds it for months, because
every number agrees.

**The reviewed links therefore have a baseline** —
`scripts/baselines/reviewed-links.json`, one row per pair the firm actually
reviewed. `db:check` proves every recorded pair still holds. It is
deliberately one-directional:

- **Adding** a link is allowed. New people, spellings and rules arrive all
  through Stage 2, and a baseline that forbade them would be edited into
  uselessness in a week.
- **Changing** one fails the check, by name, saying what it was and what it is
  now.

Changing one deliberately takes `npm run baseline:write -- --accept-changes`,
which prints every difference before writing. That is the point: a decision
the firm made should only be revised by a visible decision with a new
baseline, committed on its own — not by a silent edit nobody reviews.

The baseline identifies people by **name, not by id**. ids are an
implementation detail and have already been renumbered once by the 0006
merges; a name is also what makes the file readable by the people who reviewed
the data. The trade-off is that renaming a person breaks every baseline row
mentioning them, which is correct — a rename of a reviewed person *is* a
decision.

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
| `clients.branch_id` | `clientBranch` (32 → 15) | ✅ `legacy_branch_raw` |
| `matter_parties` + `matter_party_roles` | `client&Cap` / `opponent&Cap`, 242 capacity strings | ✅ `legacy_raw` |
| `matter_lawyers.person_id` | `lawyerA` / `lawyerB` + combination strings | ✅ `legacy_source` holds the exact source string |
| **`hearing_attendees.person_id`** | `الحاضر` + `حاضر 1`–`حاضر 4`, **373 spellings → 135 people**, multi-person strings split into rows | ❌ **NOTHING** |
| **`admin_tasks.assigned_to_person_id`** | a typed name | ❌ **NOTHING** |
| **`powers_of_attorney`** lawyers | `المحامون الصادر لهم التوكيل`, up to twelve names in one field | ❌ **NOTHING** |

**The three gaps are all person-name mappings, which is the worst place for
them.** Names are the highest-ratio mapping in this project — 373 spellings
collapse to 135 people — and the one that has already gone wrong twice: a
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
