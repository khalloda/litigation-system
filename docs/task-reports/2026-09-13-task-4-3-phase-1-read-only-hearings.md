# Task 4.3 Phase 1 — read-only hearings

Date: 13 September 2026. Status: implemented and locally verified; independent
Phase 1 review pending. Overall Task 4.3 remains unchecked and unaccepted.

## Authority and starting point

The owner's direct authorization adopted the bounded Phase 1 prompt and accepted
Task 4.2 publication PASS. The initial clean `main`, its upstream `origin/main`,
and the successful authorized narrow fetch all resolved to
`93fd304f80c96a01a4de8bdbad42129ff4704a40`, tree
`845c246bcbe53d8f27857c66954181dafea8e6fc`, zero ahead/behind, with no pending Git
operation or lock. The initial sandbox denied writing FETCH_HEAD; the supported
scoped permission route succeeded. There was no merge, reset or adoption of new history.

The supplied publication review is preserved byte-for-byte in
`docs/reviews/2026-09-13-task-4-2-publication-independent-review.md`: 6,894 bytes,
SHA-256 `663d40cd6b413be67396d30b848b693a7879b25d23b2d886d646c7cea5e93232`.
Other supplied reviews/context were evidence, not new instructions. This phase
makes one local implementation commit, subject `feat: add read-only hearing screens`,
with the named base as its sole parent. The external delivery receipt records the
resulting commit identity, measured statistics and final Git state.

## Delivered behavior

- `/hearings` loads 25 rows per server page, newest recorded hearing date first,
  NULL dates last, then unique hearing ID descending. Totals count hearings once.
  The list includes all four unassigned hearings and all 327 reviewed releases;
  retained original quarantine/source evidence is not displayed as pending work.
- Search uses existing Arabic normalization and parameterized literal matching
  across hearing decision/notes/circuit and linked case/client identifiers.
  Diacritics, hamza and Arabic digits follow existing normalization; Latin J is
  not folded to Arabic ق. Percent, underscore and backslash are literal search text.
- Filters cover explicit hearing/next-hearing date field and inclusive date range,
  matter/unassigned, client, court and recorded attendee. Relationship values are
  database IDs. Attendee filtering uses EXISTS and does not multiply rows.
- Detail keeps date-only text, separate court/destination/circuit, action,
  decision/outcome/notes, linked matter/client and exact historical attendees in
  recorded ordinal/ID order. Inactive staff remain visible; sentinel raw text is
  not reinterpreted as a person. Multiline content and mixed scripts are retained.
- Shell and matter links lead to the paged hearing view. Allowlisted local return
  links preserve hearing filters/page and originating matter state, including
  travel through the linked matter or client. Archived parents are labelled and
  remain readable; hearing visibility never inherits an implicit archive filter.
- Both pages first await `hearings/view`. Read services independently check role,
  expiration and current enabled account/person/session version in read-only,
  repeatable-read transactions. All four roles view. No hearing mutation route,
  action, input policy or audit-writing feature was added.
- Loading, validation focus, no matches, no stored hearings, not-found and retryable
  read failure use existing accessible components and Arabic strings. CSS uses
  logical properties, existing tokens and bundled fonts.

Stored `report`, `previous_decision`, `next_attendance_raw`, `short_decision`,
`client_notified`, original raw columns and provenance JSON/hashes are preserved
but not surfaced in this phase. In particular, the boolean report flag is not a
report document, destination is not court, and historical attendance text is not
the reconciled person relationship. No new legal interpretation was invented.

## Fresh service and performance evidence

`full-2/service-results.json` records all 13,382 exact IDs across 536 pages for each
role, including 534 NULL hearing dates, all four unassigned records and 327 releases.
The ordered ID digest is
`253c355b6988b6e23284ff6018067cc4f5d8405e60da2301078f5ce62e109f5c`.
Independent SQL checks search, literal wildcard characters, relationship/date
filters and combinations, counts, high-page clamping, malformed inputs, safe
returns and missing records. Twenty-six representative details compare scalar
fields and exact attendee IDs/order, including inactive and multiple attendees.
Ordinary reads preserve exact table content and sequence state.

Existing accepted archive gateways exercise nonempty matter 2697/client 43,
119 hearings, for all roles before/during/after each client/matter archive
combination. Exact detail/attendee content remains
`8bc00bdbca4edda10143ac41cc60354700ed7f8ddbfe2059d172cf7fa4e302ec`;
explicit date/client filters continue narrowing only as requested.

Fresh EXPLAIN ANALYZE on local disposable PostgreSQL 17.11, after full traversal
(warm, not a cold-start or deployment measurement), records:

| Read | Rows query ms | Count query ms |
| --- | ---: | ---: |
| Ordinary first page | 23.759 | 1.853 |
| Arabic search احمد | 231.166 | 217.797 |
| Unassigned matter | 0.135 | 0.026 |
| Client 242 | 4.300 | 4.865 |
| Attendee 3 | 9.434 | 4.651 |
| Next date 2020-01-01 through 2025-12-31 | 7.485 | 2.367 |

Representative detail SQL: 0.108 ms. Plans and buffers are in
`full-2/query-plans.json`. List service uses five SQL calls and detail four,
including SET TRANSACTION READ ONLY and current-session validation. There is no
query per returned hearing/attendee. Choices are bounded to 4,000 rows and
attendees to 1,000; current full-volume evidence fits these explicit limits.
These timings do not include browser rendering or guarantee production latency.
No schema/index change is justified by this local evidence.

## Browser and gates

`browser-3/browser-results.json` records the successful focused browser pass:
four roles, navigation and return context, explicit date filtering, four unassigned
hearings, all parent archive combinations, no matches/not-found/invalid-date alert
focus, keyboard focus, 320px reflow, genuine 200% browser zoom, loading status,
actual database read timeout and successful retry, plus disabled-account direct
page/service denial. Meaningful states passed axe; representative Arabic desktop,
narrow, archive, error and zoom screenshots were inspected. There were no remote
browser requests. `browser-3/service-reuse.json` proves unchanged application bytes
against the successful full-2 service traversal.

The complete `npm run check` passes type checking, lint, formatting, RTL structure
and rejecting fixtures, authorization inventory, audit/D35 boundaries and rejecting
fixtures, user management, staff/client source checks, gitignore and UTF-8 checks.
The dedicated `node --import tsx scripts/check-hearing-read-only.ts` passes its two
page classifications and nine rejecting fixtures. The existing audit checker
pins the exact new read-service closure and seven query call sites; other
exceptions and validator behavior are unchanged. The candidate production build
uses an independent mirror, generated Prisma outputs and installed Chromium.

`browser-3/permissions.log` passes the complete permission suite against the
restored candidate, including all 448 policy cells and the authoritative 70-entry
source inventory. `browser-3/invariants-final.log` passes all 125 final database
checks, retaining original reconciliation, D39–D41, relationship, audit, account,
client and matter protections. Cleanup and exact source comparison then passed.

## Isolation, preservation and evidence reuse

A matrix was saved outside Git before implementation/database tests; its original
bytes and identity remain in the package. The final matrix maps each requirement
to fresh, reused or explicitly unobserved evidence.

The actual development database was freshly observed at 63, with 109 tables,
48 complete sequences and 54 logos. Source connections and dump use forced
read-only mode. Each fixture has independently verified cluster ID, ownership
label, volume, network and loopback port; it is not another database inside the
actual cluster. Restore equality is established before initializing test actors.
Only unchanged accepted migrations 64/65 are applied to the isolated candidate.
Random passwords and Auth secret belong solely to those disposable resources.
No raw dump is written to disk.

Final `live-before.json` / `live-after.json` are exactly equal: all 109 table
content digests, 48 complete sequence values including log_cnt, catalog/roles/grants,
63/1/0 ledger, container configuration/mounts/networks, and 54 logo bytes/mtimes.
The 1,010 protected file records also compare exactly, including timestamps; the
package omits individual credential-file digests while retaining comparison results.
Each browser mirror checked all 35,003 shared dependency file metadata records.
Selected runtime/package byte identities are in `dependency-identity.json`.
Final read-only inventory confirms all six owned clusters and five app mirrors are
absent; wrapper checks prove owned ports reusable and pre-existing Docker resources
unchanged. No source database reset, migration, repair or role change occurred.

The owner app was already stopped at baseline: no listener on port 3000 and the
historically reported PID absent, confirmed by an elevated read-only process
check. It was not stopped or restarted by this task. The original migration-63
mirror, backup packages, earlier evidence, configuration and logo bytes remain
protected. D59 is **Owner-accepted risk — unchanged; not technically remediated**.
Existing password values/hashes and ignored environment contents are not included
in the new evidence package.

`reuse-map.json` pins unchanged accepted source/artifact identities for migration
checkpoints, isolation/state capture, archive/mutation, authorization and browser
accessibility helpers. Historical mutation/race/import suites are reused only for
unchanged dependencies; new reads, archive visibility, entry-point permissions
and final invariants are freshly checked. Original reports and earlier packages
were not rewritten or embedded wholesale.

## Failed attempts and limits

- Early static attempts exposed TypeScript/lint issues, disallowed dynamic member
  expressions and a missing exact query inventory. These were corrected using
  bounded typed inputs, Map/tuple access and the existing exact-source inventory
  pattern. The D35 guard then rejected a test callback's direct client import;
  the callback now receives the harness's already-owned connection. No guard was
  disabled or widened to admit arbitrary database access.
- `full-1` passed its six service proof groups and production build, then read the
  transient loading page before its first row assertion. The browser now waits
  for the first actual row. That failed attempt and its cleanup are retained.
  `full-2` reran the service proof against the final application query source.
- During `full-2` service execution, test-helper-only corrections were completed
  before their dynamic browser import. `executed-source.json` captures entry-time
  bytes; `browser-test-source.json` separately captures actual browser helper
  bytes and `build-source.json` the copied application. Exact full-2 service entry
  and pre-selector-fix callback bytes were recovered and verified against their
  recorded SHA-256 identities; both are included for independent inspection. The
  receipt maps final bytes and any documentary/formatting differences explicitly.
- `full-2` subsequently stopped on an ambiguous validation-alert selector: it
  matched both the application alert and Next.js's route announcer. Scoping it to
  the main page resolved the test issue. `browser-3` reverified the full browser
  flow, permissions and final invariants, with exact application-source reuse.
- The separate sparse empty-hearings fixture initially omitted the existing staff
  mutex, then the migration-65 audit counter. Existing guards refused account
  initialization in `empty-4`/`empty-5`. The final fixture copies these two support
  records as well as account/person/team/audit support; no guard or schema body was
  changed, no hearing row was deleted, and both failed resources were removed.
  `empty-6` passed actual zero-hearing service/browser checks for all four roles,
  with an independent production build and axe scans. The sparse database has
  zero hearings, attendees, matters and clients. Only required person/team/account,
  audit rules/actors and the two control records were copied from the already
  disposable candidate. This is a read-state fixture, not a fully reconciled
  migrated dataset. Its cluster, mirror and listener were removed and actual
  source equality passed.
- Screen-reader speech is excluded by owner direction; no speech result, full
  accessibility conformance or production guarantee is claimed.

## Reproduction and stop

Run `npm run check` and `node --import tsx scripts/check-hearing-read-only.ts`.
For isolated runtime proof, supply an external HEARING_EVIDENCE_DIR, the fresh
forced-read-only HEARING_SOURCE_BASELINE, and the installed
STAFF_PLAYWRIGHT_MODULE / STAFF_CHROMIUM_EXECUTABLE paths, then run
`node --import tsx scripts/test-hearing-read-only.ts --browser`. The wrapper creates
and removes only positively identified disposable resources. The separate
`node --import tsx scripts/test-hearing-empty.ts` uses the same environment inputs
for its sparse zero-hearing fixture. `--browser --browser-only` plus
HEARING_SERVICE_EVIDENCE reuses a completed full-volume service run only after
checking exact application source identities; it still reruns browser, permission
and final invariant gates. Do not run accepted
64/65 on the actual database as part of this phase.

The external review package contains the binary-safe one-commit patch, exact
member manifest, source identity/reuse mappings, meaningful logs/screenshots and
preservation/cleanup summaries. Its separate receipt records patch and ZIP hashes,
reverse-applicability without applying, exact inventory verification and final
clean branch state. Stop for independent Phase 1 review. No push, live migration,
deployment, owner-app activation, hearing editing or later task is authorized here.


## Owner acceptance addendum — 13 September 2026

The owner accepted the independent Phase 1 PASS at `9b09f0d849aac5ed6afbcbc40879cfbb6da89ea1` and explicitly authorized Task 4.3 Phase 2 under its attached prompt. Phase 1 is accepted. The original report above is retained as historical evidence. Phase 2 remains pending independent review; its code and migration are not authorized for activation. Separate authority permits protected backup/rehearsal and activation of only accepted migrations 64/65 and the exact accepted Phase 1 app. D59 values remain unchanged.
