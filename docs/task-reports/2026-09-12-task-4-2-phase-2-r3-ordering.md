# Task 4.2 Phase 2 — R3 nullable party ordering follow-up

12 September 2026. Parent: `4aee985dabc01db7142fe08bdc2b4fa9d83ba049`.
The owner's ordinary chat mandate authorizes this bounded follow-up. The
[independent correction review](../reviews/2026-09-12-task-4-2-phase-2-correction-independent-review.md)
is preserved evidence: R1/R2 are closed; R3 required the nullable append case.
Phase 1 acceptance is unchanged. Phase 2 remains unaccepted; independent R3
follow-up review is next.

An explicit side change or Add party previously displayed the appended party
after an unnumbered party, but saved it with a numbered position. The existing
NULLS LAST read then placed it before the unnumbered party. The editor now numbers
the operated destination group in displayed order. Other-group positions, IDs,
names, gender, capacity identities and legal sides remain intact. Opening a form,
an unchanged save and an unrelated field edit do not normalize NULL positions.
Selecting the current side remains a no-op. Existing within-side movement and
R1 selector/retry behavior are unchanged.

Only `src/app/matters/matter-editor.tsx` changes application behavior. The focused
browser helper and one opt-in runner branch supply regression proof. No schema,
gateway, migration, decision, string, style or governance file changes. Candidate
64 remains SHA-256
`afd0ebc8c9c98e4de2eaa594668eb8dd7e7c216d8b1fdb093a44ebb50ff99034`.

## Fresh proof

Evidence is outside Git at
`C:\Users\Khaled\.codex\visualizations\2026\09\12\01a094ba-eb44-7451-8524-b7749d95e213\task42-phase2-r3-ordering`.
The initial matrix and source identities preceded application edits and fixture
execution. Each run used a distinct owned PostgreSQL 17.11 cluster, localhost
port, volume and network, a forced-read-only full-volume source copy, and its own
production-mode application mirror. All synthetic native matters entered through
the accepted gateway; no owner record was changed to establish nullable positions.

- `reproduction-1`: the unchanged parent editor reproduced both reversals for both
  editing roles. Four failed-before assertions retain displayed and saved IDs,
  rows and failure messages. Production build and final 125 historical checks
  passed. This expected-defect run is distinct from the correction proof.
- `fixed-1`: 24 exact ordering cases: mixed positive/NULL, all-NULL, gapped numbered
  and empty destinations, side changes in both directions and Add party, for
  Administrator and Litigation Assistant. DOM order, saved rows, detail IDs and
  reloaded form order agree. Existing capacity identities and the other group
  remain exact. Within-side keyboard movement cannot cross legal sides.
- Eight complete no-ops compare every table digest and complete sequence/catalog
  state: unchanged-null, same-side selection, lawyer A/B/A and capacity A/B/A for
  both roles. Two scalar edits preserve all party/capacity rows. Validation
  failure retains order and draft, leaves rows unchanged and focuses feedback;
  recovery saves the intended order.
- The fixed browser run has 44 evidence records, six zero-violation accessibility
  scans and six screenshots. It checks keyboard focus, accessible labels/tree,
  RTL, 320px reflow and actual Chrome 200% zoom (1440 to 720 CSS pixels, doubled
  device-pixel ratio, no CSS/pinch substitute). Three representative desktop,
  narrow and zoom screenshots were visually inspected; no blocking issue found.
- Both runs retain the runner's necessary 15 setup checks, restore equality,
  candidate transaction rollback, exact catalog delta and final 125 historical
  invariants. No canonical, broad permission or concurrency rerun was added.

Command: `node --import tsx scripts/test-matter-mutations.ts --nullable-order --editor-browser-only`;
the failed-before run adds `--reproduce`. External evidence directory and installed
Playwright/Chromium paths are supplied in the process environment; `JITI_FS_CACHE=false`.
Do not run the expected-defect mode on the corrected editor and call it passing.

`executed-before/` and `executed-fixed/` retain the exact editor, runner and assertion
bytes matching each build inventory. `final-source-evidence.json` verifies all 181
critical final product/build/assertion dependencies and 296 unchanged dependencies
used for reuse. No application or assertion edit followed the fixed browser run.
Later status/report edits are documentation only and are named in that receipt.

## Reused evidence and preservation

`reuse-map.json` verifies prior artifact hashes and unchanged implementation
dependencies. It reuses R1 service/gateway and exact retry proof, R2's six-case
service/gateway/audited-row restriction proof, canonical migration replay and
unchanged permission, concurrency, audit, read/client/contact/logo/staff/report
evidence. The necessary historical fixture setup above ran fresh; old counts are
not represented as new executions. The previous packages are not repackaged wholesale.

The fresh baseline matches the preceding delivery's database, container, protected
files and owner runtime. The earlier container start/endpoint/MAC discrepancy is
retained in `prior-container-discrepancy.json`; its cause remains unknown.

All required `npm run check` gates passed. Final report/status-only formatting and
encoding checks passed after recording these outcomes. `preservation-comparison.json`
shows exact source, live, protected and runtime equality, without normalizations.
Both fixture cleanup logs and `cleanup-final.json` confirm no task containers,
volumes, networks, mirrors, listeners, caches, credentials or Git operations remain.

Preservation covers 109 tables, all 48 complete sequences including `log_cnt`,
catalogs/functions/grants/roles/audit/migration evidence, 54 logos, 3,912 protected
entries and 40,571 runtime entries with hashes, bytes, timestamps and ACLs. The
existing exclusively locked owner `runtime.log` is the sole declared exclusion.
No metadata is normalized to manufacture equality. The owner app is the same
`127.0.0.1:3000` process, PID 54172, created
`2026-09-11T18:13:25.431126+03:00`. The real database remains at migration 63.

## Delivery boundary

One local `fix: keep nullable party order stable` commit has the sole parent above.
The separate delivery receipt records its actual commit identity, exact scope,
statistics and clean main four-ahead/zero-behind state against unchanged cached
origin/main `d84aa4b916e41e15abf543fc7dd2d4155bea7acf`; no fetch was performed.
The full-index binary-safe patch is checked for reverse applicability without
applying it. The ZIP is reopened and every unique member, size, hash and manifest
entry verified. Credentials, password hashes, environment contents and dumps are
excluded. All prior reports/matrices and Phase 1 acceptance remain unchanged,
as do every TASKS/PATCHES checkbox line and all migration files.

Stop for independent R3 follow-up review. No Phase 2 acceptance, owner-app
activation, live migration, fetch, push, deployment, archive/restore, speech or later
phase. This is isolated Windows production-mode proof, not Ubuntu deployment or
full accessibility conformance evidence.
