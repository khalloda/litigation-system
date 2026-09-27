# Task 6.2 correction2 — selected reports and bounded source proposals

Reviewed local base: `6550a6bc0605b916c3f60daa9b797fba056f8882`.
Published base remains `1f0754bf0186d69cfcca3e82df888c54b22863fb`.
This is an implementation and repair-proposal candidate for independent review.
No owner repair, seed, migration, provisioning, sign-in, report generation,
activation/restart, acceptance closure or push occurs in this run.

## Finding disposition

T62-O1's independent code PASS is retained without amending its commit. It is
still not active on the owner app. Both relevant report modes use one hearing's
court/circuit/date/decision together; there is no fallback to matter court or
an older populated field.

T62-O2's source questions now have bounded evidence. The supplied review copy's
actual reports-subform Command55 opens `rptClientMatters1`, with empty filter and
WhereCondition. That is `client-matters`, distinct from `client-status`/Type4.
Linked-table inspection found none. A stable task copy and read-only DAO query
prove the current source result, without invoking the report button, startup
macros or changing Access security. An initial definition-import inspection
changed a task-owned copy; that side effect and its hashes are retained. A fresh
unchanged copy supplies the data proof. The original supplied file is preserved.

The same 38 source matters remain; all their fields match the retained extract.
Of 331 earlier hearings, 328 are unchanged and three contain explicitly listed
source-field changes. Two additional hearing records explain the two previously
missing PDF dates. They are new records, not corrections to older hearing dates.
The exact per-row comparison and raw values are in the protected review package.
No equivalence to the unavailable original PDF-generating snapshot is asserted.
File-byte stability does not establish transactional consistency of the original
departmental copy process.

## Current workflow

`client-status` and `client-matters` gain explicit All active and Selected for
report modes; the other seven definitions retain their behavior. All active
keeps latest-overall-before-period and the existing qualifications, with status's
optional all-status/lawyer filters. The reviewed client's comprehensive result
remains 38. Selected mode uses shared current saved choices, one deliberate
hearing per matter, with chosen-date filtering and saved/included/excluded counts.
No ID allowlist, fixed ten-row limit or automatic latest substitution exists.

An unfinished selected matter blocks generation before optional filters. The
client-matters variant also requires active status and a nonempty decision;
status preserves its own empty/null behavior. Undated choices are valid without
a date filter. Archived choices remain readable/exportable; archived matter or
hearing editing is refused. Changing client, mode or parameters invalidates
stale previews/downloads. Source import flags and ordinary hearing fields stay
immutable through this editor.

All four roles read/run/export. Administrator and Litigation Assistant save
under both existing matter and hearing update authority. The server and committing
database recheck fresh identity, exact membership, current versions and trusted
audit actor. Narrow runtime grants, atomic retained history and owned submission
receipts provide exact retry/no-op behavior and safe concurrent-edit refusal.
The page lists 25 matters/hearings at a time and keeps a saved off-page choice.
The form-labelling skill informed explicit labels, grouped choices and recovery
messages. Keyboard, focus, stale input, pagination and narrow-width tests passed.
A real browser found and verified the fix for a remount that erased save feedback.
Incomplete-selection responses now use a validation status rather than HTTP 500.

## Candidate schema and separate proposals

Candidate migration 74 creates three empty selection tables and the associated
constraints, gateway, audit registration and permanent checks. It has been applied
only to disposable restores. Owner schema remains 73; every existing migration
file and all TASKS/governance bytes remain exact. A quiet full-state upgrade proves
all previous catalog entries preserved, 138 unaffected old tables exact, all
48 sequences exact and only expected ledger/audit-registration additions. Both
pristine and upgraded windows pass 148 historical checks plus 15 setup checks.
New selection checks are inside the existing audit gate, not a fabricated 149th
headline check.

The nine capacity spellings and 29 party-side cells are individually accounted
for. The exact-value sheet proposes one alias to an existing capacity and eight
separate new capacity labels using attested wording without guessed gender or
merging distinct source spellings. They remain proposed until explicitly approved.
The independently executable approved repair set is empty. Exact proposal values
and source evidence are kept out of Git in the protected review delivery.

The source update proposal creates precisely two current hearing records through
the existing gateway with original import identities NULL. Their complete later
Access records and unmapped attendance markers survive in separate append-only
external-source receipt proposals. No fictitious attendee, frozen-source update,
global reimport or historical quarantine rewrite is performed. The review-only
receipt table is deliberately separate from candidate migration 74 and requires
its own reviewed operational treatment.

Two rolled-back rehearsals cover 29 party sides, eight proposed capacities, two
source-backed hearings and 31 provenance receipts, exact retry, stale/conflicting
preconditions, duplicate receipts and deferred constraints. All logical/catalog
changes roll back; sequence reservations are recorded without resets. A faithful
initial-selection proposal contains all 13 source matter flags: ten complete
choices and three drafts. The separate ten-complete-choice scenario explicitly
deselects the drafts only inside the test. It is not an approved owner seed.
The browser fixture separately uses the eight already mapped complete source
choices and native cases, without applying the two source additions permanently.

## Evidence and limits

Fresh evidence includes the corrected-button/query trace, full bounded source
reconciliation, quiet candidate upgrade, selection identity/concurrency/audit/
rollback tests, native zero/one/many, older/equal-date/undated/null/empty/archive
cases, 3,852 independent full-volume report comparisons, permission checks,
production builds and full source checks. Twenty genuine four-role previews and
40 saved XLSX/PDF files cover both definitions/modes plus native cases. Every
ordered typed XLSX cell is compared with an independently assembled relation
oracle; PDF fonts, bounds and expected character coverage are checked, with
representative actual-page visual inspection recorded separately. This is not
universal accessibility or screen-reader certification.

Failures remain visible: initial source-inventory registration omissions,
preliminary SQL diagnostic fixes, an explicitly superseded overlapping initial
fixture gate window, harness encoding/path issues, the editor feedback bug,
draft HTTP status, browser navigation/focus selector timing and one server-complete
but unsaved PDF. The latter's exact outcome was read before a bounded retry and
is not counted among the 40 saved files. A fixture credential test first hit the
last-Administrator and session-version guards; later tests use real Assistant
account lifecycle services in rolled-back transactions, keeping those guards.

Unchanged correction1 literal court regression and protected recovery/dependency
material are reused only under recorded source/dependency identities. The new
source oracle, selection tests and affected browser/build checks are fresh.
Final owner read-only observations, exact audit-event accounting, protected-file
coverage, complete fixture accounting, exact disposable cleanup, Git objects and
forward/reverse source reconstruction are bound by the external five-file seal.
The receipt records final commit/tree and any remaining exact-value decision.
Independent implementation/proposal review remains pending. Any actual repair,
seed, migration, activation and publication needs a separate operational mandate.
Only after that review/operation comes UI refinement, then Task 6.3.
