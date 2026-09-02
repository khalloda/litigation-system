# The database — running it, checking it, fixing it

Everything here works the same on the Windows laptop and on the Ubuntu server.
You need Docker installed and running; nothing else.

---

## Everyday commands

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
