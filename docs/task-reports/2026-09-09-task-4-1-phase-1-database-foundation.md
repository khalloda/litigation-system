# Task 4.1 Phase 1 — Database foundation and operational invariants

- Implementation verification date: 9 September 2026; independent review is next.
- Requested configuration: GPT-6 Astra, High reasoning, Local Codex Desktop on Windows.
- Subagents: two bounded read-only source/test reviews permitted and used. The
  primary agent made every edit and performed every database/Docker operation.
- Expected usage: High; no fixed token or credit budget. Existing fixtures,
  installed dependencies and the cached official PostgreSQL image were reused.
- Starting commit and verified `origin/main`:
  `156d4221b21ee31d2d0dcd3b586a92143a6e1799`.
- Starting parent: `65797993f29c97d757049f28c2da92f237512aa9`.
- Starting subject: `docs: record approved Task 4.1 client contract`.
- Original implementation commit: `46846646c27746383280ab1dbb074e7f15658c99`,
  preserved unchanged. Its original external delivery manifest records its
  parent, subject, 36-file inventory and patch size/hash. The correction below
  is a separate local commit, recorded in its own external delivery manifest.
- Push status: not pushed.
- Authorized stop and next return point: **independent review of Task 4.1 Phase 1**.

## Authority and scope

Khaled's 9 September implementation mandate authorized one local Phase 1 commit,
one preflight fetch, read-only project verification and memory-only copying,
separate task-owned PostgreSQL 17.11 fixtures, temporary build copies and
sanitized external review artifacts. D52–D57 define the approved contract.
README, PRD, DECISIONS, TASKS, both governance files and the relevant data,
migration, permission, readiness and accepted staff/audit evidence were read.

Scope is one forward migration, its Prisma representation, permanent checks,
necessary historical/test adapters, focused database tests and documentation.
There are no client routes, forms, server actions, browser workflows, staff
assignment changes or logo mutations. Project PostgreSQL remains at migration
61; Access remains in departmental use. Neither Access file nor existing
recovery/evidence package was accessed. Migrations 1–61, D1–D57, governance and
dependency versions are unchanged. No remote action followed the approved fetch.

## Reproduced gaps and implementation

On a separately owned migration-61 full-state fixture, direct writes accepted
a main contact belonging to another client, changed an imported contact's
owner, and overwrote historical lawyer text. Each probe rolled back, and every
fixture table matched its prior full-value receipt afterward. Audit sequence
gaps from rolled-back attempts are expected PostgreSQL behavior.

Migration 62 is transactional. It validates all 318/188 original system/Access
ID associations and full rows against the pre-existing high-impact
`before_inventory`, validates staging and source fingerprint equality, then
freezes exact source/initial values and ownership in private immutable evidence.
The canonical profile must have zero client/contact source or import payload.
No frozen source, review, workbook, audit or result digest is replaced.

Two historical views expand the original pre-62 row shape before live columns
are added. DB-052–DB-056, the affected protected-row digest and historical
workbook lookups use those views after 62; at 61 they still use original live
rows. Gate 4 counts imported clients/contacts separately from native additions.
The old delete-and-rebuild transform refuses before context, data or sequence
changes whenever complete or partial boundary surfaces exist.

Live clients/contacts gain native/archive markers, positive bigint row versions
and paired database-owned modification time/actor. Three fixed-path trusted
gateways enforce current roles, usable accounts, immutable identities/raw fields,
D39, required new names, fixed ownership, same-client unarchived main contacts,
stale writes and lifecycle rules. Archival is non-cascading and independent of
business status. Parent restoration retains separately archived children.
Selected contacts must be explicitly cleared/replaced before their own archive.

Parent locks serialize related contact maintenance; selection also locks the
chosen contact. Tests observe real blocked transactions in both race directions
at Read Committed, Repeatable Read and Serializable isolation. A losing operation
may receive a domain refusal or serialization/deadlock failure; it cannot commit
an invalid relationship. No global client mutex is introduced.

Creation receipts are scoped by trusted actor, entity type and submission UUID.
The full payload, including the contact's parent, must match on retry. Replays
return the original identity without another row/event; deliberate duplicates
use another UUID. Receipts, rows and existing audit events commit together.
Ten fields receive explicit value classifications. Versions are reconciled to
continuous attributed events; no duplicate full-row change ledger is added.
Runtime direct DML and client/contact sequence access are revoked.

## Necessary shared changes

- Exact checkpoint helpers now distinguish reviewed 60/61/62 states. The old
  staff 60→61 proof uses a byte-verified 61-file mirror and keeps its old source
  guard. The new client proof owns the historical 61→62 path.
- Audit structure recognizes exactly three new gateways and ten classifications;
  the original classification digests remain exact. Fixture-only migration-56
  privilege probes account for the later client boundary and restore its narrow
  grants. No project permissions are broadened.
- Authentication/accounts/audit/events can explicitly clone the verified
  historical-62 template; their default independent canonical replay remains.
  Account fixtures use the permanent checker's existing pre-Task-3.5B attribution
  projection and administration attribution for their own native test setup.
- Restored passwords require reset events, while clean replay proves initial
  password events. An existing account test checked actor 1003 instead of
  resolving the actor for the account it changed. It now checks one new event
  for the actual target, preventing an unrelated event from satisfying the test.
- Staff child fixtures borrow only a verified task-owned cluster, create and
  remove their own databases, and explicitly preserve the database TEMPORARY
  denial. The outer wrapper alone owns cluster cleanup.
- Runtime Prisma account setup lives in the permitted top-level test entry
  point; helper modules retain the unchanged D35 import/construction guard.

## Verification and exact results

| Command / proof | Final result |
| --- | --- |
| One `git fetch origin`; branch/parent/status inspection | Successful fetch; clean synchronized `main` at the expected full starting commit before edits |
| `test-client-contacts.ts --baseline-gaps` | Three current gaps reproduced and rolled back on an owned 61 clone before implementation |
| `--sql-smoke` and `--migration-smoke` | Corrected SQL and ordinary Prisma deployment succeed on isolated 61 clones |
| `npm run test:client-contacts` / `test-client-contacts.ts --profile-acceptance` | Historical 116/116; canonical 98/98; 16 historical and 15 canonical mutation groups, plus prestate/atomicity/catalog/transform/Gate 4 proofs |
| `test-client-contacts.ts --regression-proof --suite=authentication` | Authentication on canonical and historical-62 fixtures; all 448 permission decisions |
| Same runner, `--suite=accounts` | Canonical and historical-62 account lifecycle/negative tests; existing user-management UI structural tests |
| Same runner, `--suite=staff` | Staff reads, permission matrix, service/race tests and all 22 database mutation groups; all 116 historical invariants afterward |
| Same runner, `--suite=audit` | Current-state-62 audit and separate event suites, each on canonical and historical-62 fixtures; 45,463-event benchmark and indexed paging proofs |
| Same runner, `--suite=gate4` | 60/60 pure Gate 4 fixtures; exact imported 318/188 accounting after native client/contact mutations is also proved in both profile runs |
| Installed Prisma `format`, `validate`, `generate` | All pass; generated client 7.9.1; explicit installed schema engine |
| `npm run check` | Complete type, lint, format, RTL, authorization, audit, user-management, staff, Git-ignore and encoding chain passes |
| Temporary byte-verified source copy: `next build --webpack` | Production build passes; no source `.env` copied; generated secret/unreachable fixture URL; source, `.next`, environment and governance bytes unchanged; mirror/junction removed |
| `git diff --check` | Pass; repeated on the staged/committed scope |
| Project SQL `/verify.sql` and read-only `check-db.ts --profile=historical-full-state-upgrade` | 15/15 and 107/107; complete migration 61 with 62 solely pending |
| Final read-only preservation helper against the before receipt | Exact equality for project rows, full sequences, catalogs/roles, service, migration/audit evidence and all 54 logos |

Only exact profile arguments and verified fixture targets are accepted. The
static checks retain 78 RTL rules, 29 authorization entry points, and the
existing audit/D35 bypass fixtures. After the staff regression passed, its
equivalent URL forwarding was moved to the permitted test entry points; the
unchanged static guard and full type/check chain verified that narrow plumbing
correction. No business behavior changed.

The full [profile inventory](../testing/task-4-1-phase1-invariants.md) retains
DB-001–DB-093 and STAFF-01–STAFF-14, and adds CLIENT-01–CLIENT-09. Historical
acceptance requires 116 checks; canonical acceptance requires 98. The same 18
historical-only checks require their actual source artifacts. Clean replay is
not reported as historical acceptance.

## Failed attempts and corrections

No failed attempt is counted as acceptance. Diagnostics are separate from final
logs in the external package. Expected refusal messages inside successful
negative tests are not failed suites.

Initial SQL/proof corrections included the actual `plan_sha256` and
`src_extraction_sha256` column names, a JavaScript date-regex escape, and a
replacement callback to retain literal PostgreSQL `$$` in the forced late-failure
probe. Prisma account lookup used the actual non-unique username API. Each
failed isolated cluster was removed before a fresh run.

Restored regression corrections covered password initialization versus reset,
the pre-Task-3.5B attribution projection, the wrong target-actor assertion,
administration attribution for synthetic native fixture setup, and the default
TEMPORARY grant on copied databases. None changed historical equality checks.
The static guard rejected a runtime client import from a helper; setup moved
to the permitted test entry point, without changing that guard.

Normal sandbox execution intermittently refused Git metadata, Docker access or
tsx/esbuild process spawning. Authorized execution permissions were used;
no automatic-review rejection or safety override was bypassed. A temporary
Prettier file-open error was retried successfully. Installed Prisma 7.9.1 engines
were selected explicitly; no dependency was upgraded or service installed.

## Protected state and migration identity

- New migration: `20260909120000_client_contact_database_boundary`.
- Migration 62 SHA-256:
  `88ab034517f76e152e944f1a0949edc175a286c7bfeefe82fba0672c6b86f6c1`.
- Unchanged migration 60 SHA-256:
  `7921c9b168549928185bfd0b915ccc725ba363787158990c614420e0e3bbbee5`.
- Unchanged migration 61 SHA-256:
  `87e04320badc5bc71de1c30eae02c72f82ae0e59f2088b42cb0806f6b25c8904`.
- Preflight: healthy PostgreSQL 17.11, `litigation` on loopback port 5433;
  61 applied, zero pending/unfinished, one approved historical rollback;
  read-only SQL verification 15/15 and historical `db:check` 107/107.
- Before receipt: 103 complete table projections; table digest
  `a1cfcf53b26f7090831a3c9d186df1ffef3c3229f7d3d4eda3ba85e6f6995251`.
- Full sequence state, including `is_called` and `log_cnt`:
  `ca0392669c0e4d567712487f56f9f635c3d2ba92ad472e10292f403c835a6260`.
- Catalog/role digest:
  `444870ec3eaa42b144b5ffcb7087582da89d49f3ca5a598ca9af038e8f5db6ff`;
  supplemental constraints/indexes/schema/default-ACL/view digest:
  `04663f8497e59079d1f509f226edd3266d79f859c93af9e2893ed834ad7e218c`.
- All 54 logo files are individually verified by ID, byte size and SHA-256;
  total 1,541,428 bytes. No logo was copied into Git or changed.

The receipt covers actual account/audit rows at inspection time; no fixed live
event-count limit is invented. Every fixture wrapper verifies the project's
container identity and existing Docker resource inventories are unchanged.
The final comparison passed. Before-receipt SHA-256 is
`bff173af249e65bcc5d2c441767ac5b3982480328bcd313d3c933b955c4dfc46`;
after-receipt SHA-256 is
`7accf4a2a83a270cf3a85a31de4edfa7ee2f5a508f0ed9f3935dfbf71e2998fd`.
The receipts differ only in repository migration metadata because 62 is now
pending; all protected state compares exactly. Every isolated cluster reports
successful removal of its databases, roles, generated credentials, volume and
network, and no dump file was created.

## Remaining boundaries

Independent Phase 1 review is required next. Project deployment, later client
screens/mutations, Task 4.1a and D43/D51 final cutover remain separate work.
Browser acceptance is intentionally absent from this database phase. Full
Access-based `reconcile:gate4` and the historical 53–60/60→61 source proofs were
not rerun against the wrong source: this mandate prohibits Access access and
the project is already at 61. Their exact guards remain; the affected PostgreSQL
accounting, current audit/event suites and existing staff protections are tested
on new isolated 62 states.

## Exact changed-file inventory

The delivery manifest additionally records per-file additions/deletions and
the full-index patch. The implementation changes exactly these files:

- `docs/DATA-MODEL.md`
- `docs/DATABASE.md`
- `docs/MIGRATION.md`
- `docs/PERMISSIONS.md`
- `docs/PRD.md`
- `docs/task-reports/2026-09-09-task-4-1-phase-1-database-foundation.md`
- `docs/testing/task-4-0a-phase1-invariants.md`
- `docs/testing/task-4-1-phase1-invariants.md`
- `package.json`
- `prisma/migrations/20260909120000_client_contact_database_boundary/migration.sql`
- `prisma/schema.prisma`
- `README.md`
- `scripts/check-db.ts`
- `scripts/lib/audit-event-structure.ts`
- `scripts/lib/audit-structure.ts`
- `scripts/lib/client-contact-catalog.ts`
- `scripts/lib/client-contact-checkpoint.ts`
- `scripts/lib/client-contact-fixture-tests.ts`
- `scripts/lib/client-contact-state-tests.ts`
- `scripts/lib/current-client-fixture.ts`
- `scripts/lib/fixture-migration-checkpoint.ts`
- `scripts/lib/gate4-database.ts`
- `scripts/lib/high-impact-review-workbook.ts`
- `scripts/lib/staff-roster-checkpoint.ts`
- `scripts/lib/staff-roster-structure.ts`
- `scripts/lib/task29-protected-state.ts`
- `scripts/test-audit-events.ts`
- `scripts/test-audit.ts`
- `scripts/test-auth.ts`
- `scripts/test-client-contacts.ts`
- `scripts/test-staff-mutations.ts`
- `scripts/test-staff-read-only.ts`
- `scripts/test-staff-roster.ts`
- `scripts/test-user-management.ts`
- `sql/transform-clients-contacts.sql`
- `TASKS.md`

## Independent-review correction — 9 September 2026

The owner's bounded correction mandate preserves the original implementation
commit and permits exactly one additional local commit, a correction-only patch
and sanitized evidence. The return point is **independent review of the Task 4.1
Phase 1 correction**. No fetch, push, project deployment, Access access, browser
test or later-phase work is included. Two bounded read-only source/test reviewers
reviewed the correction; the primary agent owns all edits and database operations.
Requested configuration remains GPT-6 Astra, High reasoning, in this local
Desktop task. Moderate expected usage was an estimate, not a fixed budget.

Preflight matched clean `main` at `46846646c27746383280ab1dbb074e7f15658c99`,
parent/cached `origin/main` `156d4221b21ee31d2d0dcd3b586a92143a6e1799`, ahead/behind
1/0, no operation or lock, and the exact original 36 files / 2,938 additions /
260 deletions. All three migration hashes above matched. Only Task 4.1 Phase 1
is checked; the overall task, later phases and Task 4.1a remain unchecked.

### Reproduced failures and correction

The shared fixture copier first needed to honor a verified isolated source:
it previously always dumped `litigation-db`, even when the configured connection
pointed at an isolated source. It now binds the actual source connection to its
container/database identity, verifies the existing ownership descriptor, and
copies only that source through read-only, in-memory `pg_dump`. Default operation
still copies the project. No project ACL, role or service setting is changed.

With only that copying correction in place, the otherwise unchanged runners
were exercised against an independently verified full-state clone: 107 checks
at 61, ordinary migration deployment, then 116 checks at 62. All five ordinary
paths failed with `62 !== 61`: `test:audit`, `test:audit-events`,
`test:client-regressions`, `test:staff-read-only`, and its `--project-read-only`
option. These initial failure logs are retained separately from acceptance.

`assertCurrentClientSource` now requires exact historical 61 or 62, reconciles
the complete repository/ledger checksums and actual profile evidence, and checks
the complete staff boundary. At 62 it additionally checks immutable client/contact
imports and valid operational state. `prepareCurrentClientSource` upgrades only
an owned 61 clone; the complete-62 branch never invokes migration deployment or
the old untouched-live-row oracle. The historical 61→62 acceptance path keeps
that oracle and requires exact 61. Earlier staff 60→61 and audit 53–60 source
guards remain unchanged. Canonical replay remains independent and mandatory.

Staff read-only source selection now comes from database evidence, independently
of fixture-borrowing flags. Both ordinary invocation and forced read-only mode
support the exact historical 61/62 states. `HANDOFF.md` and directly affected
command/status documentation now point to this correction's independent review.

The permanent `test-client-regression-source.ts` proof uses an actual 61 source,
verifies one migration invocation for its isolated upgrade, and supplies a callback
that fails if deployment is invoked at 62. Full row, ledger, boundary, sequence and
catalog receipts also prove that 62 preparation changes nothing. Seventeen
transactional negative probes cover partial boundaries, unfinished migrations,
current/prerequisite/earlier checksum defects, hybrid staged source, an unsupported
later ledger, a missing relationship constraint and disabled/unknown boundary
objects. Every probe rolls back and re-establishes exact state equality.

Legitimate runtime gateway changes deliberately edit one imported client and
contact, create one native client/contact pair, archive the contact and parent,
then restore only the parent. All immutable import evidence remains byte-exact;
116 historical checks pass with those live changes retained. That changed database
is the source for the ordinary command acceptance run, not an untouched replacement.

### Correction verification

| Command / proof | Result |
| --- | --- |
| `test-client-regression-source.ts --entry-points` | Pass; 17 negative states with exact rollback; valid 61/62; one deployment invocation for 61, zero for 62; changed 62 source passes 116; source unchanged after all ordinary commands |
| `npm run test:staff-read-only` | Pass on both 61 and changed 62 using ordinary invocation, without a borrowing flag |
| Same entry with `-- --project-read-only` | Pass on changed 62 with forced read-only connections and exact preservation |
| `npm run test:client-regressions` | Full pass from changed 62: authentication/accounts on canonical and restored fixtures, 448 permissions, staff reads/service/races/22 gateway groups, audit/events on both fixture types, 60/60 pure Gate 4 fixtures |
| `npm run test:audit` | Pass through the normal entry from changed 62, including canonical/restored audit and event suites |
| `npm run test:audit-events` | Separate normal entry passes from changed 62, including canonical/restored events and 45,463-event volume/indexed paging proof |
| Historical acceptance command against complete 62 | Expected refusal before upgrade work; no earlier checkpoint manufactured |
| `npm run test:client-contacts` | Strict historical 61→62 and independent canonical replay both pass, including malformed-state refusals, migration atomicity, exact import/unrelated-state preservation and client/contact mutation groups; final invariant totals remain 116 historical / 98 canonical |
| `npm run check` | Entire existing static chain passes, including all semantic/D35 rejection fixtures |
| Final read-only project verification | SQL 15/15 and historical `db:check` 107/107; exactly 61 deployed and migration 62 solely pending |
| Project preservation and isolated cleanup | Before/after receipts byte-identical; all 103 tables, full sequences, catalog, roles/grants, audit evidence, service identity and 54 logos preserved; no fixture container, volume or network remains |
| Scope and documentation-link verification | 12-file correction; 137 protected files byte-identical; all 79 relative links/anchors resolve; prior review artifacts unchanged |

The full regression run supplies evidence for its included suites; those were
not separately rerun outside the three specifically requested command entries.
No production build is necessary for this test-orchestration/documentation-only
correction. No browser or Access-based reconciliation was run.

The initial TypeScript check found an unsupported assertion overload in the new
proof; the supported message overload fixed it before database acceptance.
Sandbox subprocess/status restrictions were resolved through authorized execution
permissions. No automatic approval rejection or safety override was bypassed.
The first complete database proof passed; the five initial old-runner failures
and ordinary tooling failures remain distinguished from passing evidence.

The correction's before and after project receipts both have SHA-256
`7accf4a2a83a270cf3a85a31de4edfa7ee2f5a508f0ed9f3935dfbf71e2998fd`,
also matching the original implementation's final receipt. No new project
migration was applied, and the original patch, evidence ZIP and delivery
manifest remain byte-identical. The correction-only full-index binary patch,
its reverse-application check (without applying it), exact byte size/SHA-256,
file inventory and focused evidence are recorded in a separate delivery
manifest outside Git. Initial refusals, expected negative acceptance and final
passing checks are labeled separately. The single additional local commit is
`fix: preserve current regressions after client boundary`; the required final
state is clean `main`, 2 ahead / 0 behind unchanged cached `origin/main`.
The exact return point remains independent review of this Phase 1 correction.

### Correction file scope

The correction changes exactly these 12 files. Application source, Prisma
schema, every migration SQL file including 62, dependencies/package entries,
lockfile, D1–D57, governance and the older audit/staff upgrade guards are unchanged.

- `HANDOFF.md`
- `README.md`
- `TASKS.md`
- `docs/DATABASE.md`
- `docs/task-reports/2026-09-09-task-4-1-phase-1-database-foundation.md`
- `docs/testing/task-4-1-phase1-invariants.md`
- `scripts/lib/client-regression-source.ts`
- `scripts/lib/current-client-fixture.ts`
- `scripts/lib/isolated-postgres-fixture.ts`
- `scripts/test-client-contacts.ts`
- `scripts/test-client-regression-source.ts`
- `scripts/test-staff-read-only.ts`
