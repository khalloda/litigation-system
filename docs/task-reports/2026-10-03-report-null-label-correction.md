# Report missing-value label correction — local review candidate

The owner adopted the 3 October 2026 null-label correction before Task 6.9.
The verified handoff starts at published `5c2d775e02ec2e1f06da59d0d6520a6d3c6b837d`.
Application-generated report nulls now display exactly **غير مسجل**. Only
`reports.nullValue` and `auditHistory.null` in `src/strings.ts` change.
Shared report previews, readable XLSX cells, PDFs, selection fallbacks and
audit views inherit those labels through their existing formatting paths.

Literal stored text containing `NULL`, `(NULL)`, `null`, or `غير مسجل` remains
unchanged. Database nulls, typed JSON, exact-value worksheets, audit original
envelopes and Base64 values retain their previous representations. Empty text,
whitespace, zero, false, redaction and absent audit fields retain their separate
handling. No report criteria, selection, permission, grouping, pagination,
font, renderer, timestamp algorithm, dependency or migration changes.

## Fresh verification

Evidence is retained under
`test-results/report-null-label-20261003T065600Z/`; private snapshots, configuration
and recovery remain protected and excluded from the review package.

- The supplied standalone verifier passed all 13 handoff members. The complete
  v1.161 context was compared with the previously read v1.159: removing the six
  new marked sections and reverting version/date headers restores every prior
  byte. All new sections and the independent Task 6.8 operational PASS were read.
- `scripts/test-report-null-labels.ts` tests 14 business states and 16 audit
  states against literal expected labels. It exercises the actual flat, grouped,
  section/detail and cover HTML/XLSX paths and actual business/audit PDF renderers.
  Inputs are synthetic renderer values, never database records. Recorded null
  remains distinct from absent and from a literal string with the same label.
- All 39 registered reports are mapped to the existing shared rendering paths.
  Movement templates and intentional blanks remain source-identical. Unchanged
  adapter, selection, permission and volume evidence is reused from the exact
  accepted chain; this is not a new full-volume test of every report.
- Seven saved workbooks were independently decoded with openpyxl: readable
  values, exact types/Base64 values, RTL and audit original envelopes passed.
  All 14 pages of five PDFs were rasterized and visually inspected. Arabic
  shaping, Noto Sans Arabic, RTL, wrapping, date/sign examples and the accepted
  audit timestamp order were retained. Literal NULL text stays visible where it
  is actual data. No copying or search diagnosis was performed.
- Genuine fixture-browser login and previews exercised client-POAs for client 13
  (four records, independently queried) and hearing 39494's record audit dialog
  (event 1023). Four application exports were completed, saved, inspected and
  matched to their audit artifact hashes: POA PDF/XLSX and audit PDF/XLSX.
- The separate production artifact built successfully with existing locked
  dependencies. The browser-tested build is `bd4rNMQoSfLjmrrQogRZr`; its application
  bytes match this candidate. The complete project check passed; final checks
  and exact execution/source bindings are included in the delivery.

## Recovery, accounting and preservation

A fresh read-only owner snapshot observed migration 78, 159 tables, 48 sequences
and 1,202 audit events. The prior review had 1,192 events; only the audit table and
counter had changed before this correction baseline. Those intervening events
were preserved without attribution or reversal. Earlier recovery therefore was
not substituted for the fresh state: a new protected dump, roles, configuration
and 54 logos were retained and restored into a separately identified cluster.

The isolated restore and final fixture passed all 148 historical and 15 setup
checks. Complete logical restore comparison retains the established narrowly
specified physical/deparser/isolated-credential differences. Final gate snapshots
are equal. Fixture changes comprise exactly 13 events: three account bookkeeping
updates, one password reset, one password change, one genuine login, three report
executions and four completed exports. Only the expected account, audit, counter,
mutex and audit-export-receipt tables change. Business rows, all selection scopes,
original audits, schema and sequences remain exact. The inherited fixture audit
capability was already enabled; no capability grant was needed.

Owner snapshots before and after the campaign are equal across all 159 tables,
48 sequences and catalogs, with zero added audit events. Hearing 11003's archive
and version 2 remain intact. The live app remained PID 14148 on loopback port 3000,
build `qKKiY1Mm3YlI7kLKXlTaH`; it was not restarted or used for authenticated checks.
TASKS.md and governance bytes remain unchanged. Prior evidence/recovery and the
live artifact are retained, with immutable file hashes checked separately from
permitted runtime-log changes.

## Retained harness failures and bounded recovery

The delivery retains failed attempts. Synthetic tests initially needed an isolated
database setting for module initialization, the existing bidi wrapper in their
expected HTML, and distinct test IDs for typed null versus the literal `null`.
None required an application correction beyond the two labels. Scope selection
and workbook-inspector errors were corrected in task-owned helpers only.

The audit browser harness first supplied a record query to the global audit page.
That page's export control used a global subject, so the scope-bound request was
refused. A pending-download rejection obscured the first exception; the failure
screenshot and a read-only outcome check were retained. One bounded continuation
captured HTTP 400 explicitly. The actual record audit dialog then saved both files.
This is six recorded delivery attempts, four completed/saved/inspected files, two
refused or interrupted attempts and zero completed-but-unsaved exports. The helper
misuse was corrected; no application transport repair is claimed.

The fixture launch wrapper reached its 900-second timeout before receiving its
cleanup signal. Final fixture checks completed. The task app was stopped by exact
PID, creation time, command and port. The retained database cluster, container
label, image, volume and network were reidentified before normal stop/removal.
The owner container and all other Docker resources remained unchanged. Temporary
fixture credentials and session files are removed after evidence binding; recovery
and inspection evidence remain local.

## Review boundary

Local implementation reviewed next; **not yet live and not pushed**. The five-file
delivery contains the correction ZIP, manifest, standalone verifier, verification
and final receipt, including native commit/tree and receipt-inclusive integrity
checks. Package verification is not independent implementation acceptance.

N1 remains accepted, unresolved and **not fixed**. PDF copying remains an accepted
limitation, not fixed; PDF search remains uncertified. The unreadable legacy
`Detail_Format` procedure remains unrecovered. No owner migration, provisioning,
repair, login, report/export, selection save, activation, acceptance closure,
publication, Task 6.9 or Stage 7 work is included.
