# Tasks 4.6–4.7 — independent R4/R6 correction review

Date: 17 September 2026. Reviewed here without subagents, implementation, owner database access, activation or publication.

**Verdict: PASS for the corrected implementation, with the evidence qualifications below. T4647-R4 and T4647-R6 close.** R1, R2, R3 and R5 remain closed from the preceding independent review. No further blocking defect was identified in this bounded correction. This recommends the candidate for owner acceptance; it does not record an actual migration, activation, publication or completed operational acceptance.

**No delivery file is missing.** All seven requested attachments are present and the six artifacts bound by the separate final receipt match their sizes and SHA-256 values. The two unavailable original historical records remain disclosed limitations, not files Khaled should keep trying to upload.

| Identity | Independently verified value |
|---|---|
| Correction | `3f0c6c6fc7d41296c8b55f7454cc9c82ec6fcdfb` |
| Sole parent | `0623d7cefebc5f3da1ee947c6f28dfc03b54dab0` |
| Correction tree | `792533500482d9e5459d57b9fb1fac593f594f02` |
| Parent tree | `95a976a3fa44ab4daed0cedfc719b3e591386b00` |
| Actual Git change | Six tracked paths, +991/−32; two new files |
| Correction ZIP | 6,465,414 bytes; 138 members |
| ZIP SHA-256 | `b6b19c2c1f2786f7b712e38f977308bf07054f7d78f2b02df84d50c379c132e5` |
| Manifest SHA-256 | `589360ca376ce400abf8799b968324796c4f9b4117fc5a6a434cc9ef7f398c20` |

The governing inputs were the original combined implementation mandate and D65/D66, the six-finding review, the independent review of `0623d7c`, and the adopted `tasks46-47-remaining-corrections-prompt.md`. The earlier candidate and correction remain preserved.

**R4 — permanent semantic validation: closed.**

The migration now defines `_migration.tasks46_47_submission_correspondence_valid()`. It traverses all three local receipt tables, all three change tables and the global ownership table. It rejects missing correspondence in either direction and validates gateway, submission, actor, entity, result version and payload. `scripts/lib/tasks46-47-checkpoint.ts` calls it on every complete boundary check. A global-only orphan is no longer reachable solely through an installation-time postcondition.

`_migration.matter_fee_reference_current_valid()` now checks the complete set/clear/replace transition. It validates reference-array shape, matter identity, unique row and fee identities, active counts, old/new selections, expected cardinality, retirement/reactivation, immutable fields and the relevant actor-managed fields. Unrelated rows must be present unchanged in both directions, using NULL-safe `IS DISTINCT FROM` conditions. Clearing must retain the old row; changing both recorded history and live rows cannot bypass that requirement merely by making their final aggregates agree.

The new permanent tests separately assert the semantic validator rejects the fault, then invoke the full checker after restoring the intended trigger state. They cover a global-only orphan, the nine global/local/history omissions across the three gateways, and set/replace provenance or clear-row loss. Rollbacks restore the legitimate state. Existing authorization, exact-retry, lifecycle and observed-lock tests remain in the historical runner. Source inspection found no weakening of direct-write, private-helper or sequence restrictions.

Coverage precision: the added reverse fault fixtures use native/reactivated references. They do not constitute a separate privileged corruption test for every imported/unrelated-row permutation. The imported and unrelated-row transition clauses were reviewed in source, alongside the retained historical checks. This is a non-blocking test-coverage qualification, not a claim that those extra injections were executed. The Windows pre-fix reproduction is supplied execution evidence, not a PostgreSQL reproduction performed by this reviewer.

**R6 — preservation, oracle and source-bound proof: closed within the new evidence window.**

The new owner capture discovers all non-system schemas/tables, records complete sequence definitions and state, and operates under a read-only repeatable transaction. I independently compared the supplied before/after records and recomputed their aggregate digest. They match across:

- 128 tables: 53 `public`, 35 `_migration`, 20 `staging`, 20 `quarantine`;
- all 48 sequence definitions and `last_value`, `log_cnt`, `is_called` values;
- the migration ledger, nine catalog groups, account aggregate and logo aggregate.

There are 70 completed migrations plus one established rolled-back ledger row. That is not migration 71 on the owner. Sixty-nine completed checksums match canonical source directly; migration 0033 matches canonical bytes plus one terminal LF, the already documented historical exception. The correction changes none of migrations 1–70.

The database pair covers **17 September 06:07:56.497–07:05:11.808 UTC**. The protected-resource pair covers **06:09:12.9750868–07:06:09.4917900 UTC**. It inventories 4,173 files: 1,939 accepted-artifact files, 54 logos, 59 recovery files, 2,072 accepted Task 4.5 evidence files, 13 original Tasks 4.6–4.7 evidence files, 21 preceding-correction files, nine protected configuration files and six review inputs. All **4,171 hashed static files** match, as do recorded root ACLs and runtime identity. The remaining two files are explicitly metadata-only locked runtime logs; their unreadable contents are not verified. The scope is the named roots, not every file on the computer.

Writer/listener records likewise match at 06:10:30.8399229 and 07:07:57.1427808 UTC. The supplied records support accepted build `WvgH-6nuin9o1QPJrPst4`, PID 67728 and its unchanged process creation identity. They are dated observations, not current health checks or continuous monitoring by this reviewer.

The expanded oracle independently derives expected rows from raw SQL data and checks complete IDs/order, totals, page counts and final-page clamping for all four roles. Its 27 cases per module include combined filters, Latin/Arabic-Indic/Persian internal and legacy identifiers, partial/suffixed/leading-zero controls, Arabic normalization, literal `%`/`_`, missing/present values and both relationship directions. The native functional/browser flows supplement the historical population; the oracle count alone must not be described as every possible native or relationship permutation.

The historical runner captures the migration boundary before fixture setup. I independently compared its records: 128→138 tables; ten exact new private tables; 122 existing table records unchanged; six permitted existing-table changes; unchanged business row counts; seven audit-field additions; one ledger addition; equal 48 complete sequence vectors and sequence-definition digest. The reviewed migration captures old rows before adding operational columns, and its permanent replay checks protect their content. Private row bodies are not supplied, so this is verification of receipts and implementation, not a separate database extraction.

**What was independently verified here.**

- All 138 outer members: exact membership, safe unique paths, no symlinks, readable CRCs, sizes and SHA-256 values. The three embedded input ZIPs also match their external manifests: 94, 885 and 42 members respectively.
- The raw commit and both recursive Git trees, all changed pre/postimage blobs, the exact uploaded patch, and complete supplied-source reconstruction: **762→764→762→764 bodies**. The two unchanged D59 files, `.env.example` and `docker-compose.yml`, remain opaque and are bound by unchanged Git identities.
- The candidate has 766 path identities and 760 unchanged existing paths. Migrations 1–70, D65/D66, TASKS.md and all 86 checkbox lines remain unchanged. The editor stream's nine-file count includes scratch helpers and is not the six-path committed diff.
- All **231 final application-build inputs** match exactly. All changed executable/migration/test inputs match. The final historical inventory has 713/722 exact byte matches, three line-ending equivalents and six previously disclosed old Markdown mismatches. The browser-test inventory has 303/305 exact matches plus two legacy PowerShell line-ending equivalents. No whole-working-tree byte-match claim is made.
- The decisive final historical run is `historical-final-attempt3`; the final formatted-source browser run is `browser-final-attempt4`, build **`AG2_dvvRnodLEkmSZtVYh`**. Earlier failed/setup and pre-format attempts remain distinguishable. The report's narrative ends with the third browser attempt; the fourth run's source bindings identify the final evidence actually relied on here.
- Two supplied final browser screenshots were inspected. They are limited visual evidence, not an accessibility certification or a fresh native-browser execution.

**Windows results inspected, not independently rerun here.**

| Supplied run | Recorded result |
|---|---|
| Final historical migration/invariants | 147 checks passed; deploy, functional and invariant commands have zero exits |
| Canonical replay/invariants | 129 checks passed |
| Expanded four-role oracle | 27 document + 27 fee-letter cases per role; 412 documents, 334 fee letters, 627 relationships |
| Functional/concurrency/fault suite | PASS messages and final executed source inspected |
| Production browser | 24 named evidence entries, no recorded layout violations; this is not an assertion count |
| Full project gate | Supplied type/lint/format/RTL/authorization/audit/guard/ignore/encoding output reaches successful completion |
| Owner read-only invariant run | 141 checks passed |

No PostgreSQL, Windows owner application or authenticated owner session was operated on in this review. Prior R1/R2/R3/R5 source and their independent review remain valid because their implementation is unchanged. Previously executed mock diagnostics and earlier test counts are reused evidence, not new runs.

**Permanent historical qualifications.** The original Tasks 4.6–4.7 owner before/after pair never existed. The original executed-source body with SHA-256 `66992ab0eff4144b4586d5321ecfd2649f6630e41dee591b8ac4733b4d186a87` was not preserved. The new complete pair establishes its own later window only. The original runtime attribution remains corrected: `Cl3PZ1Ejw8O-lhYlVMAJP` was the development workspace build. The original 483-byte verification result was already recovered and independently verified in the preceding review.

**Next step.** No more correction uploads are required. The corrected candidate is ready for Khaled's acceptance and the separately authorized operational round: fresh checkpoint and writer verification, protected backup and restore rehearsal, actual migration 71, activation of the reviewed build, bounded owner-session observation, acceptance documentation and ordinary publication of the verified chain. Recheck actual owner state at that time. Tasks 4.6/4.7 remain unchecked in this candidate; Task 4.7a/4.8 and deployment work have not begun. This review itself performs and authorizes none of those operations.
