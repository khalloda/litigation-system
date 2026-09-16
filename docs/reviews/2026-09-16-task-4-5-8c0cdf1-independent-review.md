# Task 4.5 — independent implementation review

16 September 2026. **CHANGES REQUESTED: one required implementation correction (T45-R1), plus one delivery-completeness note (T45-N1).** Do not accept or activate this candidate yet. Task 4.4 stays accepted; Task 4.5 stays unchecked.

| Identity | Independently verified value |
| --- | --- |
| Candidate | `8c0cdf1d235df2e63fa450be26667e158c573923` |
| Sole parent | `e747e0efbdadb92892e933d768924e3e287e9a9a` |
| Tree | `3b02744c35eb2066a5ebf974e2fd101a5326fb58` |
| Change | 49 paths, +4,983 / −43; 670 parent paths → 700 candidate paths |
| Mandate | Original combined Task 4.5 prompt, direct authorization and exact D64 contract |

**T45-R1 — P2: distinguish invalid number/date input from intentional clearing. Required before acceptance.**

The POA editor maps `e.target.value === ''` to NULL for copies, and `e.target.value || null` for issue date. It never checks `validity.badInput`. The form also has `noValidate`, and its submit path does not validate the controls before constructing the mutation. Thus an invalid intermediate input state can become an ordinary, accepted clear operation.

Locations in `src/app/powers-of-attorney/poa-editor.tsx`: line 231 for copies; line 242 for date; lines 123–129 for disabled native form validation; lines 76–115 for serialization/submission. The server parser explicitly permits NULL at `src/lib/poa-mutation-input.ts:75`. The SQL validator likewise permits NULL for these fields in migration `20260915180000_poa_editing_lifecycle_boundary`, lines 249–257, before the normal update gateway applies the patch. That server/database behavior is correct for an intentional clear; the editor has already lost the distinction.

For example, an operator editing a recorded count of 2 can leave an unfinished numeric entry and press Save. When the browser exposes that invalid state as an empty value, the candidate sends `copies_count: null`; the stored count is treated as unknown. An incomplete date can similarly clear a previously recorded issue date. With new records, invalid input can silently become unrecorded data. The HTML specification distinguishes bad input from deliberate emptiness and requires invalid numeric values to sanitize to an empty string. Date controls also have a bad-input state. This is the browser-semantic basis of the finding, not a claim that typing was observed in this review. [HTML number and date input rules](https://html.spec.whatwg.org/multipage/input.html#number-state-(type=number)).

**Independently reproduced here:** the reviewer extracted the candidate's exact conversion expressions and submit body, then ran the exact `parsePoaForm` module after Node's built-in TypeScript transformation. A synthesized event with `value: ''` and `validity.badInput: true` produced the same serialized, accepted NULL payload as an intentional blank event, for both fields. Eight controls covered the two invalid states, the two legitimate clears, zero, the PostgreSQL maximum, a negative count and a fractional count. The latter two were correctly refused. Results and reproducible source are `proof/input-probe-result.json` and `proof/probe_input.mjs` in the review ZIP.

**Reproduction limit:** these are offline event/serialization/parser checks, not React rendering or a production-browser/SQL run. The cloud browser rejected the isolated data-URL test page under its URL policy. No alternate route was used to bypass that restriction. The Windows correction must add the real browser reproduction against the unchanged candidate before fixing it. The source and specification establish the missing validation; the exact native typing sequence and its behavior in the supported browser still require that regression proof.

Correct the editor so invalid or incomplete entries produce Arabic validation feedback, retain the draft, and cannot submit a NULL mutation. Deliberate clearing must remain supported. Avoid a solution that merely discards bad keystrokes, restores an old value without explanation, or globally changes NULL handling in the backend. D64 §§3–5 require deliberate optional clearing and valid dates/nonnegative whole counts; §11 requires preserving entered text when recovery is needed. No new business rule, schema change or historical-data cleanup is needed.

Verify both writer roles, creation and editing, invalid numeric and date states, intentional clearing, zero, positive counts, integer maximum, negative/fractional/out-of-range values and valid boundary dates. For rejected forms and Cancel/Escape, compare complete disposable database state, history, receipts, audit and sequences; for deliberate clears and valid saves, verify only the intended existing gateway changes. Preserve current/source labels and stale/retry behavior. This is a focused UI/test correction with moderate test effort, no new licence/service requirement and no expected migration change.

**T45-N1 — delivery completeness; no product-code defect alleged.**

The delivery receipt lists 26 artifacts. Twenty are available directly or as exact catalog entries. Six are not supplied: `verification-result.json`, `artifact-exclusion-first.json`, `artifact-exclusion-first-helper.py`, `artifact-exclusion-check.json`, `task45-scan-delivery.py`, and `task45-delivery-receipt.py`. The README says these post-package artifacts are outside the ZIP. Their hashes in the receipt establish expected identities, but do not supply their contents. Include the exact existing files in the correction delivery or a separate supplement, preserving the original receipt. In particular, this review cannot verify the contents of the reported final protected-value exclusion scan. This is separate from ZIP integrity, which passed independently here.

**Artifact and source checks completed independently here.**

| Check | Result |
| --- | --- |
| Submitted ZIP | 15,285,048 bytes; SHA-256 `c0f028f3308bfd3fcb51db2256d4347a6c23d75979bda359bbaca96c129cd598` |
| External manifest | 308,183 bytes; SHA-256 `6d57f2cc182a5d8290f7d29b57d3e1feee39289c87accd1739487e43595e5dee` |
| ZIP membership | All 1,280 members reopened; size, SHA-256, CRC, unique safe paths and complete membership passed |
| Deduplicated catalog | All 11,318 logical paths resolved to matching verified objects; paths checked independently |
| Exact patch | 288,757 bytes; SHA-256 `b653102e6361bc31943db5c0070d120022e02ad8a8bd7a942abef5dc0c98f7eb` |
| Git identity | Both raw commits, 172 distinct recursive tree objects and every available blob rehashed; parent inventory also matches the previously issued accepted handoff |
| Reconstruction | Exact forward/reverse patch reconstruction of all 668 → 698 → 668 supplied source bodies in a separate scratch repository |
| Preserved source | Migrations 1–69, governance, dependency declarations/lockfile and all 86 checkbox lines unchanged; D64 appended exactly and prior review imported verbatim |
| Source/body exclusions | `.env.example` and `docker-compose.yml` remain unchanged opaque Git identities; their secret-bearing bodies were not supplied or reconstructed here |

The original prompt, direct authorization and D64 bytes match the previously prepared handoff. The UI change count displayed in the pasted Codex message is not used as the commit inventory; the verified Git patch is authoritative.

The read/query, mutation/parser, six page routes, four actions, current/source presentation, migration 70, replay/checkpoint functions and affected authorization/audit integrations were reviewed against D64. The main design keeps current assignments separate from retained import evidence, preserves inactive/current selections, permits active external counsel, enforces archived-parent rules, uses aggregate versioning and owned receipts, and restricts lifecycle changes to Administrator. Normalized exact technical-ID search has no invented legacy-ID branch. The permanent checks retain the old immutable boundary and verify current state through authorized history. No additional required code finding was identified in those reviewed paths. This is a bounded review conclusion, not proof that every possible defect is absent.

**Windows execution results reported by the supplied evidence, not rerun here.**

| Evidence | Reported result and scope |
| --- | --- |
| Historical attempt 18 | Accepted-copy baseline 137 checks + 15 setup checks; candidate 141 checks; backend behavior, independent search, session and adversarial proof |
| Permission suite | 448 role/area/action decisions plus denial and inventory checks |
| Corruption/concurrency | 11 permanent-checker corruption refusals; eight observed overlap cases plus the separately recorded session-revocation overlap |
| Browser attempt 19 | Four-role production-browser coverage, both writers, Administrator lifecycle, current/source display, stale drafts, navigation, 320px layout and actual 200% zoom; final 141 checks |
| Canonical attempt 06 | 119 baseline checks → 123 candidate/final checks; native create/archive/restore and receipt reuse after later state |
| Project gates | `project-check11.log` and final source/document closure records report success |

Attempt 18 ended with a later browser assertion failure; its completed backend proof is reused explicitly. Attempt 19 supplies the succeeding rebuilt UI proof. Early attempts with incomplete executed-source capture are disclosed and are not treated as final proof. Search/detail/filter cases have differing role coverage in the test source; the four-role browser statement does not mean every ancillary case was repeated for every role.

I independently rehashed 542 executed-source bodies for each of attempt 18, attempt 19 and canonical 06. Of the 542 final backend bindings, 536 match directly after the disclosed Windows CRLF/Git LF distinction; the other six consist of the captured dynamic browser body, two type-only assertions in one harness, and four UI files rebuilt in attempt 19. A separate Node transformation confirmed the harness assertions emit identical JavaScript under that reviewer transform; it does not claim the Windows compiler's hash. All 192 build-source bindings and 291 browser-test source bindings also match. These bind submitted evidence to source; they do not prove every branch executed. Three supplied screenshots were inspected, including mobile editing and archive confirmation. No screen-reader speech testing was performed or inferred.

**Preservation evidence has a dated window.** The supplied owner snapshots compare identically for database identity/ledger, all 124 table digests, 48 complete sequence states, profile/distributions, credential digest, protected-file identities and 54 logos between 15 September 2026 14:28:44.258 and 16:48:48.079 UTC. The supplied runtime inventories also agree across 404 build files from 15:58:09.5810702 to 16:49:51.5549291 UTC. They record migration 69 and accepted build `LyN77RMhXZbOvG44OcUhg`, PID 66108. The full build-file window begins later than the database baseline. These comparisons were recalculated here from submitted JSON; there was no fresh connection to the Windows owner machine, database or GitHub. A clean local candidate branch and no publication/activation are reported by the submitter's receipts.

The original Task 4.4 proof, D59 unchanged-risk exception, two opaque source bodies and owner-excluded screen-reader speech scope remain explicit. No original attachment was changed. This review created only scratch verification artifacts and review/handoff documents; no implementation, owner operation, push, activation, additional chat or subagent occurred.

Proceed next with a bounded correction in the SAME Codex Desktop task, using the proposed correction handoff only when the owner sends its authorization. Keep the original candidate and evidence intact, deliver one correction child and focused red/green browser proof, supply the six missing artifacts, and stop for independent correction review. Actual migration 70, activation, publication and final Task 4.5 acceptance remain separate later steps.
