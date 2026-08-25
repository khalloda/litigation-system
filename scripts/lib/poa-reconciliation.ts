import type { ClientBase } from 'pg';

export type PoaReconciliation = {
  defects: string[];
  sourceCount: number;
  targetCount: number;
  lawyerCount: number;
  transformQuarantineCount: number;
  relationshipEvidenceCount: number;
};

const SOURCE = `
  SELECT p.*,
         to_jsonb(p)-ARRAY['src_file','src_row_num','src_record_key','src_extraction_sha256'] source_payload,
         (p."جرد" IN ('true','false')
          AND (p."عدد النسخ" IS NULL OR
               (p."عدد النسخ" ~ '^[0-9]+$' AND pg_input_is_valid(p."عدد النسخ",'integer')))
          AND (p."تاريخ الإصدار" IS NULL OR
               (p."تاريخ الإصدار" ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2} 00:00:00$'
                AND pg_input_is_valid(left(p."تاريخ الإصدار",10),'date')))) safe
    FROM staging."التوكيلات" p`;

function describe(label: string, count: number, examples: string[]): string | null {
  return count === 0
    ? null
    : `${label}: ${count}${examples.length === 0 ? '' : ` (${examples.join(', ')})`}`;
}

export async function reconcilePowersOfAttorney(
  db: ClientBase,
  expectedCorrectedOccurrences: readonly number[] = [8, 0, 1],
): Promise<PoaReconciliation> {
  const defects: string[] = [];
  const counts = await db.query<{
    source_count: number;
    target_count: number;
    lawyer_count: number;
    transform_q: number;
    relation_q: number;
  }>(`
    SELECT (SELECT count(*)::int FROM staging."التوكيلات") source_count,
           (SELECT count(*)::int FROM powers_of_attorney WHERE legacy_source_record_key IS NOT NULL) target_count,
           (SELECT count(*)::int FROM power_of_attorney_lawyers WHERE legacy_source_record_key IS NOT NULL) lawyer_count,
           (SELECT count(*)::int FROM quarantine.power_of_attorney_transform) transform_q,
           (SELECT count(*)::int FROM quarantine.power_of_attorney_relationship) relation_q`);
  const count = counts.rows[0]!;

  const ruleState = await db.query<{
    rules: number;
    members: number;
    exclusions: number;
    occurrences: number[];
    poa_rule_digest: string;
  }>(`
    SELECT (SELECT count(*)::int FROM migration_multi_person_rule) rules,
           (SELECT count(*)::int FROM migration_multi_person_rule_member) members,
           (SELECT count(*)::int FROM migration_excluded_name) exclusions,
           ARRAY(SELECT (SELECT count(*)::int FROM staging."التوكيلات" p
                          WHERE position(r.raw_value in p."المحامون الصادر لهم التوكيل")>0)
                   FROM migration_multi_person_rule r WHERE r.poa_match_mode='substring' ORDER BY r.id) occurrences,
           (SELECT encode(sha256(convert_to(string_agg(
             r.id::text||'|'||r.raw_value||'|'||m.ordinal::text||'|'||m.person_id::text||'|'||m.person_name,
             E'\\n' ORDER BY r.id,m.ordinal),'UTF8')),'hex')
              FROM migration_multi_person_rule r
              JOIN migration_multi_person_rule_member m ON m.rule_id=r.id
             WHERE r.poa_match_mode='substring') poa_rule_digest`);
  const rules = ruleState.rows[0]!;
  if (rules.rules !== 33 || rules.members !== 84 || rules.exclusions !== 38)
    defects.push(
      `reviewed rule tables ${rules.rules}/${rules.members}/${rules.exclusions}, expected 33/84/38`,
    );
  if (JSON.stringify(rules.occurrences) !== JSON.stringify(expectedCorrectedOccurrences))
    defects.push(
      `corrected POA occurrences ${rules.occurrences.join('/')}, expected ${expectedCorrectedOccurrences.join('/')}`,
    );
  if (rules.poa_rule_digest !== 'e2325dfcb8faa5259869a0820b7ed6d2ae5a43edaec099411bd01ee21b3d7d42')
    defects.push(`approved POA rule/member digest changed: ${rules.poa_rule_digest}`);

  const targetMismatch = await db.query<{ n: number; examples: string[] }>(`
    WITH source AS (${SOURCE}), expected AS (
      SELECT s.src_record_key,s.src_extraction_sha256,c.id client_id,s."العميل" client_name,
             s."المحامون الصادر لهم التوكيل" legacy_lawyers_raw,s."مسلسل" serial_no,
             s."اسم الموكل" principal_name,s."الصفة" poa_capacity,
             s."صفة الموكل بالتوكيل" poa_capacity_duplicate,s."رقم التوكيل" poa_number,
             s."حرف" poa_letter,s."السنة" poa_year,s."جهة الإصدار" issuing_authority,
             CASE WHEN s."تاريخ الإصدار" IS NULL THEN NULL ELSE left(s."تاريخ الإصدار",10)::date END issue_date,
             CASE WHEN s."عدد النسخ" IS NULL THEN NULL ELSE s."عدد النسخ"::int END copies_count,
             s."ملاحظات" notes,(s."جرد"='true') show_on_poa_report,s.source_payload
        FROM source s LEFT JOIN clients c ON c.legacy_id::text=s."clientID"
       WHERE s.safe IS TRUE
    ), actual AS (
      SELECT legacy_source_record_key src_record_key,legacy_source_extraction_sha256 src_extraction_sha256,
             client_id,client_name,legacy_lawyers_raw,serial_no,principal_name,poa_capacity,
             poa_capacity_duplicate,poa_number,poa_letter,poa_year,issuing_authority,
             issue_date,copies_count,notes,show_on_poa_report,legacy_source_payload source_payload,
             legacy_id
        FROM powers_of_attorney WHERE legacy_source_record_key IS NOT NULL
    ), bad AS (
      SELECT coalesce(e.src_record_key,a.src_record_key) key
        FROM expected e FULL JOIN actual a USING (src_record_key)
       WHERE e.src_record_key IS NULL OR a.src_record_key IS NULL
          OR a.legacy_id IS NOT NULL
          OR to_jsonb(e)-'src_record_key' IS DISTINCT FROM to_jsonb(a)-ARRAY['src_record_key','legacy_id']
    ) SELECT count(*)::int n,coalesce(array_agg(key ORDER BY key) FILTER (WHERE rn<=5),'{}') examples
        FROM (SELECT key,row_number() OVER (ORDER BY key) rn FROM bad) x`);
  const target = targetMismatch.rows[0]!;
  const targetDefect = describe('POA target/source mismatch', target.n, target.examples);
  if (targetDefect) defects.push(targetDefect);

  const transformMismatch = await db.query<{ n: number; examples: string[] }>(`
    WITH source AS (${SOURCE}), reasons AS (
      SELECT s.*,x.code,x.detail FROM source s CROSS JOIN LATERAL (
        SELECT 'invalid_copies_count' code,jsonb_build_object('value',s."عدد النسخ") detail
         WHERE s."عدد النسخ" IS NOT NULL AND NOT (
           s."عدد النسخ" ~ '^[0-9]+$' AND pg_input_is_valid(s."عدد النسخ",'integer'))
        UNION ALL SELECT 'invalid_issue_date',jsonb_build_object('value',s."تاريخ الإصدار")
         WHERE s."تاريخ الإصدار" IS NOT NULL AND NOT (
           s."تاريخ الإصدار" ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2} 00:00:00$'
           AND pg_input_is_valid(left(s."تاريخ الإصدار",10),'date'))
        UNION ALL SELECT 'invalid_show_on_poa_report',jsonb_build_object('value',s."جرد")
         WHERE s."جرد" IS NULL OR s."جرد" NOT IN ('true','false')
      ) x WHERE s.safe IS NOT TRUE
    ), expected AS (
      SELECT src_record_key,src_extraction_sha256 extraction_sha256,src_file,src_row_num,
             array_agg(code ORDER BY code) reason_codes,jsonb_agg(detail ORDER BY code) reason_details,
             source_payload FROM reasons GROUP BY src_record_key,src_extraction_sha256,src_file,src_row_num,source_payload
    ), actual AS (
      SELECT src_record_key,extraction_sha256,src_file,src_row_num,reason_codes,reason_details,source_payload
        FROM quarantine.power_of_attorney_transform
    ), bad AS (
      SELECT coalesce(e.src_record_key,a.src_record_key) key FROM expected e FULL JOIN actual a USING(src_record_key)
       WHERE e.src_record_key IS NULL OR a.src_record_key IS NULL
          OR to_jsonb(e)-'src_record_key' IS DISTINCT FROM to_jsonb(a)-'src_record_key'
    ) SELECT count(*)::int n,coalesce(array_agg(key ORDER BY key) FILTER(WHERE rn<=5),'{}') examples
        FROM (SELECT key,row_number() OVER(ORDER BY key) rn FROM bad) x`);
  const tq = transformMismatch.rows[0]!;
  const tqDefect = describe('POA transform quarantine mismatch', tq.n, tq.examples);
  if (tqDefect) defects.push(tqDefect);

  const lawyerMismatch = await db.query<{ n: number; examples: string[] }>(`
    WITH source AS (${SOURCE}), matches AS (
      SELECT s.src_record_key,s.src_extraction_sha256,s."المحامون الصادر لهم التوكيل" raw,
             r.id rule_id,count(*) OVER(PARTITION BY s.src_record_key) match_count
        FROM source s JOIN migration_multi_person_rule r
          ON CASE WHEN r.poa_match_mode='substring'
                  THEN position(r.raw_value in s."المحامون الصادر لهم التوكيل")>0
                  ELSE r.raw_value=s."المحامون الصادر لهم التوكيل" END
       WHERE s.safe IS TRUE
    ), expected AS (
      SELECT m.src_record_key,m.src_extraction_sha256,m.raw legacy_lawyers_raw,
             rm.person_id,m.rule_id reviewed_rule_id,rm.ordinal source_member_ordinal
        FROM matches m JOIN migration_multi_person_rule_member rm ON rm.rule_id=m.rule_id
       WHERE m.match_count=1
      UNION ALL
      SELECT s.src_record_key,s.src_extraction_sha256,s."المحامون الصادر لهم التوكيل",
             a.person_id,NULL::int,1
        FROM source s JOIN person_name_alias a ON a.alias_ar=s."المحامون الصادر لهم التوكيل"
       WHERE s.safe IS TRUE AND NOT EXISTS(SELECT 1 FROM matches m WHERE m.src_record_key=s.src_record_key)
    ), actual AS (
      SELECT l.legacy_source_record_key src_record_key,l.legacy_source_extraction_sha256 src_extraction_sha256,
             l.legacy_lawyers_raw,l.person_id,l.reviewed_rule_id,l.source_member_ordinal
        FROM power_of_attorney_lawyers l WHERE l.legacy_source_record_key IS NOT NULL
    ), bad AS (
      (SELECT * FROM expected EXCEPT SELECT * FROM actual)
      UNION ALL (SELECT * FROM actual EXCEPT SELECT * FROM expected)
    ) SELECT count(*)::int n,coalesce((array_agg(src_record_key ORDER BY src_record_key))[1:5],'{}') examples FROM bad`);
  const lawyersMismatch = lawyerMismatch.rows[0]!;
  const lawyerDefect = describe(
    'POA reviewed lawyer mismatch',
    lawyersMismatch.n,
    lawyersMismatch.examples,
  );
  if (lawyerDefect) defects.push(lawyerDefect);

  const evidenceMismatch = await db.query<{ n: number; examples: string[] }>(`
    WITH source AS (${SOURCE}), matches AS (
      SELECT s.src_record_key,r.id rule_id,r.raw_value,
             count(*) OVER(PARTITION BY s.src_record_key) match_count,
             count(rm.*)::int member_count
        FROM source s JOIN migration_multi_person_rule r
          ON CASE WHEN r.poa_match_mode='substring'
                  THEN position(r.raw_value in s."المحامون الصادر لهم التوكيل")>0
                  ELSE r.raw_value=s."المحامون الصادر لهم التوكيل" END
        JOIN migration_multi_person_rule_member rm ON rm.rule_id=r.id
       WHERE s.safe IS TRUE GROUP BY s.src_record_key,r.id,r.raw_value
    ), grouped AS (
      SELECT src_record_key,array_agg(rule_id ORDER BY rule_id) rule_ids,max(match_count)::int match_count,
             max(member_count)::int member_count,min(raw_value) rule_raw
        FROM matches GROUP BY src_record_key
    ), expected AS (
      SELECT s.src_record_key,'client' relationship_kind,s.src_extraction_sha256 extraction_sha256,
             s.src_file,s.src_row_num,s."clientID" raw_value,'{}'::int[] reviewed_rule_ids,0 resolved_member_count,
             ARRAY[CASE WHEN s."clientID" IS NULL THEN 'missing_client_link' ELSE 'unresolved_client_link' END] reason_codes,
             jsonb_build_array(jsonb_build_object('clientID',s."clientID")) reason_details,s.source_payload
        FROM source s LEFT JOIN clients c ON c.legacy_id::text=s."clientID"
       WHERE s.safe IS TRUE AND c.id IS NULL
      UNION ALL
      SELECT s.src_record_key,'lawyers',s.src_extraction_sha256,s.src_file,s.src_row_num,
             s."المحامون الصادر لهم التوكيل",g.rule_ids,0,
             ARRAY['overlapping_reviewed_rules'],
             jsonb_build_array(jsonb_build_object('value',s."المحامون الصادر لهم التوكيل",'rule_ids',to_jsonb(g.rule_ids))),s.source_payload
        FROM source s JOIN grouped g USING(src_record_key) WHERE s.safe IS TRUE AND g.match_count>1
      UNION ALL
      SELECT s.src_record_key,'lawyers',s.src_extraction_sha256,s.src_file,s.src_row_num,
             s."المحامون الصادر لهم التوكيل",g.rule_ids,g.member_count,
             ARRAY['partially_reviewed_compound_value'],
             jsonb_build_array(jsonb_build_object('value',s."المحامون الصادر لهم التوكيل",
               'reviewed_rule_id',g.rule_ids[1],
               'unreviewed_remainder',replace(s."المحامون الصادر لهم التوكيل",g.rule_raw,''))),s.source_payload
        FROM source s JOIN grouped g USING(src_record_key)
       WHERE s.safe IS TRUE AND g.match_count=1 AND s."المحامون الصادر لهم التوكيل"<>g.rule_raw
      UNION ALL
      SELECT s.src_record_key,'lawyers',s.src_extraction_sha256,s.src_file,s.src_row_num,
             s."المحامون الصادر لهم التوكيل",'{}'::int[],0,
             ARRAY[CASE WHEN e.raw_value IS NULL THEN 'unreviewed_lawyer_value' ELSE 'reviewed_exclusion' END],
             jsonb_build_array(CASE WHEN e.raw_value IS NULL
               THEN jsonb_build_object('value',s."المحامون الصادر لهم التوكيل")
               ELSE jsonb_build_object('value',s."المحامون الصادر لهم التوكيل",'reason',e.reason) END),s.source_payload
        FROM source s LEFT JOIN grouped g USING(src_record_key)
        LEFT JOIN person_name_alias a ON a.alias_ar=s."المحامون الصادر لهم التوكيل"
        LEFT JOIN migration_excluded_name e ON e.raw_value=s."المحامون الصادر لهم التوكيل"
       WHERE s.safe IS TRUE AND s."المحامون الصادر لهم التوكيل" IS NOT NULL
         AND s."المحامون الصادر لهم التوكيل"<>'' AND g.src_record_key IS NULL AND a.id IS NULL
    ), actual AS (
      SELECT src_record_key,relationship_kind,extraction_sha256,src_file,src_row_num,
             raw_value,reviewed_rule_ids,resolved_member_count,reason_codes,reason_details,source_payload
        FROM quarantine.power_of_attorney_relationship
    ), bad AS (
      SELECT coalesce(e.src_record_key,a.src_record_key) key
        FROM expected e FULL JOIN actual a USING(src_record_key,relationship_kind)
       WHERE e.src_record_key IS NULL OR a.src_record_key IS NULL
          OR to_jsonb(e)-ARRAY['src_record_key','relationship_kind']
             IS DISTINCT FROM to_jsonb(a)-ARRAY['src_record_key','relationship_kind']
    ) SELECT count(*)::int n,coalesce(array_agg(key ORDER BY key) FILTER(WHERE rn<=5),'{}') examples
        FROM (SELECT key,row_number() OVER(ORDER BY key) rn FROM bad) x`);
  const eq = evidenceMismatch.rows[0]!;
  const evidenceDefect = describe('POA relationship evidence mismatch', eq.n, eq.examples);
  if (evidenceDefect) defects.push(evidenceDefect);

  if (count.target_count + count.transform_q !== count.source_count)
    defects.push(
      `POA source partition ${count.target_count}+${count.transform_q}/${count.source_count}`,
    );
  return {
    defects,
    sourceCount: count.source_count,
    targetCount: count.target_count,
    lawyerCount: count.lawyer_count,
    transformQuarantineCount: count.transform_q,
    relationshipEvidenceCount: count.relation_q,
  };
}
