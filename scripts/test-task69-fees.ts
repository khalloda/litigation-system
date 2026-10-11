import { task69FeeCatalog } from './lib/task69-fee-checkpoint';
import type { Prisma } from '../src/generated/prisma/client';
import {
  feeLetterDetailQuery,
  feeLetterCountQuery,
  feeLetterRowsQuery,
  parseFeeLetterFilters,
  type FeeLetterRecord,
} from '../src/lib/fee-letter-query';
import { feeEngagementReport } from '../src/lib/reports/fee-engagements';
import { parseReportInput } from '../src/lib/reports/input';
import { validateReportData } from '../src/lib/reports/result';
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
import { executeTask69Fee } from './lib/task69-fee-executor';
async function main() {
  const started = new Date().toISOString(),
    directory = process.env['TASK69_APPROVED_DIRECTORY']!,
    root = process.env['TASK69_PRIVATE_ROOT']!,
    output = process.env['TASK69_EVIDENCE_OUTPUT']!,
    contract = loadTask69Contract(directory),
    descriptor = JSON.parse(readFileSync(join(root, 'fixture-descriptor.json'), 'utf8'));
  const accounts = JSON.parse(readFileSync(join(root, 'fixture-logins.json'), 'utf8')) as {
      role: string;
      claims: SessionClaims;
    }[],
    authority = accounts.find((a) => a.role === 'Administrator')!.claims;
  const sql = readFileSync(
      'prisma/migrations/20261008000000_task69_fee_provenance/migration.sql',
      'utf8',
    ),
    draft = process.argv.includes('--draft'),
    focused = process.argv.includes('--focused'),
    operation = prepareTask69Operation({
      directory,
      operationId: randomUUID(),
      cluster: descriptor.cluster,
      database: descriptor.database,
      runnerSha256: task69RunnerSourceDigest(resolve('.')),
      schemaSha256: task69Sha(sql),
    }),
    results: Row[] = [],
    probes: string[] = [];
  await withTask69Fixture(operation, async (db) => {
    const capture = async () => {
      const a = [];
      for (const table of [
        'fee_letters',
        'fee_letter_matters',
        'matter_fee_letter_references',
        'matters',
        'invoices',
        'payments',
        'invoice_allocations',
        'audit_events',
      ])
        a.push({
          table,
          ...(
            await db.query(
              `SELECT count(*)::int n,md5(string_agg(to_jsonb(r)::text,E'\\n' ORDER BY id)) digest FROM public.${table} r`,
            )
          ).rows[0],
        });
      return a;
    };
    const before = await capture(),
      originals: Record<string, Row[]> = {};
    for (const table of ['fee_letter_matters', 'matter_fee_letter_references', 'fee_letters'])
      originals[table] = (
        await db.query(`SELECT to_jsonb(r) value FROM public.${table} r ORDER BY id`)
      ).rows.map((r) => r.value);
    assert.equal(originals.fee_letter_matters!.length, 231);
    await db.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
    try {
      if (draft) await db.query(sql.replace(/^BEGIN;$/mu, '').replace(/^COMMIT;$/mu, ''));
      writeFileSync(
        output.replace('.json', '-schema.json'),
        JSON.stringify(await task69FeeCatalog(db), null, 2) + '\n',
        { flag: 'wx' },
      );
      await bindTask69Operation(db, operation, authority);
      const all = contract.stages['S7-fee-provenance'],
        ids = focused
          ? all.filter((id, i) => {
              const p = contract.byIssue.get(id)!.approvedOutcome;
              return (
                i < 2 ||
                [93, 286, 252, 70, 75, 10, 40].includes(
                  Number(p.feeId ?? (p.mapping as Row)?.fee_letter_id),
                ) ||
                (p.direction === 'REVERSE' && i < 28)
              );
            })
          : all;
      for (const id of ids) {
        const entry = contract.byIssue.get(id)!,
          r = await executeTask69Fee(db, operation, entry, authority);
        assert.deepEqual(await executeTask69Fee(db, operation, entry, authority), r);
        results.push({
          issueId: id,
          receiptId: r.receipt_id!,
          returned: r.returned_ids!,
          sourceOccurrences: r.source_occurrences!,
          deltas: (
            await db.query(
              'SELECT to_jsonb(d) value FROM _migration.task69_delta d WHERE receipt_id=$1 ORDER BY ordinal',
              [r.receipt_id],
            )
          ).rows.map((x) => x.value),
        });
      }
      for (const table of ['fee_letter_matters', 'matter_fee_letter_references'])
        assert.deepEqual(
          (
            await db.query(
              `SELECT to_jsonb(r) value FROM public.${table} r WHERE id=ANY($1::integer[]) ORDER BY id`,
              [originals[table]!.map((r) => r.id)],
            )
          ).rows.map((r) => r.value),
          originals[table],
        );
      const attrs = (r: Row) =>
        Object.fromEntries(
          Object.entries(r).filter(
            ([k]) => !['row_version', 'updated_at', 'updated_by'].includes(k),
          ),
        );
      assert.deepEqual(
        (await db.query('SELECT to_jsonb(f) value FROM public.fee_letters f ORDER BY id')).rows.map(
          (r) => attrs(r.value),
        ),
        originals.fee_letters!.map(attrs),
      );
      const added = (direction: string) =>
        results
          .filter((r) => (r.returned as Row).direction === direction)
          .reduce((n, r) => n + ((r.returned as Row).newMemberIds as unknown[]).length, 0);
      if (!focused) {
        assert.equal(ids.length, 76);
        assert.equal(added('FORWARD'), 55);
        assert.equal(added('REVERSE'), 19);
        assert.equal(
          (
            await db.query(
              'SELECT count(*)::int n FROM _migration.task69_fee_association WHERE forward_id IS NOT NULL',
            )
          ).rows[0].n,
          58,
        );
        assert.equal(
          results.filter((r) => ((r.returned as Row).newMemberIds as unknown[]).length === 0)
            .length,
          4,
        );
      }
      const runtime = async <T>(q: Prisma.Sql): Promise<T[]> => {
        await db.query('SET LOCAL ROLE litigation_runtime');
        const rows = (await db.query(q.text, [...q.values])).rows;
        await db.query('RESET ROLE');
        return rows;
      };
      for (const fee of [93, 286, 40]) {
        const shown = (await runtime<FeeLetterRecord>(feeLetterDetailQuery(fee)))[0]!;
        const expected = (
          await db.query(
            'SELECT matter_id FROM public.fee_letter_matters WHERE fee_letter_id=$1 AND NOT is_retired ORDER BY coalesce(current_order,ordinal+1),id',
            [fee],
          )
        ).rows.map((r) => r.matter_id);
        assert.deepEqual(
          shown.covered.filter((r) => !r.retired).map((r) => r.matterId),
          expected,
        );
        if (fee === 40)
          assert.deepEqual(
            [...expected].sort((a, b) => a - b),
            [1837, 1855, 1856, 1857, 1858, 1860, 1861, 1882, 1883, 1884, 1992, 1993, 1994].sort(
              (a, b) => a - b,
            ),
          );
      }
      for (const target of [1765, 2347, 1882]) {
        const filters = parseFeeLetterFilters({ covered: String(target), archive: 'all' }),
          total = (await runtime<{ total: number }>(feeLetterCountQuery(filters)))[0]!.total,
          shown: number[] = [];
        for (let page = 1; page <= Math.ceil(total / 25); page++)
          shown.push(
            ...(await runtime<FeeLetterRecord>(feeLetterRowsQuery(filters, page))).map((r) => r.id),
          );
        assert.equal(new Set(shown).size, total);
        assert.deepEqual(
          shown,
          (
            await db.query(
              'SELECT DISTINCT fee_letter_id id FROM public.fee_letter_matters WHERE matter_id=$1 AND NOT is_retired ORDER BY fee_letter_id DESC',
              [target],
            )
          ).rows.map((r) => r.id),
        );
      }
      const tx = {
        $queryRaw: <T>(q: Prisma.Sql) => runtime(q) as Promise<T>,
      } as unknown as Prisma.TransactionClient;
      for (const [fee, matter] of [
        [93, 1765],
        [286, 2347],
      ]) {
        const p = parseReportInput(
            feeEngagementReport.descriptor,
            new URLSearchParams({ matter: String(matter), format: 'preview' }),
          ).parameters,
          data = await feeEngagementReport.query(tx, p);
        validateReportData(feeEngagementReport.descriptor, data);
        const rows = data.sections.flatMap((s) => s.groups.flatMap((g) => g.rows));
        assert.equal(new Set(rows.map((r) => r.id)).size, rows.length);
        const row = rows.find((r) => r.id === 'fee-letter:' + fee);
        assert(row);
        const pApproved = ids
          .map((id) => contract.byIssue.get(id)!.approvedOutcome)
          .find((p) => p.feeId === fee)!;
        const text = row.cells.map((c) => ('value' in c ? String(c.value) : '')).join('\n');
        for (const key of ['originalWork', 'coveredProceeding', 'approvedAction', 'excludedStages'])
          assert(text.includes(String(pApproved[key])), key);
      }
      probes.push(
        'actual-fee-detail-exact13-and-distinct-filter-pagination',
        'actual-preview-export-data-retains-both-exact-scopes',
      );
      const scopes = (
        await db.query(
          'SELECT to_jsonb(s) value,l.fee_letter_id,l.matter_id FROM public.fee_letter_matter_scopes s JOIN public.fee_letter_matters l USING(id) ORDER BY l.fee_letter_id',
        )
      ).rows;
      assert.deepEqual(
        scopes.map((s) => ({
          fee: s.fee_letter_id,
          matter: s.matter_id,
          proceeding: s.value.covered_proceeding,
        })),
        [
          { fee: 93, matter: 1765, proceeding: '1332/2019' },
          { fee: 286, matter: 2347, proceeding: '4324/2014' },
        ],
      );
      for (const s of scopes) {
        const p = ids
          .map((id) => contract.byIssue.get(id)!.approvedOutcome)
          .find((p) => p.feeId === s.fee_letter_id)!;
        assert.equal(s.value.original_work, p.originalWork);
        assert.equal(s.value.scope_statement, p.approvedAction);
        assert.equal(s.value.excluded_stages, p.excludedStages);
      }
      probes.push(
        'all-original-forward-and-reverse-objects-byte-identical',
        'financial-terms-statuses-and-original-fee-attributes-preserved',
        'exact-bounded-original-work-scopes',
      );
      const fault = async (name: string, pattern: RegExp, work: () => Promise<unknown>) => {
        await db.query('SAVEPOINT fee_fault');
        let refused = false;
        try {
          await work();
        } catch (e) {
          assert.match(e instanceof Error ? e.message : String(e), pattern);
          refused = true;
        }
        await db.query('ROLLBACK TO SAVEPOINT fee_fault');
        assert(refused, name);
        probes.push(name);
      };
      const example = contract.byIssue.get(ids[0]!)!;
      await fault('runtime-restoration-refused', /permission denied/u, async () => {
        await db.query('SET LOCAL ROLE litigation_runtime');
        await executeTask69Fee(db, operation, example, authority);
      });
      await fault('expired-retry-refused', /Current authorized matter session required/u, () =>
        executeTask69Fee(db, operation, example, {
          ...authority,
          absoluteExpiresAt: Date.now() - 1,
        }),
      );
      await fault('lawyer-restoration-refused', /Current authorized matter session required/u, () =>
        executeTask69Fee(db, operation, example, accounts.find((a) => a.role === 'Lawyer')!.claims),
      );
      const changed = structuredClone(example);
      changed.approvedOutcome.synchronizeOtherDirection = true;
      await fault(
        'changed-synchronization-intent-refused',
        /Source, authority, payload or complete guard closure changed/u,
        () => executeTask69Fee(db, operation, changed, authority),
      );
      for (const scope of scopes) {
        await db.query('SAVEPOINT native_scope');
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
          id = scope.fee_letter_id,
          entry = ids
            .map((id) => contract.byIssue.get(id)!)
            .find((e) => e.approvedOutcome.feeId === id)!;
        await db.query('SET LOCAL ROLE litigation_runtime');
        let state = (
          await db.query('SELECT public.fee_letter_edit_state($1,$2,$3,$4,$5) value', [...args, id])
        ).rows[0].value;
        assert.deepEqual(
          state.record.covered.find((m: { id: number }) => m.id === scope.value.id).scope,
          Object.fromEntries(Object.entries(scope.value).filter(([k]) => k !== 'id')),
        );
        const request = {
          operation: 'covered-retire',
          id,
          version: state.record.version,
          submission: randomUUID(),
          values: {},
          related: { membershipId: scope.value.id, matterId: null },
          facts: null,
        };
        const retired = (
          await db.query('SELECT public.fee_letter_edit_save($1,$2,$3,$4,$5::jsonb) value', [
            ...args,
            JSON.stringify(request),
          ])
        ).rows[0].value;
        assert.equal(retired.changed, true);
        await db.query('RESET ROLE');
        await fault(
          'bounded-' + id + '-cannot-be-readded-unqualified',
          /Invalid or duplicate covered matter/u,
          async () => {
            await db.query('SET LOCAL ROLE litigation_runtime');
            await db.query('SELECT public.fee_letter_edit_save($1,$2,$3,$4,$5::jsonb)', [
              ...args,
              JSON.stringify({
                ...request,
                operation: 'covered-add',
                version: retired.version,
                submission: randomUUID(),
                related: { membershipId: null, matterId: scope.matter_id },
              }),
            ]);
          },
        );
        await fault('bounded-' + id + '-later-edit-retry-refused', /postimage was edited/u, () =>
          executeTask69Fee(db, operation, entry, authority),
        );
        await db.query('SET LOCAL ROLE litigation_runtime');
        const restored = (
          await db.query('SELECT public.fee_letter_edit_save($1,$2,$3,$4,$5::jsonb) value', [
            ...args,
            JSON.stringify({
              ...request,
              operation: 'covered-restore',
              version: retired.version,
              submission: randomUUID(),
            }),
          ])
        ).rows[0].value;
        assert.equal(restored.changed, true);
        state = (
          await db.query('SELECT public.fee_letter_edit_state($1,$2,$3,$4,$5) value', [...args, id])
        ).rows[0].value;
        assert.equal(
          state.record.covered.find((m: { id: number }) => m.id === scope.value.id).scope
            .scope_statement,
          scope.value.scope_statement,
        );
        await db.query('RESET ROLE');
        assert.equal(
          (await db.query('SELECT _migration.fee_letter_edit_current_valid($1) valid', [id]))
            .rows[0].valid,
          true,
        );
        await db.query('ROLLBACK TO SAVEPOINT native_scope');
        probes.push('bounded-' + id + '-native-retire-restore-keeps-scope');
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
            newForward: added('FORWARD'),
            newReverse: added('REVERSE'),
            scopes,
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
