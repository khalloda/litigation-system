-- Task 2.7 permanent reconciliation.
--
-- This query is deliberately independent from the TypeScript transform plan.
-- It reconstructs the expected legacy lawyer, party, role and evidence rows
-- directly from staging, the reviewed database tables, aliases and D7 roles.
-- It is read-only and is shared by db:check, the transform's pre-commit gate
-- and the disposable fixture suite.

WITH
source_rows AS (
    SELECT s.src_record_key,
           s.src_extraction_sha256,
           s.src_file,
           s.src_row_num,
           s."matterID" AS legacy_matter_id,
           s."lawyerA" AS lawyer_a,
           s."lawyerB" AS lawyer_b,
           s."client&Cap" AS client_cap,
           s."opponent&Cap" AS opponent_cap,
           to_jsonb(s) - ARRAY[
               'src_file', 'src_row_num', 'src_record_key',
               'src_extraction_sha256'
           ] AS source_payload,
           m.id AS matter_id,
           parent_q.id AS parent_quarantine_id,
           parent_q.source_payload AS parent_quarantine_payload
      FROM staging."الدعاوى" s
      LEFT JOIN matters m
        ON m.legacy_source_record_key = s.src_record_key
      LEFT JOIN quarantine.matter_transform parent_q
        ON parent_q.src_record_key = s.src_record_key
),
source_cells AS (
    SELECT source.*,
           cell.relationship_kind,
           cell.source_field,
           cell.side,
           cell.raw_value
      FROM source_rows source
      CROSS JOIN LATERAL (
          VALUES
              ('lawyer'::text, 'lawyerA'::text, NULL::text, source.lawyer_a),
              ('lawyer'::text, 'lawyerB'::text, NULL::text, source.lawyer_b),
              ('party'::text, 'client&Cap'::text, 'client'::text, source.client_cap),
              ('party'::text, 'opponent&Cap'::text, 'opponent'::text, source.opponent_cap)
      ) cell(relationship_kind, source_field, side, raw_value)
     WHERE cell.raw_value IS NOT NULL
       AND cell.raw_value <> ''
),
eligible_cells AS (
    SELECT *
      FROM source_cells
     WHERE matter_id IS NOT NULL
       AND parent_quarantine_id IS NULL
),
alias_stats AS (
    SELECT alias_ar,
           count(*)::integer AS match_count,
           min(person_id) AS person_id
      FROM person_name_alias
     GROUP BY alias_ar
),
rule_stats AS (
    SELECT r.id,
           r.raw_value,
           r.occurrences,
           r.reviewer_note,
           count(member.id)::integer AS member_count,
           min(member.ordinal)::integer AS min_ordinal,
           max(member.ordinal)::integer AS max_ordinal,
           count(DISTINCT member.ordinal)::integer AS distinct_ordinals,
           count(DISTINCT member.person_id)::integer AS distinct_people
      FROM migration_multi_person_rule r
      LEFT JOIN migration_multi_person_rule_member member
        ON member.rule_id = r.id
     GROUP BY r.id, r.raw_value, r.occurrences, r.reviewer_note
),
rule_member_alias_defects AS (
    SELECT member.id
      FROM migration_multi_person_rule_member member
      LEFT JOIN alias_stats alias
        ON alias.alias_ar = member.person_name
     WHERE coalesce(alias.match_count, 0) <> 1
        OR alias.person_id IS DISTINCT FROM member.person_id
),
lawyer_resolution AS (
    SELECT cell.*,
           coalesce(alias.match_count, 0) AS alias_matches,
           alias.person_id AS alias_person_id,
           rule.id AS rule_id,
           excluded.raw_value AS excluded_raw_value,
           excluded.reason AS exclusion_reason,
           ((coalesce(alias.match_count, 0) > 0)::integer
             + (rule.id IS NOT NULL)::integer
             + (excluded.raw_value IS NOT NULL)::integer) AS resolution_count
      FROM eligible_cells cell
      LEFT JOIN alias_stats alias
        ON alias.alias_ar = cell.raw_value
      LEFT JOIN migration_multi_person_rule rule
        ON rule.raw_value = cell.raw_value
      LEFT JOIN migration_excluded_name excluded
        ON excluded.raw_value = cell.raw_value
     WHERE cell.relationship_kind = 'lawyer'
),
lawyer_candidates AS (
    SELECT resolution.matter_id,
           resolution.src_record_key,
           resolution.src_extraction_sha256,
           resolution.source_field,
           resolution.raw_value,
           resolution.alias_person_id AS person_id,
           NULL::integer AS reviewed_rule_id,
           1 AS member_ordinal,
           CASE WHEN resolution.source_field = 'lawyerB'
                THEN 'support' ELSE 'lead' END AS lawyer_role
      FROM lawyer_resolution resolution
     WHERE resolution.alias_matches = 1
       AND resolution.rule_id IS NULL
       AND resolution.excluded_raw_value IS NULL
    UNION ALL
    SELECT resolution.matter_id,
           resolution.src_record_key,
           resolution.src_extraction_sha256,
           resolution.source_field,
           resolution.raw_value,
           member.person_id,
           resolution.rule_id,
           member.ordinal,
           CASE WHEN resolution.source_field = 'lawyerB' THEN 'support'
                WHEN member.ordinal = 1 THEN 'lead'
                ELSE 'co_lead' END
      FROM lawyer_resolution resolution
      JOIN migration_multi_person_rule_member member
        ON member.rule_id = resolution.rule_id
     WHERE resolution.alias_matches = 0
       AND resolution.excluded_raw_value IS NULL
),
duplicate_lawyer_people AS (
    SELECT matter_id, person_id
      FROM lawyer_candidates
     GROUP BY matter_id, person_id
    HAVING count(*) > 1
),
duplicate_lawyer_people_by_matter AS (
    SELECT matter_id,
           array_agg(person_id ORDER BY person_id) AS person_ids
      FROM duplicate_lawyer_people
     GROUP BY matter_id
),
duplicate_lawyer_cells AS (
    SELECT DISTINCT candidate.matter_id,
           candidate.src_record_key,
           candidate.source_field
      FROM lawyer_candidates candidate
      JOIN duplicate_lawyer_people duplicate
        ON duplicate.matter_id = candidate.matter_id
       AND duplicate.person_id = candidate.person_id
),
expected_lawyers AS (
    SELECT candidate.*
      FROM lawyer_candidates candidate
     WHERE NOT EXISTS (
         SELECT 1
           FROM duplicate_lawyer_cells duplicate
          WHERE duplicate.src_record_key = candidate.src_record_key
            AND duplicate.source_field = candidate.source_field
     )
),
lawyer_evidence AS (
    SELECT resolution.relationship_kind,
           resolution.source_field,
           resolution.side,
           resolution.src_record_key,
           resolution.src_extraction_sha256 AS extraction_sha256,
           resolution.src_file,
           resolution.src_row_num,
           resolution.legacy_matter_id,
           resolution.raw_value,
           'quarantined'::text AS outcome,
           ARRAY[
               CASE WHEN resolution.alias_matches > 1
                    THEN 'ambiguous_person_alias'
                    WHEN resolution.resolution_count > 1
                    THEN 'ambiguous_reviewed_resolution'
                    ELSE 'unreviewed_person_value' END
           ]::text[] AS reason_codes,
           jsonb_build_array(jsonb_build_object(
               'alias_matches', resolution.alias_matches,
               'rule_matches', (resolution.rule_id IS NOT NULL)::integer,
               'exclusion_matches',
                   (resolution.excluded_raw_value IS NOT NULL)::integer
           )) AS reason_details,
           resolution.source_payload,
           NULL::text AS reviewed_exclusion_raw_value
      FROM lawyer_resolution resolution
     WHERE resolution.resolution_count <> 1
        OR resolution.alias_matches > 1
    UNION ALL
    SELECT resolution.relationship_kind,
           resolution.source_field,
           resolution.side,
           resolution.src_record_key,
           resolution.src_extraction_sha256,
           resolution.src_file,
           resolution.src_row_num,
           resolution.legacy_matter_id,
           resolution.raw_value,
           'excluded',
           ARRAY['reviewed_exclusion']::text[],
           jsonb_build_array(jsonb_build_object(
               'reason', resolution.exclusion_reason
           )),
           resolution.source_payload,
           resolution.excluded_raw_value
      FROM lawyer_resolution resolution
     WHERE resolution.resolution_count = 1
       AND resolution.excluded_raw_value IS NOT NULL
    UNION ALL
    SELECT resolution.relationship_kind,
           resolution.source_field,
           resolution.side,
           resolution.src_record_key,
           resolution.src_extraction_sha256,
           resolution.src_file,
           resolution.src_row_num,
           resolution.legacy_matter_id,
           resolution.raw_value,
           'quarantined',
           ARRAY['duplicate_matter_person']::text[],
           jsonb_build_array(jsonb_build_object(
               'person_ids', to_jsonb(duplicate.person_ids)
           )),
           resolution.source_payload,
           NULL::text
      FROM lawyer_resolution resolution
      JOIN duplicate_lawyer_cells affected
        ON affected.src_record_key = resolution.src_record_key
       AND affected.source_field = resolution.source_field
      JOIN duplicate_lawyer_people_by_matter duplicate
        ON duplicate.matter_id = resolution.matter_id
),
party_cells AS (
    SELECT cell.*,
           excluded.reason AS whole_exclusion_reason,
           excluded.raw_value AS whole_exclusion_raw_value
      FROM eligible_cells cell
      LEFT JOIN migration_excluded_name excluded
        ON excluded.raw_value = cell.raw_value
     WHERE cell.relationship_kind = 'party'
),
party_lines_unfiltered AS (
    SELECT cell.src_record_key,
           cell.source_field,
           line.line_number::integer AS line_number,
           btrim(line.raw_line) AS line_text
      FROM party_cells cell
      CROSS JOIN LATERAL regexp_split_to_table(
          cell.raw_value, E'\r\n|\r|\n'
      ) WITH ORDINALITY AS line(raw_line, line_number)
     WHERE cell.whole_exclusion_raw_value IS NULL
),
party_lines AS (
    SELECT line.*,
           (line.line_text ~ '^"[\s\S]*"$') AS is_quoted,
           (position('"' in line.line_text) > 0) AS contains_quote,
           count(*) FILTER (WHERE line.line_text !~ '^"[\s\S]*"$')
             OVER (
               PARTITION BY line.src_record_key, line.source_field
               ORDER BY line.line_number
             )::integer AS party_ordinal,
           count(*) FILTER (WHERE line.line_text !~ '^"[\s\S]*"$')
             OVER (
               PARTITION BY line.src_record_key, line.source_field
               ORDER BY line.line_number
               ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
             )::integer AS prior_party_count
      FROM party_lines_unfiltered line
     WHERE line.line_text <> ''
),
party_role_tokens AS (
    SELECT line.src_record_key,
           line.source_field,
           line.line_number,
           line.party_ordinal,
           token.token_in_line::integer,
           btrim(token.raw_token) AS role_text
      FROM party_lines line
      CROSS JOIN LATERAL regexp_split_to_table(
          substring(line.line_text FROM 2 FOR char_length(line.line_text) - 2),
          '[،,]'
      ) WITH ORDINALITY AS token(raw_token, token_in_line)
     WHERE line.is_quoted
       AND btrim(token.raw_token) <> ''
),
party_role_matches AS (
    SELECT token.*,
           count(role.id)::integer AS match_count,
           min(role.id) AS role_id,
           min(
               CASE WHEN role.label_ar_m = role.label_ar_f THEN NULL
                    WHEN role.label_ar_m = token.role_text THEN 'm'
                    ELSE 'f' END
           ) AS role_gender
      FROM party_role_tokens token
      LEFT JOIN lookup_party_role role
        ON role.label_ar_m = token.role_text
        OR role.label_ar_f = token.role_text
     GROUP BY token.src_record_key, token.source_field, token.line_number,
              token.party_ordinal, token.token_in_line, token.role_text
),
party_role_sequence_base AS (
    SELECT matched.*,
           row_number() OVER (
               PARTITION BY matched.src_record_key, matched.source_field,
                            matched.party_ordinal
               ORDER BY matched.line_number, matched.token_in_line
           )::integer AS role_ordinal,
           array_agg(matched.role_id) FILTER (
               WHERE matched.match_count = 1
           ) OVER (
               PARTITION BY matched.src_record_key, matched.source_field,
                            matched.party_ordinal
               ORDER BY matched.line_number, matched.token_in_line
               ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
           ) AS prior_role_ids,
           array_agg(matched.role_gender) FILTER (
               WHERE matched.match_count = 1
                 AND matched.role_gender IS NOT NULL
           ) OVER (
               PARTITION BY matched.src_record_key, matched.source_field,
                            matched.party_ordinal
               ORDER BY matched.line_number, matched.token_in_line
               ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
           ) AS prior_genders
      FROM party_role_matches matched
),
party_role_sequence AS (
    SELECT base.*,
           CASE WHEN base.role_id = ANY(base.prior_role_ids)
                THEN 1 ELSE 0 END AS prior_same_role,
           CASE WHEN base.role_gender IS NOT NULL
                  AND EXISTS (
                      SELECT 1
                        FROM unnest(base.prior_genders) prior(gender)
                       WHERE prior.gender IS DISTINCT FROM base.role_gender
                  )
                THEN 1 ELSE 0 END AS prior_other_gender
      FROM party_role_sequence_base base
),
party_error_candidates AS (
    SELECT cell.src_record_key,
           cell.source_field,
           0 AS line_number,
           0 AS token_number,
           0 AS error_order,
           'empty_party_value'::text AS reason_code,
           '{}'::jsonb AS reason_detail
      FROM party_cells cell
     WHERE cell.whole_exclusion_raw_value IS NULL
       AND NOT EXISTS (
           SELECT 1 FROM party_lines line
            WHERE line.src_record_key = cell.src_record_key
              AND line.source_field = cell.source_field
       )
    UNION ALL
    SELECT line.src_record_key,
           line.source_field,
           line.line_number,
           0,
           1,
           'malformed_party_quotes',
           jsonb_build_object('line', line.line_number, 'value', line.line_text)
      FROM party_lines line
     WHERE NOT line.is_quoted AND line.contains_quote
    UNION ALL
    SELECT line.src_record_key,
           line.source_field,
           line.line_number,
           0,
           2,
           'reviewed_exclusion_fragment',
           jsonb_build_object('line', line.line_number, 'value', line.line_text)
      FROM party_lines line
      JOIN migration_excluded_name excluded
        ON excluded.raw_value = line.line_text
     WHERE NOT line.is_quoted
    UNION ALL
    SELECT line.src_record_key,
           line.source_field,
           line.line_number,
           0,
           1,
           'party_role_without_name',
           jsonb_build_object('line', line.line_number, 'value', line.line_text)
      FROM party_lines line
     WHERE line.is_quoted AND line.prior_party_count = 0
    UNION ALL
    SELECT line.src_record_key,
           line.source_field,
           line.line_number,
           0,
           2,
           'empty_party_role',
           jsonb_build_object('line', line.line_number)
      FROM party_lines line
     WHERE line.is_quoted
       AND NOT EXISTS (
           SELECT 1 FROM party_role_tokens token
            WHERE token.src_record_key = line.src_record_key
              AND token.source_field = line.source_field
              AND token.line_number = line.line_number
       )
    UNION ALL
    SELECT token.src_record_key,
           token.source_field,
           token.line_number,
           token.token_in_line,
           3,
           CASE WHEN token.match_count = 0 THEN 'unreviewed_party_role'
                ELSE 'ambiguous_party_role' END,
           jsonb_build_object(
               'line', token.line_number,
               'value', token.role_text,
               'matches', token.match_count
           )
      FROM party_role_sequence token
     WHERE token.match_count <> 1
    UNION ALL
    SELECT token.src_record_key,
           token.source_field,
           token.line_number,
           token.token_in_line,
           4,
           'duplicate_party_role',
           jsonb_build_object('line', token.line_number, 'value', token.role_text)
      FROM party_role_sequence token
     WHERE token.match_count = 1
       AND token.prior_same_role > 0
    UNION ALL
    SELECT token.src_record_key,
           token.source_field,
           token.line_number,
           token.token_in_line,
           5,
           'conflicting_party_gender',
           jsonb_build_object('line', token.line_number, 'value', token.role_text)
      FROM party_role_sequence token
     WHERE token.match_count = 1
       AND token.prior_same_role = 0
       AND token.prior_other_gender > 0
),
party_first_error AS (
    SELECT ranked.src_record_key,
           ranked.source_field,
           ranked.reason_code,
           ranked.reason_detail
      FROM (
          SELECT candidate.*,
                 row_number() OVER (
                     PARTITION BY candidate.src_record_key,
                                  candidate.source_field
                     ORDER BY candidate.line_number,
                              candidate.token_number,
                              candidate.error_order
                 ) AS choice
            FROM party_error_candidates candidate
      ) ranked
     WHERE ranked.choice = 1
),
safe_party_cells AS (
    SELECT cell.*
      FROM party_cells cell
     WHERE cell.whole_exclusion_raw_value IS NULL
       AND NOT EXISTS (
           SELECT 1 FROM party_first_error error
            WHERE error.src_record_key = cell.src_record_key
              AND error.source_field = cell.source_field
       )
),
expected_parties AS (
    SELECT cell.matter_id,
           cell.side,
           line.line_text AS party_name,
           (
               SELECT min(token.role_gender)
                 FROM party_role_sequence token
                WHERE token.src_record_key = line.src_record_key
                  AND token.source_field = line.source_field
                  AND token.party_ordinal = line.party_ordinal
                  AND token.role_gender IS NOT NULL
           ) AS gender,
           line.party_ordinal AS ordinal,
           cell.raw_value AS legacy_raw,
           cell.src_record_key,
           cell.src_extraction_sha256,
           cell.source_field,
           line.party_ordinal AS fragment_ordinal
      FROM safe_party_cells cell
      JOIN party_lines line
        ON line.src_record_key = cell.src_record_key
       AND line.source_field = cell.source_field
     WHERE NOT line.is_quoted
),
expected_party_roles AS (
    SELECT token.src_record_key,
           token.source_field,
           token.party_ordinal AS fragment_ordinal,
           token.role_id,
           token.role_ordinal AS ordinal,
           token.role_text AS legacy_role_raw
      FROM party_role_sequence token
      JOIN safe_party_cells cell
        ON cell.src_record_key = token.src_record_key
       AND cell.source_field = token.source_field
),
party_evidence AS (
    SELECT cell.relationship_kind,
           cell.source_field,
           cell.side,
           cell.src_record_key,
           cell.src_extraction_sha256 AS extraction_sha256,
           cell.src_file,
           cell.src_row_num,
           cell.legacy_matter_id,
           cell.raw_value,
           'excluded'::text AS outcome,
           ARRAY['reviewed_exclusion']::text[] AS reason_codes,
           jsonb_build_array(jsonb_build_object(
               'reason', cell.whole_exclusion_reason
           )) AS reason_details,
           cell.source_payload,
           cell.whole_exclusion_raw_value AS reviewed_exclusion_raw_value
      FROM party_cells cell
     WHERE cell.whole_exclusion_raw_value IS NOT NULL
    UNION ALL
    SELECT cell.relationship_kind,
           cell.source_field,
           cell.side,
           cell.src_record_key,
           cell.src_extraction_sha256,
           cell.src_file,
           cell.src_row_num,
           cell.legacy_matter_id,
           cell.raw_value,
           'quarantined',
           ARRAY[error.reason_code]::text[],
           jsonb_build_array(error.reason_detail),
           cell.source_payload,
           NULL::text
      FROM party_cells cell
      JOIN party_first_error error
        ON error.src_record_key = cell.src_record_key
       AND error.source_field = cell.source_field
),
expected_evidence AS (
    SELECT * FROM lawyer_evidence
    UNION ALL
    SELECT * FROM party_evidence
),
expected_lawyer_payloads AS (
    SELECT jsonb_build_object(
               'matter_id', matter_id,
               'person_id', person_id,
               'role', lawyer_role,
               'position', member_ordinal,
               'legacy_source', raw_value,
               'legacy_source_record_key', src_record_key,
               'legacy_source_extraction_sha256', src_extraction_sha256,
               'source_field', source_field,
               'reviewed_rule_id', reviewed_rule_id,
               'source_member_ordinal', member_ordinal
           ) AS payload
      FROM expected_lawyers
),
actual_lawyer_payloads AS (
    SELECT jsonb_build_object(
               'matter_id', matter_id,
               'person_id', person_id,
               'role', role,
               'position', position,
               'legacy_source', legacy_source,
               'legacy_source_record_key', legacy_source_record_key,
               'legacy_source_extraction_sha256', legacy_source_extraction_sha256,
               'source_field', source_field,
               'reviewed_rule_id', reviewed_rule_id,
               'source_member_ordinal', source_member_ordinal
           ) AS payload
      FROM matter_lawyers
     WHERE legacy_source_record_key IS NOT NULL
),
expected_party_payloads AS (
    SELECT jsonb_build_object(
               'matter_id', matter_id,
               'side', side,
               'party_name', party_name,
               'gender', gender,
               'ordinal', ordinal,
               'legacy_raw', legacy_raw,
               'legacy_source_record_key', src_record_key,
               'legacy_source_extraction_sha256', src_extraction_sha256,
               'source_field', source_field,
               'source_fragment_ordinal', fragment_ordinal
           ) AS payload
      FROM expected_parties
),
actual_party_payloads AS (
    SELECT jsonb_build_object(
               'matter_id', matter_id,
               'side', side,
               'party_name', party_name,
               'gender', gender,
               'ordinal', ordinal,
               'legacy_raw', legacy_raw,
               'legacy_source_record_key', legacy_source_record_key,
               'legacy_source_extraction_sha256', legacy_source_extraction_sha256,
               'source_field', source_field,
               'source_fragment_ordinal', source_fragment_ordinal
           ) AS payload
      FROM matter_parties
     WHERE legacy_source_record_key IS NOT NULL
),
expected_role_payloads AS (
    SELECT jsonb_build_object(
               'legacy_source_record_key', src_record_key,
               'source_field', source_field,
               'source_fragment_ordinal', fragment_ordinal,
               'role_id', role_id,
               'ordinal', ordinal,
               'legacy_role_raw', legacy_role_raw
           ) AS payload
      FROM expected_party_roles
),
actual_role_payloads AS (
    SELECT jsonb_build_object(
               'legacy_source_record_key', party.legacy_source_record_key,
               'source_field', party.source_field,
               'source_fragment_ordinal', party.source_fragment_ordinal,
               'role_id', role.role_id,
               'ordinal', role.ordinal,
               'legacy_role_raw', role.legacy_role_raw
           ) AS payload
      FROM matter_party_roles role
      JOIN matter_parties party
        ON party.id = role.party_id
     WHERE party.legacy_source_record_key IS NOT NULL
),
expected_evidence_payloads AS (
    SELECT to_jsonb(evidence) AS payload
      FROM expected_evidence evidence
),
actual_evidence_payloads AS (
    SELECT jsonb_build_object(
               'relationship_kind', relationship_kind,
               'source_field', source_field,
               'side', side,
               'src_record_key', src_record_key,
               'extraction_sha256', extraction_sha256,
               'src_file', src_file,
               'src_row_num', src_row_num,
               'legacy_matter_id', legacy_matter_id,
               'raw_value', raw_value,
               'outcome', outcome,
               'reason_codes', reason_codes,
               'reason_details', reason_details,
               'source_payload', source_payload,
               'reviewed_exclusion_raw_value', reviewed_exclusion_raw_value
           ) AS payload
      FROM quarantine.matter_relationship_transform
),
expected_target_cells AS (
    SELECT DISTINCT src_record_key, source_field FROM expected_lawyers
    UNION
    SELECT DISTINCT src_record_key, source_field FROM expected_parties
),
expected_evidence_cells AS (
    SELECT src_record_key, source_field, outcome FROM expected_evidence
),
actual_target_cells AS (
    SELECT legacy_source_record_key AS src_record_key, source_field
      FROM matter_lawyers
     WHERE legacy_source_record_key IS NOT NULL
    UNION
    SELECT legacy_source_record_key, source_field
      FROM matter_parties
     WHERE legacy_source_record_key IS NOT NULL
),
actual_evidence_cells AS (
    SELECT src_record_key, source_field, outcome
      FROM quarantine.matter_relationship_transform
),
expected_cell_outcomes AS (
    SELECT cell.src_record_key,
           cell.source_field,
           (target.src_record_key IS NOT NULL) AS has_target,
           (evidence.src_record_key IS NOT NULL) AS has_evidence,
           evidence.outcome
      FROM eligible_cells cell
      LEFT JOIN expected_target_cells target
        ON target.src_record_key = cell.src_record_key
       AND target.source_field = cell.source_field
      LEFT JOIN expected_evidence_cells evidence
        ON evidence.src_record_key = cell.src_record_key
       AND evidence.source_field = cell.source_field
),
actual_cell_outcomes AS (
    SELECT cell.src_record_key,
           cell.source_field,
           (target.src_record_key IS NOT NULL) AS has_target,
           (evidence.src_record_key IS NOT NULL) AS has_evidence,
           evidence.outcome
      FROM eligible_cells cell
      LEFT JOIN actual_target_cells target
        ON target.src_record_key = cell.src_record_key
       AND target.source_field = cell.source_field
      LEFT JOIN actual_evidence_cells evidence
        ON evidence.src_record_key = cell.src_record_key
       AND evidence.source_field = cell.source_field
),
result AS (
    SELECT
        (SELECT count(*) FROM source_rows) AS source_matters,
        (SELECT count(*) FROM source_rows WHERE matter_id IS NOT NULL) AS transformed_matters,
        (SELECT count(*) FROM source_rows WHERE parent_quarantine_id IS NOT NULL) AS parent_quarantined_matters,
        (SELECT count(*) FROM source_rows
          WHERE (matter_id IS NOT NULL)::integer
              + (parent_quarantine_id IS NOT NULL)::integer <> 1) AS parent_partition_defects,
        (SELECT count(*) FROM source_cells) AS all_source_cells,
        (SELECT count(*) FROM eligible_cells) AS transformed_parent_cells,
        (SELECT count(*) FROM source_cells WHERE parent_quarantine_id IS NOT NULL) AS parent_quarantined_cells,
        (SELECT count(*) FROM source_cells
          WHERE (matter_id IS NOT NULL)::integer
              + (parent_quarantine_id IS NOT NULL)::integer <> 1) AS cell_partition_defects,
        (SELECT count(*) FROM source_cells
          WHERE parent_quarantine_id IS NOT NULL
            AND parent_quarantine_payload IS DISTINCT FROM source_payload) AS parent_quarantine_payload_mismatches,
        (SELECT count(*) FROM migration_multi_person_rule) AS rule_count,
        (SELECT count(*) FROM migration_multi_person_rule_member) AS rule_member_count,
        (SELECT count(*) FROM migration_excluded_name) AS exclusion_count,
        (SELECT count(*) FROM rule_stats WHERE member_count = 0) AS empty_rules,
        (SELECT count(*) FROM rule_stats
          WHERE member_count > 0 AND (
              min_ordinal <> 1 OR max_ordinal <> member_count
              OR distinct_ordinals <> member_count
          )) AS rule_ordinal_defects,
        (SELECT count(*) FROM rule_stats
          WHERE distinct_people <> member_count) AS rule_duplicate_person_defects,
        (SELECT count(*) FROM rule_member_alias_defects) AS rule_member_alias_defects,
        (SELECT count(*) FROM expected_lawyers) AS expected_lawyers,
        (SELECT count(*) FROM actual_lawyer_payloads) AS actual_lawyers,
        (SELECT count(*) FROM (
            SELECT payload FROM expected_lawyer_payloads
            EXCEPT ALL
            SELECT payload FROM actual_lawyer_payloads
        ) missing) AS missing_lawyers,
        (SELECT count(*) FROM (
            SELECT payload FROM actual_lawyer_payloads
            EXCEPT ALL
            SELECT payload FROM expected_lawyer_payloads
        ) extra) AS extra_lawyers,
        (SELECT count(*) FROM expected_parties) AS expected_parties,
        (SELECT count(*) FROM actual_party_payloads) AS actual_parties,
        (SELECT count(*) FROM (
            SELECT payload FROM expected_party_payloads
            EXCEPT ALL
            SELECT payload FROM actual_party_payloads
        ) missing) AS missing_parties,
        (SELECT count(*) FROM (
            SELECT payload FROM actual_party_payloads
            EXCEPT ALL
            SELECT payload FROM expected_party_payloads
        ) extra) AS extra_parties,
        (SELECT count(*) FROM expected_party_roles) AS expected_party_roles,
        (SELECT count(*) FROM actual_role_payloads) AS actual_party_roles,
        (SELECT count(*) FROM (
            SELECT payload FROM expected_role_payloads
            EXCEPT ALL
            SELECT payload FROM actual_role_payloads
        ) missing) AS missing_party_roles,
        (SELECT count(*) FROM (
            SELECT payload FROM actual_role_payloads
            EXCEPT ALL
            SELECT payload FROM expected_role_payloads
        ) extra) AS extra_party_roles,
        (SELECT count(*) FROM expected_evidence) AS expected_evidence,
        (SELECT count(*) FROM actual_evidence_payloads) AS actual_evidence,
        (SELECT count(*) FROM (
            SELECT payload FROM expected_evidence_payloads
            EXCEPT ALL
            SELECT payload FROM actual_evidence_payloads
        ) missing) AS missing_evidence,
        (SELECT count(*) FROM (
            SELECT payload FROM actual_evidence_payloads
            EXCEPT ALL
            SELECT payload FROM expected_evidence_payloads
        ) extra) AS extra_evidence,
        (SELECT count(*) FROM expected_cell_outcomes
          WHERE has_target AND has_evidence) AS expected_both_outcomes,
        (SELECT count(*) FROM expected_cell_outcomes
          WHERE NOT has_target AND NOT has_evidence) AS expected_neither_outcome,
        (SELECT count(*) FROM actual_cell_outcomes
          WHERE has_target AND has_evidence) AS actual_both_outcomes,
        (SELECT count(*) FROM actual_cell_outcomes
          WHERE NOT has_target AND NOT has_evidence) AS actual_neither_outcome,
        (SELECT count(*) FROM actual_cell_outcomes
          WHERE has_target AND has_evidence AND outcome = 'excluded') AS excluded_with_target,
        (SELECT count(*) FROM actual_cell_outcomes
          WHERE has_target AND has_evidence AND outcome = 'quarantined') AS quarantined_with_target,
        (SELECT count(*) FROM actual_evidence_cells evidence
          JOIN source_cells cell USING (src_record_key, source_field)
         WHERE cell.parent_quarantine_id IS NOT NULL) AS duplicated_parent_quarantine_evidence
)
SELECT * FROM result;
