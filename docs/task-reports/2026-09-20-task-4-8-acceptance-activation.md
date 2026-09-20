# Task 4.8 — acceptance, migration 72 and activation

Recorded 20 September 2026 UTC. Owner acceptance and the bounded operational
mandate apply to `90d0219aeffdd8e32b51ff60380e4edcc7e404b9`, sole child of
`c7de44a03710022ac7c47f4dbc4b093838afc31b`, tree
`85f7ba42df9b5cf6f27285a2ae58411f51f34efd`.
The [independent implementation review](../reviews/2026-09-20-task-4-8-90d0219-independent-review.md)
is PASS, no must-fix or missing files. The owner explicitly authorized backup,
isolated rehearsal, actual migration 72 only, activation and ordinary publication.
This work stayed in the same local Windows task without subagents.

## Outcome at this documentation checkpoint

Task 4.8 is locally accepted and newly checked. Only the unchanged reviewed
migration 72 was applied, once. The actual database passed 148 historical checks
and 15 setup checks. The accepted source is running on `http://127.0.0.1:3000`
as PID 52576 (start receipt 10:01:12.928 UTC), build `l02XdOB10LpyGNufC8_Fs`,
from `D:\Projects\LitigationData\accepted-task48-90d0219-20260920T091457Z-0e0368fb`.
Existing private configuration and `litigation_runtime` are used unchanged;
the migration connection is not exposed in the server environment.
Actual anonymous and existing-owner-session read/navigation/filter checks passed.
The full database state remained identical across activation and owner reading.

This report cannot identify its own eventual commit or a future push result.
The single eight-document child, exact patch, reconstruction, fresh remote
observations and final runtime/database/file checks are bound in the external
operational receipts. Publication is authorized only for the existing GitHub main
chain c7de44a → 90d0219 → that single documentation child. Independent operational
review remains pending; Task 4.9, Stage 5 and Ubuntu deployment remain unstarted.

## Evidence and recovery locations

- Operational delivery root:
  `D:\Projects\LitigationData\review-evidence\task48-acceptance-activation-publication-20260920T091457Z-0e0368fb`.
- Fresh protected recovery:
  `D:\Projects\LitigationData\DB-Backup\migration63\pre-migration 72-20260920T091457Z-0e0368fb`.
  The exact migration-71 custom dump, role/ownership/ACL/configuration material,
  all 54 logos and their original path/ACL records have a complete non-circular
  manifest. All members were rehashed immediately before actual deployment.
  Inheritance is protected; only the existing owner SID, SYSTEM and local
  Administrators have access. Secret-bearing recovery bodies remain local.
- Retained old artifact:
  `D:\Projects\LitigationData\accepted-tasks46-47-3f0c6c6-2026-09-17T08-06-59-307Z`,
  build `3OBUE7ppFmV5DINhNdi0s`, untouched. There was no port-3000 listener at
  the fresh starting observation, so no owner app had to be terminated.
- Executed helpers and raw operational observations are retained in the ignored
  `test-results/task48-acceptance-20260920` namespace and supplied under the ZIP's
  `evidence/` paths. This is not a dependency on undisclosed Windows helper files.

The original handoff ZIP is 1,387,368 bytes, SHA-256
`180ea498ee448b1bca7ae02719d47bce190a772c4592dcf86007aaee15ac6344`.
Its separate manifest and all 38 safe unique regular members were verified before
adoption/extraction, including CRC, both lengths and SHA-256. The supplied verifier
was inspected and passed, including the unchanged nested independent review.
The original implementation ZIP, SHA-256
`9394432c22872ccc3ba7e9436e343138912e75a330652bf89f4da5b047302058`,
was located and reverified with its inspected original verifier. Its five
companions are supplied unchanged, not replaced by a summary.

## Recovery, rehearsal and precise actual delta

Fresh forced-read-only repeatable captures cover all 138 non-system tables in
public/staging/quarantine/_migration, full rows and every column, 48 complete
sequence definitions/state vectors, migration ledger, roles/credential digests,
accounts, named raw/effective grants, functions, constraints and triggers.
Namespace ACLs are actual catalog values; sequence defaults use lowercase `s`.
Counts are supplementary, not the preservation proof. The accepted-parent copy
passed 147 historical and 15 setup checks at migration 71. The backup boundary,
post-gate boundary and immediate actual predeployment capture compare exactly.

That exact fresh dump was restored into labelled task-owned PostgreSQL 17
clusters, with distinct system identifiers, ports, fixture credentials and
resources, positively checked before mutation. Full pristine rehearsal gates
passed in `rehearsal-03`; its 147/148 historical and 15 setup results are explicitly
reused within this operational run. Final `rehearsal-06` freshly repeated restore,
identity checks, unchanged guarded deployment, exact migration delta, same-build
four-role browser/read windows and cleanup. No fixture mutation touched the owner.

The restore comparison records 285 concrete representation differences: 45
WAL-only `log_cnt` values reset to zero; two namespace and 147 relation raw
NULL/default ACL representations, with named effective grants equal; 88 physical
column-number shifts from omitted dropped slots with logical columns equal;
one exact equivalent device-check array cast; two fixture credential digests.
All raw vectors and narrow comparison rules are supplied. These allowances are
not used across actual migration, activation or read-only windows.

The actual guarded migration command ran 09:58:47.473–09:58:54.218 UTC.
The one pending migration was
`20260918100000_billing_arabic_labels`, SQL SHA-256
`ff0c27c0102d7c8f72cb756277efe2c0b12fe83bce23425aa77f95767b0e2d95`.
Postdeployment gates completed by 10:00:58.301 UTC, before activation.

| Boundary | Exact observed result |
| --- | --- |
| Ledger | 71→72 completed; 72→73 total rows, including the unchanged legitimate historic rolled-back entry; exactly one successful new row with reviewed checksum |
| Lookups | Eleven D67 `label_ar` NULL→approved values and necessary `updated_at` changes; IDs/codes/order/active flags/other fields exact |
| Audit | All 869 old rows frozen by ID and full-row digest unchanged; eleven successful label-only migration events added, with exact target IDs, before/after values and system context |
| Private counter | `_migration.matter_lifecycle_audit_counter.last_value` +11; other fields exact |
| Everything else | Same 138 tables/schema/catalog/grants; 48 full sequence vectors exact; 543 invoices, 597 payments, 47 allocations and every business/source row/link/old column exact |
| Accounts and files | Accounts, credential/session state, private configuration and 54 logos preserved; frozen set of 37,831 existing files/ACL/link identities retained, with only two preclassified runtime logs allowed mutable |

Migration 33's already accepted historical checksum exception is explicitly
recognized: its recorded deployment had one extra terminal LF. Both exact hashes
are retained in preflight evidence and the existing accepted checker; migration
33 was not edited, resolved or reapplied. No migration 1–72 was changed.

## Build and fresh browser observations

The stable external build uses exact accepted inputs and existing locked
dependencies, not the checkout's `.next` directory. `accepted-build.json` binds
793 tracked inputs, generated inputs, 25 dependency/lock metadata files and every
output to the build ID. Git's existing Windows archive attributes produce CRLF
in applicable PowerShell artifacts; `actual-source-bindings.json` separately
records raw Git blobs, physical artifact bytes and the precise newline qualification.
No accepted source, lockfile or dependency was changed. The isolated browser
mirror copied this compiled artifact without rebuilding it.

Fresh Administrator, Lawyer, Litigation Assistant and Paralegal isolated runs
covered invoice/payment lists/details, all eleven labels, both digit forms for
internal/legacy search, combined filters, draft/applied Clear, Back/Forward,
paging/detail return, genuine fee/client/matter navigation, separate Credit/Debit,
missing type and invoice 21819's 7.5% share. Full database captures after each
fixture login compare exactly across its read window. Fixture setup/account
activity is outside those read windows and never asserted to preserve the
pristine migration state. All owned disposable resources were normally cleaned;
owner resources, old artifacts, recovery and evidence were not removed.

Actual anonymous checks cover login and six protected routes. Next.js may return
HTTP 200 with a streamed `NEXT_REDIRECT` to login; the checker validates that
explicit redirect and absence of billing/allocation records, rather than falsely
requiring every redirect to be an HTTP 3xx response.

Actual CUA observations ran 10:04:15–10:13:21 UTC using the already legitimate
session displayed as Khaled Helmy / Administrator. No login, cookie/token access,
account reset or business save/archive/restore occurred. The retained operator
record is `owner-browser-observation.json`, explicitly a contemporaneous
transcription of DOM/control observations, not an automated video or trace.
Its full pre/post capture compares all 138 tables, 48 sequences, catalogs,
accounts and ledger exactly; no login-bookkeeping exception was needed.

Concrete actual results include invoice searches 547/٥٤٧ → [547,296],
778/٧٧٨ → [547,170]; payment searches 411/٤١١ and 518/٥١٨ yielded identical
ordered results in each pair. Search is normalized descriptive text as well as
exact IDs, so extra legitimate matches are not a failure. Client 242 + fee 57 +
EGP returned invoices [356,322,321]; invoice 356 returned payment [411].
Invoice 21819 showed 137,500.00 EGP and all four approved allocation-role labels,
including the recorded 7.5%. Invoice 21269 showed its real missing type.
Payment 411 showed Credit 137,500.00 EGP and missing Debit separately. Native
Clear/history/pagination/detail-return controls agreed with results. Genuine
links reached fee 57, its matter 1810, client 242 and the client's twenty payments.
The matter observation is URL/heading-level, not a full matter-detail regression.
Transient loading/previous-page observations were retained, not marked PASS;
separately timed rendered observations support the conclusions.

## Reused proof, gates, attempts and limitations

Verified dated implementation evidence is reused, not represented as rerun:
the 543/597/47 full population oracle, four-role 184 pages/4,560 details,
1,065 filter cases, 448 permission decisions, 130-check canonical replay,
late-failure rollback, twenty security faults, 53 accessibility records and
seventeen source bindings to the September 17 earlier-module backend/race proof.
Original payload limits remain 298 inspected of 711 observed responses, with
413 unavailable bodies explicitly uninspected. The original disposable build
`G6lpfpqwGYXgU3Niw5JgC` is not the new actual build.

Fresh project checks passed typecheck, lint, existing formatting exclusions,
RTL, auth/audit/user/staff/client/admin/POA/document/fee/billing guards.
The aggregate `npm run check` stopped at a sandbox Git-child EPERM after those
components; its exit 1 is retained, not relabelled success. Gitignore and encoding
components then passed under command-scoped permissions. Documentation-specific
UTF-8, whitespace, Markdown parsing, local links, unchanged-source inventory,
exact matrix prefix/review copy and checkbox checks accompany this child.

Meaningful failed/superseded attempts and executed helper sources are preserved:
initial preflight assumed every historical checksum matched current bytes, then
hit the known migration-33 LF case; subsequent in-memory Date vs serialized JSON
comparison was corrected by comparing saved captures. Restore attempts 01/02
stopped on the concrete physical-column/cast representations above. Rehearsal 03
passed database gates but had an incorrect browser-import path; 04 hit a search
timeout; 05's independent oracle omitted accepted space removal across combined
text (21377 plus contract 78 legitimately matches 778). Final 06 corrected the
harness only and passed. Initial actual preflight rejected Git-archive CRLF
before deployment; the corrected raw-object/artifact comparison passed, and
only then was actual migration executed once. Initial anonymous smoke assumed
HTTP-only redirects; the explicit streamed-redirect check passed. Supported
command-scoped permission retries and cleanup receipts remain recorded.

No screen-reader speech, JavaScript-disabled guarantee, exhaustive actual
payload inspection or accessibility-conformance certification is claimed.
Fresh actual session coverage is Administrator; the four-role proof is isolated.
Private body collection remains a host observation: reviewers can recompute
supplied vectors/digests and inspect capture code, but cannot independently
observe private backup contents from the sanitized package. D59's existing
accepted risk remains unchanged, not technically remediated. Inherited native
billing SQL grants were not redesigned; application read-only does not mean
every conceivable direct native-row SQL write is impossible.

## Documentation and delivery boundary

Exactly six existing documents are updated and two added. The imported review
is verbatim 11,676 bytes; the matrix's original 4,836-byte prefix is exact.
Only 4.8's existing marker changes; the other 85 checkbox lines and all accepted
application/test/schema/migration/governance/dependency/configuration files stay
unchanged. Older implementation reports and approval bodies are preserved.
Final Git inventory is expected to be 795 paths; actual Git records govern.
The review ZIP supplies raw commit/recursive-tree bindings, full-index binary
patch, complete source pre/post images except the two unchanged private D59
bodies, exact local full reconstruction and qualified shared reconstruction,
operational helpers/raw results, original reusable companions and publication
receipts. Raw dumps, credentials, tokens and protected recovery bodies stay local.
The final standalone verifier result and non-circular receipt are separate upload
companions. Leave the accepted app running and stop for independent review.
