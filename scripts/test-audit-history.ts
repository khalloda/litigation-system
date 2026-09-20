import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { mkdirSync, writeFileSync, copyFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Client } from 'pg';
import type { Session } from 'next-auth';
import {
  withApprovedMigrationClient,
  createApprovedMigrationPrismaClient,
} from './lib/migration-principal';
import { assertIsolatedTestCluster } from './lib/isolated-postgres-fixture';
import { auditHistoryFailures } from './lib/audit-history-checkpoint';
import { createDatabaseClient } from '../src/lib/db';
import {
  setApprovedAccountPassword,
  changeOwnPassword,
  authenticateCredentials,
} from '../src/lib/auth/service';
import { createSessionClaims, validateSessionClaims } from '../src/lib/auth/session';
import {
  createMaintenanceAuditMetadata,
  createRequestAuditMetadata,
} from '../src/lib/audit-metadata';
import {
  readAuditHistory,
  requireAuditAuthority,
  auditNormalize,
} from '../src/lib/audit-history-query';
import { AuditHistoryError, type AuditGroup } from '../src/lib/audit-history-types';
import { parseAuditInput } from '../src/lib/audit-history-input';
import { AuthorizationError } from '../src/lib/auth/authorization-core';
import { mutateDocument, readDocumentMutation } from '../src/lib/document-mutations';
import { handleAuditExport } from '../src/lib/audit-history-export';
import { capture } from './lib/audit-history-test-state';
const sha = (x: unknown) => createHash('sha256').update(JSON.stringify(x)).digest('hex');
async function main() {
  const url = process.env['MIGRATION_DATABASE_URL']!,
    runtimeUrl = process.env['DATABASE_URL']!;
  const output = resolve(
    process.env['TASK49_TEST_OUTPUT'] ?? 'test-results/task49-core-' + Date.now(),
  );
  mkdirSync(output, { recursive: true });
  const put = (name: string, value: unknown) =>
    writeFileSync(resolve(output, name + '.json'), JSON.stringify(value, null, 2), { flag: 'wx' });
  copyFileSync(process.argv[1]!, resolve(output, 'executed-test.ts'));
  const runtime = createDatabaseClient(runtimeUrl),
    owner = await createApprovedMigrationPrismaClient(url);
  const sessions: Session[] = [],
    logins: { username: string; password: string }[] = [];
  try {
    await withApprovedMigrationClient(
      async (admin) => {
        await assertIsolatedTestCluster(admin, new URL(url), process.env);
        assert.deepEqual(await auditHistoryFailures(admin), []);
        const accounts = (await admin.query('SELECT id,username FROM user_accounts ORDER BY id'))
          .rows;
        assert.equal(accounts.length, 4);
        for (const account of accounts) {
          const temporary = randomBytes(32).toString('base64url'),
            password = randomBytes(32).toString('base64url');
          await setApprovedAccountPassword(account.username, temporary, {
            database: owner,
            auditMetadata: createMaintenanceAuditMetadata(),
          });
          const version = (await owner.userAccount.findUniqueOrThrow({ where: { id: account.id } }))
            .sessionVersion;
          assert.equal(
            await changeOwnPassword(
              {
                accountId: account.id,
                sessionVersion: version,
                currentPassword: temporary,
                newPassword: password,
              },
              { database: runtime, auditMetadata: createMaintenanceAuditMetadata() },
            ),
            'changed',
          );
          const user = await authenticateCredentials(
            { username: account.username, password },
            {
              database: runtime,
              auditMetadata: createRequestAuditMetadata(
                new Request('http://127.0.0.1/task49-fixture-login'),
              ),
            },
          );
          assert.ok(user);
          const claims = await validateSessionClaims(createSessionClaims(user), {
            database: runtime,
          });
          assert.ok(claims);
          sessions.push({
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
          });
          logins.push({ username: account.username, password });
        }
        const privateRoot = process.env['TASK49_PRIVATE_ROOT'];
        assert.ok(privateRoot, 'Explicit protected task-only credentials root required');
        writeFileSync(resolve(privateRoot, 'fixture-logins.json'), JSON.stringify(logins), {
          flag: 'wx',
        });
        const actor = sessions.find((s) => s.user.id === '2')!;
        assert.equal(await requireAuditAuthority(actor, true, runtime), true);
        async function state() {
          const tables = (
            await admin.query(
              "SELECT schemaname schema,tablename name FROM pg_tables WHERE schemaname!~'^pg_' AND schemaname<>'information_schema' ORDER BY 1,2",
            )
          ).rows;
          const result = [];
          for (const table of tables) {
            const q = (s: string) => '"' + s.replaceAll('"', '""') + '"';
            const row = (
              await admin.query(
                `SELECT count(*)::text count,encode(sha256(convert_to(coalesce(string_agg(to_jsonb(t)::text,chr(10) ORDER BY to_jsonb(t)::text COLLATE "C"),''),'UTF8')),'hex') hash FROM ${q(table.schema)}.${q(table.name)} t`,
              )
            ).rows[0];
            result.push({ ...table, ...row });
          }
          return result;
        }
        const before = await state();
        put('read-before', before);
        const fullBefore = await capture(url);
        put('read-full-before', fullBefore);
        const rows = (
          await admin.query(
            `SELECT e.id::text,to_char(e.occurred_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') time,e.actor_id::text,e.actor_key_snapshot,e.actor_username_snapshot,e.actor_display_name_snapshot,e.actor_role_snapshot,e.request_id,e.correlation_id,e.audit_session_id,e.action,e.entity_table,e.entity_key,e.changed_fields FROM public.audit_events e ORDER BY e.occurred_at,e.id`,
          )
        ).rows;
        const byIdentity = new Map<string, typeof rows>();
        for (const row of rows) {
          const identity = JSON.stringify([
            row.request_id,
            row.correlation_id,
            row.audit_session_id,
            row.actor_id,
            row.actor_key_snapshot,
            row.actor_username_snapshot,
            row.actor_display_name_snapshot,
            row.actor_role_snapshot,
          ]);
          const group = byIdentity.get(identity) ?? [];
          group.push(row);
          byIdentity.set(identity, group);
        }
        const expected = [...byIdentity.values()]
          .map((group) => ({
            ids: group.map((r) => r.id),
            time: group
              .map((r) => r.time)
              .sort()
              .at(-1)!,
            id: group.reduce((a, r) => (BigInt(a) > BigInt(r.id) ? a : r.id), '0'),
          }))
          .sort((a, b) =>
            a.time === b.time ? (BigInt(a.id) > BigInt(b.id) ? -1 : 1) : a.time > b.time ? -1 : 1,
          );
        let page = await readAuditHistory(actor, {}, runtime);
        const first = page;
        const actual: AuditGroup[] = [];
        const pageIds: string[][] = [];
        for (;;) {
          actual.push(...page.groups);
          pageIds.push(page.groups.flatMap((g) => g.events.map((e) => e.id)));
          if (!page.next) break;
          page = await readAuditHistory(actor, { cursor: page.next }, runtime);
        }
        assert.deepEqual(
          actual.map((g) => g.events.map((e) => e.id)),
          expected.map((g) => g.ids),
        );
        assert.equal(new Set(actual.flatMap((g) => g.events.map((e) => e.id))).size, rows.length);
        assert.equal(first.totalEvents, rows.length);
        const rawValues = (
          await admin.query(
            `SELECT e.id::text,side,label.key field,jsonb_typeof(label.value) kind,CASE WHEN jsonb_typeof(label.value)='string' THEN label.value#>>'{}' ELSE label.value::text END text FROM audit_events e CROSS JOIN LATERAL (VALUES('before',e.before_values),('after',e.after_values)) v(side,values) CROSS JOIN LATERAL jsonb_each(v.values) label ORDER BY e.id,side,label.key`,
          )
        ).rows;
        const eventMap = new Map(actual.flatMap((g) => g.events).map((e) => [e.id, e]));
        for (const value of rawValues) {
          const event = eventMap.get(value.id)!;
          assert.deepEqual((value.side === 'before' ? event.before : event.after)[value.field], {
            kind: value.kind,
            text: value.text,
          });
        }
        put('oracle', {
          population: rows,
          independentGroups: expected,
          actualPageIds: pageIds,
          valueProjectionCount: rawValues.length,
          expectedValuesSha256: sha(rawValues),
          watermark: first.watermark,
        });
        for (const action of [
          'login_succeeded',
          'login_failed',
          'record_created',
          'audit_export_granted',
        ]) {
          const filtered = await readAuditHistory(actor, { action }, runtime);
          const expectedGroups = [...byIdentity.values()].filter((g) =>
            g.some((e) => e.action === action),
          );
          assert.equal(filtered.totalGroups, expectedGroups.length);
          assert.equal(
            filtered.totalEvents,
            expectedGroups.reduce((n, g) => n + g.length, 0),
          );
        }
        const historicalActor = rows.find((r) => r.actor_username_snapshot)?.actor_id;
        assert.ok(historicalActor);
        const filtered = await readAuditHistory(actor, { actor: historicalActor }, runtime);
        assert.equal(
          filtered.totalGroups,
          [...byIdentity.values()].filter((g) => g.some((e) => e.actor_id === historicalActor))
            .length,
        );
        assert.equal(
          (await readAuditHistory(actor, { q: 'Task49NoSuchRecordedValue' }, runtime)).totalEvents,
          0,
        );
        assert.equal(
          (await readAuditHistory(actor, { table: 'documents', id: '2147483647' }, runtime))
            .totalEvents,
          0,
        );
        for (const sample of ['أَحمد', 'احمد', 'عبد العزيز', '١٤٠J', '۱۴۰ق', 'JTI', 'ةىؤئ'])
          assert.equal(
            auditNormalize(sample),
            (await admin.query('SELECT ar_normalise($1) v', [sample])).rows[0].v,
          );
        assert.notEqual(auditNormalize('140J'), auditNormalize('140ق'));
        for (const input of [
          { cursor: first.snapshot + 'x' },
          { cursor: first.snapshot, q: 'changed' },
          { cursor: first.snapshot, table: 'documents', id: '1' },
          { from: '2026-02-30' },
          { from: '2026-03-01', to: '2026-02-01' },
          { q: 'x'.repeat(161) },
          { table: 'audit_events', id: '1' },
          { bad: 'field' },
        ])
          await assert.rejects(() => readAuditHistory(actor, input, runtime), AuditHistoryError);
        assert.throws(() => parseAuditInput({ q: ['x'] }), AuditHistoryError);
        for (const denied of [
          null,
          ...sessions.filter((s) => s.user.id !== '2'),
          { ...actor, expires: '2000-01-01T00:00:00Z' },
          { ...actor, user: { ...actor.user, sessionVersion: actor.user.sessionVersion + 1 } },
          { ...actor, user: { ...actor.user, mustChangePassword: true } },
        ]) {
          await assert.rejects(() => readAuditHistory(denied, {}, runtime), AuthorizationError);
          await assert.rejects(
            () => requireAuditAuthority(denied, true, runtime),
            AuthorizationError,
          );
        }
        const probe = new Client({ connectionString: runtimeUrl });
        await probe.connect();
        try {
          for (const sql of [
            'SELECT * FROM audit_events',
            'SELECT * FROM audit_actors',
            'SELECT * FROM _migration.audit_export_capability',
            'UPDATE audit_events SET action=action',
            'DELETE FROM audit_events',
            'TRUNCATE audit_events',
            'SET ROLE litigation',
            "SELECT _migration.audit_export_set_capability(2,false,'forged runtime')",
          ]) {
            await assert.rejects(() => probe.query(sql), /permission denied|must be owner/iu);
          }
        } finally {
          await probe.end();
        }
        assert.deepEqual(await state(), before);
        put('read-after', await state());
        const fullAfter = await capture(url);
        put('read-full-after', fullAfter);
        const { capturedAt: beforeTime, ...beforeBody } = fullBefore,
          { capturedAt: afterTime, ...afterBody } = fullAfter;
        void beforeTime;
        void afterTime;
        assert.deepEqual(
          afterBody,
          beforeBody,
          'Every table/column, full sequence vector, catalog/ACL, old audit/ledger/account state unchanged over all reads/refusals',
        );
        const client = (
          await admin.query('SELECT id FROM clients WHERE NOT is_archived ORDER BY id LIMIT 1')
        ).rows[0].id;
        const values = {
          matter_id: null,
          client_id: client,
          responsible_person_id: null,
          description: 'TASK49 SYNTHETIC ONLY — أحمد =1+1 <script>alert(1)</script>',
          document_date: '2026-09-20',
          page_count: 0,
          deposit_date: null,
          movement_card: '',
          storage_location: null,
          notes: '0\nfalse\n@SUM(1,2)\n+1\n-1',
          mfiles_id: null,
        };
        const metadata = createRequestAuditMetadata(
          new Request('http://127.0.0.1/task49-fixture-save'),
        );
        let doc = await mutateDocument(
          actor,
          'create',
          {
            operation: 'create',
            id: null,
            version: null,
            submission: randomUUID(),
            values,
            related: null,
            facts: null,
          },
          { database: runtime, auditMetadata: metadata },
        );
        const createId = doc.id;
        const updateMeta = createRequestAuditMetadata(
          new Request('http://127.0.0.1/task49-fixture-save'),
        );
        doc = await mutateDocument(
          actor,
          'update',
          {
            operation: 'update',
            id: doc.id,
            version: doc.version,
            submission: randomUUID(),
            values: { ...values, description: values.description + '\nثانٍ', page_count: 1 },
            related: null,
            facts: null,
          },
          { database: runtime, auditMetadata: updateMeta },
        );
        for (const operation of ['archive', 'restore'] as const) {
          const snapshot = await readDocumentMutation(actor, operation, doc.id, runtime);
          doc = await mutateDocument(
            actor,
            operation,
            {
              operation,
              id: doc.id,
              version: doc.version,
              submission: randomUUID(),
              values: {},
              related: null,
              facts: snapshot.record!.facts,
            },
            {
              database: runtime,
              auditMetadata: createRequestAuditMetadata(
                new Request('http://127.0.0.1/task49-fixture-lifecycle'),
              ),
            },
          );
        }
        const context = await readAuditHistory(
          actor,
          { table: 'documents', id: String(doc.id) },
          runtime,
        );
        assert.equal(context.totalGroups, 4);
        assert.ok(context.groups.some((g) => g.events.some((e) => e.action === 'archive')));
        assert.ok(context.groups.some((g) => g.events.some((e) => e.action === 'restore')));
        const expectedDocIds = (
          await admin.query(
            "SELECT id::text FROM audit_events WHERE entity_table='documents' AND entity_key->>'id'=$1 ORDER BY id",
            [String(doc.id)],
          )
        ).rows.map((r) => r.id);
        assert.deepEqual(
          context.groups
            .flatMap((g) => g.events.map((e) => e.id))
            .sort((a, b) => Number(BigInt(a) - BigInt(b))),
          expectedDocIds,
        );
        put('synthetic-document', { id: createId, expectedDocIds, actual: context });
        const operationId = randomUUID();
        const query = new URLSearchParams({
          table: 'documents',
          id: String(doc.id),
          cursor: context.snapshot,
        }).toString();
        const request = () =>
          new Request('http://127.0.0.1/audit-history/export', {
            method: 'POST',
            headers: { Origin: 'http://127.0.0.1', 'Content-Type': 'application/json' },
            body: JSON.stringify({ format: 'xlsx', operationId, query }),
          });
        const beforeExport = await state();
        const exported = await handleAuditExport(actor, request(), runtime);
        assert.equal(exported.status, 200, await exported.clone().text());
        const bytes = Buffer.from(await exported.arrayBuffer());
        writeFileSync(resolve(output, 'synthetic-document.xlsx'), bytes);
        assert.equal(
          createHash('sha256').update(bytes).digest('hex'),
          exported.headers.get('x-artifact-sha256'),
        );
        const repeat = await handleAuditExport(actor, request(), runtime);
        assert.equal(repeat.status, 409);
        const afterExport = await state();
        const changed = afterExport
          .filter((row, index) => JSON.stringify(row) !== JSON.stringify(beforeExport[index]))
          .map((row) => row.schema + '.' + row.name)
          .sort();
        assert.deepEqual(changed, [
          '_migration.audit_export_receipt',
          '_migration.matter_lifecycle_audit_counter',
          'public.audit_events',
        ]);
        const exportEvent = (
          await admin.query(
            'SELECT id::text,action,actor_id,resource_identifier,parameters,event_metadata FROM audit_events WHERE id=$1',
            [exported.headers.get('x-audit-event-id')],
          )
        ).rows[0];
        assert.equal(exportEvent.action, 'export_completed');
        assert.equal(
          exportEvent.parameters.artifact_sha256,
          exported.headers.get('x-artifact-sha256'),
        );
        assert.equal(exportEvent.parameters.events, context.totalEvents);
        put('export-exact-delta', {
          before: beforeExport,
          after: afterExport,
          changed,
          event: exportEvent,
          retryStatus: repeat.status,
        });
        assert.deepEqual(await auditHistoryFailures(admin), []);
        put('result', {
          at: new Date().toISOString(),
          status: 'PASS',
          rows: rows.length,
          groups: expected.length,
          oldProjectionValues: rawValues.length,
          allTableReadEquality: before.length,
          documentId: doc.id,
          checks: [
            'independent full-population grouping and pagination union',
            'every recorded scalar type/text',
            'historical action/actor filters',
            'normalization parity/no-J',
            'cursor binding and malformed inputs',
            'four-role and session boundary',
            'raw runtime bypass refusals',
            'full table read/refusal equality',
            'genuine document create/update/archive/restore groups',
            'capability export exact audit/receipt/counter delta and retry',
          ],
        });
      },
      { databaseUrl: url },
    );
  } finally {
    await owner.$disconnect();
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
