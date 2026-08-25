import type { ClientBase } from 'pg';
export type FeeReconciliation = {
  defects: string[];
  feeSourceCount: number;
  feeTargetCount: number;
  feeQuarantineCount: number;
  forwardSourceCount: number;
  forwardTargetCount: number;
  forwardQuarantineCount: number;
  reverseSourceCount: number;
  reverseTargetCount: number;
  reverseQuarantineCount: number;
  contractReferences: number;
  mfilesReferences: number;
};
const FEE = `SELECT f.*,to_jsonb(f)-ARRAY['src_file','src_row_num','src_record_key','src_extraction_sha256']source_payload,count(*)OVER(PARTITION BY f."contractID")contract_count,(f."contractID"~'^[0-9]+$'AND pg_input_is_valid(f."contractID",'integer')AND(f."Cont-Date"IS NULL OR(f."Cont-Date"~'^[0-9]{4}-[0-9]{2}-[0-9]{2} 00:00:00$'AND pg_input_is_valid(left(f."Cont-Date",10),'date'))))typed_safe FROM staging."خطابات الأتعاب"f`;
const err = (label: string, n: number, examples: string[]) =>
  n ? `${label}: ${n}${examples.length ? ` (${examples.join(', ')})` : ''}` : null;
export async function reconcileFeeLetters(
  db: ClientBase,
  expectedReferenceState: {
    contract: number;
    mfiles: number;
    both: number;
    neither: number;
    collisions?: number;
    collisionRefs: number;
  } = { contract: 289, mfiles: 123, both: 0, neither: 0, collisions: 2, collisionRefs: 0 },
): Promise<FeeReconciliation> {
  const defects: string[] = [];
  const answer = await db.query<{ n: number }>(
    `SELECT count(*)::int n FROM quarantine.review_value WHERE id=1331 AND topic='open_question' AND value='Does الدعاوى.[خطاب الأتعاب] point at contractID OR mfilesID, depending on the value?' AND firm_answer='depending on the value' AND firm_note='Both are contract IDs, but the access file were here before we operated mfiles, starting the usage of mfiles we used the file ID in mfiles that refere to the contract.' AND answered_at IS NOT NULL`,
  );
  if (answer.rows[0]!.n !== 1) defects.push('owner fee-reference answer changed or missing');
  const counts = (
    await db.query<{
      fs: number;
      ft: number;
      fq: number;
      ls: number;
      lt: number;
      lq: number;
      rs: number;
      rt: number;
      rq: number;
    }>(
      `SELECT(SELECT count(*)::int FROM staging."خطابات الأتعاب")fs,(SELECT count(*)::int FROM fee_letters WHERE legacy_source_record_key IS NOT NULL)ft,(SELECT count(*)::int FROM quarantine.fee_letter_transform)fq,(SELECT count(*)::int FROM staging."خطابات الأتعاب__Matter")ls,(SELECT count(*)::int FROM fee_letter_matters WHERE legacy_source_record_key IS NOT NULL)lt,(SELECT count(*)::int FROM quarantine.fee_letter_matter_transform)lq,(SELECT count(*)::int FROM staging."الدعاوى"WHERE"خطاب الأتعاب"IS NOT NULL)rs,(SELECT count(*)::int FROM matter_fee_letter_references WHERE legacy_source_record_key IS NOT NULL)rt,(SELECT count(*)::int FROM quarantine.matter_fee_letter_reference)rq`,
    )
  ).rows[0]!;
  const target = (
    await db.query<{ n: number; examples: string[] }>(
      `WITH source AS(${FEE}),expected AS(SELECT s.src_record_key,s.src_extraction_sha256,s."contractID"::int contract_id,c.id client_id,s."mfilesID"mfiles_id,s."mfilesID"legacy_mfiles_id_raw,s."Client"client_name,s."Cont-Type"contract_type,CASE WHEN s."Cont-Date"IS NULL THEN NULL ELSE left(s."Cont-Date",10)::date END contract_date,s."Cont-Details"contract_details,s."Cont-Structure"contract_structure,s."Status"status,s.source_payload FROM source s JOIN clients c ON c.legacy_id::text=s."clientID"WHERE s.typed_safe IS TRUE AND s.contract_count=1),actual AS(SELECT legacy_source_record_key src_record_key,legacy_source_extraction_sha256 src_extraction_sha256,contract_id,client_id,mfiles_id,legacy_mfiles_id_raw,client_name,contract_type,contract_date,contract_details,contract_structure,status,legacy_source_payload source_payload FROM fee_letters WHERE legacy_source_record_key IS NOT NULL),bad AS(SELECT coalesce(e.src_record_key,a.src_record_key)key FROM expected e FULL JOIN actual a USING(src_record_key)WHERE e.src_record_key IS NULL OR a.src_record_key IS NULL OR to_jsonb(e)-'src_record_key'IS DISTINCT FROM to_jsonb(a)-'src_record_key')SELECT count(*)::int n,coalesce((array_agg(key ORDER BY key))[1:5],'{}')examples FROM bad`,
    )
  ).rows[0]!;
  const td = err('fee-letter target/source mismatch', target.n, target.examples);
  if (td) defects.push(td);
  const feeQ = (
    await db.query<{ n: number; examples: string[] }>(
      `WITH source AS(${FEE}),reasons AS(SELECT s.*,x.code,x.detail FROM source s CROSS JOIN LATERAL(SELECT'duplicate_contract_id'code,jsonb_build_object('value',s."contractID")detail WHERE s.contract_count<>1 UNION ALL SELECT'invalid_client_link',jsonb_build_object('clientID',s."clientID")WHERE NOT EXISTS(SELECT 1 FROM clients c WHERE c.legacy_id::text=s."clientID")UNION ALL SELECT'invalid_contract_date',jsonb_build_object('value',s."Cont-Date")WHERE s."Cont-Date"IS NOT NULL AND NOT(s."Cont-Date"~'^[0-9]{4}-[0-9]{2}-[0-9]{2} 00:00:00$'AND pg_input_is_valid(left(s."Cont-Date",10),'date'))UNION ALL SELECT'invalid_contract_id',jsonb_build_object('value',s."contractID")WHERE s."contractID"IS NULL OR NOT(s."contractID"~'^[0-9]+$'AND pg_input_is_valid(s."contractID",'integer')))x WHERE s.typed_safe IS NOT TRUE OR s.contract_count<>1 OR NOT EXISTS(SELECT 1 FROM clients c WHERE c.legacy_id::text=s."clientID")),expected AS(SELECT src_record_key,src_extraction_sha256 extraction_sha256,src_file,src_row_num,"contractID"contract_id_raw,array_agg(code ORDER BY code)reason_codes,jsonb_agg(detail ORDER BY code)reason_details,source_payload FROM reasons GROUP BY src_record_key,src_extraction_sha256,src_file,src_row_num,"contractID",source_payload),actual AS(SELECT src_record_key,extraction_sha256,src_file,src_row_num,contract_id_raw,reason_codes,reason_details,source_payload FROM quarantine.fee_letter_transform),bad AS(SELECT coalesce(e.src_record_key,a.src_record_key)key FROM expected e FULL JOIN actual a USING(src_record_key)WHERE e.src_record_key IS NULL OR a.src_record_key IS NULL OR to_jsonb(e)-'src_record_key'IS DISTINCT FROM to_jsonb(a)-'src_record_key')SELECT count(*)::int n,coalesce((array_agg(key ORDER BY key))[1:5],'{}')examples FROM bad`,
    )
  ).rows[0]!;
  const fqd = err('fee-letter quarantine mismatch', feeQ.n, feeQ.examples);
  if (fqd) defects.push(fqd);
  const forward = (
    await db.query<{ n: number; examples: string[] }>(
      `WITH source AS(SELECT v.*,to_jsonb(v)-ARRAY['src_file','src_row_num','src_record_key','src_extraction_sha256']source_payload FROM staging."خطابات الأتعاب__Matter"v),matter AS(SELECT s.src_record_key,count(m.*)::int mc,min(m.id)matter_id FROM source s LEFT JOIN matters m ON m.legacy_source_record_key IS NOT NULL AND m.case_number_ar=s.value GROUP BY s.src_record_key),expected AS(SELECT s.src_record_key,s.src_extraction_sha256,f.id fee_letter_id,mm.matter_id,s.value legacy_matter_ref,s.ordinal::int ordinal,s.parent_key legacy_parent_contract_id_raw,s.source_payload FROM source s JOIN matter mm USING(src_record_key)JOIN fee_letters f ON f.legacy_source_record_key IS NOT NULL AND f.contract_id::text=s.parent_key WHERE mm.mc=1 AND s.ordinal~'^[0-9]+$'AND pg_input_is_valid(s.ordinal,'integer')),actual AS(SELECT legacy_source_record_key src_record_key,legacy_source_extraction_sha256 src_extraction_sha256,fee_letter_id,matter_id,legacy_matter_ref,ordinal,legacy_parent_contract_id_raw,legacy_source_payload source_payload FROM fee_letter_matters WHERE legacy_source_record_key IS NOT NULL),bad AS(SELECT coalesce(e.src_record_key,a.src_record_key)key FROM expected e FULL JOIN actual a USING(src_record_key)WHERE e.src_record_key IS NULL OR a.src_record_key IS NULL OR to_jsonb(e)-'src_record_key'IS DISTINCT FROM to_jsonb(a)-'src_record_key')SELECT count(*)::int n,coalesce((array_agg(key ORDER BY key))[1:5],'{}')examples FROM bad`,
    )
  ).rows[0]!;
  const fd = err('fee-letter forward-link mismatch', forward.n, forward.examples);
  if (fd) defects.push(fd);
  const forwardQ = (
    await db.query<{ n: number; examples: string[] }>(
      `WITH source AS(SELECT v.*,to_jsonb(v)-ARRAY['src_file','src_row_num','src_record_key','src_extraction_sha256']source_payload FROM staging."خطابات الأتعاب__Matter"v),m AS(SELECT s.src_record_key,count(t.*)::int mc,array_agg(t.id ORDER BY t.id)FILTER(WHERE t.id IS NOT NULL)mids FROM source s LEFT JOIN matters t ON t.legacy_source_record_key IS NOT NULL AND t.case_number_ar=s.value GROUP BY s.src_record_key),q AS(SELECT s.src_record_key,array_agg(t.src_record_key ORDER BY t.src_record_key)keys,jsonb_agg(t.reason_codes ORDER BY t.src_record_key)codes FROM source s JOIN quarantine.matter_transform t ON t.source_payload->>'matterAR'=s.value GROUP BY s.src_record_key),reasons AS(SELECT s.*,x.code,x.detail FROM source s JOIN m USING(src_record_key)LEFT JOIN q USING(src_record_key)CROSS JOIN LATERAL(SELECT'invalid_fee_letter_parent'code,jsonb_build_object('parent_key',s.parent_key)detail WHERE NOT EXISTS(SELECT 1 FROM fee_letters f WHERE f.legacy_source_record_key IS NOT NULL AND f.contract_id::text=s.parent_key)UNION ALL SELECT'invalid_ordinal',jsonb_build_object('value',s.ordinal)WHERE s.ordinal IS NULL OR NOT(s.ordinal~'^[0-9]+$'AND pg_input_is_valid(s.ordinal,'integer'))UNION ALL SELECT'ambiguous_matter_reference',jsonb_build_object('value',s.value,'matter_ids',to_jsonb(m.mids))WHERE m.mc>1 UNION ALL SELECT'parent_matter_quarantined',jsonb_build_object('value',s.value,'matter_source_keys',to_jsonb(q.keys),'matter_reason_codes',q.codes)WHERE m.mc=0 AND q.keys IS NOT NULL UNION ALL SELECT'unresolved_matter_reference',jsonb_build_object('value',s.value)WHERE m.mc=0 AND q.keys IS NULL)x),expected AS(SELECT src_record_key,src_extraction_sha256 extraction_sha256,src_file,src_row_num,parent_key parent_contract_id_raw,ordinal ordinal_raw,value matter_ref_raw,array_agg(code ORDER BY code)reason_codes,jsonb_agg(detail ORDER BY code)reason_details,source_payload FROM reasons GROUP BY src_record_key,src_extraction_sha256,src_file,src_row_num,parent_key,ordinal,value,source_payload),actual AS(SELECT src_record_key,extraction_sha256,src_file,src_row_num,parent_contract_id_raw,ordinal_raw,matter_ref_raw,reason_codes,reason_details,source_payload FROM quarantine.fee_letter_matter_transform),bad AS(SELECT coalesce(e.src_record_key,a.src_record_key)key FROM expected e FULL JOIN actual a USING(src_record_key)WHERE e.src_record_key IS NULL OR a.src_record_key IS NULL OR to_jsonb(e)-'src_record_key'IS DISTINCT FROM to_jsonb(a)-'src_record_key')SELECT count(*)::int n,coalesce((array_agg(key ORDER BY key))[1:5],'{}')examples FROM bad`,
    )
  ).rows[0]!;
  const fqd2 = err('fee-letter forward quarantine mismatch', forwardQ.n, forwardQ.examples);
  if (fqd2) defects.push(fqd2);
  const reverseState = (
    await db.query<{
      contract: number;
      mfiles: number;
      both: number;
      neither: number;
      collisions: number;
      collision_refs: number;
    }>(
      `WITH refs AS(SELECT m."خطاب الأتعاب"raw FROM staging."الدعاوى"m WHERE m."خطاب الأتعاب"IS NOT NULL),x AS(SELECT r.raw,(SELECT count(*)FROM staging."خطابات الأتعاب"f WHERE f."contractID"=r.raw)c,(SELECT count(*)FROM staging."خطابات الأتعاب"f WHERE f."mfilesID"=r.raw)m FROM refs r)SELECT count(*)FILTER(WHERE c=1 AND m=0)::int contract,count(*)FILTER(WHERE c=0 AND m=1)::int mfiles,count(*)FILTER(WHERE c>0 AND m>0)::int both,count(*)FILTER(WHERE (c=0 AND m=0) OR c>1 OR m>1)::int neither,(SELECT count(*)::int FROM staging."خطابات الأتعاب"a JOIN staging."خطابات الأتعاب"b ON b."mfilesID"=a."contractID")collisions,(SELECT count(*)::int FROM refs WHERE raw IN(SELECT a."contractID"FROM staging."خطابات الأتعاب"a JOIN staging."خطابات الأتعاب"b ON b."mfilesID"=a."contractID"))collision_refs FROM x`,
    )
  ).rows[0]!;
  if (
    reverseState.contract !== expectedReferenceState.contract ||
    reverseState.mfiles !== expectedReferenceState.mfiles ||
    reverseState.both !== expectedReferenceState.both ||
    reverseState.neither !== expectedReferenceState.neither ||
    (expectedReferenceState.collisions !== undefined &&
      reverseState.collisions !== expectedReferenceState.collisions) ||
    reverseState.collision_refs !== expectedReferenceState.collisionRefs
  )
    defects.push(`fee identifier spaces ${JSON.stringify(reverseState)}`);
  const reverse = (
    await db.query<{ n: number; examples: string[] }>(
      `WITH source AS(SELECT m.*,to_jsonb(m)-ARRAY['src_file','src_row_num','src_record_key','src_extraction_sha256']source_payload FROM staging."الدعاوى"m WHERE m."خطاب الأتعاب"IS NOT NULL),resolved AS(SELECT s.*,coalesce(fc.id,fm.id)fee_letter_id,CASE WHEN fc.id IS NOT NULL THEN'contract_id'ELSE'mfiles_id'END identifier_space FROM source s LEFT JOIN fee_letters fc ON fc.legacy_source_record_key IS NOT NULL AND fc.contract_id::text=s."خطاب الأتعاب" LEFT JOIN fee_letters fm ON fm.legacy_source_record_key IS NOT NULL AND fm.mfiles_id=s."خطاب الأتعاب"),expected AS(SELECT r.src_record_key,r.src_extraction_sha256,m.id matter_id,r.fee_letter_id,r.identifier_space,r."خطاب الأتعاب"legacy_reference_raw,r.source_payload FROM resolved r JOIN matters m ON m.legacy_source_record_key=r.src_record_key),actual AS(SELECT legacy_source_record_key src_record_key,legacy_source_extraction_sha256 src_extraction_sha256,matter_id,fee_letter_id,identifier_space,legacy_reference_raw,legacy_source_payload source_payload FROM matter_fee_letter_references WHERE legacy_source_record_key IS NOT NULL),bad AS(SELECT coalesce(e.src_record_key,a.src_record_key)key FROM expected e FULL JOIN actual a USING(src_record_key)WHERE e.src_record_key IS NULL OR a.src_record_key IS NULL OR to_jsonb(e)-'src_record_key'IS DISTINCT FROM to_jsonb(a)-'src_record_key')SELECT count(*)::int n,coalesce((array_agg(key ORDER BY key))[1:5],'{}')examples FROM bad`,
    )
  ).rows[0]!;
  const rd = err('matter reverse fee-reference mismatch', reverse.n, reverse.examples);
  if (rd) defects.push(rd);
  const reverseQ = (
    await db.query<{ n: number; examples: string[] }>(
      `WITH source AS(SELECT m.*,to_jsonb(m)-ARRAY['src_file','src_row_num','src_record_key','src_extraction_sha256']source_payload FROM staging."الدعاوى"m WHERE m."خطاب الأتعاب"IS NOT NULL),resolved AS(SELECT s.*,coalesce(fc.legacy_source_record_key,fm.legacy_source_record_key)fee_key,CASE WHEN fc.id IS NOT NULL THEN'contract_id'ELSE'mfiles_id'END identifier_space FROM source s LEFT JOIN fee_letters fc ON fc.legacy_source_record_key IS NOT NULL AND fc.contract_id::text=s."خطاب الأتعاب" LEFT JOIN fee_letters fm ON fm.legacy_source_record_key IS NOT NULL AND fm.mfiles_id=s."خطاب الأتعاب"),expected AS(SELECT r.src_record_key,r.src_extraction_sha256 extraction_sha256,r.src_file,r.src_row_num,r."matterID"legacy_matter_id,r."خطاب الأتعاب"reference_raw,r.identifier_space,r.fee_key resolved_fee_letter_source_key,ARRAY['parent_matter_quarantined']reason_codes,jsonb_build_array(jsonb_build_object('legacy_matter_id',r."matterID",'matter_reason_codes',to_jsonb(q.reason_codes)))reason_details,r.source_payload FROM resolved r JOIN quarantine.matter_transform q ON q.src_record_key=r.src_record_key),actual AS(SELECT src_record_key,extraction_sha256,src_file,src_row_num,legacy_matter_id,reference_raw,identifier_space,resolved_fee_letter_source_key,reason_codes,reason_details,source_payload FROM quarantine.matter_fee_letter_reference),bad AS(SELECT coalesce(e.src_record_key,a.src_record_key)key FROM expected e FULL JOIN actual a USING(src_record_key)WHERE e.src_record_key IS NULL OR a.src_record_key IS NULL OR to_jsonb(e)-'src_record_key'IS DISTINCT FROM to_jsonb(a)-'src_record_key')SELECT count(*)::int n,coalesce((array_agg(key ORDER BY key))[1:5],'{}')examples FROM bad`,
    )
  ).rows[0]!;
  const rqd = err(
    'matter reverse fee-reference quarantine mismatch',
    reverseQ.n,
    reverseQ.examples,
  );
  if (rqd) defects.push(rqd);
  if (counts.ft + counts.fq !== counts.fs)
    defects.push(`fee source partition ${counts.ft}+${counts.fq}/${counts.fs}`);
  if (counts.lt + counts.lq !== counts.ls)
    defects.push(`forward source partition ${counts.lt}+${counts.lq}/${counts.ls}`);
  if (counts.rt + counts.rq !== counts.rs)
    defects.push(`reverse source partition ${counts.rt}+${counts.rq}/${counts.rs}`);
  return {
    defects,
    feeSourceCount: counts.fs,
    feeTargetCount: counts.ft,
    feeQuarantineCount: counts.fq,
    forwardSourceCount: counts.ls,
    forwardTargetCount: counts.lt,
    forwardQuarantineCount: counts.lq,
    reverseSourceCount: counts.rs,
    reverseTargetCount: counts.rt,
    reverseQuarantineCount: counts.rq,
    contractReferences: reverseState.contract,
    mfilesReferences: reverseState.mfiles,
  };
}
