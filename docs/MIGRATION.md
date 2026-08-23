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
| **30,553** | The rows that actually migrate — the sum of the **migrated** group below |
| **4,790** | The difference: everything not migrated. Meetings (3,230 rows, D2) plus `Copy Of العملاء`, `Follow-up`, `عهدة قسم القضايا`, `Paste Errors`, `tblMinMatterHearingDate` and the other archive-only tables the extraction script skips by default — **and the 38 rows of `المحامين`**, which is extracted but not migrated |

**Not migrated splits three ways, and Gate 4 needs the distinction.** A table
is *migrated* (becomes records in the new system), *reference-only*
(extracted, read during the migration, never becomes records), or
*archive-only* (not extracted at all without `-IncludeArchiveTables`). The
first two are what Gate 1 expects; all three together are the 35,343.

**All three figures are as at 19 August 2026, and all three move.** The file
grows by about 100 records a day, so by cutover the migrated figure will be
larger than 30,553 and the total larger than 35,343. That is expected. What must
hold on any given run is the **arithmetic**, not the constants:

> *migrated + archived = every row in the file*

**Gate 4 proves that identity against the counts from the file actually
extracted**, and prints all three of that day's figures on one page, so the gap
is visible and nobody rediscovers it later and reports it as lost data. It does
**not** compare against 30,553 — see "What Gate 1 actually asserts" below for
why a constant here would fail every run from now on.

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

### The extracted CSVs are UTF-8 **without** a BOM, and that is deliberate

**If you double-click one in Excel on Windows you will see `Ø§Ù„Ø³ÙŠØ¯` where
`السيد` should be. Nothing is wrong with the file.**

Excel assumes Windows-1252 for a `.csv` opened by double-click. It reads each
UTF-8 Arabic byte as a separate Latin character, so two bytes become two
symbols. **The tell is that numbers and booleans look perfectly normal in the
same view** — they are ASCII, one byte each, and Windows-1252 agrees with
UTF-8 about those. Corruption during extraction would not be so selective.

**To look at one:**

| Do this | Not this |
|---|---|
| Excel → **Data → From Text/CSV**, and set **File Origin** to `65001: Unicode (UTF-8)` | double-clicking the file |
| Any editor that reads UTF-8 — VS Code, Notepad++ | Notepad on an older Windows |

#### Why not just add a BOM and make the double-click work?

Because the three BOM bytes would land **inside the first column name**.
`COPY ... FROM ... (FORMAT csv, HEADER true)` does not strip a byte-order
mark: the first header field becomes `\uFEFFID_Task` rather than `ID_Task`,
and the load fails — or worse, if a loader were tolerant enough to accept it,
succeeds with a column nobody can name.

**This is the trailing-CR fault of task 2.3 arriving from the other end.**
Same family: an invisible character riding along inside a value that renders
correctly everywhere a human looks. There the CR was appended to the *last*
field of every record; here the BOM would be prepended to the *first* field of
the header. Both are cured the same way — compare bytes, not renderings, and
check the header against the schema before loading a row. See "Two strings
that print identically are not thereby equal".

So the trade is: the files are correct for the machine that must read them,
and mildly inconvenient for the human who opens one to look. That is the right
way round. `npm run check:encoding` asserts the rule in both directions —
the `.ps1` scripts must keep their BOM, because Windows PowerShell 5.1 reads a
BOM-less script as Windows-1252 and mangles every Arabic table name in it.

### Why staging is all-text

A load can never fail on a type conversion, so **no row is rejected at the
door**. Bad dates and non-numeric numbers arrive intact and are dealt with in
Stage C, where the decision is visible and reversible.

Every staging row carries `src_row_num` and `src_file`, so any target row traces
back to its origin.

### `src_row_num` is the CSV record ordinal — never insertion order

**Ruled by the firm, 23 August 2026.** The loader supplies `src_row_num` as it
streams the file: the ordinal of the record within that CSV, counted as it is
read.

It must **not** be derived after loading — not from `row_number() OVER ()`,
not from an identity column, not from the physical order rows come back in.
PostgreSQL gives **no guarantee** that a `SELECT` returns rows in the order
`COPY` wrote them. It very often does, and *"it does in practice"* is not the
standard this project holds: the whole purpose of the column is that a target
row three stages later can be traced to a line in a file the firm still has.
A number that is usually the line number is not a line number.

Note that the ordinal is over **records**, not lines. A memo field in this
database can contain a newline, so record 400 may begin well past line 400.

### The staging schema — built at task 2.2, 23 August 2026

It lives in its own PostgreSQL schema, `staging`, alongside `public`. Prisma's
datasource is `public` only, so **`schema.prisma` does not describe these
tables and `prisma migrate dev` leaves them alone** — the same arrangement as
the raw-SQL trigram indexes. They are throwaway: `public` is the system,
`staging` is the loading dock.

**20 tables · 204 source columns, every one `text`.**
17 extracted tables plus 3 for the complex columns, which are separate because
an Access complex column holds a pointer, not data.

**Nothing in staging can refuse a row.** Every source column is `text`,
nullable, with no default, no check and no foreign key. That is not
tidiness — each of those would turn a bad value into a *lost row*, and none of
them would look wrong in a diff. A staging row whose parent is missing is an
orphan for the firm to see at Gate 3, not a load error that discards it.
`npm run db:check` re-proves all four every time it runs (rule 16).

**Column names are verbatim.** `الموقف الحالي`, `Cash/probono`, `Inv-No`,
Arabic and all. Staging must be directly comparable to the source — that is
what it is for. Renaming to the snake_case ASCII of `docs/DATA-MODEL.md`
happens at **transform**, stage D.

**Generated, not typed.** `npm run generate:staging-schema` builds the
migration from the extraction's own `meta/columns.csv`. 191 Arabic column
names retyped by hand is precisely where a silent error enters, and this
project already has two duplicate people created that way. The generator
cross-checks the dictionary against the manifest — two counts of the same
thing, written by different parts of the extractor — and refuses to write
anything if they disagree. It also refuses an identifier over 63 bytes, which
PostgreSQL truncates with a *notice* rather than an error, silently merging
two columns into one.

The generated migration records which extraction it describes: the source
path, size, modification date and SHA-256.

### Gate 2 — the load, task 2.3, 23 August 2026

**Gate 2 proves nothing was lost between reading and loading.** Staged row
counts equal the manifest counts exactly, per table and in total.

The whole load runs in **one transaction with Gate 2 inside it**, so a failure
rolls the entire thing back. A half-loaded staging schema that looks plausible
is worse than an empty one.

| What it asserts | Why |
|---|---|
| Per table: staged rows = the rows the extractor read out of Access | The promise of the gate. Two measurements of the same thing at opposite ends of the journey |
| `src_row_num` runs **1..n with no gaps and no repeats**, one `src_file` per table | A matching count can still be the wrong rows. Two copies of record 7 and no record 12 counts exactly the same as 1..n does |
| **Three** totals, each labelled with how many tables it covers | 30,885 over the 17 extracted tables — the figure Gate 1 reported — plus 342 from the complex columns, giving 31,227 staged over 20 tables |
| The extracted-table subtotal equals `summary.total_rows` | Ties Gate 2 back to a figure the extraction recorded **independently** and Gate 1 has already accepted. A total checked only against its own sum proves almost nothing |
| Every NULL and every empty string, counted across all 204 source columns | See below |
| All 20 tables carry `src_file` and `src_row_num` | Every target row must be traceable to a source line |

**The three totals are a correction made during the task.** The first version
reported one figure — 31,227 — and compared it against its own sum of the rows
it had just loaded. Worse, 31,227 is not the 30,885 Gate 1 reported, because
staging holds the flattened complex columns as rows of their own. Neither
number is wrong; printing one under the other's name is the fault, and it is
the same fault as writing 30,553 into Gate 4.

**The header of every CSV is checked against the staging table's columns before
a single row is loaded.** This is what "staging is directly comparable to the
source" means in practice, and it earned its place immediately: it caught a
loader that appended the CR of every CRLF to the last field of every record.
Fifteen column names that printed identically and compared unequal. Without
that check, every `matterID` in the database would have carried an invisible
carriage return, and no row count would have moved.

### NULL and the empty string are not the same value

**An unassigned `lawyerA` is a matter nobody has been put on. A cleared one is
a matter somebody was taken off.** Collapse the two and that difference is
gone for good, because staging is the only place the original text still
exists.

The mechanism is exact and needs no special handling:

| The extractor writes | PostgreSQL CSV `COPY` reads |
|---|---|
| a **bare** empty field | `NULL` |
| a **quoted** empty field, `""` | the empty string |

**This is proved, not reasoned about.** `npm run test:staging-copy` copies a
fixture into a temp table shaped `LIKE` a real staging table — `INCLUDING
ALL`, so it inherits any constraint the real one has — asserts both
directions, and rolls back. It also proves the four kinds of content that
break a naive loader: a comma inside a quoted field, **a newline inside a
quoted field**, a doubled quote, and trailing spaces.

**And it is proved again at full volume, on the real data.** Across the whole
extraction the difference is **193,445 NULLs against 2 empty strings**. Gate 2
counts both, across all 204 source columns, and fails on either figure.

**Two cells.** Both in `العملاء."Cash/probono"` — two clients where somebody
typed something and cleared it, against 316 where nothing was ever entered.
That is the entire practical extent of a distinction worth insisting on, and
it is exactly why it had to be insisted on: nothing about a load that lost
them would have looked wrong. No row count moves. No error is raised. The two
cells simply become the same as the other 316.

**The loader keeps them by never decoding them.** It finds record boundaries
and passes each record's **original text** through untouched, prepending only
`src_file` and `src_row_num`. Decoding the CSV into values and re-encoding it
would have been the obvious way to write that script, and would have collapsed
both cells silently.

#### Was it worth it? Two rows out of 31,227

**Recorded honestly, because the next person will reasonably ask.**

Preserving this distinction shaped the extractor's CSV encoding, the staging
schema, a dedicated proof script with two deliberate breaks, and the loader's
whole design. The entire practical extent of it is **two rows**.

The honest answer is not that two rows justify the effort by themselves. It is
that **you cannot know which two until you have kept them** — and by the time
anyone asks the question, the information is gone. There is no way to recover
a cleared field from a database that has already collapsed it into "never
entered": both are empty, and nothing records which was which.

So the cost is paid once, at the only moment it can be paid, against a benefit
that cannot be measured in advance. That is the shape of most of the rules in
this file. It is also why the figure is written down here: *two rows* is the
real number, not an argument dressed up as one.

Both halves of that check were proved to catch a failure, on 23 August 2026:

| Broken on purpose | What happened |
|---|---|
| the assertion changed to expect `''` where `NULL` is correct | `ERROR: a bare empty field did not arrive as NULL`, psql exit 3 |
| the assertions deleted entirely | **psql exited 0** — a test that runs nothing and reports success. The script counts the `PROVED` notices and fails on 0 of 2 |

The second one is why the counter exists. `ON_ERROR_STOP=1` makes a *failed*
assertion fatal; nothing but counting makes an *absent* one fatal.

## Gate 1 — what the extraction may contain

**17 tables in two named groups.** The distinction matters: this gate once
listed only the 15 migrated tables and was then used to police what the
*extractor* produced, which is a larger set. The first run against the real
file failed on two tables that are read out deliberately and were never meant
to migrate. *What do we migrate* and *what do we read out* are different
questions.

### Group 1 — migrated (15 tables)

These become records in the new system.

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

**These 15 tables summed to 30,553 rows on 19 August 2026.**

### Group 2 — reference-only (2 tables)

Extracted, never migrated. Nothing is dropped at extraction, and one of these
is load-bearing.

| Table | Rows | Why it is extracted |
|---|---:|---|
| `المحامين` | 38 | **The enforced parent of `الدعاوى.lawyerA` and `.lawyerB`.** Every matter's lawyer field is a name drawn from this list, and most of the 38 are *combinations* of lawyers. D5 does not migrate it as a table and that stays true — but drop it from the extraction and task 2.7 has nothing to expand the combination strings from. The 38 is D5's figure, not a 19 August reading |
| `LawyerShare4Invoices` | 0 | Empty. Replaced by `invoice_allocations`, alongside `تقسيم التحصيلات`. **Asserted at exactly 0**, not exempted from the non-empty rule — an exempt table is a place for a fault to hide, and a table that has quietly started collecting rows is something the firm should hear about |

**The two totals are reported separately, each labelled with how many tables
it covers:** 30,553 over 15 migrated tables, 30,591 over all 17. Printing one
against the other is a total standing in for something it does not measure —
the same fault as writing 30,553 into Gate 4. Both are **summed from the
tables above** by `scripts/lib/gate1.ps1` rather than written down a second
time, so they cannot disagree with the lists they are totals of.

Also on 19 August 2026: **54 attachments** and **288 multi-value entries**.

### What Gate 1 actually asserts — ruled 23 August 2026

**The figures above are a SHAPE CHECK, not a pass condition.** The firm's ruling,
and it changes how this gate is built.

The Access file is in daily use and drifts about **100 records a day**. Every
copy we extract from — every rehearsal copy, and the real one on cutover day —
has already moved away from 19 August. A gate that demanded 13,279 hearings
would refuse a perfectly good extraction, and the natural response to a gate
that fails on correct data is to loosen it until it passes. At that point it
has stopped being a check while still looking like one. That failure mode is
already written down twice in this file; this is it arriving in advance.

**Gate 1 asserts against the counts taken from the file it actually read.**

| | Pass condition | Why |
|---|---|---|
| **Provenance** | The manifest records the source file's **path, size, modification date and SHA-256** | Three weeks from now, *"which extraction produced this?"* has to be answerable from the manifest and not from anyone's memory. On cutover day it is the proof that the frozen production file — and not a stale rehearsal copy — is what was read |
| **Self-consistency** | Every CSV is **read back off the disk and parsed**, and the records that come out equal the rows read from Access, with the column count intact. SHA-256 recorded for every file | This is the real question Gate 1 answers: *did we get everything out intact?* It needs no prior figure and cannot drift. It must be a real parse — counting our own writes proves only that the loop ran, and counting lines is wrong the moment a memo field contains a newline |
| **Completeness** | All **17** expected tables present — 15 migrated, 2 reference-only — **exactly once each**, each with **more than zero** rows except the one asserted at exactly 0, and no table outside either group | A missing table is the fault that once slipped through a manifest whose total added up; a duplicate entry is the fault that slipped through the fix. The two groups are the fix for the third: policing the extraction set with the migration set |
| **Relationships** | The relationship export is **not empty** | Without it the foreign keys cannot be rebuilt in the target |
| **Arithmetic** | The reported total equals the **sum of the per-table counts** | The identity, which holds on any day. Not a comparison against 30,553, which would fail every run from here |
| **Complex columns** | Attachments **exactly 54** and multi-value entries **exactly 288** | Zero is the signature of the silent-failure export (D11) — but a floor of `> 0` passes a partial read, and 53 logos out of 54 is a lost logo. **Tightened from a floor to an exact match, ruled by the firm 23 August 2026.** These do not drift the way rows do: if the firm adds a client logo or a fee letter, the gate fails until the figure is changed here deliberately, with the reason. That is intended — a logo appearing is something the firm should confirm, not something a gate should wave through |
| **No warnings** | The script exits non-zero on **any** warning | A complex-column read that throws is a warning, and a warning in a lossless extraction is a failure. An attachment that writes **0 bytes** is also a warning: an empty logo is a lost logo, and it passes every count-based check |
| **Shape** | Each count reported beside its 19 August figure and the difference shown | For a human to eyeball: 13,279 → 13,4xx is drift; 13,279 → 412 is a broken read |

**Drift is expected and is reported, not refused.** A count that has *fallen*
below its August figure is not automatically a stop, but it is the opposite of
drift and must be put in front of the firm rather than passed over — the file
grows, it does not shrink.

**How that is built.** A fallen count is a **concern**, not a failure. Gate 1
separates the two and prints them apart: a *failure* means the extraction is
wrong, a *concern* means the extraction looks intact but a count moved in a
direction the firm should see. Both block Stage B — "put in front of the firm"
means the run does not go green and nobody has to notice a line of yellow text
— but they say different things, and conflating them would have the firm
debugging a script when the question is about their data.

A count that has **doubled or more** is also a concern, for the same reason in
the other direction: at about 100 records a day across the whole file, a table
twice its August size is not four days of drift either. The threshold only
applies once the absolute change exceeds 250 rows, so a 3-row team table
gaining a member does not shout.

**The 30,553 total moves with the data.** It is the sum of what was extracted on
the day, and Gate 4 reconciles against **that** sum — not against 30,553. See
"Which row count is the target?" above and Gate 4 below. Writing 30,553 into
Gate 4 as a constant would fail every run from now on, for the same reason.

> **Task 2.1 must change the script before it runs.**
> `scripts/01_extract_access.ps1` today hard-asserts the 19 August counts and
> exits non-zero on any mismatch. Under this ruling that refuses a legitimate
> extraction. The August figures become a reported comparison; the five
> conditions in the table above become the gate.

**The gate is asserted by the script, not printed for a human to compare.** It
once printed the expected values and a note saying "if attachments = 0 the
extraction failed silently", which is advice, not a gate: nobody reads the
twelfth line of a run that says it succeeded.

If the 19 August reference figures are ever restated — because the firm has
re-baselined, not because the data drifted — change them deliberately, in the
same commit as the reason.

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

#### A fold justified by one column applies to all of them

The `J → ق` fold was reasoned about only in the case-year suffix, where `140J`
and `140ق` genuinely are the same thing. It was then applied by
`ar_normalise()` to **every searchable field in the system**, including client
names — so the real client **JTI** normalised to `قTI` and searches for them
returned wrong results from the day task 1.6 shipped.

The reasoning was sound and the scope was not. **Before adding a fold, name
every column it will touch and ask whether it is still true there.** A rule
justified by case numbers has to survive client names, matter subjects and
people's names, because the normaliser does not know which column it is
looking at.

The firm removed the fold entirely on 23 August 2026 rather than restricting
it to a case-number context: the risk of corrupting a client name outweighs
the convenience, and a conditional fold would have been one more thing to get
wrong. `db:check` now asserts `JTI` survives as `jti` **and** that `140J` does
not equal `140ق`, so reinstating it fails loudly instead of looking like a
missing feature restored.

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
| `lookup_court` | "309 courts" | 308. The 309th was `هيئة الاستثمار`, a spelling of another court that a seed generator had taken into the list |

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

**And the wrong count is not always somebody else's.** The 309 came from a
generator in this repository, which had built the court list from the reviewed
file and added one entry too many. The firm's review was consistent throughout.
Counting the items rather than trusting the total is what found it — and the
habit is worth as much when the total is your own.

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

### Two strings that print identically are not thereby equal

**Comparing what you see is not comparing what is there.** This is the same
family as the two entries above — something unreadable treated as something
readable — and it is the third instance.

The loader at task 2.3 refused to run, saying the CSV header did not match the
staging table, and printed both:

```
file   : ID_Task | تاريخ التنفيذ | ... | آخر موعد | matterID
staging: ID_Task | تاريخ التنفيذ | ... | آخر موعد | matterID
```

Fifteen names against fifteen names, character for character on the screen,
and not equal. The scanner had no branch for the CR of a CRLF outside quotes,
so it was appending it to **the last field of every record**. The header's
`matterID` was `matterID\r`, and so was every `matterID` in 1,730 matters.

**What would have happened without the check.** Nothing visible. The load
succeeds — the column is `text` and a carriage return is a perfectly good
character. Every row count matches. Gate 2 goes green. Weeks later, at
transform, `الجلسات.matterID` is joined to `الدعاوى.matterID` and matches
**nothing**, because one side carries an invisible character and the other
does not. The symptom appears three stages from the cause, in a join, which is
the hardest place in a migration to work backwards from.

The general rule:

1. **Diff bytes, not renderings.** When two values that must be equal are not,
   print them so the difference can be seen — `JSON.stringify`, a hex dump,
   character codes, lengths. The loader now prints each name JSON-quoted, so
   `"matterID\r"` reads as what it is.
2. **Compare structure to structure, at the boundary.** The check that caught
   this was not clever. It compared the CSV header to the staging table's
   columns before loading a single row, because "staging is directly
   comparable to the source" is a claim worth testing rather than assuming.
   Both sides came from the same extraction, so any difference at all meant
   something was wrong in between.
3. **Invisible characters are a class, not an accident.** CR, BOM, zero-width
   joiners, non-breaking spaces, and the Arabic presentation forms. Any of
   them can ride along in a value that looks correct in every report.

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

### A test must fail when it is REMOVED, not only when it is wrong

**Break every proof twice: once by making it wrong, once by deleting it.**
Both must fail. This applies to every proof script in the project, not only
the one that found it.

Task 2.2's proof of the NULL / empty-string distinction was broken both ways
on 23 August 2026:

| Broken on purpose | What happened |
|---|---|
| the assertion changed to expect `''` where `NULL` is correct | `ERROR: a bare empty field did not arrive as NULL` — psql exit **3** |
| the assertions **deleted entirely** | psql exit **0** |

The second one is the reason this section exists. A test with its assertions
removed does nothing, prints nothing alarming, and **reports success**. It
sits in `package.json` looking like coverage, and every run is green because
every run is empty. That is worse than having no test: a missing test is a
known gap, and a hollow one is a false assurance.

`ON_ERROR_STOP=1` makes a *failed* assertion fatal. **Nothing but counting
makes an *absent* one fatal.** So each proof emits a notice per assertion —
`RAISE NOTICE 'PROVED: …'` — and the script that runs it **counts them and
fails on the wrong number**, whatever the exit code said.

This is the same shape as the rule above it: an assertion that runs once is a
snapshot, and an assertion that has stopped running is not an assertion at
all. Neither is visible from the outside; both need something counting.

### A column can be a report setting rather than a fact

**Some columns describe the record. Some describe what the software should do
with the record. No amount of correlating a column against other columns will
tell you which kind you are holding.**

`جرد` on the powers of attorney sat unresolved through **three rounds of
analysis**. 1 on 680 rows, 0 on 55 — a clean, confident-looking split. It was
compared against `عدد النسخ` (copies in the safe), against the issuing
authority, against the dates. It contradicted every one of them in every
direction, which read as noisy data.

It was not noisy data. **It is a checkbox that controls whether the record
appears on the POA list report.** The firm's litigation assistant said so in
one sentence on 23 August 2026, and every correlation had been against the
wrong kind of thing: a report setting has no reason to agree with anything
about the record, because it is not about the record.

Two consequences worth keeping:

**Ask the person who uses the screen, earlier.** The analysis could not have
produced this answer, however many rounds it ran. The evidence for it does not
live in the data at all — it lives in a report nobody had opened.

**Name the column for what it does, not for what it is called.** `جرد` is
migrated as `show_on_poa_report`, with `جرد` recorded as its Access source.
Translating it literally as `inventory` would have carried a wrong guess into
the schema and made the report's behaviour look like a bug.

### The throwaway cluster we deliberately did not build

**Do not add a service-selecting override to `scripts/db-reset.ts`.** It has
been considered and declined, so that nobody builds it later as an obvious
improvement.

The guard suite gained its own throwaway **database** at task 2.3, which got
its cases running again after they had been blocked since task 1.1. One case
still cannot be fully proved: the one showing the guard **allows** a
legitimate reset. The guard protects the **volume**, not a database —
`docker compose down -v` destroys every database in it at once — so it
enumerates all of them and refuses if any holds rows. On a machine holding the
project data it must refuse, and it should.

Fully proving that case needs a throwaway **cluster**: a second compose service
with its own volume, and `db-reset.ts` able to be pointed at it.

**The firm's ruling, 23 August 2026: do not build it.**

> `db-reset.ts` is the single thing standing between a mistyped command and
> 30,885 staged rows. Adding a redirection flag to it in order to satisfy a
> test puts a bypass into the most safety-critical script in the project — and
> the bypass would exist permanently, to serve a test that runs occasionally.
> **A guard with a bypass is not a guard.**

The reduced case proves what actually matters: the guard passed all six
earlier checks and refused **only** because the volume is not empty. That
catches a guard that refuses everything, which is the realistic failure mode.
The suite reports **"9 fully proved, 1 reduced"** rather than "all correct",
because an honest partial beats a green light that means less than it appears
to.

**From Stage 2 onward the guard MUST refuse on any machine holding the
extraction.** That is rule 14 working, not an obstacle to route around. If it
ever stops refusing, something is wrong with the guard, not with the rule.

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

| Issue | Expected (19 Aug) | Found (23 Aug) | Handling |
|---|---:|---:|---|
| Matters whose `[خطاب الأتعاب]` matches no fee letter | 289 of 412 | **0 of 412** | See below — the expectation was measured against the wrong column |
| `خطابات الأتعاب.Matter` entries matching no matter | of 288 | **32 of 288** | Same fault. Load, link null, queue |
| `خطابات الأتعاب.Matter` entries matching *two* matters | — | **1** | Queue. A count of matches is not a match |
| Orphan task actions | 36 | **36** | Load, link null, queue |
| Task actions with no parent id | 39 | **39** | Load, link null |
| Hearings with no matter | 4 | **4** | Load to unassigned bucket |
| Matters with no client | — | **1** | Queue |
| Admin tasks with no matter | — | **1** | Queue |
| POA with no client | 1 | **1** | Same |
| Attendee spellings not in the roster | ~474 | **663** of 705, over 5,346 mentions | Queue for human review |
| Admin-task assignees not in the roster | — | **4** | Queue |

### Two expected volumes were measured against the wrong column

**Both were large, and both are small. Recorded rather than quietly
corrected, because the same mistake is easy to make again.**

**`الدعاوى.[خطاب الأتعاب]` — expected 289 orphans of 412, found none.**

The column carries **two key spaces**. Every one of the 412 matters that names
a fee letter resolves to exactly one:

| Resolves against | Range | Matters |
|---|---|---:|
| `contractID` — the dense internal key | 1 – 332 | **289** |
| `mfilesID` — the document-management id | 1 – 59,225 | **123** |
| both | | **0** |
| neither | | **0** |

The 289 in the original expectation is not a count of orphans at all: it is the
289 that resolve by `contractID`, counted as failures because only `mfilesID`
was tried. **123 + 289 = 412 exactly.**

There is no orphan problem here. There is a **latent ambiguity**: two values
exist in both key spaces, so a future matter naming one of them could not be
resolved without asking. Those two fee letters are flagged as notes; the
reading itself goes to the firm as **one question**, not 412 rows of review.

**`خطابات الأتعاب.Matter` — expected 288 orphans, found 32.**

The multi-value entries hold **case numbers as text** — `2897 / 86ق`,
`644 / 2012` — which resolve against `الدعاوى.matterAR`, the Arabic case
number, and not against `matterID`, which is a surrogate integer. Matched
against `matterID` all 288 look like orphans; matched against `matterAR`,
**256 resolve** and 32 do not. Most of the 32 hold several case numbers in one
entry, separated by newlines or by an Arabic comma:

```
5188 / 2011 -
267 / 2015 -
789 / 19ق -
45317 / 73ق
```

**The lesson is the same both times.** A join that fails for *every* row is
evidence about the join, not about the data. 100% is not a data-quality
figure; it is the shape of a wrong column. A join that fails for 7% is a data
problem worth queueing.

### Gate 3 — built at task 2.4, 23 August 2026

**Every staged row is in exactly one of three states.** A row in no state is a
failure; a row in two is a failure, because *deliberately excluded* and
*queued for review* are different answers to the same question and the
transform would have to pick one.

```
25,755 clean          nothing was found against it
 5,472 quarantined    at least one finding, recording what deviated and why
     0 excluded       deliberately not migrated, with the reason recorded
------
31,227 staged
```

Five proofs, counted rather than assumed: every finding and exclusion names a
staged row that exists; no row is in two states; the three states account for
every staged row; every finding carries an explanation in the firm's terms;
and no answer the firm has already given was discarded.

**The quarantine schema is three tables.**

| Table | Holds |
|---|---|
| `quarantine.finding` | One deviation, against one staged row, with the **original text**. `original_value` is nullable on purpose — for many findings the deviation *is* that the value is null, and writing `''` there would be a lie about the source |
| `quarantine.exclusion` | A row deliberately not migrated, with the reason **and the person who decided**. Empty is the normal state |
| `quarantine.review_value` | One row per distinct value needing a human answer, with the context to answer it without opening Access |

**A finding is about a row; a review value is about a value.** Nobody can
answer `م. أحمد` 47 times — they answer it once, and the 47 hearings carrying
it are each quarantined by their own finding.

**`npm run profile:staging` is safe to re-run.** Findings are derived and
rebuilt from scratch; review values are upserted so the firm's answers are
never touched. A value that has been answered and no longer appears in the
data is **kept and reported**, never deleted.

**And a trigger enforces that.** The profiler `TRUNCATE`s the findings table,
which would discard an answer written against a row-level question. There are
no answers yet, so it cannot happen today — but before the first answered
workbook comes back the profiler must switch to upserting, and a comment would
not survive that long. `finding_truncate_guard` refuses the truncate the moment
any answer exists. **A migration that refuses is a migration somebody reads.**

### Gate 3 ships as XLSX workbooks, one sheet per topic — ruled 23 August 2026

**Not a flat list.** The firm answers this, and a bare list of ~474 attendee
names is unanswerable: nobody can identify `م. أحمد` from the string alone.
Every row therefore carries the context needed to decide it **without opening
Access**, because the whole point of the gate is that the firm can work through
it at their own desk.

One sheet per topic — attendee names, unmatched fee letters, orphan task
actions, branch/category conflicts, and so on. Each row of the attendee sheet:

| Column | Content |
|---|---|
| occurrence count | how many rows carry this exact spelling |
| years | the range of years it appears in |
| matters | which matters |
| clients | which clients |
| nearest roster matches | the closest names in `person_name_alias`, each with a closeness score |
| three columns for the firm | their answer |

**Colour-coded by confidence**, so a near-certain match is confirmed in a
glance and the genuinely ambiguous rows get the time they deserve.

**Answered with a long-serving colleague present.** Most of this is
institutional memory — who `م. أحمد` was in 2013 is not written down anywhere
in the file.

**Anything neither of them recognises is marked "unknown person" — never
guessed.** `CLAUDE.md` rule 4 and rule 15 both land here: a guessed name
attaches one person's historical work to another, and that is precisely the
failure a missing hamza already caused twice in this project. "Unknown person"
is a correct, permanent answer. It is not a gap to be filled in later by
inference.

Write the workbooks with ExcelJS and `rightToLeft` set on every sheet, the same
as the reporting engine at task 6.1.

#### What was built — `npm run review:workbook`

One workbook, seven sheets, into `_migration/review/` — which is gitignored,
because every row of it is client data.

| Sheet | Rows | Asks |
|---|---:|---|
| اقرأ أولاً | — | How to answer, in Arabic, including that "unknown person" is a correct final answer |
| الحاضرون بالجلسات | 663 | Who is this attendee spelling? |
| إجراءات بلا مهمة | 36 | A task action whose parent task does not exist |
| خطابات الأتعاب | 33 | A fee letter naming a case number that matches no matter, or two |
| صفوف بلا رابط | 7 | A hearing, matter, POA or task with nothing to attach it to |
| القائم بالعمل | 4 | Who did this administrative work? |
| أسئلة عامة | 1 | The two-key-space question above |

**Colour is evidence, not decoration.** The confidence column is computed from
trigram similarity against `person_name_alias`, so a green row is green for a
stated reason and a grey row is one the machine has nothing to say about.

**Every row carries its database id in the first column**, and the answers will
be read back by that id — never by matching the Arabic text. Matching Arabic
back is exactly the fragile thing this project keeps getting wrong.

**The workbook is read back and verified after it is written**, the same round
trip as the loader: sheet count, row counts, `rightToLeft` on every sheet, and
every review id present in the file. Proved to catch a failure on 23 August
2026 by writing the sheets left-to-right — six sheets reported, exit 1.

**`**` is one question, not 4,132.** Two asterisks appear in the attendee
fields of 4,132 hearings. It is plainly a placeholder rather than a name, so
it is classified as one, recorded as a `note` against each hearing, and asked
about **once**. Quarantining 4,132 rows for review would have buried the 544
real questions underneath them.

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

**Reconcile against the extraction, not against the constants in this file.**
Every figure below was measured on 19 August 2026 and the file drifts about 100
records a day, so each is a *shape check* — near enough proves the right query,
exactly equal proves nothing on a file that has moved. The **pass condition is
that the new system agrees with the copy that was actually extracted**, table
for table and total for total. The August figures are printed beside the
measured ones so a wrong join still stands out.

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
T-8d   ANNOUNCE the date to the whole firm. A week's notice, not a surprise.
T-7d   Second dry run. KHALED HELMY SIGNS OFF, BY NAME.
T-1d   Final compact + backup. SHA-256 recorded.
T-0    A NORMAL WORKING DAY, set aside in full. FREEZE Access (read-only for
       everyone). Run A–E. Gate 4 must pass.
T+0    Go live. Access stays IMMEDIATELY available, read-only.
T+90d  The .accdb moves to cold storage. KEPT INDEFINITELY. NEVER DELETED.
```

**Two things in that timetable are decisions, not scheduling.**

**Sign-off is one named person.** "The firm signs off" is nobody signing off.
**Khaled Helmy** signs off at T-7, by name, so it is unambiguous afterwards
whose decision it was to go.

**The `.accdb` is retained indefinitely.** The 90 days is how long it stays
*immediately available* — after that it moves to cold storage, which is slower
to reach and is not the same thing as gone. A matter can sit in court for
years, and that file is the only pre-migration record of **1,223 closed
matters**. There is no date on which it is deleted, and no step in this plan
deletes it.

**Access bloat — resolved 23 August 2026, kept here as history.** The
production file had reached exactly 2,147,483,648 bytes — Access's hard limit —
while holding 35,343 rows, and compacted to 45 MB. 97.8% of it was wasted space,
and a file at its ceiling can refuse to save new records.

The firm compacted and repaired **both** the production file and the rehearsal
copy on 23 August 2026. The rehearsal copy taken afterwards is 46,661,632 bytes,
which is consistent with the right file having been compacted. **This is no
longer a risk to daily work**, and no step in this plan depends on it.

It stays in the record because it is evidence, not a task: a store that grew
fifty-fold in wasted space with no warning, until it was one save away from
refusing new records, is one of the reasons for this migration.
