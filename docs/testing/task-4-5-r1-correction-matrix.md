# Task 4.5 R1 correction matrix

Established before production edits on 16 September 2026. Parent:
`8c0cdf1d235df2e63fa450be26667e158c573923`. The owner adopted the verified
review ZIP's bounded R1 correction and N1 supplement instructions.

| Area | Required evidence | Status |
| --- | --- | --- |
| Inputs | Reviewer archive and all original receipt artifacts verified | PASS: 39 review members; all 26 original artifacts, including six missing files |
| Owner | Fresh read-only database, account/config/logo and runtime observations | PASS: database06:09:27.535–06:44:21.031UTC; full build06:10:47.8596421–06:44:18.6235511UTC on16September. 124 tables, 48 sequences, 54 logos and404 build files unchanged. No port3000 listener in either snapshot; no owner app start |
| Red | Native number/date incomplete typing, both writers, create/update on original production UI | PASS defect reproduction: red01 all8 cases saved unintended NULL; build k9QqAhrAWFNFVAPiDVNhS, 8 screenshots, submitted requests and saved values retained |
| Green | Invalid drafts refused and retained, focused Arabic feedback, zero complete-state changes | PASS green02: all8 native cases, complete before/after state retained, zero action requests, draft survives unrelated rerender and correction saves |
| Valid | Deliberate clears; NULL/zero/positive/max counts; valid date endpoints and normal dates | PASS green02 both writers × create/update: NULL,0,3,2147483647; optional dates0001-01-01,2024-02-29,9999-12-31; intended values/history/receipt checked |
| Recovery | Correct input after error, Cancel/Escape, stale forms, exact uncertain retries, current/source meanings | PASS green02: complete-state Cancel/Escape/stale checks; lost committed response followed by competing edit and exact retry makes no writes; imported labels verified |
| Accessibility | Keyboard/focus, RTL, 320px and established actual 200% zoom | PASS green02: automated accessibility and target checks, real Tab focus, RTL, 320px, actual200% zoom; 14 screenshots |
| Boundaries | Frozen migrations1–70, schema, backend/query/authority and old evidence; fresh permanent checks | PASS final-source-pin: 695 frozen parent paths,544 exact executed sources,192 build files,all26 old artifacts,86 checkbox lines. Fresh setup15/baseline137/candidate141/final141; old canonical123/concurrency/corruption/448-permission proof reused explicitly |
| Gates | Required project gates, source bindings, encoding and whitespace | PASS check03 on final runtime/test sources; final documentation encoding/whitespace receipts supplied |
| N1 | Six exact original files plus original receipt supplied | PASS n1-original-supplement and all26 original artifacts in correction archive; no substitutes |
| Closure | Owner comparison, owned cleanup, one child commit, exact patch and verified complete delivery | Owner and three fixture/browser cleanups PASS. Final external candidate/patch/reconstruction/verifier/receipt bind the future commit and completed envelope without circular self-reference |

Green01's eight native rejection/recovery cases passed; its later31February
keyboard assumption failed because the browser produced a valid native value.
The failed run/source/screenshot is retained. Green02 records that constraint
observation separately and tests impossible/zero-year/malformed dates through
explicit network substitution to the real action, not a fabricated typing claim.
Static check01's missing generated image declarations were corrected only in the
isolated mirror with `next typegen`; check02 and final check03 passed.

No owner migration, activation, push, acceptance or checkbox change. No OS
screen-reader speech claim. Final external receipts bind the future commit and
finished artifacts without a circular self-commit claim.
