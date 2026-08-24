-- ===========================================================================
--  0033 — REVIEWED TEXT KEYS IGNORE EDGE-ONLY LINE BREAKS
--
--  One matterDegree value starts with CRLF before إدارية عليا. The firm's
--  reviewed rule correctly names إدارية عليا; the first version normalised
--  CRLF but retained the resulting empty first line. Trim only whitespace at
--  the edges of the complete value. Internal line breaks and all Arabic text
--  remain significant.
-- ===========================================================================

BEGIN;

CREATE OR REPLACE FUNCTION _migration.reviewed_text_key(value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
STRICT
PARALLEL SAFE
AS $KEY$
    WITH normalised AS (
        SELECT btrim(
                   replace(
                       replace(
                           replace(value, E'\\n', E'\n'),
                           E'\r\n', E'\n'
                       ),
                       E'\r', E'\n'
                   ),
                   E' \t\n'
               ) AS value
    )
    SELECT string_agg(btrim(line, E' \t'), E'\n' ORDER BY ordinal)
      FROM normalised,
           regexp_split_to_table(normalised.value, E'\n')
             WITH ORDINALITY AS source_line(line, ordinal);
$KEY$;

COMMENT ON FUNCTION _migration.reviewed_text_key(text) IS
    'Match key for reviewed migration values: normalises CRLF/CR/literal \\n and trims edge whitespace. It never folds Arabic or internal text.';

DO $POSTCONDITIONS$
BEGIN
    IF _migration.reviewed_text_key(E'\r\n  إدارية عليا \r\n') <> 'إدارية عليا' THEN
        RAISE EXCEPTION 'reviewed text key does not ignore edge-only line breaks';
    END IF;
    IF _migration.reviewed_text_key(E'\\nإدارية عليا') <> 'إدارية عليا' THEN
        RAISE EXCEPTION 'reviewed text key does not reconcile literal backslash-n';
    END IF;
    IF _migration.reviewed_text_key(E'عمال\nابتدائي') <> E'عمال\nابتدائي' THEN
        RAISE EXCEPTION 'reviewed text key changed an internal line break';
    END IF;
    IF _migration.reviewed_text_key('القضاء الإداري')
       = _migration.reviewed_text_key('القضاء الإداري بالعباسية') THEN
        RAISE EXCEPTION 'reviewed text key folded two different courts together';
    END IF;
END
$POSTCONDITIONS$;

COMMIT;
