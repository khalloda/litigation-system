# Task 4.0a Phase 1 — migration 61 deployment acceptance

- Acceptance checkpoint: 7 September 2026; classification **DEPLOYED AND VERIFIED**.
- Documentation authority: Khaled Helmy's retained acceptance request and explicit authorization of the corrected fetch retry.
- Owner-requested model/effort: GPT-5.6 Sol / High; actual runtime settings were not independently verified.
- Environment: Local, normal non-elevated Windows launch; sandbox permission used for authorized Git metadata writes.
- Subagents: prohibited; none used. Expected usage: low, limited to local evidence and documentation/static checks.
- Starting commit and deployment Git checkpoint: `fefd86fd37aced931deb195aae1a07bb4abd1e27`.
- Documentation commit: the enclosing `docs: accept Task 4.0a Phase 1 deployment` commit. Its full SHA and parent are recorded in the external patch receipt and final response, avoiding a self-referential hash.
- Remote state: one successful authorized preflight fetch; no push or other remote action.
- Authorized stop: one local documentation commit and one external full-index, binary-safe review patch, then independent review.
- Exact next return point: **Task 4.0a Phase 2 — read-only staff roster**; not started here.

This is the owner's documentation-only acceptance checkpoint. It records the
completed deployment from verified sanitized evidence; it does not rerun or
authorize database operations. [TASKS.md](../../TASKS.md) owns current status and
[DECISIONS.md](../DECISIONS.md) owns policy. D1–D51 are unchanged; no new decision
is created. One agent and existing local tools suffice for this bounded work;
no implementation, database, Docker, Access, browser, build or Phase 2 work was
performed in this documentation checkpoint.

## 1. Implementation and disposable proof

The [6 September implementation report](2026-09-06-task-4-0a-phase-1-database-boundary.md)
preserves original commit `2d25f937b4a70b2d1d478a2ba17818079185fc7f` and the
separate correction `427ad843abb3c3444ccfb34183e32b2a5828de74`. D44–D49 define
the database contract. Disposable PostgreSQL 17.11 proof passed historical
checks 93 before / 107 after upgrade and canonical replay 89/89, with 22
mutation groups per profile, rollback, concurrency, authentication, all 448
permission decisions, account and audit/principal regressions. These are prior
test results, not tests performed by this documentation checkpoint. D50 browser
and staff service/UI evidence remain later work.

## 2. Predeployment recovery readiness

Logical package `2026-09-07-task-4-0a-phase1-predeploy-v2` records classification
**READY FOR INDEPENDENT REVIEW**. Its retained recovery package includes a
database archive and 54 verified logos. An isolated archive restore matched
all 97 source table fingerprints, with source/restored inventory SHA-256
`d0f6314f73fded3a0b1de352b4d704f91406ab857b2406df6b6448fafcdc24e0`.
Database access permissions and runtime-role grants matched; restored checks
passed 93 before / 107 after isolated migration 61. Recovery readiness alone
did not deploy the project database.

This checkpoint verified archive size/hash only, without opening its contents.
Restoration still requires controlled provisioning of fresh PostgreSQL role
credentials, which the recovery package intentionally excludes.

## 3. Real migration-61 deployment

Logical package `2026-09-07-task-4-0a-phase1-migration61-deployment-v1` records
separate direct owner authorization and a passing final write gate.
`npm run db:migrate:deploy` was invoked **exactly once**, from
`2026-09-07T13:09:34.5846106Z` to `2026-09-07T13:09:43.9607040Z`, with exit 0.
Migration `20260906180000_staff_roster_database_boundary` completed with one
ledger entry and one applied step. Project PostgreSQL 17.11 now has **61
applied, zero pending, zero unfinished**, retaining the one previously approved
historical rollback; migration 61 itself was not rolled back.

The completed result is `deployment-result.json`, identified by
`final-evidence-manifest.json`. The earlier `result.json` and
`evidence-manifest.json` describe a stopped attempt and remain historical
evidence; they must not be mistaken for the completed result. Prior approval
rejections started no migration process; direct owner authorization resolved
them before the one successful invocation.

## 4. Post-deployment verification and preserved state

The completed deployment evidence records:

| Verification | Exact recorded result |
| --- | --- |
| `npm run db:verify` | Exit 0; 15/15 PASS |
| `npm run db:check -- --profile=historical-full-state-upgrade` | Exit 0; 107/107, including all 14 staff-boundary invariants |
| Prior tables | All 97 original projections exact; 92 whole tables unchanged |
| Five tables with approved additions only | `people`: four columns; `person_name_alias`: two columns; `lookup_team`: one column; `audit_event_fields`: seven classifications; `_prisma_migrations`: one migration-61 entry |
| Current physical tables | 103 = 97 prior tables + six new boundary tables |
| Original roster | 137 people, 350 aliases and two teams preserved; 66 internal staff comprise 23 active and 43 inactive; 71 external people retained |
| Accounts, business/source data and migration history | Original values, identities and historical migration rows preserved |
| Complete prior audit boundary | 824 events, maximum ID 824; digest `e49706d35eeae3dcb15bc08f1da8196528924d40495c7e092864ad71393cbf29` |
| Staff-change ledger | Zero rows |
| Logos | All 54 files, 1,541,428 bytes; every hash matches the retained manifest |
| Deployment Git and project container | Unchanged; Git remained clean at the starting commit, and container identity, image, start time, storage and network matched |
| Access and later work | Untouched; no Access inspection/DAO operation, final cutover or Phase 2 work |

The deployment did not rerun canonical replay, disposable mutation/concurrency
suites, `npm run check` or the production build; it retained their accepted
predeployment evidence. Its 107 permanent checks verified the installed guards.
This documentation checkpoint reran only the static checks listed below.

### Evidence identities verified for this acceptance

Package abbreviations: **P** is the predeployment package named in section 2;
**D** is the deployment package named in section 3. References identify external
evidence by logical package and filename, without copying operational contents.

| Package / file | Bytes | SHA-256 |
| --- | ---: | --- |
| P / `package-manifest.csv` | 8,671 | `b9135b08589b317fccff90cdb6482369808b865ec315830ca40fbb91f8b7b778` |
| P / `database/litigation-migration60.dump` | 15,830,404 | `56ffff5b15aaf5f54cf3854bb18cf70fe4ad11b09dad9c17a75fdef80acf4520` |
| P / `evidence/audit-result.json` | 4,023 | `35b8ab97f250a4e7c9d083cc62a446e910de32ca3be879064438c0e47087f885` |
| D / `deployment-result.json` | 15,624 | `049108629acd7e731f94bf72b5af2ea1413cdba38dfc4ace8e6e32a6f40591bb` |
| D / `deployment.json` | 808 | `f9a7dcecbb9592b5c2dbd6c4ea0570517cc00d387ea809d54dca62229ec6abdb` |
| D / `final-write-gate.json` | 4,171 | `6ad8ba553a342687f7f4271188286f24d8125cf7a998f5cfc19edbf50fa70784` |
| D / `final-evidence-manifest.json` | 1,110 | `af09dfa6b59ceb4ed391d763cf5ec4dbdd4bda7f643c2f549583fac7efb2f02a` |

Migration SQL identities remain unchanged:

- Migration 60: `7921c9b168549928185bfd0b915ccc725ba363787158990c614420e0e3bbbee5`.
- Migration 61: `87e04320badc5bc71de1c30eae02c72f82ae0e59f2088b42cb0806f6b25c8904`.

## 5. Documentation scope, checks and remaining staff work

Only these authorized Markdown files required synchronization:

- `HANDOFF.md`
- `README.md`
- `TASKS.md`
- `docs/DATA-MODEL.md`
- `docs/DATABASE.md`
- `docs/MIGRATION.md`
- `docs/testing/task-4-0a-phase1-invariants.md`
- `docs/task-reports/2026-09-06-task-4-0a-phase-1-database-boundary.md`
- `docs/task-reports/2026-09-07-task-4-0a-phase-1-migration-61-deployment.md`

Current-state statements now distinguish deployment from earlier disposable
proof. Dated test outcomes retain their original meaning. Documents outside
the owner's allowlist, including the decision file and original reviews, remain
untouched. The earlier pending-migration paragraph in `docs/PRD.md` also remains
unchanged because that file is outside the allowlist; use `TASKS.md` and this
report for the accepted checkpoint. This is not a repository-wide status rewrite.

| Documentation/static check | Result |
| --- | --- |
| `git fetch origin` and local Git preflight | Corrected authorized retry exited 0; clean `main`, HEAD = origin/main = starting commit, ahead/behind 0/0, no operation or lock |
| `Get-FileHash` and sanitized JSON consistency assertions | All seven required external evidence identities and both migration hashes matched; all six final-manifest members matched size/hash; deployment, ledger, preservation and recovery results agree |
| `node node_modules/prettier/bin/prettier.cjs --check` with the nine files above | Exit 0 using repository configuration; all nine Markdown files are intentionally excluded by `.prettierignore`. Separate in-memory Prettier parsing accepted all nine without reformatting existing Arabic text/tables |
| Repository-relative Markdown link validation | 86 links resolve, including both heading anchors; no inbound link targets the renamed headings |
| `git diff --check` | Passed; staged scope and whitespace are checked again before commit |
| `npm run check` | Exit 0; all nine checks passed: TypeScript, ESLint, formatting, RTL, authorization, audit, user-management, Git-ignore/storage and encoding. Encoding checked 347 files; the final staged Markdown is checked again before commit |
| Changed-file and added-text scans | Exactly the nine authorized Markdown files; no added secret, credential, connection string, absolute workstation path, raw payload or binary. No code, migration, schema, dependency, lockfile, configuration, governance or original-review change |
| Decision, task and migration checks | D1–D51 byte-identical; both migration hashes unchanged; only Phase 1 checked within Task 4.0a; overall Task 4.0a, Phases 2–4 and Task 4.1 remain unchecked |

The initial fetch could not write Git metadata and did not complete; the owner
explicitly authorized its one corrected retry. A sandboxed static validation
attempt and the first `npm run check` could not spawn local Git. Read-only
validation passed with the required sandbox permission. A subsequent check
session lost its final tool result, so it was not counted as a pass; the final
run retains its output and exit status outside the repository. No safety check
was disabled and the Windows launch token remained non-elevated.

The exported patch receipt records the final commit/parent, exact file scope,
byte size, SHA-256, full-index verification and the non-mutating
`git apply --reverse --check` result after commit. No patch is applied to the
working tree.

Phase 1 remains checked and is operationally complete. Overall Task 4.0a,
Phases 2–4 and Task 4.1 remain unchecked. The remaining work is Phase 2's
read-only roster/detail, Phase 3's Administrator mutations and Phase 4's browser
interaction/accessibility and final evidence. The exact next return point is
**Task 4.0a Phase 2 — read-only staff roster**. No later phase starts as part of
this acceptance; stop for independent review after the local commit and patch.

## 6. Final Access cutover remains separate

The Litigation Department continues using Access. This migration-61 deployment
was **not final Access cutover**. D43 and D51 still require a separately
authorized freeze, fully closed Access application, independently hashed final
snapshot and validated source-identity delta reconciliation. Unchanged accepted
imports must not be duplicated; new, changed, deleted, ambiguous or conflicting
records require the approved reconciliation/quarantine process and owner
approval. D51's historical source identity and noncanonical derivative
disposition are not changed by this acceptance.
