# Task 4.4 Phase 2 — independent implementation review

14 September 2026. Candidate: `85525f325108d70ca1a1dac57233f86229cbe504`.

**VERDICT: fix these first. One blocking presentation defect, P2-R1.** The database stores a deliberately cleared reference correctly, but the list/detail presentation can replace that empty current value with the immutable imported text. This matters now that editing is available. Do not accept, activate or publish this candidate yet.

This review was performed here, independently of the Windows implementation agent, against the approved original Phase 2 prompt/proposal, the exact patch, full committed source and supplied evidence. No implementation, Windows owner-app/database operation, remote push, new chat or subagent was used. Phase 1's earlier ID-search R1 remains closed; **P2-R1 is a different finding**.

## Must fix — P2-R1: clearing a current reference still displays the imported value

**Priority: P2 / acceptance blocker.** Clear the assignee of an imported administrative work, the performer of an imported step, or an imported work's destination. The editor submits NULL and the save gateway permits that clear while retaining the original source text. After returning to the list/detail, the display uses that retained text whenever the current joined name is NULL. Someone can therefore still see the former assignee, performer or destination under the current field label, believe the clear failed, or act on a responsibility/location that is no longer recorded.

The exact affected expressions in the verified candidate are:

| Surface | Source location | Expression |
| --- | --- | --- |
| Work-list assignee | `src/app/admin-works/page.tsx`, line 168 | `row.personName ?? row.assigneeRaw` |
| Work-detail assignee | `src/app/admin-works/[id]/page.tsx`, line 82 | `record.personName ?? record.assigneeRaw` |
| Work-detail destination | Same detail page, line 92 | `record.destination ?? record.destinationRaw` |
| Step-detail performer | Same detail page, line 182 | `step.personName ?? step.performerRaw` |

The trace is complete: `admin-editor.tsx` maps the empty selection to NULL and includes changed fields; `admin-work-mutation-input.ts` accepts nullable reference IDs; migration 68 applies the requested current-field change while protecting raw/source fields; `admin-work-query.ts` selects the current joined labels and raw text separately. The current-person filter also follows the actual person ID, so a cleared work can fall under “not recorded” while its card still names the imported person. The court display already uses the current court label without this fallback and is not included in this finding.

**Independently reproduced here:** `reviewer-cleared-reference-reproduction.mjs` extracts and evaluates the four exact presentation expressions using clearly labelled synthetic inputs with a NULL current value and non-NULL imported text. All four display the old text. Native NULL/NULL and replacement-current-value controls behave correctly. This is an offline JavaScript expression reproduction plus source review, **not** a Windows browser/database test or a claim that owner data was edited.

**Why the reported tests missed it:** `scripts/lib/admin-edit-proof.ts` clears task references and a step performer on newly created native records, whose Access provenance is NULL. The imported-record coverage addresses missing descriptions and order; the inactive-reference coverage uses the created task. The production-browser editing flow in `scripts/test-admin-work-editing-browser.mjs` also creates native subjects. Those cases do not exercise a successful clear with retained non-empty imported text.

**Required correction:** render the actual current value, including the existing Arabic “not recorded” state, and display retained imported text separately with an unmistakable source label. Apply this consistently to all four surfaces and preserve access to source text for untouched, unresolved and edited imports. Keep inactive current references visible with their existing status. Do not erase or change legacy fields, infer a replacement reference, or add a database flag/history lookup merely to conceal the presentation problem.

Add focused service/browser regression coverage on copied imported records with non-empty raw values, checking the saved NULL, list/detail/edit agreement, current-person filtering and four-role visibility. Cover replacement and unchanged inactive/unresolved/native cases as controls. Preserve Arabic ID search, filters, return navigation, step order and source bytes. The prepared correction handoff defines the bounded scope and evidence reuse.

**Estimated cost:** roughly 2–4 hours for the presentation change, focused isolated regression, documentation and packaging, assuming the existing fixtures are reused. No new service cost or database migration is expected. Accepting first would expose misleading current values; correcting this before acceptance is recommended.

## Should fix

No separate nonblocking code defect is raised. The review does not manufacture additional findings from style preferences or from explicitly disclosed evidence limits.

## Minor — P2-N1: correct the report's volume description

The implementation report's lines 90–91 identify the full project state using 13,279 hearings, 4,207 original tasks and 1,730 matters. The supplied `actual-before.json` and final `run07/actual-after.json` instead report **13,382 current public hearings, 1,744 public matters, 3,694 public administrative works and 3,483 public steps**. They also report 4,238 rows in `staging."admin work table"`; that is a different population from current public administrative works. Do not mix historical extraction totals with this restored/current test population.

Add an explicit erratum in the new correction report, identifying each population and its dated receipt. Keep this delivered report and its original package immutable as historical evidence. This is a reporting correction, not evidence of lost records or an incorrect migration. Estimated effort: 5–10 minutes; no application change.

## What looks good

- The three approved writer roles and Lawyer read-only role are enforced through guarded pages/actions, service checks and the committing gateway. The source checks current account/session/expiry, active internal login identity and trusted audit actor. Assignment eligibility is independently based on active internal staff, without requiring that assignee to have login access.
- The gateway preserves fixed task/step parents and imported provenance, checks and locks archived-matter/selection eligibility, and shares an aggregate version across the work and steps. Source review supports stale-edit refusal and fresh-authority checks before owned exact receipt reuse.
- Current changes, version, history, receipt and audit fact are transactional. True no-op paths return before creating those records. The supplied adversarial proof distinguishes genuine failed-insert sequence consumption from a no-op and does not rewind it.
- Migration 68 keeps immutable original import evidence separate from current values. Historical reconciliation uses that preserved projection, while new checks validate present aggregates and continuous audited histories. Earlier migration files, D1–D61 and governance files remain unchanged.
- Native step ordering is separate from imported ordinals, and the query appends native steps without sorting by edited dates. The accepted Western/Arabic-Indic ID normalization remains present in both ID comparisons.
- The final screenshots inspected here support readable RTL forms at 320 pixels and true 200% browser zoom, and retained conflict text with a recovery link. These observations are limited to the supplied captures.

## Independently verified artifact and source identity

| Item | Independent result |
| --- | --- |
| Commit | Raw Git commit rehashed to `85525f325108d70ca1a1dac57233f86229cbe504` |
| Sole parent | `fbf47d7fc0e5a1405a8798838243289d2d31898f` |
| Tree | `a1a2ef45db9ba5a2e44166c3604262c89795feab`; all 642 committed blobs and recursive tree rehashed |
| Patch | Exact reverse application reconstructs all 622 accepted-parent files; forward applicability and per-file statistics checked |
| Commit scope | **42 tracked paths, +3,799/−37; 20 new files, 600 parent files unchanged** |
| Original boundaries | Frozen migrations 1–67, AGENTS.md/CLAUDE.md, D1–D61 prefix and all 86 existing checkbox lines preserved |
| Adopted inputs | Packaged original prompt, proposal, short authorization, publication PASS review and handoff identities match approved originals |
| ZIP | **All 813 members independently verified**: complete unique set, CRC, safe regular paths, exact size/SHA-256 and extracted bytes |
| Delivery | Outer ZIP/patch and delivery-bound artifacts match their recorded sizes/hashes; standalone implementation report equals committed report |

ZIP integrity is **verified**, no longer pending. The commit statistics above are derived from Git/patch bytes, not the Desktop editor's session-change summary.

Key original deliveries:

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| `task44-phase2-review.zip` | 3,906,294 | `57902b250c0e7a155e77909332fa5161abb3ac3941850193c7ca3fa3b87827e0` |
| `task44-phase2.patch` | 225,220 | `8fa18329859abb174fcb272a3ff4fd3bcc36d32d87b76bdafb3dd2085488f169` |
| `package-manifest.json` | 201,771 | `171d72c7890e4257d853f86d4b7b35537630632ae256a85157adac1b310a4f8e` |
| Supplied delivery receipt | 3,550 | `e8f2f5ffce9b155ab2b53ed09cc1f0eeee52411d53f0517ba64c76cf78ec2219` |
| Supplied implementation report | 15,535 | `b33d4db8773f4ef2dd159a5673495f485f36bb047e86582e741326907fdb8d8f` |

## Reported Windows execution, independently checked for consistency

These are **supplied Windows test results**, not tests rerun by this reviewer:

| Evidence | What the reviewed files support |
| --- | --- |
| `run05/invariants67.log`, `run05/invariants68.log` | 131 pre-migration checks, then 135 checks; the driver runs the original baseline before fixture account/native setup |
| `run05/mutation-results.json`, `adversarial-results.json` | Seven mutation groups and twelve adversarial groups, including observed lock overlaps and required stale/session/eligibility error results |
| `run05/green-results.json`, `id-candidates.json` | Four-role ID regression, twelve meaningful imported candidates, complete result sets/counts and filter/negative cases |
| `run07/invariants68-final.log`, `permissions.log` | Final 135 checks and 448 permission decisions with the recorded rejecting controls |
| `run07/browser/` | Final production build `Pubvj5wdB2XH52uxusB2P`, nineteen browser observations, two true 200% zoom observations, three writer flows and Lawyer editor refusals |
| `guard/guard.log`, `check-final.log` | Twelve parser and ten guard cases, and recorded final project/static checks |

The final browser run reuses the completed `run05` backend proof. I independently matched **365 backend source bindings** and all six reused evidence hashes. Between `run05` and `run07`, the recorded source changes are exactly the driver, editor and editor CSS. The supplied recovered driver/editor/CSS bytes match their earlier hashes; the editor delta reconstructs exactly the task-create-only date hint. Final build/test manifests match supplied source bytes. Earlier failed attempts remain failures; they are not counted as fresh passes. The canonical empty replay branch was explicitly not run.

The working-byte source inventory has 632 exact matches to committed files and two unchanged PowerShell files whose recorded Windows hashes are reproduced by CRLF conversion. **Eight unchanged historical Markdown working copies are not supplied in their exact Windows byte form.** Their metadata matches the previously reviewed accepted-parent working inventory, and their committed Git blobs are independently verified. This is a stated byte-availability limit, not an unexplained change to runtime source.

Of 178 external inventory entries, 176 have matching supplied bytes, including START-HERE from the already approved handoff ZIP. The two excluded raw browser failure-state files remain metadata-only. Generated source (60 entries), build outputs (373 entries) and the declared dependency checks are identity manifests, not full runtime/dependency byte audits.

## Preservation and observation limits

I independently compared the supplied owner-state receipts across **12:25:38.930–14:01:59.778 UTC**: all 119 per-table records/digests, all 48 complete sequence vectors, sequence metadata and catalog digest are equal. The vectors include `last_value`, `log_cnt` and `is_called`. Separate before/after receipts also agree on all 54 logo identities, 166 earlier evidence-file identities, no owner-app listener/process, and accepted build ID `6STn5JeaidE5AnbLqEJc8`.

Those comparisons establish equality of the supplied dated evidence. They do not independently recompute owner rows, passwords/accounts/session contents, logo bytes or private configuration; those bytes are not supplied. Configuration preservation and runtime/cleanup observations remain attributed to the Windows receipts. There is no claim of continuous monitoring.

The final delivery reports clean local main at the candidate, one commit ahead of cached `origin/main`, with no push or activation and actual completed-migration checkpoint 67. This review did not fetch GitHub or observe the Windows machine. The last reviewer-observed remote checkpoint remains the earlier Phase 1 publication check; no Phase 2 publication or activation is authorized or inferred.

## Disposition and reviewer artifacts

P2-R1 remains open. P2-N1 should be corrected in the follow-up documentation. Overall Task 4.4 stays unchecked; accepted/published Phase 1 and its closed ID-search R1 are unaffected.

The prepared `task44-phase2-p2-r1-correction-prompt.txt` continues the SAME Desktop implementation conversation, confines production changes to presentation, preserves schema/migration/gateway/permission/query semantics, and requires a single local correction commit plus focused isolated evidence and another independent review. It is a ready handoff, not a claim that a correction has begun or that acceptance/activation/publication was approved.

`task44-phase2-independent-reviewer-verification.zip` retains this review, the independent scripts and result ledgers, the source-extracted expression reproduction, and the parent/input identity material needed to audit the checks. Original implementation and prior-phase deliveries remain unchanged.
