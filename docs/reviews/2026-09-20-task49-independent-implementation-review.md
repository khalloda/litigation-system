# Task 4.9 — independent implementation review

20 September 2026. **CHANGES REQUIRED. Task 4.9 is not accepted.**

Candidate `fe4452d90c9b046097effcf874540c1737e8d002`, tree `f5820e6852222c18867edc17772184482ff6de41`, is the sole child of approved base `ba360643937fd0af9d11b12b7f18f8ddec093aac`. Package integrity passes. Two implementation defects and one required browser-coverage gap remain. Keep actual owner migration/provisioning, activation/restart, acceptance closure, publication and Stage 5 gated.

This is the independent review requested after implementation, in the same ChatGPT conversation. The review does not reopen closed Task 4.8 or authorize a new Desktop task. Codex continues in the SAME existing Desktop task, Local Windows at `D:\Projects\litigation-system`, without subagents.

## Authority and scope

The adopted implementation mandate is `task49-audit-history-implementation-prompt.md`, SHA-256 `68b2c78e21edc343e9335d77e4b9189a8d7d9b84b6cdbb4328edd0f7e82cd43e`. The repository authority order and unchanged governance remain binding. The complete Administrator global/contextual audit viewer and separate persisted account capability for Excel/PDF export remain in scope. These findings do not reduce that scope to a viewer-only delivery or defer export to another task.

The inspected material includes the five-file delivery, candidate report/matrix, substantive attempt record, pasted implementation commentary, relevant old audit writers and migration authorities, all new runtime audit modules, new migration and permanent check changes, account/permission changes, contextual integrations, test sources, supplied preservation/oracle records, and selected final browser/PDF evidence.

## Verification performed here

| Check | Independent result |
| --- | --- |
| ZIP identity | 46,438,168 bytes; SHA-256 `c98d230b0ddbbe2c41cd2fcfa53ef79a7ed69a35ab7048bc60025f04e7b9ff8f` |
| Membership and bodies | All 3,289 members match the separate manifest, compressed lengths, CRCs and SHA-256; exact unique safe paths and regular-file types checked before extraction |
| Companions | Receipt bindings for ZIP, manifest, standalone verifier and supplied result pass |
| Inspected verifier | Fresh successful run with `--receipt`; external receipt checked, unlike the earlier result created before that receipt |
| Git identities | Raw commits and complete trees reconstruct; 795 base / 821 candidate tracked identities; two unchanged credential-bearing bodies have identity-only coverage |
| Independent patch application | Git itself applies the supplied patch forward to all 819 shareable candidate bodies and reverses it to all 793 shareable base bodies, byte-exact |
| Change inventory | 63 Git paths, +6,160 / −51, 134 text hunks; the Desktop editor's 97-file display is not the committed diff |
| Frozen material | AGENTS.md, CLAUDE.md, TASKS.md, decisions and migrations 1–72 unchanged; all 86 checkbox lines unchanged |
| Grouping/pagination evidence | Independently recomputed 905 supplied event identities into 47 request/actor/snapshot groups and verified the exact two-page union/order |
| Associations | Compared all 35 supplied expected/actual scope sets; these are supplied fixture observations, not a new database execution |
| Final source binding | 248 runtime/package paths in each of build-06, browser-08 and check-09 bind to final candidate bodies, allowing verified LF/CRLF representation |
| Value defect | Executed the exact candidate pure TypeScript projection with Node's type stripping; independently decoded the supplied XLSX with Python XML/Base64, reproducing R2 |
| Visual evidence | Inspected final desktop/mobile browser images and freshly rendered selected pages of the actual 25-page synthetic PDF; PDF has no URI links. This is not a rerun of Windows browser interactions |

The fresh supplied-verifier result and reviewer-owned scripts/results are in the corrective handoff. The scripts do not install dependencies, connect to the owner system, execute migrations or run the application.

## T49-R1 — enforce receipt consistency from the audit-event side

**Priority P2; required before acceptance. Source-confirmed database integrity defect.**

Migration `20260920140000_audit_history_capability/migration.sql` defines `_migration.audit_export_state_valid()` to reject an `export_completed` event in the `audit_history:` namespace without its private receipt. Its three deferred consistency triggers, however, fire only on the capability, capability-change and receipt tables. No INSERT trigger is added to `public.audit_events`.

The still-authorized `public.audit_append_semantic_event_for_account(...)` gateway delegates to the existing `audit_append_semantic_event(...)`. For `export_completed`, that function requires a human actor and a nonempty resource, but it does not reserve `audit_history:` for the new completion gateway. `src/lib/audit.ts` also retains this generic writer through `recordObservedExternalEvent`.

Consequently, a caller using that existing gateway and a valid human audit context can append `export_completed` with resource `audit_history:global` and ordinary safe parameters without touching a private receipt table. No new deferred consistency trigger is queued. A later integrity check reports invalid state, and subsequent legitimate export/capability transactions run the global validator and fail. An append-only orphan must not be allowed to commit and then require repair.

This is a missing database invariant, **not a demonstrated HTTP authorization bypass or an assertion that an ordinary browser user can directly access PostgreSQL**. The residual trust boundary of the application process remains as documented. A direct PostgreSQL reproduction was not run in this review environment; the exact callable writer, INSERT path and trigger coverage were inspected. The fixture-only probe included with the handoff is to be reproduced before the fix.

PostgreSQL associates a trigger with the table and operations in its declaration; a deferred trigger on a private receipt table does not run merely because an audit row was inserted. [PostgreSQL CREATE TRIGGER documentation](https://www.postgresql.org/docs/current/sql-createtrigger.html).

There is a related namespace precision issue in the same validator: `LIKE 'audit_history:%'` treats `_` as a wildcard. Use a literal reserved-prefix check so an ordinary resource such as `auditXhistory:...` is not incorrectly classified as an audit-history receipt event. [PostgreSQL pattern-matching documentation](https://www.postgresql.org/docs/current/functions-matching.html).

Required correction and proof:

- Enforce the reserved completion/receipt relationship at transaction completion from both sides, or use an equally complete constrained design. Prevent generic callers from committing an orphan. Keep unrelated report/export audit actions supported.
- Cover capability grant/revoke semantic events as well as export receipts in the exact declared invariant; keep initial provisioning and legitimate transitions atomic.
- Extend the exact permanent catalog/trigger/function checks and negative cases. An on-demand validator detecting corruption after commit is insufficient.
- On a disposable copy, reproduce the existing writer path, force deferred checks, and prove the corrected refusal rolls back event/counter/receipt state. Also prove legitimate export, concurrency/idempotency, initial grant/revoke, and unrelated resources still pass.
- Do not edit migrations 1–72, delete an audit event, or weaken the new validator to accept an orphan. The unaccepted migration 73 may be revised in a corrective child and tested from fresh migration-72 copies; retain the originally tested variant as evidence.

Primary source locations: candidate migration lines 307–352; existing migration `20260903160000_secure_user_account_lifecycle/migration.sql`, semantic writer; `20260903100000_close_task33b_review_gaps/migration.sql`, account semantic gateway and runtime grant; `20260912210000_matter_archive_restore/migration.sql`, current INSERT writer. All are preserved in the supplied source.

## T49-R2 — preserve original values independently of display labels

**Priority P2; required before acceptance. Reproduced in candidate code and delivered XLSX.**

`auditValue()` replaces an empty string with `نص فارغ مسجل`, booleans with translated labels, and null/redacted/truncated values with explanatory text. Those are presentation choices. `generateAuditExcel()` then passes this already formatted text into `add()`, which writes it into both the visible column and the column labelled “original UTF-8 / Base64.” The original representation is therefore lost in that column.

The delivered `exports-03/proof/synthetic-edge.xlsx` demonstrates the defect:

| Sheet 2 row | Original fixture value | Type column | Decoded “original” Base64 |
| --- | --- | --- | --- |
| 29 | Empty description string `""` | `string` | `نص فارغ مسجل` |
| 30 | Redaction object `{"$redacted":true}` | `object` | Arabic explanation followed by the JSON |
| 31 | `null` | `null` | Arabic NULL explanation |
| 37 | Boolean `false` | `boolean` | `لا (false)` |

More seriously, two distinct recorded strings—`""` and the literal text `"نص فارغ مسجل"`—produce identical type, visible text and Base64 fields. The exact candidate projection reproduces this collision. The shared viewer/PDF presentation also cannot tell that literal string from the empty-state label. This is an evidence distinction required by the mandate, not a request to change Arabic wording for its own sake.

The supplied test does check the long malicious string and exact decimal. It constructs empty/null/false/redacted cases but does not assert their original-value round trip, allowing the defect to pass.

Required correction and proof:

- Separate raw typed evidence from display text. Encode the actual original value text or a documented lossless typed envelope; preserve explicit absence separately. Chunk the raw representation and display safely without using translated labels as original bytes.
- Give UI/PDF special states unambiguous presentation distinct from literal recorded strings, including empty/whitespace-only values. Do not make a literal marker-looking string appear redacted or absent.
- Independently decode the saved XLSX for absent, null, empty, literal marker text, whitespace/newlines/control characters, false, zero, exact decimal/bigint, object/array and redacted/truncated cases. Compare each against independently specified typed input; do not use `auditValue()` to generate expected output.
- Verify both export formats and the affected drawer/global rendering with an empty-string/literal-label collision fixture. Keep formula safety, Unicode, exact timestamps and large-value bounds.

Primary source locations: `src/lib/audit-history-projection.ts`, `auditValue`; `src/lib/audit-history-export.ts`, `add` and the before/after loop; `scripts/test-audit-history-exports.ts`, synthetic renderer checks. Reviewer files: `value-collision.json`, `reproduce-value-collision.mjs`, `recomputed-evidence.json`, `recompute-review-evidence.py`.

## T49-R3 — cover the required child entry points in the browser proof

**Priority P2; required acceptance evidence missing. This does not assert the untested buttons are broken.**

`test-audit-history-browser.mjs` chooses the first row of each parent table and clicks whichever history buttons happen to occur there. It does not assert coverage against the required entity-to-surface inventory. The final mapping contains 16 table families and omits these seven child families, although the same delivered fixture evidence records their presence:

| Missing family | Retained rows | Example supplied child → parent identity; reverify in the new copy |
| --- | ---: | --- |
| contacts | 188 | contact 5 → client 29 |
| matter_lawyers | 968 | relationship 1860 → matter 5091 |
| hearing_attendees | 9,113 | attendee 26653 → hearing 39168 |
| task_actions | 3,483 | step 2324 → administrative work 4 |
| power_of_attorney_lawyers | 87 | relationship 10 → POA 242 |
| fee_letter_matters | 231 | covered link 1 → fee letter 2 / matter 2190 |
| invoice_allocations | 47 | allocation 8 → invoice 310 |

Source SQL association tests are useful but do not prove the browser entry opens the correct drawer, uses the actual child ID, or preserves its parent navigation and focus. In particular, testing a matter-side fee-letter reference does not cover the distinct covered-matter entry.

Required correction and proof:

- Select existing parents that actually contain each required child; use safe fixture setup only where needed. Assert the complete required surface set, with explicit reasons only for families intentionally global-only under the mandate.
- Exercise each missing entry from its actual screen/section, including the contact detail path, exact table/child ID, expected scoped identities/empty result, close/Escape and focus return. Cover archived/retired relationship access where those sections exist.
- Preserve both fee-letter directions as separate cases. Use representative desktop proof and the existing shared mobile/zoom/keyboard suite; exhaustive clicking of all thousands of records is unnecessary.
- Correct the matrix/report's full-coverage claim and retain the old partial result as such. Return the new exact mapping and source-bound browser evidence.

Primary evidence: `browser-08/proof/record-entry-mapping.json`, `boundary-02/proof/all-family-association-oracle.json`, and browser source around its `ORDER BY id LIMIT 1` route selection.

## Evidence credit and limits

The supplied Windows gates are substantial: build/check, 480 permission decisions, 148 historical database checks, 130 canonical checks, authentication/account regressions, full-data reader and association tests, race/refusal tests, actual HTTP exports, and browser keyboard/RTL/320px/200% zoom evidence. Their presence and final runtime source bindings were reviewed. They remain **supplied Windows results**, not tests rerun here. The source-confirmed defects above explain why passing those gates is insufficient for acceptance.

The owner before/after observations compare exactly for 138 tables, 48 full sequence states, 15 catalog groups, 880 prior audit events and 73 ledger rows. The file comparison preserves 47,745 prior files and eight junctions, and separately identifies 21 new Task 4.9 canonical-evidence files. Runtime observations retain the accepted app PID/build/container. These are artifact-based preservation conclusions, not a live observation of Windows or GitHub. The database after-capture finished at 14:29:24 UTC; final browser proof was later, and the runtime check finished at 14:38:06 UTC. Reobserve at the end of the corrective run rather than treating this as a continuous guarantee.

Earlier migration, canonical, browser, runner and cleanup-equality failures are retained and explained. The explicit foundation-checkpoint audit regression is not falsely treated as a migration-73 rerun. Missing intermediate runtime bodies are disclosed; do not reconstruct or invent them. The final corrected work must retain its own exact executed sources before each meaningful attempt.

Private dumps, credential-bearing files, session material and full privileged global exports remain excluded. The two unchanged credential source bodies have Git identity coverage only. The private global PDF's 75-event content comparison is supplied decoder evidence; only shared synthetic PDF bodies were independently rendered here. Actual screen-reader speech remains outside the authorized scope.

## Disposition

Return to Codex for T49-R1–R3 in the SAME existing task. Recommended **GPT-5.6 Sol / High**, **Local Windows**, **no subagents**. Expected usage is moderate, with isolated database and browser proof the main cost; reuse unchanged evidence and dependencies. This is a recommendation, not an observed selector setting.

The prepared corrective prompt authorizes one focused corrective child **only when Khaled sends/adopts it**. Preserve `fe4452d` and its complete delivery; no amend, rebase, reset or overwrite. Return a new complete five-file review delivery and stop for another independent review. Actual owner migration/provisioning, activation, acceptance checkbox closure, push and Stage 5 remain unauthorized. Task 4.8 remains closed.
