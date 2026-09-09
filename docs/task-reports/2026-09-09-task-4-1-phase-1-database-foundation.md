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
- Final commit: the enclosing single implementation commit, whose full SHA,
  parent, subject, file inventory, patch size/hash and reverse-check result are
  recorded in the external delivery manifest after creation. A commit cannot
  contain its own final hash.
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
