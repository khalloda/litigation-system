import 'dotenv/config';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import type { Session } from 'next-auth';
import type { PrismaClient } from '../src/generated/prisma/client';
import { createDatabaseClient } from '../src/lib/db';
import { AuthorizationError } from '../src/lib/auth/authorization-core';
import {
  readAdminWorks,
  readAdminWork,
  parseAdminFilters,
  parseAdminDetailParams,
  adminListHref,
  adminDetailHref,
  AdminFilterError,
  adminRowsQuery,
  adminCountQuery,
  adminDetailQuery,
  adminStepsQuery,
} from '../src/lib/admin-work-query';
import { withApprovedMigrationClient } from './lib/migration-principal';
import {
  withIsolatedPostgres,
  assertIsolatedTestCluster,
  type IsolatedPostgres,
} from './lib/isolated-postgres-fixture';
import { staffReadOnlyState } from './lib/staff-read-only-state';
import { lifecycleSessions } from './lib/matter-lifecycle-proof';
import { prepareHearingLifecycleActors } from './lib/hearing-lifecycle-actors';
import { setHearingParentArchive } from './test-hearing-read-only';
import { setMatterClientArchive } from './test-matter-read-only';
import { proveAdminWorkEdges } from './lib/admin-work-edge-proof';

const digest = (x: unknown) => createHash('sha256').update(JSON.stringify(x)).digest('hex');
async function prove(fixture: IsolatedPostgres, output: string) {
  const runtime = createDatabaseClient(fixture.runtimeUrl);
  const inspect = <T>(work: Parameters<typeof withApprovedMigrationClient<T>>[0]) =>
    withApprovedMigrationClient(work, {
      databaseUrl: fixture.migrationUrl,
      clientConfig: { options: '-c default_transaction_read_only=on' },
    });
  const evidence: unknown[] = [];
  const pass = (name: string, details: unknown = {}) => {
    evidence.push({ name, details });
    writeFileSync(join(output, 'service-results.json'), JSON.stringify(evidence, null, 2));
    console.log('PASS ' + name);
  };
  try {
    await prepareHearingLifecycleActors(fixture, runtime);
    const sessions = await lifecycleSessions(runtime),
      viewer = sessions.find((s) => s.user.role === 'Lawyer')!;
    let calls = 0;
    const never = {
      $transaction() {
        calls++;
        throw new Error('unexpected work');
      },
    } as unknown as PrismaClient;
    for (const session of [
      null,
      { ...viewer, expires: new Date(0).toISOString() },
      { ...viewer, user: { ...viewer.user, role: 'unknown' } },
      { ...viewer, user: { ...viewer.user, mustChangePassword: true } },
    ]) {
      await assert.rejects(
        readAdminWorks(session as Session | null, {}, never),
        AuthorizationError,
      );
      await assert.rejects(
        readAdminWork(session as Session | null, '1', '1', never),
        AuthorizationError,
      );
    }
    assert.equal(calls, 0);
    for (const user of [
      { ...viewer.user, sessionVersion: viewer.user.sessionVersion + 100 },
      { ...viewer.user, id: '2147483647' },
      { ...viewer.user, personId: 2147483647 },
      { ...viewer.user, role: 'Administrator' },
    ]) {
      await assert.rejects(
        readAdminWorks({ ...viewer, user } as Session, {}, runtime),
        AuthorizationError,
      );
      await assert.rejects(
        readAdminWork({ ...viewer, user } as Session, '1', '1', runtime),
        AuthorizationError,
      );
    }
    for (const p of [
      { q: ['a', 'b'] },
      { q: 'x'.repeat(161) },
      { q: '\u0000' },
      { page: '0' },
      { page: '-1' },
      { page: '1e3' },
      { page: '2147483648' },
      { matter: 'no' },
      { client: ['1', '2'] },
      { status: 'جارية' },
      { fromMatter: 'https://example.com' },
      { unknown: 'x' },
    ])
      assert.throws(() => parseAdminFilters(p), AdminFilterError);
    for (const p of [{ stepPage: '0' }, { stepPage: ['1', '2'] }])
      assert.throws(() => parseAdminDetailParams(p), AdminFilterError);
    const f = parseAdminFilters({
      q: 'احمد',
      page: '3',
      person: 'missing',
      status: 'value:جارية',
      fromMatter: '/matters/1?page=2',
    });
    assert.deepEqual(
      parseAdminFilters(
        Object.fromEntries(new URL(adminListHref(f), 'http://localhost').searchParams),
      ),
      f,
    );
    assert.deepEqual(
      parseAdminDetailParams(
        Object.fromEntries(new URL(adminDetailHref(12, f, 2), 'http://localhost').searchParams),
      ),
      { filters: f, stepPage: 2 },
    );
    pass(
      'Four-role policy, pre-query refusal and live session/account mismatch controls; bounded input and return parsing',
    );
    const before = await inspect(staffReadOnlyState);
    const baseline = await inspect(async (db) => ({
      tasks: (
        await db.query(`SELECT a.*,a.task_created_date::text cd,a.execution_date::text ed,a.deadline::text dl,m.case_number_ar,m.subject,m.client_id,c.name_ar client_name,p.name_ar person_name,p.is_active person_active,ct.label_ar court,d.label_ar destination,
      ar_normalise(a.required_work) nr,ar_normalise(a.result) nresult,ar_normalise(a.last_followup) nf,ar_normalise(a.legacy_assignee_raw) na,ar_normalise(p.name_ar) np,m.case_number_ar_normalised nc,m.subject_normalised ns,c.name_ar_normalised nclient,c.full_name_normalised nfull,ar_normalise(c.name_en) neng
      FROM admin_tasks a LEFT JOIN matters m ON m.id=a.matter_id LEFT JOIN clients c ON c.id=m.client_id LEFT JOIN people p ON p.id=a.assigned_to_person_id LEFT JOIN lookup_court ct ON ct.id=a.court_id LEFT JOIN lookup_matter_destination d ON d.id=a.destination_id ORDER BY a.task_created_date DESC NULLS LAST,a.id DESC`)
      ).rows,
      steps: (
        await db.query(
          `SELECT s.*,s.action_date::text ad,p.name_ar person_name,p.is_active person_active FROM task_actions s LEFT JOIN people p ON p.id=s.performed_by_person_id ORDER BY s.task_id,s.source_ordinal NULLS LAST,s.id`,
        )
      ).rows,
      aliases: (
        await db.query(
          'SELECT person_id,ar_normalise(alias_ar) n FROM person_name_alias WHERE NOT is_retired',
        )
      ).rows,
    }));
    assert.equal(baseline.tasks.length, 3694);
    assert.equal(baseline.steps.length, 3483);
    assert.equal(baseline.steps.filter((s) => s.task_id === null).length, 0);
    const collect = async (params: Record<string, string> = {}, session = viewer) => {
      const first = await readAdminWorks(session, params, runtime),
        rows = [...first.rows];
      for (let page = 2; page <= first.pages; page++) {
        const next = await readAdminWorks(session, { ...params, page: String(page) }, runtime);
        assert.equal(next.total, first.total);
        rows.push(...next.rows);
      }
      assert.equal(rows.length, first.total);
      assert.equal(new Set(rows.map((r) => r.id)).size, first.total);
      return rows;
    };
    for (const session of sessions)
      assert.deepEqual(
        (await collect({}, session)).map((r) => r.id),
        baseline.tasks.map((r) => r.id),
      );
    assert.equal((await readAdminWorks(viewer, { page: '2147483647' }, runtime)).filters.page, 148);
    let stepTotal = 0,
      detailTotal = 0;
    for (const row of baseline.tasks) {
      const actual = await readAdminWork(viewer, String(row.id), '1', runtime);
      assert.ok(actual);
      detailTotal++;
      for (const [key, column] of Object.entries({
        legacyId: 'legacy_id',
        requiredWork: 'required_work',
        matterId: 'matter_id',
        caseNumber: 'case_number_ar',
        subject: 'subject',
        clientId: 'client_id',
        clientName: 'client_name',
        personId: 'assigned_to_person_id',
        personName: 'person_name',
        personActive: 'person_active',
        assigneeRaw: 'legacy_assignee_raw',
        taskCreatedDate: 'cd',
        executionDate: 'ed',
        result: 'result',
        previousDecision: 'previous_decision',
        lastFollowup: 'last_followup',
        deadline: 'dl',
        court: 'court',
        courtRaw: 'legacy_court_raw',
        circuit: 'circuit',
        destination: 'destination',
        destinationRaw: 'legacy_destination_raw',
        status: 'status',
        alert: 'alert',
      }))
        assert.equal(actual[key as keyof typeof actual], row[column], key);
      const steps = [...actual.steps];
      for (let page = 2; page <= actual.stepPages; page++)
        steps.push(...(await readAdminWork(viewer, String(row.id), String(page), runtime))!.steps);
      const expected = baseline.steps
        .filter((s) => s.task_id === row.id)
        .map((s) => ({
          id: s.id,
          legacyId: s.legacy_id,
          sourceOrdinal: s.source_ordinal,
          actionDate: s.ad,
          personId: s.performed_by_person_id,
          personName: s.person_name,
          personActive: s.person_active,
          performerRaw: s.legacy_performed_by_raw,
          result: s.result,
          report: s.report,
        }));
      assert.deepEqual(steps, expected);
      assert.equal(actual.stepCount, expected.length);
      stepTotal += steps.length;
      assert.ok(!JSON.stringify(actual).includes('nextAppointment'));
    }
    pass(
      'Every task detail exact; all four roles traverse 148 pages; every linked step and source order exact',
      { tasks: detailTotal, steps: stepTotal, idsDigest: digest(baseline.tasks.map((r) => r.id)) },
    );
    for (const q of [
      'احمد',
      'أحمد',
      'أَحْمَد',
      '١٤٠',
      '140J',
      '140ق',
      'JTI',
      '%',
      '_',
      '\\',
      '__NO_TASK__',
    ]) {
      const normalized = await inspect(
        async (db) => (await db.query('SELECT ar_normalise($1) n', [q])).rows[0].n,
      );
      const expected = baseline.tasks.filter(
        (a) =>
          ['nr', 'nresult', 'nf', 'na', 'np', 'nc', 'ns', 'nclient', 'nfull', 'neng'].some((k) =>
            a[k]?.includes(normalized),
          ) ||
          baseline.aliases.some(
            (n) => n.person_id === a.assigned_to_person_id && n.n?.includes(normalized),
          ) ||
          String(a.id) === normalized ||
          (a.legacy_id !== null && String(a.legacy_id) === normalized),
      );
      assert.deepEqual(
        (await collect({ q })).map((r) => r.id),
        expected.map((r) => r.id),
      );
    }
    const first = await readAdminWorks(viewer, {}, runtime);
    for (const key of ['matter', 'client', 'person', 'status'] as const)
      for (const value of [
        'missing',
        ...first.options
          .filter((o) => o.kind === key)
          .slice(0, 4)
          .map((o) => o.value),
      ]) {
        const column =
          key === 'matter'
            ? 'matter_id'
            : key === 'client'
              ? 'client_id'
              : key === 'person'
                ? 'assigned_to_person_id'
                : 'status';
        const expected = baseline.tasks.filter((r) =>
          value === 'missing'
            ? r[column] === null
            : key === 'status'
              ? r[column] === value.slice(6)
              : String(r[column]) === value,
        );
        assert.deepEqual(
          (await collect({ [key]: value })).map((r) => r.id),
          expected.map((r) => r.id),
        );
      }
    const target = baseline.tasks.find((a) => a.assigned_to_person_id && a.status && a.client_id)!;
    const intersection = {
      matter: String(target.matter_id),
      client: String(target.client_id),
      person: String(target.assigned_to_person_id),
      status: 'value:' + target.status,
    };
    assert.deepEqual(
      (await collect(intersection)).map((r) => r.id),
      baseline.tasks
        .filter(
          (a) =>
            a.matter_id === target.matter_id &&
            a.client_id === target.client_id &&
            a.assigned_to_person_id === target.assigned_to_person_id &&
            a.status === target.status,
        )
        .map((r) => r.id),
    );
    await assert.rejects(
      readAdminWorks(viewer, { person: '2147483647' }, runtime),
      AdminFilterError,
    );
    assert.equal(await readAdminWork(viewer, '2147483647', '1', runtime), null);
    assert.deepEqual(await inspect(staffReadOnlyState), before);
    pass(
      'Independent search/filter/intersection oracle, NULL status, unknown values, no business/audit/sequence/catalog read effects',
    );
    const plans = await inspect(async (db) => {
      const results = [];
      for (const params of [{}, { q: 'احمد' }, { person: 'missing' }, intersection])
        for (const [kind, sql] of [
          ['rows', adminRowsQuery(parseAdminFilters(params), 1)],
          ['count', adminCountQuery(parseAdminFilters(params))],
        ] as const)
          results.push({
            kind,
            params,
            plan: (await db.query('EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) ' + sql.text, sql.values))
              .rows[0]['QUERY PLAN'],
          });
      for (const [kind, sql] of [
        ['detail', adminDetailQuery(target.id)],
        ['steps', adminStepsQuery(target.id, 1)],
      ] as const)
        results.push({
          kind,
          plan: (await db.query('EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) ' + sql.text, sql.values))
            .rows[0]['QUERY PLAN'],
        });
      return results;
    });
    writeFileSync(join(output, 'query-plans.json'), JSON.stringify(plans, null, 2));
    const many = baseline.tasks
      .map((a) => ({ id: a.id, n: baseline.steps.filter((s) => s.task_id === a.id).length }))
      .sort((a, b) => b.n - a.n)[0]!;
    const cases = {
      manyId: many.id,
      manyCount: many.n,
      emptyId: baseline.tasks.find((a) => !baseline.steps.some((s) => s.task_id === a.id))!.id,
      multilineId: baseline.tasks.find((a) => /[\r\n]/u.test(a.last_followup ?? ''))!.id,
      parentMatter: target.matter_id,
      parentClient: target.client_id,
      detailId: target.id,
    };
    const original = await collect({ matter: String(target.matter_id) });
    for (const [client, matter] of [
      [true, false],
      [true, true],
      [false, true],
      [false, false],
    ] as const) {
      await setMatterClientArchive(fixture, target.client_id, client);
      await setHearingParentArchive(fixture, target.matter_id, matter);
      for (const session of sessions) {
        const rows = await collect({ matter: String(target.matter_id) }, session);
        assert.deepEqual(
          rows.map((r) => r.id),
          original.map((r) => r.id),
        );
        assert.ok(rows.every((r) => r.clientArchived === client && r.matterArchived === matter));
        const detail = await readAdminWork(session, String(target.id), '1', runtime);
        assert.equal(detail!.requiredWork, target.required_work);
      }
    }
    pass(
      'All four roles retain records through independent archived-parent states; fresh query plans',
      { manySteps: many.n, fixtureOnlyParentTransitions: true },
    );
    writeFileSync(join(output, 'cases.json'), JSON.stringify(cases, null, 2));
    return cases;
  } finally {
    await runtime.$disconnect();
  }
}

async function main() {
  const output = process.env.ADMIN_WORK_EVIDENCE_DIR;
  assert.ok(output && resolve(output) !== process.cwd());
  mkdirSync(output, { recursive: true });
  const sourceRead = <T>(work: Parameters<typeof withApprovedMigrationClient<T>>[0]) =>
    withApprovedMigrationClient(work, {
      clientConfig: { options: '-c default_transaction_read_only=on' },
    });
  const source = await sourceRead(staffReadOnlyState);
  writeFileSync(join(output, 'actual-before.json'), JSON.stringify(source, null, 2));
  const paths = spawnSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], {
    encoding: 'utf8',
    windowsHide: true,
  });
  assert.equal(paths.status, 0);
  writeFileSync(
    join(output, 'executed-source.json'),
    JSON.stringify(
      [...new Set(paths.stdout.split('\0').filter(Boolean))].sort().map((path) => ({
        path,
        sha256: createHash('sha256').update(readFileSync(path)).digest('hex'),
      })),
      null,
      2,
    ),
  );
  let fixtureRunnerCompleted = false;
  try {
    await withIsolatedPostgres(async (fixture) => {
      writeFileSync(
        join(output, 'isolation.json'),
        JSON.stringify(
          {
            container: fixture.container,
            cluster: fixture.clusterId,
            sourceCluster: fixture.sourceClusterId,
            port: new URL(fixture.runtimeUrl).port,
            image: fixture.imageId,
          },
          null,
          2,
        ),
      );
      await sourceRead(async (db) => {
        await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
        try {
          const snapshot = (await db.query('SELECT pg_export_snapshot() id')).rows[0].id;
          await fixture.restoreProject(snapshot);
        } finally {
          await db.query('ROLLBACK');
        }
      });
      await withApprovedMigrationClient(
        async (db) => {
          await assertIsolatedTestCluster(db, new URL(fixture.migrationUrl), fixture.environment);
          assert.deepEqual((await staffReadOnlyState(db)).tables, source.tables);
        },
        {
          databaseUrl: fixture.migrationUrl,
          clientConfig: { options: '-c default_transaction_read_only=on' },
        },
      );
      // Check the restored historical checkpoint before adding deliberately native
      // edge rows: those rows are outside its frozen migration-actor population.
      const checkEnvironment: NodeJS.ProcessEnv = {
        ...fixture.environment,
        PGOPTIONS: '-c default_transaction_read_only=on',
      };
      for (const key of ['DATABASE_URL', 'MIGRATION_DATABASE_URL'] as const) {
        const url = new URL(checkEnvironment[key]!);
        url.searchParams.set('options', '-c default_transaction_read_only=on');
        checkEnvironment[key] = url.toString();
      }
      const invariantResult = spawnSync(
        process.execPath,
        [
          'node_modules/tsx/dist/cli.mjs',
          'scripts/check-db.ts',
          '--profile=historical-full-state-upgrade',
        ],
        { env: checkEnvironment, encoding: 'utf8', windowsHide: true, maxBuffer: 32000000 },
      );
      writeFileSync(
        join(output, 'invariants67.log'),
        (invariantResult.stdout + invariantResult.stderr).replace(
          /postgres(?:ql)?:\/\/[^\s"']+/gu,
          '[redacted]',
        ),
      );
      assert.equal(invariantResult.status, 0, 'invariants67 failed');
      console.log('PASS invariants67 on unchanged restored source, forced read-only');
      if (process.argv.includes('--invariants-only')) return;
      let cases;
      if (process.argv.includes('--browser-only')) {
        const prior = process.env.ADMIN_WORK_SERVICE_EVIDENCE;
        assert.ok(prior, 'prior full-volume evidence required');
        const identities = JSON.parse(
          readFileSync(join(prior, 'executed-source.json'), 'utf8'),
        ) as {
          path: string;
          sha256: string;
        }[];
        for (const file of identities.filter(
          (f) => f.path.startsWith('src/lib/') || f.path.startsWith('src/types/'),
        )) {
          assert.equal(
            createHash('sha256').update(readFileSync(file.path)).digest('hex'),
            file.sha256,
            'Read dependency changed: ' + file.path,
          );
        }
        const priorState = JSON.parse(readFileSync(join(prior, 'actual-before.json'), 'utf8'));
        for (const table of source.tables.filter((t) =>
          [
            'admin_tasks',
            'task_actions',
            'matters',
            'clients',
            'people',
            'person_name_alias',
          ].includes(t.table),
        )) {
          assert.deepEqual(
            table,
            priorState.tables.find(
              (t: { schema: string; table: string }) =>
                t.schema === table.schema && t.table === table.table,
            ),
          );
        }
        const results = JSON.parse(readFileSync(join(prior, 'service-results.json'), 'utf8'));
        assert.equal(results.length, 4);
        const runtime = createDatabaseClient(fixture.runtimeUrl);
        try {
          await prepareHearingLifecycleActors(fixture, runtime);
        } finally {
          await runtime.$disconnect();
        }
        cases = JSON.parse(readFileSync(join(prior, 'cases.json'), 'utf8')) as Awaited<
          ReturnType<typeof prove>
        >;
        writeFileSync(
          join(output, 'service-reuse.json'),
          JSON.stringify(
            {
              prior,
              exactReadDependencies: true,
              exactSourceBusinessTables: true,
              resultsSha256: createHash('sha256')
                .update(readFileSync(join(prior, 'service-results.json')))
                .digest('hex'),
            },
            null,
            2,
          ),
        );
        console.log('PASS reuse exact read dependencies and complete full-volume service results');
      } else cases = await prove(fixture, output);
      const edgeRuntime = createDatabaseClient(fixture.runtimeUrl);
      let edgeId: number;
      try {
        edgeId = await proveAdminWorkEdges(fixture, output, edgeRuntime);
      } finally {
        await edgeRuntime.$disconnect();
      }
      writeFileSync(
        join(output, 'browser-cases.json'),
        JSON.stringify({ ...cases, edgeId }, null, 2),
      );
      if (process.argv.includes('--browser')) {
        const { proveHearingBrowser } = await import('./test-hearing-browser.mjs');
        const { adminWorkBrowserProof } = await import('./lib/admin-work-browser-proof.mjs');
        await proveHearingBrowser(
          fixture,
          output,
          (
            context: Record<
              | 'page'
              | 'context'
              | 'base'
              | 'accounts'
              | 'login'
              | 'goto'
              | 'audit'
              | 'screenshot'
              | 'evidence'
              | 'inspect'
              | 'runtime',
              unknown
            >,
          ) => adminWorkBrowserProof({ ...context, cases: { ...cases, edgeId } }),
          { preserveAccounts: true, boundedDependencyCheck: true, skipGenerate: true },
        );
      }
      for (const [name, script, args] of [
        ['permissions', 'scripts/test-permissions.ts', ['--restored-fixture']],
      ] as const) {
        const result = spawnSync(
          process.execPath,
          ['node_modules/tsx/dist/cli.mjs', script, ...args],
          {
            env: { ...fixture.environment },
            encoding: 'utf8',
            windowsHide: true,
            maxBuffer: 32000000,
          },
        );
        writeFileSync(
          join(output, name + '.log'),
          (result.stdout + result.stderr).replace(/postgres(?:ql)?:\/\/[^\s"']+/gu, '[redacted]'),
        );
        assert.equal(result.status, 0, name + ' failed');
        console.log('PASS ' + name);
      }
    });
    fixtureRunnerCompleted = true;
  } finally {
    const after = await sourceRead(staffReadOnlyState);
    writeFileSync(join(output, 'actual-after.json'), JSON.stringify(after, null, 2));
    assert.deepEqual(after, source);
    writeFileSync(
      join(output, 'cleanup.json'),
      JSON.stringify({ fixtureRunnerCompleted, actualUnchanged: true }, null, 2),
    );
  }
}
void main().catch((error) => {
  console.error(
    (error instanceof Error ? (error.stack ?? error.message) : String(error)).replace(
      /postgres(?:ql)?:\/\/[^\s"']+/gu,
      '[redacted]',
    ),
  );
  process.exitCode = 1;
});
