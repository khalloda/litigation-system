import type { ClientBase } from 'pg';
import { task29dProtectedState } from './task29d-protected-state';

/** Prior stages through Task 2.9D, protected while Task 2.10A writes billing history. */
export async function task210aProtectedState(db: ClientBase): Promise<string> {
  const prior = await task29dProtectedState(db);
  const result = await db.query<{ digest: string }>(
    `SELECT encode(sha256(convert_to($1||E'\\n'||coalesce(string_agg(payload,E'\\n' ORDER BY kind,identity),''),'UTF8')),'hex') digest
       FROM (
         SELECT 'F' kind,id::text identity,to_jsonb(f)::text payload FROM fee_letters f
         UNION ALL SELECT 'FLM',id::text,to_jsonb(l)::text FROM fee_letter_matters l
         UNION ALL SELECT 'MFR',id::text,to_jsonb(r)::text FROM matter_fee_letter_references r
         UNION ALL SELECT 'FQ',src_record_key,to_jsonb(q)::text FROM quarantine.fee_letter_transform q
         UNION ALL SELECT 'FLQ',src_record_key,to_jsonb(q)::text FROM quarantine.fee_letter_matter_transform q
         UNION ALL SELECT 'MRQ',src_record_key,to_jsonb(q)::text FROM quarantine.matter_fee_letter_reference q
       ) protected`,
    [prior],
  );
  return result.rows[0]?.digest ?? '';
}
