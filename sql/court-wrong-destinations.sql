-- ============================================================================
--  THE SEVEN "WRONG" COURT VALUES — the firm's ruling, 24 August 2026
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
--  | 26                                   |    1 | discard — not a value     |
--
--  All five named places are real places where something happened. They are
--  simply not courts, and matter_destination already holds exactly this kind
--  of value — مصلحة الضرائب, نقابة الأطباء, هيئة الاستثمار -صلاح سالم.
--
--  lookup_matter_destination therefore goes 27 -> 31, and the nine original
--  lists go 130 -> 134.
--
--  The two discards keep their original text in legacy_court_raw (D10). A
--  discard is not a deletion: the row still loads, it simply has no court.
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

-- And the two discards must be discards: no target at all.
SELECT count(*) FROM migration_crosswalk
WHERE  source_field = 'court' AND source_value IN ('/', '26')
  AND  target_field IS NULL;
-- Expected: 2
