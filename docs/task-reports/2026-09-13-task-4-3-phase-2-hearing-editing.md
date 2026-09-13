# Task 4.3 Phase 2 — hearing editing and retained attendees

13 September 2026. Implementation pending independent review and owner acceptance.
Overall Task 4.3 remains unchecked. No hearing lifecycle or Task 4.4 work is included.

## Authority and scope

Khaled Helmy accepted Phase 1 at `9b09f0d849aac5ed6afbcbc40879cfbb6da89ea1`
and explicitly authorized the attached complete Phase 2 plus local-activation prompt.
The independent review supplies evidence; his direct message and adopted prompt supply
authority. The exact 11,166-byte Phase 1 review is preserved, SHA-256
`1c6df4e8e04d727b87c983ef05a3c8b3a5492844e0b6ed95410296d56e7db5ec`.
Phase 1 report/matrix acceptance addenda and D60 preserve their earlier text as prefixes.

Administrator and Litigation Assistant can create/edit the eight approved hearing fields
and current attendees. Lawyer and Paralegal retain viewing only. New hearings may be
unassigned or select an unarchived matter; the existing parent association stays fixed.
An archived matter blocks editing; its client's archive alone does not. The exact twelve
D41 hearings keep court, circuit and notes read-only. Report, previous decision, next
attendance raw text, destination, short decision and client notification remain outside
the editor and unchanged; native creation leaves those fields and imported lineage NULL.

## Database and application changes

Migration 66 (`20260913120000_hearing_editing_boundary`) adds an aggregate version,
retired/current-order attendee state, immutable original projections, continuous aggregate
history and actor-owned exact submission receipts. Existing migrations 1–65 are unchanged.
Runtime writes must use the two narrow, inventoried hearing gateways. The committing
function checks current account/session, parent, lookups and selected staff under locks.
Business rows, version, audit, history and receipt commit or roll back together.

Imported attendee IDs, raw provenance and ordinals are permanent. Kept members retain
their order; new/restored selections append, reusing the lowest eligible retired ID.
Historical duplicates remain separate memberships. An unchanged selection, including a
round trip, creates no audit/history/receipt/version/identity change. An exact successful
retry returns its owned result; altered payloads or another owner cannot reuse the token.

Text accepts up to 10,000 Unicode code points, preserving unchanged whitespace/newlines.
The fresh source maxima were decision 961, outcome 4, circuit 64 and notes 170. Dates are
nullable calendar dates; no inferred next-date ordering rule is imposed. Requests are
bounded to 200 KB and 500 attendees. Existing inactive attendees remain visible and may
be retained; adding/re-adding requires active internal staff, independently of login rights.

The historical reconciliation queries use indexed typed original-state views. Current
reads filter retired memberships and use current order with imported ordinal fallback.
The exact migration-65 profile retains 125 invariants; migration 66 adds four checks.
Historical fixture dispatch retains checkpoints 61–65, including explicit 65 stops for
the hearing read-only and matter lifecycle wrappers.

## Verification and evidence

The initial acceptance matrix was saved outside Git before edits/tests. Separate owned
PostgreSQL 17.11 clusters, volumes, networks and loopback ports used the pinned installed
image. Full source copies were compared before test-account initialization. Each owned
fixture and browser mirror was removed after its run; the actual source was read-only.

Fresh full-volume proof covers the exact named migration delta, every original table
projection and full sequence state, meaningful late migration rollback, 129 initial/final
invariants, permission checks, native and unassigned creation/editing, nullable fields,
retirement/reselection, original duplicate/inactive memberships, exact no-ops/retries,
forged inputs, direct runtime-write denial and late audit-failure rollback.
All twelve D41 records reject changed/cleared court, circuit and notes through the service,
direct gateway and row guard without partial state changes. Their allowed edits still pass
the permanent D39/D40/D41 checks.

Observed lock overlaps cover account/session revocation, staff deactivation, matter archive
and competing hearing edits. Active staff without login accounts are accepted. After the
three native fixture creations, all four roles traversed 13,385 IDs in 2,144 pages against
an independent ordered SQL oracle. Imported rows remain a separate 13,382-row population.

The final browser build (`browser10`) passed 17 axe states with zero violations,
validation/value/focus recovery, stale reload, exact lost-response retry, inactive/D41
controls, bundled fonts, 320px reflow and genuine 200% zoom. Its final 129 invariants and
111 canonical replay checks passed. The supplemental session-refusal proof covers
unauthenticated/expired service calls and null/expired direct gateways with exact rollback.
Executable-source hashes remained exact through the final browser/canonical run.
Operational completion is recorded in the separate activation receipt. These distinguish isolated
Phase 2 proof from actual accepted-app activation. Production timing is not inferred from
fixture plans. Screen-reader speech is excluded, without a pending follow-up.

Meaningful failed attempts remain in the evidence: late-failure SQL dollar-quote escaping;
an omitted checkpoint-66 validator entry; a slow opaque original-state view replaced by
indexed typed projections (only the owned fixture query was cancelled); closing a fixture
Prisma connection before permission-database cloning; fixture account changes respecting
the existing session-version rule; formatting/import corrections; and a relative browser
font-request URL corrected to an absolute local URL. No guard was overridden.

The earlier browser mirror omitted `public/fonts`. Its copy list now includes those exact
Git assets. The accepted artifact also received its five missing exact accepted font files
and fifteen accepted SQL resources needed for frozen operational checks. No accepted app
source, credential or migration was changed to repair packaging. Earlier packages remain
unchanged; earlier measurements are reused only for unchanged behavior.

## Separate accepted-app activation

Activation passed separately from Phase 2 testing. The actual `litigation-db` cluster
`7676117521894273062` at localhost:5433 now has 65 applied migrations, one historical
rollback and zero unfinished. Only accepted migrations 64/65 were applied, from frozen
commit `9b09f0d849aac5ed6afbcbc40879cfbb6da89ea1`; 125 invariants and 15 setup checks passed.
Migration 66 and Phase 2 application code remain unactivated pending independent review.

The fresh protected recovery package is:

`D:\Projects\LitigationData\DB-Backup\migration63\pre-accepted migration 65-activation-2026-09-13T11-36-02-911Z-8791bd83-36d5-413e-a801-89ed2f850e43`

Its custom-format dump is 16,059,238 bytes, SHA-256
`24048b0a0b22a0c3183dca39b07de64331f19f3363b4583c9fabddbf831f6ffe`; the separate manifest identifies every dump/logo member.
All 54 logos were copied and verified. An owned independent cluster restored that exact
backup, compared source/catalog/ACL/ledger/logical sequences, passed the migration-63
profile, rehearsed only 64/65 and passed the accepted 65 profile. Forty-five sequence
`log_cnt` resets were observed only in the logical restore; actual complete sequences
remained exact. SHARE locks excluded table writers through backup/rehearsal. On the
freshly revalidated actual deployment, locks were released immediately before accepted
DDL after verifying no competing sessions; they were not held through DDL.

The accepted app remains running at `http://127.0.0.1:3000`, PID 62096, build
`x-hg6DAZzwU8wHDA3LE9N`, from `D:\Projects\LitigationData\accepted-task43-phase1-9b09f0d-20260913`.
Its 281 accepted input files and 324 production build files were verified against their
recorded identities; Phase 2 source never entered this artifact. The Arabic/RTL login,
local fonts, loopback-only listener and unauthenticated client/matter/hearing/logo guards
passed. No usable owner-authenticated session was available, so actual authenticated
views are unobserved. The task probe submitted no login and used no owner session.

A consistent forced-read-only post-start snapshot accounts for seven genuine
system-authentication audit records: six failed logins and one failed-attempt account
update, with its timestamp/actor attribution and one staff serialization-counter advance.
These are preserved, not removed or attributed to the task probe. Earlier audit rows,
business tables, complete sequences, catalog/grants, credentials and logos remain exact.
Account credential/configuration fields were compared to a fresh owned restore of the
protected backup in memory; no account fingerprints or secret values were exported.

The external evidence directory contains `activation-success.json`, `activation-report.md`,
`accepted-process-final.json` and the safe task-specific helpers. Start, when stopped:
`node "C:\Users\Khaled\.codex\visualizations\2026\09\13\01a099cc-a34f-7271-ac15-39c9e1678164\task43-phase2\start-accepted.cjs"`.
Stop only this positively identified app:
`pwsh -NoProfile -File "C:\Users\Khaled\.codex\visualizations\2026\09\13\01a099cc-a34f-7271-ac15-39c9e1678164\task43-phase2\stop-accepted.ps1"`.
The stop helper was not executed. The accepted artifact/dependencies remain; disposable
Phase 2 and rehearsal clusters, volumes, networks, mirrors and listeners were removed.

Operational recovery evidence retains the PowerShell ACL-module failure, Windows dump
listing pipe failure, extra fixture CONNECT-grant mismatch and unordered Docker mount
comparison. All were resolved before actual deployment without source repair or overrides.
A process-inspection attempt denied by Windows was marked invalid and replaced with a
successful scoped native check. Automatic review rejected an initial full post-start
capture export; the replacement emits only allowlisted summaries and compares protected
account fields in memory. Initial overly broad post-start equality checks were corrected
to verify the observed authentication counters and attribution explicitly.

D59/C1 remains **Owner-accepted risk — unchanged; not technically remediated**.
Existing passwords, account credentials, ignored environments, Compose configuration,
governance files, prior evidence/backups and the external logo root are preserved. The new
backup remains local-only by the owner's decision. No push, Ubuntu deployment, production
cutover, credential rotation or persistent autostart is included.

The delivery receipt supplies the exact one-commit identity, parent, subject, per-file/total
statistics, clean branch state, full-index patch and independently reopened ZIP manifest.
Raw dumps, credential values/hashes, environments and cookies are excluded from review.
