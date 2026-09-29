# UI Implementation 01 — independent O1 correction review

29 September 2026. **PASS for the scoped implementation. UI01-O1 is closed for the reviewed visible-value cases. Ready for bounded operational continuation; not yet activated, accepted operationally or published.**

The owner's PDF-copying waiver remains in effect. R4 is an accepted non-blocking limitation, not fixed; PDF search is not certified. Correct visible output and exact data remain requirements. No copying or search diagnosis was performed in this review.

## Verified identity and scope

| Item | Result |
| --- | --- |
| Candidate | `e6f20754b538b424993605c1e5f694e4be72c903` |
| Parent | `26f8f632d199184153061f5780d5c16770656d62` |
| Tree | `173b0296908a2369b316fa406914b7640e8f7994` |
| Published base | `2932f9e468a73cb783825d959322c8d9ec07ea9f` |
| Preserved chain | `2932f9e → ebb0dc0 → 672b3f2 → c6221a2 → 26f8f63 → e6f2075` |
| Source | 964 tracked identities; 962 included bodies; unchanged `.env.example` and `docker-compose.yml` bodies omitted under D59 |
| Correction ZIP | 24,198,894 bytes; 3,186 members; 79,794,476 uncompressed bytes |
| ZIP SHA-256 | `aa47e04d7544e622ea24eb787738c7533cd7fb1221ebbbb0922f18f727a124e6` |

Every member was independently checked against the separate manifest for exact membership, safe regular-file paths, size, SHA-256 and ZIP metadata. The supplied stdlib verifier was inspected and rerun with the final receipt: PASS. Independent Git CLI reconstruction confirms raw blob/tree/commit identities for the parent and child and the complete correction patch forward and reverse. The parent inventory exactly equals the previously independently reviewed 962-identity checkpoint. All five preceding raw commits/ancestry match the preserved review history. The adopted correction prompt, independent operational review and owner decision are byte-identical to the handoff supplied here. The current full context matches v1.134.

The actual tracked delta is **five files**, regardless of the UI's abbreviated edited-files panel:

1. `src/lib/audit-history-export.ts`: PDF-only value markup and field-heading pagination.
2. `scripts/test-audit-pdf-values.ts`: meaningful renderer/value regression.
3. `scripts/lib/audit-source-inventory.ts`: exact renderer fingerprint only.
4. `docs/task-reports/2026-09-29-ui-implementation-01-o1-correction.md`: dated correction report.
5. `docs/testing/ui-implementation-01-correction1-matrix.md`: bounded append-only supplement.

No source reset or history rewrite occurred. TASKS/all86 checkbox lines, governance, dependencies, fonts, schema and all75 migration files remain exact. The supplied 24 tamper cases were reviewed as execution evidence, not independently rerun. Archive verification proves integrity and bindings; the separate code/visual review below supports the implementation verdict.

## Code review

The PDF helper keeps translated type markers outside the literal's own direction context. Numbers use LTR isolation to preserve signs. Recorded strings retain automatic direction and existing visible control/backslash escaping. JSON retains its recorded character sequence and separators; quoted string tokens are individually isolated to prevent adjacent Arabic keys/values from changing timestamp order. The limited JSON parse remains only for the pre-existing redacted/truncated marker decision; it does not parse/rewrite dates or serialize the evidence. Escaping protects all recorded text. Field headings now avoid a page break before their following table.

The shared `auditValue`, `auditRecordedValue` and `auditOriginalValue` functions, audit viewer, XLSX generator/envelopes, export handler/security/limits/CSP, ordinary report renderers, Noto assets and dependency lock remain unchanged. The only inventory change binds the reviewed renderer; no permission or checker is weakened. The additional JSON isolation follows a demonstrated same-class visual failure in the matrix and remains within the adopted correction scope.

## Independent visual and exact-value checks

I independently rendered both final saved PDFs with Poppler and inspected **all seven final pages**: four synthetic matrix pages and three genuine isolated download pages. This is direct inspection of visible output, not copied/extracted PDF text. The original failure remains preserved in the baseline and the earlier blocked operational delivery.

| Evidence | Independently observed result |
| --- | --- |
| Matrix page2, original counterexample | Before `2026-09-28T10:03:45.244+00:00`; after `2026-09-29T13:55:07.306+00:00`, both in the correct visible order |
| Matrix page2 | Z, positive/negative offsets, fractional seconds, date-only and numeric-leading identifiers readable and correctly ordered |
| Matrix pages3–4 | Numeric signs/precision, Arabic marks, mixed text, multiline/wrapping, distinct typed states and JSON timestamps preserved in the inspected layouts |
| Genuine download page2, event1057 | Before `2026-09-28T10:03:45.244+00:00`; after `2026-09-29T17:08:15.064+00:00`, matching its oracle |
| Seven-page layout | Before remains right and after left; headings, complete-group continuation, table boundaries and page numbering readable; no clipped/lost content observed in these pages |

Final matrix PDF SHA-256: `afc3aa8be7b37889e207a28e1ff219239b9a4e551c3066374e5147414c143b22`. Genuine downloaded PDF SHA-256: `aed15be3dd3c1004ac391773e05db51939caf5541bc0864ea1dedb9200c68f62`.

I separately decoded all **32 typed XLSX envelopes** directly from saved ZIP/XML/Base64 using the independent input oracle: all exact. Both saved baseline/corrected workbook pairs have identical content in all11 compared package parts; `docProps/core.xml` creation metadata and outer ZIP timestamps are excluded. The genuine workbook's two affected timestamps also decode exactly. Neither input nor stored data is altered by this presentation correction. These checks do not certify PDF copying/search.

Source-bound reuse was independently checked: **396 unchanged source/asset/schema/lock bindings** and **eight prior operational evidence hashes** match. Prior four-role UI, R1–R3/R5/N1, ordinary reports, selection conflicts/idempotency and deeper permission tests remain reused. The historical17PDF/126page set was not regenerated or newly certified. True bfcache restoration and screen-reader speech remain outside demonstrated coverage. This review does not claim every possible mixed-direction string or every external PDF viewer has been tested.

## Execution, accounting and preservation

Supplied source-bound evidence records full project checks, final sequential production build `2qLdzyWh-PqTLVYng-elt`, pristine148historical+15setup checks with before/after equality, genuine isolated audit PDF/XLSX downloads and a capability-denied403/no-audit-write check. Windows application builds, database gates and browser requests were not independently executed here. The actual saved PDF/workbook bytes and bindings were inspected independently as described above.

The fixture reconciliation explains ten events,1053–1062: three account updates, one reset, one password change, one login, one capability revoke, one restore and two audit exports. Both completed files were saved and bound to their receipts; no ordinary preview/export or completed-unsaved output occurred. Fixture authentication/capability changes, counter+10, roster mutex+3 and one account's session version+2 are explicitly accounted for. The other138tables, original1052auditrows, prior receipts,48sequences, business/selection data, catalogs and migration ledger remain exact in the supplied comparison.

Failed/intermediate attempts remain visible: initial JSON/heading defects, superseded overlapping build/check attempt, inventory formatting, encoding/ACL and reconciliation-harness corrections. Final source/build evidence is distinguished from intermediate artifacts. No check or guard was relaxed to hide a failure.

Latest supplied owner snapshot: **29 September2026,17:38:37UTC /20:38:37Cairo**, complete local equality across145tables,48sequences,migration75 and1052auditrows; zero owner effects. Runtime observation at17:38:48UTC /20:38:48Cairo shows the prior accepted PID38844/build `0KBeszrDL7ryCzaLpmGlb` on127.0.0.1:3000. Git17:39:43UTC records clean main,e6f2075,five ahead/zero behind unchanged remote2932f9e. These are dated supplied observations, not live access here or proof of continuous uptime. **The redesigned UI remains inactive.**

The69-member retained recovery was freshly rehashed and shown compatible with the fresh owner baseline. Preservation uses76,111 fresh size/mtime entries for two prior artifact/dependency trees plus prior complete hashes,168 bounded fresh hashes,three reused inventories and separately rehashed recovery. Historical cache/VHDX bodies were not all freshly scanned. Private full-state/recovery/credential bodies remain local and were not independently inspectable. Owned fixture processes/storage/sessions were removed; the corrected build remains inactive. Recovery is local and does not protect against disk loss.

## Disposition and next step

UI01-O1 closes for the reviewed scope. R1–R3/R5/N1 remain retained; R4 remains owner-accepted, not fixed, and search uncertified. The prior blocked operational package remains immutable history. No new blocking issue was found in this scoped review.

Resume through the accompanying bounded operational handoff in the SAME Codex Desktop task, Local Windows, no subagents. Freeze e6f2075 application source. Revalidate current owner state, recovery and the accepted artifact; use exact prior evidence where still applicable and fresh deployment/owner checks where required. No migration or provisioning is needed; migration75 remains the boundary. Only after operational gates pass may the specified documentation child and normal non-force push occur. Return five operational-review files and stop for independent operational review before Task6.3.

No owner operation, activation, commit or push was performed by this independent review. The continuation is prepared for owner adoption.
