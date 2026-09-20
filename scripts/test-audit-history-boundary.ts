import 'dotenv/config';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Session } from 'next-auth';
import { withApprovedMigrationClient } from './lib/migration-principal';
import { assertIsolatedTestCluster } from './lib/isolated-postgres-fixture';
import { auditHistoryFailures } from './lib/audit-history-checkpoint';
import { capture } from './lib/audit-history-test-state';
import { createDatabaseClient } from '../src/lib/db';
import { authenticateCredentials } from '../src/lib/auth/service';
import { createSessionClaims, validateSessionClaims } from '../src/lib/auth/session';
import { createRequestAuditMetadata } from '../src/lib/audit-metadata';
import { recordObservedExternalEvent } from '../src/lib/audit';
import { readAuditHistory } from '../src/lib/audit-history-query';
import {
  AuditHistoryError,
  type AuditResult,
  type AuditGroup,
} from '../src/lib/audit-history-types';
import {
  auditRuntimeSourceFailures,
  discoverAuditRuntimeSources,
} from './lib/audit-source-inventory';
async function main() {
  const output = process.env['TASK49_TEST_OUTPUT']!;
  assert.ok(output);
  mkdirSync(output, { recursive: true });
  copyFileSync(process.argv[1]!, resolve(output, 'executed-boundary.ts'));
  const put = (name: string, value: unknown) =>
    writeFileSync(resolve(output, name + '.json'), JSON.stringify(value, null, 2), { flag: 'wx' });
  const runtime = createDatabaseClient(process.env['DATABASE_URL']!),
    url = process.env['MIGRATION_DATABASE_URL']!;
  try {
    await withApprovedMigrationClient(
      async (db) => {
        await assertIsolatedTestCluster(db, new URL(url), process.env);
        assert.deepEqual(await auditHistoryFailures(db), []);
        const credentials = JSON.parse(readFileSync(process.env['TASK49_LOGINS']!, 'utf8')).find(
          (x: { username: string }) => x.username === 'KHelmy',
        );
        const user = await authenticateCredentials(credentials, {
          database: runtime,
          auditMetadata: createRequestAuditMetadata(
            new Request('http://127.0.0.1/task49-boundary-login'),
          ),
        });
        assert.ok(user);
        const claims = await validateSessionClaims(createSessionClaims(user), {
          database: runtime,
        });
        assert.ok(claims);
        const actor: Session = {
          user: {
            id: String(claims.userId),
            personId: claims.personId,
            username: claims.username,
            name: claims.displayName,
            role: claims.role,
            mustChangePassword: claims.mustChangePassword,
            sessionVersion: claims.sessionVersion,
            auditSessionId: claims.auditSessionId,
          },
          expires: new Date(claims.absoluteExpiresAt).toISOString(),
        };
        const before = await capture(url);
        put('before', before);
        const corruption = [];
        for (const sql of [
          'ALTER TABLE _migration.audit_export_capability ADD COLUMN unexpected text',
          'ALTER TABLE _migration.audit_export_receipt DROP CONSTRAINT audit_export_receipt_artifact_digest_check',
          'ALTER TABLE _migration.audit_export_capability_change DISABLE TRIGGER audit_export_capability_change_immutable',
          'GRANT SELECT ON _migration.audit_export_capability TO litigation_runtime',
          'ALTER FUNCTION public.audit_history_authority(integer,integer,integer,timestamptz,boolean) SECURITY INVOKER',
          'UPDATE _migration.audit_export_capability SET enabled=false',
        ]) {
          await db.query('BEGIN');
          try {
            await db.query(sql);
            const failures = await auditHistoryFailures(db);
            assert.ok(failures.length, sql);
            corruption.push({ sql, failures });
          } finally {
            await db.query('ROLLBACK');
          }
        }
        for (const sql of [
          'DELETE FROM _migration.audit_export_capability',
          'TRUNCATE _migration.audit_export_capability',
          'UPDATE _migration.audit_export_capability_change SET enabled=enabled',
          'DELETE FROM _migration.audit_export_receipt',
          'TRUNCATE _migration.audit_export_receipt',
        ]) {
          await db.query('BEGIN');
          try {
            await assert.rejects(() => db.query(sql), /immutable|append.only/iu);
            corruption.push({ sql, refused: true });
          } finally {
            await db.query('ROLLBACK');
          }
        }
        put('corruption', corruption);
        const raw = (
          await db.query(
            'SELECT id::text,entity_table,entity_key,before_values,after_values FROM audit_events ORDER BY id',
          )
        ).rows;
        const shapes = [
          ['contacts', 'client_id', 'clients'],
          ['client_logos', 'client_id', 'clients'],
          ['matter_lawyers', 'matter_id', 'matters'],
          ['matter_parties', 'matter_id', 'matters'],
          ['matter_party_roles', 'party_id', 'matter_parties'],
          ['hearing_attendees', 'hearing_id', 'hearings'],
          ['task_actions', 'task_id', 'admin_tasks'],
          ['power_of_attorney_lawyers', 'power_of_attorney_id', 'powers_of_attorney'],
          ['fee_letter_matters', 'fee_letter_id', 'fee_letters'],
          ['fee_letter_matters', 'matter_id', 'matters'],
          ['matter_fee_letter_references', 'matter_id', 'matters'],
          ['matter_fee_letter_references', 'fee_letter_id', 'fee_letters'],
          ['invoice_allocations', 'invoice_id', 'invoices'],
          ['payments', 'invoice_id', 'invoices'],
          ['person_name_alias', 'person_id', 'people'],
          ['user_accounts', 'person_id', 'people'],
        ] as const;
        const associations = new Map<string, Map<string, string>>();
        const familyProof = [];
        for (const [child, field, parent] of shapes) {
          const retained = (
            await db.query(`SELECT id::text,${field}::text parent FROM public.${child}`)
          ).rows;
          const map = new Map<string, string>(retained.map((r) => [r.id, r.parent]));
          // Independently prove the retained association agrees with EVERY recorded
          // before/after key in this population. A reparented row cannot be silently
          // used as a historical fallback under this immutable-key contract.
          for (const row of raw.filter((e) => e.entity_table === child)) {
            for (const values of [row.before_values, row.after_values]) {
              if (values?.[field] != null) {
                const p = String(values[field]);
                if (map.has(String(row.entity_key.id)))
                  assert.equal(
                    map.get(String(row.entity_key.id)),
                    p,
                    child + ' retained key disagrees with recorded evidence',
                  );
                else map.set(String(row.entity_key.id), p);
              }
            }
          }
          associations.set(child + ':' + parent, map);
          familyProof.push({
            child,
            field,
            parent,
            retainedRows: retained.length,
            recordedRows: raw.filter((e) => e.entity_table === child).length,
            identityPairs: [...map],
          });
        }
        // Include capacity rows under their proven party's matter, without using names.
        const partyMap = associations.get('matter_parties:matters')!,
          roleMap = associations.get('matter_party_roles:matter_parties')!;
        associations.set(
          'matter_party_roles:matters',
          new Map(
            [...roleMap].flatMap(([id, party]) =>
              partyMap.has(party) ? [[id, partyMap.get(party)!] as [string, string]] : [],
            ),
          ),
        );
        const scopedProof = [];
        for (const table of [
          ...new Set([...shapes.map((x) => x[2]), ...shapes.map((x) => x[0])]),
        ]) {
          const ids = new Set<string>(
            raw.filter((e) => e.entity_table === table).map((e) => String(e.entity_key.id)),
          );
          for (const [key, map] of associations)
            if (key.endsWith(':' + table))
              for (const value of map.values()) if (value) ids.add(value);
          const candidates = [...ids].sort((a, b) => Number(a) - Number(b));
          if (!candidates.length) candidates.push('2147483647');
          for (const id of [...new Set([candidates[0]!, candidates.at(-1)!])]) {
            const expected = raw
              .filter(
                (e) =>
                  (e.entity_table === table && String(e.entity_key.id) === id) ||
                  associations.get(e.entity_table + ':' + table)?.get(String(e.entity_key?.id)) ===
                    id,
              )
              .map((e) => e.id)
              .sort();
            const actual: string[] = [];
            let page = await readAuditHistory(actor, { table, id }, runtime);
            for (;;) {
              actual.push(...page.groups.flatMap((g) => g.events.map((e) => e.id)));
              if (!page.next) break;
              page = await readAuditHistory(actor, { table, id, cursor: page.next }, runtime);
            }
            assert.deepEqual(actual.sort(), expected, table + ':' + id);
            scopedProof.push({ table, id, expected, actual });
          }
        }
        put('all-family-association-oracle', {
          familyProof,
          scopedProof,
          noInvoiceToMatterInference: true,
        });
        // Existing scalar filters and genuine microsecond ordering are compared with
        // direct source facts; synthetic edge writes below are rolled back completely.
        const existing = await readAuditHistory(actor, {}, runtime);
        const cursor = existing.snapshot;
        const data = JSON.parse(Buffer.from(cursor.split('.')[0]!, 'base64url').toString());
        data.expires = Date.now() - 1;
        const encoded = Buffer.from(JSON.stringify(data)).toString('base64url');
        const expired =
          encoded +
          '.' +
          createHmac('sha256', process.env['AUTH_SECRET']!).update(encoded).digest('base64url');
        await assert.rejects(
          () => readAuditHistory(actor, { cursor: expired }, runtime),
          (e) => e instanceof AuditHistoryError && e.code === 'expired',
        );
        await db.query('BEGIN');
        try {
          await db.query('SELECT audit_set_migration_context()');
          await db.query(
            'UPDATE _migration.matter_lifecycle_audit_counter SET last_value=9007199254740992 WHERE singleton',
          );
          await db.query(`DO $fixture$ DECLARE correlation uuid:=gen_random_uuid(); session uuid:=gen_random_uuid(); request uuid; g integer; BEGIN
    FOR g IN 0..27 LOOP request:=gen_random_uuid();
     PERFORM audit_set_event_context(request,correlation,session,NULL,'TASK49 isolated rollback edge','system');
     PERFORM audit_write_event('record_updated','succeeded','public','lookup_importance',jsonb_build_object('id',1),ARRAY['label_ar'],jsonb_build_object('label_ar','before'),jsonb_build_object('label_ar','TASK49 EDGE أحمد 123'),NULL,NULL,NULL,'{}',NULL,jsonb_build_object('fixture','TASK49 rollback edge')) FROM generate_series(1,CASE WHEN g=0 THEN 60 ELSE 1 END);
    END LOOP; END $fixture$;`);
          const inserted = (
            await db.query(
              'SELECT request_id::text request,array_agg(id::text ORDER BY id) ids FROM audit_events WHERE id>9007199254740992 GROUP BY request_id ORDER BY min(id)',
            )
          ).rows as { request: string; ids: string[] }[];
          const auth = [
            Number(actor.user.id),
            actor.user.personId,
            actor.user.sessionVersion,
            actor.expires,
          ];
          const read = async (input: object): Promise<AuditResult> =>
            (
              await db.query('SELECT audit_history_read($1,$2,$3,$4,$5::jsonb) result', [
                ...auth,
                JSON.stringify(input),
              ])
            ).rows[0].result;
          const first = await read({ q: 'TASK49 EDGE', take: 25 }),
            collected: AuditGroup[] = [];
          let p = first;
          for (;;) {
            collected.push(...p.groups.slice(0, 25));
            if (p.groups.length <= 25) break;
            const last = p.groups[24]!;
            p = await read({
              q: 'TASK49 EDGE',
              take: 25,
              watermark: first.watermark,
              beforeTime: last.occurredAt,
              beforeId: last.lastId,
            });
          }
          assert.equal(first.totalGroups, 28);
          assert.equal(first.totalEvents, 87);
          assert.equal(collected.length, 28);
          assert.deepEqual(
            collected.flatMap((g) => g.events.map((e: { id: string }) => e.id)).sort(),
            inserted.flatMap((g) => g.ids).sort(),
          );
          assert.ok(collected.some((g) => g.count === 60));
          assert.ok(collected.every((g) => BigInt(g.lastId) > 9007199254740992n));
          // One statement shares statement_timestamp: 60 constituent events remain a
          // single group, while the 27 requests sharing correlation stay separate.
          const sixty = collected.find((g) => g.count === 60)!;
          assert.equal(
            new Set(sixty.events.map((e: { occurredAt: string }) => e.occurredAt)).size,
            1,
          );
          assert.equal(
            new Set(collected.map((g) => g.occurredAt)).size,
            1,
            'All 28 distinct requests have the identical stored microsecond',
          );
          const combined = await read({
            q: 'احمد ١٢٣',
            action: 'record_updated',
            actor: sixty.events[0]!.actorId,
            from: sixty.occurredAt.slice(0, 10),
            to: sixty.occurredAt.slice(0, 10),
            take: 50,
          });
          assert.equal(combined.totalEvents, 87);
          assert.equal(combined.totalGroups, 28);
          const excluded = await read({ q: 'TASK49 EDGE', to: '2000-01-01', take: 25 });
          assert.equal(excluded.totalEvents, 0);
          const sql = 'SELECT audit_history_read($1,$2,$3,$4,$5::jsonb)';
          const plan = (
            await db.query('EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) ' + sql, [
              ...auth,
              JSON.stringify({ q: 'TASK49 EDGE', take: 25 }),
            ])
          ).rows;
          put('reader-plan', plan);
          put('bigint-large-group', {
            inserted,
            groups: collected.map((g) => ({
              key: g.key,
              time: g.occurredAt,
              id: g.lastId,
              count: g.count,
            })),
            totalEvents: 87,
            totalGroups: 28,
          });
        } finally {
          await db.query('ROLLBACK');
        }
        const after = await capture(url);
        put('after', after);
        const { capturedAt: b, ...beforeBody } = before,
          { capturedAt: a, ...afterBody } = after;
        void a;
        void b;
        assert.deepEqual(afterBody, beforeBody);
        const fixed = await readAuditHistory(actor, {}, runtime);
        const expectedBefore = (
          await db.query('SELECT id::text FROM audit_events ORDER BY id')
        ).rows
          .map((r) => r.id)
          .sort();
        const append = recordObservedExternalEvent(
          runtime,
          Number(actor.user.id),
          createRequestAuditMetadata(new Request('http://127.0.0.1/task49-watermark-proof')),
          {
            action: 'report_executed',
            outcome: 'succeeded',
            resourceIdentifier: 'task49-fixture-independent-oracle-completed',
          },
        );
        const nextWhileAppending = fixed.next
          ? readAuditHistory(actor, { cursor: fixed.next }, runtime)
          : Promise.resolve(null);
        const [appended] = await Promise.all([append, nextWhileAppending]);
        const retained = await readAuditHistory(actor, { cursor: fixed.snapshot }, runtime, true);
        assert.deepEqual(
          retained.groups.flatMap((g) => g.events.map((e) => e.id)).sort(),
          expectedBefore,
        );
        assert.ok(!retained.groups.some((g) => g.events.some((e) => e.id === String(appended))));
        assert.equal(
          (await readAuditHistory(actor, {}, runtime)).totalEvents,
          fixed.totalEvents + 1,
        );
        put('concurrent-watermark', {
          snapshot: fixed.watermark,
          newEventId: String(appended),
          expectedBefore,
          actualRetained: retained.groups.flatMap((g) => g.events.map((e) => e.id)).sort(),
          fact: 'one fixture oracle operation actually completed; no business write or export fact',
        });
        const sources = discoverAuditRuntimeSources(process.cwd()),
          sourceProof = [];
        for (const [path, needle, replacement] of [
          [
            'src/lib/audit-history-query.ts',
            'const actor = authorize(session);',
            'const actor = session!;',
          ],
          [
            'src/lib/audit-history-export.ts',
            'await requireAuditAuthority(session, true, database);',
            '/* omitted */',
          ],
          ['src/lib/auth/account-form-input.ts', 'return (', 'return true; /*'],
        ]) {
          const original = sources.find((s) => s.path === path)!;
          assert.ok(original.text.includes(needle!));
          const changed = sources.map((s) =>
            s.path === path ? { ...s, text: s.text.replace(needle!, replacement!) } : s,
          );
          const failures = auditRuntimeSourceFailures(changed);
          assert.ok(failures.some((x) => x.includes('Audit-history guarded closure')));
          sourceProof.push({
            path,
            needle,
            failures: failures.filter((x) => x.includes('Audit-history')),
          });
        }
        put('source-negative', sourceProof);
        put('result', {
          at: new Date().toISOString(),
          status: 'PASS',
          corruptionCases: corruption.length,
          scopeCases: scopedProof.length,
          fullRollbackEquality: true,
          bigintAndLargeGroupEvents: 87,
        });
      },
      { databaseUrl: url },
    );
  } finally {
    await runtime.$disconnect();
  }
}
main().catch((e) => {
  console.error(
    e instanceof Error
      ? e.message.replace(/postgres(?:ql)?:\/\/[^\s"']+/gu, '[private URL]')
      : 'failed',
  );
  process.exitCode = 1;
});
