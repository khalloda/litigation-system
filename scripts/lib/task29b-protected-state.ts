import type { ClientBase } from 'pg';
import { task29ProtectedState } from './task29-protected-state';

/** Prior stages plus Task 2.9A, protected while Task 2.9B writes only POAs. */
export async function task29bProtectedState(db: ClientBase): Promise<string> {
  const prior = await task29ProtectedState(db);
  const result = await db.query<{ digest: string }>(
    `SELECT encode(sha256(convert_to($1 || E'\\n' || coalesce(string_agg(payload,E'\\n' ORDER BY kind,identity),''),'UTF8')),'hex') digest
       FROM (
         SELECT 'AT' kind,id::text identity,(to_jsonb(t)||'{"created_by":null,"updated_by":null}'::jsonb)::text payload FROM admin_tasks t
         UNION ALL SELECT 'AA',id::text,(to_jsonb(a)||'{"created_by":null,"updated_by":null}'::jsonb)::text FROM task_actions a
         UNION ALL SELECT 'QAT',src_record_key,to_jsonb(q)::text FROM quarantine.admin_task_transform q
         UNION ALL SELECT 'QAA',src_record_key,to_jsonb(q)::text FROM quarantine.task_action_transform q
       ) protected`,
    [prior],
  );
  return result.rows[0]?.digest ?? '';
}
