import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { ClientBase } from 'pg';
import { task69Sha } from './task69-contract';
export const TASK69_ACTOR_MIGRATION = '20261008010000_task69_actor_wall_clock';
export const task69ActorSql = () =>
  readFileSync(`prisma/migrations/${TASK69_ACTOR_MIGRATION}/migration.sql`, 'utf8');
export async function task69ActorApplied(db: ClientBase) {
  const rows = (
    await db.query(
      'SELECT checksum,finished_at,applied_steps_count FROM public._prisma_migrations WHERE migration_name=$1 AND rolled_back_at IS NULL',
      [TASK69_ACTOR_MIGRATION],
    )
  ).rows;
  if (!rows.length) return false;
  assert.equal(rows.length, 1);
  assert.ok(rows[0].finished_at);
  assert.equal(rows[0].applied_steps_count, 1);
  assert.equal(rows[0].checksum, task69Sha(task69ActorSql()));
  return true;
}
