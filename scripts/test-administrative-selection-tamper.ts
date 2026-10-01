import assert from 'node:assert/strict';
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { withApprovedMigrationClient } from './lib/migration-principal';
import { assertIsolatedTestCluster } from './lib/isolated-postgres-fixture';
import { administrativeSelectionFailures } from './lib/administrative-selection-checkpoint';

/** Every deliberate defect is transaction-local on the positively identified fixture. */
async function main() {
  const url = process.env['MIGRATION_DATABASE_URL'],
    out = process.env['TASK6567_EVIDENCE'];
  assert.ok(url && out);
  const path = join(out, 'administrative-selection-tamper.json');
  assert.ok(!existsSync(path));
  const cases: unknown[] = [];
  await withApprovedMigrationClient(
    async (c) => {
      await assertIsolatedTestCluster(c, new URL(url));
      assert.deepEqual(await administrativeSelectionFailures(c), []);
      for (const kind of ['hearing', 'step']) {
        const p = `administrative_${kind}_report_selection`;
        for (const suffix of ['submission', 'change']) {
          await c.query('BEGIN');
          try {
            await assert.rejects(
              () => c.query(`UPDATE _migration.${p}_${suffix} SET actor_id=actor_id`),
              /immutable/u,
            );
          } finally {
            await c.query('ROLLBACK');
          }
          cases.push({ name: `${kind} ${suffix} update refused` });
        }
        await c.query('BEGIN');
        try {
          await assert.rejects(() => c.query(`DELETE FROM public.${p}s WHERE false`), /immutable/u);
        } finally {
          await c.query('ROLLBACK');
        }
        cases.push({ name: `${kind} current-row deletion refused even with zero rows` });
      }
      const tamper: [string, string][] = [
        [
          'unrecorded current version',
          'ALTER TABLE public.administrative_hearing_report_selections DROP CONSTRAINT administrative_hearing_report_selections_row_version_check',
        ],
        [
          'runtime direct UPDATE grant',
          'GRANT UPDATE ON public.administrative_hearing_report_selections TO litigation_runtime',
        ],
        [
          'public current-table read grant',
          'GRANT SELECT ON public.administrative_step_report_selections TO PUBLIC',
        ],
        [
          'private receipt disclosure',
          'GRANT SELECT ON _migration.administrative_step_report_selection_submission TO litigation_runtime',
        ],
        [
          'public gateway execution',
          'GRANT EXECUTE ON FUNCTION public.administrative_hearing_report_selection_save(integer,integer,integer,text,timestamptz,jsonb) TO PUBLIC',
        ],
        [
          'public private-helper execution',
          'GRANT EXECUTE ON FUNCTION _migration.administrative_hearing_report_selection_valid(integer) TO PUBLIC',
        ],
        [
          'missing deferred history completeness',
          'DROP TRIGGER selection_history_complete ON _migration.administrative_step_report_selection_change',
        ],
        [
          'missing cross-purpose trigger',
          'DROP TRIGGER administrative_selection_scope ON _migration.lawyer_report_selection_submission',
        ],
        [
          'changed function volatility',
          'ALTER FUNCTION _migration.administrative_hearing_report_selection_valid(integer) VOLATILE',
        ],
        [
          'changed function search path',
          'ALTER FUNCTION _migration.administrative_hearing_report_selection_valid(integer) SET search_path=public,pg_catalog',
        ],
        [
          'registry immutability removed',
          'DROP TRIGGER immutable_rows ON _migration.administrative_report_submission_scope',
        ],
        [
          'weakened history function',
          `CREATE OR REPLACE FUNCTION _migration.administrative_hearing_report_selection_valid(p_id integer) RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public SET TimeZone='UTC' AS $$ BEGIN RETURN true; END $$`,
        ],
      ];
      for (const [name, sql] of tamper) {
        await c.query('BEGIN');
        let failures: string[] = [];
        try {
          await c.query(sql);
          failures = await administrativeSelectionFailures(c);
          assert.ok(failures.length > 0, `Undetected tamper: ${name}`);
        } finally {
          await c.query('ROLLBACK');
        }
        assert.deepEqual(await administrativeSelectionFailures(c), []);
        cases.push({ name, detected: true, rolledBack: true });
        writeFileSync(path, JSON.stringify({ status: 'RUNNING', cases }, null, 2));
      }
    },
    { databaseUrl: url },
  );
  writeFileSync(
    path,
    JSON.stringify(
      { status: 'PASS', utc: new Date().toISOString(), cases, noCommittedTamper: true },
      null,
      2,
    ),
  );
  console.log(
    `PASS ${cases.length} administrative selection immutability and structural-tamper controls`,
  );
}
main().catch((e) => {
  console.error(e instanceof Error ? e.message : 'Tamper proof failed');
  process.exitCode = 1;
});
