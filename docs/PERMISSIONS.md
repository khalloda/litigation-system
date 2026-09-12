# Roles and permissions

About 10 users. Four roles. Accounts can be added and disabled by the
Administrator; they are never physically deleted.

## Matrix

| Area | Administrator | Litigation Assistant | Lawyer | Paralegal |
|---|---|---|---|---|
| Clients | full | add / edit | view | view |
| Contacts | full | add / edit | view | view |
| Matters | full | add / edit | view | view |
| Hearings | full | add / edit | view | view |
| **Administrative works** | full | add / edit | view | **add / edit** |
| Powers of attorney | full | add / edit | view | view |
| Documents register | full | add / edit | view | view |
| Fee letters | full | add / edit | view | view |
| Client logo upload | full | add / edit | view | view |
| Invoices & payments | **view** | **view** | **view** | **view** |
| Run and export reports | yes | yes | yes | yes |
| Staff roster | **manage** | view | view | view |
| Users and roles | **manage** | no | no | no |
| Dropdown lists | **manage** | no | no | no |

## Notes

Task 3.1 stores these four role codes on the initial accounts. **Task 3.2 now
enforces this matrix on the server.** The exhaustive policy is
`src/lib/auth/permissions.ts`; the server-only guard that reads the validated
Auth.js session is `src/lib/auth/authorization.ts`. It never accepts a role
from a request, query string, header or client component.

`proxy.ts` continues to perform early authentication redirects, but it is not
authorization. Every page and Route Handler, and every project-owned Server
Action anywhere in the repository, is independently classified in
`src/lib/auth/route-inventory.ts`. The lightweight structural check is part of
`npm run check`, and `npm run test:permissions` provides the full negative
suite. They require the exact authoritative import, static area/action
literals that agree with the inventory, and an enforcement pattern that runs
before protected work. Permission-protected Route Handlers and module-level
Server Actions must be direct immutable `export const` wrappers. They fail if
a future entry point is unclassified, if a same-named local or unrelated
function is substituted, if a protected export is mutable, aliased or
reassigned, if enforcement is ignored, late or conditional, or if the proxy is
offered as the only protection. Generated Prisma code is the only narrow
source-tree exclusion.

`src/app` is the only permitted routing root. Root `app`, root `pages` and
`src/pages` directories fail the check because this project is App Router-only
and a root router directory can cause Next.js to ignore `src/app`. The checker
parses project-owned `.js`, `.jsx`, `.ts`, `.tsx`, `.mjs`, `.mts`, `.cjs` and
`.cts` files. App Router `page.*` and `route.*` discovery follows a statically
proved `next.config.ts` `pageExtensions` policy; Next.js 16.3.1 currently uses
its default `tsx`, `ts`, `jsx`, `js` list. Unsupported or dynamically
unprovable extensions and configuration fail closed rather than being
silently skipped.

**Invoices are view-only for everyone, including the Administrator.** New
invoicing lives in Excel until Phase 2, so there is nothing to create here yet.

**Billing is visible to all roles, for all clients.** Not restricted to the
lawyer's own matters — **1,000 of the current 1,744 matters have no target
lawyer relationship**, so such a rule would hide billing from everyone. The
Task 2.7 historical result was 981 of 1,689 transformed matters; the earlier
pre-migration planning snapshot was 834 of 1,730. See D14.

**Everyone can export ordinary reports and visible business data.** If a role
can see ordinary data on screen, it can export it to Excel or PDF. Audit-history
export is the narrow exception described below; it must not be folded into this
general rule.

**Only the Administrator manages the dropdown lists** (courts, categories,
degrees, venues, party roles).

**No physical-deletion permission exists.** In this matrix, `full` means view,
create, update, archive and restore for the nine operational areas. Archive is
recoverable removal, not database deletion. Only the Administrator can archive
or restore; every other role is denied both everywhere. Permanent deletion of
Phase 1 business records through the application is prohibited. See D25.

User-account disable/reactivate is implemented in Task 3.4 and retains the
account, person, actor and history. Staff and dropdown removal remains
deactivate; their rows and values are retained. Client-logo removal must
eventually be recoverable and retain the file and its evidence. Those other
lifecycle screens, handlers, database representations, archived-record
visibility, filters and reporting behavior remain to be implemented with their
relevant tasks. D52–D57 settle the client/contact contract below. Phase 1
implements deployed database enforcement; application handlers and screens
remain later work. Other areas retain their existing task boundaries.

## Clients and contacts — Task 4.1 database foundation deployed and verified

Migration 62 grants runtime access only to three client/contact mutation
gateways. Each resolves the current trusted human actor, enabled account and
active login-eligible staff identity on the server, then enforces this matrix.
Runtime direct table writes and sequence access are revoked. Archive/restore
is Administrator-only. Business mutations and audit events commit together.
After isolated verification and separate owner authorization, migration 62 is
deployed on project PostgreSQL with 15/15 database checks and 116/116 historical
invariants. Phase 1 is operationally complete. Phase 2 now adds three guarded
read-only pages and independently guarded logo GET/HEAD; application mutation
controls remain Phase 3. See the
[deployment acceptance report](task-reports/2026-09-09-task-4-1-phase-1-migration-62-deployment.md).

The matrix above is unchanged: Administrator view/create/update/archive/restore;
Litigation Assistant view/create/update; Lawyer and Paralegal view. All four
viewing roles may explicitly filter for archived clients and view clearly
labelled, read-only archived details. Only Administrators receive archive and
restore operations, with related-record counts shown before confirmation.
Enforce each page, read, handler and mutation independently on the server;
derive authorization and actor attribution from the validated session.

Archive is non-cascading and separate from client business status. Exclude
archived clients from ordinary lists and new selections; keep existing matters
accessible and included in reports. Retain billing, contacts, logos,
relationships and main-contact selection. Preserve each contact's individual
archive state: restoring the parent never restores a separately archived
contact. Archived client business fields remain read-only until restoration.
Before any contact creation, editing, archiving or restoration, require the
parent client to be restored. This restriction applies to Administrators too.

Main contact is optional, same-client and unarchived. Explicitly clear or
replace the selection before archiving that contact; never auto-select a
replacement. Contact reassignment is outside Task 4.1, including ownership
changes hidden in ordinary edits. Existing-logo viewing uses its own view
guard; logo upload/replacement/resizing/recoverable removal stay Task 4.1a.
Responsible-lawyer text is historical-only; staff assignment/mapping is
deferred. No physical deletion is authorized. See D52–D57 and
[TASKS.md](../TASKS.md) for current phase status; the preceding paragraph records
the Task 4.1 client/contact contract.

### Client logos — Task 4.1a candidate

Task 4.1a implements `clientLogoUpload` without changing the matrix:
Administrator may view/create/update/archive/restore; Litigation Assistant may
view/create/update; Lawyer and Paralegal may view. An archived parent client
must be restored before any logo mutation. An archived logo must be restored
by Administrator before replacement. Empty/forged updates cannot clear or
implicitly restore a logo. Page/read/request/service checks and the committing
database gateway independently enforce the boundary. The local implementation
requires separate review, acceptance and migration-63 deployment; see the
[logo report](task-reports/2026-09-10-task-4-1a-client-logos.md).

## User management — implemented Task 3.4

`/users` requires `usersAndRoles / view`; each of its six mutation actions is
directly inventoried and requires `usersAndRoles / manage`. With the unchanged
448-decision matrix, both permissions are Administrator-only. Unauthenticated,
forced-password-change, Litigation Assistant, Lawyer and Paralegal sessions
are rejected before account data or mutation work.

Accounts are created only for an existing active staff person with no account,
selected and re-read by numeric ID. Username correction, role change, disable,
reactivate and administrative password reset all use the validated acting
Administrator from the server session; form fields cannot choose the actor or
acting role. Self-disablement, self-demotion and self-administrative reset are
refused. The database also prevents any account or later person mutation from
leaving zero usable Administrators. Disable/reactivate replaces deletion, and
staff roster editing is implemented separately in Task 4.0a Phase 3.

## Staff roster — Phase 2 read-only and Phase 3 mutation routes implemented

`/staff` and `/staff/[id]` require `staff / view`; the existing 448-entry
matrix grants that permission to Administrator, Litigation Assistant, Lawyer
and Paralegal. `staff` is the existing executable permission key; the earlier
`staffRoster` wording was descriptive, not an additional permission area.
The implemented `/staff/new`, `/staff/[id]/edit` and every create, rename,
alias, team, reviewer, deactivate or reactivate mutation require
`staff / manage`, which is Administrator-only. Hiding a control is not
authorization: each page, action and route must validate the server session
independently before reading protected roster data or mutating anything.

The permission applies only to the 66 internal staff identities (23 active and
43 inactive). The 71 external people are not roster results. All roles may see
staff identity, active/former state, trainee state and roster organization
needed for their legal work. Account existence/status and the link to `/users`
are Administrator-only; other roles receive neither those fields nor a hidden
client-side copy. No staff route may create, enable, disable, reset, rename or
change the role of a user account.

Staff records and imported aliases are never deleted. Only an Administrator
may deactivate/reactivate a person or retire/restore an application-created
alias. Deactivation of a linked account is an atomic safety consequence of
person deactivation, not an additional staff-screen account permission;
person reactivation never grants access. Self-deactivation and any operation
that would remove the last usable Administrator are refused. The detailed
identity, alias, team and reviewer contract is D44–D50. Migration 61 implements
its database boundary, deployed and verified on project PostgreSQL on 7 September.
Runtime direct INSERT/UPDATE/DELETE/
TRUNCATE on the three roster tables and their sequence access are revoked;
six narrow public gateways require a current usable human Administrator, audit
context and (for existing records) the expected row version. Private evidence
and helper access remain denied. Phase 2 adds exactly two permission-inventory
entries: `/staff` and `/staff/[id]`, each with its first awaited server guard.
The read service independently checks the validated session before querying,
uses a read-only repeatable-read transaction, and refuses external person IDs.
Phase 3 adds two `staff/manage` pages and nine independently guarded Server
Actions, making 13 staff inventory entries. The mutation service independently
authorizes and revalidates the current Administrator account, employment and
session version in a serializable transaction. Only the six migration-61
gateways perform roster writes; their current-actor checks remain authoritative.
Non-Administrators receive no mutation controls, and direct URLs and crafted
actions fail on the server. The existing 448 decisions and `/users` boundary
pass regression unchanged. Source checks retain the read-query prohibition on
writes, reject direct UI database access and pin the complete mutation service
and its 15 SQL call sites. See the
[Phase 3 report](task-reports/2026-09-08-task-4-0a-phase-3-administrator-staff-mutations.md).

## Audit access — approved UI/capability, not implemented

Decision **D31** does not change the current four roles or the 448 explicit
Task 3.2 decisions until its later capability is implemented and tested:

- Every Administrator may view audit history.
- Audit export requires a separate account-level capability, initially granted
  only to `KHelmy`.
- The server must authorize that capability, not compare a username string.
- There is no fifth Owner role.
- Litigation Assistants, Lawyers and Paralegals receive no audit-history access
  through their role.

Secure actor attribution and append-only audit events exist, but no viewer,
audit export or account capability exists yet. The contextual drawer, global
Administrator page and export remain the later Task 4.9 UI checkpoint.

### Attribution enforcement

Every application write must run in one transaction after server-side session
validation and set its actor through the fixed Task 3.3A helpers. Human context
accepts only a validated account ID with an immutable linked actor. Login and
lockout writes use `system_authentication`; controlled local password setup or
reset uses `system_administration`; migration/import/seed tools use the
privileged connection and `system_migration`. Request bodies, action arguments,
URLs, headers and client-supplied usernames/roles never select an actor.

The database trigger overwrites caller-supplied actor/timestamp fields and
fails restricted-runtime writes without valid transaction-local context. The
runtime cannot edit the actor registry or choose the administration/migration
helpers. PostgreSQL's general custom-setting mechanism is still a residual
trust boundary if the application process itself is fully compromised; the
control prevents external request spoofing and ordinary direct writes, not
cryptographic impersonation by that process.

## Server denial behavior

- A missing or invalid session is an authentication failure: pages go to the
  login screen and route handlers return HTTP 401.
- A valid session without the required permission is an authorization failure:
  route handlers and server actions fail with HTTP-style 403 semantics. Pages
  are redirected server-side to the Arabic denial endpoint, whose final
  response is HTTP 403.
- A session that still requires a password change cannot use a business guard.
- Unknown roles, areas and actions are denied. There is no fallback role.
- Billing is view-only for all four roles, including the Administrator.
- All four roles may run and export reports.

Next.js 16.3.1 still marks its `unauthorized()` and `forbidden()` interrupts as
experimental. Task 3.2 does not enable them. It uses stable redirects for
pages and ordinary 401/403 responses for handlers instead.

## Implementation rules

1. **Enforce on the server.** Hiding a button is not security. Every API route
   checks the role.
2. **Record who changed what.** Task 3.3A securely attributes the exact
   38-table application inventory; Task 3.3B adds the append-only chronological
   event trail. Staging, quarantine, immutable migration evidence,
   infrastructure, actor-registry and event tables keep their purpose-specific
   provenance instead of receiving misleading application actor columns. The
   old system had no audit trail at all; this is one of the main reasons for
   replacing it.
3. **Former staff cannot log in.** 43 of 135 people have left the firm. They
   remain in the roster so historical records still show who did the work, but
   `can_login` is false and they do not appear in dropdowns for new entries.
4. **Roles are fixed in Phase 1.** No custom role builder. Four roles, hardcoded.
5. **Classify every new entry point.** A new supported `page.*`, `route.*` or
   project-owned server action must be added to the route inventory and use the
   statically enforced server-boundary pattern before it can pass the
   permission suite. Each exported HTTP method is checked separately.
6. **Attribution and append-only events are implemented.** Task 3.2 decides
   whether an operation is allowed, Task 3.3A records its actor on application
   rows, and Task 3.3B writes bounded/redacted chronological events through
   database-enforced append paths. D31's audit-export capability and viewer
   remain later Task 4.9 work.
7. **User management is implemented.** Task 3.4 supplies the Administrator-only
   `/users` screen, six permission-wrapped actions, reviewed lifecycle service
   and database guards without changing any of the 448 decisions.

### Task 4.1 Phase 2 implementation — 9 September 2026

All four roles can view the three new client/contact pages and logo GET/HEAD.
Each page guards its first awaited operation; read services independently enforce
clients/view and contacts/view. Logo handlers, metadata reads and filesystem
reads independently enforce clientLogoUpload/view. Sessions come from existing
validated server authentication. Five new inventory entries bring the total to
34, without changing the 448-decision matrix. No client/contact mutation route,
Server Action, edit/archive button or logo-upload control is added.

Stop for independent Phase 2 review; Phase 3 is the next development phase.
See the [implementation and verification report](task-reports/2026-09-09-task-4-1-phase-2-read-only-clients.md).


### Task 4.2 Phase 3 — D58

D58 adds two Administrator-only pages (`/matters/[id]/archive`,
`/matters/[id]/restore`) and their individually guarded server actions. Services
and committing SQL routines independently verify current usable account, role,
session version and expiry. All four roles retain archived read access;
Administrator/Litigation Assistant editing requires an unarchived matter.
The existing permission matrix is unchanged; restoration is required first.
Related records retain their own permissions; client archive state is independent.
