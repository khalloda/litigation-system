# Task 3.3A — Secure actor attribution

- Accepted: 2026-09-01
- Codex model: GPT-5.6 Sol
- Reasoning effort: High
- Environment: Local
- Subagents: prohibited; none used
- Expected qualitative usage: high
- Least-expensive safe configuration rationale: the owner required this run
  configuration; the migration crosses authentication, PostgreSQL ownership,
  38 application tables and 5,209 protected rows, so the high verification
  cost was warranted.
- Starting commit: `443227f97eba099faecdc8fa0a84ec37afb3cccd`
- Final commit: the single enclosing commit named
  `feat: secure audit actor attribution`. Its full SHA is reported immediately
  after commit creation; a content-addressed Git commit cannot contain its own
  final SHA without changing that SHA, and this task prohibits amending it.
- Push status: not pushed
- Exact authorized stop point: create one focused local Task 3.3A commit,
  export its review patch and stop without pushing or starting Task 3.3B.
- Exact next return point: Task 3.3B — Append-only event foundation, approved
  but not started.

## Run configuration and cost rationale

The work ran as the sole active agent in the owner's existing local checkout.
No subagent, cloud task, browser, external data service or dependency upgrade
was used. PostgreSQL 17.11 and Prisma 7.9.1 were tested as the installed
versions. The project database was never reset or used for a destructive test;
destructive/adversarial cases used exact disposable databases and removed them.

## Approved and prohibited scope

Implemented only D30's Task 3.3A actor layer and D33's database-principal split:
an immutable actor registry, truthful account/system identities, alias audit
columns, exact actor foreign keys/indexes, transaction-local context,
trigger-maintained actor/timestamps, runtime anti-spoofing, historical backfill,
permanent checks and deployment documentation.

No audit-event table, event emission, baseline event, archive/restore handler,
audit viewer/export/capability, user management, Task 4.9 UI, dependency update,
role-policy change, physical deletion or later task was implemented. The four
application roles and all 448 authorization decisions are unchanged.

## Decisions and actor taxonomy

Owner decisions **D30** and **D33** authorize this implementation. The dated
readiness evidence remains unchanged at
[`../reviews/2026-09-01-task-3.3-implementation-readiness-and-scope-reconciliation-audit.md`](../reviews/2026-09-01-task-3.3-implementation-readiness-and-scope-reconciliation-audit.md).

`audit_actors` has exactly seven immutable rows:

| ID/key | Kind | Truthful purpose |
|---|---|---|
| `1` / `system_migration` | system | Migration, import, seed and evidenced backfill work |
| `2` / `system_authentication` | system | Login, failed-login and lockout-state work where no caller authenticated |
| `3` / `system_administration` | system | Controlled local password initialization/reset where a human operator identity is not proved |
| `1001`–`1004` / `user_account:<id>` | human | One stable immutable identity linked to each current account ID |

The two extra system actors are necessary because attributing an unauthenticated
login attempt to its targeted account would impersonate that person, while
using `system_migration` for runtime authentication or local password work would
misstate its purpose. They are not login accounts and do not add a fifth
business role. Authenticated self-password changes use the validated human
actor.

## Principal outputs and changed files

Migration
`prisma/migrations/20260901120000_secure_audit_actor_attribution/migration.sql`
is the 53rd repository migration. SHA-256:
`40de7e27f840805f627e4e75467182c0c9e0bcf974824871ce03bf01e3049ca2`.
The applied `_prisma_migrations.checksum` is byte-identical. No existing
migration or lockfile changed.

The complete changed-file list is:

- Environment, package and database configuration: `.env.example`,
  `package.json`, `prisma.config.ts`, `prisma/schema.prisma`,
  `docker/postgres/verify.sql`.
- Migration and runtime attribution: the migration above, `src/lib/audit.ts`,
  `src/lib/auth/service.ts`, `src/lib/db.ts`, `scripts/lib/migration-db.ts`,
  `scripts/provision-database-principals.ts`, `scripts/check-audit.ts`,
  `scripts/lib/audit-structure.ts`, `scripts/test-audit.ts`,
  `scripts/check-db.ts`.
- Privileged controlled-tool routing: `scripts/apply-attendee-decomposition.ts`,
  `scripts/attach-legacy-workbook-identity.ts`,
  `scripts/auth-set-password.ts`,
  `scripts/backfill-admin-task-created-date.ts`,
  `scripts/build-review-workbook.ts`, `scripts/db-reset.ts`,
  `scripts/import-review-answers.ts`, `scripts/load-staging.ts`,
  `scripts/transform-admin-works.ts`, `scripts/transform-attendance.ts`,
  `scripts/transform-billing-history.ts`,
  `scripts/transform-client-logos.ts`, `scripts/transform-documents.ts`,
  `scripts/transform-fee-letters.ts`, `scripts/transform-hearings.ts`,
  `scripts/transform-matter-relationships.ts`,
  `scripts/transform-powers-of-attorney.ts`,
  `scripts/verify-gate4-migration-provenance.ts`,
  `scripts/write-baseline.ts`, `scripts/lib/gate4-contract.ts`,
  `scripts/lib/gate4-database.ts`, `scripts/lib/read-links.ts`.
- Protected projections and reconciliation: `scripts/lib/billing-baseline.ts`,
  `scripts/lib/client-logo-reconciliation.ts`,
  `scripts/lib/client-logo-structure.ts`,
  `scripts/lib/task29-protected-state.ts`,
  `scripts/lib/task29b-protected-state.ts`,
  `scripts/lib/task29c-protected-state.ts`,
  `scripts/lib/task29d-protected-state.ts`,
  `scripts/lib/task210a-protected-state.ts`,
  `scripts/lib/task210b-protected-state.ts`.
- Updated existing fixtures: `scripts/test-admin-transform.ts`,
  `scripts/test-attendance-transform.ts`, `scripts/test-attendee-audit.ts`,
  `scripts/test-auth.ts`, `scripts/test-billing-transform.ts`,
  `scripts/test-client-logo-transform.ts`, `scripts/test-db-reset-guard.ts`,
  `scripts/test-document-transform.ts`,
  `scripts/test-fee-letter-transform.ts`,
  `scripts/test-hearing-transform.ts`,
  `scripts/test-matter-relationships.ts`,
  `scripts/test-matter-transform.ts`, `scripts/test-permissions.ts`,
  `scripts/test-poa-transform.ts`, `scripts/test-review-import.ts`.
- Current documentation and generated reconciliation evidence: `README.md`,
  `TASKS.md`, `docs/DATA-MODEL.md`, `docs/DATABASE.md`,
  `docs/DECISIONS.md`, `docs/MIGRATION.md`, `docs/PERMISSIONS.md`,
  `docs/PRD.md`, `docs/reconciliations/2026-08-30-gate-4.md`, and this report.
  The report path is
  `docs/task-reports/2026-09-01-task-3-3a-secure-actor-attribution.md`.

## Database result and protected state

- Exact application boundary: 38 tables (37 existing four-column tables plus
  `person_name_alias`). Staging, quarantine, immutable migration evidence,
  infrastructure, registry and future event tables are excluded.
- Population: 45,463 total rows; 45,463 `created_by=system_migration`;
  45,459 `updated_by=system_migration`; exactly four nullable
  `user_accounts.updated_by` historical unknowns.
- Alias proof: 350 rows = 348 protected Stage 2 aliases + two application-native
  aliases. Alias `updated_at` was initialized from its existing `created_at`.
- Protected rows: 543 invoices + 597 payments + 47 allocations + 4,022
  attendance = 5,209. No business/source value or historical timestamp changed.
- Protected audit-excluded digest before/after:
  `b50879f52200275e70515cb4e1daa76594c304237a40b864205108e15490aeab`.
- Separate attribution digest:
  `edf4be9e8668fc65005deaa69cababf79dec1ac1b3e12f2356b9e6da892c009d`.
- Historical billing complete-row digest remains
  `81f1d4176828d109f5af1bd90a397408c32dc967751254e172312de74c330925`;
  identity/timestamp digest remains
  `a4e35c491255067d824aff6085a095d92d02bcf0946490c72c081632d4b200f2`.
- Gate 4 prior-stage protected digest remains
  `7f8af066db3ddc332c9ac7162afd567bbc918a546b22951500725068f2674e36`.
- Client-logo source/result digests remain
  `320d0b7301b5e0cc27ea342fc86c1384dabf7cdb5f5bfe2a38d658bf3268f801`
  and `5fa708e0a5ade8bb1b9b81cc16d4a9a3d225d7226e0043e71968ca128c7bdf1f`.
- Permanent `db:check` invariants: 84 before; 88 after; all pass.

The atomic migration temporarily replaces only the billing/attendance guard
functions with a JSON-equality exception for the two actor columns, completes
the backfill, then restores the exact original definitions before installing
audit triggers or committing. Current-history and canonical replay fixtures
prove the function definitions and trigger enabled states are identical before
and after. Disabling triggers, replication-mode backfill, permanent guard
changes, an application-side-only solution and a superuser web connection were
rejected as broader or bypassable alternatives.

## Database principal and local environment result

`litigation` remains the privileged owner used by `MIGRATION_DATABASE_URL`.
The web `DATABASE_URL` is required to use `litigation_runtime`, which has exact
login/no-superuser/no-createdb/no-createrole/no-inherit/no-replication/no-bypass
attributes, no object ownership, schema creation, actor-registry access,
physical delete or administration/migration context. It has only the exact
38-table `SELECT`/`INSERT`/`UPDATE` and required sequence grants.

The ignored local `.env` gained `MIGRATION_DATABASE_URL`; `DATABASE_URL` was
changed to the runtime principal and received a newly generated local password.
`db:provision-runtime` applied and verified it. No URL, password or value was
printed, documented or committed.

## Verification and exact results

- Mandatory Git preflight after `git fetch origin`: `main`, clean,
  HEAD/origin `443227f97eba099faecdc8fa0a84ec37afb3cccd`, 0 ahead/0 behind, no Git
  operation — PASS.
- Pre-edit catalog/baseline capture: 37 + alias boundary, 45,113 + 350 rows,
  all actor cells null, no actor FKs/registry, four accounts, privileged current
  principal and exact 5,209 protected rows — PASS.
- Disposable defect reproduction: missing/arbitrary/spoofed actors and direct
  SQL timestamps accepted; session context leaked; auth attribution absent;
  protected backfill refused; superuser trigger bypass reproduced — PASS as
  expected negative evidence; fixture removed.
- `npx prisma format`, `npx prisma validate`, `npx prisma generate` — PASS.
  Initial sandbox engine/spawn failures were invocation-environment failures;
  the same commands passed with approved local subprocess access.
- `npm run db:prepare-local-runtime`, `npm run db:migrate:deploy`,
  `npm run db:provision-runtime`, `npm run db:migrate:status` — PASS; 53
  migrations applied and runtime credential verified without output.
- `npm run db:check` — initial integration run 86/88 because legacy billing and
  logo structure projections included new actor structure; corrected without
  changing baselines. Final result: 88/88 PASS.
- `npm run test:audit` — initial runs found Prisma `void` deserialization and a
  non-cascading truncate test expectation; both tests were corrected. Final
  result: historical-live clone and canonical clean replay, context isolation,
  concurrency, spoof overwrite, Prisma/direct SQL/multi-row/junction/nested
  trigger paths, registry immutability, runtime bypass refusal and residual GUC
  boundary — PASS; all fixtures removed.
- `npm run test:auth` — an initial fixed-ID assertion was corrected to the
  selected account's stable actor. Final authentication, lockout, password and
  exact structure suite — PASS.
- `npm run test:permissions` — final 448-decision matrix, direct 401/403,
  wrapper, lifecycle and task-boundary suite — PASS.
- `npm run test:guard` — 12 parser and 10 guard cases; 9 fully proved and the
  pre-existing empty-volume case honestly remained reduced because the project
  volume contains data. Nothing was destroyed.
- `npm run test:review-import`, `npm run test:attendee-audit`,
  `npm run test:matter-transform`, `npm run test:matter-relationships`,
  `npm run test:hearing-transform`, `npm run test:admin-transform`,
  `npm run test:poa-transform`, `npm run test:document-transform`,
  `npm run test:fee-letter-transform`, `npm run test:billing-transform`,
  `npm run test:attendance-transform`, `npm run test:client-logo-transform` —
  PASS. Intermediate projection failures in administrative, logo and Gate 4
  fixtures exposed actor-only serialization assumptions; final stable
  projections preserve the old digests and the reruns pass.
- `npm run test:gate4` — 60/60 PASS; every task-owned fixture removed.
- `npm run verify:gate4-migrations -- historical-live` — PASS; 51 required +
  two later migrations + one approved rollback, no unaccounted row/file.
- Two original-acceptance `npm run reconcile:gate4` runs — byte-identical PASS;
  then-transient report digest
  `feae9da499509777b66f277e58b6e3cf353708d6e70e7a0db52cdb9cc4e498ce`;
  all six dataset counts/digests unchanged. The acceptance-gap correction below
  supersedes that transient inventory without rewriting the frozen 30 August
  evidence.
- `npm run build` — PASS; Next.js 16.3.1 production build completed.
- `npm run db:verify` — PASS: PostgreSQL 17.11, UTF-8/ICU/extensions, 53
  migrations, restricted runtime, seven actors and 38 audit triggers.
- `npm run check` initially reported seven formatting-only files; Prettier
  corrected them. Final typecheck, lint, formatting, RTL, authorization, audit
  input/principal scan, ignore and encoding gates — PASS.
- Final migration status, database checks, scans, Git diff/staged review,
  fixture absence and patch evidence are completed and reported externally
  after this report is frozen into its single commit.

## Unresolved items and residual boundary

PostgreSQL permits the shared runtime process to call the general `set_config`
primitive directly. External requests cannot supply actor/role/system identity,
all normal helpers are fixed or account-validated, and the runtime cannot edit
the registry or protected functions; however, a fully compromised application
process can still set a custom actor GUC. This is documented residual process
trust, not cryptographic attribution against that compromise.

Task 3.3B events, D31 export capability, audit UI, archive/restore and Task 3.4
remain unimplemented. No new owner decision is required for the exact next
return point.

## Acceptance-gap correction — 1 September 2026

This subsection records the first correction commit. Its “complete” source and
database-principal inventory claims are superseded by the final
enforcement-inventory completion below; its password, frozen-evidence and
initial fail-closed corrections remain valid evidence.

The focused forward correction starts directly from Task 3.3A commit
`06eaee395d1eb28e8a32cb9245304aa8e070ae5d` and does not amend or replace it.
The correction commit is named `fix: close Task 3.3A acceptance gaps`; it is
local only. Task 3.3B remains not started.

### Four reproduced defects and their closure

1. The previous source checker accepted all four disposable bypass classes:
   request-controlled `FormData` human selection under the innocuous key
   `person`; a raw human-context call in a service outside `src/app`; direct
   `set_config`, `SET LOCAL`/`SESSION` or actor-GUC use outside the gateway; and
   system-context selection outside authentication. The replacement uses the
   TypeScript AST over every applicable JS/TS extension below `src`, excludes
   only the exact generated Prisma subtree, and requires exact reviewed gateway
   and call-site inventories. Fourteen permanent negative fixtures cover direct,
   aliased, dynamic, CommonJS, re-exported, computed, raw-SQL and
   request-controlled paths; three positive fixtures prove legitimate use.
2. A disposable `NOINHERIT` role with a `SET`-enabled membership passed the old
   attribute/grant checks and successfully executed `SET ROLE`. The complete
   boundary now rejects direct and indirect memberships, `pg_has_role(...,
   'SET')` to every other role, role/database settings, ownership, all effective
   relation and sequence access, and all executable project
   `SECURITY DEFINER` routines. Adversarial fixtures prove every class without
   ever granting membership to the real runtime role.
3. The earlier commit changed six migration-evidence lines in the frozen
   [`2026-08-30 Gate 4 report`](../reconciliations/2026-08-30-gate-4.md). The
   report is restored byte-for-byte to parent `443227f`, and both corresponding
   historical digest/inventory references in [`MIGRATION.md`](../MIGRATION.md)
   are restored. Current reconciliation no longer writes that dated file.
4. A non-secret disposable reserved-character password proved that
   `URL.password` is percent-encoded while the PostgreSQL driver authenticates
   with the decoded value; the previous `ALTER ROLE` therefore set a different
   password. Provisioning now decodes exactly once, safely quotes the decoded
   value, logs no secret, and proves both reserved-character and existing
   generated base64url credentials by successful disposable connections.

### Forward migration and fail-closed deployment

Migration `20260901170000_close_task33a_acceptance_gaps` is the 54th repository
migration. Its SHA-256 and applied checksum are
`80133981c148edc6daec81474b4c86e470e3aab7bb5c64404cb26e661f16cb4d`.
Migration 53 remains byte-identical at
`40de7e27f840805f627e4e75467182c0c9e0bcf974824871ce03bf01e3049ca2`;
all earlier migration paths are unchanged.

Migration 54 first commits `NOLOGIN` and revokes target-database `CONNECT`,
then terminates existing runtime sessions. Its second transaction revokes the
global default `PUBLIC EXECUTE` on future owner functions and validates the
complete role graph, settings, ownership, effective grants and exact three
approved executable security-definer functions. Only after every assertion
passes does it restore login and connection access. Any failure leaves the
application role unusable, rolls back the second phase and never silently
removes unexpected external membership, ownership or grants.

### Frozen and current reconciliation evidence

- Frozen 30 August report: exact parent `443227f` content; raw file SHA-256
  `515d035ead67553105af26eeb0d0546e15651d7d2066f0e2919846e98d4803c6`;
  stable generated-report digest
  `dbad78347cd092395349f921dd309b1fc4e05eead24add76aef1a3cb9ccf047b`;
  52-file historical inventory.
- Current evidence: 54-file migration inventory digest
  `9dc23762f58ae0d04e2623bb79dd1d8acaf84ec6c6bd4f3555a56da173207eb4`;
  51 required Stage 2 + three later migrations + one approved rollback.
- Two separate non-writing current Gate 4 commands, each with its own internal
  idempotency replay, produced byte-identical transient digest
  `4849b03f8c33a08242e5ad31368e140b7a49096469212c3028180e250e963b7c`.
  The frozen report hash was identical before and after both runs.

### Correction changed-file inventory

- `TASKS.md`
- `docs/DATABASE.md`
- `docs/MIGRATION.md`
- `docs/reconciliations/2026-08-30-gate-4.md`
- `docs/task-reports/2026-09-01-task-3-3a-secure-actor-attribution.md`
- `package.json`
- `prisma/migrations/20260901170000_close_task33a_acceptance_gaps/migration.sql`
- `scripts/check-audit.ts`
- `scripts/lib/audit-source-inventory.ts`
- `scripts/lib/audit-structure.ts`
- `scripts/lib/database-principal.ts`
- `scripts/provision-database-principals.ts`
- `scripts/test-audit.ts`

### Correction verification snapshot

Prisma format/validate/generate; the full static check and audit self-tests;
historical-live and canonical-clean-replay audit migrations; authentication;
all 448 permission decisions; the reset guard; every affected staging, review,
transform and reconciliation fixture; Gate 4's 60 fixtures; migration status;
database verification; all 88 permanent invariants; and both current Gate 4
reconciliations pass. The final build, staged-diff review, repository/content
scans, fixture-absence proof, commit identity and review-patch identity are
reported after this Markdown is included in the focused commit.

## Enforcement-inventory completion — 1 September 2026

This final Task 3.3A correction starts directly from commit
`73995da744ce725b5e1647d4b3e5c6c03b42c46c`, preserves both earlier local
commits, and is committed as `fix: complete Task 3.3A enforcement inventory`.
It does not start Task 3.3B.

### Reproduced gaps and permanent closure

The earlier source checker accepted six disposable bypass classes: a local
alias/wrapper carrying `Number(formData.get('person'))`; helper re-export or
wrapping through the auth service; resolver-equivalent audit paths; ImportEquals,
CommonJS and variable dynamic loading; runtime-assembled raw SQL; and a
resolver-proved project module outside `src`. The replacement uses the installed
TypeScript compiler resolver and symbol graph, enforces the canonical source
root, follows aliases and re-exports, fixes the exact helper and raw-SQL call
inventory, and rejects computed module or execution paths. Seventeen permanent
negative fixtures fail and two legitimate fixtures pass across all eight JS/TS
runtime extensions; the exact generated Prisma subtree is the only executable
source exclusion.

Disposable PostgreSQL 17 roles and objects proved the previous database check
missed an inbound role path, `PUBLIC SELECT`, `PUBLIC EXECUTE`, column-level
`SELECT`/`INSERT`/`UPDATE`/`REFERENCES`, `MAINTAIN`, and parameter `SET` that
allowed replica mode to suppress an ordinarily enabled trigger. Permanent
fixtures now reject both membership directions, unapproved ACL provenance,
every relation/column/sequence/function path, extra project schemas, all eight
table privileges, and both `SET` and `ALTER SYSTEM` capability for
`session_replication_role`. The real runtime also fails an execution attempt.

### Migration 55 and permanent evidence

Forward migration
`20260901190000_complete_task33a_enforcement_inventory` is the 55th migration.
Its file and applied checksum are
`0c16867c5ef57b87aac57b929134e90b450cbf4339eeb78c02afd0c748d6c4b4`.
It commits runtime `NOLOGIN` and removes its direct target-database `CONNECT`
grant before validation, terminates only target-database runtime sessions, and
restores login/direct access only when the exact expanded boundary passes. A
disposable-role execution of the same migration program proves an unexpected
`PUBLIC` ACL leaves that role unavailable. No unexpected real condition was
found or repaired.

Permanent verification is now 89/89. All seven actors, the
45,463/45,459/four attribution population, 448 authorization decisions, D30–D34,
the four business roles and every protected row/digest remain exact. Migrations
53/54 and the frozen Gate 4 report remain byte-identical. The complete final
command, content-scan, commit and patch evidence is reported externally after
this dated report enters the focused commit.

### Material tools and primary sources

The repository, installed TypeScript/Next.js packages, PostgreSQL 17.11
catalogs and executable disposable fixtures were primary evidence. Context7 was
used only to confirm the official TypeScript Compiler API resolver/symbol-alias
semantics and PostgreSQL 17 membership, ACL, `MAINTAIN`, parameter-privilege and
`session_replication_role` semantics. The installed security finding-fix
workflow supplied the reproduce–correct–verify discipline; it did not override
`docs/DECISIONS.md`. No plugin was installed, no external account was connected,
and no subagent or browser was used.

The exact next return point remains **Task 3.3B — Append-only event foundation,
approved but not started**.
