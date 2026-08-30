# Stage 2 — moving your records across

**For the firm to read before anything runs.** This is the stage where your
live records are involved for the first time, so it is worth checking the
shape of it now rather than afterwards.

No technical knowledge is needed to read this. If any part of it looks wrong,
say so — it is much cheaper to change now.

> **Approved by Khaled Helmy, 23 August 2026.** The firm read this document and
> returned five corrections; all five are applied here. Approval is recorded in
> the document itself so it is not asked for a second time.

---

## The one thing to know first

**We work on a copy. Your Access file is never written to, never changed, and
never deleted.**

Everything below happens to a copy taken on the day. The original stays where
it is, in daily use, until the very last step — and even then it is only made
read-only, not removed.

**The Access file is kept indefinitely. It is never deleted.** For **90 days**
after go-live it stays immediately available to everyone, read-only, so anything
can be checked against it on the spot. After that it moves to cold storage —
somewhere slower to reach, not somewhere it stops existing. A matter can be in
court for years, and that file is the only pre-migration record of your **1,223
closed matters**.

**No record is thrown away.** Not a single one. Where a value cannot be
understood — a lawyer's name spelled a way we have not seen, a court that is
not in the list, a payment with no invoice — the record is still brought
across. It is simply **set aside for you to look at**, with its original text
kept exactly as it was typed.

**One value is thrown away, and it is worth naming.** In the whole file there is
a single court entry that reads `/` — a placeholder somebody typed where a court
name should have gone. That row already records its real circuit, so nothing
about it is lost by dropping the `/`. The row itself is migrated in full, and
the `/` is still kept beside it in the original-text column, so even that is
recoverable. It is the only value in the migration that is deliberately
discarded, and the migration asserts that there is exactly one.

---

## The five steps, in order

### Step 1 — Take a copy and read it

A copy of the Access file is taken and read through, table by table. Nothing
is interpreted yet; this step only gets the data out.

Two kinds of thing need special care and are handled here:

- **The 54 client logos.** In Access these are not stored the way they look.
  A normal export produces a column that appears full for all 313 clients and
  actually contains nothing usable. They have to be read a different way, and
  the count of 54 is checked.
- **The 288 matter references on fee letters.** The same trap, the same
  handling.

### Step 2 — Put it somewhere we can look at it

Everything is loaded into a holding area, **exactly as it was typed** — dates
that are not really dates, numbers that are not really numbers, spelling
variations and all. Nothing is corrected at this point.

This matters: because nothing is converted yet, **no record can be rejected**
for being untidy. Everything gets in, and the untidiness is dealt with in the
next step where you can see it.

### Step 3 — Sort out what is unclear

Now the data is examined. Most of it maps straight across. Some of it does
not, and this is where those go to a review list for you.

We already know roughly what will be on that list:

> **Two of these figures were wrong, and we found out by running it.**
> Corrected 23 August 2026 — see the note directly below the table.

| What | We told you | Actually |
|---|---:|---:|
| Fee letters referring to a matter we cannot find | 289 | **32** |
| Matters referring to a fee letter we cannot find | 289 | **none** |
| Task steps whose parent task does not exist | 36 | **36** |
| Task steps with no parent recorded at all | 39 | **39** |
| Hearings not attached to any matter | 4 | **4** |
| A power of attorney with no client | 1 | **1** |
| A matter with no client | — | **1** |
| A task with no matter | — | **1** |
| Attendee names we cannot place | about 474 | **663** |
| Names of people who did admin work, that we cannot place | — | **4** |

#### The correction, and why it happened

**We told you to expect 289 broken fee-letter links. There are none.**

Your Access file records a fee letter against a matter using a reference
number — but that number is sometimes one kind of internal number and
sometimes another. We only ever checked it against one of the two. Every
matter that names a fee letter does in fact find it: 289 of them by one
number, 123 by the other, and not a single one that finds neither.

**We also implied all 288 fee-letter case references were unmatchable. 32
are.** Those references are case numbers as you write them — `2897 / 86ق` —
and we had been comparing them against an internal record number instead of
against the case number. Most of the 32 that still do not match are entries
holding several case numbers in one box.

**Nothing about your data changed. Our measurement was wrong**, in the same
way twice. The rule we have taken from it: when a check fails for *every
single row*, that is almost always evidence that the check is wrong, not that
the data is. Data is untidy in patches, not uniformly.

The practical effect is that **the review list is much shorter than we said**:
roughly 745 items instead of the ~1,000 implied, and none of the 289 you were
told to expect.

None of these is lost. Each one arrives, keeps its original text, and waits
for a decision.

### Step 4 — Build the real records

The cleaned, checked data is written into the new system: clients, matters,
hearings, and the rest — in that order, parents before children, so nothing
ever points at something that is not there yet.

**Every original value is kept beside the cleaned one.** If we record a
hearing's court as *القاهرة الاقتصادية*, the exact text someone typed is
stored next to it. That is what lets any decision be reversed later without
going back to Access.

### Step 5 — Go live

Access is frozen — made read-only for everyone — the whole process is run once
more on the final data, and the new system goes live. Access stays immediately
readable for 90 days, and is kept indefinitely after that.

---

## The four gates

A gate is a stop. If a gate does not pass, **the process halts and nothing
goes forward.** It is not a warning that someone might read; it stops.

Each one is deliberately broken during testing to prove it actually stops
things, because a check that has only ever seen good data is not known to
work.

### Gate 1 — after reading the file

**Proves: we read everything, and read it correctly.**

Every table is counted as it is read, and a fingerprint is taken of every file,
so we can prove later that what was written is exactly what was read and that
nothing changed in between.

**The figures from 19 August are a shape check, not the pass mark.** Your file
changes by roughly 100 records a day, so a rehearsal copy taken today will not
match a count taken in August — and it should not. What Gate 1 actually
requires is that all **15 tables** are there, that each one's count is close
enough to its August figure to show we are reading the right table, and that
what came out matches what went in, exactly. A number that has drifted is
expected. A table that is missing, or a count that does not match itself, is a
stop.

The two counts that are a hard pass mark: **54 logos** and **288 matter
references**. If either comes back as zero, the read has failed silently —
which is exactly what a normal export does — and everything stops.

### Gate 2 — after loading

**Proves: nothing was lost between reading and loading.**

The number of records in the holding area must equal the number read out of
Access. Not approximately. Exactly.

### Gate 3 — after sorting out what is unclear

**Proves: every single record is accounted for.**

Every row from Access is either mapped to a record in the new system or on the
review list. There is no third category, and nothing is unaccounted for.

**This is the gate that needs you.** The review list is the firm's to decide
on, and the work cannot finish without those decisions.

**You get it as Excel workbooks, one sheet per topic — not a flat list.** The
largest sheet is the **~474 attendee names**, and a bare list of names is
unanswerable: nobody can say who `م. أحمد` is with nothing around it. So every
row carries its own context, and you should never need to open Access to answer
one:

| Column | What it tells you |
|---|---|
| How many times | how many rows use this exact spelling |
| Years | the range of years it appears in |
| Matters | which matters it appears on |
| Clients | which clients those belong to |
| Nearest matches | the closest names on the roster, with how close each is |
| Three columns for you | your answer |

Rows are **colour-coded by confidence**, so the near-certain ones can be
confirmed quickly and the genuinely unclear ones get the time they need.

Answer it with a long-serving colleague present — much of this is institutional
memory rather than anything written down. **Anything neither of you recognises
is marked "unknown person". It is never guessed.**

### Gate 4 — after building the real records

**Proves: the new system says the same things as the old one.**

Counting is not enough — the wrong records in the right number would pass a
count. The following were the 19 August planning shape references; the final
current values are in the completed report. The gate also checks:

- **Matters per lawyer**, against the figures from Access:
  إيهاب حمدي 476 · ناجي رمضان 200 · هاني الدالي 181 · أحمد سعيد 129 ·
  محمد عبد العزيز 124 · أحمد إسماعيل 85 · محمود شعبان 41
- **Matters by status**: 493 active, 1,223 closed, 14 with none recorded
- **Total invoiced and total paid**, per currency
- **Hearings per year**, 2009 to 2026
- **All 54 logos**, checked byte for byte against the originals

And then the real test: **six independently implemented report-category
datasets are compared row by row** — one client report, one for/against, one
lawyer workload, one hearings by date, one administrative works, one
financial. The Access report/query definitions are inventoried, but the gate
does not execute parameter prompts or VBA.

That comparison is the only check that catches a mistake where the numbers all
add up and the content is wrong.

**Result — PASS, 30 August 2026.** The six report-category datasets matched
row for row, as did matter status, current lawyer relationships, billing by
currency, hearings by year and all 54 logos. The report is
`docs/reconciliations/2026-08-30-gate-4.md`. An identical read-only rerun
produced the same report digest.

---

## The number to expect at the end

Gate 4 measured the authoritative Access file at **35,638** current rows. The
older 35,343 figure was the 19 August planning snapshot.

| | |
|---:|---|
| **30,847** | rows in the 15 migration-source tables |
| **38** | reference-only rows, extracted but not turned into business records |
| **4,753** | archive-only rows — meetings and old copies |
| **35,638** | every row in the 27 Access user tables |

The exact operational difference is **4,791 not moved**: 38 reference-only +
4,753 archive-only. The extraction also has 342 complex values, so PostgreSQL
staging holds 30,885 parent rows + 342 complex values = **31,227**.

The final report shows all three figures on one page, so the difference is
visible and never rediscovered later as missing data.

---

## What we already know we will need to ask you

These are known now, so they will not be a surprise:

1. **Three client-branch values are actually separate clients.**
   `سيجما للإعلام (تليفزيون الحياة)`, `ألفا مصر للتجارة` and
   `سيجما للصناعات الدوائية`. Any matter carrying one of these is attached to
   the **wrong client**. Those matters will be set aside for you — we will not
   guess which client they belong to.

2. **Where a matter's branch says one thing and its practice area says
   another**, we will not overwrite what is already there. The conflict goes
   to you.

3. **Eleven matters would lose every lawyer** without the corrected
   membership you supplied for three combination rules. That correction is
   recorded and will be applied.

4. **About 474 attendee names appear only once each.** Some are real people
   spelled unusually; some are not names at all. Those need a human eye.

5. **`جرد` on powers of attorney** — ✅ **answered 23 August 2026.** Your
   litigation assistant told us: it is a checkbox that controls whether the
   record shows on the powers-of-attorney list report. Not a fact about the
   power of attorney, which is why three rounds of comparing it against the
   other columns got nowhere. It is carried across as a setting you can
   change, named for what it does.

---

## What the firm needs to do, and when

| When | What |
|---|---|
| ~~Now, urgently~~ | ✅ **Done, 23 August 2026 — compact and repair the Access file.** It had reached exactly 2 GB, the maximum Access allows, and compacted to 45 MB. A file at its ceiling can start refusing to save new records. You compacted both the live file and the copy. **No longer a risk**, and nothing below depends on it. Kept here because it is one of the reasons for moving off Access, not because anything is outstanding. |
| Before we start | ✅ Done — a copy is on the machine and Access 2021 is installed. Both were checked on 23 August 2026, not taken on trust |
| During Step 3 | Answer the review workbooks — the items above, plus whatever else turns up. Do this with a long-serving colleague present |
| 14 days before | Full practice run. Every gate passes, six reports compared |
| 8 days before | **Tell everyone the date.** The changeover is announced a week ahead so nobody plans around it badly |
| 7 days before | Second practice run. **Khaled Helmy signs off, by name.** Not "the firm" — one named person, so it is clear whose decision it was |
| The day | **A normal working day**, set aside in full. Access frozen, everything run once more, go live |
| For 90 days after | Access stays immediately available, read-only, so anything can be checked against it |
| After that | The Access file moves to cold storage and is **kept indefinitely**. It is never deleted |

---

## Two things worth saying plainly

**Your file changes about 100 records a day.** A practice run done on a copy
taken last week will not match the file today, and that is expected — it is
why there are two practice runs and why the final run happens on the day, with
Access frozen.

**Nothing goes live on a failed gate.** If Gate 4 disagrees with Access by a
single matter, that is a stop, not a note. The whole point of doing this in
stages is that we find out before you are relying on it, not after.
