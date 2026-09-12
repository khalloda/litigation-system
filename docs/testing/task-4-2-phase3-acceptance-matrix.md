# Task 4.2 Phase 3 initial acceptance matrix

Created before application edits, tests or database execution, 12 September 2026.
Parent: 6771218164c992781902374efb62f0b2f54b2a20. Fetched origin/main: d84aa4b916e41e15abf543fc7dd2d4155bea7acf; clean main 4 ahead / 0 behind.

| Proof | Planned evidence | State |
|---|---|---|
| Preservation | One forced-read-only source/catalog/full-sequence/logo capture and one protected/runtime inventory, compared finally | Pending |
| Frozen source/review | All 64 migrations; supplied review and four final correction artifacts | Pending |
| Migration 65 | Historical 63 -> frozen64 -> 65; canonical checkpoint; rollback and exact delta | Pending |
| Lifecycle/security | Native/imported archive/restore, four roles, session/account denial, direct write denial, atomic audit/history/receipt | Pending |
| Concurrency/retry | Exact retry, changed payload, no-op/stale, lost response, audit rollback, actual edit/archive and archive/restore overlap, account race | Pending |
| Data/report retention | Exact business/related rows/order/retired associations and nonempty report contents/totals; independent client state | Pending |
| Browser | Production isolated mirror; confirmation/cancel/stale/error/retry, filters/context/empty page, four roles/read-only/restore edit | Pending |
| Accessibility | Keyboard/focus/labels/status, RTL/multiline, 320px, genuine 200% zoom, axe and screenshot inspection | Pending |
| Regression/reuse | R1/R2 when shared gateway changes; byte-identical R3 reuse plus post-restore no-op; checkpoint-specific static/permission/invariants | Pending |
| Delivery | Phase2 acceptance, D58/docs, final matrix/report, one commit, verified patch/ZIP/manifest/receipt, owned cleanup | Pending |

All mutation tests target positively identified owned disposable clusters. Real database remains at 63; owner runtime and prior evidence preserved. No speech actions, deployment, push, subagents or later tasks. Future child selectors/report screens retain D58 integration obligations.


## Final outcome — 13 September 2026

The initial table above is preserved unchanged as planning evidence. The
following records actual results, not retroactive changes to that table.

| Proof | Actual evidence | Final state |
|---|---|---|
| Preservation | `source/live/protected/runtime-before/after.json`, strict `preservation-comparison.json`; real 109 tables, 48 full sequences, 54 logos, ledger63;4,007 protected/40,571 runtime entries; no normalizations | Pass; locked runtime.log exclusion retained |
| Frozen source/review | All migrations1–64 and both governance files identical to parent; supplied PASS review 9,907 bytes / SHA256 `3d7ed89346e8831a9b1280e9ccc37cbb7d0624a832910a0ae3d5e1aaeda27de5`; old package identities in preflight | Pass |
| Migration65 | `lf-migration-final`, `lf-canonical-final`: exact final LF bytes, restored63/frozen64/65, late failure rollback, exact allowed catalog/ACL/data/sequence delta, repeat deployment, pre65 native history;125/107 invariants | Pass; real migrations64/65 pending |
| Lifecycle/retention | `retention-browser-final/lifecycle-results.json`: five native/imported cases; 119-hearing matter and 70-hearing/17-work/9-step/one-fee-letter matter; exact SQL business digest, complete children/retired/order state, audit/history/version, retry/no-op/postrestore no-op | Pass; fresh |
| Roles/session/actor | `allocator-followup-2`: direct non-admin/unusable/forced-password/changed-role/revoked refusals; `browser-final`: all four roles, forged actions, direct pages; required permission matrix448 at65 | Pass; fresh |
| Races/retry/audit | Real observed blocked edit/archive, archive/restore, duplicate archive and session-revocation/expiry waits; exact final state; semantic audit failure and all sequences rollback; browser lost successful response exact retry | Pass; fresh |
| Client/reports | D52 transitions independently of matter state, assistant edits under archived client; six nonempty report projections exactly preserved (82/752/2/12,848/3,694/1,140 rows), including financial contents | Pass; fresh |
| Browser/production | `browser-final`: production build, confirmation/Cancel/Escape/success/errors/stale reload/retry; explicit current/archived/all, context links, last-row archive/empty page, readonly detail and restore editing | Pass; fresh |
| Accessibility | 19 browser result entries including eight clean scans, one genuine200% zoom contract, keyboard/focus, RTL/mixed/multiline content,320px; four representative screenshots inspected | Pass within scoped checks; speech excluded |
| Invariants | Restored current125, canonical107, forced-read-only real121; old fixture helpers stop at their requested61/62/63/64 checkpoint | Pass; distinct profiles retained |
| R1/R2 | `allocator-followup-2/correction-results.json`:11 controls, six protected-court changed/cleared refusals, unrelated edits and full D39/D40/D41 verifier | Pass; fresh at65 |
| R3 reuse | Exact accepted editor/CSS and parser-body identity in `reuse-map.json`;24 ordering cases/eight no-ops/six scans/two zoom contracts retained; fresh postrestore ordering control above | Pass; explicitly reused |
| Static gates | `static-verified.log`: complete npm run check and required rejecting self-tests; final documentation/selector checks in `final-format-encoding.log` | Pass |
| Delivery | Phase2 acceptance and exact-prefix addenda, append-only D58, this report/matrix, one local commit; patch/ZIP/manifest/receipt verified externally after commit | Local delivery; Phase3/overall4.2 owner acceptance pending |

The final product, migration and checkpoint sources are pinned per successful
run in `final-source-evidence.json`; exact executed copies accompany them.
One fixture-helper comment was repaired after execution; its TypeScript tokens
are unchanged, as recorded in `source-token-equivalence.json`.
Staged review identified candidate65 CRLF-to-LF normalization; its final LF
checksum was freshly deployed/proved on both owned profiles. The prior SQL
bytes differ only by those line endings. `postimage-bridge.json` connects
executed working bytes to the Git postimages without claiming raw-byte identity
where repository line-ending normalization applies.
The extra checksum proof required refreshed final preservation receipts;
the earlier passing after-receipts remain under `pre-lf-*`, compared against
the same original before baseline. See `final-capture-reason.json`.
The final browser run uses exact final assertion bytes. The retention proof
changed only formatting after execution. Later helper additions after the
allocator follow-up affect its skipped retention loop, not its executed
account/race/audit/client/report/R1/R2 controls. Canonical mode does not execute
the lifecycle/browser helpers. Failed attempts remain in `attempts.json` and
their original logs; a partial browser attempt is not counted as completed.

Future child selectors must omit archived new choices while retaining existing
references. Future report/export screens owe D58 inclusion proof; no Stage6 UI
or new child-mutation policy was built. No push, real migration, deployment,
owner-app operation, speech action, subagents or later task work.
