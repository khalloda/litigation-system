import type { ClientBase } from 'pg';
import { task29cProtectedState } from './task29c-protected-state';
/** Prior stages through Task 2.9C, protected while Task 2.9D writes fee letters. */
export async function task29dProtectedState(db: ClientBase): Promise<string> {
  const prior = await task29cProtectedState(db);
  const r = await db.query<{ digest: string }>(
    `SELECT encode(sha256(convert_to($1||E'\\n'||coalesce(string_agg(payload,E'\\n'ORDER BY kind,identity),''),'UTF8')),'hex')digest FROM(
 SELECT'D'kind,id::text identity,to_jsonb(d)::text payload FROM documents d
 UNION ALL SELECT'DQT',src_record_key,to_jsonb(q)::text FROM quarantine.document_transform q
 UNION ALL SELECT'DQE',src_record_key||':'||field_kind,to_jsonb(q)::text FROM quarantine.document_evidence q)protected`,
    [prior],
  );
  return r.rows[0]?.digest ?? '';
}
