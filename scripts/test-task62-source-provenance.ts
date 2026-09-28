/** Permanent provenance fault probes, confined to an explicitly owned fixture. */
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { decode } from 'next-auth/jwt';
import { readSessionClaims } from '../src/lib/auth/session';
import { withApprovedMigrationClient } from './lib/migration-principal';
import { assertIsolatedTestCluster } from './lib/isolated-postgres-fixture';
import { task62SourceFailures } from './lib/task62-source-checkpoint';

const input = JSON.parse(readFileSync(process.argv[2]!, 'utf8'));
const f = JSON.parse(readFileSync(input.fixturePath, 'utf8'));
const records: { name: string; status: string }[] = [];
async function main() {
  const cookie = JSON.parse(readFileSync(input.adminSession, 'utf8'));
  const value = await decode({
    token: cookie.token,
    salt: cookie.cookieName,
    secret: process.env.AUTH_SECRET!,
  });
  assert.ok(value);
  const a = readSessionClaims(value);
  assert.ok(a);
  await withApprovedMigrationClient(
    async (db) => {
      await assertIsolatedTestCluster(db, new URL(input.databaseUrl), f.environment);
      assert.deepEqual(await task62SourceFailures(db), []);
      assert.equal(
        (await db.query('SELECT count(*)::int n FROM _migration.task62_source_receipt')).rows[0].n,
        31,
      );
      const record = (name: string) => {
        records.push({ name, status: 'PASS' });
        console.log('PASS ' + name);
      };
      const attempt = async (name: string, work: () => Promise<unknown>) => {
        await db.query('BEGIN');
        try {
          await work();
          record(name);
        } finally {
          await db.query('ROLLBACK');
        }
        assert.deepEqual(await task62SourceFailures(db), [], 'Fixture restored after fault probe');
      };
      for (const action of [
        'UPDATE _migration.task62_source_receipt SET target_id=target_id WHERE false',
        'DELETE FROM _migration.task62_source_receipt WHERE false',
        'TRUNCATE _migration.task62_source_receipt',
      ])
        await attempt('append-only ' + action.split(' ')[0], () =>
          assert.rejects(db.query(action), /immutable|append.only|cannot|refus/iu),
        );
      const source = (
        await db.query(
          "SELECT * FROM _migration.task62_source_receipt WHERE kind='hearing_source' ORDER BY source_identity",
        )
      ).rows;
      for (const row of source) {
        const found = (
          await db.query(
            'SELECT target_id FROM _migration.task62_source_receipt WHERE source_lineage=$1 AND kind=$2 AND source_identity=$3',
            [row.source_lineage, row.kind, row.source_identity],
          )
        ).rows;
        assert.deepEqual(found, [{ target_id: row.target_id }]);
        record('stable source lookup ignores changed file SHA ' + row.source_identity);
      }
      const columns = (
        await db.query(
          "SELECT attname FROM pg_attribute WHERE attrelid='_migration.task62_source_receipt'::regclass AND attnum>0 AND NOT attisdropped ORDER BY attnum",
        )
      ).rows.map((r) => r.attname);
      for (const changedHash of [false, true])
        await attempt(
          changedHash
            ? 'duplicate identity under changed SHA refuses'
            : 'exact duplicate source identity refuses',
          async () => {
            const expressions = columns.map((n) =>
              n === 'source_sha256' && changedHash ? "repeat('0',64)" : n,
            );
            await assert.rejects(
              db.query(
                `INSERT INTO _migration.task62_source_receipt(${columns.join(',')}) SELECT ${expressions.join(',')} FROM _migration.task62_source_receipt LIMIT 1`,
              ),
              changedHash ? /source_sha256_check/u : /duplicate key/u,
            );
          },
        );
      const faults: [string, string][] = [
        [
          'wrong parent',
          "UPDATE _migration.task62_source_receipt SET matter_id=CASE WHEN matter_id=3269 THEN 3311 ELSE 3269 END WHERE kind='hearing_source'",
        ],
        [
          'wrong target',
          "UPDATE _migration.task62_source_receipt SET target_id=target_id+900000 WHERE kind='hearing_source'",
        ],
        [
          'wrong audit link',
          "UPDATE _migration.task62_source_receipt SET audit_event_id=(SELECT max(id) FROM public.audit_events WHERE action='login_succeeded') WHERE source_identity=(SELECT min(source_identity) FROM _migration.task62_source_receipt WHERE kind='party_release')",
        ],
        [
          'wrong source payload',
          'UPDATE _migration.task62_source_receipt SET source_values=source_values||\'{"retainedRaw":"TASK-OWNED TAMPER"}\'::jsonb WHERE kind=\'party_release\'',
        ],
        [
          'wrong after image',
          'UPDATE _migration.task62_source_receipt SET after_values=after_values||\'{"decision":"TASK-OWNED TAMPER"}\'::jsonb WHERE kind=\'hearing_source\'',
        ],
        [
          'partial receipts',
          'DELETE FROM _migration.task62_source_receipt WHERE source_identity=(SELECT min(source_identity) FROM _migration.task62_source_receipt)',
        ],
        [
          'partial manifest',
          "UPDATE _migration.task62_source_receipt SET operation_manifest=jsonb_set(operation_manifest,'{capacities}','[]')",
        ],
      ];
      for (const [name, sql] of faults)
        await attempt('counterfactual checker ' + name, async () => {
          // Deliberate counterfactual corruption inside a rollback-only owned fixture
          // transaction. No runner bypass or disabled guard can escape this test.
          await db.query(
            'ALTER TABLE _migration.task62_source_receipt DISABLE TRIGGER task62_source_immutable',
          );
          await db.query(sql);
          await db.query(
            'ALTER TABLE _migration.task62_source_receipt ENABLE TRIGGER task62_source_immutable',
          );
          const result = await task62SourceFailures(db);
          assert.ok(result.length, result.join('\n'));
        });
      const structural: [string, string][] = [
        [
          'runtime table grant',
          'GRANT SELECT ON _migration.task62_source_receipt TO litigation_runtime',
        ],
        [
          'runtime function grant',
          'GRANT EXECUTE ON FUNCTION _migration.task62_source_operation_valid(uuid) TO litigation_runtime',
        ],
        [
          'changed search path',
          'ALTER FUNCTION _migration.task62_source_operation_valid(uuid) SET search_path=public',
        ],
        [
          'disabled trigger',
          'ALTER TABLE _migration.task62_source_receipt DISABLE TRIGGER task62_source_complete',
        ],
        [
          'dropped unique constraint',
          'ALTER TABLE _migration.task62_source_receipt DROP CONSTRAINT task62_source_receipt_kind_target_id_key',
        ],
        [
          'private default grant',
          'ALTER DEFAULT PRIVILEGES IN SCHEMA _migration GRANT SELECT ON TABLES TO litigation_runtime',
        ],
        [
          'altered function body',
          'CREATE OR REPLACE FUNCTION _migration.task62_source_operation_valid(p_operation uuid) RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$BEGIN RETURN true; END$$',
        ],
        [
          'wrong ledger checksum',
          "UPDATE public._prisma_migrations SET checksum=repeat('0',64) WHERE migration_name='20260928070000_task62_bounded_source_provenance'",
        ],
        [
          'unfinished ledger',
          "UPDATE public._prisma_migrations SET finished_at=NULL WHERE migration_name='20260928070000_task62_bounded_source_provenance'",
        ],
      ];
      for (const [name, sql] of structural)
        await attempt('structural detection ' + name, async () => {
          await db.query(sql);
          assert.ok((await task62SourceFailures(db)).length);
        });
      const establish = async (request: string) => {
        await db.query('SELECT public.audit_set_human_context($1)', [a.userId]);
        await db.query(
          "SELECT public.audit_set_event_context($1::uuid,$1::uuid,$2::uuid,NULL,'task62-readiness-provenance-test','system')",
          [request, a.auditSessionId],
        );
      };
      await attempt('reserved operation cannot commit business without receipts', async () => {
        await establish('62620075-abcd-5123-8123-123456789012');
        await db.query(
          "INSERT INTO public.lookup_party_role(code,label_ar_m,label_ar_f,updated_at) VALUES('task62_fixture_missing_receipt','TASK-OWNED TEST','TASK-OWNED TEST',statement_timestamp())",
        );
        await assert.rejects(
          db.query('SET CONSTRAINTS ALL IMMEDIATE'),
          /complete approved immutable provenance/u,
        );
      });
      await attempt('legitimate later hearing edit preserves creation provenance', async () => {
        await establish(randomUUID());
        const id = source[0].target_id;
        const version = (
          await db.query('SELECT row_version::text v FROM public.hearings WHERE id=$1', [id])
        ).rows[0].v;
        await db.query('SELECT public.hearing_edit_save($1,$2,$3,$4::timestamptz,$5::jsonb)', [
          a.userId,
          a.sessionVersion,
          a.role,
          new Date(a.absoluteExpiresAt).toISOString(),
          JSON.stringify({
            id,
            version,
            submission: randomUUID(),
            values: { decision: 'TASK-OWNED LATER EDIT' },
          }),
        ]);
        await db.query('SET CONSTRAINTS ALL IMMEDIATE');
        assert.deepEqual(await task62SourceFailures(db), []);
      });
      await attempt('legitimate later party retirement preserves creation provenance', async () => {
        await establish(randomUUID());
        const r = (
          await db.query(
            "SELECT matter_id,target_id FROM _migration.task62_source_receipt WHERE kind='party_release' ORDER BY source_identity LIMIT 1",
          )
        ).rows[0];
        const state = (
          await db.query('SELECT public.matter_edit_state($1,$2,$3,$4::timestamptz,$5) s', [
            a.userId,
            a.sessionVersion,
            a.role,
            new Date(a.absoluteExpiresAt).toISOString(),
            r.matter_id,
          ])
        ).rows[0].s;
        await db.query('SELECT public.matter_edit_save($1,$2,$3,$4::timestamptz,$5::jsonb)', [
          a.userId,
          a.sessionVersion,
          a.role,
          new Date(a.absoluteExpiresAt).toISOString(),
          JSON.stringify({
            id: r.matter_id,
            version: state.record.version,
            submission: randomUUID(),
            values: {},
            parties: state.parties.filter((p: { id: number }) => p.id !== r.target_id),
          }),
        ]);
        await db.query('SET CONSTRAINTS ALL IMMEDIATE');
        assert.deepEqual(await task62SourceFailures(db), []);
      });
      await attempt(
        'legitimate later capacity label maintenance preserves creation provenance',
        async () => {
          await establish(randomUUID());
          const id = (
            await db.query(
              "SELECT (operation_manifest->'capacities'->0->>'id')::int id FROM _migration.task62_source_receipt LIMIT 1",
            )
          ).rows[0].id;
          await db.query(
            "UPDATE public.lookup_party_role SET label_ar_m=label_ar_m||' [TASK-OWNED LATER EDIT]' WHERE id=$1",
            [id],
          );
          await db.query('SET CONSTRAINTS ALL IMMEDIATE');
          assert.deepEqual(await task62SourceFailures(db), []);
        },
      );
      writeFileSync(
        input.output,
        JSON.stringify(
          {
            status: 'PASS',
            cases: records,
            scope:
              'Rollback-only counterfactual and future-change tests in separate owned full-state clone; sequence reservations retained',
          },
          null,
          2,
        ),
        { flag: 'wx' },
      );
    },
    { databaseUrl: input.databaseUrl },
  );
}
main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
