# Decisions — addendum

Decisions D15 onward, made after the initial handover. Append these to
`docs/DECISIONS.md`. Same rule applies: **do not re-open them.**

---

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
