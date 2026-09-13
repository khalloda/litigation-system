import type { Session } from 'next-auth';
import 'dotenv/config';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { Prisma, type PrismaClient } from '../src/generated/prisma/client';
import { createDatabaseClient } from '../src/lib/db';
import { AuthorizationError } from '../src/lib/auth/authorization-core';
import {
  readHearings,
  readHearing,
  parseHearingFilters,
  hearingListHref,
  hearingReturnHref,
  HearingFilterError,
  hearingRowsQuery,
  hearingCountQuery,
  hearingDetailQuery,
} from '../src/lib/hearing-query';
import {
  withIsolatedPostgres,
  assertIsolatedTestCluster,
  type IsolatedPostgres,
} from './lib/isolated-postgres-fixture';
import { withApprovedMigrationClient } from './lib/migration-principal';
import { staffReadOnlyState } from './lib/staff-read-only-state';
import { clientLogoFixtureState } from './lib/client-logo-fixture-state';
import { migrateFixtureThroughCheckpoint } from './lib/fixture-migration-checkpoint';
import { initialiseActors } from './test-client-contacts';
import { lifecycleSessions } from './lib/matter-lifecycle-proof';
import { setMatterClientArchive } from './test-matter-read-only';
import { mutateMatterLifecycle, readMatterLifecycle } from '../src/lib/matter-lifecycle';
import { createMaintenanceAuditMetadata } from '../src/lib/audit-metadata';

const digest = (x: unknown) => createHash('sha256').update(JSON.stringify(x)).digest('hex');
export async function setHearingParentArchive(
  fixture: IsolatedPostgres,
  id: number,
  archived: boolean,
) {
  await withApprovedMigrationClient(
    (db) => assertIsolatedTestCluster(db, new URL(fixture.migrationUrl), fixture.environment),
    { databaseUrl: fixture.migrationUrl },
  );
  const runtime = createDatabaseClient(fixture.runtimeUrl);
  try {
    const admin = (await lifecycleSessions(runtime)).find((s) => s.user.role === 'Administrator')!;
    const action = archived ? 'archive' : 'restore';
    const state = await readMatterLifecycle(admin, action, id, runtime);
    await mutateMatterLifecycle(
      admin,
      action,
      {
        id,
        confirmation: id,
        version: state.version,
        counts: state.counts,
        action,
        submission: randomUUID(),
      },
      { database: runtime, auditMetadata: createMaintenanceAuditMetadata() },
    );
  } finally {
    await runtime.$disconnect();
  }
}
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
    const sessions = await lifecycleSessions(runtime),
      viewer = sessions.find((s) => s.user.role === 'Lawyer')!;
    let calls = 0;
    const never = {
      $transaction() {
        calls++;
        throw new Error('unexpected protected work');
      },
    } as unknown as PrismaClient;
    for (const session of [
      null,
      { ...viewer, expires: new Date(0).toISOString() },
      { ...viewer, user: { ...viewer.user, role: 'unknown' } },
      { ...viewer, user: { ...viewer.user, mustChangePassword: true } },
    ]) {
      await assert.rejects(readHearings(session as Session | null, {}, never), AuthorizationError);
      await assert.rejects(readHearing(session as Session | null, '1', never), AuthorizationError);
    }
    assert.equal(calls, 0);
    for (const params of [
      { q: ['a', 'b'] },
      { q: 'x'.repeat(161) },
      { q: '\0' },
      { page: '0' },
      { page: '2147483648' },
      { matter: '01' },
      { attendee: '-1' },
      { from: '2026-02-30' },
      { to: '0000-01-01' },
      { from: '2026-01-02', to: '2026-01-01' },
      { dateField: 'unknown' },
      { unknown: '1' },
      { fromMatter: '//evil' },
      { court: ['1', '2'] },
    ])
      assert.throws(() => parseHearingFilters(params), HearingFilterError);
    for (const url of [
      '//evil',
      'https://example.invalid',
      '/hearings/1/evil',
      '/hearings/2147483648',
      '/hearings?q=a&q=b',
      '/hearings?unknown=1',
      '/hearings#x',
    ])
      assert.throws(() => hearingReturnHref(url));
    for (const id of ['0', '01', '-1', '2147483648', 'new'])
      assert.equal(await readHearing(viewer, id, never), null);
    const nav = parseHearingFilters({
      q: 'أحمد',
      page: '2',
      dateField: 'next',
      from: '2020-01-01',
      fromMatter: '/matters/1?archive=all&page=2',
    });
    assert.equal(hearingReturnHref(hearingListHref(nav)), hearingListHref(nav));
    for (const session of [
      { ...viewer, user: { ...viewer.user, sessionVersion: viewer.user.sessionVersion + 1 } },
      { ...viewer, user: { ...viewer.user, role: 'Administrator' } },
      { ...viewer, user: { ...viewer.user, id: '2147483647' } },
    ]) {
      await assert.rejects(readHearings(session as Session, {}, runtime), AuthorizationError);
      await assert.rejects(readHearing(session as Session, '1', runtime), AuthorizationError);
    }
    pass(
      'Authorization before protected work; database session revalidation and bounded input/return parsing',
    );
    const before = await inspect(staffReadOnlyState);
    const baseline = await inspect(async (db) => ({
      rows: (
        await db.query(`SELECT h.*,h.hearing_date::text hd,h.next_hearing_date::text nd,m.case_number_ar,m.subject,m.client_id,c.name_ar client_name,ct.label_ar court,a.label_ar action,ds.label_ar destination,
        ar_normalise(h.decision) ndecision,ar_normalise(h.notes) nnotes,ar_normalise(h.circuit) ncircuit,m.case_number_ar_normalised ncase,m.subject_normalised nsubject,c.name_ar_normalised nclient,c.full_name_normalised nfull,ar_normalise(c.name_en) neng
        FROM hearings h LEFT JOIN matters m ON m.id=h.matter_id LEFT JOIN clients c ON c.id=m.client_id LEFT JOIN lookup_court ct ON ct.id=h.court_id LEFT JOIN lookup_hearing_action a ON a.id=h.action_id LEFT JOIN lookup_matter_destination ds ON ds.id=h.destination_id ORDER BY h.hearing_date DESC NULLS LAST,h.id DESC`)
      ).rows,
      attendees: (
        await db.query(
          'SELECT ha.id,ha.hearing_id,ha.person_id AS "personId",ha.ordinal,p.name_ar AS name,p.is_active AS active FROM hearing_attendees ha LEFT JOIN people p ON p.id=ha.person_id ORDER BY ha.ordinal NULLS LAST,ha.id',
        )
      ).rows,
      released: (
        await db.query(
          'SELECT hearing_id AS target_id FROM _migration.high_impact_resolution WHERE hearing_id IS NOT NULL ORDER BY hearing_id',
        )
      ).rows,
    }));
    assert.equal(baseline.rows.length, 13382);
    assert.equal(baseline.attendees.length, 9113);
    const collect = async (params: Record<string, string> = {}, session = viewer) => {
      const first = await readHearings(session, params, runtime),
        rows = [...first.rows];
      for (let page = 2; page <= first.pages; page++) {
        const next = await readHearings(session, { ...params, page: String(page) }, runtime);
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
        baseline.rows.map((r) => r.id),
      );
    assert.equal(baseline.released.length, 327);
    assert.ok(baseline.released.every((r) => baseline.rows.some((h) => h.id === r.target_id)));
    const unassigned = baseline.rows.filter((h) => h.matter_id === null);
    assert.equal(unassigned.length, 4);
    assert.deepEqual(
      (await collect({ matter: 'missing' })).map((r) => r.id),
      unassigned.map((r) => r.id),
    );
    assert.equal(
      (await readHearings(viewer, { page: '2147483647' }, runtime)).filters.page,
      Math.ceil(13382 / 25),
    );
    pass(
      'Exact 13,382-ID traversal for all four roles, 327 releases, four unassigned and stable paging',
      {
        idsDigest: digest(baseline.rows.map((r) => r.id)),
        pages: 536,
        nullDates: baseline.rows.filter((r) => !r.hd).length,
      },
    );
    const representative = new Set<number>([
      ...unassigned.map((h) => h.id),
      ...baseline.rows
        .filter((h) =>
          /\r|\n/u.test((h.decision ?? '') + (h.case_number_ar ?? '') + (h.notes ?? '')),
        )
        .slice(0, 6)
        .map((h) => h.id),
      ...baseline.attendees
        .filter((a) => a.active === false)
        .slice(0, 6)
        .map((a) => a.hearing_id),
      ...baseline.rows
        .filter((h) => baseline.attendees.filter((a) => a.hearing_id === h.id).length > 1)
        .slice(0, 6)
        .map((h) => h.id),
      ...baseline.rows
        .filter((h) => !h.hd || !h.nd || !h.decision)
        .slice(0, 6)
        .map((h) => h.id),
    ]);
    for (const id of representative) {
      const expected = baseline.rows.find((h) => h.id === id)!,
        actual = await readHearing(viewer, String(id), runtime);
      assert.ok(actual);
      for (const [key, column] of Object.entries({
        legacyId: 'legacy_id',
        matterId: 'matter_id',
        caseNumber: 'case_number_ar',
        subject: 'subject',
        clientId: 'client_id',
        clientName: 'client_name',
        hearingDate: 'hd',
        nextHearingDate: 'nd',
        court: 'court',
        action: 'action',
        decision: 'decision',
        destination: 'destination',
        circuit: 'circuit',
        notes: 'notes',
        outcome: 'outcome',
      }))
        assert.equal(actual[key as keyof typeof actual], expected[column], key);
      assert.deepEqual(
        actual.attendees,
        baseline.attendees
          .filter((a) => a.hearing_id === id)
          .map((a) => ({
            id: a.id,
            personId: a.personId,
            ordinal: a.ordinal,
            name: a.name,
            active: a.active,
          })),
      );
      assert.ok(!JSON.stringify(actual).includes('legacy_source_payload'));
    }
    pass('Exact representative detail fields and ordered inactive/multiple attendees', {
      details: representative.size,
    });
    const queries = [
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
      '__NO_SUCH_HEARING__',
    ];
    for (const q of queries) {
      const n = await inspect(
        async (db) => (await db.query('SELECT ar_normalise($1) n', [q])).rows[0].n as string,
      );
      const expected = baseline.rows.filter(
        (h) =>
          ['ndecision', 'nnotes', 'ncircuit', 'ncase', 'nsubject', 'nclient', 'nfull', 'neng'].some(
            (key) => h[key]?.includes(n),
          ) ||
          String(h.id) === q ||
          String(h.legacy_id) === q,
      );
      assert.deepEqual(
        (await collect({ q })).map((r) => r.id),
        expected.map((r) => r.id),
      );
    }
    for (const key of ['matter', 'client', 'court', 'attendee'] as const) {
      const first = await readHearings(viewer, {}, runtime);
      for (const value of [
        'missing',
        ...first.options
          .filter((o) => o.kind === key)
          .slice(0, 5)
          .map((o) => o.value),
      ]) {
        const expected = baseline.rows.filter((h) =>
          key === 'attendee'
            ? value === 'missing'
              ? !baseline.attendees.some((a) => a.hearing_id === h.id)
              : baseline.attendees.some(
                  (a) => a.hearing_id === h.id && String(a.personId) === value,
                )
            : value === 'missing'
              ? h[key === 'matter' ? 'matter_id' : key === 'client' ? 'client_id' : 'court_id'] ===
                null
              : String(
                  h[key === 'matter' ? 'matter_id' : key === 'client' ? 'client_id' : 'court_id'],
                ) === value,
        );
        assert.deepEqual(
          (await collect({ [key]: value })).map((r) => r.id),
          expected.map((r) => r.id),
        );
      }
    }
    const target = baseline.rows.find(
      (h) =>
        h.client_id &&
        h.court_id &&
        h.hd &&
        h.nd &&
        baseline.attendees.some((a) => a.hearing_id === h.id),
    )!;
    for (const dateField of ['hearing', 'next']) {
      const column = dateField === 'hearing' ? 'hd' : 'nd',
        date = target[column];
      const params = {
        dateField,
        from: date,
        to: date,
        client: String(target.client_id),
        court: String(target.court_id),
        attendee: String(baseline.attendees.find((a) => a.hearing_id === target.id)!.personId),
      };
      const expected = baseline.rows.filter(
        (h) =>
          h[column] === date &&
          h.client_id === target.client_id &&
          h.court_id === target.court_id &&
          baseline.attendees.some(
            (a) => a.hearing_id === h.id && String(a.personId) === params.attendee,
          ),
      );
      assert.deepEqual(
        (await collect(params)).map((r) => r.id),
        expected.map((r) => r.id),
      );
    }
    await assert.rejects(
      readHearings(viewer, { matter: '2147483647' }, runtime),
      HearingFilterError,
    );
    assert.equal(await readHearing(viewer, '2147483647', runtime), null);
    assert.deepEqual(await inspect(staffReadOnlyState), before);
    pass(
      'Independent normalized search/filter/date oracle, distinct attendees, malformed/missing results and exact read preservation',
    );
    const plans = await inspect(async (db) => {
      const results = [];
      for (const params of [
        {},
        { q: 'احمد' },
        { matter: 'missing' },
        { client: String(target.client_id) },
        { attendee: String(baseline.attendees.find((a) => a.hearing_id === target.id)!.personId) },
        { dateField: 'next', from: '2020-01-01', to: '2025-12-31' },
      ])
        for (const [kind, sql] of [
          ['rows', hearingRowsQuery(parseHearingFilters(params), 1)],
          ['count', hearingCountQuery(parseHearingFilters(params))],
        ] as const)
          results.push({
            kind,
            params,
            plan: (await db.query('EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) ' + sql.text, sql.values))
              .rows[0]['QUERY PLAN'],
          });
      const sql = hearingDetailQuery(target.id);
      results.push({
        kind: 'detail',
        params: {},
        plan: (await db.query('EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) ' + sql.text, sql.values))
          .rows[0]['QUERY PLAN'],
      });
      return results;
    });
    writeFileSync(join(output, 'query-plans.json'), JSON.stringify(plans, null, 2));
    // Count actual calls through the transaction interface without replacing query execution.
    let queryCalls = 0;
    const counted = {
      $transaction: (work: (tx: Prisma.TransactionClient) => Promise<unknown>, options: object) =>
        runtime.$transaction(
          (tx) =>
            work(
              new Proxy(tx, {
                get(t, key) {
                  if (key === '$queryRaw')
                    return (...args: Parameters<typeof tx.$queryRaw>) => {
                      queryCalls++;
                      return tx.$queryRaw(...args);
                    };
                  return Reflect.get(t, key);
                },
              }),
            ),
          options,
        ),
    } as unknown as PrismaClient;
    await readHearings(viewer, {}, counted);
    assert.equal(queryCalls, 5);
    queryCalls = 0;
    await readHearing(viewer, String(target.id), counted);
    assert.equal(queryCalls, 4);
    pass(
      'Fresh real-volume query plans and fixed 5-list / 4-detail query calls including transaction read-only and session checks',
    );
    const parentCounts = new Map<number, number>();
    for (const h of baseline.rows)
      if (h.matter_id && h.client_id)
        parentCounts.set(h.matter_id, (parentCounts.get(h.matter_id) ?? 0) + 1);
    const parentId = [...parentCounts].sort((a, b) => b[1] - a[1])[0]![0];
    const parent = baseline.rows.find((h) => h.matter_id === parentId)!;
    const params = { matter: String(parent.matter_id), client: String(parent.client_id) },
      original = await collect(params),
      details = await Promise.all(original.map((h) => readHearing(viewer, String(h.id), runtime)));
    const clearFlags = (rows: unknown) =>
      JSON.parse(JSON.stringify(rows), (key, value) =>
        key === 'clientArchived' || key === 'matterArchived' ? false : value,
      );
    for (const [client, matter] of [
      [true, false],
      [true, true],
      [false, true],
      [false, false],
    ] as const) {
      await setMatterClientArchive(fixture, parent.client_id, client);
      await setHearingParentArchive(fixture, parent.matter_id, matter);
      for (const session of sessions) {
        const rows = await collect(params, session);
        assert.deepEqual(clearFlags(rows), clearFlags(original));
        assert.ok(rows.every((h) => h.clientArchived === client && h.matterArchived === matter));
        assert.deepEqual(
          clearFlags(
            await Promise.all(rows.map((h) => readHearing(session, String(h.id), runtime))),
          ),
          clearFlags(details),
        );
      }
    }
    pass(
      'All four roles retain exact hearing/attendee content through independent client/matter archive and restore',
      {
        matterId: parent.matter_id,
        clientId: parent.client_id,
        hearings: original.length,
        contentDigest: digest(details),
      },
    );
    const cases = {
      parentMatter: parent.matter_id,
      parentClient: parent.client_id,
      detailId: parent.id,
      unassignedId: unassigned[0]!.id,
      multilineId:
        [...representative].find((id) =>
          /\r|\n/u.test(baseline.rows.find((h) => h.id === id)!.decision ?? ''),
        ) ?? target.id,
    };
    writeFileSync(join(output, 'cases.json'), JSON.stringify(cases, null, 2));
    return cases;
  } finally {
    await runtime.$disconnect();
  }
}
async function main() {
  const output = process.env.HEARING_EVIDENCE_DIR;
  assert.ok(output && resolve(output) !== process.cwd());
  mkdirSync(output, { recursive: true });
  const inspectSource = <T>(work: Parameters<typeof withApprovedMigrationClient<T>>[0]) =>
    withApprovedMigrationClient(work, {
      clientConfig: { options: '-c default_transaction_read_only=on' },
    });
  const source = await inspectSource(async (db) => ({
    state: await staffReadOnlyState(db),
    portable: await clientLogoFixtureState(db),
  }));
  const external = JSON.parse(readFileSync(process.env.HEARING_SOURCE_BASELINE!, 'utf8'));
  assert.deepEqual(source.state.tables, external.tables);
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
    await fixture.restoreProject();
    await withApprovedMigrationClient(
      async (db) => {
        await assertIsolatedTestCluster(db, new URL(fixture.migrationUrl), fixture.environment);
        assert.deepEqual((await staffReadOnlyState(db)).tables, source.state.tables);
        assert.deepEqual(await clientLogoFixtureState(db), source.portable);
      },
      {
        databaseUrl: fixture.migrationUrl,
        clientConfig: { options: '-c default_transaction_read_only=on' },
      },
    );
    writeFileSync(
      join(output, 'restore-equivalence.json'),
      JSON.stringify(
        {
          allTables: true,
          portableCatalogAndSequences: true,
          sourceDigest: source.state.tableDigest,
          logCnt:
            'Portable restore may reset WAL reservations; strict source baseline retains log_cnt.',
        },
        null,
        2,
      ),
    );
    await migrateFixtureThroughCheckpoint(fixture.migrationUrl, 64, fixture.environment);
    const check = (name: string, script: string, args: string[] = []) => {
      const result = spawnSync(
        process.execPath,
        ['node_modules/tsx/dist/cli.mjs', script, ...args],
        {
          env: {
            ...fixture.environment,
            PRISMA_SCHEMA_ENGINE_BINARY: resolve(
              'node_modules/@prisma/engines/schema-engine-windows.exe',
            ),
          },
          encoding: 'utf8',
          windowsHide: true,
          maxBuffer: 32000000,
        },
      );
      writeFileSync(
        join(output, name + '.log'),
        (result.stdout + result.stderr).replace(/postgres(?:ql)?:\/\/[^\s"']+/gu, '[redacted]'),
      );
      assert.equal(result.status, 0, name + ' failed; see retained log');
      console.log('PASS ' + name);
    };
    await migrateFixtureThroughCheckpoint(fixture.migrationUrl, 65, fixture.environment);
    await initialiseActors(fixture.migrationUrl, fixture.runtimeUrl);
    let cases;
    if (process.argv.includes('--browser-only')) {
      const prior = process.env.HEARING_SERVICE_EVIDENCE;
      assert.ok(prior, 'prior full-volume evidence required');
      const identities = JSON.parse(readFileSync(join(prior, 'executed-source.json'), 'utf8')) as {
        path: string;
        sha256: string;
      }[];
      for (const file of identities.filter((f) => f.path.startsWith('src/'))) {
        assert.equal(
          createHash('sha256').update(readFileSync(file.path)).digest('hex'),
          file.sha256,
          'Application source changed since full-volume proof: ' + file.path,
        );
      }
      const proof = JSON.parse(readFileSync(join(prior, 'service-results.json'), 'utf8'));
      assert.equal(proof.length, 6);
      assert.equal(proof[1].details.pages, 536);
      cases = JSON.parse(readFileSync(join(prior, 'cases.json'), 'utf8'));
      for (const id of Object.values(cases)) assert.ok(Number.isInteger(id) && Number(id) > 0);
      writeFileSync(
        join(output, 'service-reuse.json'),
        JSON.stringify(
          {
            prior,
            sourceExact: true,
            resultsSha256: createHash('sha256')
              .update(readFileSync(join(prior, 'service-results.json')))
              .digest('hex'),
            cases,
          },
          null,
          2,
        ),
      );
      console.log(
        'PASS reuse exact-application full-volume proof; fresh browser and final gates follow',
      );
    } else cases = await prove(fixture, output);
    if (process.argv.includes('--browser')) {
      const { proveHearingBrowser } = await import('./test-hearing-browser.mjs');
      const { hearingBrowserProof } = await import('./lib/hearing-browser-proof.mjs');
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
        ) => hearingBrowserProof({ ...context, fixture, cases }),
      );
    }
    check('permissions', 'scripts/test-permissions.ts', ['--restored-fixture']);
    check('invariants-final', 'scripts/check-db.ts');
  });
  assert.deepEqual(await inspectSource(staffReadOnlyState), source.state);
  writeFileSync(
    join(output, 'cleanup.json'),
    JSON.stringify({ ownedClusterVolumeNetworkRemoved: true, sourceExact: true }, null, 2),
  );
}
if (process.argv[1]?.replaceAll('\\', '/').endsWith('/test-hearing-read-only.ts'))
  void main().catch((error) => {
    console.error(
      (error instanceof Error ? (error.stack ?? error.message) : 'Hearing proof failed').replace(
        /postgres(?:ql)?:\/\/[^\s"']+/gu,
        '[redacted]',
      ),
    );
    process.exitCode = 1;
  });
