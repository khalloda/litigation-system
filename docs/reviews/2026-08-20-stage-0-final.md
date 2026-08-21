# Stage 0 Final Fix Verification — 21 August 2026

VERDICT: fix these first

This review covers only the two previously blocking fixes in commits `e0e581b`,
`2dd2ccf`, `f17f450`, `c35e739`, and `fcbbf97`, plus the two brief confirmations
requested by the owner. The specific attacks from the previous review are
closed, but one new bypass remains in each protection.

## MUST FIX (2 items)

- **`db:reset` can mistake rows for zero when a table or schema name contains its `|` separator.** The container inventory returns each result as `schema|table|count`, then [`scripts/db-reset.ts`](../../scripts/db-reset.ts#L253) splits that text and converts the third piece to a number without checking that the conversion succeeded. I created one table named `review|guard_fixture` with three rows, after independently confirming the cluster contained no project data, and ran only `--dry-run`. The guard reported “Tables: 1 ... all empty” and said a real reset would be allowed. A real run would therefore delete those rows without requiring the override. Return the inventory in an unambiguous format such as JSON, validate every count as a non-negative integer, and refuse if any result cannot be parsed. Add this exact case to `test:guard`. **Cost: 30–60 minutes.**

- **Gate 1 accepts duplicate entries for an expected table, so its table set is not yet exact.** [`scripts/lib/gate1.ps1`](../../scripts/lib/gate1.ps1#L88) checks that every expected name appears and rejects unfamiliar names, but it never requires each expected name to appear exactly once; the count check then uses only the first match. I supplied the perfect 15 entries plus a second `lawyers` entry with zero rows. The total remained 30,553, and Gate 1 returned `Gated=True` with zero failures in both PowerShell 5.1 and 7. A later loader could act on the wrong duplicate even though the gate said the manifest was exact. Reject any name occurring more or less than once and add this as case 14. **Cost: 20–30 minutes.**

## SHOULD FIX (0 items)

None.

## MINOR (0 items)

None.

## WHAT LOOKS GOOD

- The original `db:reset` bypass is closed. `DATABASE_URL` naming `postgres` while rows exist in `litigation` is refused before deletion, and the guard now inspects normal tables in every schema of every non-template database in the volume. `npm run test:guard` passed all nine cases without destroying anything. A same-name decoy database on another local port was also refused because its PostgreSQL cluster identity differed. With the real cluster empty, the normal `--dry-run` permitting path passed and changed nothing.

- Rule 14 was followed. Before creating any fixture, an independent inventory found only the single Prisma migration-ledger row and no project data. Every fixture and the disposable decoy server created for this review was removed. The final inventory again found no project rows.

- The three reported Gate 1 bypasses are closed. A missing `lawyers` table cannot be masked by an unrelated 23-row table. `-Tables` and `-IncludeArchiveTables` are diagnostic runs, print the yellow diagnostic banner, and do not print `GATE 1 PASSED`. All 13 official cases passed under both Windows PowerShell 5.1 and PowerShell 7.

- The case-sensitivity fix is active: the checker invokes Git with `core.ignorecase=false` and reports 65 blocked paths, including uppercase fixtures.

- Both RTL `KNOWN GAP` items have deliberately broken fixtures. The self-test reports both by name on every run instead of silently treating them as covered; all 20 enforced rules were caught, with 55 findings and no false findings in the two clean files.

**Final verdict: the original attacks are closed, but Stage 0 should remain open until the two new fail-open cases above are fixed and added to their suites.**
