# Task 3.5B — prepared high-impact quarantine application

Date: 4 September 2026. Scope: implementation and disposable-database proof
only. **Real application is not approved or performed. Task 3.5 remains
unchecked. Stop for independent review; Stage 4 and cutover are unstarted.**

## Authority and starting state

The owner explicitly authorized preparation after resolving the hearing-note
ambiguity. D41 was available without collision and now records the owner's
legal-record evidence. It supplements D40; it does not replace or reinterpret
the approved workbook.

Fetched Git preflight: clean `main`, no active operation, HEAD and origin/main
both `33e9ac6a324304ea9f65706dfcc3a43efc10c609`, ahead/behind 0/0. The real
database had 59 applied migrations, no unfinished migration, one accepted
historical rollback, 93 tables and 92/92 passing invariants. Migration 59
SHA-256: `364c04d7cf96a476cf3efaf092c5ffc7ad99389cf51a70b8b31d8f9d0268f15d`.

The approved file is
`task-3-5-high-impact-quarantine-review-2026-09-04-d40.xlsx`, 172,273 bytes,
SHA-256 `0dc23134639e0bc6477fe1f39613bd7575b56cdcd0085d2f2831a96693f2376b`.
Its adjacent manifest SHA-256 is
`b3ba17d1d44311600ab1c7095d96d0592820a9225dea67cf9aae2b12d3a8f8f5`.
The immutable owner-filled input remains
`fcd78d0498b4250ecacf25430a8c7215e09e582c059d7a62b9f1dc0c58e29d58`.
The external successor and the already byte-identical ignored local copy were
read, not moved, resaved or replaced. Neither workbook nor manifest is committed.

Before code edits, the repository validator and independent read-only spreadsheet
import proved 382 complete / zero incomplete / zero invalid decisions, 55
matters, 327 hearings, all 313 dependent hearings and 175 unchanged D39 baseline
answers. Independent database planning identified the downstream counts below.
The spreadsheet skill influenced preservation and cross-reader verification;
there was no workbook authoring or browser interaction.

## D41 — exact owner-supplied hearing destinations

| Matter review | Access matter | Individually authorized Access hearings |
|---|---|---|
| M-000064 | 467 | 7072, 7071, 7237, 7383, 7451 |
| M-000065 | 468 | 7073, 7070, 7219, 7351 |
| M-000067 | 515 | 7129, 7159, 7382 |

All twelve receive exactly `وكيل نيابة/ أسامة الطنطاوي`. The court remains
exactly `نيابة الشئون المالية والتجارية`. This is not one hearing per matter
or merely a matter note, and authorizes no additional hearing. Existing source
circuit text is preserved. Missing, duplicate, wrong-parent, changed-note,
changed-court and extra-note destinations fail closed. Both the application
contract and the deferred database completeness guard bind these identities.

## Application and enforcement

One corrected, still-unpushed and real-unapplied forward migration:
`20260904180000_prepare_high_impact_application` (migration 60), SHA-256
`7921c9b168549928185bfd0b915ccc725ba363787158990c614420e0e3bbbee5`.
Migrations 1–59 are unchanged. No public Prisma model changes are needed for the
four private `_migration` evidence tables.

- `client_branch_compatibility`: explicit normalized client/branch pairs,
  restricted foreign keys, append-only provenance and a fixed-search-path
  database trigger covering every non-NULL matter branch. Runtime cannot read
  or modify the register. Existing evidence shows fifteen branches each used by
  one client; it does not authorize a universal single-client cardinality rule.
  The register therefore supports only explicitly evidenced pairs without
  guessing that broader rule.
- `high_impact_application`: the exact workbook/plan identity, created-row
  identities and digests, before-state inventory, event IDs and migration actor.
- `high_impact_resolution`: exactly 382 durable source-to-target links, with
  foreign keys to retained quarantine evidence and actual targets. Deferred
  constraints reject partial batches and enforce D41. Updates, deletion and
  truncation of the new evidence are refused.
- `high_impact_row_proof`: append-only full-value hashes for later updates to
  released rows, each linked to the existing audit event and checked against
  human role permission and request context. It is not a second audit taxonomy.

The command defaults to dry-run, rejects unknown/conflicting arguments, and
pins filename, size and SHA-256 before parsing. Even a same-size readable XLSX
with changed ZIP metadata is rejected. Application requires `--apply`; that path
remains restricted to task-specific disposable databases. A distinct dormant
`--apply-real` path additionally needs the exact long Task/workbook/plan/revision
confirmation, target and Compose cluster, clean synchronized reviewed Git,
migration, artifact, empty/protected state, principal, sessions and 92 invariants.
Its successful write path was deliberately not executed. Preparation is not approval.

Application uses a serializable transaction, advisory lock and rebuilt plan
comparison. The stable approved plan digest is
`4a1fee01d011b960f48204102e28ed71731a5f1d682006141749460828e33da3`.
Lookups use generated IDs returned by PostgreSQL; the court ID is never
preselected. Plan-only parent references are resolved through durable source
identities before insertion, not inserted as IDs. Existing transformation
parsers and immutable attendee spans are reused. Staged payloads and quarantine
payloads must match exactly before application.

D39 retains thirteen Sigma matters on client 197 / Access 188 and Alpha on
client 11 / Access 2. Only the three exact approved branches are created; party
text does not create a Sigma Tech branch. D40 preserves ten NULL branches,
creates `أسرة مصر الجديدة` rather than reusing `مصر الجديدة`, preserves the
three exact weekday-specific circuits, and assigns Masters to client 142 /
Access 133. All 313 sole-parent-reason hearings inherit their exact approved
parent, including the 152 later answers.

## Exact projected changes

These additions were applied **only to disposable clones**, never to the real
database. Counts after both migration 60 and application:

| Table | Addition | Resulting count |
|---|---:|---:|
| `lookup_client_branch` | 3 | 18 |
| `lookup_court` | 1 | 309 |
| `matters` | 55 | 1,744 |
| `hearings` | 327 | 13,382 |
| `matter_lawyers` | 41 | 968 |
| `matter_parties` | 80 | 2,695 |
| `matter_party_roles` | 68 | 2,267 |
| `hearing_attendees` | 229 | 9,113 |
| `quarantine.matter_relationship_transform` | 37 | 963 |
| `_migration.client_branch_compatibility` | 15 at migration; 3 at application | 18 |
| `_migration.high_impact_application` | 1 | 1 |
| `_migration.high_impact_resolution` | 382 | 382 |
| `audit_events` | 15 at migration; 808 at application | 824 |

The 37 new relationship-evidence rows account for 23 unreviewed party roles,
11 unreviewed person values and three malformed quoted values. They are not
guessed into business relationships. All 158 newly exposed populated relationship
cells are accounted for. Existing relationship evidence remains unchanged.

The original 55 matter and 327 hearing quarantine rows remain byte-identical;
release is recorded separately. Administrative tasks/steps remain 3,694/3,483,
with 544/769 retained quarantines. Fee-letter forward/reverse links remain
231/393, with 57/19 retained quarantines. Their original reasons are historical
evidence; a now-available parent does not implicitly authorize lower-impact
release. No client, billing, attendance, logo, authentication or role row is changed.

## Audit, reconciliation and rollback meaning

The executing actor is the existing `system_migration` actor 1, with explicit
maintenance request/correlation/session metadata. Owner authorization is D39,
D40 and D41, not a fabricated human execution identity. The original seven
actors and the Task 3.3B baseline event/checkpoint remain unchanged.

The fifteen migration events truthfully record registration of existing
compatibility pairs as new configuration facts. The 808 application events are
804 existing row-trigger events, three new compatibility facts and one bounded
batch-ledger fact. Raw workbook contents are not placed in audit payloads.
Parent matter events precede hearing events, and all application events share
one explicit request context.

Application keeps the complete pre-state inventory as immutable rollback
evidence. Permanent verification instead reads the approved plan from the
append-only ledger, so ordinary checking needs no ignored XLSX. It checks initial
values/digests, 382 links, full application-event contents/context, immutable
source provenance and later full-value audit/hash continuity. Legitimate new
events, authorized audited edits, native rows, unrelated tables/migrations and
appended lower-impact evidence are allowed. Exact guards remain checked.
The frozen Stage 2 and Task 3.3 checks separately examine their original
partition through the exact recorded baseline IDs. Those historical counts are
explicitly labelled and are not current totals.
The current release check cannot be replaced by a matching row count.

Disposable clones of the pre-correction implementation reproduced every review finding: the former
checker rejected a valid semantic event, authorized audited edit, native matter
and unrelated table/migration; it tried to read the XLSX; and it accepted extra,
missing or D39-misclassified D19 evidence before a batch. Corrected fixtures cover
all positive cases and XLSX refusal, plus extra, missing, duplicate, wrong-parent
and wrong-attribution D19 rejection.

A deliberately forced late failure, after inserts and reconciliation, rolls
back business rows, lookup/configuration rows, relationships, ledger and events.
PostgreSQL sequence allocations may leave gaps; counters are not reset and IDs
are not reused. A second successful invocation changes no row, timestamp or
event. Two non-writing full-result reconciliations are compared byte-for-byte.
The final disposable run produced the same SHA-256 on both reads:
`9d79a17f75b16a10fe5f22e08f264bf269f3e28ee505c4b43e26c5104e30b248`.
This result digest includes generated IDs and timestamps; it is not the stable
approved plan digest above.

## Verification record

- Read-only preflight: real database 59 migrations / 93 tables / 92 invariants.
- Disposable historical-live clone: migration 60 deployment/status and Gate 4
  provenance; failed-migration atomicity; full application; 93/93 permanent
  invariants across 97 tables; late rollback; exact no-op; repeat reconciliation.
- Disposable canonical clean replay: all 60 migrations and exact new schema,
  zero release rows, zero guessed compatibility pairs, accepted provenance.
  No pre-existing runtime session was interrupted; shared role state was verified
  unchanged. Both task-created databases were removed.
- Negative fixtures cover artifact identity/structure, incomplete/altered
  decisions, Sigma/Alpha parents, unrelated pairs, new/generic/invented courts,
  NULL branches, weekday circuits, D41 scope/text/court/parents, Masters,
  inheritance, stale source evidence, duplicate/partial/tampered ledger,
  disabled guards and missing/wrong-actor audit events. Tampering after temporarily
  disabling and restoring fixture guards is still detected by permanent checks.
- `test:high-impact-review`, `test:matter-transform`, `test:matter-relationships`,
  `test:hearing-transform`, `test:admin-transform`, `test:fee-letter-transform`
  and Gate 4's 60/60 fixtures passed. The matter TRUNCATE fixture now recognizes
  that the new resolution FK rejects truncation before the unchanged erasure
  trigger; exact trigger-definition coverage is retained.
- Prisma format, validate and generate; `npm run check`; production build passed.
  No dependency or lockfile change. No browser, Graphify, delegation, real
  migration deployment, reset or destructive override was used.
- Final real-database `db:check`: 92/92. The existing `db:verify` SQL also passed
  with PostgreSQL read-only mode explicitly enforced. Real migration status
  correctly reports only migration 60 pending (status exit 1); this is not a
  successful real deployment and was not reported as one.
- Final scans: exactly twenty necessary task files; all 59 earlier migrations
  byte-identical to the starting commit; runtime sources, Prisma schema,
  governance files, dependencies and lockfile unchanged. Only two task command
  entries were added to `package.json`. No secret-pattern, raw-data, binary,
  workstation-path or review-artifact additions were found. `git diff --check`
  passed. All seventeen extracted source tables and three complex CSVs match
  their canonical manifest hashes, sizes, headers and counts (31,227 rows).
  Source and runtime logo bytes passed the existing permanent reconciliation.
- Approved external/local workbook and manifest hashes, plus the owner-input
  hash, remain exact; local artifacts remain ignored and untracked. No
  task-owned fixture database, role or session remains. Test cleanup removed
  its fixtures; the independent spreadsheet reader's temporary junction and
  empty directory were removed without touching bundled dependencies. An
  unrelated Gate 4 audit directory dated 30 August was preserved, not deleted.

## Real-database preservation evidence

### Operational-verification correction

The correction suite replayed all 60 migrations on historical/full-state and
canonical-clean disposable databases. Application, 93/93 post-application
checks, forced late rollback, exact no-op, exact D19/D39 negatives, guard/event
tampering, operational positives and workbook refusal passed; the final repeat
reconciliation digest was
`ab5f9b569797c3cccb591ac0a2e5a3f7f746305d050b10778c90982e5b54ee40`.
The digest includes generated IDs/times and is evidence of that run, not a new
approved-plan identity. Permission, authentication, both audit suites, Gate 4,
matter/relationship/hearing transformation suites, the full source checks,
production build, SQL verifier and real 92/92 invariant check passed. Migration
60 remained pending and the dormant real-write path was not executed.

The before- and after-state schema SHA-256 is identical:
`7c9b816b5d90dcf70e3675d2d1aae6169f76a508b953d35bc91d9130bdafcce8`;
the ordered 93-table fingerprint inventory SHA-256 is
`f406f6011595ae4ca2c7b2393ae9e0c14d6f2f3dbbeb23fbf84d499dc8b82fdc`.
These inventory hashes are distinct from domain-specific reconciliation hashes.
The complete ordered inventories, including every count and row digest, were
also compared directly and are byte-identical. The real database still has 59
applied migrations, zero unfinished migrations and the same historical rollback.
No real row, schema object, lookup, audit event or migration-history row changed.

Protected domain evidence confirmed unchanged by the final read-only checks:

| Evidence | SHA-256 |
|---|---|
| 5,209 protected business/timestamp rows | `b50879f52200275e70515cb4e1daa76594c304237a40b864205108e15490aeab` |
| Frozen attribution | `edf4be9e8668fc65005deaa69cababf79dec1ac1b3e12f2356b9e6da892c009d` |
| Original audit event/checkpoint | `63bb6a28a88b29af10b60a82f14b7763d416df553aa01549e5e51942294e6173` |
| Billing values | `81f1d4176828d109f5af1bd90a397408c32dc967751254e172312de74c330925` |
| Billing IDs/timestamps | `a4e35c491255067d824aff6085a095d92d02bcf0946490c72c081632d4b200f2` |
| Attendance result | `f6971cca7139e191d1fc192d290d496436d8bbc0c6153dd27d00c295e6b10ab5` |
| Logo result | `5fa708e0a5ade8bb1b9b81cc16d4a9a3d225d7226e0043e71968ca128c7bdf1f` |

Protected counts are 318 clients, 188 contacts, 543 invoices, 597 payments,
47 allocations, 4,022 attendance records, 54 logos / 1,541,428 bytes, four
accounts, seven actors and one original audit event. Real migration 60 and the
382 releases remain pending. The local preparation commit is not permission to
deploy, apply, push, complete Task 3.5 or start Stage 4.
