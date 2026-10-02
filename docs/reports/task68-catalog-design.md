# Reports catalog organization

The current shell, Noto Sans Arabic, colours, spacing tokens and RTL conventions
remain. This change organizes discovery; it does not change report criteria.

| Category | Baseline IDs | Candidate IDs |
| --- | ---: | ---: |
| تقارير العملاء | 8 | 8 |
| الدعاوى والملفات | 3 | 3 |
| الأحكام والنتائج | 4 | 5 |
| المحامون وتوزيع العمل | 6 | 6 |
| الجلسات | 5 | 5 |
| الأعمال الإدارية والقرارات | 6 | 6 |
| المستندات والتوكيلات | 6 | 6 |

These are inventory figures, never hard-coded visible counts. `catalog.ts`
maps the server-authorized descriptor list, fails closed on missing/duplicate
coverage, and sends only allowed titles/descriptions/links to the client.
Fresh account authority is checked before applying each descriptor's permission
requirements. Direct form/run/export enforcement remains on the server.

General entry begins collapsed. Client-context entry opens the client category
and retains client parameters only on applicable report links. The existing
client, closed, lawyer and administrative selection tools retain their separate
purposes and routes. Category tools require the relevant allowed definition.

Search matches normalized Arabic titles/descriptions only. Matching collapsed
categories open automatically; they cannot be hidden while searching. Clear
restores the earlier browsing expansion and focuses the search input. URL query
and expansion state belong to the current history entry, so Back/Forward
restores the catalog rather than losing the search. Expand/collapse-all remains
available outside search. Empty and no-match states are explicit.

Disclosures are native buttons with headings, `aria-expanded` and
`aria-controls`. Counts update in a status region. One prepare action per report
is named with its report title. Keyboard, accessibility-tree, actual 200% tab
zoom, desktop and 390px/320px screenshots are checked; this is not a claim of
universal accessibility conformance or spoken screen-reader testing.

Landing guidance asks the user to choose a report and review its own scope.
It no longer implies that All matters is every report's default. Navigation,
search and expansion perform no generation, audit event or saved-choice write.
