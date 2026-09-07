# Access-source identity discrepancy — sanitized evidence summary

**Evidence date:** 7 September 2026

**Forensic audit classification:** `INDETERMINATE`

**Decision authority:**
[D51](../DECISIONS.md#d51--access-source-derivative-and-migration-61-readiness)

This dated document summarizes evidence; it does not replace
`docs/DECISIONS.md` or set work priority.

## Why the audit occurred

The current Access file no longer matched the byte size and SHA-256 recorded
for the frozen migration source. The owner disclosed that the source had been
opened to confirm client information and to export `العملاء` to Excel, with no
intentional business-data edit or import-back. That disclosure was evidence of
activity and intent, not proof of what changed inside the binary.

| Artifact | Bytes | SHA-256 | Status |
|---|---:|---|---|
| Historical frozen source | 46,661,632 | `1a1da8d573ca92ad67efbe638f2c043d02df278e88563c31eea8ce4a4f07b4bc` | Frozen historical identity; the exact binary was not recovered during the bounded search |
| Current source and retained read-only working copy | 46,792,704 | `d25fb958ffc42d09b962d36e69de723d4595d960725540a96f01767601ec4a86` | Noncanonical post-inspection derivative under D51 |

The derivative is exactly **131,072 bytes** larger. The cause remains
unexplained. Access-internal allocation or bookkeeping is plausible but was not
proved, so the two files are never described as byte-identical. The current
source modification time was 4 September, before the owner's disclosed
7 September inspection/export, so that disclosure does not prove the cause.
The current source and retained working copy matched before and after the audit;
neither was modified by it, and all database-engine inspection used only the
read-only working copy.

## Completed comparisons

- All 20 frozen table and complex-field CSV payloads were byte-identical,
  covering 17 tables plus all three complex exports: 30,885 parent rows and
  342 complex records. This preserves every represented value, not only row
  counts.
- All 54 logo files matched byte-for-byte, totaling 1,541,428 bytes; attachment
  identity and the empty Contacts attachment export also matched.
- All 194 column definitions and all 17 relationship definitions matched
  exactly.
- Four recorded Gate 4 digests matched: the 27-table inventory/count/field
  surface, the 17 relationships, 138 named-query definitions and 138
  report-container names. Report names are inventory evidence, not proof of
  complete report designs.
- Access table arithmetic matched the recorded 35,638-row baseline: 30,847
  migration-source + 38 reference-only + 4,753 archive-only rows.
- Gate 1 passed with zero warnings for 17 tables, 30,885 parent rows, 54
  attachments and 288 multi-value entries.

No difference was found in any compared data or object surface.

| Recorded Gate 4 surface | Matching SHA-256 |
|---|---|
| 27 user-table names, counts and ordered fields | `600136f5729466f131549c3e8dc58df5b98113a791476d0e003fa81853693011` |
| 17 relationship definitions | `47812e0925dd3a1fdcdb1eb3ed7625435ca965495fb82a0c951889eb6f81179b` |
| 138 query definitions | `9f68eb37985ad5b4ec78ef1208ac7052f2389be6b558013d9e02e1310edf9e18` |
| 138 report-container names | `ca719fae9314bbb56ea4f5eaff56d9e1300bb9b4b5ab91335949cd678269e0c3` |

## Client identity spot checks

Each Access ID occurred exactly once on both sides and its displayed text
matched; the complete `العملاء` CSV was also byte-identical.

| Access ID | Exact compared identity |
|---:|---|
| 179 | `أي دي بي للكيماويات IDP for Chemicals` |
| 188 | `سيجما` / `شركة سيجما للصناعات الدوائية` / `Sigma` |
| 197 | `مجموعة الملكة` |

These are Access IDs, not PostgreSQL client IDs.

## Incomplete coverage and failed invocation

The original forensic result remains `INDETERMINATE`. A read-only DAO attempt
could not read `MSysObjects` and was not retried or granted additional
permission. The audit therefore did not fully compare Access system catalogs,
primary keys and indexes, complete table/field/database properties, form and
report designs, VBA or macros, import/export specifications, or non-selected
object provenance. Older form/report/module exports were also incomplete and
not lossless enough to close that gap.

A comparison wrapper supplied the frozen fingerprint in lowercase to a loader
that requires uppercase. It stopped before PostgreSQL access and before
producing normalized row/cell digests. The invocation was not rerun and is not
reported as a pass. The complete independent CSV-byte comparison above remains
valid evidence. No PostgreSQL or Docker access occurred during the discrepancy
audit.

The bounded exact-size/hash search found no byte-identical copy of the
historical frozen binary. It did not establish that no copy exists outside the
searched project-controlled locations.

## Forensic classification versus owner disposition

`INDETERMINATE` is the audit's full-binary/full-Access-application forensic
classification because the original binary and complete internal catalog were
unavailable. D51 is a narrower owner decision: the proved surfaces are accepted
as **migration-relevant semantic equivalence**. The unverified Access
application internals are not inputs to migration 61, which consumes the
reviewed PostgreSQL migration-60 state and the reviewed repository migration.
The derivative's raw byte hash is therefore not a migration-61 readiness gate;
all PostgreSQL-state, protected-evidence, recovery, restore and isolated
migration verification gates remain mandatory. D51 does not authorize
deployment.

Final Access cutover remains a separate D43-controlled event. Writes must stop,
Access must be fully closed, and a newly copied final snapshot must receive its
own independent hash and evidence. Only validated, owner-approved post-baseline
changes may be reconciled; accepted historical imports must not be duplicated.

## Retained external evidence identities

The detailed evidence and Access working copy remain outside Git. No absolute
workstation path or raw business-data payload is reproduced here.

| File | Bytes | SHA-256 |
|---|---:|---|
| `01-artifact-identities.json` | 3,739 | `804e777138ee3bff4786cf02ef539fe243cfaf71ec5d334f8d381d501dc1cd8d` |
| `02-semantic-comparison.json` | 35,137 | `6c8267d864c02099409ae623e4ab141cd39c667daa596cf858e050e4aea2b15d` |
| `03-object-and-catalog-comparison.json` | 4,130 | `daba8f7a36570786171ee9ec24e0b75481cd6a0a4ed25a2b372e176b999c1dbd` |
| `04-discrepancy-report.md` | 9,636 | `d2fbcff3aa32b3a4546458eb65f2e48dcdaa7d76f39b5a3f635c339814790fff` |
| `05-evidence-manifest.json` | 5,884 | `b7c34cbad5c0c22b266d718a8e5483e566cd1cfa18edd742e0316f07d411e62d` |
| `observed-working-copy.accdb` | 46,792,704 | `d25fb958ffc42d09b962d36e69de723d4595d960725540a96f01767601ec4a86` |
| `SHA256SUMS.txt` | 575 | `3f96e89e7c38ad9b1d24e9c5f41a789bc2ce6d678fb78bc213db1aa24d58d36c` |

## Return point

**Task 4.0a Phase 1 migration-61 predeployment recovery and
execution-readiness audit — not yet resumed.**
