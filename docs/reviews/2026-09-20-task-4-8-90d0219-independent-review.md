# Task 4.8 — independent implementation review

**Review date:** 20 September 2026 UTC  
**VERDICT: PASS — safe to proceed to owner acceptance and the separately authorized migration/activation/publication phase.**  
**Must fix: 0. Required missing files: 0.**

The missing implementation ZIP is now received and verified. This review was completed in the existing ChatGPT conversation. It does not perform acceptance documentation, migration 72 on the owner database, app activation, publication, or a task-checkbox change.

| Identity | Verified value |
| --- | --- |
| Candidate | `90d0219aeffdd8e32b51ff60380e4edcc7e404b9` |
| Sole parent | `c7de44a03710022ac7c47f4dbc4b093838afc31b` |
| Candidate tree | `85f7ba42df9b5cf6f27285a2ae58411f51f34efd` |
| Parent tree | `269dc98daffe19463cf347e59c068526007505c1` |
| Change | 41 paths, +2,860/−39; 770→793 tracked identities; 752 existing paths unchanged |
| Candidate migration | `20260918100000_billing_arabic_labels` — migration 72 |
| Migration SHA-256 | `ff0c27c0102d7c8f72cb756277efe2c0b12fe83bce23425aa77f95767b0e2d95` |
| Original delivery ZIP | 32,972,018 bytes; SHA-256 `9394432c22872ccc3ba7e9436e343138912e75a330652bf89f4da5b047302058` |
| Original external manifest SHA-256 | `0b462d0c6e26d6a03ca5fc13c08485ca434a0c9ad2bded547defa7f596aa4115` |

## What was independently verified here

- All five outer ZIP members and all 2,977 inner payload members have matching complete membership, safe unique regular paths, CRC, compressed/uncompressed size and SHA-256. The inner ZIP is 33,232,829 bytes, SHA-256 `e53431ce6ce4f8dc370b40db1a8675b0f98c3297ff3cbc466ab937260c18e990`.
- All 632 receipt-listed evidence files are present. All four sealed-artifact hash bindings pass. The original 80-member adopted handoff and its 12-member prior review are included and verified. No original prompt, required companion or evidence file is outstanding.
- The supplied verifier was inspected before execution and passed here. Raw commits, complete recursive tree identities and all supplied source blobs match. Exact forward/reverse patch reconstruction passes with the two unchanged D59 file bodies deliberately omitted; their unchanged Git identities remain verified. No byte-level reconstruction of those two private bodies is claimed here.
- Repository governance, D67, migrations 1–71 and all 86 existing checkbox lines remain exact. Task 4.8 remains unchecked. The standalone implementation report matches its committed source copy byte-for-byte.
- Separate reviewer-authored checks recomputed scope, receipt completeness, complete owner/read-window vector equality, protected-file equality, the allowed migration delta, exact lookup values and all 11 new audit events. Each event names its corresponding lookup identity, changes only `label_ar` from NULL to the approved value, and records successful migration attribution. The existing audit counter increases by exactly 11; all prior supplied migration-ledger records remain exact and one successful migration record is added.
- Exact candidate money/share formatter functions were executed here under Node 24 against an independent BigInt/Intl oracle: 3,591 money comparisons and 124 share comparisons passed, including supplied historical/edge values and integers beyond JavaScript's safe floating-point range. Stored `0.07500` displays as `7.5%`. These are local formatter checks, not a database or browser rerun.

## Source review conclusions

The implementation matches the adopted read-only billing scope. All four existing roles use `billing:view`; all five page entries are registered and guarded. The query service independently checks the current account, role, person, login eligibility, password-reset requirement, session version and expiry inside read-only repeatable-read transactions. No new billing mutation gateway or create/edit/delete/archive/restore route was found.

`src/lib/billing-query.ts` explicitly selects permitted fields. Invoice and payment joins preserve missing parents; client identity comes through the fee letter. Archived clients/fee letters remain visible and labelled. Payment credit and debit remain separate exact decimals. Missing dates/types/currencies remain explicit; Canceled invoices are not treated as archived. Hidden invoice VAT/report/receipt fields, excluded Access Pay-Date and raw provenance payloads are absent from the new public projection.

Search normalizes both exact internal/legacy-ID input branches and descriptive text. Literal wildcard escaping, bounded pagination, invalid/repeated/unknown parameters, date/range checks, distinct counts and deterministic ordering are present. Excessive valid page numbers use the documented last-page behavior. Shared filter reset and keyed form rendering preserve the established navigation pattern. Related payment/allocation results are bounded, with links or pagination to reach the rest.

The detail and field components preserve genuine invoice/fee-letter/client relationships, full permitted descriptive text, approved role labels and actual allocation fractions. They do not infer balances, VAT, collection rules, automatic status changes, fixed lawyer percentages or payable amounts. Original `Credit`/`Debit` headings are retained with an Arabic explanation rather than inventing another financial-label approval.

Migration 72 contains only the bounded D67 lookup updates and existing audit-context calls. It requires the expected completed migration-71 checkpoint and exact original code/NULL-label sets. It does not modify schema, business rows, permissions or earlier migrations. The permanent database check compares the exact 11 approved mappings, including missing/extra/changed values, while retaining historical reconciliation and immutability checks.

No corrective source finding was established. The selected supplied mobile/register/share screenshots were also inspected; this visual review is not a fresh interactive-browser test.

## Supplied execution evidence, not reviewer reruns

The final source/build bindings support the supplied Windows results below. The independent verifier recomputes their delivered relationships and expected result sets; it cannot independently witness their original Windows execution.

| Supplied evidence | Observed record and scope |
| --- | --- |
| Historical upgrade | `isolated-11`: 147 accepted-parent checks, 148 candidate checks, exact migration delta and deliberately late rollback |
| Canonical replay | `canonical-03`: 130 checks on the clean replay profile |
| Authorization | 448 permission decisions; direct-service anonymous/expired/stale/disabled/reset/invalid-principal refusals |
| Complete historical reads | 543 invoices, 597 payments, 47 allocations; four-role ordered lists/details, 184 list pages and 4,560 invoice/payment details |
| Search/filter oracle | 1,065 independently derived result sets; the exhaustive filter loop uses one authorized session, separately from four-role complete-read/browser coverage |
| Security window | `security-01`: 20 denied operations, 15 setup checks and an equal complete before/after state pair |
| Production browser | Four-role read/navigation/filter/reset/page/detail flows, labels, earlier-module links, keyboard/RTL/mobile/zoom evidence; 53 recorded accessibility scans with no listed violations |
| Payload inspection | 711 observed responses: 298 bodies inspected with no forbidden-field matches; 413 bodies unavailable. Source projection review independently supports the field boundary |
| Final project checks | `check-05` source-bound project gates; final executable source/build bindings verified |

The final disposable build is `G6lpfpqwGYXgU3Niw5JgC`, bound to source manifest SHA-256 `53094e72dcadccd24db0b92db67294b3b6ee486be3d32cb67e9f171095178500`. It is not the owner artifact. Prior unchanged Tasks 4.6/4.7 backend/concurrency evidence is reused with 17 exact source bindings, not reported as newly rerun. Failed and superseded attempts remain identified; the early attempts lacking preserved helper bodies are not used as final passing proof.

## Preservation and limits

The delivered 18–20 September owner captures compare equal across all 138 non-system tables in public/staging/quarantine/_migration, full row and column digests, all 48 complete sequence vectors, named catalogs/grants, credentials/account state and ledger. The supplied owner remains at **71 completed migrations**. All 36,401 static protected-file identities and 96 root ACL observations match; two runtime logs are separately classified. The accepted artifact remains `3OBUE7ppFmV5DINhNdi0s`.

The supplied runtime observations show **no app listener**, with the accepted artifact preserved. Do not carry forward the old PID 25944/running-app claim from earlier tasks. A database-container restart during the inactive interval is explicitly recorded; this review does not claim uninterrupted runtime or attribute the restart to a cause.

These preservation conclusions verify supplied capture code, metadata, digests and equality. Private database/file bodies and collection on the Windows host were not independently observed here. Original audit-row bodies are withheld; their historical digest and append-only enforcement are receipt/source-limited. Migration events, lookup rows and the prior migration ledger have more direct delivered evidence. Restore-related `log_cnt` differences are isolated from full-vector comparisons within migration/read/owner windows.

The inherited runtime SQL INSERT/UPDATE grants and sequence SELECT/USAGE are unchanged. The application supplies no billing write path; imported-row protections and specifically tested denied SQL operations remain enforced. This PASS does **not** claim that the runtime principal cannot perform every conceivable native-row SQL write. Broad privilege redesign was not introduced into the label-only migration.

Screen-reader speech remains the owner's exclusion. No new no-JavaScript guarantee, full accessibility-conformance certification, live GitHub check, owner browser test or PostgreSQL execution is claimed by this reviewer. Git cleanliness/ahead state are dated supplied observations.

## Next step

The candidate is suitable for owner acceptance. A later explicit operational mandate should freshly verify the accepted candidate and actual owner/remote state, preserve the stopped-app boundary until authorized activation, create/verify protected recovery material, rehearse the exact migration, apply only migration 72, run the applicable actual checks, activate a stable artifact and conduct bounded legitimate-session observations. Acceptance documentation and ordinary publication should preserve the reviewed chain and record actual outcomes. Task 4.9, Stage 5 and Ubuntu deployment remain outside this review.

No additional upload, application correction or historical test rerun is requested to finish this independent implementation review.

## Reproduction files

The reviewer record includes the original input identities/manifest, the inspected-verifier result, separate reviewer checkers and results, selected exact source/evidence references, and context-preservation evidence. Use the original implementation ZIP for complete source and evidence; the smaller reviewer record is not a replacement for it.

The reviewer checker's first run assumed the nested ZIP had also been extracted as a sibling file. That path-only assumption was corrected to read the sealed member directly from the supplied outer ZIP. It was not an application failure; final checker source and passing result are retained. No implementation file was changed during review.
