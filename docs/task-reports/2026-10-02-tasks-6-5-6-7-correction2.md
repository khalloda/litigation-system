# Tasks 6.5–6.7 correction2 — bounded N1 diagnosis

Date: 2 October 2026. **R1 retains independent PASS; N1 remains BLOCKED.**
No causal application, framework, browser or harness defect was established.
No production correction, dependency change or delivery workaround was made.
Successful deliveries in this round do not close the original failure.

## Scope and source

The owner adopted the correction2 prompt and verified handoff. Intake verified
HEAD `7a8a40192b32cb29ddcd48bf97dae1cb35687369`, parent application source
`6cfd0d94a5d179d1f846cf45e4fda79d20a20a5f`, tree
`8d56171f76fd83607abf81e1c9fe29b6283bac77`, and published main
`186fd91d4528ac4da480a0699bd0fd44b4fb4749`. The ten existing children and both
earlier five-file deliveries were preserved. The imported
[independent correction1 review](../reviews/2026-10-02-tasks-6-5-6-7-independent-correction1-review.md)
is verbatim. This child changes documentation only; TASKS, governance, accepted
business decisions, production source, tests, dependencies and migrations remain
unchanged. Migration 78 SQL remains
`d734fe640144397d96b22b78d65544ce28601ee185e52fc26624ba1ae12e88bb`.

Evidence root: `test-results/task65-67-correction2-20261002T053543Z`.
Original and correction1 roots retain their previous identities and outcomes.
Embedded full context v1.152 and exact sidecars were verified in a separate
intake directory; a same-named generic Downloads file was not substituted.

## Original failures and hypothesis matrix

Original totals remain **206 completed / 202 saved / 4 unsaved**, at fixture audit
IDs 1287, 1378, 1383 and 1744. Correction1 separately remains **30 / 30 / 0**.
The four per-failure timelines bind operations, filters, roles, audited bytes,
actual source/build evidence and browser failures in `retained-analysis.json`.
Historical build-label corrections are explicitly applied to the analysis;
earlier evidence files are not rewritten. The historical exact Node/browser patch
versions were not captured per failure and are not inferred from today's tools.

| Hypothesis | Evidence and conclusion |
| --- | --- |
| A preceding response spills into the next response | Not demonstrated. For document 393 / audit 1744 / socket 1909, the preceding saved XLSX length matches the observed 12,559-byte body. The invalid prefix was absent from 417 retained PDF/XLSX files. Full preceding compressed streams and the failed PDF are unavailable, so spillover cannot be ruled out from those prefixes. |
| The application returns an incorrect length or mutated buffer | Not demonstrated. The installed engine copies output into a new Uint8Array and binds its length/hash before returning it. Every newly observed complete export body agrees with its saved file and length. The original failed body is unavailable. |
| Next/Node transport or browser receive boundary | Unresolved. The original error occurs during HTTP header parsing, not just while waiting for a download event. Complete paired outgoing/received streams in this round contain no comparable export failure. |
| A test-harness-only failure | Not demonstrated. No reproduction and controlled causal difference exists. Successful fixed responses do not establish a harness-only cause. |

The old hook captured write-call lengths/hashes/prefixes, with synchronous logging
that could affect timing. It did not capture complete message framing. One write
or the next request event is not a response boundary. This round parses complete
ordered streams, including preceding messages, chunk terminators/trailers,
Content-Length, status/HEAD rules, Content-Encoding and close framing. Twelve
offline parser cases pass. An initial trailer-validation defect in the diagnostic
parser was corrected and retained as a failed helper attempt, not an app finding.

## One capped comparison

The ledger reserves each explicit delivery before the request, never resets,
and permits no automatic export retries. It stopped at **17 of 20** deliveries
and **9 of 20** previews because more identical attempts would add no causal
evidence. No third campaign or plain-HTTP stress run was started.

| This round | Attempts | Completed real exports | Saved files | Unsaved completed exports |
| --- | ---: | ---: | ---: | ---: |
| Real reports | 8 | 8 | 8 | 0 |
| Fixed-byte controls | 9 | Not report audits | 8 | Not applicable |
| Combined | 17 | 8 | 16 | 0 |

Control attempt 3 returned HTTP 404 before producing an output or export audit.
A bounded authenticated read-only diagnostic showed Next's internal Request URL
origin as `localhost:3165` while the incoming Host was `127.0.0.1:3165`. Only the
task-copy guard was corrected to check that exact Host and the diagnostic flag;
loopback binding and authentication/permissions remained enforced. This is not
the N1 failure or a production fix. The refusal and repeated associated preview
remain in the budget and audit accounting.

The comparison used client-branches / client 245 as Administrator and document
movement card / document 393 as Paralegal. Navigation, preview, XLSX then PDF,
normal prefetch and the browser-scoped fail-closed proxy matched the retained
harness. The fixture population stayed unchanged: 36 client-branch rows and one
document card. The original failing client output included an earlier synthetic
fixture row; this round does not claim identical reproduction of that old payload.

Two isolated diagnostic production builds were necessary because correction1's
compiled artifact had been disposed, then the task control guard needed fixing:
`xFOeir9IfIbaXVKvSNEXb` and `pLh9pFJdoH7KotXccMSCu`. Both use exact reviewed
application bodies from `7a8a40` (application source `6cfd0d9`) plus a separately
identified, task-only authenticated fixed-payload route. They are not mislabeled
as unmodified production artifacts. No control route entered the candidate
registry or Git. Installed dependencies were copied and hash-verified without
installation. Versions: Node 22.23.2, Next 16.3.1, Playwright 1.62.1, Chromium
151.0.7922.34 and React 19.2.8.

The first two valid baseline real deliveries were retained across the control-only
rebuild rather than repeated. The instrumented real/fixed pairs all use the second
build. The native observer was the changed variable against the uninstrumented
baseline; it can change timing. Fixed controls serve retained byte-identical files
using comparable length, type, disposition, digest and no-store headers, without
adding normal report audits. The original real routes retain their permissions.

## Complete-stream results and limits

All 88 browser response streams parse completely: 414 HTTP responses, including
352 complete compressed bodies. The instrumented run aligns 38 connections by
actual local/remote ports and matches parsed request order. On 33 connections,
the complete native outgoing bytes equal browser-received bytes exactly. Five
others have a 378-byte native suffix for a final cancelled prefetch: request
aborted, response not finished, connection closed. These are documented partial
messages, not exports. The native layer has 181 complete responses and 153
complete compressed bodies; no complete compressed body failed decoding.

All eight instrumented real/control artifact responses used connections with
preceding traffic and agree with their saved bytes. Native observation captures
the complete bytes submitted to Socket._write/_writev, not packets or proof of OS
delivery. Node's HTTP parser consumed incoming socket data before the added data
listener, so native request order comes from parsed request events. Browser send
bytes independently confirm that order. Response boundaries come from the full
byte parser, not request timestamps or individual writes. These limits remain
explicit in `complete-stream-analysis.json` and `stream-reconciliation.json`.

Eight XLSX files pass complete typed-cell, visible-value, total, RTL, filter,
formula-safety and Cairo-metadata checks. Eight PDFs pass structural/font checks.
Eight actual raster pages were viewed: first/middle/last of both real branch PDFs
and the complete two real movement cards. No observed clipping or altered values;
movement fields remain blank. Fixed PDFs retain prior visual evidence. This is
bounded visual coverage, not every-page certification. PDF copying remains an
accepted limitation, NOT FIXED. Search is not certified or retested.

## Isolation, accounting and preservation

Fresh owner observations matched retained protected recovery exactly, so no
duplicate dump was needed. Recovery has 65 verified members and 54 logo files.
The new disposable cluster `7691941849073094695` restored all migration-77 state;
candidate 78 was applied only there. Pristine and final gates each passed all
148 historical checks and 15 setup checks, with complete quiet-window equality.

Final fixture accounting is exact: 1,134 to 1,171 audit events, an increase of 37.
That comprises six account record updates, two password resets, two password
changes, two genuine logins, 17 report executions (nine previews/eight exports),
and eight export completions. Only fixture accounts 2 and 4 changed, and only
permitted authentication fields. A fresh read-only owner account comparison
proves all other accounts and all other fields exact. All 155 non-authentication/
audit/mutex tables, every business table, all saved selections and 48 sequences
remain exact; all original audit events are preserved. Controls create no report
export audits. Saved output identities match their real completion events.

The owner baseline at 08:39 Cairo and final prepackage snapshot at 09:23 Cairo on
2 October show migration 77, 152 tables, 48 sequences and 1,134 audits. Full rows,
columns, catalogs, privileges, ledger, authentication and prior audits compare
exactly. The final receipt adds fresh post-package observations. These are dated
observations, not continuous monitoring. Accepted owner PID 12052 and build
`_ehqxQr_3RiIGEhysOBbY` were observed read-only; no owner login/export or restart.

The owner's verbatim confirmation is carried in evidence and receipt:

> I confirm that archiving hearing 11003 around 15:50 Cairo on 1 October was my action. Preserve that change and record this confirmation in the correction evidence and final receipt. Continue the existing correction prompt; its scope remains unchanged.

That archived state remains preserved. This attribution does not extend to other
historical activity. TASKS remains byte-exact with 86 checkbox lines. Existing
owner selections, migration 77, configuration, prior evidence and accepted
artifact are preserved. Accepted non-dependency files are freshly hashed;
dependency bodies retain historical hashes with fresh size checks, as disclosed.

Cleanup stopped only identified task app processes and removed only the owned
fixture container/network/volume, independent diagnostic artifact, task temporary
directories and disposable credentials/sessions. Complete raw browser/native
streams remain under protected private ACLs and are hash-bound but excluded from
the review ZIP because they can contain fixture cookies. Private full-state
bodies, owner account verifiers, recovery and configuration are likewise excluded.
Saved outputs, sanitized traces and analysis are included. Failed helper attempts
and the control refusal remain evidence; none is relabeled as a successful test.

## Reuse, next proposal and stop

R1's independent PASS and 18-case proof, correction1 full project check/build,
unchanged family data/permission/selection/migration evidence and prior saved
outputs are source/hash-bound reuse. New work adds only diagnostic evidence and
documentation, so production check/build reruns are unnecessary. Documentation
format, encoding and Git-exclusion checks accompany the local child. The review
package binds native source/chain and forward/reverse patches, current evidence,
precise blocked status, private-body identities and a receipt-inclusive verifier.
Integrity PASS does not imply implementation acceptance.

Concrete next proposal: independent review of the paired complete streams first.
Retain this observer and parser for a separately authorized targeted capture if
the original failure recurs, preserving the entire preceding connection and
failed response before selecting a production correction. No dependency change,
global connection/encoding policy, automatic retry, new delivery protocol or
further campaign is justified or authorized by these results.

**NOT PUSHED. STOP FOR INDEPENDENT TASKS 6.5–6.7 CORRECTION2 REVIEW.**
