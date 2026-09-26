# Task 6.1 reporting engine — acceptance matrix

Prepared before implementation on 26 September 2026. Base:
`bcf5359b915d94872cdea1283ea404a76fd53dee`. Implementation review only.
The adopted handoff matrix is normative; evidence root is
`test-results/task61-20260926T074618Z`. TASKS and governance remain unchanged.

| Criteria | Authority and modules | Planned proof | Current result |
|---|---|---|---|
| T61-01 | Adopted handoff; repository governance | Full source/Git/remote/closure identities | PASS: handoff-verification.json and source-authority-verification.json; clean base and fresh remote exact |
| T61-02–05 | REPORTS, D19/D39; report types/input/options | Strict typed descriptors; independent parameter/civil-date/option tests; historical and missing selections | Pending |
| T61-06–07 | PERMISSIONS, D33; report authority/service/routes | Existing 480 decisions plus real four-role, stale/disabled/revoked/password/expiry/forged-account denials before reads and release | Pending |
| T61-08–09 | D52/D58/D61; query adapter/snapshot | Independent full-volume ordered row oracle; query counts; no implicit archive/default omission; preview/export distinction | Pending |
| T61-10–11 | REPORTS, BRAND; Excel renderer | Saved XLSX and independent OOXML parsing: exact types, raw strings, long-cell handling, limits, counts, injection | Pending |
| T61-12–14 | REPORT-LAYOUTS outranks VISUAL-DIRECTION; shared PDF/assets/layout | Saved PDF text/fonts/pages plus inspected first/middle/last renders; all shapes, logo/fallback, long rows, count/footer, offline assets and bounded failures | Pending |
| T61-15–17 | D30; service/audit API | Exact phase-event contract below; real success/failure/cancel/retry counts; navigation has no events | Pending |
| T61-18 | Adopted no-domain-report boundary; registry/catalog | Ordinary build has empty registry; test adapters only in separately mounted harness; forged-ID HTTP denial | Pending |
| T61-19 | BRAND/VISUAL-DIRECTION; shared form/result | Genuine fixture browser keyboard, errors, focus, downloads, desktop/390/320px/200% zoom; targeted axe and screenshots | Pending |
| T61-20 | Repository checks and inventories | Stable production build, full check, actual command/source bindings, affected regressions | Pending |
| T61-21 | DATABASE/MIGRATION; isolated fixture | Target identity, pristine restore comparison and 148+15 gates before writes; exact later fixture deltas | Pending |
| T61-22 | Adopted preservation scope | Complete owner/private/protected-file baseline/final; runtime observed honestly; fresh post-seal check | Baseline captured; owner app absent at 07:49 UTC; no start/restart |
| T61-23 | Frozen migrations 1–73 | Reuse generic reporting audit APIs; no migration currently proposed; final source proof | Pending |
| T61-24 | Adopted delivery contract | Local coherent commits; exact cleanup; five-file sealed package; independent Git patch reconstruction and negative verifier tests | Pending |

## Execution and audit contract (recorded before coding)

Each explicit POST is a new physical execution with server-generated request and
correlation identifiers. There is no cross-request exactly-once claim, automatic
resubmission, persistent report cache or browser-receipt claim. An explicit retry
starts a new attempt; the form warns that an interrupted request may already have
recorded its completed server phases. Ordinary navigation, options and catalog
reads do not create audit events.

| Action / stopping point | Durable successful facts |
|---|---|
| Invalid input, denied authority or query failure | None |
| Successful explicit preview | `report_executed` after the coherent complete query/result has passed validation; before release |
| Direct export | A new `report_executed`, then `export_completed` only after complete artifact bytes exist |
| Export after preview | A new coherent execution with its own generation time and two phase events; it does not reuse stale preview data |
| Generation failure or cancellation after query commit | The truthful `report_executed` remains; no `export_completed` |
| Failure writing the query event | No successful preview/artifact release; no committed success event |
| Failure writing artifact event | Query event remains; no successful artifact release |
| Cancellation/revocation after artifact event commit | Both completed server facts remain; bytes are withheld when cancellation/revocation is observed before release |
| Explicit repeated request | New server-owned attempt and its actual phase events, not a duplicate of the prior operation identity |

Authority is checked before protected reads, inside the coherent snapshot and
again before phase recording and response release. Only bounded normalized
scalar parameters, definition/version, server operation identity, row/column
counts, format and artifact digest enter audit metadata. No report body, secret
or binary is audited. `download_completed` is not emitted: returning a Response
does not establish browser receipt. Audit failures are fail-closed. PostgreSQL
cannot roll back already observed external facts.

## Limits

No domain report semantics or Access-equivalence acceptance is claimed. No owner
login, report, export, migration, provisioning or activation is authorized. No
screen-reader speech actions; axe and visual/keyboard tests are bounded evidence,
not universal conformance. Private raw state remains local; shared summaries
cannot independently reproduce those withheld bodies. Local seed recovery does
not protect against disk/laptop loss. Prior-root ACL scope is not every prior
descendant ACL.
