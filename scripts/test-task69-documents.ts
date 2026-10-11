import { task69DocumentRestorationCatalog } from './lib/task69-document-restoration-checkpoint';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { SessionClaims } from '../src/lib/auth/session';
import { loadTask69Contract, task69Sha, type Row } from './lib/task69-contract';
import {
  prepareTask69Operation,
  withTask69Fixture,
  bindTask69Operation,
  task69RunnerSourceDigest,
} from './lib/task69-runner';
import { executeTask69Document } from './lib/task69-document-executor';
import {
  documentDetailQuery,
  documentCountQuery,
  documentRowsQuery,
  parseDocumentFilters,
} from '../src/lib/document-query';
async function main() {
  const started = new Date().toISOString(),
    directory = process.env['TASK69_APPROVED_DIRECTORY']!,
    root = process.env['TASK69_PRIVATE_ROOT']!,
    output = process.env['TASK69_EVIDENCE_OUTPUT']!;
  const contract = loadTask69Contract(directory),
    descriptor = JSON.parse(readFileSync(join(root, 'fixture-descriptor.json'), 'utf8'));
  const accounts = JSON.parse(readFileSync(join(root, 'fixture-logins.json'), 'utf8')) as {
      role: string;
      claims: SessionClaims;
    }[],
    authority = accounts.find((a) => a.role === 'Administrator')!.claims;
  const sql = readFileSync(
      'prisma/migrations/20261007230000_task69_document_restoration/migration.sql',
      'utf8',
    ),
    draft = process.argv.includes('--draft'),
    focused = process.argv.includes('--focused');
  const operation = prepareTask69Operation({
    directory,
    operationId: randomUUID(),
    cluster: descriptor.cluster,
    database: descriptor.database,
    runnerSha256: task69RunnerSourceDigest(resolve('.')),
    schemaSha256: task69Sha(sql),
  });
  const results: Row[] = [],
    probes: string[] = [];
  await withTask69Fixture(operation, async (db) => {
    const capture = async () => {
      const out = [];
      for (const table of [
        'documents',
        'document_matters',
        'document_responsible_people',
        'people',
        'matters',
        'audit_events',
      ])
        out.push({
          table,
          ...(
            await db.query(
              `SELECT count(*)::int n,md5(string_agg(to_jsonb(r)::text,E'\\n' ORDER BY id)) digest FROM public.${table} r`,
            )
          ).rows[0],
        });
      return out;
    };
    const before = await capture();
    await db.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
    try {
      if (draft) await db.query(sql.replace(/^BEGIN;$/mu, '').replace(/^COMMIT;$/mu, ''));
      writeFileSync(
        output.replace('.json', '-schema.json'),
        JSON.stringify(await task69DocumentRestorationCatalog(db), null, 2) + '\n',
        { flag: 'wx' },
      );
      await bindTask69Operation(db, operation, authority);
      const all = contract.stages['S6-documents'],
        ids = focused
          ? all.filter(
              (id, i) =>
                i < 2 ||
                [109, 173, 180, 185, 342, 390].includes(
                  Number(contract.byIssue.get(id)!.approvedOutcome.documentId),
                ),
            )
          : all;
      const runtime = async (q: { text: string; values: readonly unknown[] }) => {
        await db.query('SET LOCAL ROLE litigation_runtime');
        const r = (await db.query(q.text, [...q.values])).rows;
        await db.query('RESET ROLE');
        return r;
      };
      const originals = (
        await db.query('SELECT to_jsonb(d) value FROM public.documents d ORDER BY id')
      ).rows.map((r) => r.value as Row);
      for (const [i, id] of ids.entries()) {
        const entry = contract.byIssue.get(id)!,
          p = entry.approvedOutcome,
          r = await executeTask69Document(db, operation, entry, authority);
        assert.deepEqual(await executeTask69Document(db, operation, entry, authority), r);
        const shown = (await runtime(documentDetailQuery(Number(p.documentId))))[0];
        if (p.responsiblePeople)
          assert.deepEqual(
            shown.people.map((m: { id: number }) => m.id),
            (p.responsiblePeople as Row[]).map((m) => m.personId),
          );
        else
          assert.deepEqual(
            shown.matters.map((m: { id: number }) => m.id),
            p.matterIds,
          );
        assert.equal(
          (
            await db.query('SELECT _migration.document_edit_current_valid($1) valid', [
              p.documentId,
            ])
          ).rows[0].valid,
          true,
        );
        results.push({
          issueId: id,
          receiptId: r.receipt_id!,
          returned: r.returned_ids!,
          sourceOccurrences: r.source_occurrences!,
          actual: (
            await db.query('SELECT _migration.document_edit_aggregate($1) value', [p.documentId])
          ).rows[0].value,
        });
        if ((i + 1) % 50 === 0) console.log('Proved S6 ' + (i + 1) + '/' + ids.length);
      }
      // All original attributes, including NULLs and exact source strings, stay
      // unchanged; only compatibility IDs and truthful version metadata may differ.
      const afterRows = (
        await db.query('SELECT to_jsonb(d) value FROM public.documents d ORDER BY id')
      ).rows.map((r) => r.value as Row);
      const attrs = (r: Row) =>
        Object.fromEntries(
          Object.entries(r).filter(
            ([k]) =>
              ![
                'matter_id',
                'responsible_person_id',
                'row_version',
                'updated_at',
                'updated_by',
              ].includes(k),
          ),
        );
      assert.deepEqual(afterRows.map(attrs), originals.map(attrs));
      for (const [filter, table, col, target] of [
        ['matter', 'document_matters', 'matter_id', 2743],
        ['matter', 'document_matters', 'matter_id', 3170],
        ['person', 'document_responsible_people', 'person_id', 4],
      ] as const) {
        const f = parseDocumentFilters({ [filter]: String(target), archive: 'all' }),
          expected = (
            await db.query(
              `SELECT DISTINCT document_id id FROM public.${table} WHERE ${col}=$1 AND NOT is_retired ORDER BY document_id DESC`,
              [target],
            )
          ).rows.map((r) => r.id),
          total = (await runtime(documentCountQuery(f)))[0].total,
          shown: number[] = [];
        assert.equal(total, expected.length);
        for (let page = 1; page <= Math.ceil(total / 25); page++)
          shown.push(...(await runtime(documentRowsQuery(f, page))).map((r) => r.id));
        assert.deepEqual(shown, expected);
        assert.equal(new Set(shown).size, total);
      }
      probes.push(
        'all-original-document-attributes-preserved',
        'exact-ordered-runtime-memberships',
        'distinct-filter-before-pagination',
      );
      const n = (kind: string) =>
          results
            .filter((r) => (r.returned as Row).kind === kind)
            .reduce((v, r) => v + ((r.returned as Row).newMemberIds as unknown[]).length, 0),
        noWrite = results.filter(
          (r) => ((r.returned as Row).newMemberIds as unknown[]).length === 0,
        ).length;
      if (!focused) {
        assert.equal(ids.length, 291);
        assert.equal(n('people'), 91);
        assert.equal(n('matters'), 196);
        assert.equal(noWrite, 44);
      }
      const fault = async (name: string, pattern: RegExp, work: () => Promise<unknown>) => {
        await db.query('SAVEPOINT document_fault');
        let refused = false;
        try {
          await work();
        } catch (e) {
          assert.match(e instanceof Error ? e.message : String(e), pattern);
          refused = true;
        }
        await db.query('ROLLBACK TO SAVEPOINT document_fault');
        assert(refused, name);
        probes.push(name);
      };
      const example = contract.byIssue.get(ids[0]!)!;
      await fault('runtime-restoration-refused', /permission denied/u, async () => {
        await db.query('SET LOCAL ROLE litigation_runtime');
        await executeTask69Document(db, operation, example, authority);
      });
      await fault(
        'unusable-session-retry-refused',
        /Current authorized matter session required/u,
        () =>
          executeTask69Document(db, operation, example, {
            ...authority,
            absoluteExpiresAt: Date.now() - 1,
          }),
      );
      await fault(
        'lawyer-restoration-retry-refused',
        /Current authorized matter session required/u,
        () =>
          executeTask69Document(
            db,
            operation,
            example,
            accounts.find((a) => a.role === 'Lawyer')!.claims,
          ),
      );
      const changed = structuredClone(example);
      changed.approvedOutcome.documentId = 999999;
      await fault(
        'changed-approved-identity-refused',
        /Source, authority, payload or complete guard closure changed/u,
        () => executeTask69Document(db, operation, changed, authority),
      );
      for (const disposition of ['APPROVED_REPAIR', 'APPROVED_HISTORICAL_ONLY']) {
        const entry = ids
          .map((id) => contract.byIssue.get(id)!)
          .find((e) => e.disposition === disposition);
        if (!entry) continue;
        await db.query('SAVEPOINT native_edit');
        await db.query(
          "SELECT set_config('litigation.task69_operation','',true),set_config('litigation.task69_issue','',true)",
        );
        await db.query('SELECT public.audit_set_human_context($1)', [authority.userId]);
        await db.query("SELECT public.audit_set_event_context($1,$2,$3,NULL,NULL,'system')", [
          randomUUID(),
          randomUUID(),
          authority.auditSessionId,
        ]);
        const args = [
            authority.userId,
            authority.sessionVersion,
            authority.role,
            new Date(authority.absoluteExpiresAt).toISOString(),
          ],
          id = entry.approvedOutcome.documentId;
        await db.query('SET LOCAL ROLE litigation_runtime');
        const state = (
          await db.query('SELECT public.document_edit_state($1,$2,$3,$4,$5) value', [...args, id])
        ).rows[0].value;
        const request = {
          operation: 'update',
          id,
          version: state.record.version,
          submission: randomUUID(),
          values: {
            notes:
              String(state.record.values.notes ?? '') +
              '\nTask69 isolated document native continuity',
          },
          related: null,
          facts: null,
        };
        const saved = (
          await db.query('SELECT public.document_edit_save($1,$2,$3,$4,$5::jsonb) value', [
            ...args,
            JSON.stringify(request),
          ])
        ).rows[0].value;
        assert.equal(saved.changed, true);
        await db.query('RESET ROLE');
        assert.equal(
          (await db.query('SELECT _migration.document_edit_current_valid($1) valid', [id])).rows[0]
            .valid,
          true,
        );
        await fault(
          disposition + '-later-native-edit-retry-refused',
          /postimage was edited|stale complete row/u,
          () => executeTask69Document(db, operation, entry, authority),
        );
        await db.query('ROLLBACK TO SAVEPOINT native_edit');
      }
      assert.equal(
        (await db.query('SELECT _migration.tasks46_47_submission_correspondence_valid() valid'))
          .rows[0].valid,
        true,
      );
      await db.query('SET CONSTRAINTS ALL IMMEDIATE');
      await db.query('ROLLBACK');
      const after = await capture();
      assert.deepEqual(after, before);
      writeFileSync(
        output,
        JSON.stringify(
          {
            status: 'PASS',
            started,
            completed: new Date().toISOString(),
            draft,
            focused,
            operationId: operation.operationId,
            runnerSha256: operation.runnerSha256,
            schemaSha256: task69Sha(sql),
            results,
            probes,
            responsibilityLinks: n('people'),
            matterLinks: n('matters'),
            noWrite,
            before,
            after,
            rolledBack: true,
            ownerActions: 'NOT_APPLIED',
          },
          null,
          2,
        ) + '\n',
        { flag: 'wx' },
      );
      console.log(
        JSON.stringify({ status: 'PASS', issues: ids.length, probes: probes.length, output }),
      );
    } catch (e) {
      await db.query('ROLLBACK');
      const after = await capture();
      assert.deepEqual(after, before);
      writeFileSync(
        output,
        JSON.stringify(
          {
            status: 'FAIL',
            started,
            completed: new Date().toISOString(),
            draft,
            focused,
            results,
            probes,
            message: e instanceof Error ? e.message : String(e),
            where: (e as { where?: string }).where,
            position: (e as { position?: string }).position,
            before,
            after,
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
