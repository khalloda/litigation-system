-- ============================================================================
--  THE SEVEN "WRONG" COURT VALUES — the firm's ruling, 23 August 2026
--
--  Seven of the 401 reviewed court names are not courts at all. The review
--  file recorded them as "a venue or destination", which is two answers, so
--  the seed generator quarantined them rather than guess. The firm has now
--  ruled on each one.
--
--  | Value                                | Uses | Action                    |
--  |--------------------------------------|-----:|---------------------------|
--  | نقابة الأطباء                        |   67 | matter_destination (exists)|
--  | مقر شركة أدخنة النخلة بشبين الكوم    |    2 | ADD to matter_destination |
--  | نادي المقطم الرياضي                  |    2 | ADD to matter_destination |
--  | مكتب بريد المعادي                    |    1 | ADD to matter_destination |
--  | كايرو فيستيفال سيتي                  |    1 | ADD to matter_destination |
--  | /                                    |    1 | discard — not a value     |
--  | 26                                   |    1 | CIRCUIT 26, court unknown |
--
--  All five named places are real places where something happened. They are
--  simply not courts, and matter_destination already holds exactly this kind
--  of value — مصلحة الضرائب, نقابة الأطباء, هيئة الاستثمار -صلاح سالم.
--
--  lookup_matter_destination therefore goes 27 -> 31, and the nine original
--  lists go 130 -> 134.
--
--  The discard keeps its original text in legacy_court_raw (D10). A discard is
--  not a deletion: the row still loads, it simply has no court.
--
-- ============================================================================
--  CORRECTION, 23 August 2026 — `26` IS A CIRCUIT, NOT RUBBISH
--
--  Applied by migration 0023. The firm re-read the row.
--
--  That row in `admin work table` has NO CIRCUIT RECORDED. Somebody typed the
--  circuit number into the court box. So `26` is not a non-value at all — it
--  is a real circuit that landed in the wrong column.
--
--    circuit  =  26          <- the value lands, in the right column
--    court    =  UNKNOWN     <- genuinely null. NOT court `26`.
--
--  **The court for that row is unknown and must stay unknown.** It is not
--  defaulted, not inferred from the circuit, and not left as the string `26`
--  in a court column. Nobody knows which court it was; that is the honest
--  answer and it is the one that gets recorded.
--
--  ONE COURT DISCARD, NOT TWO. Only `/` is discarded — and that row already
--  carries a real circuit, `الاثنين مدني (ه)`, which is what shows `/` was a
--  placeholder typed where a court name should have gone rather than a
--  circuit in the wrong box. The two rows look alike and are not alike.
--
--  This needed a new KIND of crosswalk rule. Every rule until now pointed at
--  a LIST (`court`, `matter_category`, …), was a marker (`quarantine`,
--  `separate_client`), or was a discard (NULL). A circuit is TEXT by D20 —
--  1,281 distinct values that are a number plus a specialism — so there is no
--  list to point at. `target_field = 'circuit'` is the first TEXT TARGET:
--  recognised, never resolved against a list, and required to carry a
--  non-empty `target_value`. That last requirement is the point. A rule kind
--  that is simply exempt from the resolve check would be a place where a null
--  target passes both checks and looks healthy — the exact shape of fault
--  described in "An assertion tests what it looks at" in docs/MIGRATION.md.
-- ============================================================================

INSERT INTO lookup_matter_destination (label_ar, sort_order) VALUES ('مقر شركة أدخنة النخلة بشبين الكوم', 280);
INSERT INTO lookup_matter_destination (label_ar, sort_order) VALUES ('نادي المقطم الرياضي',               290);
INSERT INTO lookup_matter_destination (label_ar, sort_order) VALUES ('مكتب بريد المعادي',                 300);
INSERT INTO lookup_matter_destination (label_ar, sort_order) VALUES ('كايرو فيستيفال سيتي',               310);


-- ============================================================================
--  VALIDATION
-- ============================================================================
SELECT count(*) AS destinations FROM lookup_matter_destination;
-- Expected: 31

-- All five destination targets must now resolve.
SELECT cw.source_value
FROM   migration_crosswalk cw
LEFT   JOIN lookup_matter_destination d ON d.label_ar = cw.target_value
WHERE  cw.source_field = 'court' AND cw.target_field = 'matter_destination'
  AND  d.id IS NULL;
-- Expected: zero rows

-- EXACTLY ONE court discard, and it is `/`.
SELECT count(*) FROM migration_crosswalk
WHERE  source_field = 'court' AND target_field IS NULL;
-- Expected: 1

SELECT source_value FROM migration_crosswalk
WHERE  source_field = 'court' AND target_field IS NULL;
-- Expected: /

-- `26` is a circuit rule carrying its value, and resolves to NO court.
SELECT target_field, target_value FROM migration_crosswalk
WHERE  source_field = 'court' AND source_value = '26';
-- Expected: circuit | 26

SELECT count(*) FROM lookup_court WHERE label_ar = '26';
-- Expected: 0   -- the court is genuinely unknown, not the string '26'
