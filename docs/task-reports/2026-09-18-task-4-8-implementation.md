# Task 4.8 — Billing — read-only list of invoices and payments

Implementation began 18 September 2026 and continued in the same Local Windows
task on 20 September. This is a candidate report, **not acceptance**. Task 4.8
and every other checkbox remain unchanged. Independent implementation review is
the next prerequisite; no owner migration, activation, closure or publication is
authorized by this report.

## Configuration, authority and checkpoints

- Environment: Local Windows, `D:\Projects\litigation-system`.
- Subagents: prohibited; none used. No separate task was created.
- Recommended configuration: GPT-5.6 Sol / High. The selector was not observed
  or changed, so no actual model/effort claim is made.
- Expected usage: moderate to high. Existing read-only layout, isolation,
  permission, browser and database-check infrastructure was reused. No new
  subscription, purchase, global installation or unrelated service was used.
- Starting commit: `c7de44a03710022ac7c47f4dbc4b093838afc31b`.
- Starting tree: `269dc98daffe19463cf347e59c068526007505c1`.
- Final commit/tree: recorded after the single commit in the external
  `git/checkpoint.json`, raw Git objects and final receipt. A committed report
  cannot contain its own future commit hash without creating a circular claim.
- Remote: the authorized narrow fetch observed published main at c7de44a on
  18 September; a fresh narrow ref read on 20 September confirmed it unchanged.
  The candidate is local only; no push is performed.
- Authority: Khaled's adopted Task 4.8 prompt, D3/D4/D14/D28/D67, the retained
  eleven-label approval and independent Task 4.7a closure review. Original
  prompt, input verification and approvals are included in the review package.

The handoff ZIP was verified before extraction against its separate unchanged
manifest: whole length/hash, all 80 safe unique regular member paths, CRCs,
compressed/uncompressed lengths and hashes. The inspected supplied verifier
also passed. Sixty-one supplied source bindings matched the accepted base;
the initial checkout was clean with 770 tracked paths and 86 checkbox lines.

## Approved behavior and exclusions

Five permission-guarded pages expose invoice/payment registers and details.
Lists have stable descending-ID pages of 25, shareable validated filters,
normalized search, explicit missing values and matching controls/URL state.
Search has separate exact internal/legacy identity branches, including Arabic
digits, and escaped literal descriptive search. Dates are validated calendar
dates, not restricted to the historical source years. Empty-string currency is
distinct from NULL and from the filter's reserved values.

Invoices reach clients through fee letters, never an invented invoice client
column or matter link. Payment credit and debit remain separate, under the
original `Credit` and `Debit` labels with an Arabic explanation. Money is
formatted as decimal strings; shares are exact percentages, including the
recorded 7.5% co-lead share on invoice 21819. No floating-point financial
calculation, balance, mixed-currency total, receipt posting or VAT inference is
introduced. Stored historical USD-equivalent amounts are not displayed.

Archived parents and inactive allocation people remain visible. Allocation
pages are bounded to 25. Invoice details show at most 25 linked payments with
the complete count and a link to their fully paginated register. Client and
fee-letter details gain read-only billing links; the dashboard reaches billing.
No broad redesign or change to their existing write workflows is included.

VAT, report, receipt fields, excluded Access Pay-Date, legacy payloads and
account/audit/security metadata are not selected into public billing DTOs.
There are no billing actions, write routes, create/edit/archive/restore controls,
exports, financial policy changes, Task 4.9 or Stage 5 work.

All four roles use `billing:view`. Each service transaction independently
rechecks the current account/person/role, enabled/login eligibility, password
policy, session version and expiry under read-only repeatable-read isolation.
The inherited database principal is **not an SQL-wide read-only role**: billing
SELECT/INSERT/UPDATE and sequence SELECT/USAGE grants predate this task and are
unchanged. Imported history remains immutable with complete/null-safe
provenance guards. Native no-write behavior is the application boundary; the
candidate neither supplies a native write gateway nor broadens database grants.

## Candidate migration and permanent checks

Migration `20260918100000_billing_arabic_labels` is candidate 72, not the actual
owner migration. It refuses an unexpected migration-71 prestate or code set,
locks the three lookup tables and applies D67's exact eleven labels in one
transaction with the existing migration audit attribution.

The allowlisted delta is precisely:

- Eleven existing lookup rows: `label_ar` and `updated_at`; `updated_by` is
  allowed for attribution but did not change in the observed upgrade.
- Eleven new `audit_events`, attributed to `system_migration` with event context
  `controlled-maintenance:task-4-8-d67-labels`.
- `_migration.matter_lifecycle_audit_counter.last_value` increases by eleven.
- One migration-ledger row. No sequence, catalog/grant, financial/source row,
  original lookup identity/code/order/active flag or other table changes.

The intentionally late failure rolls back the complete transaction, including
the transactional audit counter; all 48 full sequence vectors remain exact.
The independent package verifier recomputes this delta from all-table and
all-column digests plus the concrete lookup rows/new audit events.

DB-094 adds the exact eleven-label map to the permanent historical and canonical
checks. The original seed's NULL-label assertion, migrations 1–71, prior frozen
baselines and existing enforcement remain untouched. Existing checkpoint
inventories are extended only for the exact named migration 72.

## Fresh verification and reused evidence

The final full-data run is `isolated-11`, 20 September 2026,
06:34:46–06:45:15 UTC, with exit zero and normal owned-resource cleanup. Its
production BUILD_ID is `G6lpfpqwGYXgU3Niw5JgC`; its source-manifest SHA-256 is
`53094e72dcadccd24db0b92db67294b3b6ee486be3d32cb67e9f171095178500`.
`canonical-03` is the final independent clean replay. `check-05` ran the full
project gates against the final executable source, 06:35:48–06:39:39 UTC, exit
zero. Subsequent changes are only this report/matrix and external evidence
helpers; affected documentation/encoding/ignore gates are recorded separately.
The external command records retain exact arguments, timestamps, exits and
original logs, distinguishing final successes from failed attempts.

Fresh observed milestones include the accepted-parent 147-check baseline,
candidate 148-check historical invariants, 130-check clean canonical replay,
448-decision permission matrix, all 543 invoices / 597 payments / 47 allocations
for four roles (184 ordered list pages and 4,560 invoice/payment details), and
1,065 independently derived filter result sets. The separate `security-01`
window passed the 15 database setup checks and twenty deliberately denied
operations with complete before/after equality. The offline
review verifier separately recomputes the joins and filter sets from base rows;
it does not trust a stored PASS flag or invoke production query builders.

The final browser records contain 53 axe/target/reflow checks with zero reported
violations, all eleven approved labels for each role, native Clear/history and
ordered-result comparisons, keyboard focus and allocation scrolling, mobile
390-pixel layouts and genuine 200% browser zoom. Of 711 recorded HTML/RSC
responses, 298 bodies were inspected with no excluded-field matches; 413
background/aborted bodies were unavailable and are explicitly marked. This is
not a claim that every background response was inspected. Source projection
allowlists and complete DTO-oracle checks provide separate boundary evidence.
Selected screenshots and the limited visual-inspection record are supplied.

The separate synthetic edge phase has 563 invoices, 644 payments and 73
allocations: twenty added invoice identities, forty-seven added payments and
twenty-six added allocations, all confined to the disposable copy. Synthetic
legacy-ID fixtures are explicitly marked TEST ONLY and obey the full provenance
shape. They are not owner/source population counts. Fixture account changes,
parent archival and setup writes occur outside the measured read-only windows.
The dedicated twenty-fault comparison uses explicit fixture IDs so failed
inserts do not consume nontransactional default sequence values.

The shared browser helper's historical console label is “hearing browser
interactions”; the executed callback and its bindings are the billing suite,
not a claim of fresh hearing workflow tests.

Only the unchanged Tasks 4.6–4.7 backend/race proof is reused: the actual
17 September `historical-final-attempt3` records, with 17 exact source bindings.
The older similarly named September 16 directory did not match the final test
source and was not adopted as the final reused proof. Current client/fee-letter
navigation and all billing behavior require fresh tests. Prior invariant logs
are historical context, not the candidate's new invariant result.

Material failed attempts remain supplied: deliberate rollback SQL interpolation,
the old checkpoint's initial refusal of migration 72, a wrong-role test using the
same role, fixture session-version/reactivation policy violations, an invalid
negative-money fixture, and an incomplete synthetic legacy-provenance fixture.
These were harness/checkpoint corrections, never reasons to weaken database
guards. Early formatting/static-count and sandbox/descriptor refusals are also
retained. Runs 01–05 lack complete preserved original executed helper bodies;
they are diagnostic history, not final source-bound success. From run 06 onward
the original executed helpers are captured before execution. Browser attempt 08
also sampled Forward's restored tree before React committed it; its retained
failure state contains the correct final rows. The test now waits for the entire
URL/control/ordered-result state, not only a network-idle event.

Browser attempt 09 found genuinely undersized plain links. Billing links now
meet the 44-by-44-pixel target requirement, including the missing-record return
link; the new fee-letter billing link uses the existing target class. Visual
inspection also led to readable minimum-width allocation columns inside a
bounded, focusable horizontal-scroll region with an Arabic scrolling hint.
Attempt 10 completed all four roles and unchanged read windows but stalled on a
background response body. Only its exact identified disposable Chromium process
was closed to release normal cleanup; that intervention is recorded, and the
run is not presented as the final complete browser proof. Final payload reads
are bounded, unavailable/background bodies are counted explicitly, and the
context is closed gracefully before the completed-response inspection finishes.

## Owner and protected-state preservation

The actual owner stays at migration 71. The accepted artifact is
`3OBUE7ppFmV5DINhNdi0s`; it was already stopped at the first observation and is
not started by this task. No owner login, password change, business write,
migration, process replacement or activation is performed.

The full database baseline covers all 138 tables in public/staging/quarantine/
_migration, every column's canonical digest and complete row digests, 48 complete
sequence definition/state vectors, ledger, private/audit tables, account and
credential state, named catalog/grant identities and actual namespace ACLs.
Sequence ACL defaults use `acldefault('s', owner)` and raw NULL ACLs remain
distinct from explicit representations. Private bodies are not supplied.

Restoring the owner copy resets the WAL-reservation `log_cnt` field to zero on
45 sequences. Their definitions, `last_value` and `is_called` are unchanged.
This is a restore-specific difference, explicitly retained in the final index;
it is not dropped from migration, read-window or owner-preservation comparisons.

The 20 September resumption matched every captured database field from
18 September. The same owner container had a newer start time,
`2026-09-20T05:32:37.8704803Z`, observed before resumed testing; its identity,
image, endpoint and mounts were unchanged. This is an external change during
the inactive gap, not continuous-runtime preservation or an agent restart.
The final package preserves both observations rather than overwriting either.

Protected file coverage is the entire accepted artifact, all 54 logos, retained
recovery packages, previous external/local evidence, protected configuration and
governance, root ACLs and junction targets. Two genuinely mutable runtime logs
are separated from static-file equality. Database/file digest collection is
receipt-limited because secret/private bodies are excluded from the package.

The final owner database capture at 20 September 06:45:53 UTC matches the
18 September baseline across all captured state. File collection ended at
06:51:37 UTC: all 36,401 protected static files, 96 root/config ACL observations,
junction identities and the accepted BUILD_ID are exact; both separately
classified runtime logs also happened to be unchanged. The final runtime
observation at 06:51:40 UTC matches the resumption: accepted app stopped, same
database container running, with only the already disclosed inactive-gap start
time difference from 18 September. `commands/preservation-final.*` retains the
fresh comparison, and the archive verifier independently recomputes the pairs.

All migrations, fixture account changes, faults and browser logins run on
positively identified task-owned PostgreSQL copies. Browser builds, ports,
profiles, generated output and copied logos are isolated from the owner
artifact. Cleanup is restricted to each exact identified task resource.
The final browser listener is stopped and its port reusable; all 25 observed
dependency metadata/lock files are unchanged. The exact task-owned accepted
parent source mirror was removed after unlinking its dependency junction without
traversing it. Original Git objects, dependencies and earlier evidence remain.

## Changed files

```text
README.md
docs/DATA-MODEL.md
docs/DATABASE.md
docs/MIGRATION.md
docs/PRD.md
docs/task-reports/2026-09-18-task-4-8-implementation.md
docs/testing/task-4-8-acceptance-matrix.md
package.json
prisma/schema.prisma
prisma/migrations/20260918100000_billing_arabic_labels/migration.sql
scripts/check-billing-read-only.ts
scripts/check-db.ts
scripts/lib/audit-source-inventory.ts
scripts/lib/billing-labels.ts
scripts/lib/fixture-migration-checkpoint.ts
scripts/lib/permanent-invariant-inventory.ts
scripts/lib/staff-roster-checkpoint.ts
scripts/lib/staff-roster-structure.ts
scripts/test-billing-browser.mjs
scripts/test-billing-canonical.ts
scripts/test-billing-read-only.mjs
src/app/billing/billing-detail.tsx
src/app/billing/billing-fields.tsx
src/app/billing/billing-list.tsx
src/app/billing/billing.module.css
src/app/billing/error.tsx
src/app/billing/invoices/[id]/page.tsx
src/app/billing/invoices/page.tsx
src/app/billing/loading.tsx
src/app/billing/not-found.tsx
src/app/billing/page.tsx
src/app/billing/payments/[id]/page.tsx
src/app/billing/payments/page.tsx
src/app/clients/[id]/page.tsx
src/app/fee-letters/[id]/page.tsx
src/app/page.tsx
src/lib/auth/route-inventory.ts
src/lib/billing-format.ts
src/lib/billing-query.ts
src/lib/billing.ts
src/strings.ts
```

## Limits and exact return point

No screen-reader speech test or general accessibility certification is claimed.
No no-JavaScript browser proof is claimed: the native GET forms use the existing
hydrated Clear/history behavior. Negative-decimal formatting is tested without
relaxing the database's existing nonnegative money constraints. Arbitrary
financial calculations and newly interpreted Arabic financial terms remain
excluded; the exact eleven D67 labels are implemented unchanged.

The external review envelope contains exact Git bytes and full source identities,
patch pre/postimages, test helpers and results, oracles, source/build maps,
screenshots, preservation pairs and failed-attempt records. Its standalone
verifier reopens the archives and reconstructs the patch both ways. Two unchanged
secret-bearing D59 bodies are omitted from shared source but bound by Git object
identity; complete local reconstruction includes them without publication.
The original inner verification result and final receipt are sealed by a small
outer envelope with its separate manifest; the final outer verification result
is supplied separately to avoid circular hashes.

Stop for independent Task 4.8 implementation review. Any owner migration 72,
activation, acceptance checkbox change or push requires the later reviewed
operational mandate. No subsequent task is started.
