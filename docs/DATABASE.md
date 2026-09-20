# The database — running it, checking it, fixing it

## Task 4.9 candidate only — actual checkpoint stays 72

Forward candidate `20260920140000_audit_history_capability` adds three private
purpose-specific capability/change/export-receipt tables, three narrow runtime
gateways and exact permanent integrity checks. It adds no sequence and changes
no business row. The existing action constraint gains only
`audit_export_granted` / `audit_export_revoked`. Migrations 1–72 are unchanged.
Only independent disposable PostgreSQL clusters have received it. The owner
database, accepted Task 4.8 process and credentials remain at the actual state
described below; future operation needs a separate explicit authorization.

Candidate `db:check` distinguishes completed migration 73 from actual migration
72 and verifies exhaustive private-object classification, exact function and
grant boundaries, constraints/indexes/triggers and bidirectional capability and
export-receipt correspondence. No old protected baseline is regenerated.

## Current actual migration 72 — 20 September 2026

`20260918100000_billing_arabic_labels` was applied once through the guarded
migration command at 09:58:47–09:58:54 UTC, after exact fresh-dump rehearsal.
The actual checkpoint is 72 completed migrations (73 ledger records, preserving
the legitimate older rolled-back entry), 138 non-system tables and 48 sequences.
All 148 historical checks and 15 setup checks passed. Eleven lookup labels and
their update timestamps changed; eleven successful label-only audit events were
added, the audit counter advanced by 11, and one successful ledger row was added.
Every prior audit/ledger row, all business/source data and links, all complete
sequence vectors, catalog/grant definitions and account/credential state stayed
exact. Actual post-activation/read-only owner-session captures also compare equal.

Recovery remains protected locally at
`D:\Projects\LitigationData\DB-Backup\migration63\pre-migration 72-20260920T091457Z-0e0368fb`.
The runtime remains the restricted `litigation_runtime` principal with unchanged
inherited SQL grants; application read-only is not an all-table SQL privilege
revocation. D59's existing accepted risk is unchanged, not technically remediated.
See the [operational report](task-reports/2026-09-20-task-4-8-acceptance-activation.md).
Earlier candidate/not-applied/migration-71 and old runtime statements below are
dated historical checkpoints superseded here. Do not repeat migration 72.

## Task 4.8 candidate migration 72 — not applied to the owner

`20260918100000_billing_arabic_labels` requires the exact migration-71 prestate
and eleven original codes with NULL labels. In one transaction it sets only
D67's approved `label_ar` values and required lookup update attribution/times.
The existing audit machinery appends eleven truthful events and advances its
transactional `_migration.matter_lifecycle_audit_counter`; no sequence, grant,
financial row or new schema object is needed. The migration ledger adds one
successful migration. The original migrations 1–71 and historical billing
digests remain unchanged. DB-094 permanently checks exact code-label mappings
in both historical and canonical profiles, in addition to the prior checks.

The runtime principal's inherited billing SELECT/INSERT/UPDATE and sequence
SELECT/USAGE grants are unchanged; they are not an all-table SQL read-only role.
Imported rows retain database immutability and null-safe provenance guards.
Native billing is read-only at the application boundary: no mutation gateway
or endpoint, five guarded pages, explicit DTOs and fresh current-user checks
inside repeatable-read read-only transactions. DELETE/TRUNCATE, sequence
`setval`, private migration data and migration-context access remain denied.

## Current Tasks 4.6–4.7 local acceptance and activation — 17 September 2026

Accepted migration `20260916180000_documents_fee_letters_boundary` is now the
actual local-development migration 71. A fresh restricted migration-70 recovery was
restored and rehearsed on an isolated PostgreSQL 17.11 copy before one actual apply.
The exact delta is 128→138 non-system tables, 70→71 completed migrations, ten new
private `_migration` tables, seven audit fields and no new sequence. All 48 complete
sequence vectors and all pre-existing business values remained exact; account,
credential, session, configuration and 54-logo checks passed. The permanent gates
passed 147 historical checks plus 15 setup checks.

Accepted source `3f0c6c6fc7d41296c8b55f7454cc9c82ec6fcdfb`, build
`3OBUE7ppFmV5DINhNdi0s`, runs from the stable external artifact at
`http://127.0.0.1:3000` using the unchanged restricted runtime principal. Fresh
authenticated read/navigation/form/Cancel checks exercised Documents, Fee letters,
covered-matter membership and the separate matter-side reference editor. No owner
business write occurred and the complete post-smoke database digest matched the
immediate post-migration digest. Both archived filters correctly returned zero;
actual restore-screen observation was therefore unavailable and remains isolated
proof.

Tasks 4.6 and 4.7 are locally accepted and checked after the independent PASS of
T4647-R1–R6. Task 4.7a and Task 4.8 remain unchecked. See the
[acceptance report](task-reports/2026-09-17-tasks-4-6-4-7-acceptance-activation.md),
[independent review](reviews/2026-09-17-tasks-4-6-4-7-3f0c6c6-independent-review.md)
and [matrix](testing/tasks-4-6-4-7-combined-acceptance-matrix.md). Publication is
recorded externally; stop for independent operational-delivery review.

## Historical Task 4.5 A1 correction and local closure — 16 September 2026

T45-A1 is corrected and locally verified at `b7fc7c7a6afc412ad5a8dc42d72ef2109380b1fb`.
Clear now resets every visible filter and discards unsent drafts, including at the
bare list URL; the next Search cannot reapply cleared selections. Four-role
production-browser navigation proof and the full project checks passed.
The corrected stable build `WvgH-6nuin9o1QPJrPst4` is active on
`http://127.0.0.1:3000`. Anonymous and existing-session read/Cancel checks passed.
Migration 70 was freshly verified with 141 historical and 15 setup checks;
**no migration was applied in this correction**. Owner state and credentials stayed exact.

Task 4.5 is locally accepted/closed under the owner's combined mandate;
**final independent review is pending**. All 86 checkbox lines remain unchanged:
4.4 and 4.5 checked, 4.6 unchecked. See the [A1 closure report](task-reports/2026-09-16-task-4-5-a1-closure.md)
and [prior readiness review](reviews/2026-09-16-task-4-5-cd89148-closure-readiness-review.md).
The documentation child and ordinary publication are identified in external
post-publication receipts. Earlier findings and checkpoints below remain history.
No Task 4.6, Ubuntu deployment or Access cutover.

## Historical Task 4.5 local acceptance and activation — 16 September 2026

Khaled Helmy accepted the complete D64 powers-of-attorney module at `e4806160bf70184526e3a8bc10e18b0d7e6f953f`
and the [independent correction PASS](reviews/2026-09-16-task-4-5-e480616-independent-correction-review.md), closing T45-R1 and T45-N1.
The fresh protected backup and isolated restore/rehearsal passed. Only reviewed
migration 70 was applied to the actual local development database: 141 historical
invariants and 15 setup checks passed. The accepted source runs at
`http://127.0.0.1:3000`, build `lMSctpvPZP2Yn99F0XmmD`, from its stable external artifact.
All prior accepted functionality and the complete POA module are active.

Task 4.4 remains checked; Task 4.5 is now checked under the owner's bounded local
acceptance. Task 4.6 remains unstarted. Actual anonymous health and exact-build
isolated authenticated proof passed. Actual authenticated owner observation:
**PASS_WITH_FINDING**; see the [acceptance/activation report](task-reports/2026-09-16-task-4-5-acceptance-activation.md)
for its precise scope and any remaining observation gap.
The approved ordinary publication follows this documentation child; its final SHA,
fresh remote outcome and final runtime observation are bound by external receipts.
The return point is independent combined acceptance/activation/publication review
in the same task. Earlier dated candidate, unchecked and unstarted statements below
describe historical checkpoints. No Task 4.6, Ubuntu deployment or Access cutover.

Everything here works the same on the Windows laptop and on the Ubuntu server.
You need Docker installed and running; nothing else.

---

**Historical documented checkpoint — 15 September 2026:** actual migration 69
was completed and accepted Task 4.4 Phase 3 source `2966570` was activated from
its frozen artifact, build `LyN77RMhXZbOvG44OcUhg`, on loopback port 3000.
That accepted source and its activation record were published through `b39a7a1`.
Use the frozen artifact/start evidence in the
[Phase 3 activation report](task-reports/2026-09-15-task-4-4-phase-3-acceptance-activation.md).
The later [combined independent review](reviews/2026-09-15-task-4-4-phase-3-activation-publication-independent-review.md)
and [final acceptance record](task-reports/2026-09-15-task-4-4-final-acceptance.md)
record the separate authenticated supplement, P3-A1 correction and Task 4.4 closure.
These are dated activation and review records, not continuous runtime monitoring.
Earlier pending-migration milestones below are historical and do not authorize
repeating a deployment or reset.

## Everyday commands

**Historical local activation — 13 September 2026:** the actual database is at 65
applied migrations, one historical rollback and zero unfinished. Accepted app
`9b09f0d` runs on `http://127.0.0.1:3000` from its frozen external artifact.
The fresh protected backup and isolated 63-to-65 restore/upgrade rehearsal passed;
actual validation passed 125 invariants and 15 setup checks. Migration 66 and
Phase 2 app code are unactivated pending review. Use the task-specific frozen
start/stop helpers recorded in the Phase 2 report, not an edited-checkout build
or deploy command, for this accepted running app. The dated checkpoints below
remain historical.

**Task 4.2 Phase 2 checkpoint — 12 September 2026:** the real development
database remains at 63 applied migrations, one historical rollback and zero
unfinished. Migration `20260912120000_matter_editing_boundary` (64) is pending
and has been executed only on identified disposable database copies. This
implementation does not authorize applying it to development or production or
replacing the running migration-63 app. Independent Phase 2 review is next.
The new editor requires migration 64; the existing owner runtime continues using
its separate migration-63 artifact.

At 64, `db:check` dispatches the exact historical/canonical boundary: 125
historical invariants or 107 canonical invariants. Original matter reconciliation
uses immutable initial projections; separate checks validate current aggregates,
continuous change/audit history, exact gateways, grants and completion triggers.
The Task 4.2 fixture commands use full-state owned copies and remove only their
positively identified resources. `test:matter-mutations`,
`test:matter-mutation-browser` and `test:matter-canonical` require an external
`MATTER_MUTATION_EVIDENCE_DIR`; browser verification also requires the installed
full Chromium/Playwright paths recorded in the Phase 2 report. They must not be
redirected at a real database.

Run these from the project folder.

| What you want | Command |
|---|---|
| Start the database | `npm run db:up` |
| Apply any new schema changes | `npm run db:migrate` |
| Prepare an existing local `.env` for separate principals | `npm run db:prepare-local-runtime` |
| Apply/verify the runtime login password from ignored `.env` | `npm run db:provision-runtime` |
| Check the app can use it | `npm run db:check` |
| Check the database itself | `npm run db:verify` |
| Stop it (keeps all data) | `npm run db:down` |
| Watch what it is doing | `npm run db:logs` |
| Open a database prompt | `npm run db:psql` |
| Browse the data in a window | `npm run db:studio` |
| **Wipe it and start over** | `npm run db:reset` |

From nothing to a working database:

```bash
npm run db:up                # start PostgreSQL
npm run db:migrate           # privileged URL builds the schema and runtime role
npm run db:provision-runtime # set/verify the restricted login password
npm run db:check             # confirm the application can use it
```

`npm run db:up` waits until the database is genuinely ready before it returns.

## The one dangerous command

**`npm run db:reset` destroys everything in the database and cannot be undone.**
It exists because loading the Access data will be attempted many times before
it is right, and each attempt needs a clean database.

It will not run unless it can show that it is safe. Three checks:

| It checks | If it fails | Can you override it? |
|---|---|---|
| Is this machine marked `production`? | refuses | **No. Never.** |
| Is the database on this machine? | refuses | **No. Never.** |
| Does the database hold any rows? | refuses, listing each table and its count | Yes — see below |

Refusing on a non-empty database looks like this (using the 19 August 2026
shape figures only as an illustration):

```
REFUSING TO RESET THE DATABASE

The database is not empty: 13,592 rows across 2 of 3 tables.

  clients   313 rows
  hearings  13,279 rows

  All of it will be destroyed and cannot be recovered.

If you are certain, run:
    npm run db:reset -- --force-i-know
```

The override has to be typed by hand every single time. **It is never put into
a script or an npm command**, so it can never fire by accident.

### Why "is it local?" is not enough on its own

On the Ubuntu server the database runs in a container on that same machine, so
its address is `localhost` there too. The location check alone would let this
command run happily against the firm's live records.

That is what `APP_ENV` is for. **The server's `.env` must say
`APP_ENV=production`**, and then `db:reset` refuses outright with no way
through. This is set up as part of task 7.1.

### What the guard checks

`npm run db:reset` deletes the whole Docker **volume**. A volume holds a
PostgreSQL cluster, and a cluster holds several databases — `litigation`, the
built-in `postgres`, and anything else in there. All of them go.

So the guard asks the **container** what is inside, rather than trusting the
address in `.env`:

| It checks | If it fails | Override? |
|---|---|---|
| `APP_ENV` says exactly `development` | refuses | **No** |
| the address is on this machine | refuses | **No** |
| the address names the expected database | refuses | **No** |
| the container can be listed at all | refuses | **No** |
| the address reaches that same container | refuses | **No** |
| **every database in the volume is empty** — every schema of every one | refuses, listing each table | Yes |

**Why it is built this way.** This guard was wrong three times, and each time
it inspected something *next to* what it destroys:

1. It counted only the `public` schema — so data staged in `stg` was
   invisible, and from Stage 2 that is where the extracted Access data lives.
2. It counted whatever `DATABASE_URL` reached, which could be a different
   server, then deleted this container anyway.
3. It compared the cluster identifier, which fixed (2) — but every database
   inside one cluster shares that identifier. Aiming `DATABASE_URL` at the
   empty built-in `postgres` database, in this very container, passed every
   check and destroyed five rows in `litigation`.

`npm run test:guard` runs nine cases covering all three, and never destroys
anything: it uses `--dry-run` for the one case where a reset should be
allowed, and it refuses to run at all if the database holds data it did not
create itself.

### What the guard cannot protect you from

The guard lives in `npm run db:reset`. Running `docker compose down -v` by hand
does the same damage with none of the checks. Use `npm run db:reset`; that rule
is written into `CLAUDE.md` as well.

Separately, Prisma refuses its own destructive commands when an AI agent
invokes them and requires a person to say yes each time. That guard stays on
too.

---

## What "correct" means — `npm run db:verify`

Every line must read **PASS**:

```
| PostgreSQL version          | 17.11    | PASS |
| Encoding                    | UTF8     | PASS |
| Default collation provider  | icu      | PASS |
| Database locale             | ar-EG    | PASS |
| Named collation "arabic"    | ar-EG    | PASS |
| Stock ICU Arabic collations | 29       | PASS |
| Extension pg_trgm           | 1.6      | PASS |
| Extension btree_gin         | 1.3      | PASS |
| Extension unaccent          | 1.1      | PASS |
| Migrations applied          | 52 applied, 1 rolled back | PASS |
```

### About that last line

At the 1 September 2026 continuity checkpoint, "**52 applied, 1 rolled back**"
is normal and says **PASS**. The applied count will grow as later migrations
are added, so trust the command's PASS/FAIL result rather than treating 52 as a
permanent target. A rolled-back migration is one that was attempted, refused,
and cleanly undone — it left nothing behind and a later migration did the job
properly. This database has one approved historical rollback, from 21 August
2026.

The line only says **FAIL** when a migration **started and never finished**,
which is different and is dangerous: the schema may be half-built. If you ever
see `UNFINISHED` on this line, stop and say so — do not run anything else
against the database.

### PostgreSQL catalog-definition maintenance

The strict catalog-definition checks introduced in commit `92d5c3f` were
verified against **PostgreSQL 17.11**. Keep them strict: they protect the full
definitions of constraints, indexes, triggers and trigger functions, not just
object names or counts. The task 2.7 post-review correction applies the same
rule to all three relationship-provenance CHECKs, all five relationship unique
indexes, all four reviewed-rule foreign keys, both evidence triggers and both
complete trigger-function bodies.

A future PostgreSQL major version may change how `pg_get_constraintdef`,
`pg_get_indexdef` or `pg_get_triggerdef` formats the same database semantics.
If one of these checks fails after an upgrade, compare the actual object
semantically and review its complete definition before changing the expected
string. Never automatically accept the newly formatted output, and never
weaken or remove the check merely to make an upgrade green.

The four Task 2.9 transform writers also run their respective complete catalog
checks inside each serializable apply transaction, once before any write and
again before commit. This turns catalog drift into a refused or rolled-back
transform rather than something discovered only by the next separate
`db:check` run. The expected definitions remain the reviewed PostgreSQL 17.11
strings and are maintained under the same major-upgrade rule above.

It then prints the same four Arabic names sorted two ways, which shows why this
matters:

```
correct (ICU)          wrong (plain byte order)
  إبراهيم                أحمد
  أحمد                   إبراهيم
  احمد                   احمد
  بسام                   بسام
```

`أحمد` and `احمد` are the same name; one was typed without the hamza. On the
left they sit together, where someone reading a client list expects them. On
the right the computer has put another name in between, because it is comparing
raw character numbers and the hamza form is a different character.

**This is about the order of a list, not about finding things.** Typing `احمد`
and finding `أحمد` is a separate mechanism — the search normaliser, task 1.6.

---

## Why the port is 5433 and not 5432

5432 is the usual PostgreSQL port, but **this laptop already runs another
PostgreSQL on 5432** — the ZKBioTime staff attendance system. That is a live
system and this project does not touch it.

So the litigation database uses **5433** on both machines. One number, one set
of instructions, no clash.

The database listens on `127.0.0.1` only. Nothing on the office network or the
internet can reach it directly, whatever the password is.

---

## Two layers, and which owns what

There is a line between what Docker sets up and what Prisma sets up, and it is
drawn where it is for a reason.

**Docker, once, when the database is first created** — the things a later
change can never fix, because they are fixed when the database is built:

- the character encoding (UTF8)
- the collation provider (ICU)
- the locale (`ar-EG`)

If any of these is wrong, Arabic is stored or ordered incorrectly for the life
of the database and the only remedy is to build it again. So
`docker/postgres/initdb/01-check-cluster.sql` **checks** them and refuses to
start otherwise. It creates nothing.

**Prisma migrations, replayable at any time** — everything inside the database:
extensions, the `arabic` collation, and every table.

Why not put the extensions in the Docker script too? Because
`prisma migrate reset` rebuilds the whole schema, and anything created outside
a migration is thrown away and never comes back. The database would look
correct on the day it was built and quietly lose its Arabic sorting the first
time someone reset it.

**This was tested, not assumed.** A second collation was created by hand,
outside any migration, alongside the migration-owned one. After
`prisma migrate reset`:

| | before | after |
|---|---|---|
| `arabic` — owned by migration 0001 | present | **present** |
| `made_outside_a_migration` — created by hand | present | **gone** |
| `pg_trgm`, `btree_gin`, `unaccent` | present | **present** |

The hand-made one did not come back and nothing reported an error. That is the
failure this arrangement prevents.

### Changing the schema

Edit `prisma/schema.prisma`, then:

```bash
npm run db:migrate
```

That writes a new numbered folder under `prisma/migrations/` and applies it.
**Commit the migration folder.** The Ubuntu server is brought to the same state
by replaying them in order with `npm run db:migrate:deploy`.

Never change a migration that has already been applied anywhere. Write a new
one.

---

## Separate database principals — final Task 3.3A contract

Decisions **D33** and **D35** are operational:

- `MIGRATION_DATABASE_URL` authenticates directly as the isolated PostgreSQL
  superuser used only for Prisma migrations and controlled database
  administration. The local default name is `litigation`; the URL, rather
  than that name, is the credential contract.
- `DATABASE_URL` uses `litigation_runtime` for the running web application.
  It is a login but is not a superuser, owner, role creator, database creator,
  inheriting role, replication role or row-security bypass role.

The runtime receives `CONNECT`, public-schema `USAGE`, and only
`SELECT`/`INSERT`/`UPDATE` plus required sequence access for the exact 38
application tables. It has no physical `DELETE`, actor-registry or migration
evidence access, staging/quarantine access, schema `CREATE`, object ownership,
trigger/function replacement or administration/migration context. It has no
outbound membership, cannot `SET ROLE` to **any** other role, and has no
explicit inbound `pg_auth_members` edge at all—regardless of member, grantor or
`ADMIN`/`INHERIT`/`SET` options. Inherent superuser authority is inventoried
separately and is not a reason to retain an explicit edge. It has no stored
role-level or database-specific setting and cannot `SET` or `ALTER SYSTEM` for
`session_replication_role`. The migration owner retains schema ownership.

Migration `20260901170000_close_task33a_acceptance_gaps` established the first
forward-only fail-closed deployment and safe future-function defaults. Its
claims of a complete source and database-principal inventory are superseded by
migration `20260901190000_complete_task33a_enforcement_inventory`. That
migration's own “complete” claim is superseded by the 2 September correction:
migration `20260902120000_finalize_task33a_enforcement`, the capability-flow
source checker and D35. A later review found that the source checker at that
checkpoint still trusted a renamed structural type and an object property's
initial value, and did not close computed runtime environment access or every
alternate-client URL. The final review-gap follow-up corrects those source and
factory controls without changing migrations 53–56 or D35's database boundary.

A final fail-closed correction found four paths that this statement had not yet
covered: container-laundered computed callables, alternate process/global
environment access, namespace/CommonJS/`Pool` controlled clients, and
non-PostgreSQL URLs accepted by the runtime factory. The corrected D35 boundary
has one value-construction gateway for privileged PostgreSQL and Prisma
clients. It connects first, awaits the direct-superuser identity assertion, and
only then invokes controlled work or returns the verified Prisma client. On a
connection or verification failure it disconnects without invoking the work
callback. Outside that gateway, controlled non-test scripts may retain
type-only PostgreSQL imports but cannot read the privileged environment value,
value-load or construct a database client, or use a cosmetic preflight. The web
factory accepts only `postgres:` and `postgresql:` URLs and still requires the
exact `litigation_runtime` username; every rejection message omits the supplied
URL and its userinfo/query components.

Migration 55 commits runtime `NOLOGIN` and removal of its direct target-database
`CONNECT` grant, then terminates only that principal's sessions in the target
database. A second transaction checks the exact `_migration`, `public`,
`quarantine` and `staging` schema inventory; both directions of the membership
graph; settings and ownership; effective and direct-provenance ACLs for every
project relation, column, sequence and `SECURITY DEFINER` function; all eight
PostgreSQL 17 table privileges including `MAINTAIN`; and inherited, direct or
`PUBLIC` parameter rights for `session_replication_role`. Only the exact 38
tables, their required sequences and three narrow context functions are
approved. An execution probe also proves the runtime cannot enter replica mode.
Login and direct target-database `CONNECT` return only after every assertion
passes. A failure leaves the web role unavailable and never silently removes an
unexpected external ownership, membership, ACL or parameter grant.

Migration 56 preserves migrations 53–55 byte-for-byte. Before changing runtime
availability it verifies that `session_user` is a superuser and equals the
superuser `current_user`. It then repeats migration 55's fail-closed sequence
and complete boundary with one stricter invariant: **zero explicit inbound
runtime-role memberships**, including an `ADMIN TRUE, INHERIT FALSE, SET
FALSE` edge that can delegate a later `SET TRUE` path.

The same complete boundary runs in migration pre/postconditions,
`db:provision-runtime`, `db:check`, `db:verify` and disposable adversarial
fixtures. A new
gateway, role path, setting, schema, owned object, ACL, column/sequence grant,
executable security-definer or parameter capability therefore requires an
explicit reviewed inventory change.

## Append-only audit events — Task 3.3B contract

Migration `20260902180000_append_only_audit_events` is the frozen migration 57
foundation required by **D30** and **D32**. Its file and applied checksum remain
`81f42f19bcae73b38805391d0ad80b87d92e4270adbd9578db46016907e04ab0`.
Forward migration 58, `20260903100000_close_task33b_review_gaps`, has file and
applied checksum
`e6aefa8ef378434062ef18c82f84d218a1f0531c74f10c3845713cce7226579b`.
Migrations 1–57 remain byte-identical.

The migration 57 checkpoint permanently retains the original 262-rule
allowlist digest
`9e271a6e23bc03e55223db3c0a9be1b0e34867da0af8c6f0acab5614506de11b`.
That historical baseline is not the current schema-coverage contract.
Migration 58 classifies every one of the 583 columns in the exact 38 audited
tables exactly once: 261 captured values, one redacted change fact, 38 entity
keys, 152 structural audit columns and 131 precise exclusions. The current
classification digest is
`4ebad0a7bc5862dbd537abac05727f4968598c3b30336ee8e9236ba6b653bf0d`.
An ordinary future column has no implicit category: an insert/update involving
it fails and rolls back until a forward migration gives that exact column a
deliberate classification and reason.

The runtime has no direct privilege on any of the four event-foundation tables,
the actor table or the event identity sequence. It may execute only
`audit_set_event_context(...)` and the reviewed
`audit_append_semantic_event_for_account(...)` gateway. That gateway resolves
the target human through the immutable
`audit_actors.user_account_id = user_accounts.id` relationship; application
code never derives an actor ID arithmetically. Row capture, validation and
internal actor-ID append routines remain fixed-search-path `SECURITY DEFINER`
functions unavailable to runtime and `PUBLIC`.

All 38 application tables have an `AFTER INSERT OR UPDATE` event trigger. The
eight junction tables additionally capture delete as
`relationship_removed`; ordinary record tables retain D25's no-physical-delete
contract and the runtime still has no `DELETE`. Audited writes and their events
share one database transaction. Human and authentication APIs require explicit
server-created `AuditRequestMetadata`; the database no longer invents request,
correlation or audit-session UUIDs. Fully missing, partial, malformed, zero-ID
or leaked transaction context rejects the event and rolls back the business
write. Controlled migrations and local administration must explicitly create
maintenance metadata in their transaction.

The database enforces bounded/redacted field and semantic payloads. It stores
IP addresses as `inet`, user agents as at most 512 characters with a truncation
flag, attempted usernames as at most 64, resource identifiers as at most 256,
and flat semantic parameter/metadata objects as at most 32 primitive keys and
16 KiB. Exact per-column classifications deliberately exclude the existing
binary, JSON, legacy/raw and normalisation payload columns; no naming pattern
automatically excludes a future column. `password_hash` records only that a
change occurred. Entity, actor, time, action/outcome, request and correlation
indexes support later keyset history queries without a broad JSON GIN index.

The deployment baseline is exactly one `audit_baseline_established` event by
`system_migration`; it records aggregate protected evidence rather than
inventing 45,463 historical row events. The complete contract and verification
are in
[`task-reports/2026-09-02-task-3-3b-append-only-event-foundation.md`](task-reports/2026-09-02-task-3-3b-append-only-event-foundation.md).

The atomic operation wrapper is deliberately limited to database-reversible
archive/restore and account/role lifecycle work. PostgreSQL cannot roll back a
filesystem write, generated export, response stream or network delivery.
Future report/export/download events remain valid taxonomy entries, but must be
emitted only after the server observes the stated fact. In particular,
`download_completed` can mean that the server completed its emission point; it
cannot prove that the client received the file.

## User-account lifecycle — Task 3.4 contract

Forward migration 59 is
`20260903160000_secure_user_account_lifecycle`; its file and applied Prisma
checksum are
`364c04d7cf96a476cf3efaf092c5ffc7ad99389cf51a70b8b31d8f9d0268f15d`.
Migrations 1–58 remain byte-identical. The project database contains 59 applied
migrations plus the approved historical rollback.

The restricted runtime no longer has direct `INSERT`, `DELETE` or `TRUNCATE`
on `user_accounts`. Its single creation path is
`create_user_account_with_actor(...)`, a narrowly granted fixed-search-path
`SECURITY DEFINER` function. With validated human audit context, it locks and
proves the acting account is a usable Administrator, re-reads an eligible
existing active staff person by numeric ID, creates one account, obtains a
separate actor identity from the actor sequence and creates the immutable human
actor. The function returns only the account ID. Account, actor, row event and
ordered semantic events remain in one transaction, so any later failure rolls
back the entire creation.

`guard_usable_administrator()` serializes availability-reducing changes with a
transaction-scoped advisory lock. It rejects any user-account or person change
that would leave no Administrator-role, enabled, password-initialized account
linked to an active and login-eligible person. This covers concurrent
disable/demotion attempts and future person deactivation. It is intentionally
mutation-time enforcement, not a migration precondition, because clean replay
creates the original accounts before local password initialization. The
permanent operational-readiness invariant separately requires a usable
Administrator in the live project database.

Account semantic validation is distinct from generic archive/restore. Every
lifecycle event requires a current human Administrator, the matching target
human actor, `public.user_accounts`, an exact target account key, and the
approved action/outcome shape. Password initialization/reset additionally
accepts `system_administration` only for the controlled local command restricted
to the four immutable original account IDs. Web initialization/reset records
the validated human Administrator. `username_changed` is an explicit action;
combined creation and reactivation write their full ordered event pairs.

Permanent invariants retain the exact three system actors, the original four
human actors and frozen Task 3.3 baseline evidence while enforcing a one-to-one
account/human-actor relationship for current and future accounts. Current
growth therefore does not rewrite a historical digest. The protected 5,209
business rows and their digest, current attribution digest, four roles, 448
authorization decisions, one baseline event and 583 field classifications are
unchanged. The live invariant count is 92.

The 92 count above is the Task 3.4 checkpoint. Task 3.5B added the 93rd
permanent invariant; migration 61 brought the historical profile to 107/107.
The accepted migration-62 checkpoint now passes 116/116, as described below.

## Task 4.0a Phase 1 database boundary — deployed and verified

The database foundation below is implemented by migration 61,
`20260906180000_staff_roster_database_boundary`, SHA-256
`87e04320badc5bc71de1c30eae02c72f82ae0e59f2088b42cb0806f6b25c8904`.
After disposable proof and predeployment recovery readiness, the separately
authorized project deployment completed on 7 September 2026. Project
PostgreSQL 17.11 then had 61 applied migrations, zero pending or unfinished and one
retained approved historical rollback. The deployment command ran exactly once;
migration 61 has one completed ledger entry. Post-deployment `db:verify` passed
15/15 and the permanent historical profile passed 107/107. Phase 1 is
operationally complete. Phase 2 now reads the deployed boundary through the
staff roster and detail pages. Phase 3 now uses the existing six gateways for
Administrator mutations, with no schema, migration, privilege or invariant change.
The [deployment acceptance report](task-reports/2026-09-07-task-4-0a-phase-1-migration-61-deployment.md)
identifies the retained recovery and deployment evidence. The project container
was unchanged. The 103 tables at that checkpoint preserve all 97 prior projections:
92 whole tables unchanged and five containing only approved additions, plus
six new boundary tables. All 54 logos remain intact; the staff-change ledger
has zero rows at deployment acceptance.

Phase 2 added no database change. Its 8 September read-only verification retained all
103 tables, sequence state and catalog fingerprints; migration state was then
61 applied, zero pending and zero unfinished, with 15/15 checks and 107/107
historical invariants. All login, query-fixture setup and error simulation run
in disposable PostgreSQL instances restored in memory, without migration replay.
See the [Phase 2 report](task-reports/2026-09-08-task-4-0a-phase-2-read-only-staff-roster.md).

Phase 3 project verification again preserves all 103 tables, full sequence state,
catalogs, protected evidence, 824 audit events and 54 logos; the staff-change
ledger remains empty. All Phase 3 workflow, race, failure and browser mutations
run on separately owned full-state PostgreSQL 17 fixtures. The
[Phase 3 report](task-reports/2026-09-08-task-4-0a-phase-3-administrator-staff-mutations.md)
records the exact evidence and the correction separating then-current migration-61
audit regression from the retained historical migration-53–60 upgrade proof.
Run `npm run test:audit` for the current checkpoint and `npm run test:audit-events`
for separate event proof; both own isolated disposable PostgreSQL fixtures.
The [canonical testing instructions](testing/task-4-0a-phase1-invariants.md#commands-and-safe-execution)
state each profile's prerequisites and scope.

Phase 4's 8 September before/after comparison again preserved all 103 tables,
full sequence state, schema/catalog objects, roles/grants, migration/audit
evidence, project container/database identity and 54 logos. Read-only project
checks passed 15/15 and historical invariants passed 107/107. Browser mutations and
all regression fixtures were separately owned and removed. See the
[Phase 4 completion report](task-reports/2026-09-08-task-4-0a-phase-4-staff-roster-completion.md).
Task 4.0a overall and Phase 4 are checked. The next return point is
**Task 4.1 Phase 3 — Authorized mutations and archive/restore**, unstarted; its Phase 1 database foundation is now deployed and operationally
complete at migration 62. Task 4.1 overall, Phases 3–4 and Task 4.1a remain unchecked. The Litigation
Department continues using Access;
final delta reconciliation and cutover remain separate work under D43 and D51.

The reviewed protected historical audit prefix ends at event 824; it is not a
deployment-time event-count limit. Migration 61 validates that exact full-value
prefix and the structural/semantic validity of later events, then atomically
captures their actual maximum ID, count and complete digest in the immutable
boundary. All pre-boundary events remain protected and cannot supply a later
staff change-ledger entry. The people business projection excludes only derived
`can_login` in addition to audit metadata; current account/employment eligibility
is checked independently, and the complete actual roster is snapshotted without
resetting any value.

- Snapshot the exact imported roster boundary immutably: 64 protected Stage 2
  staff, separate from 71 external people. Preserve the two existing
  application-native staff and allow later native hires through
  database-enforced provenance. Do not rewrite frozen migration evidence.
- Reuse stable `people.id`, alias identity, source fingerprints and the D43
  durable Access/source keys. A rename changes a canonical label, not the
  person's identity.
- Serialize the canonical-name/alias normalized collision domain. The
  permanent invariant covers every person, including the 71 external people:
  at transaction completion each person has exactly one active primary alias
  matching the current canonical Arabic name. External people remain outside
  Task 4.0a editing and must not be mutated merely to enforce or test this
  invariant.
- Keep every imported alias's spelling, person ownership, source provenance,
  continued existence and history immutable. Its current `is_primary` value
  may be demoted only in the same atomic D45 controlled rename, while the
  immutable boundary snapshot preserves its original primary status. A current
  primary alias of either provenance cannot retire directly; install the new
  primary before the rename completes. Only a non-primary application-created
  alias may retire/restore, with reason and audit.
- Add row-version stale-write rejection and application modification
  provenance. Preserve the existing uniqueness of every non-null person email:
  trim surrounding whitespace and normalize case on acceptance, enforce the
  normalized non-null value in PostgreSQL, reject concurrent duplicates, and
  never weaken or remove the current unique constraint. Shared addresses need
  a future owner decision.
- Implement person deactivation and linked-account disablement as one
  transaction: lock the person/account and relevant Administrator set, clear
  lockout, increment `session_version`, invalidate sessions and append the
  ordered semantic lifecycle facts. Person reactivation never enables the
  account. Preserve self-deactivation and concurrent last-usable-Administrator
  guards.
- Keep the two team rows fixed and `team_id IS NULL` valid. Enforce that a
  reviewer is active, internal and not a trainee; membership in the reviewed
  team is not required and the same reviewer may serve both teams. Reassignment
  is required before reviewer deactivation.
- Deny runtime delete/truncate paths for people and aliases. Every mutation must
  use a narrow server-authorized gateway, validated human actor context,
  append-only row and semantic events, and fail-closed outcome shapes.

The completed database proof covers historical upgrade and clean replay,
concurrent duplicate name/alias attempts, stale forms, account/person atomicity,
last-Administrator races, reviewer deactivation, permissions, rollback and
full-value audit continuity. D44–D49 define the product/data choices; D50 adds
local browser evidence after the database and server boundary exists.

### Explicit acceptance profiles and permanent inventory

`historical-full-state-upgrade` requires the complete original extraction,
744 review answers, Task 3.5B release and protected history. The exact 97-table
clone passed all 93 original checks before 61, then all 93 preserved/relocated
checks plus 14 new checks: **107**. `canonical-clean-replay` requires exact
Git-owned state and explicit absence of non-Git historical payload; it passed
75 universal original checks plus 14 new checks: **89**. Neither substitutes
for the other. All 18 historical-only classifications identify a concrete
missing non-Git artifact; no security or schema check is demoted.

The [complete 107-entry inventory and commands](testing/task-4-0a-phase1-invariants.md)
are fail closed. Both profiles passed 22 mutation groups, including all four
canonical/alias collision directions at three isolation levels, Cairo-session
continuity, reviewer/Administrator/account races, and late audit rollback.
Migration atomicity passed on both; a canonical/historical hybrid was refused.
Existing authentication, 448-permission, account, audit and principal suites
passed. The original 583 audit-field classifications and frozen digests remain
exact; only seven explicitly named classifications are added.

Runtime has SELECT only on `people`, `person_name_alias` and `lookup_team`, no
direct sequence access for them, and EXECUTE on exactly six public `staff_*`
gateways. Private snapshots, mutex, change ledger and helper functions are
inaccessible to runtime/PUBLIC. The existing account-derived login trigger keeps
its exact body but executes as its definer after direct roster UPDATE is revoked.

The unchanged statement-level mutex serializes **all** user-account writes,
including login-related writes, with roster mutations. This favors race safety
and may introduce brief contention. Retain it for the present firm scale;
performance measurement belongs to the later service/UI phase.

Cluster-mutating regression scripts must run through the isolated harness;
direct invocation against project port 5433 is rejected. The temporary exact
migration-56/60 fixture mirror uses the ordinary D35 runner, verifies every
copied SQL/config byte and the isolated target, and is deleted after use.
Source copying is read-only and memory-only. No project roles, sessions,
networks, volumes or container configuration are changed. See the
[Phase 1 acceptance report](task-reports/2026-09-06-task-4-0a-phase-1-database-boundary.md).

## Task 4.1 database foundation — deployed, verified and operationally complete

D57 requires a small, validated immutable client/contact import-evidence layer
and separate current operational invariants. Preserve original system/Access
IDs, staging identities/fingerprints, source and initial transformed values,
raw evidence and imported contact ownership. Current native additions and
authorized edits must not weaken historical checks or replace frozen digests.
Migration 62 (`20260909120000_client_contact_database_boundary`) implements this
boundary, archive/version fields, same-client main-contact enforcement and
transactional repeated-submission protection. After independent review and
separate owner authorization, one project deployment invocation applied only
migration 62 on 9 September 2026. Its SHA-256 is
`88ab034517f76e152e944f1a0949edc175a286c7bfeefe82fba0672c6b86f6c1`.
Fresh verification passed 15/15 and 116/116: 62 applied, zero pending or
unfinished, and one approved historical rollback retained. All 99 unrelated
original tables and four original projections, prior ledger rows at full timestamp
precision, audit/accounts, 48 complete sequence states and 54 logos were preserved.
The [deployment acceptance report](task-reports/2026-09-09-task-4-1-phase-1-migration-62-deployment.md)
records exact evidence and separates deployment from the retained migration-61
predeployment recovery archive. That archive is not a new migration-62 backup;
its restore-only representation exceptions do not apply to live preservation.
Fresh role credentials and separately supplied `AUTH_SECRET` remain recovery
requirements. Task 7.2 backup work and D43/D51 cutover remain separate.
No client/contact application screens were implemented by deployment.

The database gateways enforce D52/D55 archive rules, fixed contact ownership
and same-client unarchived main contacts. Stale edits fail safely; actor/event attribution and
archive/restore semantics must commit with the business change or roll back
together. Classify every added audit field explicitly. Preserve D53's exact
historical classification values during unrelated/no-op edits. Extend the
affected permanent checks and imported-only Gate 4 accounting; refuse the old
client/contact delete-and-rebuild transform after the operational boundary.

`npm run test:client-contacts` owns a separate PostgreSQL 17.11 cluster and proves
historical 61→62 (116 checks) and canonical replay (98 checks). Historical
acceptance requires an actual untouched migration-61 source restored and verified
in isolation; the current migration-62 project cannot supply that starting state.
Do not downgrade it or rerun deployment to manufacture the proof. The 18
historical-only checks still require their actual imported artifacts.
`npm run test:client-regressions`, `npm run test:audit` and
`npm run test:audit-events` accept an exact complete historical source at 61 or
62. They copy it into a separate owned cluster. A 61 copy is upgraded there;
a 62 copy uses its existing boundary without invoking migration deployment or
the untouched-live-row import oracle. Exact immutable import evidence and valid
operational state are checked separately, so authorized edits, native additions
and archive transitions remain valid. Independent canonical child replays remain
mandatory; a canonical source cannot substitute for the historical source.
The normal `npm run test:staff-read-only` and its `-- --project-read-only` option
derive 61/62 from database evidence, independently of fixture-borrowing flags.
The latter forces read-only connections and creates no synthetic fixture rows.
When an outer test supplies the established isolated descriptor, normal commands
copy that verified source container's `litigation` database, rather than silently
copying the project. Default invocation still reads the project source only.
The old staff 60→61 and audit 53–60 proofs retain their exact source requirements.
Run `npx --no-install tsx scripts/test-client-regression-source.ts --entry-points` for the
permanent source-selection, malformed-state, no-replay and normal-command proof;
it requires the actual historical migration-61 source. Omit `--entry-points`
for the focused source proof, including normal staff paths. Installed dependencies
are sufficient; no package installation is needed.
The updated read-only `db:check -- --profile=historical-full-state-upgrade`
checks the current complete migration-62 project (116 checks); the retained
migration-61 predeployment result remains 107 with 62 solely pending. Current
regression commands can copy the complete migration-62 source without redeploying
it. This documentation acceptance runs no database or runtime command.
See the [profile inventory](testing/task-4-1-phase1-invariants.md)
and [Phase 1 report](task-reports/2026-09-09-task-4-1-phase-1-database-foundation.md).

## Task 3.5B accepted database state

Migration 60, `20260904180000_prepare_high_impact_application`, and the
owner-authorized real application each executed exactly once on 5 September
2026. The migration's applied checksum is
`7921c9b168549928185bfd0b915ccc725ba363787158990c614420e0e3bbbee5`;
the application plan digest is
`4a1fee01d011b960f48204102e28ed71731a5f1d682006141749460828e33da3`.
At that checkpoint the project database had 60 applied migrations, one
application batch, 382 resolutions, 824 audit events and 93/93 passing permanent
invariants. Migration 61 subsequently preserved that evidence and passed 107/107;
migration 62 now preserves it with 116/116, as recorded above.

The current business totals are 18 client branches, 309 courts, 1,744 matters,
13,382 hearings, 968 matter-lawyer links, 2,695 parties, 2,267 party roles and
9,113 hearing attendees. The original 55 matter and 327 hearing
quarantine/source rows remain immutable evidence. The protected historical
state still has digest
`323f2bf1bae96d02af78b51eb7c14d8d54e8d8997eee171e15216e62896706b9`.
Default `npm run review:high-impact:apply` is a non-writing verifier and now
returns `mode: no-op` with the approved plan digest.

This state is an accepted migration checkpoint, not the final Access cutover.
Access remains in operational use. Future final cutover work follows D43's
source-identity differential reconciliation and must not repeat this application
or duplicate unchanged Access records.

### Local setup and upgrade

For an existing development `.env` that still has the old privileged
`DATABASE_URL`, run this once before migration 53:

```bash
npm run db:prepare-local-runtime
```

It preserves the old URL as `MIGRATION_DATABASE_URL`, generates a new local
runtime password, and writes the restricted `DATABASE_URL` through the ignored
`.env` file without displaying either value. If the two variables are already
separate, it validates them and changes nothing.

Migration 53's ownership check is an **isolated historical precondition**: at
that exact entry point, the connected principal must own the application
tables. It is not proof that a merely owning or `CREATEROLE` principal can run
the whole chain. The complete chain through migrations 54–56 requires D35's
direct superuser migration connection, and the canonical commands below reject
anything else before Prisma begins.

After applying migrations, provision the cluster login from the ignored URL:

```bash
npm run db:migrate:deploy
npm run db:provision-runtime
```

The second command checks the complete boundary above before changing the
password, decodes URL userinfo exactly once, quotes the decoded value as a
PostgreSQL string literal, confirms a runtime connection and never prints the
credential. This matters for reserved characters: `URL.password` retains
percent encoding while the PostgreSQL driver authenticates with the decoded
value. Existing generated base64url passwords remain supported. On Ubuntu,
generate distinct long random passwords for both URLs through the server's
approved secret mechanism; never reuse a local credential or place either
value in Git, documentation or command arguments.

Prisma 7 schema/migration commands read `MIGRATION_DATABASE_URL` from
`prisma.config.ts`. `db:migrate`, `db:migrate:deploy`, migration status and the
narrow migration-56 recovery command all run the authenticated D35 preflight
before starting Prisma. Application code rejects a `DATABASE_URL` whose
protocol is not exactly PostgreSQL or whose username is not exactly
`litigation_runtime`; configuration validation also
rejects equal migration/runtime usernames, and provisioning rejects different
database targets.

### Fresh install, upgrade and disaster recovery

For a fresh install, create or obtain the isolated superuser credential through
the approved host secret mechanism, expose it only to the administration shell
as `MIGRATION_DATABASE_URL`, run `npm run db:migrate:deploy`, then run
`npm run db:provision-runtime`. Start the web service with only its restricted
`DATABASE_URL` after both commands pass.

For an upgrade, stop or drain web traffic, inject `MIGRATION_DATABASE_URL` only
into the controlled migration command, deploy, provision/verify the runtime
credential, remove the superuser secret from that shell and then start the web
service. Do not source one shared production environment file into both the
migration shell and the web service: the production web process must not have
`MIGRATION_DATABASE_URL` at all.

For disaster recovery, restore the database and logo storage together as D16
requires, supply the recovered or rotated administration superuser secret only
to the recovery shell, run migration status/deploy and both database checks,
then provision the separate runtime login. The restored web service again
receives only `DATABASE_URL`. Never place either secret in Git, service logs,
documentation, command arguments or exported review evidence.

If migration 56 finds an unexpected membership or ACL, it intentionally leaves
`litigation_runtime` as `NOLOGIN` without direct target-database `CONNECT`.
Correct the external condition under owner review, run
`npm run db:migrate:resolve-task33a` to mark only that failed attempt as rolled
back through Prisma, and rerun `npm run db:migrate:deploy`. Both commands
authenticate D35's superuser first; never edit `_prisma_migrations` manually.

The runtime may technically call PostgreSQL's general `set_config` primitive
if the application process itself is fully compromised. External request data
has no path for selecting an actor, and all normal writes use fixed or
server-validated transaction-local helpers, but this is a residual process
trust boundary—not cryptographic actor proof against a compromised process.

---

## If something is wrong

**`npm run db:up` says "unhealthy".** The database started but its setup is
incomplete. This is deliberate: a half-configured database must never look
fine. Run `npm run db:logs` to see what failed, then `npm run db:reset`.

**"port is already allocated".** Something else is on 5433. Change
`POSTGRES_PORT` in your `.env` file to 5434 and run `npm run db:up` again.

**"Cannot connect to the Docker daemon".** Docker Desktop is not running.
Start it and wait for the whale icon to stop animating.

---

## Passwords

Copy `.env.example` to `.env` and edit it:

```bash
cp .env.example .env
```

`.env` is never committed to Git because it contains security secrets. Raw
database and export formats are also ignored, separately, for repository size,
permanent-history, reproducibility, integrity and accidental-distribution
reasons.

On the laptop the default password is fine, because the database is unreachable
from outside the machine. **On the Ubuntu server, set a long random password**
in `.env` before going live.

### Client-logo root

`CLIENT_LOGO_ROOT` is not a secret, but it is machine-specific and therefore
lives in `.env` too. The current Windows development value is:

```text
D:\Projects\litigation-system\storage\client-logos
```

The Ubuntu production value must be:

```text
/var/lib/litigation/client-logos
```

The database stores paths relative to this root only. Backups must snapshot
the database and this entire folder in one operation (D15/D16).

### Authentication secret and initial passwords

Set `AUTH_SECRET` in `.env` to at least 32 random bytes before starting the web
application. Use a password manager or an operating-system cryptographic
generator. The real value must never enter Git, a command argument, project
documentation, chat or a log. `AUTH_URL` is `http://localhost:3000` on the
development laptop and the application's HTTPS origin in production.

Task 3.1 creates four approved accounts with no password hash. Initialize them
one at a time from an interactive terminal:

```bash
npm run auth:set-password -- KHelmy
npm run auth:set-password -- MHussien
npm run auth:set-password -- IHamdy
npm run auth:set-password -- SKhattab
```

The password is prompted twice with no echo. It is never a command argument or
environment variable. Redirected input is refused. The command accepts only
these four initial usernames, updates exactly one account in a transaction,
clears any lockout, increments the session version and requires the person to
change that temporary password at first successful login. Do not use email as
the username.

Passwords require at least 12 Unicode characters and may include spaces. There
are no arbitrary uppercase, number or punctuation rules. They are hashed with
Argon2id v19 using 19,456 KiB memory, two iterations, parallelism one and a
32-byte result.

Five consecutive failures lock an account for 15 minutes. A normal login has
an absolute eight-hour lifetime; selecting “Remember me” gives an absolute
seven-day lifetime. Neither duration slides forward. Password changes and
account disabling invalidate existing sessions. Each successful authentication
creates a separate non-secret audit-session UUID; it is not derived from or a
replacement for the Auth.js token.

`AUDIT_TRUST_PROXY` defaults to `false`. Auth.js/Next.js does not expose the
directly observed peer address on these request paths, so the audit IP remains
null by default. Set this option to `true` only where a trusted reverse proxy
replaces `X-Forwarded-For`; the first syntactically valid address is then
recorded. Never enable it for an untrusted direct deployment.

---

## What is inside, and why

| Piece | Why it is there |
|---|---|
| PostgreSQL 17 | Pinned to the major version. PostgreSQL refuses to open data written by a different major version, so an accidental upgrade must never happen on its own. |
| ICU collation `ar-EG` | Correct Arabic alphabetical order. See above. |
| `pg_trgm` | Makes searching 13,000+ hearings by a fragment of text fast (task 1.6). |
| `btree_gin` | Lets one index serve a text search and a plain filter together. |
| `unaccent` | Handles Latin accents in mixed names such as `شركة هيوليت باكارد HP`. |
| A named volume | The data lives in a Docker-managed volume, not a folder on the host. Host folders break PostgreSQL's file permissions on Windows. |

## Backups

Not yet. Backups are task 7.2, and decision **D16** sets out what is required:
nightly, database *and* the client-logo folder in one operation, copied off the
machine, and a restore actually tested before go-live.

### Task 4.1 Phase 2 implementation — 9 September 2026

Read services use parameterized SELECTs in read-only repeatable-read snapshots.
Counts and pages share predicates, and EXISTS prevents contact matches from
duplicating clients. Ordering is Arabic collation then ID; pages contain 25 rows.
The full query closure and eight read/transaction sites are pinned in the audit
inventory. No grant, schema or migration change. Isolated tests restore verified
migration 62 without redeployment; the full project-preservation receipt covers
107 tables, 48 complete sequences, catalogs/roles/grants and all 54 logo files.

Stop for independent Phase 2 review; Phase 3 is the next development phase.
See the [implementation and verification report](task-reports/2026-09-09-task-4-1-phase-2-read-only-clients.md).


## Migration 63 development database acceptance — 11 September 2026

Khaled Helmy accepted the reviewed local-development operational milestone after
[independent operational PASS](reviews/2026-09-11-migration63-operational-independent-review.md).
This addendum supersedes earlier current-status wording above while preserving
those dated records. Source implementation/correction/acceptance is published at
`2b866bae7929149c1ad200661225f4c2098f366d`. See the
[development acceptance record](task-reports/2026-09-11-migration63-development-acceptance.md)
for authority, evidence identities, limitations and the next stop.

Historical execution evidence records one successful migration-63 invocation:
63 applied, one historical rollback, zero unfinished; 109 tables, 54 retained
imports, zero submissions and 602 audit classifications. Original data
projections, all 48 complete live sequences and 54 logos were preserved.
Captured native validation passed 121 invariant and 15 setup checks. Isolated
restore/rehearsal and owned-fixture cleanup passed under the recorded narrow
restore exceptions. The reviewer passed 101 offline comparisons; this
acceptance-documentation task performs no fresh database or runtime check.

Development logos: `D:\Projects\LitigationData\client-logos`.
Local recovery point:
`D:\Projects\LitigationData\DB-Backup\migration63\predeploy-20260911T150003164Z-0d643b99-9a2f-40c2-ab0c-d91a627d1d23`.
The owner explicitly selected local-only backup for this development execution.
Preserve it and the original trees/recovery evidence. Do not replay 63 or blindly
restore over newer data; any recovery must preserve newer state, rehearse in
isolation and obtain approval for reconciliation and switching targets.

Windows is development; the final app and database target an Ubuntu VM with
Docker. The temporary Windows artifact shares checkout node_modules, with the
reviewed dependency/ancestor-permission limitation; directory-entry durability
across power loss was not proved. No further Windows production-hardening phase
is required to close this milestone. Authenticated client/logo/recovery views
remain unobserved under the approved no-session fallback. Speech actions remain
excluded with no pending speech follow-up.

Production must validate its actual Linux image/dependencies, runtime identity
and secrets, mounted storage, exposure, authenticated workflows, durability and
coordinated recovery. Linux/Docker alone proves none of these. Stage 7 and D15/D16
backup/retention/off-VM/integrity/spare-machine-and-printed-logo obligations remain
separate; the local exception does not satisfy them. Final Access cutover is
unperformed. Stop for independent review of this documentation commit, then the
separate documentation/publication checkpoint and Task 4.2 mandate.


### Task 4.2 Phase 3 candidate checkpoint

At this historical checkpoint the real database stayed at63. Frozen candidate64
preceded D58 candidate65; the later authorized activation above applied both.
Owned fixture dispatch supports exact historical63, accepted64 and candidate65
with separate canonical/historical profiles. Old fixture paths stop at their
requested checkpoint. Current checks enforce the archive default/index, exact
functions/settings/privileges/triggers and complete audited matter history.
Application to the real database remains separately authorized.


## Task 4.3 Phase 2 hearing boundary — pending independent review

Migration `20260913120000_hearing_editing_boundary` is migration 66. Existing migrations
1–65 are unchanged. Only owned isolated clusters may receive 66 before acceptance.
`public.hearing_edit_state` and `public.hearing_edit_save` are the sole runtime hearing
mutation gateways; direct hearing/attendee writes and identity allocation are revoked.
The saving gateway locks the staff mutex, current account, parent, hearing and selected
people, validates eligibility again, then commits business changes, aggregate version,
audit, history and submission receipt together. No-op and exact retry allocate nothing.
The historical 65 profile retains 125 invariants; 66 adds four hearing boundary checks.
Historical fixtures explicitly select their requested checkpoint, including 65.

Actual development activation completed using only the accepted 9b09f0d artifact and
its migrations 64/65. The app remains running on loopback and the actual database
passed the full 65 profile. See the dated Phase 2 report and separate activation
receipt; migration 66 and hearing editing remain unactivated.


## Owner acceptance and local migration-66 activation — 13 September 2026

This dated addendum supersedes earlier current-state pointers; the entire earlier
report remains historical evidence. Khaled Helmy accepted Phase 2 at
`34a9fd89176ae89a097136f48f2c733273243ba1` after independent PASS and accepted the
completed Phase 1 local activation. N1 is corrected in both TASKS.md status locations.

The actual `localhost:5433/litigation` database advanced from 65 to 66 in one
successful accepted-wrapper attempt. A fresh protected local backup includes the
recovered KHelmy account and 54 matching logos. Exact restoration, isolated 65→66
rehearsal, actual data/catalog/ACL delta and complete sequence preservation passed;
129 historical-profile invariants and 15 setup checks passed on rehearsal and actual66.
The accepted Phase 2 app is running on `http://127.0.0.1:3000` with build
`Xn1dOi5xfU18918vhx403`. Current account/password/session state, DB/Docker credentials,
existing configuration and D59 are preserved. D60 is unchanged.

Fresh proof covers recovery, migration, accepted build/process, anonymous HTTP
guards/assets and Arabic authentication-screen rendering. Existing browser-session
redirects prevented observing authenticated list/detail/new/edit views; no password
or session was altered. Exact-source prior 111 canonical checks, 448 permission
decisions, service/race proof and 17 accessibility scans are reused, not rerun here.
No actual business mutation was used as a test. All task-owned rehearsal resources
are removed; old artifacts/evidence and the fresh local-only recovery package remain.

See the [activation report](task-reports/2026-09-13-task-4-3-phase-2-development-activation.md) for source identities, backup and recovery
pointers, fresh/reused evidence, attempts and limits. Overall Task 4.3 remains open.
Stop for independent activation/documentation review; no fetch, push, Ubuntu
deployment, hearing archive/restore or next phase was performed.


## Task 4.3 Phase 3 candidate67 — 13 September 2026

Phase 2 activation/documentation at `5f0552f9dd98a55f4050c988c154a6b8cd18b30c`
is owner-accepted. Phase3 adds `20260913160000_hearing_archive_restore` after
the unchanged1–66 chain. It is tested only on positively identified disposable
clusters with full-volume snapshot restoration, canonical replay, rollback and
permanent checks. No migration or write from this task targets actual
`localhost:5433/litigation`: actual66 and the accepted Phase 2 loopback app remain
active. No app restart or credential/session change is included. Candidate67
activation requires separate authorization after independent review. See the
[Phase 3 report](task-reports/2026-09-13-task-4-3-phase-3-hearing-archive-restore.md)
and [matrix](testing/task-4-3-phase3-acceptance-matrix.md) for exact fresh proof.


## Actual migration 67 activation — 14 September 2026

Khaled Helmy accepted Phase 3 source `e5826056f30a5c5e2907c44b29641993e36092c0` and
authorized actual66→67, then final local Task 4.3 closure after successful checks.
Only accepted67 was applied, in one actual attempt, to localhost:5433/litigation,
cluster `7676117521894273062`. The database moved from 118 to 119 tables;
48 complete sequence states remained exact. It has 67 completed migrations,
one retained historical rollback, zero unfinished and zero pending in the artifact.
All original data projections, previous hearing boundaries/history, attendance,
recovered account/password/session state, actual role credentials and 54 logos
were preserved. The fresh source-derived lifecycle boundary, new archive flag,
classification and complete object/grant delta match reviewed SQL and rehearsal.
Actual forced-read-only validation passed 131 historical invariants and 15 setup
checks before reopening. Build `6STn5JeaidE5AnbLqEJc8` from accepted e582605 is active on
127.0.0.1:3000. This is local development, with D59–D61 unchanged.
See the [operational report](task-reports/2026-09-14-task-4-3-phase-3-development-activation.md)
for the protected recovery point and bounded smoke limitations. Earlier prefixes
remain dated evidence; no earlier isolated-only statement is rewritten.


## Actual migration 68 and corrected Phase 2 activation — 14 September 2026

Khaled accepted `90bfc66711bfbf5b219191c60ad3e662a14af015` and the independent
correction PASS; P2-R1/P2-N1 are closed. Only reviewed
`20260914160000_admin_work_editing_boundary` was deployed to
localhost:5433/litigation, cluster `7676117521894273062`, after a fresh protected
backup was restored and the same migration rehearsed on a separate PostgreSQL
17.11 cluster. Actual completion: `2026-09-14T19:10:31.436Z`; 68 completed migrations,
one retained historical rollback and zero unfinished/pending migrations.
The old 119 tables become 123; all 48 complete sequence states remain exact.
Old-column projections, original imported/released evidence, audit history,
account/session state, credentials and 54 logos remain unchanged in the quiesced
upgrade. Existing tasks gain row_version=1, steps gain current_order=NULL;
the exact original rows are retained in admin_edit_import and its initial views.
One source-derived boundary is installed; change/submission tables remain empty.
The two classifications, ledger entry and complete named definition/grant delta
match reviewed SQL and rehearsal. Actual validation passed 135 historical checks
and 15 setup checks before the app reopened. No business save was fabricated.

Build `schZeUhP0RGWF_DHI827w` from exact accepted source runs at
`http://127.0.0.1:3000` using the existing restricted runtime principal.
The earlier accepted build is retained. Fresh local-only recovery is retained at
`D:\Projects\LitigationData\DB-Backup\migration63\pre-migration68-2026-09-14T19-00-05-653Z-a95f6df5-b8f4-44c5-99ad-69746e86af3e`. Dump: 20,693,286 bytes,
SHA-256 `7a6c949a429637b9c182780d2c3836903294d91f314d9fc1b1d45bb89ee76366`; manifest SHA-256 `b7dbe5b9d4932355cc540e398e41e7dd019eebae14052fc5d345ead610ba1107`.
All 58 payload members, including all 54 logos and protected role recovery
material, were verified. All 119 restored table projections/ownership/effective
rights and logical sequences matched; 45 log_cnt resets and equivalent
implicit schema-owner ACLs are recorded as restore differences, not normalized on
the actual database. The protected package inherits the existing restricted ACL;
it remains local-only and does not protect against laptop/disk loss.

See the [acceptance/activation report](task-reports/2026-09-14-task-4-4-phase-2-acceptance-activation.md) for fresh counts,
exact delta and runtime evidence, smoke limits and reuse of reviewed functional
proof. Earlier checkpoints below/above remain dated history. D1–D62 and C1's
owner-accepted development risk remain unchanged. Publication is authorized after
the single documentation commit and recorded externally. Overall Task 4.4 remains
unchecked; remaining lifecycle work and Ubuntu deployment are outside this stop.

## Task 4.4 Phase 3 candidate 69 — 15 September 2026

The accepted combined Phase 2 review at `f05787471812c8fb2bd03d31bc44614dad81a8d2`
includes its authenticated supplement. Actual development remains migration 68,
123 tables/48 sequences, with accepted build `schZeUhP0RGWF_DHI827w`. Phase 3
migration 69 is candidate-only and was tested on positively owned disposable
clusters. It adds one private boundary table, two flags, five functions, replaces
four administrative functions, and adds three indexes/three triggers/seven
constraints; no pre-existing object is removed. Permanent checks recognize the
exact new boundary while retaining historical 68 profiles and frozen migrations.
Use the [Phase 3 report](task-reports/2026-09-15-task-4-4-phase-3-archive-restore.md) and its exact command/evidence
ledger. This status does not authorize applying 69 or rebuilding the owner app.


## Owner acceptance and local activation — 15 September 2026

The owner accepted Phase 3 at `2966570c368ef484b4d32c77d5bd4c971c19ff4f` and its
[independent PASS review](reviews/2026-09-15-task-4-4-phase-3-independent-review.md).
The combined mandate authorized protected backup/restore/rehearsal, exact actual
migration 69, accepted-app activation and ordinary publication of one eight-document
child over the accepted source. Overall Task 4.4 remains unchecked.

Actual migration 69 is verified: 137 historical invariants and 15 setup checks;
all 123 old-table projections, original account/session/credential state and all
48 full sequence vectors remain exact. Two false archive flags, the exact source-derived
private boundary, reviewed named catalog changes, two audit registrations and
the new ledger entry are the only permitted delta. The same new backup passed
135 pre-69 and 137 post-69 invariants plus 15 setup checks on the owned restore.
Four independent lifecycle transitions and all four confirmation/Cancel flows
passed focused authenticated checks on that restore using the final accepted build.

Build `LyN77RMhXZbOvG44OcUhg` runs on actual `http://127.0.0.1:3000`.
Actual anonymous RTL/assets/protected-route/mobile smoke passed. Actual authenticated
observation is pending: interactive browser tools failed kernel initialization,
including a reset/retry; no owner cookie was fabricated, password reset or business
record changed. The accepted exhaustive implementation evidence is reused with
its original limits, not represented as a new full run. No screen-reader claim.

See the [acceptance/activation report](task-reports/2026-09-15-task-4-4-phase-3-acceptance-activation.md)
and external activation/publication/delivery receipts. Stop for independent review;
all existing checkbox lines, D1–D63 and governance remain unchanged.

Fresh protected recovery: `D:\Projects\LitigationData\DB-Backup\migration63\pre-migration69-2026-09-15T09-46-40-760Z-5c075150-759f-407e-ba4b-716937cf038a`.
Dump 21,864,852 bytes; SHA-256 `ed85eaafd7b8c1c13662723eec3a08df7ac4e005877a8290d3d4c848c0587d2d`.
Manifest SHA-256 `92d80647f141105946706292dd96e00d099952c2c9813f2e3d84e150813e72f6`; 60 payload members
including 54 logos and private configuration/role recovery. Existing restrictive
ACLs were checked without change. All restored logical sequence values match;
45 log_cnt resets and the recorded equivalent schema ACL
representation are portable-restore differences only. Actual complete sequences
were not normalized. Earlier entries remain dated historical checkpoints.


## Task 4.5 candidate database boundary — unactivated

Candidate migration `20260915180000_poa_editing_lifecycle_boundary` is migration 70.
Do not deploy it to the owner database under this implementation mandate. The
candidate gateways `poa_edit_state` and `poa_edit_save` revalidate account, role,
login eligibility, reset state, expiry and session version. Runtime direct table
and sequence writes are revoked. Imported evidence and complete history/receipts
are private and immutable. `npm run db:check` recognizes exact checkpoint 70,
checks original POA evidence and replays current history, while checkpoint 69
retains its historical meaning. The new canonical fixture checkpoint is limited
to the positively identified `litigation_task45_canonical_prestate` copy.

Writers lock the existing roster mutex, current and selected client
IDs, aggregate and selected people deterministically. Both old and new clients
must be unarchived; clearing cannot bypass that prerequisite. Fresh authority
precedes receipt lookup. Exact committed retries acknowledge the original result;
current state is read again. Current-version identical operations write nothing.

## Tasks 4.6–4.7 combined candidate boundary — unactivated

Candidate migration `20260916180000_documents_fee_letters_boundary` is migration
71. It is not applied to the owner database in this candidate phase. It freezes
the complete imported document and fee-letter values and the two independent
matter-link populations before adding current row versions, archive state,
relationship retirement/order, complete aggregate histories and owned submission
receipts. Original document evidence, fee-letter source values, the 231 reviewed
covered-matter links, 393 reviewed matter-side references and all 57 plus 19
quarantine rows remain immutable and separately checked.

The restricted runtime role receives only guarded state/save gateways and narrow
evidence-count readers; it has no direct access to private boundary/history/receipt
tables, business-table writes or related sequences. Document and fee-letter writes
revalidate the current account/session/role and lock affected aggregates and
parents. Covered-matter membership and the matter-side single current fee-letter
reference remain separate operations. Archive/restore is Administrator-only and
does not cascade to links, invoices or source evidence.

The final historical migration-70 copy passed all 146 permanent checks at migration
71, and the canonical empty replay passed all 128 applicable checks. Production
browser proof ran only against an isolated PostgreSQL 17.11 cluster and disposable
build. The owner database remains at migration 70 and the accepted application
remains active; review and explicit later acceptance are required before migration
71 or a new build is activated.
