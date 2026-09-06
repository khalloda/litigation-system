# Task 4.0a staff roster readiness audit — 6 September 2026

> **Evidence and recommendation, not canonical authority.** This file preserves
> the complete pre-implementation audit and its historical recommendations.
> [Decisions D44–D50](../DECISIONS.md#d44--task-40a-manages-firm-staff-only)
> own the approved policy; [TASKS.md](../../TASKS.md#stage-4--core-screens) owns
> implementation status, phases and the return point. The 60-migration and
> 93-invariant results below were captured during the preceding readiness audit;
> no database verification was rerun while recording this documentation.

**VERDICT: not yet safe to implement.** The repository and database are healthy, and the broad authorization contract is already settled. Implementation should wait for the owner decisions in section 15 and for three safety prerequisites: mutable-roster baseline separation, atomic account handling during staff deactivation, and database-enforced Arabic identity collision prevention.

## 1. Repository and database checkpoint

- Branch: `main`
- HEAD: `98d20ae4494aa7085f0e29086cfebe9b4070abe9`
- `origin/main`: same commit
- Ahead/behind: `0/0`
- Working tree: clean
- No merge, rebase, cherry-pick, revert, or bisect operation is active.
- Required predecessor commit `23484f54369311e1a2996238f5cc3c2b37687420` is reachable.
- Task 4.0 is complete; [Task 4.0a](../../TASKS.md) is the first unchecked task; Task 4.1 remains unstarted.
- The existing PostgreSQL 17 container was already running and healthy. I did not start, stop, restart, reset, or migrate it.
- `npm run db:verify`: passed all 13 platform checks.
- `npm run db:check`: passed all 93 permanent checks.
- `npm run check`: passed TypeScript, lint, formatting, RTL, authorization, audit, user-management, Git-ignore, and encoding checks. Its first sandboxed run stopped at Git inspection with `spawnSync git EPERM`; the approved read-only rerun passed.
- Applied migrations: 60, with no unfinished migration.
- Migration 60 SHA-256 remains `7921c9b168549928185bfd0b915ccc725ba363787158990c614420e0e3bbbee5`.
- Final aggregate checkpoint: 137 people, 350 aliases, 2 teams, 4 accounts, 824 audit events, and zero current `_migration.high_impact_row_proof` rows.
- No repository file was edited and no commit was created.

**Compliance disclosure:** I inadvertently invoked `npm run test:permissions`, despite the audit instruction prohibiting disposable databases. It briefly created an empty isolated database, then failed before applying migrations because the sandbox refused a child Node process. The test’s cleanup removed that database. I subsequently verified that zero `litigation_permissions_fixture_%` databases remain. It did not connect to, modify, or delete data in the `litigation` database. This was still a process error and should not be represented as full compliance with that prohibition.

## 2. Existing staff model

The core model is already unified around [`Person`](../../prisma/schema.prisma), not separate staff and external-person tables.

| Area | Existing contract |
|---|---|
| Identity | Generated integer ID; required, exactly unique Arabic canonical name |
| Search | Database-derived `name_ar_normalised`, with a GIN trigram index |
| Optional details | English name and email |
| Classification | `is_staff`; external people remain in the same identity table |
| Employment | `is_active`; inactive records are retained |
| Trainee status | `is_trainee` |
| Authentication projection | `can_login`, derived by database triggers rather than freely editable |
| Migration provenance | `is_application_native`; 135 imported people are false and 2 later people are true |
| Team | Nullable `team_id`; null is expressly valid |
| Audit | Created/updated attribution columns and row-level audit triggers |

[`PersonNameAlias`](../../prisma/schema.prisma) provides search variants. Exact alias text is globally unique. A partial index prevents more than one primary alias per person, but the database does **not** structurally guarantee that every person has a primary alias or that it equals the canonical Arabic name; those facts are currently protected only by `db:check`.

[`LookupTeam`](../../prisma/schema.prisma) has two active teams and an optional `reviewer_id`. There is presently no database constraint requiring a reviewer to be active, internal, non-trainee, or a member of the reviewed team.

[`UserAccount`](../../prisma/schema.prisma) is one-to-one with a person. Staff records and authentication accounts are intentionally separate.

People already participate in many historical relationships. Physical deletion is therefore both dangerous and unnecessary. Runtime database privileges do not include deletion, and the audit trigger rejects deletion of audited record tables.

## 3. Current roster evidence

**People and aliases**

| Measure | Current value |
|---|---:|
| Total people | 137 |
| Firm staff | 66 |
| External people | 71 |
| Active staff | 23 |
| Inactive/former staff | 43 |
| Application-native people | 2 |
| Imported/protected people | 135 |
| Trainees | 2, both inactive |
| People with a team | 8 |
| Staff without a team | 58 |
| Active staff with a team | 5 |
| Active staff without a team | 18 |
| Aliases | 350 |
| Primary aliases | 137 |
| Non-primary aliases | 213 |

The apparent difference from the PRD’s 135 people and 21 active staff is explained by the two approved application-native staff records added during authentication work. The original protected population remains 135 people, including 64 staff and 21 active staff.

**Teams**

- Two active teams.
- Eight members: five active and three inactive.
- Both teams have the same reviewer.
- That reviewer is an active staff member, has no team assignment, and is not a member of either reviewed team.
- This is deliberate imported evidence, not an accidental duplication; the permanent check documents the shared reviewer at [check-db.ts](../../scripts/check-db.ts).

**Accounts**

- Four accounts, all enabled, initialized, and presently usable.
- Four active staff are linked to accounts.
- Nineteen active staff have no account.
- There is exactly one usable Administrator.

**Identity integrity**

- Zero normalized canonical-name collisions.
- Zero exact alias collisions.
- Zero normalized alias collisions across different people.
- Zero missing or mismatched primary aliases.
- Zero orphan aliases, account links, team links, or reviewer links.

**Historical references that must survive status and name changes**

| Relationship | Rows | Distinct people | Rows linked to inactive people |
|---|---:|---:|---:|
| Hearing attendees | 9,113 | 39 | 3,141 |
| Attendance | 4,022 | 10 | 1,223 |
| Administrative task assignment | 1,953 | 15 | 184 |
| Matter lawyers | 968 | 12 | 138 |
| Task-action performers | 3,306 | 12 | 245 |
| Powers-of-attorney lawyers | 87 | 27 | 42 |
| Documents | 126 | 10 | 26 |
| Invoice allocations | 47 | 9 | 18 |

This is why “deactivate” must mean retaining the identity and every historical relationship.

## 4. Existing approved contract

The following matters are already settled and should not be reopened during implementation:

- Team membership belongs on the person, not the matter. A null team is valid. Only the two current teams exist; the Access “team 3” duplicate is excluded under D6.
- All four roles may view the roster; only Administrator may manage it. This is recorded in [PERMISSIONS.md](../../docs/PERMISSIONS.md) and implemented in the central [permission policy](../../src/lib/auth/permissions.ts).
- Account creation is not staff creation. D36 requires Task 3.4 to link an account only to an already existing, active staff identity.
- Staff management must not create accounts, set passwords, choose account roles, or duplicate the `/users` controls.
- D37 requires server and database protection against losing the last usable Administrator, including through future person deactivation. See [D37](../../docs/DECISIONS.md).
- D38 requires account disablement to invalidate sessions, retain the account and actor, and require a new temporary password for later reactivation. See [D38](../../docs/DECISIONS.md).
- Authentication and authorization use database IDs, never submitted Arabic names or hard-coded usernames.
- Names and historical aliases are migration evidence. Values may not be silently overwritten or discarded.
- D43 requires final Access cutover reconciliation by durable source identity. Application edits must not later be mistaken for fresh Access data or blindly overwritten. See [D43](../../docs/DECISIONS.md).
- Audit actors and events are immutable and retained indefinitely.
- Arabic is primary, all screens are RTL, UI strings live in `src/strings.ts`, and Latin `J` must never normalize to Arabic `ق`.

## 5. Proposed Task 4.0a scope

**In scope**

- `/staff`: searchable, filtered, paginated staff roster.
- `/staff/new`: create a new firm staff identity.
- `/staff/[id]`: staff detail, including inactive/former staff.
- `/staff/[id]/edit`: edit approved identity and employment fields.
- Dedicated deactivate and reactivate actions.
- Add and review Arabic aliases.
- Controlled canonical Arabic-name correction.
- Assign or remove a staff member’s team.
- Subject to question 5, maintain the reviewer of the two existing teams.
- Administrator-only read-only indication of whether an account exists, with a link to `/users`.

**Out of scope**

- Creating, editing, enabling, disabling, resetting, or assigning roles to accounts.
- External-person management.
- Physical deletion of people, aliases, teams, accounts, or history.
- Creating, renaming, archiving, or deleting teams.
- Bulk import, final Access cutover, or migration reconciliation.
- Attendance, matter, hearing, document, POA, billing, or task editing.
- The audit-history interface reserved for Task 4.9.
- Inventing an employee-number system or other new business identifier unless question 6 selects it.

The roster should default to active staff and provide explicit Active / Former / All filters, team and unassigned filters, trainee filtering, and Arabic search. A page size of 25 is sufficient for the current 66 staff while preserving a scalable query contract.

## 6. Lifecycle and field matrix

| Field or operation | View | Create | Ordinary edit | Special rule |
|---|---|---|---|---|
| Arabic name | All roles | Required | Controlled rename | Normalize and collision-check; preserve old name as alias |
| English name | All roles | Optional | Yes | Trim; blank becomes null |
| Email | All roles, subject to normal staff visibility | Optional | Yes | Normalize case/whitespace and enforce normalized uniqueness |
| Staff classification | All roles | Fixed `true` | No | This screen never converts external identities |
| Active status | All roles | Starts active | No inline checkbox | Dedicated deactivate/reactivate actions |
| Trainee status | All roles | Yes | Yes | Reviewer eligibility depends on question 5 |
| Team | All roles | Optional | Yes | Null is valid |
| Aliases | All roles | Primary alias created automatically | Add/retire under question 4 | No physical deletion or reassignment |
| Login eligibility | Administrator only | No | No | Database-derived |
| Account status | Administrator only | None created | No account controls | Link to `/users` |
| Application-native marker | Not ordinarily shown | Must be `true` | Immutable | Used by D43 reconciliation |
| Normalized shadows | Never editable | Database-generated | Database-generated | Must not be accepted from a form |
| Audit/provenance fields | Administrator detail if useful | Server/database only | Server/database only | Never trusted from a request |
| Concurrency version | Hidden form token | Starts at initial version | Incremented on mutation | Reject stale submissions |

Lifecycle effects:

- **Create:** atomically create the application-native person and exactly one matching primary alias. No account is created.
- **Edit:** update only allowlisted fields and audit only the fields that changed.
- **Rename:** retain the former canonical name as an alias and make the new canonical spelling the one primary alias.
- **Deactivate:** preserve all relationships; resolve reviewer obligations; handle any linked account atomically.
- **Reactivate:** restore employment eligibility only. It must not independently enable a disabled account.
- **No delete operation:** absent from UI, server actions, service methods, and runtime database privileges.

## 7. Identity and duplicate prevention

The current exact unique indexes are not sufficient for safe interactive creation:

1. `أحمد` and `احمد` can differ exactly but normalize to the same identity.
2. A canonical name can collide with another person’s alias.
3. Two concurrent requests can both run an application-level “no collision” query and then commit.
4. The primary-alias index guarantees “at most one”, not “exactly one”.
5. The permanent check detects bad state after the fact; it does not prevent it.

The required contract is:

- Acquire one transaction-level identity advisory lock for person creation, canonical rename, and alias addition.
- Normalize only through the database `ar_normalise()` function.
- Reject:

  - canonical-to-canonical normalized collisions;
  - canonical-to-another-person’s-alias collisions;
  - alias-to-another-person’s-canonical collisions;
  - alias-to-alias normalized collisions across different people.

- Permit multiple spelling variants that normalize identically only when they belong to the same person.
- Enforce exactly one primary alias equal to the canonical name at transaction completion.
- Create the person and primary alias in one transaction.
- Never reassign an imported alias from one person to another.
- Preserve the old canonical spelling when a rename succeeds.
- Never reintroduce the former global `J → ق` fold. The corrective migration explicitly proves `140J` does not match `140ق` at [remove_j_to_qaf_fold](../../prisma/migrations/20260823073815_remove_j_to_qaf_fold/migration.sql).
- Do not auto-merge identities or append invented numeric suffixes. A collision requiring human identification must stop with a clear conflict response.

A normalized canonical-name unique index is appropriate only if question 6 confirms that the firm will enter a sufficiently complete official name when two people would otherwise normalize identically.

## 8. Account and Administrator safety

The current session validator correctly rejects a linked person immediately while they are inactive; see [session.ts](../../src/lib/auth/session.ts). The last-Administrator database guard also covers `people.is_active`.

There is nevertheless an important lifecycle gap:

1. Staff management deactivates a person.
2. The database derives `can_login=false`, so existing sessions stop working.
3. The linked account remains enabled and its `session_version` is unchanged.
4. If the person is later reactivated, the existing trigger derives `can_login=true`.
5. An unexpired JWT issued before deactivation becomes valid again.

That would bypass D38’s intended fresh-password reactivation process.

The recommended contract is therefore:

- Deactivating a staff member with an account atomically disables that account, clears lockout state, increments `session_version`, records `account_disabled`, and invalidates all sessions.
- Reactivating the person does **not** enable the account.
- Account reactivation remains solely in `/users`, with a new temporary password.
- A staff action may call a shared internal account-lifecycle service, but it must not reproduce account controls in the roster.
- The acting Administrator must be locked and revalidated inside the same serializable transaction, following [user-management.ts](../../src/lib/auth/user-management.ts).
- An Administrator must not deactivate their own linked person through staff management.
- The database last-admin guard remains the final boundary for concurrent operations.

This matters immediately because the database currently has only one usable Administrator; that person cannot be deactivated until another usable Administrator exists.

## 9. Authorization and security

| Capability | Administrator | Litigation Assistant | Lawyer | Paralegal |
|---|---:|---:|---:|---:|
| View/search staff | Yes | Yes | Yes | Yes |
| View former staff | Yes | Yes | Yes | Yes |
| Create/edit/deactivate/reactivate | Yes | No | No | No |
| Maintain aliases and teams | Yes | No | No | No |
| See linked-account status | Yes | No | No | No |
| Perform account operations | Through `/users` only | No | No | No |

Required enforcement:

- Every page uses the page-permission boundary.
- Every server action independently uses the action-permission boundary.
- The route inventory must gain every staff page and mutation so an omitted permission fails `npm run check`.
- Never accept a role, actor ID, `is_application_native`, normalized name, audit actor, or `can_login` value from form data.
- Re-read the acting Administrator and target person in the transaction.
- Use database IDs for mutations; the submitted Arabic name is data, never identity lookup.
- Add an optimistic concurrency token so one Administrator cannot silently overwrite a record another Administrator changed.
- Allowlist fields rather than spreading submitted form objects into Prisma.
- Use Prisma parameters or fixed SQL gateways; no constructed SQL.
- Preserve normal React output escaping.
- Restrict account linkage information to Administrators because the other roles do not have user-management permission.
- Retain the existing no-DELETE runtime posture.
- Prefer narrow fixed-`search_path` database gateways for multi-table identity operations. They make it impossible for a future service to create a person without a primary alias or to bypass collision handling.

There is currently no staff route in the authorization inventory, which is correct because Task 4.0a has not started.

## 10. Arabic, RTL, and accessibility

The proposed interface contract is:

- Arabic `lang` and RTL direction at the document level.
- Every visible string in `src/strings.ts`.
- CSS logical properties only.
- Arabic canonical name as the dominant list and detail label.
- English name visually secondary.
- Email rendered left-to-right with bidirectional isolation.
- Search across canonical names and aliases using `ar_normalise()`.
- If an alias caused the match, disclose that fact in text, such as “matched a former spelling”, without exposing every alias in the compact row.
- Active, former, trainee, and account states must use text as well as colour.
- Use a responsive card/list layout on narrow screens rather than forcing a dense desktop table.
- Maintain a logical keyboard order and visible focus.
- Use native labelled controls; do not use placeholder text as the label.
- Put an error summary before the form, focus it after a failed submission, and link each error to its field.
- Preserve non-secret form values after validation or stale-write rejection.
- Dedicated buttons for deactivate/reactivate, with the consequence stated before confirmation.
- Minimum WCAG 2.2 AA target size is 24×24 CSS pixels; the project should target approximately 44×44 for primary controls.
- Test keyboard-only operation, no focus trap, focus restoration after confirmation, 320-CSS-pixel reflow, zoom, Arabic screen-reader labels, and contrast.
- Do not rely on a hover-only alias or account explanation.

These conclusions were materially informed by a local accessibility checklist used as advisory evidence, particularly WCAG 2.1.1, 2.4.3, 2.4.7, 3.3.1, 3.3.2, 1.4.10, 1.4.1, 1.4.3, and 2.5.8. Project decisions and canonical documentation remain authoritative.

No browser testing was performed during this audit.

## 11. Audit events

The existing audit model already classifies people, aliases, and teams as records and captures their allowlisted before/after values. The implementation should use it as follows:

| Operation | Required audit result |
|---|---|
| Create staff | `record_created` for person and primary alias |
| Edit fields | `record_updated` with changed fields only |
| Add alias | Alias `record_created` |
| Canonical rename | Person and affected alias `record_updated` events in one transaction |
| Team membership change | Person `record_updated` for `team_id` |
| Team reviewer change | Team `record_updated` for `reviewer_id` |
| Deactivate person | Person `record_updated` plus semantic `archive` |
| Reactivate person | Person `record_updated` plus semantic `restore` |
| Disable linked account | Account `record_updated` plus `account_disabled` |
| Validation or stale-write rejection | No false success event |
| View and search | No event under the current approved taxonomy |

Additional requirements:

- Structural changes and their semantic lifecycle event must commit or roll back together.
- Establish the human audit context only after revalidating the acting Administrator.
- Keep immutable actor identity labels unchanged when the person’s display name or username later changes.
- Audit only allowlisted fields; never record cookies, tokens, password material, password hashes, connection strings, or entire untrusted form bodies.
- There is no approved audit action for ordinary validation and authorization denials. Do not invent one inside Task 4.0a.
- Failed database transactions must not leave success events.

The underlying trigger already refuses physical deletion of record entities at [append-only audit migration](../../prisma/migrations/20260902180000_append_only_audit_events/migration.sql).

## 12. Database and migration assessment

The relevant migration history is coherent:

- Initial people, aliases, and teams
- Alias completeness
- Reviewed duplicate-person merges
- At-most-one primary alias
- Exact team-composition postcondition
- Arabic normalized search
- Removal of the unsafe global `J → ق` fold
- Authentication and application-native identities
- Immutable audit actors
- Append-only audit events
- Secure account lifecycle and last-Administrator guard

No applied migration should be edited.

A new Task 4.0a migration is required before the write UI. It should:

1. Capture an immutable application-boundary roster snapshot under `_migration`, keyed by stable person and alias IDs.
2. Preserve imported canonical names, aliases, status, team membership, and reviewer evidence at that boundary.
3. Add database-supported application mutation provenance—recommended fields are a DB-maintained row version and application-modified timestamp.
4. Ensure runtime-created staff are always `is_application_native=true`; the present column default is false and is unsafe if a service forgets to set it.
5. Add the identity collision lock/guards.
6. Enforce the primary-alias invariant transactionally.
7. Add case-normalized email uniqueness if email remains unique.
8. Add reviewer eligibility/deactivation guards after question 5 is answered.
9. Add alias lifecycle columns if question 4 approves retiring application-native aliases.
10. Preserve the existing runtime no-delete and audit constraints.

**Blocking incompatibility:** [`scripts/check-db.ts`](../../scripts/check-db.ts) currently locates the 135 protected people by their live canonical names and pins exact active/inactive/team membership values. It also pins exact team sets and reviewer identities. Therefore, a legitimate rename, employment-status change, or team reassignment would make the permanent database check fail.

That check is doing useful work today, but it freezes the live roster and is incompatible with Task 4.0a. It must be redesigned before writes are exposed:

- Immutable Stage 2/source evidence remains protected by stable IDs and the new boundary snapshot.
- Historical aliases may not disappear or move to another person.
- Current operational fields are checked for invariants, not frozen values.
- Application changes are distinguishable from Access-source changes for D43.
- Any final importer must reconcile rather than overwrite application-modified rows.

This is a change in *where* the evidence is protected, not a weakening of migration integrity. The source code itself acknowledges that renaming a reviewed person is a decision that should be visible at [reviewed-links.ts](../../scripts/lib/reviewed-links.ts).

## 13. Implementation and test plan

Recommended delivery is four small, independently working commits within Task 4.0a:

1. **Database boundary and invariants — 2–3.5 days**

   - Boundary snapshot and provenance.
   - Collision and primary-alias protection.
   - Reviewer and account safety according to owner decisions.
   - Update permanent checks without weakening source evidence.
   - Test historical upgrade and canonical clean replay.

2. **Read-only roster — 1.5–2.5 days**

   - Server query, pagination, filters, normalized search, and detail view.
   - Authorization inventory entries.
   - Arabic/RTL responsive UI.
   - No mutations yet.

3. **Administrator mutations — 2–3 days**

   - Create, edit, rename, alias, team, deactivate, and reactivate services.
   - Serializable transactions and stale-write handling.
   - Account lifecycle integration.
   - Audit semantic events.

4. **Interaction verification and documentation — 1–2 days**

   - Error, confirmation, keyboard, focus, reflow, and screen-reader behavior.
   - Real-volume query plans and regression tests.
   - Update task and handoff documentation only after all gates pass.

Estimated total: **7–11 development days**, assuming the recommended options are approved and no source-identity conflict emerges.

Required verification:

- `npm run check`
- `npm run db:verify`
- `npm run db:check`
- Staff authorization source self-test
- Permission tests on an isolated fixture database
- Clean-replay and historical-upgrade migration profiles
- Database concurrency tests for normalized duplicates, stale updates, reviewer races, and last-Administrator protection
- Audit atomicity and secret-redaction tests
- Real-volume read tests using the current 137 people, 350 aliases, and historical reference volumes
- Browser interaction tests for keyboard, focus, validation, RTL, zoom, and narrow-screen reflow—only after explicit owner authorization
- Final clean Git status and one clear commit for each working piece

Static checking cannot prove transaction races or keyboard behavior. Database tests cannot prove the interface. Browser tests cannot replace server authorization tests. All three layers are required.

## 14. Risks and blockers

| Rank | Risk | Real-world consequence | Required mitigation | Historical status | Post-decision disposition |
|---:|---|---|---|---|---|
| 1 | Live roster frozen by the Stage 2 baseline | A valid rename or staff departure makes `db:check` fail, or someone weakens the check and loses migration evidence | Immutable boundary snapshot plus stable-ID checks | **Blocker** | Mandatory prerequisite; not implemented. |
| 2 | Account remains enabled after person deactivation | An old JWT can become valid again when the person is reactivated | Disable account and increment its session version atomically | **Owner decision required** | Resolved by D46; pending implementation. |
| 3 | Normalized duplicate race | Two Administrators can create Arabic spellings that resolve to the same identity | DB serialization lock and cross-table collision guard | **Blocker** | Mandatory prerequisite; not implemented. |
| 4 | Imported alias changed or reassigned | Hearings, matters, POAs, and final cutover can resolve the wrong person | Keep imported aliases immutable; retain old canonical names | **Owner decision required** | Resolved by D45 and D47; pending implementation. |
| 5 | Reviewer becomes inactive or unsuitable | Both teams can be left with a reviewer who should no longer approve work | Eligibility constraint and reassignment-before-deactivation rule | **Owner decision required** | Resolved by D48; pending implementation. |
| 6 | Application row retains `is_application_native=false` | Final cutover may treat a new hire as imported data and overwrite or misclassify it | Fixed database gateway and provenance checks | **Blocker** | Mandatory prerequisite; not implemented. |
| 7 | Last or acting Administrator deactivated | The firm loses administrative access | Service self-lockout rule plus existing serialized DB guard | Mitigated, needs staff-service coverage | Retain the existing guard and add staff-service coverage; not implemented. |
| 8 | Stale form overwrites a newer change | One Administrator silently reverses another’s staff or team edit | Row version and stale-response workflow | Required | Mandatory row-version and stale-response handling; not implemented. |
| 9 | Genuine people share a normalized name | A strict uniqueness policy may reject a legitimate hire | Decide full-name versus separate-identifier policy | **Owner decision required** | Resolved by D49 with a fail-closed exception; pending implementation. |
| 10 | Route omitted from permission inventory | A new page or action can evade the structural authorization check | Inventory every entry and add staff-specific self-test | Required | Mandatory structural inventory and negative fixtures; not implemented. |
| 11 | Accessibility proven only statically | Keyboard, focus, or mobile reflow defects reach users | Local browser interaction testing | **Authorization required** | Resolved by D50; pending local-browser evidence. |
| 12 | Search query duplicates people through aliases | Pagination counts or ordering become confusing | Select distinct person IDs, deterministic ordering, query-plan test | Low risk | Require distinct person IDs, deterministic ordering and query-plan evidence; not implemented. |

## 15. Owner questions

I need these decisions before implementation.

**15.1 Should Task 4.0a manage firm staff only, or all 137 people?**

- **Firm staff only — Recommended.**
  - *Advantages:* matches the task name, D36, permissions table, and the account-eligibility model. The 71 external lawyers and other people remain preserved for their historical relationships.
  - *Disadvantages:* correcting an external person later requires a separate identity-maintenance task.
  - *Example:* a former external POA lawyer remains visible on the POA but does not appear as an editable employee.
  - *Cost and impact:* included in the 7–11 day estimate.

- **All people.**
  - *Advantages:* one interface for every identity.
  - *Disadvantages:* mixes employees, former staff, external lawyers, account eligibility, and migration evidence; requires additional filters, permissions, wording, and lifecycle rules.
  - *Cost and impact:* approximately 3–5 extra development days and greater migration risk.

**15.2 May an Administrator correct the canonical Arabic name of an imported staff member?**

- **Permit a controlled rename — Recommended.**
  - *Advantages:* ordinary spelling corrections can be completed without direct database work; the former canonical spelling remains searchable; immutable boundary evidence preserves the reviewed import.
  - *Disadvantages:* requires redesigning the current name-based permanent baseline.
  - *Example:* correcting a hamza or completing a staff member’s official name changes the display name but retains the previous spelling as an alias.
  - *Cost and impact:* approximately 1–2 days of the database phase, with high long-term value.

- **Lock imported canonical names.**
  - *Advantages:* smaller initial implementation and the current baseline remains valid.
  - *Disadvantages:* every correction needs a separately reviewed migration or maintenance operation; the staff screen would be unable to perform normal identity maintenance.
  - *Cost and impact:* saves roughly 1 day now but creates recurring support work and future rework.

**15.3 What should happen to a linked account when staff are deactivated?**

- **Disable it atomically and invalidate sessions — Recommended.**
  - *Advantages:* conforms to D38, prevents old-session revival, and makes reactivation deliberate.
  - *Disadvantages:* restoring access later requires an Administrator to reactivate the account with a temporary password in `/users`.
  - *Example:* when a lawyer leaves, their person becomes former staff and their account is disabled in the same transaction. If they return, employment and login access are restored separately.
  - *Cost and impact:* approximately 1–2 days including concurrency and audit tests.

- **Leave the account enabled while the person is inactive.**
  - *Advantages:* fewer database changes.
  - *Disadvantages:* an old unexpired token becomes valid after person reactivation; this is inconsistent with D38’s controlled reactivation policy.
  - *Cost and impact:* little initial cost, but an unacceptable access-control risk. I do not recommend implementing this option.

**15.4 How should an erroneous alias added through the new application be corrected?**

- **Imported aliases immutable; application-native aliases may be retired with a reason — Recommended.**
  - *Advantages:* historical migration evidence cannot be rewritten, while an Administrator can stop a newly mistyped alias from affecting search. Retirement is audited and reversible.
  - *Disadvantages:* requires alias provenance and active/retired fields plus a small management UI.
  - *Example:* a newly entered misspelling can be retired, but an alias that explains 2,792 imported attendee mentions cannot be removed or moved.
  - *Cost and impact:* approximately 1–2 days.

- **Never permit alias correction in the UI.**
  - *Advantages:* simplest and strongest append-only rule.
  - *Disadvantages:* every typo requires a controlled database correction and remains searchable until then.
  - *Cost and impact:* saves around 1 day initially but adds recurring support overhead.

**15.5 What team and reviewer policy should this task enforce?**

- **Keep the two existing teams fixed; allow membership and reviewer maintenance — Recommended.**
  - Reviewer must be active, internal, and non-trainee.
  - Reviewer need not belong to the reviewed team, matching the current imported arrangement.
  - Deactivation is blocked until every reviewed team is reassigned.
  - Both teams initially retain the same current reviewer.
  - *Advantages:* preserves D6 while preventing invalid future reviewer state.
  - *Disadvantages:* staff deactivation may require a prior reviewer reassignment.
  - *Cost and impact:* approximately 1–2 days.

- **Allow membership changes but keep reviewers read-only.**
  - *Advantages:* smaller scope.
  - *Disadvantages:* the firm cannot maintain reviewer responsibility when the current reviewer changes role or leaves.
  - *Cost and impact:* roughly 0.5–1 day less now, but a later reviewer-management task is required.

- **Add full team creation and editing.**
  - *Advantages:* maximum flexibility.
  - *Disadvantages:* reopens the settled two-team structure and introduces lookup lifecycle, naming, reporting, and migration questions.
  - *Cost and impact:* approximately 2–4 additional days. Not recommended for Task 4.0a.

**15.6 What should happen if two genuine staff members have Arabic names that normalize identically?**

- **Require a sufficiently complete official Arabic name — Recommended.**
  - *Advantages:* preserves the current unique-name and alias-search model without invented identifiers.
  - *Disadvantages:* the firm may need to enter additional official name components for a rare collision.
  - *Example:* two people both commonly called `أحمد محمد` must be stored under their fuller official names.
  - *Cost and impact:* no material extra development beyond the collision guard.

- **Introduce a separate firm staff number and allow duplicate canonical names.**
  - *Advantages:* supports genuinely identical full names directly.
  - *Disadvantages:* requires a new business identifier, data-entry policy, disambiguation throughout selectors, and substantial changes to existing uniqueness assumptions and checks.
  - *Cost and impact:* approximately 2–4 extra days plus owner-led assignment of identifiers.

**15.7 May implementation use the local browser for interaction testing after the screen is built?**

- **Authorize local browser testing for this screen — Recommended.**
  - *Advantages:* proves RTL rendering, keyboard order, focus restoration, form errors, zoom, and mobile reflow using the actual application.
  - *Disadvantages:* adds a small testing step; no data leaves the machine.
  - *Cost and impact:* approximately 0.5–1 day, already included in the estimate.

- **Static and database tests only.**
  - *Advantages:* no browser authorization is needed.
  - *Disadvantages:* accessibility and responsive behavior remain unproven and the definition of done would be weaker.
  - *Cost and impact:* saves testing time but carries a meaningful user-facing defect risk.

## 16. Owner resolution — D44–D50

**Owner:** Khaled Helmy

**Approval date:** 6 September 2026

The owner approved every recommended answer in 15.1–15.7, with the clarified
contracts recorded in the canonical decision log:

- [D44 — Task 4.0a manages firm staff only](../DECISIONS.md#d44--task-40a-manages-firm-staff-only):
  the 66 internal staff identities are in scope; 71 external identities are
  preserved outside the editing interface; all roles view and only
  Administrator manages; accounts remain outside staff management.
- [D45 — Controlled canonical Arabic-name correction](../DECISIONS.md#d45--controlled-canonical-arabic-name-correction):
  an Administrator may rename the same human identity while preserving the
  imported boundary and former spelling; collisions and ambiguity fail closed.
- [D46 — Staff deactivation and linked-account lifecycle](../DECISIONS.md#d46--staff-deactivation-and-linked-account-lifecycle):
  person deactivation retains history and atomically disables a linked account,
  clears lockout, increments session version, invalidates sessions and audits
  the change; person reactivation does not enable access.
- [D47 — Alias immutability and retirement](../DECISIONS.md#d47--alias-immutability-and-retirement):
  imported aliases are immutable; application-created aliases may be retired
  or restored with a required reason, full audit and repeated collision checks.
- [D48 — Fixed teams and reviewer maintenance](../DECISIONS.md#d48--fixed-teams-and-reviewer-maintenance):
  the two teams stay fixed; membership and eligible reviewer assignments may be
  maintained; a reviewer must be replaced before deactivation.
- [D49 — Arabic-name collision policy](../DECISIONS.md#d49--arabic-name-collision-policy):
  use sufficiently complete official Arabic names, never invented suffixes or a
  new staff-number system; a genuinely identical full name requires a new owner
  decision before creation.
- [D50 — Local browser interaction testing](../DECISIONS.md#d50--local-browser-interaction-testing):
  local browser evidence is authorized and required, with mutations restricted
  to an isolated disposable database and no project data leaving the machine.

The individual decision estimates overlap and are already incorporated into the
audit's overall **7–11 development-day** estimate; they must not be added
together. The approved options have **zero infrastructure and licensing cost**.

Approval resolves the policy choices but implements nothing. None of the twelve
risks is closed: each retains its historical rank and consequence, and the
post-decision column in section 14 records its pending disposition. Task 4.0a
and all four delivery phases remain unchecked.

**Exact return point:** **Task 4.0a Phase 1 — database boundary and operational
invariants, approved but not started.**
