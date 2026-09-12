# Task 4.2 Phase 1 — read-only matters

Date: 12 September 2026. Local Windows; sole implementer; no subagents.

**Status: Phase 1 locally verified; stop for independent review.**
Overall Task 4.2 remains incomplete. The authorized delivery is one local commit,
`feat: add read-only matter screens`, with sole parent
`d84aa4b916e41e15abf543fc7dd2d4155bea7acf`, then independent review. Its exact
identity and artifact hashes belong in the external delivery receipt.

## What changes for users

All four roles can open `/matters` from the application home or from a client.
The list pages 25 distinct matters at a time, with stable case-number/ID order.
Search covers complete case numbers, subjects, client names and recorded aliases
of assigned lawyers. Literal `J`, percent, underscore and backslash remain literal.
Actual matching text appears under `يشمل البحث:`; aliases are not invented.
Client, status and lawyer filters are prominent; five additional classifications
sit in an expandable group. Archived clients and inactive referenced lawyers
remain available. The unassigned filter and rows say `لم يُكلَّف أحد`.

The detail makes the complete multiline case number the visual focus, preserving
every stored line. It shows subject, client/branch, independent classifications,
status, court and circuit, available logistics, dates, amounts, evaluation,
opinion and notes. Parties retain their side/order and every ordered capacity,
using the lookup's gender form. Lawyer relationships retain IDs, role and order.
Unresolved legacy text does not become an assignment. The owner approved the
three lawyer-role display labels during this run; see [GLOSSARY](../GLOSSARY.md).
Client links and return links preserve validated search/filter/page context.

These screens have independent server `matters:view` checks before reads and
explicit business projections. There are no matter actions, write endpoints,
schema/grant changes, timelines, billing, exports or new visibility policy.
Each list/detail read uses one repeatable-read, read-only transaction with three
business queries plus its read-only declaration. List loads are bounded at 25;
option and detail-relationship limits fail visibly rather than silently truncate.

## Fresh verification

The immutable initial matrix was written outside Git at
`2026-09-12T06:29:11.7651266Z`, before application edits, tests or DB execution.
Its SHA-256 is
`1c5d099c08f0e6313b791afc71d8e67c1b534a647544ef50cdc1ecf314cbfc2e`.
The [final matrix](../testing/task-4-2-phase1-acceptance-matrix.md) maps requirements
to actual evidence and distinguishes historical reuse.

The full-state disposable copy is positively identified by its separate cluster,
task label, owned volume/network and loopback port. It restores the current-63
source with exact complete table hashes and the previously reviewed portable
catalog/logical-sequence comparison. Only the three reviewed constraint renderings
and physical restore `log_cnt` differences are normalized for clone comparison.
No such normalization is permitted in before/after live preservation.

`proof-attempt-3` passed the current profile's **121 invariants and 15 setup
checks**, the existing permission suite (**448 decisions**, expired/revoked,
disabled and forced-password sessions, independent guards and route inventory),
and the following new service assertions:

- All **1,744** matter identities, complete stable pages for all four roles,
  every detail scalar/classification and ordered party/capacity/lawyer relationship.
- **1,000** unassigned, **312** multiline case numbers, **42** matters with
  multiple capacities on a party, and **224** with multiple assigned lawyers.
- Independent normalized-substring oracle for **23** inputs, **404** filter
  choices, combined filters, missing classifications, invalid/repeated/oversized
  parameters, literal wildcard characters and last-page clamping.
- New query/detail paths for clients **12 (82 matters)** and **111 (378)**,
  all four roles, active/archive/restored exact identities and content. A deliberate
  archive-exclusion counterexample is rejected. Existing client counts/logo
  metadata remain readable.
- Complete table/catalog/sequence preservation across the read-only service
  assertions. Four real `EXPLAIN ANALYZE` plans are retained; these are local
  observations, not production latency guarantees.

Production builds and browser verification use a separate task mirror, copied
logos, an ephemeral loopback listener, random fixture-only credentials and the
already installed full Chromium/Playwright. The harness records source hashes,
blocks external requests, checks all 35,003 installed dependency file metadata
entries before/after, closes its browser/listener and removes only its mirror.
The completed browser archive/navigation portion is `browser-attempt-4`: eight
role/client cases and 27 passing scans before an unrelated selector failure.
`browser-final-7` completes final rendering, keyboard/focus, 320 CSS pixels,
three genuine 200% zoom cases, loading, empty/invalid/missing data, real query
timeout/retry and expired-cookie denial: 17 passing scans and 26 evidence records.
The final screenshots were visually inspected. Original 200% captures from run 5
were cropped by the capture API; runs 6/7 use the existing Chrome device-pixel
method and assert complete image dimensions.

Visual review also corrected first-nonblank-number emphasis for source values
with leading blank lines. Matter 2943 proves two nonempty number lines retain
descending size. The final list, single-column detail and 200% detail show readable
Arabic, mixed Latin/numeric source fields, distinct sections and visible focus.
Actual speech is excluded. Accessibility testing strategy and component-spec
skills informed these checks. The app model/effort selector was unavailable;
no model, service or global setting was changed.

Representative first-page plan times were 4.384 ms unfiltered, 6.805 ms normalized
Arabic search, 1.525 ms client 111 and 2.849 ms unassigned. These are measured
query execution times on this disposable local copy, excluding browser/network
and other list queries.

## Troubleshooting and evidence reuse

Failed attempts remain in the package. The first browser comparison used
`innerText`, which normalizes whitespace; it was corrected to exact text nodes.
The next client navigation assertion reached streaming loading content too early;
it now waits for the client heading. A later added logo assertion mistakenly
expected an archived client's existing logo to return 404; the reviewed endpoint
correctly returns the readable original, so the assertion was corrected.
Run 4 then completed all eight archive cases, original logo-byte checks and
return navigation before a generic alert selector also matched Next.js's route
announcer. Scoping it to `main` resolved that harness failure.

The first standalone permission invocation refused the missing isolated descriptor
before any DB work. The unchanged suite then passed through the existing guarded
restored-fixture path. No guard or safety override was bypassed. Ordinary Windows
child-process/Git/CIM restrictions were handled with scoped permission retries.
The first static audit rejected dynamic member access; explicit fields and exact
new read-service call fingerprints satisfy the existing checker. No broad audit
exception was added. Later browser-only reruns reuse already passing unchanged
service/profile/permission proof; they still independently restore and verify the
owned full-state fixture before creating actors or starting a browser.

`reuse-map.json` records exact historical artifact/inventory identities and every
relevant dependency comparison from the accepted corrected Task 4.1a evidence:
logo failure/recovery/durability, client mutations and current-63 staff/auth/audit
regression dispatch. Unchanged schema, gateways, auth, storage and locked packages
support reuse. Route/audit inventory additions and changed client navigation are
freshly covered. Mutation races, historical replay, audit benchmarks and recovery
rehearsals are not represented as newly executed tests.

## Preservation and delivery boundary

The real development source is accessed with PostgreSQL forced read-only settings.
Full before/after receipts include 109 tables, all 48 complete live sequences,
catalog/grants/roles/ledger/audit state, Docker identity/configuration and 54
original logos. Protected inventories cover 3,260 backup/historical-evidence/logo/
governance/environment entries, including permissions. A supplemental inventory
observes 2,161 owner-runtime/checkout-build entries and the original port-3000
process; its initial capture was later in the run, not a pre-edit baseline.
The actively locked owner `runtime.log` is excluded from that supplemental
content inventory; the task does not operate that runtime or write its log.

Final preservation is exact: both complete source captures, live service/catalog
receipts, all 3,260 protected records and all 2,161 supplemental runtime records
match structurally. All seven owned fixtures, mirrors, browsers and listeners
were removed; their temporary accounts/secrets disappeared with them. The
original owner listener remains PID 54172 on 127.0.0.1:3000. Full static aggregate
checks passed, followed by affected typing/lint/format/RTL/audit checks for the
final typography correction. Exact commands, attempts and artifact identities
are in the external receipt. Review ZIP contents exclude credentials, environment
contents, password hashes, raw dumps, original logos and imported raw files.
Screenshots show only the authorized disposable application. The full-index binary
patch exports this one commit and is reverse-checked without applying it.

Migration-63 documentation publication is closed by the preserved
[publication review](../reviews/2026-09-12-migration63-documentation-publication-independent-review.md).
This task does not replay migration 63, activate the owner's runtime, push, deploy
or accept the phase on the owner's behalf. Later matter mutation work needs its
own mandate after review. Ubuntu production validation, Stage 6 report/export
integration and final Access reconciliation remain separate. Actual screen-reader
speech is excluded; no speech follow-up or full accessibility-conformance claim.

## Owner acceptance addendum — 12 September 2026

Khaled Helmy accepted Task 4.2 Phase 1 at
`2f8820a3053ab65a60ee183882cbd6a2462559bc`, based on the supplied
[independent PASS review](../reviews/2026-09-12-task-4-2-phase-1-independent-review.md).
The preserved review is 11,024 bytes, SHA-256
`fc5f3d15e956f78dc84023127dfd4f48097750588bdcc03f073e53b8ca04a60a`.
This addendum records his explicit conversation authorization and is included
in the same Phase 2 implementation commit. Original Phase 1 evidence above and
its external patch/package remain unchanged. Phase 1 acceptance does not accept
Phase 2 or Task 4.2 overall, apply a live migration, activate an application or
authorize publication. Phase 2 stops for independent review.