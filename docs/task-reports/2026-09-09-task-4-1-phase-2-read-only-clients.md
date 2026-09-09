# Task 4.1 Phase 2 — read-only clients, contacts and existing logos

**Acceptance pointer — 9 September 2026:** Khaled Helmy accepted Phase 2 after
independent correction review closed R1/R2. See the [dated acceptance addendum](2026-09-09-task-4-1-phase-2-navigation-correction.md#acceptance-addendum--9-september-2026).
The implementation and correction checkpoints below remain historical evidence.
The current stop is review of the acceptance documentation before separately
authorized publication; Phase 3 remains unstarted.

**Subsequent review and correction, 9 September 2026:** this report records the
original implementation checkpoint. The [independent review](../reviews/2026-09-09-task-4-1-phase-2-independent-review.md)
identified two untested exceptions to its navigation-state claim: the empty-results
include-archived link and the main-contact return path. Their reproduction,
bounded correction and fresh verification are recorded in the
[R1/R2 correction report](2026-09-09-task-4-1-phase-2-navigation-correction.md).
The immediate stop is independent correction review; owner acceptance remains pending.

Implementation checkpoint: 9 September 2026. The owner authorized Phase 2 only,
one local commit (`feat: add read-only client and contact screens`), external
review evidence, no push, and a stop for independent review. Two bounded
read-only source/test reviews supported the primary agent; only the primary
agent edited files or operated databases, Docker and browsers. The enclosing
commit identity and artifact hashes are recorded externally to avoid a
self-referential commit hash.

## Accepted starting point

Required authorities were read in order, followed by governance, HANDOFF,
D52–D57, readiness/deployment evidence, model, permissions, glossary and visual
direction. D1–D57, governance and dated historical reports remain unchanged.

Clean `main`, including untracked files, matched freshly fetched `origin/main`:
`9962c9792180b5c46f9307aac03548edc4e9e597`, parent
`0ab7fd88acdf49fb1b4a52c1446776ad686356e7`. The accepted commit changed exactly
13 Markdown files, +478/−109. Ahead/behind was 0/0, with no operation or lock.
One successful authorized `git fetch origin` followed a sandbox failure to
open FETCH_HEAD; no fetch was repeated after success.

Migration 60/61/62 SHA-256 values matched the mandate:

- 60: `7921c9b168549928185bfd0b915ccc725ba363787158990c614420e0e3bbbee5`
- 61: `87e04320badc5bc71de1c30eae02c72f82ae0e59f2088b42cb0806f6b25c8904`
- 62: `88ab034517f76e152e944f1a0949edc175a286c7bfeefe82fba0672c6b86f6c1`

The healthy existing PostgreSQL 17.11 project on localhost:5433 had 62 applied,
zero pending/unfinished and one approved historical rollback. Forced-read-only
verification passed 15/15; `db:check` passed 116/116 historical invariants before
fixture work. Full preservation receipts were captured before implementation.

## Delivered behavior and boundaries

- `/clients` has normalized Arabic, full/English client and contact-name
  search, including archived contact history. Contact matches are disclosed.
  Parameterized literal `%`, `_` and backslash searches retain the existing
  normalization and never fold Latin J to Arabic ق. An EXISTS predicate prevents
  duplicate client results from multiple matching contacts. Distinct same-name
  clients remain separate; ordering is Arabic collation followed by PostgreSQL
  ID, with 25-row pages. Repeated, malformed and oversized inputs fail visibly.
  Counts and rows share filters and a read-only repeatable-read transaction.
- Business status and archival are independent. The default excludes archived
  clients; explicit archived/all filtering exposes clearly labelled read-only
  history to all four roles. Disabled does not imply archived. Search/filter
  state survives list/detail/contact navigation and browser Back; clearing
  filters also resets the displayed controls.
- `/clients/[id]` shows the approved client fields, optional main contact,
  scalar matter count, existing logo and independently paged contact history.
  Historical lawyer text is separate, with no staff mapping or assignment.
  Contact archive state is shown independently from parent archive state.
- `/clients/[id]/contacts/[contactId]` constrains both IDs in SQL. Wrong-parent
  and missing identities share not-found behavior. `contact_name` remains the
  primary name, including explicit missing-name presentation for all six
  unnamed imports. `full_name` is separate. The explicit projection omits
  `home_phone` entirely from service results and browser data. Mixed-script and
  multiline fields wrap without losing lines.
- PostgreSQL and historical Access identities have separate labels; native
  fixtures receive no fabricated Access ID. Date columns return date-only text.
  D53 labels are centralized exactly; missing classification/status remains
  missing. Branches remain on matters; D39 and D43/D51 remain unchanged.
- Three pages independently guard their first awaited operation. Read services
  independently guard `clients/view` and/or `contacts/view`; the logo metadata
  service, file reader, GET and HEAD each guard `clientLogoUpload/view`. The
  existing validated server session supplies identity and role. Five inventory
  entries cover every new page/handler export. The 448-decision policy is unchanged.
- `/clients/[id]/logo` accepts only a client ID, reads its stored association
  and uses `CLIENT_LOGO_ROOT`. It rejects metadata/path/type/hash/size mismatches,
  links/junctions, non-regular files and resolved containment failures. It reads
  at most the verified size plus one byte from one handle, checks file identity
  before/after reading, validates PNG/JPEG/GIF structure and fully decodes with
  the installed sharp dependency. The existing limit is 2 MiB, with a 16-million
  decoded-pixel safety bound. Original bytes are served with verified MIME,
  `nosniff` and `private, no-store`; no public optimizer or public logo copy.
  Unusable/absent logos return 404 and the page displays the client name,
  including a late browser image failure. Authorization errors remain distinct.
- Arabic-first light RTL screens reuse existing visual tokens and bundled font.
  Loading, empty, no-contact, missing-value, invalid-filter, not-found, forbidden
  and focused recoverable-error states are implemented. There are no mutation
  forms, actions or placeholder editing/archive controls.

The pure logo validator moved from the migration script library into runtime;
the original script path re-exports it. Application code imports no migration
or transform machinery. The audit checker pins the complete client query closure
and eight exact raw read/transaction sites, with only the new logo-root environment
key permitted. Existing guard rejection fixtures and gateway restrictions remain.
The new structural checker verifies the five read-only entries, GET forms,
defined RTL tokens and nine rejecting mutation/access fixtures.

## Verification and measurements

Final command receipts, browser evidence and query plans accompany the external
sanitized ZIP.

- `npm run check`: all eleven checks passed, including 34 classified entrypoints,
  58 inventoried runtime sources, 78 RTL rules, six schema and 67 audit-rejection
  fixtures, existing account/staff safeguards and the new client structural proof.
- `npm run test:client-read-only`: passed against the verified 62 fixture, including
  all populations, synthetic cases and actual filesystem failure cases below.
- `npm run test:client-browser`: production build and 55 states/proofs passed,
  including 50 zero-violation axe audits and 53 screenshots. Both early and late
  image failures, keyboard, loading/error/retry and genuine 200% zoom passed.
- `npm run test:client-regressions`: authentication, accounts, all 448 permission
  decisions, staff reads/mutations (including 17 concurrency cases), and Gate 4's
  60 cases passed. The audit-event fixture then exposed an existing self-role-change
  error: its historical-role snapshot test used the target account as the actor.
  The unchanged guard correctly refused it. The fixture now selects exactly one
  separate enabled Administrator. No production guard or permission changed.
  `npm run test:client-regressions -- --suite=audit` reruns the affected audit/event
  canonical and restored-62 proofs: both passed, including event atomicity, protected
  audit fields, 45,463-event benchmarks and immutable actor/role snapshots.
  Successful unrelated groups are not repeated.

Routine proof corrections included a narrowed image assertion, the Windows
EPERM expectation for a deliberately unreadable fixture copy, and device-pixel
clip bounds for full native-zoom screenshots. Browser testing found and fixed
an actual pre-hydration image-failure race; the component now checks an already
failed image when attached as well as listening for later errors. Source review
also corrected stale uncontrolled filter values after clear/Back and contact
header multiline wrapping. A static run made while a physical build mirror
existed correctly discovered its duplicate action entrypoints; the full suite
was rerun after cleanup, with no inventory exclusion or safeguard weakened.

The permanent focused suite uses a read-only source clone in its own PostgreSQL
17.11 cluster, verifies checkpoint 62 and reuses it without redeploying migration
62. It covers all 318 clients, all 188 contacts, all 54 decoded logos, all four
roles, six unnamed contacts, 207 no-contact clients and the largest client's
378-matter count. Denied null/unknown-role/forced-change sessions perform zero
protected transactions. Explicit native fixtures cover 28 same-name clients,
25/3 paging, 28 matching contacts, literal and normalized searches, optional
main contact, parent/contact archival and date-only values. Full service-state
comparisons prove viewing does not change rows, sequences, audit or catalogs.

Logo negative cases include absent/corrupt/hash/type/size/path/ADS/directory/
junction failures, an actual task-owned unreadable copy with permissions restored
in finally, and a header-valid GIF with matching hash that cannot decode. Tiny
task-generated PNG/JPEG/GIF fixtures prove each supported format independently.

Representative EXPLAIN ANALYZE plans are measured before synthetic additions,
against the real restored population. These are local observations, not server
capacity guarantees. List/detail reads have a constant query count; the matter
summary never materializes a collection. The final local timings (milliseconds) were:

| Query | Planning | Execution |
| --- | ---: | ---: |
| list | 0.325 | 0.358 |
| contact search | 4.556 | 2.248 |
| English search | 0.68 | 1.156 |
| largest detail | 0.501 | 0.341 |

The accompanying JSON retains complete plans and buffer/loop details.

The production browser harness uses a physical source copy, copied logos,
separate local-only database/server ports and disposable accounts. No project
environment file is copied. The server environment contains the runtime account,
never migration credentials. Authentication writes occur only in the disposable
cluster. External browser requests are blocked and counted. The harness exercises
all roles and actual pages/logo endpoints, wrong-parent URLs, all logos/unnamed
contacts, keyboard focus, filters/paging/clear/Back, loading and retry recovery,
desktop/390px/320px layouts, axe audits, accessibility-tree properties, target
sizes, overflow checks and genuine extension-controlled 200% browser zoom.
Final Chromium 151.0.7922.34 evidence has 55 proofs, 50 zero-violation audits,
53 screenshots and zero external requests. Representative desktop, 320px,
client-name fallback and complete 200% contact screenshots were inspected.

Automated accessibility evidence and screenshot inspection do not establish
screen-reader speech quality, every assistive-technology combination or human
legal-workflow acceptance. Future mutation workflows and Phase 4 final acceptance
are outside this phase. No dependency upgrades or new services were introduced.

## Preservation, cleanup and delivery

Full before/after comparison covers all 107 table contents, all 48 sequence
states including `last_value`, `is_called` and `log_cnt`, catalogs, roles/grants,
migration/audit evidence, project container identity/configuration and all 54
logo paths, sizes, timestamps and hashes. The final exact comparison passed after
the last fixture exited: every value was unchanged. Forced-read-only project
verification again passed 15/15 and historical invariants passed 116/116;
62 applied, zero pending/unfinished, one approved historical rollback. Task-owned clusters, databases, roles, credentials, volumes,
networks, browser/server processes, build mirrors and temporary logo copies are
removed; existing recovery packages and permissions remain intact.

Only Phase 2 is newly checked. Overall Task 4.1, Phases 3–4 and Task 4.1a remain
unchecked. Stop for independent Phase 2 review; Phase 3 is the next development
phase. No project database write, migration deployment, Access operation, push
or later-phase implementation is included.

The external delivery contains the single full-index binary-safe commit patch,
its reverse-applicability check, exact commit/parent, scope/statistics,
size/SHA-256 and a sanitized evidence ZIP with manifest. It excludes credentials,
password hashes, raw dumps and environment files.

## Exact changed-file inventory

- `docs/DATA-MODEL.md`
- `docs/DATABASE.md`
- `docs/MIGRATION.md`
- `docs/PERMISSIONS.md`
- `docs/PRD.md`
- `docs/task-reports/2026-09-09-task-4-1-phase-2-read-only-clients.md`
- `docs/VISUAL-DIRECTION.md`
- `HANDOFF.md`
- `package.json`
- `README.md`
- `scripts/check-client-read-only.ts`
- `scripts/lib/audit-source-inventory.ts`
- `scripts/lib/client-logo-image.ts`
- `scripts/test-audit-events.ts`
- `scripts/test-client-browser.mjs`
- `scripts/test-client-read-only.ts`
- `src/app/clients/[id]/contacts/[contactId]/page.tsx`
- `src/app/clients/[id]/logo/route.ts`
- `src/app/clients/[id]/page.tsx`
- `src/app/clients/client-alert.tsx`
- `src/app/clients/client-fields.tsx`
- `src/app/clients/client-logo.tsx`
- `src/app/clients/clients.module.css`
- `src/app/clients/error.tsx`
- `src/app/clients/loading.tsx`
- `src/app/clients/not-found.tsx`
- `src/app/clients/page.tsx`
- `src/app/page.tsx`
- `src/lib/auth/route-inventory.ts`
- `src/lib/client-logo-file.ts`
- `src/lib/client-logo-image.ts`
- `src/lib/client-logo.ts`
- `src/lib/client-query.ts`
- `src/lib/clients.ts`
- `src/strings.ts`
- `TASKS.md`
