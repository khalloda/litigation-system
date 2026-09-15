# Task 4.4 Phase 3 — independent candidate review

Date: 15 September 2026. Reviewer: this ChatGPT review task, independently of the Windows implementer. No subagents were used.

**VERDICT: PASS — safe to proceed to owner acceptance of this candidate.**

**MUST FIX: 0. SHOULD FIX: 0. MINOR: 0.** No actionable defect was found in the reviewed change. The evidence limitations below remain explicit; PASS does not claim that the reviewer reran Windows, PostgreSQL or production-browser tests.

This is an independent review, not owner acceptance, activation or publication. Overall Task 4.4 remains unchecked. The candidate remains local according to the supplied dated Git receipt. No actual migration 69, accepted-app replacement, push or later task was performed here.

## Exact candidate and authority

| Item | Independently verified identity |
|---|---|
| Commit | `2966570c368ef484b4d32c77d5bd4c971c19ff4f` |
| Sole parent | `f05787471812c8fb2bd03d31bc44614dad81a8d2` |
| Tree | `ce80f945e139e421f9261849d387ecdb1e2ffcbc` |
| Parent tree | `d495be1e4acfc020c5e4e410a4025ff389f29c6f` |
| Source scope | 45 changed paths; +3,894/−116; 649 parent files and 666 candidate files |
| Original prompt | 33,172 bytes; SHA-256 `60b6fee575e0700e9504f2ace135bc0d177dc066513b687b7ed79cb7a5a6f20a` |
| Original direct authorization | 1,160 bytes; SHA-256 `779413133b5cb5766384e4c475f00b5cb2feda67618cfc0ed76fb0cbe9f5442b` |

The review used the original Phase 3 prompt, accompanying authorization and D63 contract, the submitted implementation report/matrix, the raw patch/source, prior accepted source at f057874, project authorities and delivered evidence. The original prompt and authorization within the delivery match the prepared originals. All ten D63 clauses are reproduced exactly in the appended decision. The prior Phase 2 combined PASS review is imported verbatim: 17,660 bytes, SHA-256 `90bedd180ee99c2f43265337fc9b535cefb3230f2673f32ffae890632c18246d`.

The editor panel's 43-file/+2,131/−331 display is not the committed diff. Raw Git objects and the committed patch establish the authoritative 45-file/+3,894/−116 result.

The implementer's report/transcript attributes use of the current GPT-6 model to an owner-approved substitution when the recommended Sol setting could not be selected. Model selection and that separate Desktop exchange were not independently observable here. This is not represented as proof that Sol/High was selected.

## Independently performed here

The reviewer authored and executed separate archive, Git-identity, source-binding and offline-function checks. The supplied verification script was not used as the basis for accepting its own claims.

1. **Archive integrity:** independently reopened all 5,692 members; verified exact membership against the external manifest, uniqueness including case-folded names, safe regular paths, absence of traversal/symlinks/directories, CRC, length and SHA-256. Verified the ZIP, manifest and standalone verification file against the separate delivery receipt. ZIP integrity is verified, not pending.
2. **Git identity and complete source:** rehashed both raw commit objects and recursively parsed/rehashed their raw Git trees. Verified full path/mode/blob inventories; all 649 parent blobs against the previously reconstructed accepted base; all 45 changed postimages and 28 changed preimages. Reconstructed and verified all 666 candidate files. Applied the patch backward to recover every parent byte and forward to recover every candidate byte, with Git line-ending handling controlled. Independently counted the real diff statistics.
3. **Frozen authorities:** all 68 historical migration SQL files, migration lock and both governance files are unchanged. D1–D62 remain an exact prefix. All 86 existing TASKS checkbox lines are unchanged, including unchecked Task 4.4. There is one new forward migration, and the prior imported review remains exact.
4. **Executed-source attribution:** verified 5,150 retained code-file bindings across attempts 4–13, 515 files per attempt. Executed bytes, recorded sizes/SHA-256 values, Git clean-filter blob identities and candidate identities agree with each run's disclosed differences. This count is artifact bindings, not application tests.
5. **Final build attribution:** verified 174 final browser-build source bindings and the final browser test-source manifest against the retained executed-source manifest. The recorded build is `EH1eg83UXbG5N8ZD8Yh7I`; its source-manifest hash matches. Attempt 13 and canonical attempt 10 have identical before/after source manifests. Generated/output/dependency inventories are supplied metadata, not a locally reproduced build.
6. **Offline source behavior:** executed exact TypeScript pure functions using Node 24.19.0's transformation support and inert external imports. Passed 270 navigation round trips, 13 invalid-navigation refusals, four valid lifecycle payloads, 56 invalid-payload refusals, and 32 administrative-work permission decisions. Checked the eight new lifecycle inventory entries within the 96-entry inventory, and SQL construction for current/archived/all predicates and both normalized ID branches. These checks do not execute SQL, authenticate real accounts, render React or replace the Windows suites.
7. **Evidence consistency:** inspected final test logs and their producers; matched all 12 non-Administrator captured-action refusals to the server's explicit AuthorizationError/403 digests, rather than treating arbitrary HTTP 500 responses as successful denials. Confirmed the distinct canonical/full-state totals and the disclosed static-check recovery.
8. **Visual inspection:** inspected the supplied final step-restore confirmation, archived-work mobile320 detail and stale-confirmation screenshots. They show preserved multiline identifying text, distinct work/step archival notices, visible counts, mobile flow and deliberate stale recovery. These are saved-image observations, not a new browser session or full accessibility audit.

The initial offline reviewer helper used Node's strip-only mode, which does not support TypeScript parameter properties in the existing error class. Changing only the review helper to transformation mode resolved that tool limitation; the candidate was unchanged. No application failure is inferred from that initial helper error.

## Source assessment against D63

| Contract concern | Review conclusion and source |
|---|---|
| Administrator-only lifecycle; four-role reads | Four guarded pages and four guarded actions use literal archive/restore permissions. `src/lib/admin-lifecycle.ts` performs service authorization and strict parsing. Migration 69 requires current Administrator source-account/session/role and trusted audit actor before mutation or receipt reuse. Read queries independently recheck account state. Existing permission policy remains unchanged. |
| Independent work/step state | Both new columns default false. The lifecycle gateway changes only the selected subject's archive state, with the required shared work-version bookkeeping. It does not cascade flags to siblings, works, matters or clients. Restoring a work retains separately archived steps. |
| Parent restrictions | New work transitions and ordinary edits require an unarchived linked matter. Step creation/editing/transitions require both an unarchived work and linked matter. NULL matter is allowed; archived client state does not block an otherwise eligible matter. These checks exist in committing gateways and trigger protection, not just UI controls. |
| Current/archived/all visibility | `admin-work-query.ts` uses independent work and step archive filters, retains direct archived work reads, computes distinct total/current/archived/visible counts and clamps pagination. `adminDetailHref` and existing/new management pages preserve the added filter context. The linked matter path explicitly requests `archive=all`. |
| Historical content and ordering | Lifecycle trigger checks reject business/provenance/parent/order changes. Existing source/current labels remain separate; a cleared current reference is not replaced by raw imported text. Hidden `nextAppointment` remains unchanged. Native append calculation includes archived rows and existing maximum order. Imported ordering is unchanged. |
| Reports and related totals | Report-service sources and inclusion criteria are unchanged. The changed matter link exposes archived records without redefining related counts. The supplied proof compares six nonempty report datasets and a nonempty linked matter before/after archival. It preserves historical report inclusion; it does not add a new native-record reporting feature. |
| Confirmation and stale state | `admin-lifecycle.tsx` identifies the subject and context, displays retention/count explanations, focuses Cancel in the dialog and offers a deliberate reload on stale confirmation. The database compares exact facts and shared version before a new transition. Successful acknowledgement loads current detail rather than displaying an old receipt as current state. |
| Shared history and audit | Migration 69 preserves old history/receipt JSON and records a private immutable pre-69 boundary. Missing archive fields are normalized only in the defined historical partition. New snapshots retain archive fields; current-state validation checks version, subject, actor, owned receipt and correct semantic archive/restore audit. Step bookkeeping does not masquerade as archiving the work. |
| No-op, retry and concurrency | New and existing gateways share the submission-token namespace and mutex. Authentication precedes receipt reuse; exact prior owned receipts return without replaying writes. Fresh no-ops require current version/facts and precede audit/history/receipt creation. Parent/work/step locking and rechecks protect concurrent mutations; submitted proof uses observable lock barriers. |
| Upgrade and permanent checks | Only migration 69 is added. Checkpoint/audit/schema inventories recognize the precise reviewed additions and replacements. Permanent checks validate current history and frozen prior partitions, not only counts. Both restored full-state and edited/native-68 upgrade controls are supplied. |

The most important practical behavior is preserved: if an Administrator archives one step, then its work, restoring the work leaves that particular step archived. Restoring the step later retains its original position. Other roles retain their existing read/edit eligibility but gain no archive/restore authority.

## Reported Windows execution, independently bound to source

These are the implementer's supplied execution results. The reviewer checked their bytes, source bindings, producers and consistency; the reviewer did not rerun these databases or browsers.

| Evidence | Reported result and attribution |
|---|---|
| `browser-attempt13` | Completed edited/native-68 upgrade, final production-browser run, 15 setup checks, 135 pre-69 checks, 137 post-69/final checks, 448 static permission decisions, frozen source and cleanup. |
| `final-attempt12/lifecycle-results.json` | Twelve completed backend groups, including seven held-mutex overlaps plus two parent-matter row-lock overlaps, and 13 rolled-back corruption cases. The later browser synchronization assertion failed; the whole attempt is not labelled PASS. |
| `canonical-attempt10` | Completed controlled clean chain, 15 setup checks, 117 pre-69 and 119 post-69 checks, late rollback, preservation, 448 static permission decisions and cleanup. The canonical total is correctly distinct from the real-volume full-state total. |
| `full-attempt7` reused groups | Twelve-candidate/four-role normalized ID search, seven D62 mutation groups and 12 D62 adversarial cases completed before a separate lifecycle-harness failure. Reuse is bounded to those completed groups and their unchanged behavior dependencies. |
| Old 68 data/history | Native work, native step and imported work edit created through the existing 68 gateway before upgrade; all three prior receipts retained/replayed. Four subsequent lifecycle transitions advance the upgraded native aggregate by four, preserve its old receipts and restore both flags. |
| Browser transport refusals | Twelve captured lifecycle requests from the other three roles refused. RSC HTTP 500 cases are tied to explicit server AuthorizationError/403 digests. An unowned-step not-found case uses exact not-found content plus absent confirmation and unchanged state because Next streamed HTTP 200. |
| Required static gates | `npm run check` passed preceding gates but exited 1 at the final encoding check for a scratch PowerShell helper without BOM. The affected encoding gate then passed after the helper-only correction. Original exit-1 log is retained; no single all-green full command is claimed. |

Attempt 13 has zero retained code differences from the committed candidate. Attempt 12 differs only in the subsequently corrected browser test. Canonical attempt 10 differs in three lifecycle test/runner files, not application/migration code. Attempt 7 additionally predates the stricter lifecycle structural checker; final checks cover that later checker. Documentation status updates occurred after execution and are separately identifiable; they do not invalidate the unchanged tested runtime inputs.

The 448 decisions are the existing static policy matrix and accompanying static/negative checks. The unchanged full user-management database fixture suite was explicitly not rerun. The new lifecycle authority checks supply focused source-account refusal evidence; the two claims must not be merged.

## Preservation, freshness and limitations

The supplied owner receipt covers **06:12:57.505–08:32:27.431 UTC on 15 September 2026**, claims forced-read-only equality across 123 complete table/catalog snapshots and 48 complete sequence states, and includes accounts/passwords/sessions in private equality. It records owner cluster `7676117521894273062`, 68 completed migrations, one historical rollback, zero unfinished migrations and no migration 69. The private underlying owner snapshots were deliberately not supplied; their equality was not recomputed here.

The same receipt reports 1,442 protected-file hashes covering configuration/governance, the current accepted build excluding node_modules, 54 logos and all files under the chosen migration63 backup root. This is not an exhaustive hash of every previous artifact directory or all installed dependency bytes. Original handoff/evidence preservation is separately bound. No raw credentials, login sessions, owner dump or logo contents were requested for this review.

The accepted-process receipt at **08:33:36.0813223 UTC** reports the accepted source-90bfc66 artifact at loopback port 3000, build `schZeUhP0RGWF_DHI827w`, PID 84980 with its creation identity. The final cleanup receipt reports all 13 recorded fixture resource sets absent and the owner container present. The candidate build and migration 69 ran on owned disposable copies according to these supplied receipts. This review did not inspect the live Windows host or independently observe process/database preservation.

The supplied narrow fetch completed **08:34:51.0508844 UTC**. Final delivery at **08:44:06.656180 UTC** records clean local main, one ahead/zero behind cached origin/main and nothing pushed. No fresh GitHub or Windows checkout observation was made here; this is a dated supplied state, not continuous remote monitoring.

Attempts 1–3 lack full executed-source manifests and per-attempt owner-after receipts. They are retained as failed-attempt history and contribute no successful candidate proof. Attempt 8's browser-source drift is disclosed and is not reused as a frozen final browser PASS. Later final source-bound evidence resolves the candidate behavior; missing early records cannot be reconstructed retrospectively.

A genuine failed D62 insert reserved a fixture sequence value in attempt 7. That reservation was measured and not rewound. Dump restoration's portable sequence values are distinguished from PostgreSQL WAL reservation state; later no-op/rollback comparisons include complete sequence vectors. This does not claim that every failed insert is a true no-op.

No operating-system screen-reader speech was tested, as excluded by the owner. Saved screenshots and automated browser checks support a bounded visual/keyboard assessment, not full accessibility conformance. No live rendering, generated-build reproduction, dependency installation, complete SQL execution or fresh owner authenticated smoke test occurred in this review environment.

## Artifact identities and next boundary

| Supplied artifact | Bytes | SHA-256 |
|---|---:|---|
| `task44-phase3-review-2966570.zip` | 20,486,599 | `a7bfbf30cc544c696075765cd9c2692d78548e3adbbaa1e6666c5a1baf25016c` |
| `task44-phase3-review-2966570-manifest.json` | 1,359,663 | `f0b4976ea6d3dc16955d0de395b2c80905fa032d17d618bfa31dfec4466c1551` |
| `task44-phase3-review-2966570-verification.json` | 706 | `9f7da55a9d2266c2b0a8531dc24f2a68ed5fa6ae2c4356eead74f46925edaf1c` |

Reviewer attachments contain this report, independently authored scripts/results, selected exact candidate source and the input receipts/manifests. They complement the original 5,692-member delivery and pinned parent; they do not replace the implementation package.

**Recommended next step:** owner acceptance of this reviewed Phase 3 candidate, followed by a separately scoped acceptance/local migration-and-activation/publication mandate if requested. That later task must establish fresh owner/remote boundaries, prepare a current recovery point, use the reviewed migration/build, verify authenticated behavior and preserve records/accounts/logos/history. No such operation is authorized or performed by this review itself. Overall Task 4.4 remains unchecked at this stop.
