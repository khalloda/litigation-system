# Product Requirements — Litigation Management System

## 1. The problem

Sarie Eldin & Partners runs its litigation practice on a Microsoft Access file
built around 2010. It works, but:

- **It has hit its size limit.** The file sits at exactly 2 GiB — the maximum
  Access allows — and compacts down to 45 MB. 97.8% was wasted space. A file at
  its limit can start refusing to save new records.
- **There is no login.** Anyone who opens the file sees and can change
  everything, including billing. There is no record of who changed what.
- **One person at a time, in one office.** No remote access.
- **Data quality has drifted.** Lawyer names are stored as text, so one missing
  hamza (`احمد` instead of `أحمد`) silently detached 3 matters from their lawyer.

## 2. What the system must do

Replace the parts of the Access database that are actually in use — traced from
its Dashboard — as a web application the whole firm can use.

### In scope

| Area | Volume |
|---|---|
| Clients and their contacts | 313 clients, 188 contacts |
| Matters (cases) | 1,730 |
| Hearings and decisions | 13,279 |
| Administrative works and their steps | 4,207 tasks, 4,130 steps |
| Powers of attorney | 735 |
| Documents register (paper tracking + M-Files reference) | 405 |
| Fee letters / engagement contracts | 331 |
| Invoices and payments — **historical, read-only** | 543 + 597 |
| Staff roster | 135 people (21 current) |
| Reports | 45 |

### Deferred — build the database now, the screens later

- **Staff attendance** (`Attendance`) — the firm runs this in Excel today
- **Invoicing and collection splitting** — also in Excel since Dec 2021

Their tables must exist in the first release with correct relationships, so
adding the screens later is not a database migration. See `docs/DECISIONS.md`.

### Out of scope

- **Meetings and meeting attendance** — dropped entirely by the firm
- **Document storage.** The system records *descriptions* of paper documents and
  where the hard copy is filed, plus an optional reference to the file in
  **M-Files**, the firm's existing document system. It does not store files.

## 3. Users

About 10 people, four roles. Full matrix in `docs/PERMISSIONS.md`.

- **Administrator** — everything, including users and the dropdown lists
- **Litigation Assistant** — day-to-day data entry for all matters
- **Lawyer** — view only
- **Paralegal** — view only, except administrative works which they update

## 4. Language

**Arabic only.** Right-to-left throughout, screens and printed reports.

English columns already in the data (client names 73% filled, matter names 38%)
are kept in the database for a possible future bilingual version, but no English
interface is built now. See `docs/BRAND.md` for how strings are organised so
this stays possible.

### Search must be Arabic-aware

Users type Arabic without hamza and without diacritics. A plain search fails on
**49% of client names** and **96% of matter subjects**.

Every searchable Arabic field needs a normalised shadow column: strip
diacritics and tatweel, fold `أ إ آ ٱ → ا`, `ة → ه`, `ى → ي`, `ؤ → و`, `ئ → ي`,
fold Arabic-Indic digits `٠-٩ → 0-9`, and lowercase Latin. The same function is
applied to the user's query.

**`J` IS NEVER FOLDED TO `ق`.** The fold was removed on 24 August 2026 by the
firm's ruling: `ar_normalise()` applied it to every field, so the real client
**JTI** normalised to `قTI` and searches for them returned wrong results. The
risk of corrupting a client name outweighs matching `140J` against `140ق`.
Both spellings stay findable by their own form. **Do not reinstate it as a
missing feature.**

*(This paragraph originally specified a `J ↔ ق` fold. It was implemented, found
to be wrong in practice, and removed. The specification is corrected here
rather than annotated, so that reading it does not reintroduce the fault.)*

## 5. Reports

45 reports must be reproduced, each exportable to **Excel** and **PDF**.
Full list in `docs/REPORTS.md`; house style and page layouts in
`docs/REPORT-LAYOUTS.md`. Reduced from 49 — see D17.

Client-facing reports carry the **client's own logo**. Where none exists —
259 of 313 clients — the client's name prints in text instead.

PDF must be produced by rendering HTML in headless Chromium (Playwright).
Most PDF libraries cannot shape Arabic letters or handle mixed
Arabic/Latin/number text, and produce disconnected reversed letterforms.

## 6. Success criteria

1. **All 30,553 rows migrated**, with a report proving nothing was lost.
   The reconciliation report must show *migrated + archived = 35,343*, so both
   numbers are visible and the difference is never rediscovered as a bug.
   See "Which row count is the target?" in `docs/MIGRATION.md`.
2. Six representative reports match the Access originals row for row
3. Arabic renders correctly on screen, in Excel and in PDF
4. The four roles are enforced on the server
5. Search finds records regardless of hamza, diacritics or numeral system
6. Usable with 13,279 hearings without noticeable delay

## 7. Phases

**Phase 1** — clients, matters, hearings, administrative works, powers of
attorney, documents, fee letters, historical billing (read-only), the 45
reports, login and roles.

**Phase 2** — attendance screens, invoicing and payment entry, collection
splitting.

**Phase 3 (possible)** — bilingual interface.
