# Stage 0 Fix Re-review — 20 August 2026

VERDICT: fix these first

This review covers only the fixes in `ec3799e`, `b1c2ca0`, `f0d5698`, and
`38aa3b3`. It does not re-review Stage 0 as a whole.

## MUST FIX (2 items)

- **`db:reset` can still inspect an empty database and delete a different database that contains the firm's records.** The new comparison in [`scripts/db-reset.ts`](../../scripts/db-reset.ts#L183) proves that `DATABASE_URL` reaches the correct PostgreSQL *server*, but every database name inside one server shares that identifier. I put five disposable rows in `litigation`, pointed `DATABASE_URL` at the empty built-in `postgres` database on the same container and port, and ran the command without an override. It said “Tables: none,” deleted the volume and the five rows, applied the migration to `postgres` instead of `litigation`, printed “Done,” and exited successfully. At Stage 2, a wrong database name in `.env` could therefore erase all 30,553 rows. The guard should require the exact expected database name and account for every non-template database in the volume it deletes, then add this same-container case to its regression tests. **Cost: 1–2 hours.**

- **Gate 1 still has paths that report success for an incomplete extraction.** The normal full-run assertions in [`scripts/01_extract_access.ps1`](../../scripts/01_extract_access.ps1#L638) work: a wrong table count, 53 attachments, 287 multi-value entries, or one warning each exited with code 1. However, a partial run using `-Tables` passed with 0 attachments and 0 multi-value entries; `-IncludeArchiveTables` passed with 108 attachments and an arbitrary total of 99,999 rows; and a full-run simulation where the expected `lawyers` table was absent but an unrelated 23-row table took its place also passed. The last case happens because a missing expected table is only rejected when it appears in the list of tables that actually exist, while unexpected tables are not rejected and the aggregate total can compensate. Gate 1 should only turn green for the exact migration set: the exact expected table names, all expected per-table counts, 30,553 total rows, 54 attachments, 288 multi-value entries, and zero warnings. Optional or archive extractions should be clearly labelled as non-gated diagnostic runs and must not print “GATE 1 PASSED.” **Cost: 1–2 hours.**

## SHOULD FIX (2 items)

- **The 18 RTL fixtures cover the four gaps previously reported, but common variations remain untested and undetected.** The fixtures now cover inline physical styles, `left:`/`right:` after a selector, directional margin/padding shorthand, and visible English text. The self-test catches all 18 named rules and stays silent on its two clean files. However, the checker still works one line at a time, so ordinary multi-line JSX text passes; `alt={'Company logo'}`, `{'visible text'}`, template-literal labels, and labels split across lines also pass. Four-side inline `margin`/`padding`, and directional CSS shorthands such as `inset`, `border-width`, and `border-radius`, are not checked. These are likely forms developers will naturally use on later screens. Extend the fixtures and preferably parse TSX/CSS structurally rather than relying only on line-by-line patterns. **Cost: 2–4 hours.**

- **The new file formats are blocked only in lowercase on a case-sensitive Git checkout.** All new lowercase formats are covered, and the actual [`check:gitignore`](../../scripts/check-gitignore.ts#L109) failed correctly when `.xlsm` protection was simulated as removed. But the check inherits this Windows computer's case-insensitive Git setting. With Git forced to the case-sensitive behaviour used on Ubuntu, uppercase versions of every new format tested—such as `.XLSM`, `.SQLITE`, `.ZIP`, and `.TGZ`—were committable. Make the patterns case-independent and make the checker run with case sensitivity forced, including uppercase fixtures. **Cost: about 30 minutes.**

## MINOR (1 item)

- When the database is unreachable, the guard safely refuses even if `--force-i-know` was already supplied, but it still tells the user to retry with that same flag. This is misleading but not dangerous. **Cost: 10 minutes.**

## WHAT LOOKS GOOD

- The reset guard correctly found and preserved data held only in `stg`, then only in `qc`. It refused an unset `APP_ENV`, a misspelling even with the override, an unreachable database even with the override, and a different PostgreSQL server on another port. The local Stage 0 database was rebuilt correctly after the destructive same-container test and passed all five application checks.

- The UTF-8 BOM is present both in commit `b1c2ca0` and in the working file. Windows PowerShell 5.1 and PowerShell 7 both parsed the script with zero errors and read the Arabic probe as the exact seven intended characters. An in-memory corrupted probe caused the runtime self-check to exit 1 in both versions. The actual encoding checker, run with an in-memory hook that hid the BOM without changing the file, named the extraction script and exited 1.

- For a normal full extraction, Gate 1 now exits non-zero for a per-table mismatch, an attachment mismatch, a multi-value mismatch, and any warning. It collects warnings so all problems can be reported together, but it does not allow Stage B to proceed.

- The RTL self-test reports 18 required rules caught, 36 total findings in the deliberately broken files, and no findings in the two clean files.

- `check:gitignore` currently reports 48 blocked paths, 14 legitimate paths still trackable, and no banned committed file. Its failure path was proved by simulating removal of the `.xlsm` pattern; it named `macros/tracker.xlsm` and exited 1.

- `db:verify` was run against a genuinely fresh database. It produced all ten rows without an error, gave “run: npm run db:migrate” for the five migration-owned items, and skipped the unavailable Arabic collation demonstration safely. No third parse-time name-resolution fault remains.

- The D15 server-folder instruction, README status, and incorrect D18 references are corrected. All six quality gates pass, and the production build succeeds.

**Final verdict: fix the two MUST FIX items before treating the Stage 0 fixes as safe to continue.**
