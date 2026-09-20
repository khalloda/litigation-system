import 'dotenv/config';
import assert from 'node:assert/strict';
import { Client } from 'pg';
import { writeFileSync, mkdirSync } from 'node:fs';
import { withApprovedMigrationClient } from './lib/migration-principal';
import { assertIsolatedTestCluster } from './lib/isolated-postgres-fixture';
import { auditHistoryFailures } from './lib/audit-history-checkpoint';
import { capture } from './lib/audit-history-test-state';
const out = process.env.TASK49_TEST_OUTPUT!;
mkdirSync(out, { recursive: true });
const put = (name: string, value: unknown) =>
  writeFileSync(`${out}/${name}.json`, JSON.stringify(value, null, 2), { flag: 'wx' });
async function main() {
  const url = process.env.MIGRATION_DATABASE_URL!;
  await withApprovedMigrationClient(async (admin) => {
    await assertIsolatedTestCluster(admin, new URL(url));
    assert.deepEqual(await auditHistoryFailures(admin), []);
    const accounts = (await admin.query("SELECT id FROM user_accounts WHERE username='KHelmy'"))
      .rows;
    assert.equal(accounts.length, 1);
    const before = await capture(url);
    put('before', before);
    const runtime = new Client({ connectionString: process.env.DATABASE_URL });
    await runtime.connect();
    const cases: unknown[] = [];
    try {
      for (const end of ['SET CONSTRAINTS ALL IMMEDIATE', 'COMMIT']) {
        await runtime.query('BEGIN');
        assert.equal(
          (await runtime.query('SELECT session_user')).rows[0].session_user,
          'litigation_runtime',
        );
        await runtime.query('SELECT audit_set_human_context($1)', [accounts[0].id]);
        await runtime.query(
          "SELECT audit_set_event_context(gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),NULL,'task49-correction1:r1','unknown')",
        );
        await runtime.query(
          "SELECT audit_append_semantic_event_for_account('export_completed','succeeded',NULL,NULL,NULL,NULL,NULL,'audit_history:global','{}'::jsonb,NULL,'{}'::jsonb)",
        );
        await assert.rejects(
          runtime.query(end),
          (e: unknown) => (e as { code: string }).code === '23514',
        );
        await runtime.query('ROLLBACK');
        cases.push({ end, expected: '23514', actual: '23514' });
      }
      await runtime.query('BEGIN');
      await runtime.query('SELECT audit_set_human_context($1)', [accounts[0].id]);
      await runtime.query(
        "SELECT audit_set_event_context(gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),NULL,'task49-correction1:r1-literal-prefix','unknown')",
      );
      await runtime.query(
        "SELECT audit_append_semantic_event_for_account('export_completed','succeeded',NULL,NULL,NULL,NULL,NULL,'auditXhistory:ordinary','{}'::jsonb,NULL,'{}'::jsonb)",
      );
      await runtime.query('SET CONSTRAINTS ALL IMMEDIATE');
      await runtime.query('ROLLBACK');
      cases.push({
        resource: 'auditXhistory:ordinary',
        forcedChecks: 'allowed; not reserved literal prefix',
        rolledBack: true,
      });
      // Privileged diagnostics bypass neither triggers nor immutable-row guards.
      // Each side must fail at deferred transaction boundary, not merely a scan.
      for (const side of [
        'grant-event',
        'revoke-event',
        'current-state',
        'change-chain',
        'receipt',
      ]) {
        await admin.query('BEGIN');
        await admin.query('SELECT audit_set_migration_context()');
        await admin.query(
          "SELECT audit_set_event_context(gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),NULL,'task49-correction1:corruption','system')",
        );
        if (side === 'current-state')
          await admin.query('UPDATE _migration.audit_export_capability SET enabled=NOT enabled');
        else {
          const action =
            side === 'grant-event'
              ? 'audit_export_granted'
              : side === 'revoke-event' || side === 'change-chain'
                ? 'audit_export_revoked'
                : 'export_completed';
          const event = (
            await admin.query(
              "SELECT audit_write_event($1,'succeeded',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,$2,'{}',NULL,'{}')::text id",
              [action, side === 'receipt' ? 'auditXhistory:ordinary' : null],
            )
          ).rows[0].id;
          if (side === 'change-chain')
            await admin.query(
              "INSERT INTO _migration.audit_export_capability_change VALUES($1,$2,true,false,'TASK49 isolated mismatched chain')",
              [event, accounts[0].id],
            );
          if (side === 'receipt')
            await admin.query(
              "INSERT INTO _migration.audit_export_receipt VALUES($1,gen_random_uuid(),repeat('a',64),repeat('b',64),$2)",
              [accounts[0].id, event],
            );
        }
        assert.equal(
          (await admin.query('SELECT _migration.audit_export_state_valid() valid')).rows[0].valid,
          false,
          side,
        );
        await assert.rejects(
          admin.query('SET CONSTRAINTS ALL IMMEDIATE'),
          (e: unknown) => (e as { code: string }).code === '23514',
        );
        await admin.query('ROLLBACK');
        cases.push({ side, validator: false, deferredBoundary: '23514', rolledBack: true });
      }
      for (const mutation of [
        'ALTER TABLE public.audit_events DISABLE TRIGGER audit_export_event_consistency',
        'DROP TRIGGER audit_export_event_consistency ON public.audit_events',
      ]) {
        await admin.query('BEGIN');
        await admin.query(mutation);
        const failures = await auditHistoryFailures(admin);
        assert.ok(
          failures.some((x) => /event.side|event.*trigger|trigger.*event/iu.test(x)),
          JSON.stringify(failures),
        );
        cases.push({ mutation, failures });
        await admin.query('ROLLBACK');
      }
      const after = await capture(url);
      put('after', after);
      for (const key of ['tables', 'sequences', 'catalogs', 'frozen', 'counter'] as const)
        assert.deepEqual(after[key], before[key]);
      assert.deepEqual(await auditHistoryFailures(admin), []);
      put('result', { status: 'PASS', cases, fullRollbackExact: true });
      console.log(
        'PASS R1 runtime immediate/commit orphan refusal, literal prefix and catalog negatives; full state exact.',
      );
    } finally {
      await runtime.query('ROLLBACK');
      await runtime.end();
      await admin.query('ROLLBACK');
    }
  });
}
main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
