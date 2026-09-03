# Product Requirements — Litigation Management System

## 1. The problem

Sarie Eldin & Partners runs its litigation practice on a Microsoft Access file
built around 2010. It works, but:

- **It had hit its size limit.** At the 19 August 2026 planning snapshot, the
  file reached exactly 2 GiB — the maximum Access allows — while holding
  35,343 rows, and compacted down to 45 MB. 97.8% was wasted space. A file at
  its limit can start refusing to save new records.
  **Compacted 23 August 2026**, live file and rehearsal copy both, so it is no
  longer a risk to daily work — but a store that bloats fifty-fold, silently,
  until it is one save away from refusing, is a reason to move off it.
- **There is no login.** Anyone who opens the file sees and can change
  everything, including billing. There is no record of who changed what.
- **One person at a time, in one office.** No remote access.
- **Data quality has drifted.** Lawyer names are stored as text, so one missing
  hamza (`احمد` instead of `أحمد`) silently detached 3 matters from their lawyer.

## 2. What the system must do

Replace the parts of the Access database that are actually in use — traced from
its Dashboard — as a web application the whole firm can use.

### In scope

The volumes below are the 19 August 2026 planning snapshot. The current
extraction and its transformed/quarantined reconciliation are recorded in
`TASKS.md`; these figures remain here as the dated basis of the requirements.

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

Task 3.4 implements Administrator-only account management for existing active
staff. An Administrator can see enabled and disabled accounts, create an
account for an eligible staff identity, correct a username, change a role,
disable access, reactivate with a new temporary password and issue a temporary
password reset. All actions are enforced from the validated server session and
there is no account deletion, self-disablement, self-demotion or
self-administrative reset. Staff roster and identity maintenance remain the
separate future Task 4.0a; Task 3.4 never creates or edits a person or alias.

### Audit and accountability

The old Access system cannot say who changed a record or reconstruct a sequence
of changes. The owner-approved replacement contract is therefore two layers,
both of which are implemented at the storage and server boundary:

1. **Secure actor attribution (Task 3.3A — implemented):** the exact 37 current four-column
   application tables plus `person_name_alias`; stable human/system actors;
   truthful historical attribution; database-enforced anti-spoofing; and a
   restricted non-superuser web database connection with no role-membership
   path, plus an isolated superuser used only for migrations/administration and
   never exposed to the production web process. Seven immutable actors
   distinguish the four accounts from migration, authentication and controlled
   administration activity. The exact four historical account-update actors
   remain unknown rather than fabricated.
2. **Append-only events (Task 3.3B — implemented):** 38-table row and
   relationship triggers record create/update/add/remove activity; current
   authentication records login success/failure/lockout and password-change
   facts; exhaustive per-column classification fails closed; and stable account
   targets resolve through the actor/account relationship. Atomic contracts are
   limited to database-reversible archive, restore and user/role lifecycle
   work. Later report, export and download events are server-observed facts;
   they do not make filesystem or network delivery atomic with PostgreSQL, and
   a download event cannot prove client receipt.

Ordinary record views, searches, list loading and navigation are not logged.
Passwords, hashes, tokens, cookies, credentials, keys, connection strings, raw
binaries and other secrets never enter the trail. Events include the effective
actor and role where available, IP address, bounded user-agent/device data,
request/correlation identity and a separate non-secret audit-session identity.
Unprovable historical events are not fabricated. Deployment records one
aggregate `audit_baseline_established` event with protected counts and digests.

Audit events are retained indefinitely with no automatic purge. Application
roles cannot update, delete or truncate them, and disabling an account or
archiving a record cannot erase history. All Administrators may eventually view
audit history; export requires a separate account capability initially held
only by `KHelmy`, without adding an Owner role or hard-coding a username.

The approved Arabic/RTL contextual history drawer and global Administrator
audit page are later UI work. They are not part of Task 3.3A or 3.3B. See
decisions D30–D35 and
[`VISUAL-DIRECTION.md`](VISUAL-DIRECTION.md).

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

**`J` IS NEVER FOLDED TO `ق`.** The fold was removed on 23 August 2026 by the
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

Client-facing reports carry the **client's own logo**. In the completed Stage 2
result, 54 of 318 clients have a migrated logo and **264 do not**; where none
exists, the client's name prints in text instead. The earlier planning snapshot
was 54 of 313, or 259 without a logo.

PDF must be produced by rendering HTML in headless Chromium (Playwright).
Most PDF libraries cannot shape Arabic letters or handle mixed
Arabic/Latin/number text, and produce disconnected reversed letterforms.

## 6. Success criteria

1. **All 30,847 migration-source rows accounted for**, as transformed,
   quarantined or covered by an explicit reviewed exclusion, with a report
   proving nothing was lost. The reconciliation report must also show the 38
   reference-only and 4,753 archive-only rows, so
   *30,847 + 38 + 4,753 = 35,638* and the difference is never rediscovered as a
   bug. See "Which row count is the target?" in `docs/MIGRATION.md`.
2. Six representative reports match the Access originals row for row
3. Arabic renders correctly on screen, in Excel and in PDF
4. The four roles are enforced on the server
5. Search finds records regardless of hamza, diacritics or numeral system
6. Usable with 13,000+ hearings without noticeable delay
7. Every future application write in the 38-table audit boundary has a truthful,
   non-spoofable actor or an explicitly permitted historical-unknown state
8. The approved chronological events are append-only, redacted, indefinitely
   retained and complete across row, authentication, report and export paths

## 7. Phases

**Phase 1** — clients, matters, hearings, administrative works, powers of
attorney, documents, fee letters, historical billing (read-only), the 45
reports, login and roles, secure actor attribution, append-only audit events and
the later approved audit-history UI.

**Phase 2** — attendance screens, invoicing and payment entry, collection
splitting.

**Phase 3 (possible)** — bilingual interface.
