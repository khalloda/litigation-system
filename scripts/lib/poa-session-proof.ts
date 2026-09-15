import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { PrismaClient } from '../../src/generated/prisma/client';
import type { IsolatedPostgres } from './isolated-postgres-fixture';
import { assertIsolatedTestCluster } from './isolated-postgres-fixture';
import { withApprovedMigrationClient } from './migration-principal';
import { lifecycleSessions } from './matter-lifecycle-proof';
import { mutatePoa } from '../../src/lib/poa-mutations';
import { createMaintenanceAuditMetadata } from '../../src/lib/audit-metadata';
import { adminEditState } from './admin-edit-state';

export async function provePoaSession(
  fixture: IsolatedPostgres,
  runtime: PrismaClient,
  output: string,
) {
  const sessions = await lifecycleSessions(runtime),
    admin = sessions.find((s) => s.user.role === 'Administrator')!,
    assistant = sessions.find((s) => s.user.role === 'Litigation Assistant')!;
  assert.notEqual(assistant.user.username, 'KHelmy');
  const inspect = <T>(fn: Parameters<typeof withApprovedMigrationClient<T>>[0]) =>
    withApprovedMigrationClient(
      async (db) => {
        await assertIsolatedTestCluster(db, new URL(fixture.migrationUrl), fixture.environment);
        return fn(db);
      },
      { databaseUrl: fixture.migrationUrl },
    );
  const request = {
    operation: 'create',
    id: null,
    version: null,
    submission: randomUUID(),
    values: { principal_name: 'TEST ONLY owned receipt' },
    lawyers: [],
    facts: null,
  };
  const saved = await mutatePoa(assistant, 'create', request, {
      database: runtime,
      auditMetadata: createMaintenanceAuditMetadata(),
    }),
    results: unknown[] = [];
  const baseline = await inspect(adminEditState);
  for (const change of [
    'is_enabled=false',
    'must_change_password=true',
    "role_code='Lawyer'",
    'session_version=session_version+1',
  ])
    await inspect(async (db) => {
      await db.query('BEGIN');
      try {
        const args = [
          Number(assistant.user.id),
          assistant.user.sessionVersion,
          assistant.user.role,
          assistant.expires,
          JSON.stringify(request),
        ];
        await db.query('SELECT audit_set_human_context($1)', [Number(assistant.user.id)]);
        assert.deepEqual(
          (await db.query('SELECT poa_edit_save($1,$2,$3,$4,$5) result', args)).rows[0].result,
          saved,
        );
        await db.query('SELECT audit_set_human_context($1)', [Number(admin.user.id)]);
        await db.query(
          "SELECT audit_set_event_context($1,$2,$3,NULL,'TEST ONLY POA session proof','system')",
          [randomUUID(), randomUUID(), randomUUID()],
        );
        const rows = await db.query(
          'UPDATE user_accounts SET ' +
            change +
            (change.startsWith('session_version') ? '' : ',session_version=session_version+1') +
            " WHERE id=$1 AND username<>'KHelmy' RETURNING id",
          [Number(assistant.user.id)],
        );
        assert.equal(rows.rowCount, 1);
        await assert.rejects(
          db.query('SELECT poa_edit_save($1,$2,$3,$4,$5)', args),
          /Current authorized power of attorney session required/u,
        );
        results.push({ change, positiveExactReceipt: true, refusedBeforeReceipt: true });
      } finally {
        await db.query('ROLLBACK');
      }
    });
  await inspect(async (holder) => {
    await holder.query('BEGIN');
    await holder.query('SELECT 1 FROM _migration.staff_roster_mutex WHERE singleton FOR UPDATE');
    const pending = mutatePoa(
      assistant,
      'create',
      { ...request, submission: randomUUID() },
      { database: runtime, auditMetadata: createMaintenanceAuditMetadata() },
    ).then(
      (value) => ({ ok: true, value }),
      () => ({ ok: false }),
    );
    try {
      let blocked: unknown[] = [];
      for (let n = 0; n < 100; n++) {
        await holder.query('SELECT pg_stat_clear_snapshot()');
        blocked = (
          await holder.query(
            "SELECT pid,wait_event_type,wait_event,pg_blocking_pids(pid) blockers FROM pg_stat_activity WHERE usename='litigation_runtime' AND wait_event_type='Lock'",
          )
        ).rows;
        if (blocked.length) break;
        await new Promise((r) => setTimeout(r, 50));
      }
      assert.equal(blocked.length, 1);
      await holder.query('SELECT audit_set_human_context($1)', [Number(admin.user.id)]);
      await holder.query(
        "SELECT audit_set_event_context($1,$2,$3,NULL,'TEST ONLY POA concurrent session invalidation','system')",
        [randomUUID(), randomUUID(), randomUUID()],
      );
      assert.equal(
        (
          await holder.query(
            "UPDATE user_accounts SET session_version=session_version+1 WHERE id=$1 AND username<>'KHelmy'",
            [Number(assistant.user.id)],
          )
        ).rowCount,
        1,
      );
      await holder.query('COMMIT');
      assert.equal((await pending).ok, false);
      results.push({
        name: 'observed session revocation while POA gateway waits',
        blocked,
        refused: true,
      });
    } finally {
      await holder.query('ROLLBACK');
      await pending;
    }
  });
  const after = await inspect(adminEditState);
  // The committed fixture-account revocation also advances its existing audit
  // counter and roster mutex. POA state must remain entirely unchanged.
  const accountEffects = new Set([
    'user_accounts',
    'audit_events',
    'matter_lifecycle_audit_counter',
    'staff_roster_mutex',
  ]);
  assert.deepEqual(
    after.tables.filter((t) => !accountEffects.has(t.table)),
    baseline.tables.filter((t) => !accountEffects.has(t.table)),
  );
  assert.deepEqual(
    after.sequences.filter((s) => s.sequencename.startsWith('poa')),
    baseline.sequences.filter((s) => s.sequencename.startsWith('poa')),
  );
  results.push({ accountEffects: [...accountEffects], baseline, after });
  writeFileSync(join(output, 'session-proof.json'), JSON.stringify(results, null, 2));
  console.log(
    'PASS fresh authority before owned receipt reuse and observed concurrent session revocation',
  );
}
