import type { ClientBase } from 'pg';

export type DocumentReconciliation = {
  defects: string[];
  sourceCount: number;
  targetCount: number;
  quarantineCount: number;
  evidenceCount: number;
};
const SOURCE = `SELECT d.*,to_jsonb(d)-ARRAY['src_file','src_row_num','src_record_key','src_extraction_sha256'] source_payload,
  (d."مسلسل المستند ID"~'^[0-9]+$' AND pg_input_is_valid(d."مسلسل المستند ID",'integer')
   AND (d."تاريخ المستند" IS NULL OR (d."تاريخ المستند"~'^[0-9]{4}-[0-9]{2}-[0-9]{2} 00:00:00$' AND pg_input_is_valid(left(d."تاريخ المستند",10),'date')))
   AND (d."تاريخ الإيداع" IS NULL OR (d."تاريخ الإيداع"~'^[0-9]{4}-[0-9]{2}-[0-9]{2} 00:00:00$' AND pg_input_is_valid(left(d."تاريخ الإيداع",10),'date')))) safe
  FROM staging."المستندات" d`;
function defect(label: string, n: number, examples: string[]): string | null {
  return n === 0 ? null : `${label}: ${n}${examples.length ? ` (${examples.join(', ')})` : ''}`;
}

export async function reconcileDocuments(db: ClientBase): Promise<DocumentReconciliation> {
  const defects: string[] = [];
  const count = (
    await db.query<{ source: number; target: number; q: number; evidence: number }>(`SELECT
    (SELECT count(*)::int FROM staging."المستندات") source,
    (SELECT count(*)::int FROM documents WHERE legacy_source_record_key IS NOT NULL) target,
    (SELECT count(*)::int FROM quarantine.document_transform) q,
    (SELECT count(*)::int FROM quarantine.document_evidence) evidence`)
  ).rows[0]!;
  const target = (
    await db.query<{ n: number; examples: string[] }>(`
    WITH source AS (${SOURCE}),matter_matches AS (
      SELECT s.src_record_key,count(m.*)::int match_count,min(m.id) matter_id
       FROM source s LEFT JOIN matters m ON m.legacy_source_record_key IS NOT NULL AND m.case_number_ar=s."رقم الدعوى"
       GROUP BY s.src_record_key),expected AS (
      SELECT s.src_record_key,s.src_extraction_sha256,s."مسلسل المستند ID"::int legacy_id,
        c.id client_id,s."العميل" legacy_client_name_raw,
        CASE WHEN mm.match_count=1 THEN mm.matter_id END matter_id,s."رقم الدعوى" legacy_matter_ref_raw,
        s."بيان المستند" description,CASE WHEN s."تاريخ المستند" IS NULL THEN NULL ELSE left(s."تاريخ المستند",10)::date END document_date,
        CASE WHEN s."عدد الأوراق"~'^[0-9]+$' AND pg_input_is_valid(s."عدد الأوراق",'integer') THEN s."عدد الأوراق"::int END page_count,
        s."عدد الأوراق" legacy_page_count_raw,CASE WHEN s."تاريخ الإيداع" IS NULL THEN NULL ELSE left(s."تاريخ الإيداع",10)::date END deposit_date,
        a.person_id responsible_person_id,s."المحامي/الموظف المسئول" legacy_responsible_raw,
        s."ملاحظات" notes,s."بطاقة الحركة" movement_card,NULL::text storage_location,
        NULL::text mfiles_id,NULL::text legacy_mfiles_id_raw,s.source_payload
       FROM source s JOIN matter_matches mm USING(src_record_key)
       LEFT JOIN clients c ON c.legacy_id::text=s."clientID"
       LEFT JOIN person_name_alias a ON a.alias_ar=s."المحامي/الموظف المسئول" WHERE s.safe IS TRUE
    ),actual AS (
      SELECT legacy_source_record_key src_record_key,legacy_source_extraction_sha256 src_extraction_sha256,
        legacy_id,client_id,legacy_client_name_raw,matter_id,legacy_matter_ref_raw,description,
        document_date,page_count,legacy_page_count_raw,deposit_date,responsible_person_id,
        legacy_responsible_raw,notes,movement_card,storage_location,mfiles_id,legacy_mfiles_id_raw,
        legacy_source_payload source_payload FROM documents WHERE legacy_source_record_key IS NOT NULL
    ),bad AS (SELECT coalesce(e.src_record_key,a.src_record_key) key FROM expected e FULL JOIN actual a USING(src_record_key)
      WHERE e.src_record_key IS NULL OR a.src_record_key IS NULL OR to_jsonb(e)-'src_record_key' IS DISTINCT FROM to_jsonb(a)-'src_record_key')
    SELECT count(*)::int n,coalesce((array_agg(key ORDER BY key))[1:5],'{}') examples FROM bad`)
  ).rows[0]!;
  const targetDefect = defect('document target/source mismatch', target.n, target.examples);
  if (targetDefect) defects.push(targetDefect);

  const quarantine = (
    await db.query<{ n: number; examples: string[] }>(`
    WITH source AS (${SOURCE}),reasons AS (
      SELECT s.*,x.code,x.detail FROM source s CROSS JOIN LATERAL(
        SELECT 'invalid_deposit_date' code,jsonb_build_object('value',s."تاريخ الإيداع") detail WHERE s."تاريخ الإيداع" IS NOT NULL AND NOT(s."تاريخ الإيداع"~'^[0-9]{4}-[0-9]{2}-[0-9]{2} 00:00:00$' AND pg_input_is_valid(left(s."تاريخ الإيداع",10),'date'))
        UNION ALL SELECT 'invalid_document_date',jsonb_build_object('value',s."تاريخ المستند") WHERE s."تاريخ المستند" IS NOT NULL AND NOT(s."تاريخ المستند"~'^[0-9]{4}-[0-9]{2}-[0-9]{2} 00:00:00$' AND pg_input_is_valid(left(s."تاريخ المستند",10),'date'))
        UNION ALL SELECT 'invalid_document_id',jsonb_build_object('value',s."مسلسل المستند ID") WHERE s."مسلسل المستند ID" IS NULL OR NOT(s."مسلسل المستند ID"~'^[0-9]+$' AND pg_input_is_valid(s."مسلسل المستند ID",'integer'))
      )x WHERE s.safe IS NOT TRUE),expected AS (
      SELECT src_record_key,src_extraction_sha256 extraction_sha256,src_file,src_row_num,"مسلسل المستند ID" legacy_document_id,
        array_agg(code ORDER BY code) reason_codes,jsonb_agg(detail ORDER BY code) reason_details,source_payload
      FROM reasons GROUP BY src_record_key,src_extraction_sha256,src_file,src_row_num,"مسلسل المستند ID",source_payload),actual AS(
      SELECT src_record_key,extraction_sha256,src_file,src_row_num,legacy_document_id,reason_codes,reason_details,source_payload FROM quarantine.document_transform),bad AS(
      SELECT coalesce(e.src_record_key,a.src_record_key) key FROM expected e FULL JOIN actual a USING(src_record_key)
      WHERE e.src_record_key IS NULL OR a.src_record_key IS NULL OR to_jsonb(e)-'src_record_key' IS DISTINCT FROM to_jsonb(a)-'src_record_key')
    SELECT count(*)::int n,coalesce((array_agg(key ORDER BY key))[1:5],'{}') examples FROM bad`)
  ).rows[0]!;
  const qDefect = defect('document quarantine mismatch', quarantine.n, quarantine.examples);
  if (qDefect) defects.push(qDefect);

  const evidence = (
    await db.query<{ n: number; examples: string[] }>(`
    WITH source AS (${SOURCE}),matter_matches AS(
      SELECT s.src_record_key,count(m.*)::int match_count,array_agg(m.id ORDER BY m.id) FILTER(WHERE m.id IS NOT NULL) ids
      FROM source s LEFT JOIN matters m ON m.legacy_source_record_key IS NOT NULL AND m.case_number_ar=s."رقم الدعوى" GROUP BY s.src_record_key),expected AS(
      SELECT s.src_record_key,'client' field_kind,s.src_extraction_sha256 extraction_sha256,s.src_file,s.src_row_num,s."clientID" raw_value,
        'unresolved_client_link' reason_code,jsonb_build_object('clientID',s."clientID") reason_detail,s.source_payload
      FROM source s LEFT JOIN clients c ON c.legacy_id::text=s."clientID" WHERE s.safe IS TRUE AND s."clientID" IS NOT NULL AND c.id IS NULL
      UNION ALL SELECT s.src_record_key,'matter',s.src_extraction_sha256,s.src_file,s.src_row_num,s."رقم الدعوى",
        CASE WHEN mm.match_count>1 THEN 'ambiguous_matter_reference' WHEN q.match_count>0 THEN 'parent_matter_quarantined' ELSE 'unresolved_matter_reference' END,
        CASE WHEN mm.match_count>1 THEN jsonb_build_object('value',s."رقم الدعوى",'matter_ids',to_jsonb(mm.ids))
             WHEN q.match_count=1 THEN jsonb_build_object('value',s."رقم الدعوى",'matter_reason_codes',q.matches->0->'reason_codes')
             WHEN q.match_count>1 THEN jsonb_build_object('value',s."رقم الدعوى",'matter_source_keys',to_jsonb(q.source_keys),'matter_reason_codes',q.matches)
             ELSE jsonb_build_object('value',s."رقم الدعوى") END,s.source_payload
      FROM source s JOIN matter_matches mm USING(src_record_key)
      LEFT JOIN LATERAL(
        SELECT count(*)::int match_count,array_agg(q.src_record_key ORDER BY q.src_record_key) source_keys,
          jsonb_agg(jsonb_build_object(
            'source_record_key',q.src_record_key,
            'reason_codes',(SELECT jsonb_agg(code ORDER BY code) FROM unnest(q.reason_codes) code)
          ) ORDER BY q.src_record_key) matches
        FROM quarantine.matter_transform q WHERE q.source_payload->>'matterAR'=s."رقم الدعوى"
      )q ON true
      WHERE s.safe IS TRUE AND s."رقم الدعوى" IS NOT NULL AND mm.match_count<>1
      UNION ALL SELECT s.src_record_key,'responsible_person',s.src_extraction_sha256,s.src_file,s.src_row_num,s."المحامي/الموظف المسئول",
        CASE WHEN e.raw_value IS NULL THEN 'unreviewed_responsible_person' ELSE 'reviewed_exclusion' END,
        CASE WHEN e.raw_value IS NULL THEN jsonb_build_object('value',s."المحامي/الموظف المسئول") ELSE jsonb_build_object('value',s."المحامي/الموظف المسئول",'reason',e.reason) END,s.source_payload
      FROM source s LEFT JOIN person_name_alias a ON a.alias_ar=s."المحامي/الموظف المسئول"
      LEFT JOIN migration_excluded_name e ON e.raw_value=s."المحامي/الموظف المسئول"
      WHERE s.safe IS TRUE AND s."المحامي/الموظف المسئول" IS NOT NULL AND a.id IS NULL
      UNION ALL SELECT s.src_record_key,'page_count',s.src_extraction_sha256,s.src_file,s.src_row_num,s."عدد الأوراق",
        'compound_page_count',jsonb_build_object('value',s."عدد الأوراق"),s.source_payload FROM source s
      WHERE s.safe IS TRUE AND s."عدد الأوراق" IS NOT NULL AND NOT(s."عدد الأوراق"~'^[0-9]+$' AND pg_input_is_valid(s."عدد الأوراق",'integer'))
    ),actual AS(SELECT src_record_key,field_kind,extraction_sha256,src_file,src_row_num,raw_value,reason_code,reason_detail,source_payload FROM quarantine.document_evidence),bad AS(
      SELECT coalesce(e.src_record_key,a.src_record_key) key FROM expected e FULL JOIN actual a USING(src_record_key,field_kind)
      WHERE e.src_record_key IS NULL OR a.src_record_key IS NULL OR to_jsonb(e)-ARRAY['src_record_key','field_kind'] IS DISTINCT FROM to_jsonb(a)-ARRAY['src_record_key','field_kind'])
    SELECT count(*)::int n,coalesce((array_agg(key ORDER BY key))[1:5],'{}') examples FROM bad`)
  ).rows[0]!;
  const evidenceDefect = defect('document evidence mismatch', evidence.n, evidence.examples);
  if (evidenceDefect) defects.push(evidenceDefect);
  if (count.target + count.q !== count.source)
    defects.push(`document source partition ${count.target}+${count.q}/${count.source}`);
  return {
    defects,
    sourceCount: count.source,
    targetCount: count.target,
    quarantineCount: count.q,
    evidenceCount: count.evidence,
  };
}
