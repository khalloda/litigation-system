import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { SessionClaims } from '../src/lib/auth/session';
import { loadTask69Contract, type Row } from './lib/task69-contract';
import {
  prepareTask69Operation,
  withTask69Fixture,
  bindTask69Operation,
  task69RunnerSourceDigest,
  task69SchemaSourceDigest,
} from './lib/task69-runner';
import { executeTask69Poa } from './lib/task69-poa-executor';
import { poaDetailQuery, poaCountQuery, poaRowsQuery, parsePoaFilters } from '../src/lib/poa-query';
import { task69PoaCatalog } from './lib/task69-poa-checkpoint';
async function main() {
  const started = new Date().toISOString(),
    directory = process.env['TASK69_APPROVED_DIRECTORY']!,
    privateRoot = process.env['TASK69_PRIVATE_ROOT']!,
    output = process.env['TASK69_EVIDENCE_OUTPUT']!;
  const contract = loadTask69Contract(directory),
    descriptor = JSON.parse(readFileSync(join(privateRoot, 'fixture-descriptor.json'), 'utf8'));
  const auth = JSON.parse(readFileSync(join(privateRoot, 'fixture-logins.json'), 'utf8')) as {
      role: string;
      claims: SessionClaims;
    }[],
    authority = auth.find((a) => a.role === 'Administrator')!.claims;
  const sql = readFileSync(
      'prisma/migrations/20261007210000_task69_poa_restoration/migration.sql',
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
    schemaSha256: task69SchemaSourceDigest(process.cwd()),
  });
  const results: Row[] = [],
    probes: string[] = [];
  await withTask69Fixture(operation, async (db) => {
    const capture = async () => {
      const out = [];
      for (const table of [
        'powers_of_attorney',
        'power_of_attorney_lawyers',
        'people',
        'person_name_alias',
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
    const before = await capture(),
      originals = (
        await db.query(
          'SELECT to_jsonb(l) value FROM public.power_of_attorney_lawyers l ORDER BY id',
        )
      ).rows.map((r) => r.value);
    assert.equal(originals.length, 87);
    try {
      await db.query(
        draft
          ? sql.replace('BEGIN;', 'BEGIN ISOLATION LEVEL SERIALIZABLE;').replace(/COMMIT;\s*$/u, '')
          : 'BEGIN ISOLATION LEVEL SERIALIZABLE',
      );
      if (draft)
        writeFileSync(
          output.replace(/\.json$/u, '-schema.json'),
          JSON.stringify(await task69PoaCatalog(db), null, 2) + '\n',
          { flag: 'wx' },
        );
      await bindTask69Operation(db, operation, authority);
      const all = contract.stages['S5-poa-membership'],
        ids = focused
          ? all.filter(
              (id, i) =>
                i < 2 ||
                i === all.length - 1 ||
                (contract.byIssue.get(id)!.approvedOutcome.preservedExistingLinks as Row[]).length >
                  0,
            )
          : all;
      assert.equal(ids.length, focused ? 11 : 714);
      const runtimeQuery = async (q: { text: string; values: readonly unknown[] }) => {
        await db.query('SET LOCAL ROLE litigation_runtime');
        const rows = (await db.query(q.text, [...q.values])).rows;
        await db.query('RESET ROLE');
        return rows;
      };
      for (const [i, id] of ids.entries()) {
        const entry = contract.byIssue.get(id)!,
          intended = entry.approvedOutcome;
        const r = await executeTask69Poa(db, operation, entry, authority);
        assert.deepEqual(await executeTask69Poa(db, operation, entry, authority), r);
        const shown = (await runtimeQuery(poaDetailQuery(Number(intended.poaId))))[0];
        assert.deepEqual(
          shown.lawyers.map((l: { personId: number; order: number }) => ({
            personId: l.personId,
            displayOrder: l.order,
          })),
          (intended.members as Row[]).map((m) => ({
            personId: m.personId,
            displayOrder: m.displayOrder,
          })),
        );
        const actual = (
          await db.query(
            'SELECT to_jsonb(l) value FROM public.power_of_attorney_lawyers l WHERE power_of_attorney_id=$1 ORDER BY id',
            [intended.poaId],
          )
        ).rows.map((r) => r.value);
        results.push({
          issueId: id,
          receiptId: r.receipt_id!,
          returned: r.returned_ids!,
          sourceOccurrences: r.source_occurrences!,
          actual,
        });
        if ((i + 1) % 100 === 0) console.log('Proved S5 ' + (i + 1) + '/714');
      }
      assert.deepEqual(
        (
          await db.query(
            'SELECT to_jsonb(l) value FROM public.power_of_attorney_lawyers l WHERE id=ANY($1::integer[]) ORDER BY id',
            [originals.map((r) => r.id)],
          )
        ).rows.map((r) => r.value),
        originals,
      );
      const inserted = results.reduce(
          (n, r) => n + ((r.returned as Row).newMemberIds as unknown[]).length,
          0,
        ),
        members = results.reduce(
          (n, r) => n + ((r.returned as Row).members as unknown[]).length,
          0,
        );
      if (!focused) {
        assert.equal(inserted, 5627);
        assert.equal(members, 5675);
        assert.equal(
          (await db.query('SELECT count(*)::int n FROM public.power_of_attorney_lawyers')).rows[0]
            .n,
          5714,
        );
      }
      for (const person of [8, 35, 69, 72]) {
        const f = parsePoaFilters({ lawyer: String(person), archive: 'all' }),
          total = (await runtimeQuery(poaCountQuery(f)))[0].total;
        const expected = (
            await db.query(
              'SELECT DISTINCT power_of_attorney_id id FROM public.power_of_attorney_lawyers WHERE person_id=$1 AND NOT is_retired ORDER BY id DESC',
              [person],
            )
          ).rows.map((r) => r.id),
          shown: number[] = [];
        assert.equal(total, expected.length);
        for (let page = 1; page <= Math.ceil(total / 25); page++)
          shown.push(...(await runtimeQuery(poaRowsQuery(f, page))).map((r) => r.id));
        assert.deepEqual(shown, expected);
        assert.equal(new Set(shown).size, total);
      }
      probes.push(
        'all-original-links-byte-identical',
        'complete-approved-display-order',
        'runtime-distinct-filtered-pages',
      );
      const fault = async (name: string, pattern: RegExp, work: () => Promise<unknown>) => {
        await db.query('SAVEPOINT poa_fault');
        let refused = false;
        try {
          await work();
        } catch (e) {
          assert.match(e instanceof Error ? e.message : String(e), pattern);
          refused = true;
        }
        await db.query('ROLLBACK TO SAVEPOINT poa_fault');
        assert(refused, name);
        probes.push(name);
      };
      const example = contract.byIssue.get(ids[0]!)!;
      await fault('runtime-restoration-refused', /permission denied/u, async () => {
        await db.query('SET LOCAL ROLE litigation_runtime');
        await executeTask69Poa(db, operation, example, authority);
      });
      await fault(
        'lawyer-restoration-retry-refused',
        /Current authorized matter session required/u,
        () =>
          executeTask69Poa(db, operation, example, auth.find((a) => a.role === 'Lawyer')!.claims),
      );
      await fault(
        'expired-restoration-retry-refused',
        /Current authorized matter session required/u,
        () =>
          executeTask69Poa(db, operation, example, {
            ...authority,
            absoluteExpiresAt: Date.now() - 1,
          }),
      );
      const changed = structuredClone(example);
      (changed.approvedOutcome.members as Row[])[0]!.personId = 999999;
      await fault(
        'changed-approved-members-refused',
        /Source, authority, payload or complete guard closure changed/u,
        () => executeTask69Poa(db, operation, changed, authority),
      );
      const historical = ids
        .map((id) => contract.byIssue.get(id)!)
        .find((e) => e.approvedOutcome.poaId === 100)!;
      assert(historical, 'Empty-client POA100 disposition required');
      await fault(
        'later-native-edit-refuses-zero-delta-receipt',
        /changed|differs|stale/iu,
        async () => {
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
          ];
          await db.query('SET LOCAL ROLE litigation_runtime');
          const state = (
            await db.query('SELECT public.poa_edit_state($1,$2,$3,$4,$5) value', [...args, 100])
          ).rows[0].value;
          await db.query('SELECT public.poa_edit_save($1,$2,$3,$4,$5::jsonb)', [
            ...args,
            JSON.stringify({
              operation: 'update',
              id: 100,
              version: state.record.version,
              submission: randomUUID(),
              values: { notes: 'TASK69 ISOLATED ZERO-DELTA RETRY PROBE' },
              lawyers: state.lawyers
                .filter((l: { retired: boolean }) => !l.retired)
                .map((l: { personId: number }) => l.personId),
              facts: null,
            }),
          ]);
          await db.query('RESET ROLE');
          await executeTask69Poa(db, operation, historical, authority);
        },
      );
      for (const account of auth) {
        await db.query('SAVEPOINT native_poa');
        await db.query(
          "SELECT set_config('litigation.task69_operation','',true),set_config('litigation.task69_issue','',true)",
        );
        const a = account.claims,
          args = [a.userId, a.sessionVersion, a.role, new Date(a.absoluteExpiresAt).toISOString()];
        await db.query('SELECT public.audit_set_human_context($1)', [a.userId]);
        await db.query("SELECT public.audit_set_event_context($1,$2,$3,NULL,NULL,'system')", [
          randomUUID(),
          randomUUID(),
          a.auditSessionId,
        ]);
        const id = example.approvedOutcome.poaId;
        if (!['Administrator', 'Litigation Assistant'].includes(account.role)) {
          await fault(
            account.role + '-native-write-refused',
            /Current authorized power of attorney session required/u,
            async () => {
              await db.query('SET LOCAL ROLE litigation_runtime');
              await db.query('SELECT public.poa_edit_state($1,$2,$3,$4,$5)', [...args, id]);
            },
          );
        } else {
          await db.query('SET LOCAL ROLE litigation_runtime');
          const s = (
            await db.query('SELECT public.poa_edit_state($1,$2,$3,$4,$5) value', [...args, id])
          ).rows[0].value;
          const request = {
            operation: 'update',
            id,
            version: s.record.version,
            submission: randomUUID(),
            values: {},
            lawyers: s.lawyers
              .filter((l: { retired: boolean }) => !l.retired)
              .map((l: { personId: number }) => l.personId),
            facts: null,
          };
          assert.equal(
            (
              await db.query('SELECT public.poa_edit_save($1,$2,$3,$4,$5::jsonb) value', [
                ...args,
                JSON.stringify(request),
              ])
            ).rows[0].value.changed,
            false,
          );
          assert.equal(
            (
              await db.query('SELECT public.poa_edit_save($1,$2,$3,$4,$5::jsonb) value', [
                ...args,
                JSON.stringify({
                  ...request,
                  submission: randomUUID(),
                  values: {
                    notes:
                      String(s.record.values.notes ?? '') +
                      '\nTask69 isolated POA native continuity',
                  },
                }),
              ])
            ).rows[0].value.changed,
            true,
          );
          await db.query('RESET ROLE');
          assert.equal(
            (await db.query('SELECT _migration.poa_edit_current_valid($1) valid', [id])).rows[0]
              .valid,
            true,
          );
          await fault(
            account.role + '-native-edit-refuses-restoration-retry',
            /postimage was edited/u,
            () => executeTask69Poa(db, operation, example, authority),
          );
          probes.push(account.role + '-native-noop-and-edit-history');
          if (focused) {
            await db.query('SET LOCAL ROLE litigation_runtime');
            const latest = (
              await db.query('SELECT public.poa_edit_state($1,$2,$3,$4,$5) value', [...args, id])
            ).rows[0].value;
            const inactive = latest.people.find(
              (p: { id: number; active: boolean }) =>
                !p.active &&
                latest.lawyers.some(
                  (l: { personId: number; retired: boolean }) => l.personId === p.id && !l.retired,
                ),
            );
            assert(inactive, 'Focused source retains an inactive historical person');
            const remove = {
              ...request,
              version: latest.record.version,
              submission: randomUUID(),
              lawyers: request.lawyers.filter((p: number) => p !== inactive.id),
            };
            const retired = (
              await db.query('SELECT public.poa_edit_save($1,$2,$3,$4,$5::jsonb) value', [
                ...args,
                JSON.stringify(remove),
              ])
            ).rows[0].value;
            assert.equal(retired.changed, true);
            await db.query('RESET ROLE');
            assert.equal(
              (await db.query('SELECT _migration.poa_edit_current_valid($1) valid', [id])).rows[0]
                .valid,
              true,
            );
            const retained = (
              await db.query(
                'SELECT is_retired FROM public.power_of_attorney_lawyers WHERE power_of_attorney_id=$1 AND person_id=$2',
                [id, inactive.id],
              )
            ).rows;
            assert.deepEqual(retained, [{ is_retired: true }]);
            await fault(
              account.role + '-inactive-native-reassignment-refused',
              /Active existing person required for new selection/u,
              async () => {
                await db.query('SET LOCAL ROLE litigation_runtime');
                await db.query('SELECT public.poa_edit_save($1,$2,$3,$4,$5::jsonb)', [
                  ...args,
                  JSON.stringify({
                    ...request,
                    version: retired.version,
                    submission: randomUUID(),
                  }),
                ]);
              },
            );
            probes.push(account.role + '-restored-membership-native-retirement-retains-source');
          }
        }
        await db.query('ROLLBACK TO SAVEPOINT native_poa');
      }
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
            schemaSha256: task69SchemaSourceDigest(process.cwd()),
            results,
            probes,
            inserted,
            members,
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
        JSON.stringify({
          status: 'PASS',
          stage: 'S5',
          issues: results.length,
          inserted,
          members,
          probes: probes.length,
          output,
        }),
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
