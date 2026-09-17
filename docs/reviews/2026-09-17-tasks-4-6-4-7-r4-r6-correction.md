# Tasks 4.6–4.7 remaining R4/R6 correction addendum

Date: 17 September 2026. This is one further correction child of
`0623d7cefebc5f3da1ee947c6f28dfc03b54dab0`; it preserves candidate
`f8751a0133f2d618ff0a1bb18c6a53ebaebf2afa` and both earlier evidence sets.
Only T4647-R4 and T4647-R6 are addressed here. R1, R2, R3 and R5 remain
unchanged. R4 and R6 are **pending independent review**, not self-closed.
Tasks 4.6 and 4.7 remain unchecked.

## R4 correction

Migration 71 now has one permanent bidirectional correspondence validator for
all three gateways. It rejects a global owner without its local receipt, a
local receipt without its global owner, and either receipt without the retained
change-history row. The complete database checkpoint calls this validator on
every run; it is no longer only a one-time migration postcondition.

Matter-side reverse-reference replay is now NULL-safe and validates the entire
set/clear/replace transition. It pins array shape, matter and row identities,
unique fee identities, active-row cardinality, retained old-row retirement,
reactivation versus native creation, actor-managed audit fields, immutable
source/provenance fields, and exact preservation of every unrelated row in
both directions. The old `NOT IN(old_fee,new_fee)` gap is removed.

Before the correction, a source-bound disposable reproduction proved that the
unchanged `0623d7c` checker accepted both a global-only owner and a clear whose
retained old reverse-reference row had been removed. Two earlier reproduction
attempts are also retained: one selected the wrong clean-replay profile and one
expected the rollback-only functional suite to leave a clear transition.
Neither is represented as an application failure.

Final rollback-only fault proof restores all intended triggers before invoking
the complete permanent checker. For documents, fee letters and matter-side
references, it removes each of global owner, local receipt and change history
in turn. It also corrupts set and replace provenance and removes the retained
clear row while making current data match the corrupt history. Every fault is
rejected, rolled back, and followed by a valid-boundary assertion. Legitimate
create/edit, covered add/retire/restore, reverse set/clear/replace,
archive/restore, exact retry, authorization withdrawal and concurrent conflict
coverage remains in the same final-source historical run.

## R6 correction

The new owner baseline was captured before any disposable proof. It discovers
all non-system project schemas rather than assuming `public`: 128 tables in
four schemas, 71 ledger records (70 completed migrations plus the established
historical rolled-back record), and all 48 sequence definitions plus
`last_value`, `log_cnt` and `is_called`. The matching after capture uses the
same helper and scope. Separate protected-resource records recursively cover
the 1,939-file accepted artifact, all 54 logos, the complete Task 4.5 recovery
set, Task 4.5 evidence, both earlier Tasks 4.6–4.7 evidence sets, protected
configuration identities, supplied review packages, listener/process/build
metadata and locked-log limitations. File contents containing credentials are
not emitted.

The historical-copy runner captures migration state immediately before and
after migration 71, before fixture-account or business mutations. It proves 48
complete sequence vectors unchanged, 122 unrelated existing tables
byte-value-equivalent, exactly ten new private evidence tables, exactly six
permitted existing-table changes, unchanged business row counts, seven audit
field registrations and one ledger row. The checkpoint separately pins the
complete migration-71 functions, bodies, permissions, columns, indexes,
triggers and immutable evidence surface.

The independent raw-data oracle now uses 27 document and 27 fee-letter cases
for each of Administrator, Litigation Assistant, Lawyer and Paralegal. For
every case it derives and checks exact IDs, descending order, total, page
count, every page and the clamped last page. It includes multi-filter
intersections; Latin, Arabic-Indic and Persian digits for internal and legacy
ID branches; ID-only partial, suffixed and leading-zero controls selected to
exclude incidental text matches; Arabic normalization; literal `%` and `_`;
present/missing filters; and both relationship directions with complete
content comparison. Imported historical rows are covered by the full-volume
copy, while native creates and relationship transitions remain covered by the
functional and browser paths.

Fresh focused browser proof uses a disposable database and isolated production
build. It exercises the existing normal database-backed document and
fee-letter flows with the corrected migration. The first browser attempt
stopped before build because runtime paths were absent; the second built but
used a CommonJS module entry that exposed no named `chromium`; the third used
the same bundled Playwright installation's ESM entry and passed. All attempts
and cleanup records are retained.

## Evidence classification and limits

Fresh evidence in this correction comprises the complete owner/protected-state
window, writer/listener inventories, the pre-fix R4 reproduction, final-source
historical and canonical disposable runs, the expanded four-role oracle,
complete-checker fault matrix, focused browser proof, final project gates,
patch/package verification and cleanup records.

Reused evidence is explicitly limited to unchanged R1/R2/R3/R5 proof, the
recovered original 483-byte `verification-result.json`, the two earlier review
packages and their manifests, and accepted Task 4.5 recovery/runtime evidence.
No reused count is described as a fresh execution.

The original owner before/after pair never existed, and no preserved source
body with SHA-256
`66992ab0eff4144b4586d5321ecfd2649f6630e41dee591b8ac4733b4d186a87`
exists. Those historical gaps remain open facts and are not recreated. The
accepted owner process remains attributed to build `WvgH-6nuin9o1QPJrPst4`;
`Cl3PZ1Ejw8O-lhYlVMAJP` is the development workspace build. Locked runtime
logs are inventoried by metadata and expressly excluded from the stable file
digest; no claim is made about unreadable bytes.

## Disposition

The actual owner database remains at migration 70 and the accepted owner app,
accounts, sessions, credentials, logos, recovery material and evidence were
not changed. No owner migration was applied, no candidate was activated, no
remote was pushed, no checkbox changed, and Task 4.7a/4.8 were not begun. Stop
after the single local correction commit and return the complete package for
independent correction review.
