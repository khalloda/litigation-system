import type { ClientBase } from 'pg';
import { staffReadOnlyState } from './staff-read-only-state';

/** Sanitized complete row digests and individual sequence vectors. */
export async function adminEditState(db: ClientBase) {
  const state = await staffReadOnlyState(db);
  const names = (
    await db.query(`SELECT schemaname,sequencename FROM pg_sequences
    WHERE schemaname IN ('public','staging','quarantine','_migration') ORDER BY 1,2`)
  ).rows;
  const sequences = [];
  for (const s of names) {
    const quote = (v: string) => '"' + v.replaceAll('"', '""') + '"';
    const row = (
      await db.query(
        'SELECT last_value::text,log_cnt::text,is_called FROM ' +
          quote(s.schemaname) +
          '.' +
          quote(s.sequencename),
      )
    ).rows[0];
    sequences.push({ ...s, ...row });
  }
  return { ...state, sequences };
}
