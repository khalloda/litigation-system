# Task 4.0a Phase 1 — permanent invariant inventory and test profiles

This is verification classification approved by the owner on 6 September 2026,
not permission to weaken a failed check. Product decisions remain D44–D50;
`TASKS.md` owns completion and work order.

Migration 61 is deployed and verified on project PostgreSQL. The current
permanent historical profile passed 107/107 on 7 September 2026; see the
[deployment acceptance report](../task-reports/2026-09-07-task-4-0a-phase-1-migration-61-deployment.md).
The upgrade/rollback proofs below used the preserved predeployment migration-60
state. They remain dated evidence, separate from post-deployment checks.

**Task 4.1 documentation clarification, 8 September 2026:** DB-052–DB-056
still describe the implemented historical client/contact checks. D53/D57
approve their future separation into immutable import evidence and current
operational invariants; no checker changes have been made. DB-054's title is
legacy executable wording, not proof of how the empty strings arose. Observed
cash values are 316 populated, two empty strings and zero NULLs.

## Independently mandatory profiles

| Profile | Exact starting evidence | Required result |
| --- | --- | --- |
| Historical full-state upgrade (H) | Read-only full copy of the predeployment PostgreSQL 17.11 migration-60 database; all 97 table fingerprints, source/review payload, Task 3.5B release and protected evidence equal that source checkpoint | All 93 original invariants before migration 61; all 93 preserved/relocated plus 14 new invariants afterward: 107 |
| Canonical clean replay (C) | Empty, separate PostgreSQL 17.11 cluster with the approved Arabic ICU initialization; exact repository migrations through 61 | 75 original universal checks plus 14 new checks: 89; explicitly empty non-Git extraction, review-answer and release payload |

Both profiles run independently on the task-owned instance; neither substitutes
for the other. H's 18 historical-only checks identify the exact unavailable
artifact below. Their structural, privilege, identity, audit and provenance
guards stay universal in the paired checks. No frozen historical digest changes.

`scripts/lib/permanent-invariant-inventory.ts` is the fail-closed executable
inventory of DB-001–DB-093. `scripts/lib/staff-roster-structure.ts` supplies
STAFF-01–STAFF-14. The checker rejects an unknown, duplicated, or omitted
original check. Exact migration-60/61 branching rejects partial surfaces,
wrong checksums and wrong profiles. It never catches a failed invariant to
reclassify it. Default classification is both profiles.

## Commands and safe execution

- Historical-start acceptance: `node node_modules/tsx/dist/cli.mjs scripts/test-staff-roster.ts --profile-acceptance`.
- Historical-start mutation/rollback profiles: same command with `--mutation-proof`.
  Both require the verified migration-60 source before deployment; they are
  retained upgrade proofs, not commands for the current migration-61 source.
  They do not downgrade a source or reconstruct unavailable historical state.
- Current Phase 3 staff service/race and gateway proof: `npm run test:staff-mutations`.
- Authentication, 448 authorization decisions and account lifecycle:
  `node node_modules/tsx/dist/cli.mjs scripts/test-staff-roster.ts --regression-proof`.
- Current migration-61 audit regression: `npm run test:audit`, equivalent to
  `node node_modules/tsx/dist/cli.mjs scripts/test-staff-roster.ts --audit-regression-proof`.
- Separate audit-event regression: `npm run test:audit-events`, equivalent to
  the same harness with `--audit-events-regression-proof`.
- Historical migration-53–60 audit upgrade: `npm run test:audit:historical`,
  equivalent to the same harness with `--historical-audit-regression-proof`.
  This requires the exact verified migration-60 full-state source. It is
  unavailable from the current migration-61 source and deliberately fails
  there with `Legacy fixture source must still be at migration 60`.
- H permanent checks: `npm run db:check -- --profile=historical-full-state-upgrade`.
- C permanent checks: `npm run db:check -- --profile=canonical-clean-replay`.

The permanent commands are read-only checks of the explicitly configured
target. On the current project database, H checks the completed migration-61
checkpoint with 107 invariants; migration 61 is no longer pending. The command
does not deploy anything. Canonical acceptance runs only with the harness's
generated isolated target. The affected standalone authentication/audit fixture scripts now
refuse the project cluster; use the harness, not a database-name prefix on 5433.

The current audit command explicitly selects `test-audit.ts
--profile=current-state-61`. It fails closed unless the restored source has
the exact complete migration-61 ledger, checksums, historical data profile and
boundary, then requires all 107 permanent invariants, including actor and event
structure, data and protected historical evidence. It runs every shared audit
group: migration-principal preflight, password provisioning, canonical replay
through 61, role/ACL/session attacks, actor registry, attribution/spoofing,
Prisma/direct-SQL/junction writes, rollback, pooled/concurrent actor isolation
and denied bypasses. It then actually executes `scripts/test-audit-events.ts`:
classification, append-only access, redaction/context, semantic atomicity,
45,463-event volume, indexed paging and the migration-57 failure-atomicity
fixture built through 56. A child failure or interruption fails the command;
no failed assertion becomes a pass. Completion is reported for each suite.

`--profile=historical-53-60` retains the original historical upgrade assertions
and migration-60 source guard, followed by the same shared suites. Selecting
the current profile does not claim that historical replay passed. Missing,
unknown or extra profile arguments are rejected. No current command needs a
retained migration-60 dump, Access operation or workstation-only artifact.

The harness verifies Docker ownership labels, exact image identity and PG17.11,
distinct cluster identity, Arabic ICU initialization, isolated storage/network,
and one ephemeral localhost port other than 5433 before tests. It restores the
project through a read-only memory dump, never a dump file or project-volume
mount. Every role/session/catalog mutation stays in the isolated cluster.
Database-template copies preserve verified database-level ACLs explicitly.
All task-owned resources are removed after exact identity checks.

Each profile exercises 22 mutation groups: atomic creation/rename, provenance,
no-op and row-version behavior, alias lifecycle, normalized email, direct-DML
and private-evidence refusals, reviewer/account/Administrator races, all four
canonical/alias collision directions at READ COMMITTED, REPEATABLE READ and
SERIALIZABLE, late audit rollback, catalog weakening detection and Cairo-session
continuity. Late migration rollback and invalid-prestate refusal run on both
profiles. A copied historical source row in canonical state is rejected as
a hybrid without repair or partial migration surfaces.

Correction fixtures run in both acceptance and mutation-proof modes, separately
for H and C: real failed login; approved non-Administrator account disable;
actual boundary maximum/count/full digest; preserved derived `can_login`;
first genuine staff mutation strictly later; corrupt prefix; forged later
semantic event; inconsistent derived eligibility; permanent detection of a
rewritten or deleted later pre-boundary event. Exact reviewed-state upgrade and
forced late rollback remain independently covered. H pins the complete
824-event prefix (including timestamps); both profiles freeze every actual
predeployment event. A legal consumed sequence gap is not treated as a deleted
event: count and maximum are captured separately.
Additional fixtures create that gap by rolling back an approved login-event
transaction and reject a well-shaped structural event whose after-value fails
continuity with the next captured before-value or actual current row.

Canonical migrations initially leave the approved accounts passwordless.
Acceptance checks that migration-owned identity/security state, then initializes
only a generated disposable Administrator password before operational-readiness
and lifecycle tests. This is test setup, never a password-bearing migration.

Historical audit regression fixtures are separate from acceptance databases
and require the verified migration-60 source. The
migration-53 historical audit fixture is restored from the independently verified
pre-3.5B partition before installing post-data guards; it never deletes guarded
relationship evidence. The deliberate migration-57 conflict fixture is built
directly through 56, without undoing 61 or deleting audit classifications.
The D35 runner verifies the exact 56/60 temporary migration-file mirror, config
and isolated target; all original migration files and frozen digests stay intact.

## Complete inventory

For every **Both** row, the enforcing commands are H and C above; for every
**Historical** row, the command is H only. Every STAFF row additionally has the
two-profile mutation/rollback harness as behavioral evidence. “Same” means the
exact preceding result, not a relaxed comparison. Historical-only reasons name
non-Git payload, not an inconvenience in constructing a fixture.

| Stable ID | Description | Scope | Exact historical-only dependency | Expected at migration 60 | Expected at migration 61 |
| --- | --- | --- | --- | --- | --- |
| DB-001 | Task 3.5B current release and protected historical partition | Both | None | Both: exact release schema and guards. Historical: 382 exact dispositions, D41 twelve-hearing set, immutable full-value/event continuity. Canonical: no release, resolution or row-proof payload. | Same exact schema, guards and profile-specific release evidence as migration 60. |
| DB-002 | Connects to PostgreSQL | Both | None | 16 or newer | 16 or newer |
| DB-003 | Migrations applied | Both | None | at least 1 | at least 1 |
| DB-004 | Search extensions | Both | None | btree_gin, pg_trgm, unaccent | btree_gin, pg_trgm, unaccent |
| DB-005 | Arabic survives the driver | Both | None | arabic | arabic |
| DB-006 | Arabic sorts correctly | Both | None | … ,… ,بسام last | … ,… ,بسام last |
| DB-007 | Lookup lists (9) | Both | None | Historical: 138 lookup rows; canonical: 135; every list exact. | Historical: 138 lookup rows; canonical: 135; every list exact. |
| DB-008 | One default matter type | Both | None | 1 | 1 |
| DB-009 | Merged spellings removed | Both | None | 0 | 0 |
| DB-010 | Merge targets present | Both | None | 3 | 3 |
| DB-011 | تحكيم and تحقيق both kept | Both | None | 2 | 2 |
| DB-012 | Client branch: exact D19 baseline plus applied D39 approvals | Both | None | Historical: 18 named approved branches; canonical: 15; no invented or non-branch rows. | Historical: 18 named approved branches; canonical: 15; no invented or non-branch rows. |
| DB-013 | Crosswalk rules resolve | Both | None | 204 rules, 0 dangling, 0 unrecognised | 204 rules, 0 dangling, 0 unrecognised |
| DB-014 | No lookup value is also a crosswalk source | Both | None | 0 chains | 0 chains |
| DB-015 | Court list and crosswalk | Both | None | Historical: 309 courts; canonical: 308; both: 94 exact rules. | Historical: 309 courts; canonical: 308; both: 94 exact rules. |
| DB-016 | `26` is a circuit, court unknown | Both | None | circuit '26', not in lookup_court, 1 discard (/) | circuit '26', not in lookup_court, 1 discard (/) |
| DB-017 | Separate-client rules (rule b) | Both | None | 3 | 3 |
| DB-018 | Reviewed links unchanged | Both | None | 348 reviewed alias mappings plus 204 crosswalk rules; no changed mapping. | 348 reviewed alias mappings plus 204 crosswalk rules; no changed mapping. Original names use the verified stable-ID snapshot; current operational identity is checked independently. |
| DB-019 | Protected Stage 2 roster figures (9) | Both | None | 135/348/64/21/43/71/2/5/16 | 135/348/64/21/43/71/2/5/16; historical names/state are read from the verified stable-ID snapshot, while current operational state is verified independently. |
| DB-020 | No two people share a normalised name | Both | None | 0 collisions | 0 collisions |
| DB-021 | Every person findable by their own name | Both | None | 0 unfindable | 0 unfindable |
| DB-022 | Hamza pairs resolve to one person | Both | None | 2 pairs, 0 problems | 2 pairs, 0 problems; historical names/state are read from the verified stable-ID snapshot, while current operational state is verified independently. |
| DB-023 | One primary alias per person | Both | None | every person exactly 1, and it is their own name | every person exactly 1, and it is their own name |
| DB-024 | The one-primary index still exists | Both | None | present | present |
| DB-025 | Teams: exact reviewer and membership | Both | None | 2 teams, 4 named members each, reviewer ناجي رمضان | 2 teams, 4 named members each, reviewer ناجي رمضان; historical names/state are read from the verified stable-ID snapshot, while current operational state is verified independently. |
| DB-026 | Core schema: 23 tables, 21 raw columns | Both | None | all present | all present |
| DB-027 | No placeholder or complex columns | Both | None | 0 | 0 |
| DB-028 | Stage 2 can never reject a row | Both | None | 15 links + payments.payment_date, all nullable | 15 links + payments.payment_date, all nullable |
| DB-029 | D9 case numbers, D15 logos as files | Both | None | case_number_ar is text, client_logos holds no binary | case_number_ar is text, client_logos holds no binary |
| DB-030 | Guards do their job, not just exist | Both | None | 9 checks validated + 2 unique partial indexes + 0 matters with two leads | 9 checks validated + 2 unique partial indexes + 0 matters with two leads |
| DB-031 | Billing: exact money, no Pay-Date | Both | None | numeric amounts, Pay-Date absent | numeric amounts, Pay-Date absent |
| DB-032 | Invoice shares sum to 1 | Both | None | 0 out, 0 null shares | 0 out, 0 null shares |
| DB-033 | Allocations all reach an invoice | Both | None | 0 unresolved | 0 unresolved |
| DB-034 | Billing lookups: 11 exact codes | Both | None | 11 present, none translated | 11 present, none translated |
| DB-035 | Arabic search folds, and does not over-fold | Both | None | 10 of 10 | 10 of 10 |
| DB-036 | Normalised columns agree (all 7) | Both | None | 0 rows out of step | 0 rows out of step |
| DB-037 | Search triggers and indexes do their job | Both | None | 7 triggers enabled and correct, 7 trigram indexes | 7 triggers enabled and correct, 7 trigram indexes |
| DB-038 | Staging tables exist | Both | None | 20 (17 extracted + 3 complex) | 20 (17 extracted + 3 complex) |
| DB-039 | Staging columns | Both | None | 284 (204 from Access + 20 x 4 provenance and identity) | 284 (204 from Access + 20 x 4 provenance and identity) |
| DB-040 | Staging cannot refuse a row | Both | None | every source column text, nullable, no default | every source column text, nullable, no default |
| DB-041 | Staging has no constraints on source data | Both | None | no checks, no foreign keys, no unique constraints | no checks, no foreign keys, no unique constraints |
| DB-042 | Staging rows trace back to their origin | Both | None | 20 primary keys on (src_file, src_row_num) | 20 primary keys on (src_file, src_row_num) |
| DB-043 | Staging durable source identity | Both | None | Historical: exact extraction identity. Canonical: all 20 staging tables empty, extraction fingerprint absent, all identity functions/indexes exact. | Historical: exact extraction identity. Canonical: all 20 staging tables empty, extraction fingerprint absent, all identity functions/indexes exact. |
| DB-044 | Quarantine tables exist | Both | None | 20 (the 16 prior tables, three billing evidence tables and Attendance evidence) | 20 (the 16 prior tables, three billing evidence tables and Attendance evidence) |
| DB-045 | Quarantine can record a missing value | Both | None | finding.original_value is nullable | finding.original_value is nullable |
| DB-046 | Every finding explains itself | Both | None | 0 with a blank explanation | 0 with a blank explanation |
| DB-047 | No row is both quarantined and excluded | Both | None | 0 rows in two states | 0 rows in two states |
| DB-048 | Quarantine will not discard the firm's answers | Both | None | the truncate guard is installed | the truncate guard is installed |
| DB-049 | Quarantine answers stay on their source records | Both | None | durable constraint, 3 exact triggers, 0 orphaned identities | durable constraint, 3 exact triggers, 0 orphaned identities |
| DB-050 | Historic workbook identities cannot drift | Both | None | Both: exact identity constraints and triggers; historical: 744 exact immutable associations; canonical: zero associations and null aggregate digest | Same exact constraints, triggers and profile-specific association evidence as migration 60 |
| DB-051 | The firm's original 744 answers remain attached to the same values | Historical | The original 744 review-answer values, notes and decisions in quarantine.review_value and quarantine.finding; Git contains their frozen digest, not the payload. | 668 value answers + 76 finding answers, exact reviewed payload | 668 value answers + 76 finding answers, exact reviewed payload |
| DB-052 | Every staged client was transformed | Both | None | Historical: 318 staged clients and 318 targets; canonical: both zero. | Historical: 318 staged clients and 318 targets; canonical: both zero. |
| DB-053 | Every staged contact was transformed | Both | None | Historical: 188 staged contacts and 188 targets; canonical: both zero; no orphan contacts. | Historical: 188 staged contacts and 188 targets; canonical: both zero; no orphan contacts. |
| DB-054 | Cleared values still differ from never-entered | Both | None | Historical: two empty Cash/probono strings match staging; canonical: both source and target zero. No editing history is inferred. | Historical: two empty Cash/probono strings match staging; canonical: both source and target zero. No editing history is inferred. |
| DB-055 | contactLawyer preserved byte for byte | Both | None | 0 differing from staging | 0 differing from staging |
| DB-056 | Nothing was guessed into branch or contact_person | Both | None | 0 rows | 0 rows |
| DB-057 | Matter transform safeguards still exist | Both | None | 21/1/1/6/2/2/1 and reviewed key exact | 21/1/1/6/2/2/1 and reviewed key exact |
| DB-058 | Matter safeguard definitions are exact | Both | None | source identity, index, branch FK, triggers and functions exact | source identity, index, branch FK, triggers and functions exact |
| DB-059 | Every staged matter has one safe destination (historical partition) | Historical | The complete staged litigation extraction and its 1,689 historical matter targets plus 55 quarantine dispositions. | 1,744 = 1,689 historical targets + 55 preserved quarantine records; 0 defects | 1,744 = 1,689 historical targets + 55 preserved quarantine records; 0 defects |
| DB-060 | Matter target fields and quarantine evidence reconcile | Historical | The original 1,744 staged matter payloads and reviewed quarantine values, not reproduced by schema migrations. | 1,744 = 1,689 transformed + 55 quarantined; every target field and quarantine value exact | 1,744 = 1,689 transformed + 55 quarantined; every target field and quarantine value exact |
| DB-061 | Matter lawyers and parties reconcile to source | Historical | The staged matter lawyer/party cells and reviewed per-cell relationship outcomes from the historical extraction. | 33 rules + 84 ordered members + 38 exclusions; every source cell exact | 33 rules + 84 ordered members + 38 exclusions; every source cell exact |
| DB-062 | Corrected-rule current extraction evidence | Historical | Exact occurrences in the original staged powers-of-attorney and matter extraction used by the corrected relationship rules. | POA 8/0/1; matter lawyers 0/0/0 | POA 8/0/1; matter lawyers 0/0/0 |
| DB-063 | Matter relationship constraints and evidence guards | Both | None | 3 exact CHECKs, 5 exact unique indexes, 4 exact foreign keys, 2 exact triggers/functions; Git-owned 33 rules, 84 ordered members and 38 exclusions match every field. | Same exact structural and Git-owned rule-payload evidence as migration 60. |
| DB-064 | Attendee source cells and spans reconcile | Historical | The 12,732 imported attendee cells, complete byte spans and reviewed decomposition ledger. | 12,732 cells; every byte, span, answer, person and quarantine item exact | 12,732 cells; every byte, span, answer, person and quarantine item exact |
| DB-065 | Attendee audit constraints and evidence guards | Both | None | complete cell/span/quarantine constraints, indexes, foreign keys, triggers and functions | complete cell/span/quarantine constraints, indexes, foreign keys, triggers and functions |
| DB-066 | Hearings, attendees and quarantine reconcile | Historical | The imported hearing/attendee source rows, typed targets and quarantine outcomes. | 13,382 = 13,055 transformed + 327 quarantined; 8,884 attendees; every value and evidence item exact | 13,382 = 13,055 transformed + 327 quarantined; 8,884 attendees; every value and evidence item exact |
| DB-067 | Hearing transform constraints and evidence guards | Both | None | complete provenance constraints, unique indexes, foreign keys and quarantine protections | complete provenance constraints, unique indexes, foreign keys and quarantine protections |
| DB-068 | Administrative works and task steps reconcile | Historical | The staged administrative task and task-action payloads and their historical transformation evidence. | every staged task and step is exactly transformed or quarantined | every staged task and step is exactly transformed or quarantined |
| DB-069 | Administrative task business creation dates | Historical | The 3,694 migrated administrative tasks and their 1,906 recorded source dates; Git contains the frozen digest, not these source rows. | 3,694 migrated tasks: 1,906 source dates, 1,788 genuine nulls, range 2018-02-22 to 2026-08-18; never created_at | 3,694 migrated tasks: 1,906 source dates, 1,788 genuine nulls, range 2018-02-22 to 2026-08-18; never created_at |
| DB-070 | Administrative transform constraints and evidence guards | Both | None | complete provenance constraints, unique indexes and immutable quarantine definitions | complete provenance constraints, unique indexes and immutable quarantine definitions |
| DB-071 | Administrative court `26` remains circuit-only | Historical | The one specific imported administrative task whose raw court is 26. | the one reviewed row has circuit 26, no court, and raw court 26 | the one reviewed row has circuit 26, no court, and raw court 26 |
| DB-072 | Powers of attorney reconcile to source and reviewed relationships | Historical | The 752 imported power-of-attorney payloads and their reviewed relationship outcomes. | 752 source records; every value, typed field, reviewed member and evidence row exact | 752 source records; every value, typed field, reviewed member and evidence row exact |
| DB-073 | POA constraints and evidence guards | Both | None | complete PostgreSQL 17.11 definitions, including function configuration | complete PostgreSQL 17.11 definitions, including function configuration |
| DB-074 | Paper documents reconcile to source and reviewed relationships | Historical | The 407 imported paper-document payloads and reviewed links. | 407 source records; every scalar, typed value, raw value, link and evidence row exact | 407 source records; every scalar, typed value, raw value, link and evidence row exact |
| DB-075 | Document constraints and evidence guards | Both | None | complete PostgreSQL 17.11 definitions, including function configuration | complete PostgreSQL 17.11 definitions, including function configuration |
| DB-076 | Fee letters and both matter-link directions reconcile | Historical | The 331 imported fee letters, 288 source forward links and 412 source reverse references. | 331 fee letters; 288 forward links; 412 reverse references; every value, rule and evidence row exact | 331 fee letters; 288 forward links; 412 reverse references; every value, rule and evidence row exact |
| DB-077 | Fee-letter constraints and evidence guards | Both | None | complete PostgreSQL 17.11 definitions, including function configuration | complete PostgreSQL 17.11 definitions, including function configuration |
| DB-078 | Billing history and immutable evidence reconcile | Historical | The 543 historical invoices, 597 payments, 47 allocation rows and immutable import evidence. | 543 invoices; 597 payments; 47 allocation rows in 15 exact-one groups; no source loss | 543 invoices; 597 payments; 47 allocation rows in 15 exact-one groups; no source loss |
| DB-079 | Billing constraints and evidence guards | Both | None | complete PostgreSQL 17.11 definitions, including function configuration | complete PostgreSQL 17.11 definitions, including function configuration |
| DB-080 | Staff attendance reconciles to the leave register | Historical | The 4,022 original staff-attendance extraction rows and immutable import ledger. | 4,022 source rows; every exact value, alias, date and provenance field has one target or quarantine outcome | 4,022 source rows; every exact value, alias, date and provenance field has one target or quarantine outcome |
| DB-081 | Attendance constraints and evidence guards | Both | None | complete PostgreSQL 17.11 definitions, including function configuration | complete PostgreSQL 17.11 definitions, including function configuration |
| DB-082 | Migrated client logos reconcile to source and files | Historical | The 54 original extracted logo payloads/files and their byte-identical immutable import records. | 54 immutable import rows, 54 clients, exact source/result digests and every referenced file valid | 54 immutable import rows, 54 clients, exact source/result digests and every referenced file valid |
| DB-083 | Client-logo constraints and import evidence guards | Both | None | complete PostgreSQL 17.11 definitions, including function configuration | complete PostgreSQL 17.11 definitions, including function configuration |
| DB-084 | Task 3.1 initial identities and authentication state | Both | None | four exact account/person/alias mappings; 135 protected canonical people plus two named native additions; valid eligibility and password states | four exact account/person/alias mappings; 135 protected canonical people plus two named native additions; valid eligibility and password states; historical names/state are read from the verified stable-ID snapshot, while current operational state is verified independently. |
| DB-085 | Authentication constraints and security guards | Both | None | complete PostgreSQL 17.11 definitions, including function configuration | complete PostgreSQL 17.11 definitions, including function configuration |
| DB-086 | Task 3.4 operational Administrator readiness | Both | None | At least one usable Administrator. Canonical acceptance initializes a generated disposable password only after asserting the exact passwordless migration-owned state. | At least one usable Administrator; legitimate lifecycle mutations may not remove the last usable Administrator. |
| DB-087 | Task 3.3A actor schema and trigger enforcement | Both | None | exact 38-table boundary, 76 foreign keys/indexes and immutable registry/context functions | exact 38-table boundary, 76 foreign keys/indexes and immutable registry/context functions |
| DB-088 | Task 3.3A complete runtime principal and ACL boundary | Both | None | exact schemas, zero explicit inbound/outbound memberships, ACL provenance, columns, sequences, functions, MAINTAIN and session_replication_role refusal | exact schemas, zero explicit inbound/outbound memberships, ACL provenance, columns, sequences, functions, MAINTAIN and session_replication_role refusal |
| DB-089 | Task 3.3A/3.4 truthful actor registry and current attribution | Both | None | Three exact system actors, four original human mappings, one immutable actor per current account. Historical: 45,463 migration creations and at most four original unknown update actors. Canonical: independently approved initial actor/creation profile. | Same exact actor registry and immutable audit attribution contract; historical 45,463 creation population retained, canonical accepted initial profile plus synthetic operational fixtures. |
| DB-090 | Protected 5,209-row business and timestamp projection | Historical | The original 5,209 billing/attendance rows, original stable IDs and original timestamps. | 5,209 rows; SHA-256 b50879f52200275e70515cb4e1daa76594c304237a40b864205108e15490aeab. | Same 5,209 rows and exact protected SHA-256 as migration 60. |
| DB-091 | Frozen Task 3.3A audit-attribution projection | Historical | The historical-live Task 3.3A attribution snapshot for 45,463 imported creations; canonical replay has a distinct already-approved audit baseline. | SHA-256 edf4be9e8668fc65005deaa69cababf79dec1ac1b3e12f2356b9e6da892c009d. | Same frozen historical attribution SHA-256 as migration 60. |
| DB-092 | Task 3.3B append-only event structure | Both | None | exact tables, allowlists, triggers, keyset indexes, fixed-path functions and runtime grants | exact tables, allowlists, triggers, keyset indexes, fixed-path functions and runtime grants |
| DB-093 | Task 3.3B truthful baseline checkpoint | Both | None | One first baseline event, with the exact independently approved historical or canonical aggregates and frozen immutable digests. | Same unchanged historical/canonical audit checkpoint definitions and frozen digests; new events must remain truthful and secret-free. |
| STAFF-01 | Exact profile and complete migration-60/61 ledger | Both | None | The exact migration-60 profile passes its existing invariants; every migration-61 table, function and column must be absent. | The complete Phase 1 boundary is present and this invariant holds after accepted mutations and rejected adversarial fixtures. |
| STAFF-02 | Immutable imported and native snapshot identity populations | Both | None | The exact migration-60 profile passes its existing invariants; every migration-61 table, function and column must be absent. | The complete Phase 1 boundary is present and this invariant holds after accepted mutations and rejected adversarial fixtures. |
| STAFF-03 | Immutable business projections, actual roster snapshot and complete pre-boundary audit digests | Both | None | The exact migration-60 profile passes its existing invariants; every migration-61 table, function and column must be absent. | The complete Phase 1 boundary is present and this invariant holds after accepted mutations and rejected adversarial fixtures. |
| STAFF-04 | Imported alias spelling, normalized identity, owner, provenance and existence | Both | None | The exact migration-60 profile passes its existing invariants; every migration-61 table, function and column must be absent. | The complete Phase 1 boundary is present and this invariant holds after accepted mutations and rejected adversarial fixtures. |
| STAFF-05 | Fixed team identity and original reviewer evidence | Both | None | The exact migration-60 profile passes its existing invariants; every migration-61 table, function and column must be absent. | The complete Phase 1 boundary is present and this invariant holds after accepted mutations and rejected adversarial fixtures. |
| STAFF-06 | Current native/import classification and stable person identities | Both | None | The exact migration-60 profile passes its existing invariants; every migration-61 table, function and column must be absent. | The complete Phase 1 boundary is present and this invariant holds after accepted mutations and rejected adversarial fixtures. |
| STAFF-07 | Database versions, application provenance and audited full-row continuity | Both | None | The exact migration-60 profile passes its existing invariants; every migration-61 table, function and column must be absent. | The complete Phase 1 boundary is present and this invariant holds after accepted mutations and rejected adversarial fixtures. |
| STAFF-08 | Exactly one active canonical primary for every person | Both | None | The exact migration-60 profile passes its existing invariants; every migration-61 table, function and column must be absent. | The complete Phase 1 boundary is present and this invariant holds after accepted mutations and rejected adversarial fixtures. |
| STAFF-09 | Cross-table normalized identity domain has no different-owner collision | Both | None | The exact migration-60 profile passes its existing invariants; every migration-61 table, function and column must be absent. | The complete Phase 1 boundary is present and this invariant holds after accepted mutations and rejected adversarial fixtures. |
| STAFF-10 | Normalized non-null email shape and both uniqueness protections | Both | None | The exact migration-60 profile passes its existing invariants; every migration-61 table, function and column must be absent. | The complete Phase 1 boundary is present and this invariant holds after accepted mutations and rejected adversarial fixtures. |
| STAFF-11 | Current reviewer eligibility and enabled-account person eligibility | Both | None | The exact migration-60 profile passes its existing invariants; every migration-61 table, function and column must be absent. | The complete Phase 1 boundary is present and this invariant holds after accepted mutations and rejected adversarial fixtures. |
| STAFF-12 | Exact database code, immutable evidence guards and deferred constraints | Both | None | The exact migration-60 profile passes its existing invariants; every migration-61 table, function and column must be absent. | The complete Phase 1 boundary is present and this invariant holds after accepted mutations and rejected adversarial fixtures. |
| STAFF-13 | Exact new audit field classifications; historical classifications preserved separately | Both | None | The exact migration-60 profile passes its existing invariants; every migration-61 table, function and column must be absent. | The complete Phase 1 boundary is present and this invariant holds after accepted mutations and rejected adversarial fixtures. |
| STAFF-14 | Source artifact presence or absence matches the declared profile exactly | Both | None | The exact migration-60 profile passes its existing invariants; every migration-61 table, function and column must be absent. | The complete Phase 1 boundary is present and this invariant holds after accepted mutations and rejected adversarial fixtures. |
