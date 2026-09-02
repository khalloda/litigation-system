import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import type { ClientBase } from 'pg';

/** Establish explicit metadata for one controlled migration transaction. */
export async function setMaintenanceAuditContext(
  database: ClientBase,
  operationLabel: string,
): Promise<void> {
  assert.match(operationLabel, /^[a-z0-9][a-z0-9:_-]{2,95}$/u);
  await database.query('SELECT public.audit_set_migration_context()');
  await database.query('SELECT public.audit_set_event_context($1,$2,$3,NULL,$4,$5)', [
    randomUUID(),
    randomUUID(),
    randomUUID(),
    `controlled-maintenance:${operationLabel}`,
    'system',
  ]);
}
