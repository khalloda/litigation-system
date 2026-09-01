import type { ClientBase } from 'pg';
import { task29bProtectedState } from './task29b-protected-state';

/** Prior stages through Task 2.9B, protected while Task 2.9C writes documents. */
export async function task29cProtectedState(db: ClientBase): Promise<string> {
  const prior = await task29bProtectedState(db);
  const result = await db.query<{ digest: string }>(
    `SELECT encode(sha256(convert_to($1||E'\\n'||coalesce(string_agg(payload,E'\\n' ORDER BY kind,identity),''),'UTF8')),'hex') digest FROM(
    SELECT 'P' kind,id::text identity,(to_jsonb(p)||'{"created_by":null,"updated_by":null}'::jsonb)::text payload FROM powers_of_attorney p
    UNION ALL SELECT 'PL',id::text,(to_jsonb(l)||'{"created_by":null,"updated_by":null}'::jsonb)::text FROM power_of_attorney_lawyers l
    UNION ALL SELECT 'PQT',src_record_key,to_jsonb(q)::text FROM quarantine.power_of_attorney_transform q
    UNION ALL SELECT 'PQE',src_record_key||':'||relationship_kind,to_jsonb(q)::text FROM quarantine.power_of_attorney_relationship q
  )protected`,
    [prior],
  );
  return result.rows[0]?.digest ?? '';
}
