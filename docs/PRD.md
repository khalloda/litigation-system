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
self-administrative reset. Staff identity maintenance belongs to the separate
Task 4.0a; Task 3.4 never creates or edits a person or alias.

### Staff roster — Task 4.0a complete and published

Migration 61 implements the database portions below and has been deployed
exactly once to the project PostgreSQL database. At its 7 September acceptance it had
61 applied migrations, zero pending and zero unfinished. `db:verify` passed
15/15 and the `historical-full-state-upgrade` profile passed 107/107 invariants.
Task 4.0a is locally complete; Phase 1 is operationally complete.
Phase 2 supplies the read-only `/staff` and `/staff/[id]` pages,
independent server guards, Arabic alias search, filters and distinct paging.
Phase 3 supplies guarded `/staff/new` and `/staff/[id]/edit` pages and nine
Administrator actions for creation, ordinary editing, canonical rename, native
alias add/retire/restore, deactivate/reactivate and reviewer assignment. Existing
migration-61 gateways enforce identity, concurrency, audit and account safety.
No schema change was needed. Phase 4 completes keyboard, accessibility-tree,
genuine browser zoom, reflow, visual and regression acceptance. The next return
point is **independent Task 4.1a implementation review**. Task 4.1 publication
review is closed. Task 4.1 Phase 3 is accepted and published at `9f61ba481fbebdb2b0d54e470e43cd8d26014265`.
The D52–D57 database foundation is now deployed and operationally
complete at migration 62, with 15/15 checks and 116/116 historical invariants.
Task 4.1 overall and Phases 1–4 remain accepted and checked. Task 4.1a is locally
verified and checked, pending independent review, owner acceptance and separate
migration-63 deployment. Project PostgreSQL remains unchanged at 62 applied
migrations. The [logo report](task-reports/2026-09-10-task-4-1a-client-logos.md)
records preview/save, replacement, resizing, retained-version recovery and the
unchanged role matrix.
The Litigation Department continues using Access;
final cutover remains governed by D43 and D51. See the
[Phase 1 implementation report](task-reports/2026-09-06-task-4-0a-phase-1-database-boundary.md)
and [migration-61 deployment report](task-reports/2026-09-07-task-4-0a-phase-1-migration-61-deployment.md).
The [Phase 2 report](task-reports/2026-09-08-task-4-0a-phase-2-read-only-staff-roster.md)
records the read-only query, authorization, database-preservation and browser evidence.
The [Phase 3 report](task-reports/2026-09-08-task-4-0a-phase-3-administrator-staff-mutations.md)
records mutation and regression acceptance, including the legacy audit-fixture limitation.
The [Phase 4 report](task-reports/2026-09-08-task-4-0a-phase-4-staff-roster-completion.md)
records final acceptance, then-current migration-61 audit and separate event proof,
project preservation and the explicit limitation that screen-reader speech was
not tested.

Task 4.0a covers the 66 internal staff identities now in PostgreSQL: 23 active
and 43 inactive. The 71 external people stay available to historical legal
relationships but never appear as staff. All four application roles may view
the roster and a staff detail; only an Administrator may create or edit a staff
identity, maintain application-created aliases, assign the two fixed teams and
their reviewers, or deactivate/reactivate a person. No staff record is
physically deleted.

The roster defaults to active staff and provides active/former/all,
team/unassigned and trainee filters. Arabic search covers the canonical name,
every imported alias and each active application-created alias, using the
approved hamza/diacritic normalization and never a Latin `J` to Arabic `ق`
substitution. Retired application aliases remain evidence but leave ordinary
active search. A result matched through an alias says so. Paging is
deterministic and returns each person once.

A controlled canonical Arabic rename preserves the same person identity and
adds the former canonical spelling as an alias. The stable internal
`people.id` is mandatory for identity, URLs, authorization, mutations,
relationships, auditing, concurrency control and D43 reconciliation; a
submitted name is never a mutation identity. Imported aliases are immutable
migration evidence. Application-created aliases may be retired or restored
only with a reason, an audit event and collision checks, and a current primary
alias of either provenance cannot be retired directly. At transaction
completion every person, including each external person outside the editing
interface, has exactly one active primary alias matching the current canonical
Arabic name; Task 4.0a does not mutate an external person merely to enforce or
test that invariant. New staff require a sufficiently complete official Arabic
name. Task 4.0a refuses an invented number or other artificial suffix in the
displayed name and introduces no new owner-managed or business-facing staff
number; it does not replace the mandatory internal `people.id`. If two real
people have exactly the same full official Arabic name, creation stops for a
new owner decision rather than inventing a discriminator.

Every current non-null person email remains unique. Accepted email is trimmed
of surrounding whitespace and normalized for case, with uniqueness of the
normalized non-null value enforced at the database boundary so concurrent
duplicates are rejected. Task 4.0a must not weaken or remove the existing
unique constraint. Supporting shared addresses requires a future owner
decision.

Person and login lifecycles remain separate but coordinated. Deactivating a
person atomically disables any linked account and invalidates its sessions;
reactivating the person never re-enables that account. Account reactivation,
password and role work remain exclusively in `/users`. An Administrator may see
account existence/status and follow a link there from the staff detail, but the
staff routes contain no account-management controls. Reviewer eligibility,
reassignment and last-usable-Administrator protection are enforced at the
database and server boundaries. See D44–D50.

The route contract is `/staff`, `/staff/new`, `/staff/[id]` and
`/staff/[id]/edit`. It is Arabic-first and RTL, uses centralized strings and
logical CSS properties, and must pass the D50 local browser checks for keyboard,
focus, labels, errors, status announcements, colour independence, target size,
zoom/reflow and mobile/desktop layout. Browser mutations use only an isolated
disposable database; project data does not leave the machine.

### Clients and contacts — Task 4.1 accepted

D52–D57 approve client/contact list, detail, authorized create/edit and
Administrator-only archive/restore, plus existing-logo display and the
client-name fallback. Upload/replacement/resizing/recoverable logo removal
remain Task 4.1a. Phase 1 implements database enforcement, proved in isolation
and deployed under separate owner authorization on 9 September 2026. At that
acceptance PostgreSQL had 62 applied migrations, zero pending or unfinished;
Phase 2 implements read-only client/contact screens and existing-logo display. See the
[deployment acceptance report](task-reports/2026-09-09-task-4-1-phase-1-migration-62-deployment.md).
Phase 3 application mutations passed [independent review](reviews/2026-09-10-task-4-1-phase-3-independent-review.md)
and were accepted by Khaled Helmy on 10 September 2026 at
`77baf2af2d079457f28ce1632f68e3f411cbdc48`, then published through
`9f61ba481fbebdb2b0d54e470e43cd8d26014265`. Phase 4's separately authorized final
verification passed independent review. Khaled Helmy accepted Phase 4 and
Task 4.1 overall on 10 September 2026 at
`d4eed39612cf16b3a44808e056a21857642dc167`; [TASKS.md](../TASKS.md) owns phase status;
the [dated readiness review](reviews/2026-09-08-task-4-1-clients-readiness-review.md)
separates findings from later owner resolutions.

List search covers normalized client/contact names and retained English client
names, with contact-match disclosure and deterministic, distinct 25-row pages.
Use separate business-status and archive filters. Client fields are display
name, retained English name, full name, classification/status, POA/document
locations, start/end dates and optional main contact. Contacts retain primary
name, secondary full name, job/contact/address details; `home_phone` remains
preserved but unsurfaced. Use server validation, keep multiline values, and
provide loading, empty/no-contact, not-found, forbidden, validation/stale and
recoverable-error states. Do not invent data to fill an empty state.

Client archive is non-cascading: exclude archived clients from ordinary lists
and new selections, but all four viewing roles can find clearly labelled,
read-only archived details through an explicit filter. Preserve related
matters, billing, contacts, logos and main-contact selection. Existing matters
stay accessible and in reports. Preserve each contact's individual archive
state; restoring the parent does not restore separately archived contacts.
Require parent restoration before any contact create/edit/archive/restore.
Show related-record counts before Administrator archive/restore confirmation.
Business status is independent of archival.

Main contact is optional, belongs to that same client and is not archived.
Require explicit clear/replacement before archiving the selected contact; never
select a replacement automatically. Contact moves and ownership changes through
ordinary edits are outside scope. New contacts require a name; preserve the
six imported unnamed contacts and permit unrelated edits. Display the firm's
responsible-lawyer source text separately as historical information; editable
staff assignment and source-to-staff mapping are deferred.

`Cash` means fee-paying regardless of payment method. Use the exact approved
[Arabic labels](GLOSSARY.md#client-classification--approved-task-41-labels).
`Probono`/`probono` share one operational choice while historical spellings
remain exact. Unrelated/no-op saves must not normalize values, and blanks
remain unchanged without a deliberate edit. Preserve duplicate client
identities, use PostgreSQL IDs for mutations/relationships and retain Access
IDs as historical identities. Branches remain on matters and D39's main Sigma
rename restriction remains binding. Native records receive no invented Access
IDs. Stale saves and repeated creation submissions require distinct safeguards;
audit failure must roll back the business change.

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

### Task 4.1 Phase 2 implementation — 9 September 2026

Read-only `/clients`, `/clients/[id]` and `/clients/[id]/contacts/[contactId]`
are implemented for all four roles, with independently guarded read services
and logo GET/HEAD. Search includes Arabic, full/English client names and contact
names, with contact-match disclosure, distinct 25-row pages and separate status/archive
filters. Historical identities, unnamed contacts, main contacts, lawyer text and
date-only values remain explicit. Existing logos use bounded validated local reads
and a client-name fallback. No mutation controls, schema or migration changes.

Khaled Helmy accepted Phase 2 on 9 September 2026 after independent implementation
and correction review. R1/R2 are closed; see the [correction review](reviews/2026-09-09-task-4-1-phase-2-correction-independent-review.md)
and [dated acceptance addendum](task-reports/2026-09-09-task-4-1-phase-2-navigation-correction.md#acceptance-addendum--9-september-2026).
The historical acceptance checkpoint stopped for documentation review before
separately authorized publication. Phase 2 was subsequently published through
`82ca95c439e554bc8b55ffb3de0873827f8f3751`. D43/D51 final reconciliation remains separate.
See the [Phase 2 implementation and verification report](task-reports/2026-09-09-task-4-1-phase-2-read-only-clients.md)
for exact test, browser, query-plan and unchanged-project evidence.

### Task 4.1 Phase 3 implementation — 10 September 2026

The separately authorized Phase 3 adds client/contact create/edit and Administrator
archive/restore through the three existing migration-62 gateways. Pages, form reads,
actions and transactions independently enforce the four-role matrix and current
session eligibility. Forms preserve original versions and drafts, creation UUIDs,
legacy blanks/spellings, date-only values, Sigma names and immutable parentage.
Main contacts require explicit clear/replacement before archive; client archival
is non-cascading and parent restoration precedes every contact mutation.

Phase 3 is implemented and locally verified with isolated full-volume mutation,
concurrency, audit-failure and production-browser evidence. Its
[independent review](reviews/2026-09-10-task-4-1-phase-3-independent-review.md)
passed, and Khaled Helmy accepted Phase 3 on 10 September 2026 at
`77baf2af2d079457f28ce1632f68e3f411cbdc48`; see the [dated acceptance addendum](task-reports/2026-09-10-task-4-1-phase-3-client-contact-mutations.md#acceptance-addendum--10-september-2026).
Phase 3 and its acceptance documentation are published at
`9f61ba481fbebdb2b0d54e470e43cd8d26014265`; see the preserved
[publication review](reviews/2026-09-10-task-4-1-phase-3-publication-independent-review.md).
Its historical late acceptance matrix and untested speech limitations remain
unchanged. The separately authorized Phase 4 records a fresh
[pre-execution matrix](testing/task-4-1-phase4-acceptance-matrix.md) and
[verification report](task-reports/2026-09-10-task-4-1-phase-4-final-acceptance.md).
Phase 4 passed local service/query, real-volume read/logo, production browser,
static, preservation and cleanup verification, with precise reuse of unchanged
reviewed mutation/current-62 regressions. These are historical runtime results;
no runtime checks were repeated for that documentation-only acceptance record.
Independent review passed, and Khaled Helmy accepted Phase 4 and Task 4.1 overall
on 10 September 2026 at `d4eed39612cf16b3a44808e056a21857642dc167`.
See the preserved [independent review](reviews/2026-09-10-task-4-1-phase-4-independent-review.md),
[report acceptance addendum](task-reports/2026-09-10-task-4-1-phase-4-final-acceptance.md#owner-acceptance-addendum--10-september-2026)
and [matrix acceptance addendum](testing/task-4-1-phase4-acceptance-matrix.md#owner-acceptance-addendum--10-september-2026).
Older report/review wording, including the review's speech-testing alternative,
describes earlier checkpoints and does not override the owner's later instruction.

Actual screen-reader speech actions are excluded by the owner. Do not plan,
set up, run, observe, coordinate or request speech testing unless Khaled explicitly
reopens that scope. Historical speech remains untested, with no pending speech
follow-up or acceptance blocker; no unperformed test is marked passed and no full
accessibility conformance is claimed. Keyboard use, labels, focus, programmatic
status/error announcements, Arabic/RTL, zoom, reflow and existing implementation
remain required. This acceptance authorizes no application-code removal.

The current stop is independent Task 4.1a implementation review; Task 4.1
publication review is closed. Task 4.1 overall remains accepted and checked.
Task 4.1a is locally verified, pending review, owner acceptance and separate
deployment of candidate migration 63. Existing database/query proof
does not claim future matter/report UI or exports have been tested; their later
implementation under Tasks 4.2 and 6.2 must retain D52's archive-independent
visibility and complete its own screen/export integration checks.
