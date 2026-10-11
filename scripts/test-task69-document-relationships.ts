import type { Prisma } from '../src/generated/prisma/client';
import {
  documentCountQuery,
  documentRowsQuery,
  documentDetailQuery,
  parseDocumentFilters,
  type DocumentRecord,
} from '../src/lib/document-query';
import { parseDocumentInput, DocumentMutationError } from '../src/lib/document-mutation-input';
import { documentReports } from '../src/lib/reports/document-reports';
import { parseReportInput } from '../src/lib/reports/input';
import { reportColumns, validateReportData } from '../src/lib/reports/result';
import { t } from '../src/strings';
import { task69DocumentCatalog } from './lib/task69-document-checkpoint';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { SessionClaims } from '../src/lib/auth/session';
import { withApprovedMigrationClient, migrationDatabaseTarget } from './lib/migration-principal';
import { assertIsolatedTestCluster } from './lib/isolated-postgres-fixture';
async function main() {
  const started = new Date().toISOString(),
    root = process.env['TASK69_PRIVATE_ROOT']!,
    output = process.env['TASK69_EVIDENCE_OUTPUT']!,
    draft = process.argv.includes('--draft'),
    probes: string[] = [];
  const auth = JSON.parse(readFileSync(join(root, 'fixture-logins.json'), 'utf8')) as {
      role: string;
      claims: SessionClaims;
    }[],
    actor = auth.find((x) => x.role === 'Administrator')!.claims;
  await withApprovedMigrationClient(async (db) => {
    const target = migrationDatabaseTarget();
    assert(target.database.startsWith('litigation_task69_'));
    await assertIsolatedTestCluster(
      db,
      new URL(`${target.protocol}//${target.hostname}:${target.port}/${target.database}`),
    );
    const capture = async () =>
      (
        await db.query(
          "SELECT 'documents' entity,count(*)::int n,md5(string_agg(to_jsonb(d)::text,E'\\n' ORDER BY id)) digest FROM public.documents d UNION ALL SELECT 'audit_events',count(*)::int,md5(string_agg(to_jsonb(d)::text,E'\\n' ORDER BY id)) FROM public.audit_events d",
        )
      ).rows;
    const before = await capture();
    await db.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
    try {
      if (draft)
        await db.query(
          readFileSync(
            'prisma/migrations/20261007220000_task69_document_relationships/migration.sql',
            'utf8',
          )
            .replace(/^BEGIN;$/mu, '')
            .replace(/^COMMIT;$/mu, ''),
        );
      writeFileSync(
        output.replace('.json', '-schema.json'),
        JSON.stringify(await task69DocumentCatalog(db), null, 2) + '\n',
        { flag: 'wx' },
      );
      const id = (
        await db.query(
          'SELECT d.id FROM public.documents d LEFT JOIN public.matters m ON m.id=d.matter_id LEFT JOIN public.clients c ON c.id=d.client_id WHERE NOT d.is_archived AND NOT coalesce(m.is_archived,false) AND NOT coalesce(c.is_archived,false) ORDER BY d.id LIMIT 1',
        )
      ).rows[0].id;
      const matters = (
          await db.query('SELECT id FROM public.matters WHERE NOT is_archived ORDER BY id LIMIT 2')
        ).rows.map((x) => x.id),
        people = (
          await db.query(
            'SELECT id FROM public.people WHERE is_staff AND is_active ORDER BY id LIMIT 2',
          )
        ).rows.map((x) => x.id);
      assert.equal(matters.length, 2);
      assert.equal(people.length, 2);
      const state = async () =>
        (
          await db.query('SELECT public.document_edit_state($1,$2,$3,$4,$5) value', [
            actor.userId,
            actor.sessionVersion,
            actor.role,
            new Date(actor.absoluteExpiresAt).toISOString(),
            id,
          ])
        ).rows[0].value;
      const save = async (
        values: Record<string, unknown>,
        related: unknown = null,
        claims = actor,
        version?: string,
        operation = 'update',
        facts: unknown = null,
      ) => {
        const request = {
          operation,
          id,
          version: version ?? (await state()).record.version,
          submission: randomUUID(),
          values,
          related,
          facts,
        };
        await db.query('SELECT public.audit_set_human_context($1)', [claims.userId]);
        await db.query("SELECT public.audit_set_event_context($1,$2,$3,NULL,NULL,'system')", [
          randomUUID(),
          randomUUID(),
          claims.auditSessionId,
        ]);
        await db.query('SET LOCAL ROLE litigation_runtime');
        const value = (
          await db.query('SELECT public.document_edit_save($1,$2,$3,$4,$5::jsonb) value', [
            claims.userId,
            claims.sessionVersion,
            claims.role,
            new Date(claims.absoluteExpiresAt).toISOString(),
            JSON.stringify(request),
          ])
        ).rows[0].value;
        await db.query('RESET ROLE');
        await db.query('SET CONSTRAINTS ALL IMMEDIATE');
        await db.query('SET CONSTRAINTS ALL DEFERRED');
        return value;
      };
      const fault = async (name: string, fn: () => Promise<unknown>) => {
        await db.query('SAVEPOINT fault');
        let failed = false;
        try {
          await fn();
        } catch {
          failed = true;
        }
        await db.query('ROLLBACK TO SAVEPOINT fault');
        assert(failed, name);
        probes.push(name);
      };
      const query = async <T>(sql: Prisma.Sql) => {
        await db.query('SET LOCAL ROLE litigation_runtime');
        const result = (await db.query(sql.text, [...sql.values])).rows as T[];
        await db.query('RESET ROLE');
        return result;
      };
      const tx = { $queryRaw: query } as unknown as Prisma.TransactionClient;
      const old = await state(),
        related = { matterIds: matters, responsiblePersonIds: people };
      assert.equal((await save({}, related)).changed, true);
      const multi = await state();
      assert.equal(multi.record.values.matter_id, null);
      assert.equal(multi.record.values.responsible_person_id, null);
      assert.deepEqual(multi.record.related, related);
      assert.equal((await save({}, related)).changed, false);
      assert.equal((await save({ matter_id: null, responsible_person_id: null })).changed, false);
      probes.push('multiple-related-sets-with-checked-null-scalar-old-request-noop');
      const detail = (await query<DocumentRecord>(documentDetailQuery(id)))[0]!;
      assert.deepEqual(
        detail.matters.map((m) => m.id),
        matters,
      );
      assert.deepEqual(
        detail.people.map((p) => p.id),
        people,
      );
      assert.equal(
        (
          await query<{ total: number }>(
            documentCountQuery(parseDocumentFilters({ archive: 'all' })),
          )
        )[0]!.total,
        before.find((x) => x.entity === 'documents').n,
      );
      for (const [key, ids, table, col] of [
        ['matter', matters, 'document_matters', 'matter_id'],
        ['person', people, 'document_responsible_people', 'person_id'],
      ] as const) {
        for (const member of ids) {
          const filters = parseDocumentFilters({ [key]: String(member), archive: 'all' }),
            expected = (
              await db.query(
                `SELECT document_id id FROM public.${table} WHERE ${col}=$1 AND NOT is_retired ORDER BY document_id`,
                [member],
              )
            ).rows.map((x) => x.id),
            count = (await query<{ total: number }>(documentCountQuery(filters)))[0]!.total;
          assert.equal(count, expected.length);
          const actual: number[] = [];
          for (let page = 1; page <= Math.ceil(count / 25); page++)
            actual.push(
              ...(await query<DocumentRecord>(documentRowsQuery(filters, page))).map((x) => x.id),
            );
          assert.equal(new Set(actual).size, actual.length);
          assert.deepEqual(
            actual.sort((a, b) => a - b),
            expected,
          );
          assert(actual.includes(id));
        }
      }
      for (const [key, term] of [
        ['matter', detail.matters[1]!.name],
        ['person', detail.people[1]!.name],
      ] as const) {
        assert(term);
        const found = await query<DocumentRecord>(
          documentRowsQuery(parseDocumentFilters({ q: term, archive: 'all' }), 1),
        );
        assert(
          found.some((x) => x.id === id),
          key + ' relationship search',
        );
      }
      const definition = documentReports.find((x) => x.descriptor.id === 'document-movement-card')!,
        parameters = parseReportInput(
          definition.descriptor,
          new URLSearchParams({ format: 'preview', document: String(id) }),
        ).parameters,
        data = await definition.query(tx, parameters);
      validateReportData(definition.descriptor, data);
      const rows = data.sections[0]!.groups.flatMap((g) => g.rows);
      assert.equal(rows.length, 1);
      const columns = reportColumns(definition.descriptor, 'documents');
      assert.deepEqual(rows[0]!.cells[columns.findIndex((x) => x.key === 'caseNumber')], {
        type: 'identifier',
        value: detail.matters.map((m) => m.name ?? t.reports.nullValue).join('\n'),
      });
      assert.deepEqual(rows[0]!.cells[columns.findIndex((x) => x.key === 'person')], {
        type: 'text',
        value: detail.people.map((p) => p.name).join('\n'),
      });
      probes.push('actual-runtime-detail-filters-search-count-pagination-and-report-agree');
      const valid = {
        operation: 'update',
        id,
        version: multi.record.version,
        submission: randomUUID(),
        values: {},
        related,
        facts: null,
      };
      assert.deepEqual(parseDocumentInput('update', valid).related, related);
      for (const bad of [
        [],
        {},
        { matterIds: [1, 1], responsiblePersonIds: [] },
        { matterIds: [null], responsiblePersonIds: [] },
      ])
        assert.throws(
          () => parseDocumentInput('update', { ...valid, related: bad }),
          DocumentMutationError,
        );
      assert.throws(
        () => parseDocumentInput('update', { ...valid, values: { matter_id: matters[0] } }),
        DocumentMutationError,
      );
      probes.push('server-input-validates-full-unique-related-sets');
      await fault('stale-version', () => save({}, related, actor, old.record.version));
      await fault('conflicting-scalar', () => save({ matter_id: matters[0] }, related));
      for (const bad of [
        [],
        {},
        { matterIds: [matters[0], matters[0]], responsiblePersonIds: [] },
        { matterIds: [null], responsiblePersonIds: [] },
        { matterIds: [], responsiblePersonIds: ['1'] },
      ])
        await fault('invalid-related-shape', () => save({}, bad));
      for (const role of ['Lawyer', 'Paralegal'])
        await fault(role + '-write-denied', () =>
          save({ notes: old.record.values.notes }, null, auth.find((x) => x.role === role)!.claims),
        );
      await fault('expired-session', () =>
        save({}, related, { ...actor, absoluteExpiresAt: Date.now() - 1000 }),
      );
      const inactive = (
        await db.query('SELECT id FROM public.people WHERE NOT is_active ORDER BY id LIMIT 1')
      ).rows[0].id;
      await fault('inactive-new-member', () =>
        save({}, { ...related, responsiblePersonIds: [inactive] }),
      );
      await db.query('SAVEPOINT archived_parent');
      const archived = matters[0],
        args = [
          actor.userId,
          actor.sessionVersion,
          actor.role,
          new Date(actor.absoluteExpiresAt).toISOString(),
        ];
      await db.query('SELECT public.audit_set_human_context($1)', [actor.userId]);
      await db.query("SELECT public.audit_set_event_context($1,$2,$3,NULL,NULL,'system')", [
        randomUUID(),
        randomUUID(),
        actor.auditSessionId,
      ]);
      const lifecycleState = (
        await db.query('SELECT public.matter_lifecycle_state($1,$2,$3,$4,$5) value', [
          ...args,
          archived,
        ])
      ).rows[0].value;
      await db.query('SELECT public.matter_lifecycle_save($1,$2,$3,$4,$5::jsonb)', [
        ...args,
        JSON.stringify({
          id: archived,
          confirmation: archived,
          version: lifecycleState.version,
          counts: lifecycleState.counts,
          action: 'archive',
          submission: randomUUID(),
        }),
      ]);
      await fault('archived-parent', () => save({}, related));
      await db.query('ROLLBACK TO SAVEPOINT archived_parent');
      await fault('direct-runtime-write', async () => {
        await db.query('SET LOCAL ROLE litigation_runtime');
        await db.query('UPDATE public.document_matters SET position=9 WHERE document_id=$1', [id]);
      });
      assert.equal(
        (
          await save(
            {},
            { matterIds: [matters[1]], responsiblePersonIds: [people[1]] },
            auth.find((x) => x.role === 'Litigation Assistant')!.claims,
          )
        ).changed,
        true,
      );
      const single = await state();
      assert.equal(single.record.values.matter_id, matters[1]);
      assert.equal(single.record.values.responsible_person_id, people[1]);
      assert.equal((await save({}, related)).changed, true);
      assert.equal(
        (
          await db.query(
            'SELECT count(*)::int n FROM public.document_matters WHERE document_id=$1',
            [id],
          )
        ).rows[0].n,
        2,
      );
      assert.equal(
        (await save({}, null, actor, undefined, 'archive', (await state()).record.facts)).changed,
        true,
      );
      assert.equal(
        (await save({}, null, actor, undefined, 'restore', (await state()).record.facts)).changed,
        true,
      );
      assert.deepEqual((await state()).record.related, related);
      assert.equal(
        (
          await db.query(
            'SELECT count(*)::int n FROM public.documents WHERE _migration.document_edit_current_valid(id) IS NOT TRUE',
          )
        ).rows[0].n,
        0,
      );
      probes.push('retire-reactivate-preserves-identities-all-history-and-lifecycle');
      await db.query('SELECT public.audit_set_human_context($1)', [actor.userId]);
      await db.query("SELECT public.audit_set_event_context($1,$2,$3,NULL,NULL,'system')", [
        randomUUID(),
        randomUUID(),
        actor.auditSessionId,
      ]);
      const createdRequest = parseDocumentInput('create', {
        operation: 'create',
        id: null,
        version: null,
        submission: randomUUID(),
        values: { description: old.record.values.description },
        related,
        facts: null,
      });
      await db.query('SET LOCAL ROLE litigation_runtime');
      const created = (
        await db.query('SELECT public.document_edit_save($1,$2,$3,$4,$5::jsonb) value', [
          actor.userId,
          actor.sessionVersion,
          actor.role,
          new Date(actor.absoluteExpiresAt).toISOString(),
          JSON.stringify(createdRequest),
        ])
      ).rows[0].value;
      const retried = (
        await db.query('SELECT public.document_edit_save($1,$2,$3,$4,$5::jsonb) value', [
          actor.userId,
          actor.sessionVersion,
          actor.role,
          new Date(actor.absoluteExpiresAt).toISOString(),
          JSON.stringify(createdRequest),
        ])
      ).rows[0].value;
      assert.deepEqual(retried, created);
      await db.query('RESET ROLE');
      await db.query('SET CONSTRAINTS ALL IMMEDIATE');
      assert.equal(
        (await db.query('SELECT _migration.document_edit_current_valid($1) valid', [created.id]))
          .rows[0].valid,
        true,
      );
      assert.deepEqual(
        (await query<DocumentRecord>(documentDetailQuery(created.id)))[0]!.matters.map((m) => m.id),
        matters,
      );
      probes.push('normal-multi-link-create-and-idempotent-native-retry');
      await db.query('ROLLBACK');
      assert.deepEqual(await capture(), before);
      writeFileSync(
        output,
        JSON.stringify(
          {
            status: 'PASS',
            started,
            completed: new Date().toISOString(),
            draft,
            probes,
            before,
            rolledBack: true,
            ownerActions: 'NOT_APPLIED',
          },
          null,
          2,
        ) + '\n',
        { flag: 'wx' },
      );
      console.log(JSON.stringify({ status: 'PASS', probes: probes.length, output }));
    } catch (e) {
      await db.query('ROLLBACK');
      assert.deepEqual(await capture(), before);
      writeFileSync(
        output,
        JSON.stringify(
          {
            status: 'FAIL',
            started,
            completed: new Date().toISOString(),
            draft,
            probes,
            message: e instanceof Error ? e.message : String(e),
            where: (e as { where?: string }).where,
            position: (e as { position?: string }).position,
            before,
            rolledBack: true,
            ownerActions: 'NOT_APPLIED',
          },
          null,
          2,
        ) + '\n',
        { flag: 'wx' },
      );
      throw e;
    }
  });
}
main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exitCode = 1;
});
