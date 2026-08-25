import type { ClientBase } from 'pg';

/**
 * Everything completed before Task 2.9. New Task 2.9 targets are deliberately
 * absent, so every stage can prove that it did not change prior migration
 * evidence, source associations, IDs, timestamps, or review answers.
 */
export async function task29ProtectedState(db: ClientBase): Promise<string> {
  const result = await db.query<{ digest: string }>(`
    SELECT encode(sha256(convert_to(string_agg(payload, E'\\n' ORDER BY kind, identity), 'UTF8')), 'hex') digest
      FROM (
        SELECT 'FINGERPRINT' kind,'1' identity,_migration.current_staging_fingerprint() payload
        UNION ALL SELECT 'V',id::text,to_jsonb(v)::text FROM quarantine.review_value v
        UNION ALL SELECT 'F',id::text,to_jsonb(f)::text FROM quarantine.finding f
        UNION ALL SELECT 'C',id::text,to_jsonb(c)::text FROM clients c
        UNION ALL SELECT 'O',id::text,to_jsonb(c)::text FROM contacts c
        UNION ALL SELECT 'M',id::text,to_jsonb(m)::text FROM matters m
        UNION ALL SELECT 'QM',id::text,to_jsonb(q)::text FROM quarantine.matter_transform q
        UNION ALL SELECT 'ML',id::text,to_jsonb(l)::text FROM matter_lawyers l
        UNION ALL SELECT 'MP',id::text,to_jsonb(p)::text FROM matter_parties p
        UNION ALL SELECT 'MR',id::text,to_jsonb(r)::text FROM matter_party_roles r
        UNION ALL SELECT 'QR',id::text,to_jsonb(q)::text FROM quarantine.matter_relationship_transform q
        UNION ALL SELECT 'AC',cell_id,to_jsonb(c)::text FROM _migration.attendee_source_cell c
        UNION ALL SELECT 'AS',fragment_id,to_jsonb(s)::text FROM _migration.attendee_source_span s
        UNION ALL SELECT 'AQ',fragment_id,to_jsonb(q)::text FROM quarantine.attendee_span q
        UNION ALL SELECT 'H',id::text,to_jsonb(h)::text FROM hearings h
        UNION ALL SELECT 'HA',id::text,to_jsonb(a)::text FROM hearing_attendees a
        UNION ALL SELECT 'HQ',id::text,to_jsonb(q)::text FROM quarantine.hearing_transform q
      ) protected`);
  return result.rows[0]?.digest ?? '';
}
