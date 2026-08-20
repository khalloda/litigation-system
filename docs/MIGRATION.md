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

Also: **54 attachments** and **288 multi-value entries**. If either is zero,
extraction failed silently — stop.

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
`legacy_category_raw`, `legacy_degree_raw`, `capacity_raw`. Even where 50
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
