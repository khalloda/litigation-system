# Task 3.3B — Append-only event foundation

- Implemented: 2026-09-02
- Model: GPT-5.6 Sol
- Reasoning effort: High
- Environment: Local
- Subagents/delegation: prohibited; none used
- Expected qualitative usage: high
- Starting commit: `ce6eb1f29ec10f03fbd30e9bf3e2b7fe1c32e6c3`
- Final commit: the single enclosing commit named
  `feat: add append-only audit event foundation`. Its full SHA is reported
  after creation because a commit cannot contain its own content-addressed SHA.
- Push status: not pushed
- Stop point: one focused local Task 3.3B commit, one external binary-safe
  full-index review patch, then stop without beginning Task 3.4.
- Correction: one later focused local commit named
  `fix: close Task 3.3B review gaps`, recorded in the correction section below.
- Schema synchronization: one final focused local commit named
  `fix: synchronize Task 3.3B Prisma model`, recorded below.
- Exact next return point: Task 3.4 — User management, approved but not started,
  only after independent acceptance and owner-authorized push of all Task 3.3B
  commits.

## Run configuration and scope

This was a single bounded local implementation by the project's sole active
development agent. No subagent, browser, cloud task, external application,
Graphify work, dependency upgrade or remote write was used. The owner selected
the model and reasoning configuration because the change crosses PostgreSQL
17.11 security, Prisma 7.9.1, authentication, immutable evidence, redaction,
migration provenance and permanent database checks.

The mandatory preflight fetched `origin` and proved `main`, clean HEAD and
`origin/main` all at
`ce6eb1f29ec10f03fbd30e9bf3e2b7fe1c32e6c3`, 0 ahead/0 behind, with no Git
operation active. Migrations 1–56 were applied and unchanged; Task 3.3A was
complete; Task 3.3B was the first unchecked task; Task 3.4 had not started.
PostgreSQL trigger, fixed-search-path function and transaction-local setting
behavior, plus Prisma interactive-transaction/raw-query behavior, were checked
against primary installed-version documentation before design was fixed.

Decisions **D30** and **D32** authorize the event layer. **D25** preserves
records and permits relationship removal without granting general record
deletion. **D31** and **D34** defer the audit viewer, drawer, export capability
and UI. **D33** and **D35** remain the database-principal and privileged
migration boundaries. No decision, role or permission rule changed.

Implemented:

- chronological row create/update and relationship add/update/remove events;
- field-level bounded/redacted before and after values;
- live authentication success, failure, unknown-user failure and lockout;
- authenticated self-password change and controlled initialization/reset facts;
- atomic typed contracts for database-reversible archive, restore, account
  lifecycle and role-change operations, plus separate server-observed fact
  contracts for future report, export and download operations;
- a truthful single-event deployment baseline; and
- permanent structure, privilege, protected-state and digest verification.

Not implemented: ordinary read/search/list/navigation logging, historical event
fabrication, record-delete support, archive/restore business behavior, user
management, a viewer/drawer/global audit page, audit export, D31's account
capability, report/export/download features or any Task 3.4+ work.

## Migration and changed-file inventory

Migration `20260902180000_append_only_audit_events` is migration 57. Its file
SHA-256 is
`81f42f19bcae73b38805391d0ad80b87d92e4270adbd9578db46016907e04ab0`;
the applied `_prisma_migrations.checksum` is byte-identical. Migrations 1–56
remain byte-identical at their existing recorded checksums.

The complete changed-file inventory in the focused commit is:

- Configuration/schema: `.env.example`, `package.json`,
  `prisma/schema.prisma`, and
  `prisma/migrations/20260902180000_append_only_audit_events/migration.sql`.
- Runtime event/authentication integration: `src/auth.ts`,
  `src/app/change-password/actions.ts`, `src/lib/audit.ts`,
  `src/lib/audit-metadata.ts`, `src/lib/auth/service.ts`,
  `src/lib/auth/session.ts`, and `src/types/next-auth.d.ts`.
- Permanent checks and fixtures: `scripts/check-audit.ts`,
  `scripts/check-db.ts`, `scripts/lib/audit-event-structure.ts`,
  `scripts/lib/audit-source-inventory.ts`, `scripts/lib/audit-structure.ts`,
  `scripts/test-audit.ts`, `scripts/test-audit-events.ts`,
  `scripts/test-auth.ts`, and `scripts/test-permissions.ts`.
- Canonical documentation: `README.md`, `TASKS.md`, `docs/PRD.md`,
  `docs/DATA-MODEL.md`, `docs/PERMISSIONS.md`, `docs/DATABASE.md`,
  `docs/MIGRATION.md`, and this report.

No dependency version, lockfile, governance file, frozen Gate 4 report, prior
migration or historical task report changed.

## Event schema, taxonomy and query contract

Four purpose-specific tables form the foundation:

| Table | Contract |
|---|---|
| `audit_events` | Immutable chronological evidence with a bigint identity and `timestamptz(6)` occurrence time |
| `audit_event_table_rules` | Exact 38-table boundary, each classified as `record` or `relationship`, with structured `id` keys |
| `audit_event_fields` | the frozen 262-rule value/redaction baseline, extended by correction migration 58 to classify all 583 columns in the exact 38-table boundary |
| `audit_event_checkpoints` | Immutable one-event baseline identity plus event and allowlist digests |

Every event records the stable actor and immutable actor key, username/display
name and effective-role snapshots. A distinct target actor and its snapshots
are present where an authentication/administration action targets an account.
Other fields include action/outcome, optional schema/table/structured entity
key, changed-field list, redacted before/after JSON, request and correlation
UUIDs, a separately generated non-secret audit-session UUID, optional
PostgreSQL `inet`, bounded user-agent/device data, bounded attempted username,
resource/reason identity, and bounded parameters/metadata.

The fixed taxonomy is:

- rows: `record_created`, `record_updated`;
- relationships: `relationship_added`, `relationship_updated`,
  `relationship_removed`;
- authentication: `login_succeeded`, `login_failed`, `account_locked`;
- passwords: `password_changed`, `password_initialized`, `password_reset`;
- later typed operations: `archive`, `restore`, `account_created`,
  `account_enabled`, `account_disabled`, `role_changed`, `report_executed`,
  `export_completed`, `download_completed`; and
- deployment: `audit_baseline_established`.

Entity, actor, time and action/outcome indexes order by
`occurred_at DESC, id DESC`. Request and correlation indexes support grouping.
The TypeScript cursor requires PostgreSQL's exact timestamp text and bigint ID;
converting to JavaScript `Date` loses microseconds and was permanently rejected
after a disposable fixture reproduced a skipped equal-timestamp event. No broad
JSON GIN index was added.

## Redaction, minimisation and bounds

The frozen 262-rule allowlist captures 261 values and one redacted change fact
for `user_accounts.password_hash`. Correction migration 58 separately makes
schema coverage exhaustive: 38 entity keys, 152 structural audit columns and
131 exact exclusions with precise reasons bring the current total to 583.
There is no wildcard exclusion for `legacy_*`, JSON, binary or any other naming
pattern; every excluded column is named deliberately, so a future business
column cannot silently disappear from the trail.

Scalar values are preserved only after screening. Structured values and
secret-shaped text become explicit redaction objects. Overlong strings become
objects containing a bounded prefix, `$truncated: true` and the original
character count. SQL `NULL` remains JSON null, an empty string remains empty,
and an unchanged or absent field is omitted.

Enforced limits are:

- allowlisted text: 64–2,048 Unicode characters per field, configured by rule;
- changed fields: 64; entity key: 2 KiB;
- before and after documents: 64 KiB each;
- user agent: 512 characters plus an explicit truncation flag;
- attempted username: 64 characters plus an explicit truncation flag;
- resource identifier: 256 characters; reason code: 64;
- parameters and metadata: flat objects only, at most 32 keys, primitive values
  only, 256 characters per string and 16 KiB per object.

The secret filter rejects or redacts password/hash, token, cookie,
authorization, credential, secret/key, database/connection URL and private-key
markers. Permanent sentinels use recognizable fake password, Argon2 hash,
token, cookie, database URL, API/private-key and binary markers and scan every
JSON string value, request field and error path for leakage.

## Actors and request metadata

- Successful login switches to the validated account's human actor before its
  row update and `login_succeeded` event.
- Failed and unknown-user login uses `system_authentication`. A known target is
  represented separately; typing a username never impersonates that human.
- A lockout transition is its own `account_locked` event.
- Authenticated self-password change uses the validated human as actor and
  target.
- Controlled local initialization/reset uses `system_administration` with the
  account as target.
- The baseline uses `system_migration`.

Request metadata is an opaque server-created value. Request, correlation and
audit-session UUIDs are generated by the server and cannot be selected through
an action argument, form body, username or header. Each successful login gets a
new audit-session UUID independent of the Auth.js JWT/cookie secret.

Human and authentication APIs require that metadata explicitly. The database
does not synthesize missing request, correlation or audit-session IDs. A fully
missing, partial, malformed, zero-ID or leaked transaction context rejects the
event and rolls back the business write. Controlled migration and local
administration paths explicitly create maintenance metadata. Target humans are
resolved inside the reviewed gateway through
`audit_actors.user_account_id = user_accounts.id`; runtime cannot read the
actor table and production code never calculates an actor ID from an account
ID.

`AUDIT_TRUST_PROXY` defaults to `false`. Next.js/Auth.js does not expose the
directly observed peer address on these paths, so IP is truthfully null by
default; `X-Forwarded-For` is ignored. When deployment explicitly enables the
option behind a proxy that replaces the header, only the first syntactically
valid IP is accepted. Non-request maintenance records system device context and
no fabricated network address.

## Append-only and atomic enforcement

Update, delete and truncate triggers protect all four event-foundation tables.
The restricted `litigation_runtime` principal has no direct table or sequence
privilege, ownership, DDL, trigger-disable, event-insert, role-assumption or
internal-write path. It may execute only the reviewed event-context setter and
semantic gateway. Internal capture/write routines are fixed-search-path
`SECURITY DEFINER` functions and are not executable by runtime or `PUBLIC`.

Every one of the 38 application tables has an `AFTER INSERT OR UPDATE` capture
trigger. The eight junction tables also capture deletes as relationship
removals; ordinary record tables keep D25's no-delete boundary. Existing Task
3.3A context and event context are transaction-local. The row write and event
append therefore commit together, and corrupted or missing mandatory event
context rolls both back. The typed atomic wrapper is restricted to the six
database-reversible archive, restore, account and role lifecycle operations.
Report, export and download events remain validated taxonomy entries, but are
separate server-observed facts. PostgreSQL cannot make a filesystem write,
generated artifact, response stream or network delivery atomic; in particular,
`download_completed` does not prove client receipt.

Authentication rejection is intentionally different: its transaction contains
only the failed-login/lockout state and audit evidence, so the event commits
while authentication still returns denial. The dummy verifier remains on the
unknown-username path.

The restricted-principal controls protect against external request spoofing,
ordinary application mistakes and direct runtime SQL. They are not tamper-proof
against the approved PostgreSQL superuser or a fully compromised process that
can invoke PostgreSQL's general transaction-local custom settings. The isolated
D35 superuser and runtime process remain explicit operational trust boundaries.

## Historical baseline and protected state

Historical-live deployment creates exactly one event:

- action/outcome/actor: `audit_baseline_established` / `succeeded` /
  `system_migration`;
- checkpoint: `task_3_3b_baseline`, profile `historical-live`, event ID 1;
- checkpoint event digest:
  `63bb6a28a88b29af10b60a82f14b7763d416df553aa01549e5e51942294e6173`;
- allowlist digest:
  `9e271a6e23bc03e55223db3c0a9be1b0e34867da0af8c6f0acab5614506de11b`.

It records aggregate migration/checkpoint evidence: 45,463 creation
attributions, 45,459 update attributions, four truthful null update actors,
5,209 protected rows and the existing protected, attribution and reconciliation
digests. It states that prior Access change history is unavailable. It contains
no raw source row and does not claim `system_migration` performed historical
human activity. Clean replay also creates one truthful baseline using its empty
profile, rather than pretending the historical-live counts exist.

Protected state remains exact:

- 543 invoices + 597 payments + 47 allocations + 4,022 attendance = 5,209;
- protected digest:
  `b50879f52200275e70515cb4e1daa76594c304237a40b864205108e15490aeab`;
- attribution digest:
  `edf4be9e8668fc65005deaa69cababf79dec1ac1b3e12f2356b9e6da892c009d`;
- pre-Task 3.3B reconciliation checkpoint digest, retained in the baseline:
  `c314cd64142cc2cef36b4dc8a35715db7660fed9d9aba2d06b383e86d2fa54ec`;
- seven actors; 45,463/45,459 attributions; four historical nulls;
- four business roles and all 448 authorization decisions; and
- every billing, attendance, workbook, logo and frozen Gate 4 digest.

The audit checkpoint is a separate proof. It does not replace or recalculate
an older protected digest merely because the new schema exists. At the original
migration 57 implementation checkpoint, the non-writing Gate 4 report digest
was separately
`ef4be031694a8d8c9458925d8f3c337559d77c5805e379a03069d5d1b7666477`;
it differed from the retained Task 3.3A checkpoint only because the proven
repository inventory included migration 57. The correction section records the
current migration 58 report digest. All six business report datasets, source
evidence and frozen Gate 4 evidence remain exact.

## Adversarial reproductions and benchmark

Disposable PostgreSQL databases and roles proved the following concrete risks
closed; the project database was never reset or destructively tested:

1. Runtime event update, delete, truncate, direct insert, internal function,
   trigger-disable, DDL/ownership and `SET ROLE` attempts are refused.
2. Corrupting mandatory event context makes the event fail and rolls back the
   related business write.
3. Password, hash, token, cookie, database URL, API/private-key and binary
   sentinels do not appear anywhere in event rows or emitted errors.
4. Unknown-user login remains denied while its `system_authentication` event
   commits with no fabricated human target.
5. Transaction-local actor/request/session metadata does not leak across pooled
   transactions.
6. Inserts/updates produce one complete event; relationship add/update/remove
   produces one of each and shares request/correlation identity without nested
   duplicates.
7. Client-supplied actor, role, request/session ID, correlation or proxy IP is
   ignored or rejected; the explicit trusted-proxy path alone accepts a valid
   forwarded address.
8. Field, semantic object, username, user-agent and resource limits reject or
   visibly truncate oversized input.
9. Historical-live and clean replay each receive one aggregate baseline, not
   one event per existing row.
10. Protected values, timestamps, counts and digests remain unchanged.
11. Runtime cannot directly invoke the internal privileged append mechanism.
12. Read-only Prisma queries produce no event.
13. Actor/role snapshots remain unchanged after later account changes.
14. The six database lifecycle actions commit their protected callback and
    event together; the three external-operation events append only after a
    truthful server-observed emission point, without claiming external rollback
    or client receipt.
15. Equal-timestamp keyset pages have no duplicate or skipped IDs.

A disposable realistic append benchmark wrote 45,463 semantic events in
9,586.2 ms. A representative indexed 50-row entity-history query completed in
0.220 ms and the plan used `audit_events_entity_newest_idx`. These are local
development-machine measurements, not production latency promises; they show
the chosen access path is indexed at current volume without a speculative JSON
index.

## Task 3.3B correction — 3 September 2026

Independent review identified four bounded gaps. Before editing, disposable
fixtures reproduced each one against migration 57:

1. A future account received ID 5 after an intervening system actor occupied
   actor ID 1005; the real linked human actor was 1006, while production
   arithmetic selected 1005 and the semantic gateway rejected the target.
2. Adding an ordinary column to `lookup_importance` left the permanent checker
   green, and updating only that column committed without an event.
3. Human and authentication writes with no event context committed while the
   database silently generated request, correlation and audit-session UUIDs.
4. The common semantic wrapper and its rollback fixture described external
   report/export/download effects as if PostgreSQL could roll them back.

Forward migration `20260903100000_close_task33b_review_gaps` (migration 58)
closes those gaps without changing migration 57 or any earlier migration. Its
file and applied checksum are
`e6aefa8ef378434062ef18c82f84d218a1f0531c74f10c3845713cce7226579b`.
It preserves all seven actors and the single baseline event/checkpoint. The
frozen 262-rule baseline digest remains
`9e271a6e23bc03e55223db3c0a9be1b0e34867da0af8c6f0acab5614506de11b`;
current classification is independently proved over all 583 columns at digest
`4ebad0a7bc5862dbd537abac05727f4968598c3b30336ee8e9236ba6b653bf0d`.

Permanent fixtures now prove the linked actor for known-user failure, lockout,
self-password change, password initialization/reset and the deliberately
non-arithmetic future account. They also prove unclassified schema and writes
fail closed; captured, redacted, entity-key, structural and excluded categories
behave as documented; missing human/authentication context rolls back; pooled
context cannot leak; and only database lifecycle callbacks are described or
tested as atomic. The three future external event kinds remain server-observed
facts and no database rollback is presented as proof of reversing an external
side effect.

### Post-review Prisma schema synchronization — 3 September 2026

A final bounded review found that migration 58 and the live database agreed,
but the Prisma model still described the migration-57 shape. Before editing,
the migration showed required `classification_reason text` with its temporary
backfill default removed and the default removed from `max_text_characters`.
A read-only `information_schema.columns` query confirmed both columns are
`NOT NULL` with no database default, while `capture_mode` remains `NOT NULL`
with default `'value'::text`. In contrast, `AuditEventField` omitted
`classificationReason` and declared `maxTextCharacters` with
`@default(1024)`.

The Prisma model now maps required `classificationReason` to
`classification_reason`, gives it no default, and removes the obsolete Prisma
default from mapped `maxTextCharacters`. The valid mapped `captureMode`
`@default("value")` is unchanged. No migration or runtime behavior changed.

The permanent audit source check now fails closed unless this exact three-field
contract is present. Its self-test accepts the correct model and separately
rejects a missing, optional or defaulted `classificationReason`, a restored
`maxTextCharacters` default, and a missing or changed `captureMode` default.
This synchronization does not change a classification, baseline, digest,
protected value, task status or return point.

Bounded verification reran Prisma format, validation and client generation;
the complete `npm run check`; the production build; `npm run db:verify`;
all 91 permanent `npm run db:check` invariants; and Git whitespace and scope
checks. The database still reports 58 applied migrations plus the one approved
rollback, seven actors, one baseline event/checkpoint and 583 classified
fields. Migration 57 and 58 retain their exact file and database checksums,
and the protected 5,209-row, attribution, billing, attendance, workbook, logo
and reconciliation evidence remains exact. Only this report,
`prisma/schema.prisma` and `scripts/check-audit.ts` changed; dependency,
lockfile, raw-data, runtime-storage, credential, binary, workstation-path and
disposable-artifact checks found no change. No disposable database suite was
needed or rerun for this static synchronization, and no database write was
performed.

## Verification result

The final focused state passes:

- Prisma format, validation, client generation, TypeScript, ESLint, Prettier,
  RTL, authentication/source, ignore and encoding checks;
- Task 3.3A and Task 3.3B audit fixtures, including historical-live, canonical
  clean replay, atomic migration failure, exact objects/grants, redaction,
  authentication semantics, pooled context, snapshot and keyset cases;
- authentication regressions and the 448-decision permission matrix;
- the non-destructive reset guard and every affected staging, review,
  attendee, matter, relationship, hearing, administration, power-of-attorney,
  document, fee-letter, billing, attendance and client-logo suite;
- all 60 Gate 4 fixtures; historical migration provenance; two independent
  non-writing reconciliations with internal idempotency replay;
- migration deployment/status, database verification and all 91 permanent
  database invariants; and
- production build, Git whitespace check, focused/cumulative diff review,
  secret/raw-data/binary/workstation-path/disposable-artifact scans.

Historical-live provenance is 51 required migrations + seven later
migrations + one approved rollback. The database profile remains
`86eb32a96d97167d6bc699d3576f42c4a6916a53c0a37d557035abd79bd8447f`;
the 58-file repository migration digest is
`95a8ce1f239399397925950f70e4fc8303d6ef46c08a70b88377529a3eb41cf8`.
Two independent reconciliation invocations remain byte-identical at
`4a62f91cce658cd4c33536e2b1d9edc67404df1994eaa1e1d6d383ac558312e9`.

All disposable databases, roles, sessions and files created by the tests were
removed. Final commit, patch identity, clean-tree and ahead/behind proof are
reported externally after this report is included in the single commit.

## Limitations and exact return point

No audit history is visible in the application yet, and no D31 audit export
capability exists. IP addresses are null unless the deployment explicitly opts
into a trusted proxy, because the current framework path does not expose the
peer socket address. Semantic contracts do not implement their later business
workflows. The approved superuser can still alter PostgreSQL; backups and
operational access control remain necessary for defense beyond the application
boundary.

The exact return point is **independent review and owner-authorized push of the
local Task 3.3B commits**. After acceptance, resume at **Task 3.4 — User
management**. Do not start Task 3.4 from this run.
