# Task 3.4 — Administrator-only user management

- Implemented: 3 September 2026; the bounded UI acceptance correction is
  pending independent review of the three local commits
- Codex model: GPT-5.6 Sol
- Reasoning effort: high
- Environment: Local
- Subagents: prohibited; none used
- Expected qualitative usage: high
- Least-expensive safe configuration rationale: one bounded security-sensitive
  account-lifecycle migration, its database/audit evidence and its first
  administrative UI required complete local implementation and replay; no
  parallel or external work was needed.
- Starting commit: `5d016eba6be7664c9f075766c33d6da426cd30a4`
- Foundation commit: `24bf7433f228bfae2e8ca525431b9d461d4a40ed`
  (`feat: secure Task 3.4 account lifecycle`)
- UI commit: `b1ca42019f1fa1a48758fab6542d841d263bf83e`
  (`feat: add Task 3.4 user management`)
- UI acceptance correction: the enclosing commit named
  `fix: close Task 3.4 UI acceptance gaps`; record its SHA after creation
  because a content-addressed commit cannot contain its own SHA.
- Push status: not pushed; `origin/main` remains the accepted Task 3.3B commit
  `5d016eba6be7664c9f075766c33d6da426cd30a4`
- Exact authorized stop point: three local Task 3.4 commits and one
  correction-only external review patch; no push
- Exact next return point: Task 3.5 — High-impact quarantine review, not started

## Run configuration and cost rationale

The work used the owner-mandated local/high configuration. No subagent,
Graphify, Figma, site builder, external storage or remote service handled
project content. The installed security fix workflow focused the pre-change
reproduction, exact privilege/service boundary and post-change bypass review
on Task 3.4 only. Repository code, installed package behavior and PostgreSQL
17.11 were sufficient; Context7 was not needed.

The installed in-app browser workflow was attempted against a disposable
localhost database and disposable password, but its control runtime could not
initialize because its local kernel-assets path was missing. No Playwright
dependency is installed, and adding one was prohibited and unnecessary for the
feature. The temporary server, database and harness were removed. Permanent
static TypeScript, TSX and CSS checks cover the page/action inventory,
permission-conditioned navigation, password-clearing and non-secret-state
logic, returned-field focus wiring, programmatic summary focusability, live
regions, confirmations, visible-focus rules and narrow layout. These checks are
not an interactive browser test and do not prove focus movement in a running
browser; the production build supplies the rendering compilation gate.

## Post-review UI acceptance correction

The bounded correction reproduced four acceptance gaps before editing: the
authenticated home had no `/users` link; completed-result logic never consumed
`state.field`; every result reset its entire form; and the focused static test
claimed focus coverage while checking only for a `:focus-visible` CSS rule. The
old focused test passed with all four gaps present, proving that its acceptance
claim was too broad.

The authenticated home now renders the existing Arabic `t.nav.users` link only
when the canonical policy grants `usersAndRoles / view`; `/users` keeps its
existing server-side authorization. Each management form now submits without
the automatic successful-action form reset, clears both uncontrolled password
inputs after every completed result, resets the full form only on success, and
preserves safe non-secret inputs on error. Error focus follows the returned
field name when that control exists and otherwise moves to a focusable error
summary; a retained success message receives focus. No password is held in
React state. The Arabic username hint now states the first-character rule, the
total 3–64-character length and the allowed later characters precisely.

The focused static suite now asserts each of those source contracts directly,
including the absence of form `action` attributes that would reset uncontrolled
non-secret fields after a resolved semantic error. It retains separate checks
for live regions, visible-focus CSS and responsive rules without representing
those source checks as an interactive browser run. `npm run check` and the
production build passed after the correction. The bounded scope, migration,
dependency, lockfile, secret, raw-data and artifact scans passed without a
backend, database, migration, runtime-storage or protected-data change.

## Approved and prohibited scope

Khaled Helmy approved D36–D38 through the Task 3.4 owner mandate on 3 September
2026:

- **D36:** create an account only for an existing active staff person with no
  account, selected and re-read by ID. Do not require the derived `can_login`
  value before creation and do not create/edit people, aliases, teams or staff
  state. Staff identity work is future Task 4.0a.
- **D37:** prohibit application self-disablement and self-demotion and prevent
  account or person changes from removing the last usable Administrator,
  including concurrent attempts. A usable Administrator is enabled, has the
  Administrator role and an initialized password, and is linked to an active,
  login-eligible person. Clean replay may create passwordless initial accounts;
  operational readiness is checked separately.
- **D38:** username/role/access/password transitions invalidate the required
  sessions; disable clears lockout and retains evidence; reactivation requires
  a fresh temporary password and forced change; human administrative reset
  records the Administrator; no manual unlock, self-administrative reset,
  password redisplay/generation, physical deletion or new auth method exists.
  Username correction records `username_changed`.

The four roles, 448 authorization decisions, Argon2id/password/lockout/session
contracts, ordinary self-password change, D31/D34 audit UI/capability deferral,
and D25 disable-not-delete rule remain exact. Task 3.5, Task 4.0, Task 4.0a,
Task 4.9 and every later implementation task remain unstarted. The generalized
recovery path for an account created after the original four remains a separate
pre-go-live owner decision; Task 3.4 adds no such break-glass command.

## Principal outputs

Migration 59 is
`prisma/migrations/20260903160000_secure_user_account_lifecycle/migration.sql`.
Its file and applied checksum are
`364c04d7cf96a476cf3efaf092c5ffc7ad99389cf51a70b8b31d8f9d0268f15d`.
Migrations 1–58 are byte-identical.

The restricted runtime lost direct `user_accounts` insert privilege and still
cannot delete or truncate. Its one reviewed account-creation gateway requires
human audit context, re-proves the acting usable Administrator, locks and
re-reads an eligible staff ID, creates the account and sequence-allocated
immutable actor atomically, and returns only the account ID. An event failure
rolls back account and actor.

The service lists all accounts and eligible staff and owns create, username,
role, disable, reactivate and reset transitions. Serializable transactions,
row/advisory locks, version checks and database triggers handle stale,
concurrent and last-Administrator cases. The local password command remains
restricted by immutable original IDs 1–4 even after an original username is
corrected.

The Arabic/RTL `/users` page shows enabled and disabled accounts, Arabic role,
password/forced-change, lock and last-login states. It provides distinct forms
for each approved transition. Six immutable Server Actions and the page are
exactly inventoried under `usersAndRoles / manage` and `/ view`; each action
derives its actor from `session.user.id` and delegates mutation to the reviewed
service.

## Lifecycle and event matrix

| Operation | State/session result | Ordered semantic events |
|---|---|---|
| Create with temporary password | New enabled account, forced password change, immutable actor | `account_created`, `password_initialized` |
| Correct username | Existing account retained; `session_version` increments | `username_changed` |
| Change role | Existing account retained; `session_version` increments | `role_changed` |
| Disable | Sessions invalidated; lock/failures cleared; rows/history retained | `account_disabled` |
| Reactivate | Fresh temporary password; lock cleared; forced change; sessions invalidated | `account_enabled`, `password_reset` |
| Administrative reset | Fresh temporary password; lock cleared; forced change; sessions invalidated | `password_reset` by the human Administrator |

Row-triggered before/after events remain complementary. The strict semantic
gateway requires the current human Administrator, correct target human actor,
`public.user_accounts`, the exact account key and approved action/outcome.
Only the original-ID-bound local command may use `system_administration` for
password initialization/reset.

## Exact changed files

Foundation commit (19 files):

- `package.json`
- `prisma/migrations/20260903160000_secure_user_account_lifecycle/migration.sql`
- `scripts/check-audit.ts`
- `scripts/check-db.ts`
- `scripts/check-user-management.ts`
- `scripts/lib/audit-event-structure.ts`
- `scripts/lib/audit-source-inventory.ts`
- `scripts/lib/audit-structure.ts`
- `scripts/lib/auth-structure.ts`
- `scripts/lib/user-management-source.ts`
- `scripts/test-audit-events.ts`
- `scripts/test-audit.ts`
- `scripts/test-auth.ts`
- `scripts/test-permissions.ts`
- `scripts/test-user-management.ts`
- `src/lib/audit.ts`
- `src/lib/auth/constants.ts`
- `src/lib/auth/service.ts`
- `src/lib/auth/user-management.ts`

UI/documentation commit (18 files):

- `README.md`
- `TASKS.md`
- `docs/DATA-MODEL.md`
- `docs/DATABASE.md`
- `docs/DECISIONS.md`
- `docs/MIGRATION.md`
- `docs/PERMISSIONS.md`
- `docs/PRD.md`
- `docs/VISUAL-DIRECTION.md`
- `docs/task-reports/2026-09-03-task-3-4-user-management.md`
- `package.json`
- `scripts/test-user-management-ui.ts`
- `src/app/users/actions.ts`
- `src/app/users/page.tsx`
- `src/app/users/user-management.tsx`
- `src/app/users/users.module.css`
- `src/lib/auth/route-inventory.ts`
- `src/strings.ts`

UI acceptance correction (6 files):

- `docs/task-reports/2026-09-03-task-3-4-user-management.md`
- `scripts/test-user-management-ui.ts`
- `src/app/auth.module.css`
- `src/app/page.tsx`
- `src/app/users/user-management.tsx`
- `src/strings.ts`

## Verification and exact results

- `npx prisma format`, `npx prisma validate`, `npx prisma generate`: passed;
  Prisma Client 7.9.1 generated.
- `npm run db:migrate:deploy`, `npm run db:migrate:status`: 59 migrations
  found, no pending migration, schema current through migration 59.
- `npm run db:verify`: 13 platform checks passed; PostgreSQL 17.11; 59 applied
  + 1 approved rolled-back migration; 7 existing actors; 38 audit triggers.
- `npm run db:check`: all 92 permanent invariants passed; exactly one usable
  Administrator in the project database.
- `npm run test:user-management`: passed lifecycle/eligibility/atomicity,
  non-arithmetic actor, privilege, concurrency, local-command, rollback and
  secret-output fixtures; the focused `/users` static source suite also passed.
- `npm run test:audit`: passed historical-live migrations 53–59, canonical
  clean replay 52–59, D35/role/ACL paths, failed-migration atomicity,
  missing-context/classification rollback, strict lifecycle semantics,
  pagination and a realistic 45,463-event append benchmark (11,074.1 ms append,
  0.155 ms indexed 50-row entity retrieval).
- `npm run test:auth`: passed exact identity, Argon2id, lockout concurrency,
  forced change, absolute sessions, invalidation, restricted runtime and all
  current authentication events.
- `npm run test:permissions`: passed the exact 4 × 14 × 8 = 448 matrix,
  direct 401/403 denial, immutable wrappers, runtime role refresh and route
  inventory fixtures.
- `npm run test:gate4`: 60/60 adversarial fixtures passed and every fixture was
  removed.
- `npm run verify:gate4-migrations -- historical-live`: passed at database
  profile digest
  `86eb32a96d97167d6bc699d3576f42c4a6916a53c0a37d557035abd79bd8447f`;
  canonical repository digest
  `41a6d6f6612f9f5900ea91a56cd0888fc934c3e12678db1fcf5699623f9f4ce7`;
  provenance 51 required / 8 later / 1 rollback. Canonical-clean-replay
  provenance passed inside `npm run test:audit`. A bare provenance invocation
  first returned its required-argument usage message; it made no change and was
  rerun with the correct explicit profile.
- `npm run check`: passed type, lint, formatting, RTL (22 rules/59 deliberate
  findings and both known gaps covered by the focused static UI test), authorization
  (16 entry points), audit (30 runtime sources, 6 schema and 67 bypass fixtures),
  user-management (8 negative fixtures), gitignore and encoding checks.
- Two `npm run reconcile:gate4` executions, each with its own idempotency proof,
  were byte-identical. Report digest:
  `141aa7a7830c6267ac83136e5ad290ba22374de85e40825d514960a0772554ee`;
  captured complete-output SHA-256:
  `400d50cdbe73979c1f14eb3c4d173ec65c711f05876fe6b3ee2f1ff1ea9a2ad6`.
- Production build, final diff checks, Markdown link/table checks and bounded
  tracked-file/disposable scans passed before the enclosing commit.

## Protected counts, hashes, digests and invariants

- Project state remains four accounts, seven actors, one truthful baseline
  event and 583 field classifications; migration 59 adds no project data.
- Original three system actors and four human actors remain exact. Every
  current account/human actor pair is one-to-one; the sequence floor makes
  future actor IDs deliberately independent of account IDs.
- Four roles and all 448 authorization decisions are unchanged.
- Invoices 543; payments 597; allocations 47; attendance 4,022; protected total
  5,209.
- Protected digest:
  `b50879f52200275e70515cb4e1daa76594c304237a40b864205108e15490aeab`.
- Frozen Task 3.3 attribution digest:
  `edf4be9e8668fc65005deaa69cababf79dec1ac1b3e12f2356b9e6da892c009d`.
- Task 3.3 baseline event digest:
  `63bb6a28a88b29af10b60a82f14b7763d416df553aa01549e5e51942294e6173`.
- Migration 57:
  `81f42f19bcae73b38805391d0ad80b87d92e4270adbd9578db46016907e04ab0`;
  migration 58:
  `e6aefa8ef378434062ef18c82f84d218a1f0531c74f10c3845713cce7226579b`.
- Billing, attendance, workbook, logo, migration and Gate 4 evidence remained
  exact; raw data and runtime storage remain outside Git.

## Unresolved items

The only product question recorded—not implemented—is a pre-go-live recovery
path for a future account outside the original four if no usable Administrator
can perform the normal web reset. It needs a separate owner decision. This does
not weaken the Task 3.4 last-Administrator guard or the existing original-four
local recovery command.

Browser interaction remains an environment limitation described above, not a
failed product gate: the compiled UI, dedicated static source evidence and all
server/database enforcement passed, but no interactive browser test was run for
this correction. Task 3.5 is the exact next return point after independent
acceptance and remains unstarted.
