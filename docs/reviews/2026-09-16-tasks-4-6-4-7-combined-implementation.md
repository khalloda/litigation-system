# Tasks 4.6–4.7 combined implementation candidate

Date: 16 September 2026

Accepted parent: `aecf4fd4bca22fe697f489a9827d6c46edb917fa`

Accepted parent tree: `ece05a2dee8fa99781b529835d30f14d651411b4`

Status: complete local candidate; independent combined review required

The candidate commit and tree identify this report itself, so their non-circular
final identities are recorded in the separately generated review receipt after the
commit is created. That receipt, the raw commit/tree records and complete per-file
statistics are authoritative; this report cannot truthfully embed its own Git object
ID before that object exists.

## Outcome

The Documents module now provides Arabic RTL list, bounded normalized search,
independent filters, stable 25-row pagination, full current/source detail, create and
edit flows, current client/matter/responsible-person set/clear/replace, and
Administrator-only recoverable archive/restore. Page-count zero remains distinct
from unknown; invalid native number/date drafts stay visible and are rejected before
a request is built.

The Fee letters module now provides the corresponding list/search/filter/detail and
metadata create/edit/lifecycle flows. It maintains two deliberately independent
relationships: ordered current covered-matter memberships with retire/restore, and a
matter-side single current fee-letter reference with explicit set/clear/replace.
Neither operation rewrites the other direction, the protected raw matter reference,
invoices or original evidence. Client and matter pages link to the new current views,
and the home navigation remains permission-aware.

## Database and security boundary

Migration 71 freezes the 407 imported document rows, 372 document evidence rows,
331 imported fee letters, 231 reviewed forward links, 393 reviewed reverse links and
57 plus 19 quarantine rows before enabling current changes. It adds immutable
boundary/history/submission structures, replay checks, partial uniqueness, audited
security-definer gateways and direct runtime ACL denial. D65/D66 are appended once,
byte-for-byte, after D64. D1–D64, migrations 1–70 and all 86 task checkbox lines are
unchanged.

All four roles can read. Administrator and Litigation Assistant can create/edit and
manage current relationships. Only Administrator can archive/restore. Lawyer and
Paralegal mutation attempts are rejected. Matter-side reference changes additionally
enforce matter-update authority. Authorization is checked at route, action, service
and committing database gateway boundaries; exact retry reuse follows a fresh
account/session/role check.

## Executed evidence

- The supplied handoff ZIP was SHA-256
  `3cb1f5249d3435a178a7cdb827d2c3ad17bc3d7c278a4e2282a701e95728396`
  (4,109,954 bytes); its separate manifest was
  `f38e96a255e64f9532c1ab95bf1149b50974b1890258ee705dbb045ff2afaed8`.
  All 885 safe unique members matched CRC, size and SHA-256 before extraction.
- The final historical owner-copy upgrade reports migration 71 and all 146 permanent
  checks passed. The canonical clean replay reports migration 71 and all 128
  applicable checks passed, including late-failure rollback and owned cleanup.
- The mutation/adversarial suite passed strict duplicate-key/size parsing, all role
  and lifecycle flows, ACL and immutable-source checks, rollback-only corruption
  detection, a true overlapping document edit and a true overlapping matter-side
  replacement; in each race one commit won and the stale peer failed.
- The final isolated production-browser run is
  `test-results/tasks46-47-browser-final12`. It passed four-role reads/denials, both
  writer roles, document and fee-letter create/edit, covered add/retire/restore,
  matter-side set/clear, both lifecycle flows, invalid native draft retention,
  search/Clear/history navigation, Cancel/Escape/focus, RTL/accessibility, 320 CSS
  pixels and genuine browser 200% zoom. It recorded the exact build/source and
  removed its owned database/container/network/listener/build mirror.
- The complete project gate passed type checking, lint, formatting, 133-file RTL
  checks and self-test, 134-entry authorization inventory, audit inventory plus 67
  bypass fixtures, every focused read boundary, encoding and ignore checks. Final
  historical and owner checks are recorded separately in the review envelope.

Failed browser attempts are retained, not hidden. They identified and led to fixes
for private quarantine access, a missing function grant, a UNION ordering error,
read-state locking, missing accessible instructions, two harness URL/draft
expectations, and one run missing explicit bundled Playwright paths. Two system-Chrome
zoom attempts failed only because that browser's extension service worker did not
respond; the matching Playwright Chromium run performed genuine 200% browser zoom.
A late audit gate also found two option-list raw SQL calls missing from the frozen
inventory; they were removed in favour of ordinary Prisma reads and the full audit
self-test then passed.

## Owner preservation and limits

At the final 16 September observation the owner PostgreSQL 17.11 cluster remained
`7676117521894273062`, at exactly 70 completed migrations and zero unfinished
migrations; all 141 owner checks passed. The accepted application process remained
PID 67728, listening only on `127.0.0.1:3000`, with build
`Cl3PZ1Ejw8O-lhYlVMAJP`. The task did not apply migration 71, replace that build,
alter owner accounts/sessions/credentials/logos/evidence, use a safety override, or
touch an unrelated service.

No OS screen-reader speech test was run. Accessibility evidence covers semantic
inspection, keyboard/focus behavior, automated violations, RTL, narrow layout and
browser zoom in the isolated production build. No claim is made about activation,
production acceptance, publication, Task 4.7a or Task 4.8.

## Review stop

The external review directory contains the exact binary patch, every changed
preimage/postimage, complete blob inventory, raw Git identities, final and failed
evidence, original mandate/contract identities, standalone verifier and a
non-circular receipt. Stop here for independent combined implementation review.
